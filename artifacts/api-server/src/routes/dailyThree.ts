// "Today's 3": three puzzles a day made from the member's own mistakes (their
// reviewed games), with a streak and one reminder a day for members who allowed
// notifications. When their games haven't produced three yet, the set is
// topped up with rated puzzles around their level (marked as such).
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
type Row = Record<string, unknown>;
/** A list of ids as one Postgres array value (a JS array in sql`` would become a list of values). */
const intArr = (xs: number[]) => sql`${`{${xs.filter((x) => Number.isInteger(x)).join(",")}}`}::int[]`;
const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? r : ((r as { rows?: Row[] })?.rows ?? [])) as Row[];

let ready: Promise<unknown> | null = null;
const ensure = () => (ready ??= (async () => {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS daily_three (
    user_id varchar NOT NULL, day date NOT NULL, puzzle_ids integer[] NOT NULL DEFAULT '{}',
    solved integer NOT NULL DEFAULT 0, done_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS puzzle_setup_fixed (puzzle_id INTEGER PRIMARY KEY, fixed_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS daily_three_reminders (user_id varchar NOT NULL, day date NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, day))`);
})().catch((e) => { ready = null; throw e; }));

/** The member's local date, trusted only within a day of the server's. */
function localDay(v: unknown): string {
  const now = new Date();
  if (typeof v === "string" && DAY.test(v)) {
    const d = new Date(`${v}T12:00:00Z`);
    if (Math.abs(d.getTime() - now.getTime()) < 40 * 3600_000) return v;
  }
  return now.toISOString().slice(0, 10);
}

/** Days in a row with the set finished, ending today (or yesterday if today's isn't done). */
async function streakOf(userId: string, today: string): Promise<number> {
  const r = rowsOf(await db.execute(sql`SELECT to_char(day, 'YYYY-MM-DD') AS d FROM daily_three WHERE user_id = ${userId} AND done_at IS NOT NULL AND day >= (${today}::date - 400)`));
  const days = new Set(r.map((x) => String(x.d)));
  const shift = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  let d = days.has(today) ? today : shift(today, -1), n = 0;
  while (days.has(d)) { n++; d = shift(d, -1); }
  return n;
}

/** Puzzles from the member's own games they haven't solved yet, newest games first. */
async function ownUnsolved(userId: string, limit: number, exclude: number[]): Promise<Row[]> {
  return rowsOf(await db.execute(sql`
    SELECT p.id, p.fen, p.moves, p.rating, p.themes, p.game_id,
      EXISTS (SELECT 1 FROM puzzle_setup_fixed f WHERE f.puzzle_id = p.id) AS setup,
      CASE WHEN lower(g.white_username) = lower(g.username) THEN g.black_username ELSE g.white_username END AS opponent
    FROM puzzles p JOIN games g ON g.id = p.game_id
    WHERE g.user_id = ${userId} AND p.source = 'game' AND NOT p.archived
      AND NOT EXISTS (SELECT 1 FROM puzzle_attempts a WHERE a.user_id = ${userId} AND a.puzzle_id = p.id AND a.solved)
      ${exclude.length ? sql`AND p.id <> ALL(${intArr(exclude)})` : sql``}
    ORDER BY g.played_at DESC NULLS LAST, p.id
    LIMIT ${limit}`));
}

async function byIds(ids: number[]): Promise<Row[]> {
  if (!ids.length) return [];
  const rows = rowsOf(await db.execute(sql`
    SELECT p.id, p.fen, p.moves, p.rating, p.themes, p.game_id, p.source,
      EXISTS (SELECT 1 FROM puzzle_setup_fixed f WHERE f.puzzle_id = p.id) AS setup,
      CASE WHEN lower(g.white_username) = lower(g.username) THEN g.black_username ELSE g.white_username END AS opponent
    FROM puzzles p LEFT JOIN games g ON g.id = p.game_id WHERE p.id = ANY(${intArr(ids)})`));
  const by = new Map(rows.map((r) => [Number(r.id), r]));
  return ids.map((id) => by.get(id)).filter((r): r is Row => !!r);
}

const shape = (r: Row) => ({
  id: Number(r.id), fen: String(r.fen), moves: String(r.moves).trim().split(/\s+/), rating: Number(r.rating ?? 1200),
  themes: String(r.themes ?? "").split(/[,\s]+/).filter(Boolean),
  // Lichess puzzles start with the opponent's move; game puzzles do once they've been reshaped.
  setup: r.source && r.source !== "game" ? true : !!r.setup,
  fromYourGame: !!r.game_id && (r.source ?? "game") === "game",
  gameId: r.game_id ? Number(r.game_id) : null,
  opponent: r.opponent ? String(r.opponent) : null,
});

// Today's set (made once per day and kept, so it doesn't change on reload).
router.get("/daily-three", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensure();
    const userId = req.user!.id;
    const day = localDay(req.query.day);
    const [have] = rowsOf(await db.execute(sql`SELECT puzzle_ids, solved, done_at FROM daily_three WHERE user_id = ${userId} AND day = ${day}::date`));
    let ids = (have?.puzzle_ids as number[] | undefined) ?? [];
    const own = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS n FROM puzzles p JOIN games g ON g.id = p.game_id WHERE g.user_id = ${userId} AND p.source = 'game' AND NOT p.archived`))[0];
    if (!have || ids.length < 3) {
      const mine = await ownUnsolved(userId, 3 - ids.length, ids);
      ids = [...ids, ...mine.map((r) => Number(r.id))];
      // Not enough from their games yet: rated puzzles near their level fill the set,
      // unless the client is about to make more from their games (needMore + ?fill=0).
      if (ids.length < 3 && req.query.fill !== "0") {
        const [u] = rowsOf(await db.execute(sql`SELECT COALESCE(MAX(GREATEST(white_rating, black_rating)) FILTER (WHERE white_rating IS NOT NULL), 1200) AS r FROM games WHERE user_id = ${userId}`));
        const lvl = Math.max(600, Math.min(2200, Number(u?.r ?? 1200) - 200));
        const extra = rowsOf(await db.execute(sql`
          SELECT p.id FROM puzzles p WHERE p.source <> 'game' AND NOT p.archived AND p.rating BETWEEN ${lvl - 250} AND ${lvl + 150}
            AND NOT EXISTS (SELECT 1 FROM puzzle_attempts a WHERE a.user_id = ${userId} AND a.puzzle_id = p.id)
            ${ids.length ? sql`AND p.id <> ALL(${intArr(ids)})` : sql``}
          ORDER BY md5(p.id::text || ${day}::text || ${userId}::text) LIMIT ${3 - ids.length}`));
        ids = [...ids, ...extra.map((r) => Number(r.id))];
      }
      if (ids.length >= 3 || req.query.fill !== "0") {
        await db.execute(sql`INSERT INTO daily_three (user_id, day, puzzle_ids) VALUES (${userId}, ${day}::date, ${intArr(ids)})
          ON CONFLICT (user_id, day) DO UPDATE SET puzzle_ids = EXCLUDED.puzzle_ids WHERE daily_three.done_at IS NULL`);
      }
    }
    const puzzles = (await byIds(ids)).map(shape);
    res.json({
      day, puzzles, doneToday: !!have?.done_at, solvedToday: Number(have?.solved ?? 0),
      streak: await streakOf(userId, day),
      ownPuzzles: Number(own?.n ?? 0),
      needMore: puzzles.filter((p) => p.fromYourGame).length < 3 && !have,
    });
  } catch (err) { logger.error({ err }, "[daily-three] load failed"); res.status(500).json({ error: "Couldn't load today's puzzles" }); }
});

