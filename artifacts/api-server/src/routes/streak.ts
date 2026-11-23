// The daily streak (any activity): the app reports what a member did today in their own time
// zone (played, solved a puzzle, reviewed a game, did a lesson); the streak is how many days in a
// row up to today (or yesterday, if today isn't done yet).
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const KINDS = new Set(["play", "puzzle", "review", "lesson", "analysis"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The member's local date, trusted only within a day of the server's. */
function localDay(v: unknown): string {
  const utc = new Date();
  if (typeof v === "string" && DAY.test(v)) {
    const d = new Date(`${v}T12:00:00Z`);
    if (Math.abs(d.getTime() - utc.getTime()) < 40 * 3600_000) return v;
  }
  return utc.toISOString().slice(0, 10);
}

router.post("/me/activity", requireAuth, async (req: Request, res: Response) => {
  try {
    const kind = String(req.body?.kind ?? "");
    if (!KINDS.has(kind)) { res.status(400).json({ error: "Unknown activity" }); return; }
    const day = localDay(req.body?.day);
    await db.execute(sql`INSERT INTO user_activity_days (user_id, day, kinds) VALUES (${req.user!.id}, ${day}::date, ARRAY[${kind}]::text[])
      ON CONFLICT (user_id, day) DO UPDATE SET kinds = CASE WHEN ${kind} = ANY(user_activity_days.kinds) THEN user_activity_days.kinds ELSE array_append(user_activity_days.kinds, ${kind}) END`);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[streak] record failed"); res.status(500).json({ error: "Could not save" }); }
});

router.get("/me/streak", requireAuth, async (req: Request, res: Response) => {
  try {
    const today = localDay(req.query.day);
    const r = await db.execute(sql`SELECT to_char(day, 'YYYY-MM-DD') AS d FROM user_activity_days WHERE user_id = ${req.user!.id} AND day >= (${today}::date - 400) ORDER BY day DESC`);
    const days = new Set((r.rows as { d: string }[]).map((x) => x.d));
    const shift = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
    const doneToday = days.has(today);
    // Rest days: every 3 cases closed (puzzles from your own games) earns one; a missed day
    // in the middle of a streak uses one up instead of ending it.
    const casesClosed = Number(((await db.execute(sql`SELECT count(DISTINCT pa.puzzle_id)::int AS n FROM puzzle_attempts pa JOIN puzzles p ON p.id = pa.puzzle_id
      WHERE pa.user_id = ${req.user!.id} AND pa.solved AND p.source = 'game'`)).rows[0] as { n?: number } | undefined)?.n ?? 0);
    let restLeft = Math.floor(casesClosed / 3), restUsed = 0;
    let streak = 0;
    for (let d = doneToday ? today : shift(today, -1); ; d = shift(d, -1)) {
      if (days.has(d)) { streak++; continue; }
      // bridge one missed day if the day before it was active and a rest day is left
      if (restLeft > 0 && streak > 0 && days.has(shift(d, -1))) { restLeft--; restUsed++; continue; }
      break;
    }
    let best = 0, run = 0, prev = "";
    for (const d of [...days].sort()) { run = prev && shift(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    const week = Array.from({ length: 7 }, (_, i) => { const d = shift(today, i - 6); return { day: d, done: days.has(d) }; });
    res.json({ streak, best: Math.max(best, streak), doneToday, week, restDays: restLeft, restUsed, casesClosed });
  } catch (err) { logger.error({ err }, "[streak] read failed"); res.status(500).json({ error: "Could not load" }); }
});

export default router;
