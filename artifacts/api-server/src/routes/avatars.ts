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

export default router;
