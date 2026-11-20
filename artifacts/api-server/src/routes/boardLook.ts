// Each member's board look (board, colours, piece set), reported by their app so the admin
// "Online now" list can show a small picture of their board. One row per member.
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const KEY = /^[a-z0-9-]{1,40}$/i;
const HEX = /^#[0-9a-f]{3,8}$/i;

router.post("/me/board-look", requireAuth, async (req: Request, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const pick = (k: string, re: RegExp) => (typeof b[k] === "string" && re.test(b[k] as string) ? (b[k] as string) : undefined);
    const look = {
      boardTheme: pick("boardTheme", KEY), boardTexture: pick("boardTexture", KEY),
      pieceShape: pick("pieceShape", KEY), pieceStyle: pick("pieceStyle", KEY),
      light: pick("light", HEX), dark: pick("dark", HEX),
    };
    await db.execute(sql`INSERT INTO user_board_looks (user_id, look) VALUES (${req.user!.id}, ${JSON.stringify(look)}::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET look = EXCLUDED.look, updated_at = now()`);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[board-look] save failed"); res.status(500).json({ error: "Could not save" }); }
});

export default router;
