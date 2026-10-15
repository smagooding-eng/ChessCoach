import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { listTimeControls, tournamentLiveStatus, closeTournamentPool } from "../lib/liveServer";
import { logger } from "../lib/logger";

// Arena tournaments. Admins create them; players join and get paired
// continuously over the live WebSocket (see liveServer "Arena tournaments").
//   GET  /tournaments                 running, upcoming and recent
//   GET  /tournaments/:id             details, standings, recent games
//   POST /tournaments/:id/join
//   POST /tournaments/:id/withdraw
//   GET  /admin/tournaments           (admin) all
//   POST /admin/tournaments           (admin) create
//   POST /admin/tournaments/:id/cancel (admin)
const router: IRouter = Router();

function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] })?.rows) ?? [];
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

interface TRow {
  id: string; name: string; description: string | null; time_control: string; mode: string;
  starts_at: string; ends_at: string; status: string; created_at: string; players?: number | string; joined?: boolean;
}

const tcLabel = (id: string) => listTimeControls().find((t) => t.id === id)?.label ?? id;

function publicT(t: TRow) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    timeControl: t.time_control,
    timeControlLabel: tcLabel(t.time_control),
    mode: t.mode === "ranked" ? "ranked" : "casual",
    startsAt: t.starts_at,
    endsAt: t.ends_at,
    status: t.status,
    players: Number(t.players ?? 0),
    joined: !!t.joined,
  };
}

const uidOf = (req: Request): string | null => (req.isAuthenticated?.() && req.user?.id) ? req.user.id : null;

router.get("/tournaments", async (req: Request, res: Response) => {
  try {
    const uid = uidOf(req) ?? "";
    const rows = rowsOf<TRow & { winner: string | null }>(await db.execute(sql`
      SELECT t.*,
        (SELECT COUNT(*) FROM tournament_players p WHERE p.tournament_id = t.id AND NOT p.withdrawn) AS players,
        EXISTS (SELECT 1 FROM tournament_players p WHERE p.tournament_id = t.id AND p.user_id = ${uid} AND NOT p.withdrawn) AS joined,
        (SELECT p.username FROM tournament_players p WHERE p.tournament_id = t.id AND p.games > 0
           ORDER BY p.score DESC, p.wins DESC, p.games ASC LIMIT 1) AS winner
      FROM tournaments t
      WHERE t.status IN ('scheduled', 'running')
         OR (t.status = 'finished' AND t.ends_at > now() - interval '14 days')
      ORDER BY t.starts_at ASC
      LIMIT 60`));
    res.json({
      running: rows.filter((r) => r.status === "running").map(publicT),
      upcoming: rows.filter((r) => r.status === "scheduled").map(publicT),
      recent: rows.filter((r) => r.status === "finished").reverse().slice(0, 10).map((r) => ({ ...publicT(r), winner: r.winner })),
    });
  } catch (err) {
    logger.error({ err }, "[tournaments] list failed");
    res.status(500).json({ error: "Could not load tournaments" });
  }
});

router.get("/tournaments/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const uid = uidOf(req) ?? "";
    const [t] = rowsOf<TRow>(await db.execute(sql`
      SELECT t.*,
        (SELECT COUNT(*) FROM tournament_players p WHERE p.tournament_id = t.id AND NOT p.withdrawn) AS players,
        EXISTS (SELECT 1 FROM tournament_players p WHERE p.tournament_id = t.id AND p.user_id = ${uid} AND NOT p.withdrawn) AS joined
      FROM tournaments t WHERE t.id = ${id}`));
    if (!t || t.status === "cancelled") { res.status(404).json({ error: "Tournament not found" }); return; }
    interface PRow { user_id: string; username: string; score: number; games: number; wins: number; draws: number; losses: number; withdrawn: boolean }
    const players = rowsOf<PRow>(await db.execute(sql`
      SELECT user_id, username, score, games, wins, draws, losses, withdrawn FROM tournament_players
      WHERE tournament_id = ${id} AND (NOT withdrawn OR games > 0)
      ORDER BY score DESC, wins DESC, games ASC, joined_at ASC
      LIMIT 300`));
    interface GRow { game_id: string; white_username: string; black_username: string; white_user_id: string; black_user_id: string; result: string | null; termination: string | null; started_at: string }
    const recentGames = rowsOf<GRow>(await db.execute(sql`
      SELECT game_id, white_username, black_username, white_user_id, black_user_id, result, termination, started_at
      FROM tournament_games WHERE tournament_id = ${id} ORDER BY started_at DESC LIMIT 30`));
    const live = tournamentLiveStatus(id);
    const waiting = new Set(live.waiting);
    res.json({
      tournament: publicT(t),
      serverNow: Date.now(),
      standings: players.map((p, i) => ({
        rank: i + 1,
        userId: p.user_id,
        username: p.username,
        score: Number(p.score), games: Number(p.games), wins: Number(p.wins), draws: Number(p.draws), losses: Number(p.losses),
        withdrawn: p.withdrawn,
        state: live.playing[p.user_id] ? "playing" : waiting.has(p.user_id) ? "waiting" : "away",
        playingAgainst: live.playing[p.user_id] ?? null,
        isMe: p.user_id === uid,
      })),
      games: recentGames.map((g) => ({
        gameId: g.game_id, white: g.white_username, black: g.black_username, result: g.result, termination: g.termination, startedAt: g.started_at,
        mine: g.white_user_id === uid || g.black_user_id === uid,
      })),
    });
  } catch (err) {
    logger.error({ err }, "[tournaments] detail failed");
    res.status(500).json({ error: "Could not load the tournament" });
  }
});

