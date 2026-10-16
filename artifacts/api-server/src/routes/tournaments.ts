import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, isUserPremium } from "../middlewares/authMiddleware";
import { listTimeControls, tournamentLiveStatus, closeTournamentPool } from "../lib/liveServer";
import { listCorrespondenceTimeControls } from "../lib/correspondence";
import { withdrawFromBracket, roundLabel } from "../lib/tournamentEngine";
import { logger } from "../lib/logger";
import { notifyUser } from "../lib/notify";
import {
  ENTRY_FEE_CENTS, hasPaidEntry, creditProSignupIfAny, recordProIntent, createEntryCheckout, recordPaidEntry,
  refundTournamentEntries, organizerSummary, loadTournamentInfo,
} from "../lib/tournamentEntries";

const PRO_MAX_PLAYERS = 500;
// One-off $5 entries are built but switched off for now: Pro membership is
// the only way into a Pro tournament. Set ENTRY_FEES_ENABLED=true to bring
// them back (the UI follows entryFeeCents).
const ENTRY_FEES_ENABLED = process.env.ENTRY_FEES_ENABLED === "true";

// Tournaments. Admins and players create them; they're listed publicly
// unless the organizer chose link-only. Anyone (signed in or not) can view
// the list and a tournament's standings, bracket and games. The engine (lib/tournamentEngine) starts, pairs
// and finishes them.
//   GET  /tournaments                 running, upcoming and recent
//   GET  /tournament-options          time controls for the create form
//   POST /tournaments                 create (any signed-in player)
//   GET  /tournaments/:id             details, standings or bracket, your game
//   POST /tournaments/:id/join
//   POST /tournaments/:id/withdraw
//   POST /tournaments/:id/cancel      (creator or admin)
//   PATCH /tournaments/:id            (creator or admin) name, club, note, logo, listed
//   GET  /tournaments/:id/logo        organizer's logo image
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
  visibility?: string; created_by?: string; created_by_name?: string | null;
  club_name?: string | null; logo_version?: number | null; entry_fee_cents?: number | null;
  players?: number | string; joined?: boolean;
}

const liveTcs = () => listTimeControls().map((t) => ({ id: t.id, label: t.label }));
const dailyTcs = () => listCorrespondenceTimeControls().map((t) => ({ id: t.id, label: `${t.label} per move` }));
const tcLabel = (id: string) => [...liveTcs(), ...dailyTcs()].find((t) => t.id === id)?.label ?? id;

