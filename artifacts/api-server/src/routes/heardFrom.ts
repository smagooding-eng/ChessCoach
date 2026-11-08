// "Where did you find us?": asked once, inside a good moment (a win, a streak),
// never at signup. One answer per user; the admin traffic export counts them.
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { logger } from "../lib/logger";

const router: IRouter = Router();
export const HEARD_FROM = ["tiktok", "instagram", "youtube", "facebook", "reddit", "chatgpt", "google", "friend", "club", "other"] as const;

router.get("/me/heard-from", requireAuth, async (req: Request, res: Response) => {
  try {
    const r = await db.execute(sql`SELECT source FROM user_heard_from WHERE user_id = ${req.user!.id}`);
    const rows = (r as unknown as { rows: { source: string }[] }).rows ?? [];
    res.json({ answered: rows.length > 0, source: rows[0]?.source ?? null });
  } catch (err) { logger.error({ err }, "[heard-from] read failed"); res.json({ answered: false, source: null }); }
});

router.post("/me/heard-from", requireAuth, async (req: Request, res: Response) => {
  try {
    const source = String(req.body?.source ?? "").toLowerCase();
    if (!(HEARD_FROM as readonly string[]).includes(source)) { res.status(400).json({ error: "Unknown answer" }); return; }
    const detail = req.body?.detail ? String(req.body.detail).slice(0, 80) : null;
    await db.execute(sql`INSERT INTO user_heard_from (user_id, source, detail) VALUES (${req.user!.id}, ${source}, ${detail})
      ON CONFLICT (user_id) DO UPDATE SET source = EXCLUDED.source, detail = EXCLUDED.detail, created_at = now()`);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[heard-from] save failed"); res.status(500).json({ error: "Could not save" }); }
});

export default router;
