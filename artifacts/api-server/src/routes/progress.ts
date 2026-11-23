// Reasons to come back, and progress you can see:
//  /daily-scout        one puzzle a day for everyone, from a real member game (no names)
//  /me/skill-map       five skills from your reviewed games, now vs when you started
//  /me/badges          badges for real growth only
//  /me/report-card     the week in one card (Sunday push: lib below + index.ts job)
//  /me/sprint          Scout Sprint best scores (yours and your friends')
//  /me/bot-month       wins against this month's scouted bot
import { Router, type IRouter, type Request, type Response } from "express";
import { db, gamesTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { computePhaseAccuracy } from "../lib/phaseAccuracy";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LAUNCH = Date.UTC(2026, 10, 23); // Daily Scout #1 = Nov 23, 2026
const todayOf = (v: unknown) => (typeof v === "string" && DAY.test(v) && Math.abs(Date.parse(`${v}T12:00:00Z`) - Date.now()) < 40 * 3600_000) ? v : new Date().toISOString().slice(0, 10);
const rows = <T,>(r: { rows: unknown[] }) => r.rows as T[];

async function primaryName(userId: string) {
  const [u] = await db.select({ c: usersTable.chesscomUsername, l: usersTable.lichessUsername }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return (u?.c || u?.l || "").toLowerCase();
}

// ── Daily Scout ──────────────────────────────────────────────────────────────
router.get("/daily-scout", async (req: Request, res: Response) => {
  try {
    const day = todayOf(req.query.day);
    const number = Math.floor((Date.parse(`${day}T00:00:00Z`) - LAUNCH) / 86400_000) + 1;
    // the same puzzle for everyone today: a verified puzzle from a member's game, middle ratings
    let pick = rows<{ id: number; rating: number; themes: string }>(await db.execute(sql`
      SELECT id, rating, themes FROM puzzles WHERE source = 'game' AND NOT archived AND rating BETWEEN 900 AND 1900
      ORDER BY md5(id::text || ${day}) LIMIT 1`))[0];
    if (!pick) pick = rows<{ id: number; rating: number; themes: string }>(await db.execute(sql`
      SELECT id, rating, themes FROM puzzles WHERE NOT archived AND rating BETWEEN 900 AND 1900 ORDER BY md5(id::text || ${day}) LIMIT 1`))[0];
    if (!pick) { res.status(404).json({ error: "No puzzle today" }); return; }
    const st = rows<{ played: number; solved: number; avg_ms: number | null }>(await db.execute(sql`
      SELECT count(*)::int AS played, count(*) FILTER (WHERE solved)::int AS solved, avg(ms) FILTER (WHERE solved)::int AS avg_ms FROM daily_scout_results WHERE day = ${day}::date`))[0];
    const mine = req.user ? rows<{ solved: boolean; ms: number; tries: number }>(await db.execute(sql`
      SELECT solved, ms, tries FROM daily_scout_results WHERE user_id = ${req.user.id} AND day = ${day}::date`))[0] ?? null : null;
    res.json({ day, number, puzzleId: pick.id, rating: pick.rating, fromMemberGame: true, stats: { played: st?.played ?? 0, solvedPct: st?.played ? Math.round((st.solved / st.played) * 100) : null, avgMs: st?.avg_ms ?? null }, mine });
  } catch (err) { logger.error({ err }, "[daily-scout] failed"); res.status(500).json({ error: "Failed" }); }
});

router.post("/daily-scout/result", requireAuth, async (req: Request, res: Response) => {
  try {
    const day = todayOf(req.body?.day);
    const solved = !!req.body?.solved;
    const ms = Math.max(0, Math.min(3600_000, Number(req.body?.ms) || 0));
    const tries = Math.max(1, Math.min(20, Number(req.body?.tries) || 1));
    // first result of the day counts (no improving it by replaying)
    await db.execute(sql`INSERT INTO daily_scout_results (user_id, day, solved, ms, tries) VALUES (${req.user!.id}, ${day}::date, ${solved}, ${ms}, ${tries}) ON CONFLICT (user_id, day) DO NOTHING`);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[daily-scout] save failed"); res.status(500).json({ error: "Failed" }); }
});

// ── Skill Map ────────────────────────────────────────────────────────────────
type G = { whiteUsername: string; blackUsername: string; reviewData: unknown; playedAt: Date | null };
function skills(games: G[], me: string) {
  const p = computePhaseAccuracy(games, me);
  const all = [p.opening, p.middlegame, p.endgame];
  const moves = all.reduce((a, b) => a + b.moves, 0);
  if (!moves) return null;
  const bad = all.reduce((a, b) => a + b.blunders + b.mistakes, 0);
  const best = all.reduce((a, b) => a + b.bestOrBetter, 0);
  const clean = games.filter((g) => {
    const mv = (g.reviewData as { moves?: { color?: string; classification?: string }[] } | null)?.moves;
    if (!Array.isArray(mv) || !mv.length) return false;
    const c = g.whiteUsername.toLowerCase() === me ? "white" : "black";
    return !mv.some((m) => m.color === c && m.classification === "blunder");
  }).length;
  const reviewed = games.filter((g) => Array.isArray((g.reviewData as { moves?: unknown[] } | null)?.moves)).length;
  return {
    openings: p.opening.moves ? p.opening.accuracy : null,
    middlegame: p.middlegame.moves ? p.middlegame.accuracy : null,
    endgames: p.endgame.moves >= 20 ? p.endgame.accuracy : null,
    tactics: Math.max(0, Math.round(100 - (bad / moves) * 100 * 4)), // fewer blunders/mistakes per move = higher
    precision: Math.round((best / moves) * 100),
    blunderFree: reviewed ? Math.round((clean / reviewed) * 100) : null,
    games: p.gamesAnalyzed,
  };
}

router.get("/me/skill-map", requireAuth, async (req: Request, res: Response) => {
  try {
    const me = await primaryName(req.user!.id);
    if (!me) { res.json({ now: null, start: null }); return; }
    const games = (await db.select({ whiteUsername: gamesTable.whiteUsername, blackUsername: gamesTable.blackUsername, reviewData: gamesTable.reviewData, playedAt: gamesTable.playedAt })
      .from(gamesTable).where(and(eq(gamesTable.username, me), eq(gamesTable.userId, req.user!.id), sql`${gamesTable.reviewData} IS NOT NULL`))
      .orderBy(gamesTable.playedAt)) as G[];
    if (games.length < 3) { res.json({ now: null, start: null, games: games.length }); return; }
    // now = your latest games; start = your first ones (once there are enough to compare)
    const n = Math.max(3, Math.min(20, Math.floor(games.length / 2)));
    res.json({ now: skills(games.slice(-n), me), start: games.length >= 8 ? skills(games.slice(0, n), me) : null, games: games.length });
  } catch (err) { logger.error({ err }, "[skill-map] failed"); res.status(500).json({ error: "Failed" }); }
});

// ── Badges ───────────────────────────────────────────────────────────────────
router.get("/me/badges", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.id;
    const me = await primaryName(uid);
    const one = async <T,>(q: ReturnType<typeof sql>) => (rows<T>(await db.execute(q))[0] ?? {}) as T;
    const fixed = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM (SELECT p.game_id FROM puzzles p JOIN games g ON g.id = p.game_id AND g.user_id = ${uid}
      LEFT JOIN puzzle_attempts pa ON pa.puzzle_id = p.id AND pa.user_id = ${uid} WHERE p.source = 'game' GROUP BY p.game_id HAVING bool_and(coalesce(pa.solved, false))) x`);
    const pat = rows<{ theme: string; solved: number }>(await db.execute(sql`
      WITH a AS (SELECT DISTINCT puzzle_id FROM puzzle_attempts WHERE user_id = ${uid} AND solved)
      SELECT t AS theme, count(*)::int AS solved FROM a JOIN puzzles p ON p.id = a.puzzle_id CROSS JOIN LATERAL unnest(string_to_array(coalesce(p.themes,''), ',')) t
      WHERE t IN ('fork','pin','skewer','discoveredAttack','hangingPiece','backRankMate','deflection','mateIn1','mateIn2','sacrifice') GROUP BY t`));
    const solvedAll = await one<{ n: number }>(sql`SELECT count(DISTINCT puzzle_id)::int AS n FROM puzzle_attempts WHERE user_id = ${uid} AND solved`);
    const streak = await one<{ best: number }>(sql`WITH d AS (SELECT day, day - (row_number() OVER (ORDER BY day))::int AS grp FROM user_activity_days WHERE user_id = ${uid})
      SELECT coalesce(max(c), 0)::int AS best FROM (SELECT count(*) AS c FROM d GROUP BY grp) x`).catch(() => ({ best: 0 }));
    const bots = await one<{ n: number }>(sql`SELECT count(DISTINCT bot)::int AS n FROM bot_results WHERE user_id = ${uid} AND result = 'win' AND NOT takeback`).catch(() => ({ n: 0 }));
    const daily = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM daily_scout_results WHERE user_id = ${uid} AND solved`).catch(() => ({ n: 0 }));
    let brilliant = 0, reviewed = 0;
    if (me) {
      const gs = await db.select({ w: gamesTable.whiteUsername, rd: gamesTable.reviewData }).from(gamesTable)
        .where(and(eq(gamesTable.userId, uid), eq(gamesTable.username, me), sql`${gamesTable.reviewData} IS NOT NULL`));
      for (const g of gs) {
        const mv = (g.rd as { moves?: { color?: string; classification?: string }[] } | null)?.moves;
        if (!Array.isArray(mv)) continue;
        reviewed++;
        const c = (g.w ?? "").toLowerCase() === me ? "white" : "black";
        brilliant += mv.filter((m) => m.color === c && m.classification === "brilliant").length;
      }
    }
    const gold = pat.filter((p) => p.solved >= 50).map((p) => p.theme);
    const B = (id: string, name: string, desc: string, have: number, need: number, icon: string) => ({ id, name, desc, icon, progress: Math.min(have, need), need, earned: have >= need });
    res.json({ badges: [
      B("first-brilliant", "First brilliant move", "Play a brilliant move in a reviewed game", brilliant, 1, "badge"),
      B("fixed-1", "Case closed", "Close every case from one of your games", fixed.n ?? 0, 1, "lookup"),
      B("fixed-10", "Fixed 10 games", "Close every case from 10 of your games", fixed.n ?? 0, 10, "lookup"),
      B("gold-pattern", "Gold pattern", "Solve 50 puzzles of one tactic", Math.max(0, ...pat.map((p) => p.solved)), 50, "tactics"),
      B("gold-3", "Pattern collector", "Reach Gold in 3 tactics", gold.length, 3, "puzzles"),
      B("puzzles-100", "100 puzzles", "Solve 100 puzzles", solvedAll.n ?? 0, 100, "puzzles"),
      B("streak-7", "One week", "Use ChessScout 7 days in a row", streak.best ?? 0, 7, "streak"),
      B("streak-30", "One month", "Use ChessScout 30 days in a row", streak.best ?? 0, 30, "streak"),
      B("reviews-25", "25 reviews", "Have 25 of your games reviewed", reviewed, 25, "analysis"),
      B("bots-5", "Bot hunter", "Beat 5 different practice bots", bots.n ?? 0, 5, "bots"),
      B("daily-7", "Daily Scout regular", "Solve 7 Daily Scouts", daily.n ?? 0, 7, "opponents"),
    ] });
  } catch (err) { logger.error({ err }, "[badges] failed"); res.status(500).json({ error: "Failed" }); }
});