// For Home: is today's set done, the streak, and whether there's anything to make it from.
router.get("/daily-three/status", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensure();
    const userId = req.user!.id;
    const day = localDay(req.query.day);
    const [d] = rowsOf(await db.execute(sql`SELECT done_at FROM daily_three WHERE user_id = ${userId} AND day = ${day}::date`));
    const [g] = rowsOf(await db.execute(sql`SELECT EXISTS (SELECT 1 FROM games WHERE user_id = ${userId}) AS has`));
    res.json({ doneToday: !!d?.done_at, streak: await streakOf(userId, day), hasGames: !!g?.has });
  } catch (err) { logger.error({ err }, "[daily-three] status failed"); res.status(500).json({ error: "Couldn't load" }); }
});

// One puzzle finished (solved first time without help, or not).
router.post("/daily-three/result", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.body?.puzzleId), solved = !!req.body?.solved;
    if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad puzzle" }); return; }
    await db.execute(sql`INSERT INTO puzzle_attempts (user_id, puzzle_id, solved) VALUES (${req.user!.id}, ${id}, ${solved})
      ON CONFLICT (user_id, puzzle_id) DO UPDATE SET solved = puzzle_attempts.solved OR EXCLUDED.solved, attempted_at = now()`);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[daily-three] result failed"); res.status(500).json({ error: "Couldn't save" }); }
});

