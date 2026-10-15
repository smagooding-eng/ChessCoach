import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, isUserPremium } from "../middlewares/authMiddleware";
import { listTimeControls, tournamentLiveStatus, closeTournamentPool } from "../lib/liveServer";
import { listCorrespondenceTimeControls } from "../lib/correspondence";
import { withdrawFromBracket, roundLabel } from "../lib/tournamentEngine";
import { logger } from "../lib/logger";

// Tournaments. Admins create them; the engine (lib/tournamentEngine) starts,
// pairs and finishes them.
//   GET  /tournaments                 running, upcoming and recent
//   GET  /tournaments/:id             details, standings or bracket, your game
//   POST /tournaments/:id/join
//   POST /tournaments/:id/withdraw
//   GET  /admin/tournaments           (admin) all + option lists
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
  starts_at: string; ends_at: string | null; status: string; created_at: string;
  format: string; kind: string; eligibility: string; max_players: number | null; total_rounds: number | null;
  winner_username: string | null;
  players?: number | string; joined?: boolean;
}

const liveTcs = () => listTimeControls().map((t) => ({ id: t.id, label: t.label }));
const dailyTcs = () => listCorrespondenceTimeControls().map((t) => ({ id: t.id, label: `${t.label} per move` }));
const tcLabel = (id: string) => [...liveTcs(), ...dailyTcs()].find((t) => t.id === id)?.label ?? id;

function publicT(t: TRow) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    timeControl: t.time_control,
    timeControlLabel: tcLabel(t.time_control),
    mode: t.mode === "ranked" ? "ranked" : "casual",
    format: t.format === "bracket" ? "bracket" : "arena",
    kind: t.kind === "daily" ? "daily" : "live",
    eligibility: t.eligibility === "pro" ? "pro" : "all",
    maxPlayers: t.max_players,
    totalRounds: t.total_rounds,
    startsAt: t.starts_at,
    endsAt: t.ends_at,
    status: t.status,
    players: Number(t.players ?? 0),
    joined: !!t.joined,
    winner: t.winner_username,
  };
}

const uidOf = (req: Request): string | null => (req.isAuthenticated?.() && req.user?.id) ? req.user.id : null;

const SELECT_T = (uid: string) => sql`
  SELECT t.*,
    (SELECT COUNT(*) FROM tournament_players p WHERE p.tournament_id = t.id AND NOT p.withdrawn) AS players,
    EXISTS (SELECT 1 FROM tournament_players p WHERE p.tournament_id = t.id AND p.user_id = ${uid} AND NOT p.withdrawn) AS joined
  FROM tournaments t`;