router.post("/tournaments/:id/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [t] = rowsOf<{ status: string }>(await db.execute(sql`SELECT status FROM tournaments WHERE id = ${id}`));
    if (!t || (t.status !== "scheduled" && t.status !== "running")) { res.status(400).json({ error: "This tournament isn't open" }); return; }
    const name = req.user!.chesscomUsername || req.user!.lichessUsername || req.user!.firstName || req.user!.email?.split("@")[0] || "Player";
    await db.execute(sql`
      INSERT INTO tournament_players (tournament_id, user_id, username) VALUES (${id}, ${req.user!.id}, ${name})
      ON CONFLICT (tournament_id, user_id) DO UPDATE SET withdrawn = false`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[tournaments] join failed");
    res.status(500).json({ error: "Could not join" });
  }
});

router.post("/tournaments/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE tournament_players SET withdrawn = true WHERE tournament_id = ${String(req.params.id)} AND user_id = ${req.user!.id}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[tournaments] withdraw failed");
    res.status(500).json({ error: "Could not withdraw" });
  }
});

// ── Admin ──
router.get("/admin/tournaments", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = rowsOf<TRow>(await db.execute(sql`
      SELECT t.*, (SELECT COUNT(*) FROM tournament_players p WHERE p.tournament_id = t.id AND NOT p.withdrawn) AS players
      FROM tournaments t ORDER BY t.starts_at DESC LIMIT 50`));
    res.json({ tournaments: rows.map(publicT), timeControls: listTimeControls().map((t) => ({ id: t.id, label: t.label })) });
  } catch (err) {
    logger.error({ err }, "[tournaments] admin list failed");
    res.status(500).json({ error: "Could not load tournaments" });
  }
});

router.post("/admin/tournaments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = (req.body ?? {}) as { name?: string; description?: string; timeControl?: string; mode?: string; startsAt?: string; durationMinutes?: number };
    const name = String(b.name ?? "").trim().slice(0, 80);
    if (!name) { res.status(400).json({ error: "Give it a name" }); return; }
    if (!b.timeControl || !listTimeControls().some((t) => t.id === b.timeControl)) { res.status(400).json({ error: "Pick a time control" }); return; }
    const starts = b.startsAt ? new Date(b.startsAt) : new Date();
    if (Number.isNaN(starts.getTime())) { res.status(400).json({ error: "Invalid start time" }); return; }
    const minutes = Math.round(Number(b.durationMinutes));
    if (!Number.isFinite(minutes) || minutes < 10 || minutes > 24 * 60) { res.status(400).json({ error: "Length must be 10 minutes to 24 hours" }); return; }
    const ends = new Date(starts.getTime() + minutes * 60_000);
    if (ends.getTime() <= Date.now()) { res.status(400).json({ error: "That would already be over" }); return; }
    const id = crypto.randomBytes(5).toString("hex");
    await db.execute(sql`
      INSERT INTO tournaments (id, name, description, time_control, mode, starts_at, ends_at, status, created_by)
      VALUES (${id}, ${name}, ${String(b.description ?? "").trim().slice(0, 500) || null}, ${b.timeControl},
        ${b.mode === "ranked" ? "ranked" : "casual"}, ${starts.toISOString()}, ${ends.toISOString()}, 'scheduled', ${req.user!.id})`);
    res.json({ id });
  } catch (err) {
    logger.error({ err }, "[tournaments] create failed");
    res.status(500).json({ error: "Could not create the tournament" });
  }
});

router.post("/admin/tournaments/:id/cancel", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await db.execute(sql`UPDATE tournaments SET status = 'cancelled' WHERE id = ${id} AND status IN ('scheduled', 'running')`);
    closeTournamentPool(id);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[tournaments] cancel failed");
    res.status(500).json({ error: "Could not cancel" });
  }
});

export default router;
