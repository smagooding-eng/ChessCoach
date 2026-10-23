import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// Real site-wide totals for public pages. Only totals of 1,000 or more are
// returned (smaller ones are left out rather than shown).
const router: IRouter = Router();
const MIN_SHOWN = 1000;
let cache: { at: number; metrics: { key: string; label: string; value: number }[] } | null = null;

function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }

router.get("/public/site-stats", async (_req: Request, res: Response) => {
  try {
    if (!cache || Date.now() - cache.at > 10 * 60_000) {
      const [r] = rowsOf<Record<string, string>>(await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM games) AS games_imported,
          (SELECT COUNT(*) FROM games WHERE review_data IS NOT NULL) AS games_reviewed,
          (SELECT COUNT(*) FROM games WHERE analyzed = true) AS games_analyzed,
          (SELECT COUNT(*) FROM puzzle_attempts WHERE solved) AS puzzles_solved,
          (SELECT COUNT(*) FROM live_games) + (SELECT COUNT(*) FROM correspondence_games WHERE status <> 'active') + (SELECT COUNT(*) FROM bot_results) AS games_played,
          (SELECT COUNT(*) FROM users) AS players`));
      const all = [
        // The same two totals Admin shows: games imported, and games analyzed.
        { key: "games_imported", label: "games imported", value: Number(r?.games_imported ?? 0) },
        { key: "games_analyzed", label: "games analyzed", value: Number(r?.games_analyzed ?? 0) },
        { key: "games_reviewed", label: "games reviewed", value: Number(r?.games_reviewed ?? 0) },
        { key: "puzzles_solved", label: "puzzles solved", value: Number(r?.puzzles_solved ?? 0) },
        { key: "games_played", label: "games played on ChessScout", value: Number(r?.games_played ?? 0) },
        { key: "players", label: "players", value: Number(r?.players ?? 0) },
      ];
      cache = { at: Date.now(), metrics: all.filter((m) => m.value >= MIN_SHOWN) };
    }
    res.set("Cache-Control", "public, max-age=600");
    res.json({ metrics: cache.metrics });
  } catch (err) {
    logger.warn({ err }, "[public-stats] failed");
    res.json({ metrics: [] });
  }
});

export default router;
