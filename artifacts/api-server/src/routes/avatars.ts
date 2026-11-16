import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { logger } from "../lib/logger";

// Profile pictures players upload themselves.
//   POST   /me/avatar          { dataUrl }  PNG/JPEG/WebP, resized in the browser
//   DELETE /me/avatar          back to the Chess.com / Google picture (or initials)
//   GET    /avatars/:userId    the image (public: opponents and friends see it)
// The picture's URL goes in users.profile_image_url, which friends, live games
// and the app header already read. Uploaded pictures are recognised by their
// "/api/avatars/" path, so they win over a Chess.com avatar.
const router: IRouter = Router();

const API_BASE = (process.env.RENDER_EXTERNAL_URL || process.env.API_PUBLIC_URL || "https://chesscoach-api-kbf8.onrender.com").replace(/\/$/, "");
const IMG_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_BYTES = 400_000;

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  ready ??= db.execute(sql`CREATE TABLE IF NOT EXISTS user_avatars (
    user_id VARCHAR PRIMARY KEY,
    mime VARCHAR NOT NULL,
    data TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`).then(() => undefined).catch((err) => { ready = null; throw err; });
  return ready;
}

export const isUploadedAvatar = (url: string | null | undefined) => !!url && url.includes("/api/avatars/");

router.post("/me/avatar", requireAuth, async (req: Request, res: Response) => {
  const dataUrl = String((req.body as { dataUrl?: string })?.dataUrl ?? "");
  const m = dataUrl.match(IMG_RE);
  if (!m) { res.status(400).json({ error: "Please choose a PNG, JPG or WebP picture." }); return; }
  if (m[2].length * 0.75 > MAX_BYTES) { res.status(400).json({ error: "That picture is too large." }); return; }
  try {
    await ensureTable();
    const userId = req.user!.id;
    await db.execute(sql`INSERT INTO user_avatars (user_id, mime, data, updated_at) VALUES (${userId}, ${m[1]}, ${m[2]}, now())
      ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()`);
    const url = `${API_BASE}/api/avatars/${encodeURIComponent(userId)}?v=${Date.now()}`;
    await db.update(usersTable).set({ profileImageUrl: url }).where(eq(usersTable.id, userId));
    (req.user as { profileImageUrl?: string | null }).profileImageUrl = url;
    res.json({ profileImageUrl: url });
  } catch (err) {
    logger.error({ err }, "[avatar] upload failed");
    res.status(500).json({ error: "Could not save your picture. Please try again." });
  }
});

router.delete("/me/avatar", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const userId = req.user!.id;
    await db.execute(sql`DELETE FROM user_avatars WHERE user_id = ${userId}`);
    await db.execute(sql`UPDATE users SET profile_image_url = NULL WHERE id = ${userId} AND profile_image_url LIKE '%/api/avatars/%'`);
    (req.user as { profileImageUrl?: string | null }).profileImageUrl = null;
    res.json({ profileImageUrl: null });
  } catch (err) {
    logger.error({ err }, "[avatar] remove failed");
    res.status(500).json({ error: "Could not remove your picture." });
  }
});

router.get("/avatars/:userId", async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const r: any = await db.execute(sql`SELECT mime, data FROM user_avatars WHERE user_id = ${String(req.params.userId)}`);
    const row = (Array.isArray(r) ? r : r?.rows ?? [])[0] as { mime: string; data: string } | undefined;
    if (!row) { res.status(404).end(); return; }
    res.set("Content-Type", row.mime);
    // The URL carries ?v=<upload time>, so a new picture gets a new URL.
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(Buffer.from(row.data, "base64"));
  } catch {
    res.status(500).end();
  }
});

// ── Avatar Studio: a player's 3D characters (small JSON settings each, no images or 3D files) ──
//   GET    /me/avatars              { characters: [{ id, name, config, isActive, updatedAt }] }
//   POST   /me/avatars              { name, config }   -> the new character (max 12 per player)
//   PUT    /me/avatars/:id          { name?, config? } -> the updated character
//   DELETE /me/avatars/:id
//   POST   /me/avatars/:id/active   makes it the one shown for this player
// The browser validates and fills in the settings when it reads them (avatarConfig.ts);
// here they're limited in size and kept as plain JSON. Table user_avatar_characters, created
// on first use. A config saved by the first version (user_avatar_configs) becomes the first character.
const MAX_CHARACTERS = 12;
const MAX_CONFIG_CHARS = 6000;
let charsReady: Promise<void> | null = null;
function ensureCharacters(): Promise<void> {
  charsReady ??= db.execute(sql`CREATE TABLE IF NOT EXISTS user_avatar_characters (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR NOT NULL,
    name VARCHAR(40) NOT NULL,
    config JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`).then(() => db.execute(sql`CREATE INDEX IF NOT EXISTS user_avatar_characters_user ON user_avatar_characters (user_id)`)).then(() => undefined)
    .catch((err) => { charsReady = null; throw err; });
  return charsReady;
}
const rowsOf = <T>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];
type CharRow = { id: number; name: string; config: unknown; is_active: boolean; updated_at: string };
const out = (r: CharRow) => ({ id: r.id, name: r.name, config: r.config, isActive: r.is_active, updatedAt: r.updated_at });
const cleanName = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "My character";
function cleanConfig(v: unknown): object | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const json = JSON.stringify(v);
  return json.length <= MAX_CONFIG_CHARS ? (JSON.parse(json) as object) : null;
}