function publicT(t: TRow, uid?: string | null) {
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
    visibility: t.visibility === "link" ? "link" : "public",
    createdByName: t.created_by_name ?? null,
    isCreator: !!uid && t.created_by === uid,
    clubName: t.club_name ?? null,
    // Entry fees are switched off for now (Pro membership is the only way in).
    entryFeeCents: ENTRY_FEES_ENABLED && t.eligibility === "pro" ? (t.entry_fee_cents ?? ENTRY_FEE_CENTS) : null,
    logoUrl: t.logo_version ? `/api/tournaments/${t.id}/logo?v=${t.logo_version}` : null,
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
      WHERE (t.status IN ('scheduled', 'running')
         OR (t.status = 'finished' AND COALESCE(t.ends_at, t.starts_at) > now() - interval '90 days'))
        AND (t.visibility = 'public' OR t.created_by = ${uid}
          OR EXISTS (SELECT 1 FROM tournament_players p WHERE p.tournament_id = t.id AND p.user_id = ${uid} AND NOT p.withdrawn))
      ORDER BY t.starts_at ASC
      LIMIT 300`));
    const pub = (r: TRow) => publicT(r, uid);
    res.json({
      running: rows.filter((r) => r.status === "running").map(pub),
      upcoming: rows.filter((r) => r.status === "scheduled").map(pub),
      recent: rows.filter((r) => r.status === "finished").reverse().slice(0, 60).map(pub),
    });
  } catch (err) {
    logger.error({ err }, "[tournaments] list failed");
    res.status(500).json({ error: "Could not load tournaments" });
  }
});

interface CreateBody {
  name?: string; description?: string; timeControl?: string; mode?: string; startsAt?: string;
  durationMinutes?: number; format?: string; kind?: string; eligibility?: string; maxPlayers?: number | null;
}

/** Validates a create request; returns the row values or an error message. */
function parseCreate(b: CreateBody, opts: { admin: boolean }): { error: string } | {
  name: string; description: string | null; timeControl: string; mode: string; starts: Date; ends: Date | null;
  format: string; kind: string; eligibility: string; maxPlayers: number | null;
} {
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) return { error: "Give it a name" };
  const format = b.format === "bracket" ? "bracket" : "arena";
  const kind = b.kind === "daily" ? "daily" : "live";
  const tcs = kind === "daily" ? dailyTcs() : liveTcs();
  if (!b.timeControl || !tcs.some((t) => t.id === b.timeControl)) return { error: "Pick a time control" };
  const starts = b.startsAt ? new Date(b.startsAt) : new Date();
  if (Number.isNaN(starts.getTime())) return { error: "Invalid start time" };
  const maxAhead = opts.admin ? 366 : 60;
  if (starts.getTime() > Date.now() + maxAhead * 24 * 3600_000) return { error: opts.admin ? "Start within the next year" : "Start within the next 60 days" };
  let ends: Date | null = null;
  if (format === "arena") {
    const minutes = Math.round(Number(b.durationMinutes));
    const maxMinutes = opts.admin ? 60 * 24 * 60 : 30 * 24 * 60;
    if (!Number.isFinite(minutes) || minutes < 10 || minutes > maxMinutes) return { error: opts.admin ? "Arena length must be 10 minutes to 60 days" : "Arena length must be 10 minutes to 30 days" };
    if (kind === "daily" && minutes < 24 * 60) return { error: "A daily arena needs at least a day" };
    ends = new Date(Math.max(starts.getTime(), Date.now()) + minutes * 60_000);
    if (ends.getTime() <= Date.now()) return { error: "That would already be over" };
  }
  // Free player tournaments up to 256 players; Pro tournaments up to 500.
  const cap = opts.admin ? 1024 : b.eligibility === "pro" ? PRO_MAX_PLAYERS : 256;
  const maxPlayers = b.maxPlayers && Number(b.maxPlayers) >= 2 ? Math.min(cap, Math.round(Number(b.maxPlayers))) : null;
  return {
    name, description: String(b.description ?? "").trim().slice(0, 500) || null, timeControl: b.timeControl,
    mode: b.mode === "ranked" ? "ranked" : "casual", starts, ends, format, kind,
    eligibility: b.eligibility === "pro" ? "pro" : "all",
    // A Pro tournament always has a cap (500 at most).
    maxPlayers: b.eligibility === "pro" && !opts.admin ? (maxPlayers ?? PRO_MAX_PLAYERS) : maxPlayers,
  };
}

const displayName = (req: Request) =>
  req.user!.scoutUsername || req.user!.chesscomUsername || req.user!.lichessUsername || req.user!.firstName || req.user!.email?.split("@")[0] || "Player";

// Logos arrive as data URLs (resized to ~256px in the browser).
const LOGO_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_LOGO_BYTES = 350_000;

async function saveLogo(id: string, dataUrl: unknown): Promise<string | null> {
  if (dataUrl === null || dataUrl === "") {
    await db.execute(sql`DELETE FROM tournament_logos WHERE tournament_id = ${id}`);
    await db.execute(sql`UPDATE tournaments SET logo_version = NULL WHERE id = ${id}`);
    return null;
  }
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(LOGO_RE);
  if (!m) return "The logo must be a PNG, JPG or WebP image";
  if (m[2].length * 0.75 > MAX_LOGO_BYTES) return "That logo is too large";
  await db.execute(sql`
    INSERT INTO tournament_logos (tournament_id, mime, data) VALUES (${id}, ${m[1]}, ${m[2]})
    ON CONFLICT (tournament_id) DO UPDATE SET mime = ${m[1]}, data = ${m[2]}, updated_at = now()`);
  await db.execute(sql`UPDATE tournaments SET logo_version = COALESCE(logo_version, 0) + 1 WHERE id = ${id}`);
  return null;
}

router.get("/tournaments/:id/logo", async (req: Request, res: Response) => {
  try {
    const [row] = rowsOf<{ mime: string; data: string }>(await db.execute(sql`SELECT mime, data FROM tournament_logos WHERE tournament_id = ${String(req.params.id)}`));
    if (!row) { res.status(404).end(); return; }
    res.set("Content-Type", row.mime);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(Buffer.from(row.data, "base64"));
  } catch {
    res.status(500).end();
  }
});

// Organizer edits: name, club name, note, logo, listed or link-only.
router.patch("/tournaments/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [t] = rowsOf<{ created_by: string; status: string }>(await db.execute(sql`SELECT created_by, status FROM tournaments WHERE id = ${id}`));
    if (!t) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (t.created_by !== req.user!.id && !req.user!.isAdmin) { res.status(403).json({ error: "Only the organizer can edit this tournament" }); return; }
    const b = (req.body ?? {}) as { name?: string; clubName?: string | null; description?: string | null; logo?: string | null; listed?: boolean };
    if (b.name !== undefined) {
      const name = String(b.name).trim().slice(0, 80);
      if (!name) { res.status(400).json({ error: "Give it a name" }); return; }
      await db.execute(sql`UPDATE tournaments SET name = ${name} WHERE id = ${id}`);
    }
    if (b.clubName !== undefined) await db.execute(sql`UPDATE tournaments SET club_name = ${String(b.clubName ?? "").trim().slice(0, 80) || null} WHERE id = ${id}`);
    if (b.description !== undefined) await db.execute(sql`UPDATE tournaments SET description = ${String(b.description ?? "").trim().slice(0, 500) || null} WHERE id = ${id}`);
    if (typeof b.listed === "boolean") await db.execute(sql`UPDATE tournaments SET visibility = ${b.listed ? "public" : "link"} WHERE id = ${id}`);
    if (b.logo !== undefined) {
      const err = await saveLogo(id, b.logo);
      if (err) { res.status(400).json({ error: err }); return; }
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[tournaments] edit failed");
    res.status(500).json({ error: "Could not save" });
  }
});

router.get("/tournament-options", (_req: Request, res: Response) => {
  res.json({ liveTimeControls: liveTcs(), dailyTimeControls: dailyTcs() });
});

const MAX_OPEN_PER_CREATOR = 5;

router.post("/tournaments", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.id;
    const v = parseCreate((req.body ?? {}) as CreateBody, { admin: false });
    if ("error" in v) { res.status(400).json({ error: v.error }); return; }
    const [{ open }] = rowsOf<{ open: string }>(await db.execute(sql`
      SELECT COUNT(*) AS open FROM tournaments WHERE created_by = ${uid} AND status IN ('scheduled', 'running')`));
    if (Number(open) >= MAX_OPEN_PER_CREATOR && !req.user!.isAdmin) {
      res.status(400).json({ error: `You can run up to ${MAX_OPEN_PER_CREATOR} tournaments at a time. Finish or cancel one first.` });
      return;
    }
    const extra = (req.body ?? {}) as { clubName?: string; logo?: string; listed?: boolean; acceptOrganizerTerms?: boolean };
    if (v.eligibility === "pro") {
      if (!(await isUserPremium(uid))) { res.status(403).json({ error: "Pro tournaments can be created by ChessScout Pro members.", needsPro: true }); return; }
      if (extra.acceptOrganizerTerms !== true) { res.status(400).json({ error: "Please accept the organizer terms for a Pro tournament" }); return; }
    }
    const id = crypto.randomBytes(5).toString("hex");
    const name = displayName(req);
    const visibility = extra.listed === false ? "link" : "public";
    await db.execute(sql`
      INSERT INTO tournaments (id, name, description, time_control, mode, starts_at, ends_at, status, created_by, format, kind, eligibility, max_players, visibility, created_by_name, club_name)
      VALUES (${id}, ${v.name}, ${v.description}, ${v.timeControl}, ${v.mode}, ${v.starts.toISOString()}, ${v.ends ? v.ends.toISOString() : null},
        'scheduled', ${uid}, ${v.format}, ${v.kind}, ${v.eligibility}, ${v.maxPlayers}, ${visibility}, ${name}, ${String(extra.clubName ?? "").trim().slice(0, 80) || null})`);
    if (v.eligibility === "pro") {
      await db.execute(sql`UPDATE tournaments SET entry_fee_cents = ${ENTRY_FEES_ENABLED ? ENTRY_FEE_CENTS : null}, organizer_terms_at = now() WHERE id = ${id}`);
    }
    if (extra.logo) {
      const err = await saveLogo(id, extra.logo);
      if (err) logger.warn({ id, err }, "[tournaments] logo rejected at create");
    }
    // The creator plays too unless they say otherwise.
    if ((req.body as { join?: boolean })?.join !== false) {
      await db.execute(sql`INSERT INTO tournament_players (tournament_id, user_id, username) VALUES (${id}, ${uid}, ${name}) ON CONFLICT DO NOTHING`);
    }
    res.json({ id });
  } catch (err) {
    logger.error({ err }, "[tournaments] user create failed");
    res.status(500).json({ error: "Could not create the tournament" });
  }
});

router.post("/tournaments/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [t] = rowsOf<{ created_by: string; name: string }>(await db.execute(sql`SELECT created_by, name FROM tournaments WHERE id = ${id}`));
    if (!t) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (t.created_by !== req.user!.id && !req.user!.isAdmin) { res.status(403).json({ error: "Only the organizer can cancel this tournament" }); return; }
    await db.execute(sql`UPDATE tournaments SET status = 'cancelled' WHERE id = ${id} AND status IN ('scheduled', 'running')`);
    closeTournamentPool(id);
    void refundTournamentEntries(id);
    const players = rowsOf<{ user_id: string }>(await db.execute(sql`SELECT user_id FROM tournament_players WHERE tournament_id = ${id} AND NOT withdrawn AND user_id <> ${req.user!.id}`));
    for (const p of players) void notifyUser(p.user_id, { title: `${t.name} was cancelled`, body: "The organizer cancelled this tournament.", kind: "tournament" }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[tournaments] user cancel failed");
    res.status(500).json({ error: "Could not cancel" });
  }
});

// Pro tournaments: the two ways in for someone who isn't Pro yet.
router.post("/tournaments/:id/pro-intent", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const t = await loadTournamentInfo(id);
    if (!t || t.eligibility !== "pro") { res.status(400).json({ error: "Not a Pro tournament" }); return; }
    if (!(await isUserPremium(req.user!.id))) await recordProIntent(id, req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[tournaments] pro intent failed");
    res.status(500).json({ error: "Could not continue" });
  }
});

router.post("/tournaments/:id/entry/checkout", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!ENTRY_FEES_ENABLED) { res.status(400).json({ error: "Entry fees aren't available. Join ChessScout Pro to play in Pro tournaments." }); return; }
    const id = String(req.params.id);
    const uid = req.user!.id;
    const [t] = rowsOf<TRow>(await db.execute(sql`${SELECT_T(uid)} WHERE t.id = ${id}`));
    if (!t || t.eligibility !== "pro") { res.status(400).json({ error: "This tournament doesn't take entry fees" }); return; }
    if (t.status !== "scheduled" && t.status !== "running") { res.status(400).json({ error: "This tournament isn't open" }); return; }
    if (t.format === "bracket" && t.status !== "scheduled") { res.status(400).json({ error: "Registration closed when the bracket started" }); return; }
    if (t.max_players && Number(t.players ?? 0) >= t.max_players) { res.status(400).json({ error: "This tournament is full" }); return; }
    if (await isUserPremium(uid)) { res.status(400).json({ error: "You're Pro, so you can join for free" }); return; }
    if (await hasPaidEntry(id, uid)) { res.status(400).json({ error: "You've already paid your entry" }); return; }
    const origin = (process.env.CORS_ORIGIN || "https://chessscout.net").replace(/\/$/, "");
    const url = await createEntryCheckout({ tid: id, userId: uid, email: req.user!.email ?? null, frontendOrigin: origin });
    res.json({ url });
  } catch (err) {
    logger.error({ err }, "[tournaments] entry checkout failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not start checkout" });
  }
});

router.post("/tournaments/:id/entry/confirm", requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "");
    if (!sessionId.startsWith("cs_")) { res.status(400).json({ error: "Invalid payment reference" }); return; }
    const r = await recordPaidEntry(sessionId, req.user!.id);
    if (!r || r.tournamentId !== String(req.params.id)) { res.json({ confirmed: false }); return; }
    res.json({ confirmed: true });
  } catch (err) {
    logger.error({ err }, "[tournaments] entry confirm failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not confirm the payment" });
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
      tournament: publicT(t, uid),
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
      organizer: uid && t.created_by === uid && t.eligibility === "pro" ? await organizerSummary(id) : null,
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
    const name = displayName(req);
    if (t.eligibility === "pro") {
      const premium = await isUserPremium(uid);
      if (!premium && !(await hasPaidEntry(id, uid))) {
        res.status(403).json({
          error: ENTRY_FEES_ENABLED ? "This is a Pro tournament. Join ChessScout Pro, or pay the one-time entry fee." : "This is a Pro tournament for ChessScout Pro members.",
          needsPro: true, entryFeeCents: ENTRY_FEES_ENABLED ? (t.entry_fee_cents ?? ENTRY_FEE_CENTS) : null,
        });
        return;
      }
      if (premium) await creditProSignupIfAny(id, uid, name);
    }
    if (!t.joined && t.max_players && Number(t.players ?? 0) >= t.max_players) { res.status(400).json({ error: "This tournament is full" }); return; }
    await db.execute(sql`
      INSERT INTO tournament_players (tournament_id, user_id, username) VALUES (${id}, ${uid}, ${name})
      ON CONFLICT (tournament_id, user_id) DO UPDATE SET withdrawn = false`);
    // Let the organizer of a player-made tournament know someone joined.
    if (!t.joined && t.created_by_name !== "ChessScout.net" && t.created_by && t.created_by !== uid) {
      const count = Number(t.players ?? 0) + 1;
      void notifyUser(t.created_by, {
        title: `${name} joined ${t.name}`,
        body: t.max_players ? `${count} of ${t.max_players} players` : `${count} player${count === 1 ? "" : "s"} so far`,
        url: `/tournaments/${id}`, kind: "tournament",
      }).catch(() => {});
    }
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
    res.json({ tournaments: rows.map((r) => publicT(r)), timeControls: liveTcs(), liveTimeControls: liveTcs(), dailyTimeControls: dailyTcs() });
  } catch (err) {
    logger.error({ err }, "[tournaments] admin list failed");
    res.status(500).json({ error: "Could not load tournaments" });
  }
});

router.post("/admin/tournaments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const v = parseCreate((req.body ?? {}) as CreateBody, { admin: true });
    if ("error" in v) { res.status(400).json({ error: v.error }); return; }
    const id = crypto.randomBytes(5).toString("hex");
    await db.execute(sql`
      INSERT INTO tournaments (id, name, description, time_control, mode, starts_at, ends_at, status, created_by, format, kind, eligibility, max_players, visibility, created_by_name)
      VALUES (${id}, ${v.name}, ${v.description}, ${v.timeControl}, ${v.mode}, ${v.starts.toISOString()}, ${v.ends ? v.ends.toISOString() : null},
        'scheduled', ${req.user!.id}, ${v.format}, ${v.kind}, ${v.eligibility}, ${v.maxPlayers}, 'public', 'ChessScout.net')`);
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
    void refundTournamentEntries(id);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[tournaments] cancel failed");
    res.status(500).json({ error: "Could not cancel" });
  }
});

export default router;
