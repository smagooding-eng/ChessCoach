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

// ── Avatar Studio: the player's 3D avatar settings (a small JSON config, no images) ──
//   GET /me/avatar-config   { config: {...} | null, updatedAt }
//   PUT /me/avatar-config   { config }  -> the cleaned config that was stored
// Table user_avatar_configs, created on first use like user_avatars above.
const AVATAR_CONFIG_VERSION = 1;
const HAIR_STYLES = ["short", "long", "curly", "bald"];
const HEX = /^#[0-9a-f]{6}$/i;
const AVATAR_DEFAULTS = { skinTone: "#c98968", hairColor: "#29212a", hairStyle: "short", eyeColor: "#3b261b", beard: true, glasses: true, shirtColor: "#394b68" };
function cleanAvatarConfig(raw: unknown) {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);
  const flag = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    version: AVATAR_CONFIG_VERSION,
    skinTone: color(o.skinTone, AVATAR_DEFAULTS.skinTone),
    hairColor: color(o.hairColor, AVATAR_DEFAULTS.hairColor),
    hairStyle: HAIR_STYLES.includes(String(o.hairStyle)) ? String(o.hairStyle) : AVATAR_DEFAULTS.hairStyle,
    eyeColor: color(o.eyeColor, AVATAR_DEFAULTS.eyeColor),
    beard: flag(o.beard, AVATAR_DEFAULTS.beard),
    glasses: flag(o.glasses, AVATAR_DEFAULTS.glasses),
    shirtColor: color(o.shirtColor, AVATAR_DEFAULTS.shirtColor),
  };
}
let configReady: Promise<void> | null = null;
function ensureConfigTable(): Promise<void> {
  configReady ??= db.execute(sql`CREATE TABLE IF NOT EXISTS user_avatar_configs (
    user_id VARCHAR PRIMARY KEY,
    config JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`).then(() => undefined).catch((err) => { configReady = null; throw err; });
  return configReady;
}

router.get("/me/avatar-config", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureConfigTable();
    const r = await db.execute(sql`SELECT config, updated_at FROM user_avatar_configs WHERE user_id = ${req.user!.id}`);
    const row = (Array.isArray(r) ? r : r?.rows ?? [])[0] as { config: unknown; updated_at: string } | undefined;
    res.json({ config: row ? cleanAvatarConfig(row.config) : null, updatedAt: row?.updated_at ?? null });
  } catch (err) {
    logger.error({ err }, "[avatar-config] read failed");
    res.status(500).json({ error: "Could not load your avatar." });
  }
});

router.put("/me/avatar-config", requireAuth, async (req: Request, res: Response) => {
  const body = (req.body as { config?: unknown })?.config;
  if (!body || typeof body !== "object" || JSON.stringify(body).length > 4000) { res.status(400).json({ error: "That avatar couldn't be saved." }); return; }
  try {
    await ensureConfigTable();
    const config = cleanAvatarConfig(body);
    await db.execute(sql`INSERT INTO user_avatar_configs (user_id, config, updated_at) VALUES (${req.user!.id}, ${JSON.stringify(config)}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`);
    res.json({ config });
  } catch (err) {
    logger.error({ err }, "[avatar-config] save failed");
    res.status(500).json({ error: "Could not save your avatar. Please try again." });
  }
});

export default router;