// ── Weekly report card ───────────────────────────────────────────────────────
export async function weekReport(uid: string, endDay?: string) {
  const end = endDay && DAY.test(endDay) ? endDay : new Date().toISOString().slice(0, 10);
  const me = await primaryName(uid);
  const one = async <T,>(q: ReturnType<typeof sql>) => (rows<T>(await db.execute(q))[0] ?? {}) as T;
  const since = sql`(${end}::date - 6)`;
  const cases = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM puzzle_attempts pa JOIN puzzles p ON p.id = pa.puzzle_id WHERE pa.user_id = ${uid} AND pa.solved AND p.source = 'game' AND pa.attempted_at::date >= ${since}`);
  const puzzles = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM puzzle_attempts WHERE user_id = ${uid} AND solved AND attempted_at::date >= ${since}`);
  const days = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM user_activity_days WHERE user_id = ${uid} AND day >= ${since}`).catch(() => ({ n: 0 }));
  let games = 0, wins = 0, ratingFrom: number | null = null, ratingTo: number | null = null;
  let bestMove: { gameId: number; san: string; moveNumber: number; opponent: string; cls: string } | null = null;
  if (me) {
    const gs = await db.select({ id: gamesTable.id, w: gamesTable.whiteUsername, b: gamesTable.blackUsername, wr: gamesTable.whiteRating, br: gamesTable.blackRating, result: gamesTable.result, rd: gamesTable.reviewData })
      .from(gamesTable).where(and(eq(gamesTable.userId, uid), eq(gamesTable.username, me), sql`${gamesTable.playedAt}::date >= ${since} AND ${gamesTable.playedAt}::date <= ${end}::date`))
      .orderBy(gamesTable.playedAt);
    const rank: Record<string, number> = { brilliant: 3, great: 2, best: 1 };
    for (const g of gs) {
      games++;
      const white = (g.w ?? "").toLowerCase() === me;
      if (g.result === "win") wins++;
      const r = white ? g.wr : g.br;
      if (r) { ratingFrom ??= r; ratingTo = r; }
      const mv = (g.rd as { moves?: { color?: string; classification?: string; san?: string; moveNumber?: number; moveIndex?: number }[] } | null)?.moves;
      if (!Array.isArray(mv)) continue;
      for (const m of mv) {
        if (m.color !== (white ? "white" : "black") || !m.classification || !rank[m.classification] || !m.san) continue;
        if (!bestMove || rank[m.classification] > (rank[bestMove.cls] ?? 0)) bestMove = { gameId: g.id, san: m.san, moveNumber: m.moveNumber ?? Math.floor((m.moveIndex ?? 0) / 2) + 1, opponent: (white ? g.b : g.w) ?? "", cls: m.classification };
      }
    }
  }
  return { weekEnding: end, casesClosed: cases.n ?? 0, puzzlesSolved: puzzles.n ?? 0, daysActive: days.n ?? 0, games, wins, ratingChange: ratingFrom != null && ratingTo != null ? ratingTo - ratingFrom : null, rating: ratingTo, bestMove };
}

router.get("/me/report-card", requireAuth, async (req: Request, res: Response) => {
  try { res.json(await weekReport(req.user!.id, typeof req.query.end === "string" ? req.query.end : undefined)); }
  catch (err) { logger.error({ err }, "[report-card] failed"); res.status(500).json({ error: "Failed" }); }
});

/** Sunday evening: a push to members active in the last two weeks who did something this week. */
export async function sendWeeklyReportCards() {
  const { sendPushToUser } = await import("../lib/pushNotifications");
  const people = rows<{ user_id: string }>(await db.execute(sql`SELECT DISTINCT user_id FROM user_activity_days WHERE day >= current_date - 6`));
  let sent = 0;
  for (const p of people) {
    try {
      const r = await weekReport(p.user_id);
      const bits = [r.casesClosed && `${r.casesClosed} case${r.casesClosed === 1 ? "" : "s"} closed`, r.puzzlesSolved && `${r.puzzlesSolved} puzzles`, r.ratingChange != null && r.ratingChange !== 0 && `${r.ratingChange > 0 ? "+" : ""}${r.ratingChange} rating`].filter(Boolean);
      if (!bits.length) continue;
      const out = await sendPushToUser(p.user_id, { title: "Your week on ChessScout", body: `${bits.join(" · ")}. See your report card.`, url: "/report-card", tag: "report-card" });
      sent += out.sent;
    } catch { /* next */ }
  }
  logger.info({ sent, people: people.length }, "[report-card] weekly pushes");
}

/** Hourly check; on Sunday 6 pm New York time, send the week's report cards once. */
export function startWeeklyReportCards() {
  const tick = async () => {
    try {
      const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      if (ny.getDay() !== 0 || ny.getHours() !== 18) return;
      const key = `report-card-${ny.getFullYear()}-${ny.getMonth() + 1}-${ny.getDate()}`;
      await db.execute(sql`CREATE TABLE IF NOT EXISTS one_time_jobs (name varchar PRIMARY KEY, done_at timestamptz NOT NULL DEFAULT now())`);
      const claimed = await db.execute(sql`INSERT INTO one_time_jobs (name) VALUES (${key}) ON CONFLICT DO NOTHING RETURNING name`);
      if (claimed.rows.length) await sendWeeklyReportCards();
    } catch (err) { logger.warn({ err }, "[report-card] weekly tick failed"); }
  };
  setInterval(tick, 20 * 60_000);
}

// ── Scout Sprint ─────────────────────────────────────────────────────────────
router.get("/me/sprint", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.id;
    const mine = rows<{ best: number }>(await db.execute(sql`SELECT best FROM sprint_bests WHERE user_id = ${uid}`))[0]?.best ?? 0;
    let friends: { name: string; best: number }[] = [];
    try { friends = rows<{ name: string; best: number }>(await db.execute(sql`
      SELECT coalesce(u.scout_username, u.chesscom_username, u.lichess_username, 'Friend') AS name, s.best FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.requester_id = ${uid} THEN f.addressee_id ELSE f.requester_id END
      JOIN sprint_bests s ON s.user_id = u.id
      WHERE f.status = 'accepted' AND (f.requester_id = ${uid} OR f.addressee_id = ${uid}) ORDER BY s.best DESC LIMIT 10`)); } catch { /* no friends table */ }
    res.json({ best: mine, friends });
  } catch (err) { logger.error({ err }, "[sprint] read failed"); res.json({ best: 0, friends: [] }); }
});

router.post("/me/sprint", requireAuth, async (req: Request, res: Response) => {
  try {
    const score = Math.max(0, Math.min(200, Math.floor(Number(req.body?.score) || 0)));
    await db.execute(sql`INSERT INTO sprint_bests (user_id, best, updated_at) VALUES (${req.user!.id}, ${score}, now())
      ON CONFLICT (user_id) DO UPDATE SET best = GREATEST(sprint_bests.best, EXCLUDED.best), updated_at = CASE WHEN EXCLUDED.best > sprint_bests.best THEN now() ELSE sprint_bests.updated_at END`);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[sprint] save failed"); res.status(500).json({ error: "Failed" }); }
});

// ── Monthly scouted bot ──────────────────────────────────────────────────────
router.get("/me/bot-month", requireAuth, async (req: Request, res: Response) => {
  try {
    const bot = String(req.query.bot ?? "").slice(0, 60);
    const r = rows<{ wins: number; games: number }>(await db.execute(sql`SELECT count(*) FILTER (WHERE result = 'win' AND NOT takeback)::int AS wins, count(*)::int AS games
      FROM bot_results WHERE user_id = ${req.user!.id} AND bot = ${bot} AND created_at >= date_trunc('month', now())`))[0];
    res.json({ wins: r?.wins ?? 0, games: r?.games ?? 0 });
  } catch (err) { logger.error({ err }, "[bot-month] failed"); res.json({ wins: 0, games: 0 }); }
});

export default router;