router.get("/me/avatars", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureCharacters();
    const uid = req.user!.id;
    let rows = rowsOf<CharRow>(await db.execute(sql`SELECT id, name, config, is_active, updated_at FROM user_avatar_characters WHERE user_id = ${uid} ORDER BY created_at`));
    if (!rows.length) {
      // a config saved by the first version of the studio becomes the first character
      const old = rowsOf<{ config: unknown }>(await db.execute(sql`SELECT config FROM user_avatar_configs WHERE user_id = ${uid}`).catch(() => []))[0];
      if (old) {
        await db.execute(sql`INSERT INTO user_avatar_characters (user_id, name, config, is_active) VALUES (${uid}, 'My character', ${JSON.stringify(old.config)}::jsonb, true)`);
        rows = rowsOf<CharRow>(await db.execute(sql`SELECT id, name, config, is_active, updated_at FROM user_avatar_characters WHERE user_id = ${uid} ORDER BY created_at`));
      }
    }
    res.json({ characters: rows.map(out) });
  } catch (err) {
    logger.error({ err }, "[avatars] list failed");
    res.status(500).json({ error: "Could not load your characters." });
  }
});

router.post("/me/avatars", requireAuth, async (req: Request, res: Response) => {
  const config = cleanConfig((req.body as { config?: unknown })?.config);
  if (!config) { res.status(400).json({ error: "That character couldn't be saved." }); return; }
  try {
    await ensureCharacters();
    const uid = req.user!.id;
    const count = Number(rowsOf<{ n: string }>(await db.execute(sql`SELECT count(*)::int AS n FROM user_avatar_characters WHERE user_id = ${uid}`))[0]?.n ?? 0);
    if (count >= MAX_CHARACTERS) { res.status(400).json({ error: `You can keep up to ${MAX_CHARACTERS} characters. Delete one to make room.` }); return; }
    const row = rowsOf<CharRow>(await db.execute(sql`INSERT INTO user_avatar_characters (user_id, name, config, is_active)
      VALUES (${uid}, ${cleanName((req.body as { name?: unknown })?.name)}, ${JSON.stringify(config)}::jsonb, ${count === 0})
      RETURNING id, name, config, is_active, updated_at`))[0];
    res.json({ character: out(row) });
  } catch (err) {
    logger.error({ err }, "[avatars] create failed");
    res.status(500).json({ error: "Could not save your character. Please try again." });
  }
});

router.put("/me/avatars/:id", requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = req.body as { name?: unknown; config?: unknown };
  const config = body?.config === undefined ? undefined : cleanConfig(body.config);
  if (!Number.isInteger(id) || config === null) { res.status(400).json({ error: "That character couldn't be saved." }); return; }
  try {
    await ensureCharacters();
    const row = rowsOf<CharRow>(await db.execute(sql`UPDATE user_avatar_characters SET
        name = COALESCE(${body?.name === undefined ? null : cleanName(body.name)}, name),
        config = COALESCE(${config === undefined ? null : JSON.stringify(config)}::jsonb, config),
        updated_at = now()
      WHERE id = ${id} AND user_id = ${req.user!.id} RETURNING id, name, config, is_active, updated_at`))[0];
    if (!row) { res.status(404).json({ error: "Character not found." }); return; }
    res.json({ character: out(row) });
  } catch (err) {
    logger.error({ err }, "[avatars] update failed");
    res.status(500).json({ error: "Could not save your character. Please try again." });
  }
});

router.delete("/me/avatars/:id", requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Character not found." }); return; }
  try {
    await ensureCharacters();
    const uid = req.user!.id;
    const gone = rowsOf<{ is_active: boolean }>(await db.execute(sql`DELETE FROM user_avatar_characters WHERE id = ${id} AND user_id = ${uid} RETURNING is_active`))[0];
    if (gone?.is_active) await db.execute(sql`UPDATE user_avatar_characters SET is_active = true WHERE id = (SELECT id FROM user_avatar_characters WHERE user_id = ${uid} ORDER BY updated_at DESC LIMIT 1)`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[avatars] delete failed");
    res.status(500).json({ error: "Could not delete that character." });
  }
});

router.post("/me/avatars/:id/active", requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Character not found." }); return; }
  try {
    await ensureCharacters();
    const uid = req.user!.id;
    const hit = rowsOf<{ id: number }>(await db.execute(sql`SELECT id FROM user_avatar_characters WHERE id = ${id} AND user_id = ${uid}`))[0];
    if (!hit) { res.status(404).json({ error: "Character not found." }); return; }
    await db.execute(sql`UPDATE user_avatar_characters SET is_active = (id = ${id}) WHERE user_id = ${uid}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[avatars] set active failed");
    res.status(500).json({ error: "Could not switch characters." });
  }
});

export default router;