router.get("/tournaments", async (req: Request, res: Response) => {
  try {
    const uid = uidOf(req) ?? "";
    const rows = rowsOf<TRow>(await db.execute(sql`
      ${SELECT_T(uid)}
      WHERE t.status IN ('scheduled', 'running')
         OR (t.status = 'finished' AND COALESCE(t.ends_at, t.starts_at) > now() - interval '14 days')
      ORDER BY t.starts_at ASC
      LIMIT 60`));
    res.json({
      running: rows.filter((r) => r.status === "running").map(publicT),
      upcoming: rows.filter((r) => r.status === "scheduled").map(publicT),
      recent: rows.filter((r) => r.status === "finished").reverse().slice(0, 10).map(publicT),
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
    const [t] = rowsOf<TRow>(await db.execute(sql`${SELECT_T(uid)} WHERE t.id = ${id}`));
    if (!t || t.status === "cancelled") { res.status(404).json({ error: "Tournament not found" }); return; }
    interface PRow { user_id: string; username: string; score: number; games: number; wins: number; draws: number; losses: number; withdrawn: boolean }
    const players = rowsOf<PRow>(await db.execute(sql`
      SELECT user_id, username, score, games, wins, draws, losses, withdrawn FROM tournament_players
      WHERE tournament_id = ${id} AND (NOT withdrawn OR games > 0)
      ORDER BY score DESC, wins DESC, games ASC, joined_at ASC
      LIMIT 500`));
    interface GRow { game_id: string; kind: string; white_username: string; black_username: string; white_user_id: string; black_user_id: string; result: string | null; termination: string | null; started_at: string }
    const recentGames = rowsOf<GRow>(await db.execute(sql`
      SELECT game_id, kind, white_username, black_username, white_user_id, black_user_id, result, termination, started_at
      FROM tournament_games WHERE tournament_id = ${id} ORDER BY started_at DESC LIMIT 30`));
    const live = tournamentLiveStatus(id);
    const waiting = new Set(live.waiting);
    // Daily games in progress count as "playing".
    const activeDaily = new Map<string, { gameId: string; opp: string }>();
    for (const g of rowsOf<GRow>(await db.execute(sql`
      SELECT game_id, white_username, black_username, white_user_id, black_user_id FROM tournament_games
      WHERE tournament_id = ${id} AND kind = 'daily' AND result IS NULL`))) {
      activeDaily.set(g.white_user_id, { gameId: g.game_id, opp: g.black_username });
      activeDaily.set(g.black_user_id, { gameId: g.game_id, opp: g.white_username });
    }

    interface MRow { id: number; round: number; slot: number; a_id: string | null; a_name: string | null; a_seed: number | null; b_id: string | null; b_name: string | null; b_seed: number | null; status: string; winner_id: string | null; note: string | null; game_id: string | null; games_played: number; deadline: string | null }
    const matchRows = t.format === "bracket"
      ? rowsOf<MRow>(await db.execute(sql`SELECT * FROM tournament_matches WHERE tournament_id = ${id} ORDER BY round, slot`))
      : [];
    const total = t.total_rounds ?? 0;
    const bracket = matchRows.map((m) => ({
      id: m.id, round: m.round, slot: m.slot, roundLabel: roundLabel(m.round, total),
      a: m.a_id ? { name: m.a_name, seed: m.a_seed, isMe: m.a_id === uid } : null,
      b: m.b_id ? { name: m.b_name, seed: m.b_seed, isMe: m.b_id === uid } : null,
      status: m.status,
      winner: m.winner_id ? (m.winner_id === m.a_id ? "a" : "b") : null,
      note: m.note,
      gamesPlayed: m.games_played,
    }));
    const mine = matchRows.find((m) => m.status !== "done" && (m.a_id === uid || m.b_id === uid));
    const myMatch = mine ? {
      id: mine.id,
      roundLabel: roundLabel(mine.round, total),
      opponent: mine.a_id === uid ? mine.b_name : mine.a_name,
      status: mine.status,
      deadline: mine.deadline,
      gameId: mine.game_id,
      replay: mine.status === "playing" ? mine.games_played >= 2 : mine.games_played >= 1,
    } : null;
    const knockedOut = t.format === "bracket" && !!uid && !mine && matchRows.some((m) => (m.a_id === uid || m.b_id === uid) && m.status === "done" && m.winner_id !== uid);

    res.json({
      tournament: publicT(t),
      serverNow: Date.now(),
      standings: players.map((p, i) => ({
        rank: i + 1,
        userId: p.user_id,
        username: p.username,
        score: Number(p.score), games: Number(p.games), wins: Number(p.wins), draws: Number(p.draws), losses: Number(p.losses),
        withdrawn: p.withdrawn,
        state: live.playing[p.user_id] || activeDaily.has(p.user_id) ? "playing" : waiting.has(p.user_id) ? "waiting" : "away",
        playingAgainst: live.playing[p.user_id] ?? activeDaily.get(p.user_id)?.opp ?? null,
        isMe: p.user_id === uid,
      })),
      games: recentGames.map((g) => ({
        gameId: g.game_id, kind: g.kind, white: g.white_username, black: g.black_username, result: g.result, termination: g.termination, startedAt: g.started_at,
        mine: g.white_user_id === uid || g.black_user_id === uid,
      })),
      bracket,
      myMatch,
      knockedOut,
      myDailyGame: uid ? activeDaily.get(uid)?.gameId ?? null : null,
    });
  } catch (err) {
    logger.error({ err }, "[tournaments] detail failed");
    res.status(500).json({ error: "Could not load the tournament" });
  }
});

router.post("/tournaments/:id/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const uid = req.user!.id;
    const [t] = rowsOf<TRow>(await db.execute(sql`${SELECT_T(uid)} WHERE t.id = ${id}`));
    if (!t || (t.status !== "scheduled" && t.status !== "running")) { res.status(400).json({ error: "This tournament isn't open" }); return; }
    if (t.format === "bracket" && t.status !== "scheduled") { res.status(400).json({ error: "Registration closed when the bracket started" }); return; }
    if (t.eligibility === "pro" && !(await isUserPremium(uid))) {
      res.status(403).json({ error: "This tournament is for ChessScout Pro members.", needsPro: true });
      return;
    }
    if (!t.joined && t.max_players && Number(t.players ?? 0) >= t.max_players) { res.status(400).json({ error: "This tournament is full" }); return; }
    const name = req.user!.chesscomUsername || req.user!.lichessUsername || req.user!.firstName || req.user!.email?.split("@")[0] || "Player";
    await db.execute(sql`
      INSERT INTO tournament_players (tournament_id, user_id, username) VALUES (${id}, ${uid}, ${name})
      ON CONFLICT (tournament_id, user_id) DO UPDATE SET withdrawn = false`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[tournaments] join failed");
    res.status(500).json({ error: "Could not join" });
  }
});

router.post("/tournaments/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await db.execute(sql`UPDATE tournament_players SET withdrawn = true WHERE tournament_id = ${id} AND user_id = ${req.user!.id}`);
    await withdrawFromBracket(id, req.user!.id);
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
    res.json({ tournaments: rows.map(publicT), timeControls: liveTcs(), liveTimeControls: liveTcs(), dailyTimeControls: dailyTcs() });
  } catch (err) {
    logger.error({ err }, "[tournaments] admin list failed");
    res.status(500).json({ error: "Could not load tournaments" });
  }
});