// The set is finished for today.
router.post("/daily-three/done", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensure();
    const userId = req.user!.id;
    const day = localDay(req.body?.day);
    const solved = Math.max(0, Math.min(3, Number(req.body?.solved) || 0));
    await db.execute(sql`INSERT INTO daily_three (user_id, day, solved, done_at) VALUES (${userId}, ${day}::date, ${solved}, now())
      ON CONFLICT (user_id, day) DO UPDATE SET solved = GREATEST(daily_three.solved, EXCLUDED.solved), done_at = COALESCE(daily_three.done_at, now())`);
    await db.execute(sql`INSERT INTO user_activity_days (user_id, day, kinds) VALUES (${userId}, ${day}::date, ARRAY['puzzle']::text[])
      ON CONFLICT (user_id, day) DO UPDATE SET kinds = CASE WHEN 'puzzle' = ANY(user_activity_days.kinds) THEN user_activity_days.kinds ELSE array_append(user_activity_days.kinds, 'puzzle') END`).catch(() => {});
    res.json({ ok: true, streak: await streakOf(userId, day) });
  } catch (err) { logger.error({ err }, "[daily-three] done failed"); res.status(500).json({ error: "Couldn't save" }); }
});

/**
 * Once a day, a reminder to members who allowed notifications, have opened Today's 3
 * at least once, and haven't done today's set: sent in the hour of the day they're usually on ChessScout (from
 * their visits over the last 30 days; 6 PM US Eastern when there's nothing to go on).
 * Run every hour.
 */
export async function sendDailyThreeReminders(): Promise<void> {
  try {
    await ensure();
    const hourUtc = new Date().getUTCHours();
    const rows = rowsOf(await db.execute(sql`
      WITH subs AS (SELECT DISTINCT user_id FROM push_subscriptions),
      usual AS (
        SELECT user_id, mode() WITHIN GROUP (ORDER BY extract(hour FROM created_at AT TIME ZONE 'UTC')::int) AS h
        FROM page_views WHERE user_id IN (SELECT user_id FROM subs) AND created_at > now() - interval '30 days' GROUP BY user_id)
      SELECT s.user_id, COALESCE(u.h, 23) AS h FROM subs s LEFT JOIN usual u ON u.user_id = s.user_id
      WHERE COALESCE(u.h, 23) = ${hourUtc}
        AND EXISTS (SELECT 1 FROM games g WHERE g.user_id = s.user_id)
        AND EXISTS (SELECT 1 FROM daily_three d0 WHERE d0.user_id = s.user_id)
        AND NOT EXISTS (SELECT 1 FROM daily_three d WHERE d.user_id = s.user_id AND d.day >= (now() AT TIME ZONE 'UTC')::date - 1 AND d.done_at > now() - interval '20 hours')
        AND NOT EXISTS (SELECT 1 FROM daily_three_reminders r WHERE r.user_id = s.user_id AND r.sent_at > now() - interval '20 hours')`));
    if (!rows.length) return;
    const { notifyUser } = await import("../lib/notify");
    for (const r of rows) {
      const userId = String(r.user_id);
      const streak = await streakOf(userId, new Date().toISOString().slice(0, 10)).catch(() => 0);
      await db.execute(sql`INSERT INTO daily_three_reminders (user_id, day) VALUES (${userId}, (now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`);
      await notifyUser(userId, {
        kind: "daily_three",
        title: streak > 0 ? `Keep your ${streak}-day streak` : "Your 3 puzzles for today",
        body: "Three positions from your own games, where the better move was there to find. About 2 minutes.",
        url: "/daily-three",
      }).catch(() => {});
    }
    logger.info({ sent: rows.length }, "[daily-three] reminders sent");
  } catch (err) { logger.warn({ err }, "[daily-three] reminders failed"); }
}

export default router;
