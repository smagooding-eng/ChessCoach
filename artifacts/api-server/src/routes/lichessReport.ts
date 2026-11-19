// Admin: is Lichess actually getting people into real games?
//  - sign-ups by method (Google / Lichess / email) in the range
//  - how many members have Lichess connected for play (board token), and how many connected in the range
//  - Lichess games started from ChessScout in the range, by where they started
//  - the live-play path: searched → nobody here → Lichess search / connect card / bot offer → what they picked
// The owner's own accounts are left out.
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";

const router: IRouter = Router();
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

const PLAY_EVENTS = new Set([
  "queued", "nobody_here", "lichess_search", "lichess_game", "connect_shown", "connect_clicked", "bot_offer_shown", "bot_chosen", "cancelled", "matched_here",
]);
let ready: Promise<void> | null = null;
const ensure = () => (ready ??= db.execute(sql`CREATE TABLE IF NOT EXISTS play_funnel (
  id serial PRIMARY KEY, user_id varchar NOT NULL, event varchar(24) NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`)
  .then(() => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_play_funnel_at ON play_funnel (created_at)`)).then(() => undefined)
  .catch((e) => { ready = null; throw e; }));

router.post("/play-funnel/track", requireAuth, async (req: Request, res: Response) => {
  const event = String(req.body?.event ?? "");
  if (!PLAY_EVENTS.has(event)) { res.status(400).json({ error: "Unknown event" }); return; }
  try { await ensure(); await db.execute(sql`INSERT INTO play_funnel (user_id, event) VALUES (${req.user!.id}, ${event})`); } catch { /* ignore */ }
  res.json({ ok: true });
});

router.get("/admin/lichess-report", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const day = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const tz = typeof req.query.tz === "string" && /^[A-Za-z_/+-]{1,40}$/.test(req.query.tz) ? req.query.tz : "America/New_York";
  const start = day(req.query.startDate) ?? new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const end = day(req.query.endDate) ?? new Date().toISOString().slice(0, 10);
  const from = sql`(${start}::date AT TIME ZONE ${tz})`;
  const to = sql`((${end}::date + 1) AT TIME ZONE ${tz})`;
  const notOwner = (col: string) => sql.raw(`${col} NOT IN (SELECT id FROM analytics_excluded_users)`);
  const safe = async <T,>(q: Promise<unknown>): Promise<T[]> => { try { return rowsOf<T>(await q); } catch { return []; } };
  try {
    await ensure().catch(() => {});
    const signups = await safe<{ provider: string; n: number }>(db.execute(sql`
      SELECT COALESCE(auth_provider, 'local') AS provider, count(*)::int AS n FROM users
      WHERE created_at >= ${from} AND created_at < ${to} AND ${notOwner("id")} GROUP BY 1 ORDER BY 2 DESC`));
    const [tokens] = await safe<{ total: number; in_range: number }>(db.execute(sql`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE updated_at >= ${from} AND updated_at < ${to})::int AS in_range
      FROM lichess_board_tokens WHERE ${notOwner("user_id")}`));
    const [linked] = await safe<{ n: number }>(db.execute(sql`SELECT count(*)::int AS n FROM users WHERE lichess_username IS NOT NULL AND lichess_username <> '' AND ${notOwner("id")}`));
    const games = await safe<{ source: string; games: number; people: number }>(db.execute(sql`
      SELECT COALESCE(source, 'lichess') AS source, count(*)::int AS games, count(DISTINCT user_id)::int AS people FROM lichess_cs_games
      WHERE created_at >= ${from} AND created_at < ${to} AND ${notOwner("user_id")} GROUP BY 1`));
    const funnel = await safe<{ event: string; times: number; people: number }>(db.execute(sql`
      SELECT event, count(*)::int AS times, count(DISTINCT user_id)::int AS people FROM play_funnel
      WHERE created_at >= ${from} AND created_at < ${to} AND ${notOwner("user_id")} GROUP BY 1 ORDER BY 3 DESC`));
    const live = await safe<{ kind: string; games: number; people: number }>(db.execute(sql`
      SELECT CASE WHEN white_persona_id IS NULL AND black_persona_id IS NULL THEN 'vs_person' ELSE 'vs_bot' END AS kind,
        count(*)::int AS games, count(DISTINCT COALESCE(white_user_id, black_user_id))::int AS people FROM live_games
      WHERE finished_at >= ${from} AND finished_at < ${to}
        AND COALESCE(white_user_id, '') NOT IN (SELECT id FROM analytics_excluded_users) AND COALESCE(black_user_id, '') NOT IN (SELECT id FROM analytics_excluded_users)
      GROUP BY 1`));
    res.json({
      range: { start, end, tz },
      signupsByMethod: Object.fromEntries(signups.map((r) => [r.provider, r.n])),
      lichessConnectedForPlay: { total: tokens?.total ?? 0, connectedInRange: tokens?.in_range ?? 0 },
      membersWithLichessUsername: linked?.n ?? 0,
      lichessGamesStartedHere: Object.fromEntries(games.map((r) => [r.source, { games: r.games, people: r.people }])),
      liveGamesFinishedHere: Object.fromEntries(live.map((r) => [r.kind, { games: r.games, people: r.people }])),
      livePlayPath: Object.fromEntries(funnel.map((r) => [r.event, { times: r.times, people: r.people }])),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