router.post("/admin/tournaments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = (req.body ?? {}) as {
      name?: string; description?: string; timeControl?: string; mode?: string; startsAt?: string;
      durationMinutes?: number; format?: string; kind?: string; eligibility?: string; maxPlayers?: number | null;
    };
    const name = String(b.name ?? "").trim().slice(0, 80);
    if (!name) { res.status(400).json({ error: "Give it a name" }); return; }
    const format = b.format === "bracket" ? "bracket" : "arena";
    const kind = b.kind === "daily" ? "daily" : "live";
    const tcs = kind === "daily" ? dailyTcs() : liveTcs();
    if (!b.timeControl || !tcs.some((t) => t.id === b.timeControl)) { res.status(400).json({ error: "Pick a time control" }); return; }
    const starts = b.startsAt ? new Date(b.startsAt) : new Date();
    if (Number.isNaN(starts.getTime())) { res.status(400).json({ error: "Invalid start time" }); return; }
    if (starts.getTime() > Date.now() + 366 * 24 * 3600_000) { res.status(400).json({ error: "Start within the next year" }); return; }
    let ends: Date | null = null;
    if (format === "arena") {
      const minutes = Math.round(Number(b.durationMinutes));
      if (!Number.isFinite(minutes) || minutes < 10 || minutes > 60 * 24 * 60) { res.status(400).json({ error: "Arena length must be 10 minutes to 60 days" }); return; }
      if (kind === "daily" && minutes < 24 * 60) { res.status(400).json({ error: "A daily arena needs at least a day" }); return; }
      ends = new Date(starts.getTime() + minutes * 60_000);
      if (ends.getTime() <= Date.now()) { res.status(400).json({ error: "That would already be over" }); return; }
    }
    const maxPlayers = b.maxPlayers && Number(b.maxPlayers) >= 2 ? Math.min(1024, Math.round(Number(b.maxPlayers))) : null;
    const id = crypto.randomBytes(5).toString("hex");
    await db.execute(sql`
      INSERT INTO tournaments (id, name, description, time_control, mode, starts_at, ends_at, status, created_by, format, kind, eligibility, max_players)
      VALUES (${id}, ${name}, ${String(b.description ?? "").trim().slice(0, 500) || null}, ${b.timeControl},
        ${b.mode === "ranked" ? "ranked" : "casual"}, ${starts.toISOString()}, ${ends ? ends.toISOString() : null}, 'scheduled', ${req.user!.id},
        ${format}, ${kind}, ${b.eligibility === "pro" ? "pro" : "all"}, ${maxPlayers})`);
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
