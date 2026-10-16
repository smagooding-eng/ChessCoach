// Tournament engine: starts and ends tournaments on schedule, runs knockout
// brackets (live or daily) and pairs daily arenas. Live arenas are paired by
// liveServer (players have to be on the tournament screen).
//
// Formats
//   arena   - continuous pairing until the end time. Win 2, draw 1, loss 0.
//             live: paired among players on the tournament screen (liveServer)
//             daily: anyone joined without a game in progress gets a new one
//   bracket - single elimination, seeded by rating, byes for the top seeds.
//             Registration closes at the start; it ends when the final is
//             played. One game per match; a draw is replayed with colours
//             reversed, and if that's drawn too the higher seed goes through.
//             live: both players get SHOW_UP_MS to come to the tournament
//             screen; a no-show loses (neither shows -> higher seed)
//             daily: the game starts as soon as both players are known

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { notifyUser } from "./notify";
import {
  closeTournamentPool, notifyPoolStarted, tryStartBracketGame, isInTournamentPool,
  setTournamentGameHook, loadUserRating,
} from "./liveServer";
import { startGame as startDailyGame, setDailyFinishHook, isValidTimeControl as isDailyTc, DAILY_RATING_KEY } from "./correspondence";

const SHOW_UP_MS = 10 * 60 * 1000;            // live bracket: time to turn up for a match
const DAILY_ARENA_STOP_MS = 60 * 60 * 1000;   // daily arena: no new games in the last hour

function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] })?.rows) ?? [];
}

export interface TRow {
  id: string; name: string; time_control: string; mode: string; status: string;
  starts_at: string; ends_at: string | null; format: string; kind: string;
  eligibility: string; max_players: number | null; total_rounds: number | null;
}
interface MRow {
  id: number; tournament_id: string; round: number; slot: number;
  a_id: string | null; a_name: string | null; a_seed: number | null;
  b_id: string | null; b_name: string | null; b_seed: number | null;
  status: string; winner_id: string | null; game_id: string | null; games_played: number; deadline: string | null;
}

const url = (tid: string) => `/tournaments/${tid}`;
const notify = (userId: string, title: string, body: string, link: string) =>
  notifyUser(userId, { kind: "tournament", title, body, url: link }).catch(() => {});

export function roundLabel(round: number, total: number): string {
  const left = total - round;
  if (left === 0) return "Final";
  if (left === 1) return "Semifinal";
  if (left === 2) return "Quarterfinal";
  return `Round ${round}`;
}

// One tournament's bracket is updated by one task at a time.
const locks = new Map<string, Promise<void>>();
function withLock(tid: string, fn: () => Promise<void>): Promise<void> {
  const prev = locks.get(tid) ?? Promise.resolve();
  const next = prev.then(fn, fn).catch((err) => logger.warn({ err, tid }, "[tournament] task failed"));
  locks.set(tid, next);
  void next.finally(() => { if (locks.get(tid) === next) locks.delete(tid); });
  return next;
}

async function loadT(tid: string): Promise<TRow | null> {
  return rowsOf<TRow>(await db.execute(sql`SELECT * FROM tournaments WHERE id = ${tid}`))[0] ?? null;
}

async function players(tid: string): Promise<{ user_id: string; username: string }[]> {
  return rowsOf<{ user_id: string; username: string }>(await db.execute(sql`
    SELECT user_id, username FROM tournament_players WHERE tournament_id = ${tid} AND NOT withdrawn ORDER BY joined_at`));
}

async function notifyAll(tid: string, title: string, body: string) {
  for (const p of await players(tid)) void notify(p.user_id, title, body, url(tid));
}

/** Seed order for a bracket of n (power of two): 1 v n, then the halves interleave. */
function seedPositions(n: number): number[] {
  let arr = [1];
  while (arr.length < n) {
    const m = arr.length * 2 + 1;
    arr = arr.flatMap((s) => [s, m - s]);
  }
  return arr;
}

// ── Brackets ───────────────────────────────────────────────────────────────

async function buildBracket(t: TRow) {
  const list = await players(t.id);
  if (list.length < 2) {
    await db.execute(sql`UPDATE tournaments SET status = 'cancelled' WHERE id = ${t.id}`);
    for (const p of list) void notify(p.user_id, `${t.name} was cancelled`, "Not enough players signed up.", url(t.id));
    void import("./tournamentEntries").then((m) => m.refundTournamentEntries(t.id)).catch(() => {});
    return;
  }
  const ratingKey = t.kind === "daily" ? DAILY_RATING_KEY : t.time_control;
  const rated = await Promise.all(list.map(async (p) => ({ ...p, rating: (await loadUserRating(p.user_id, ratingKey)).rating })));
  rated.sort((a, b) => b.rating - a.rating);
  const seedOf = new Map(rated.map((p, i) => [p.user_id, i + 1]));
  let size = 2;
  while (size < rated.length) size *= 2;
  const total = Math.log2(size);
  await db.execute(sql`UPDATE tournaments SET total_rounds = ${total} WHERE id = ${t.id}`);
  for (let r = 1; r <= total; r++) {
    for (let slot = 0; slot < size / 2 ** r; slot++) {
      await db.execute(sql`INSERT INTO tournament_matches (tournament_id, round, slot) VALUES (${t.id}, ${r}, ${slot}) ON CONFLICT DO NOTHING`);
    }
  }
  // Ranked: first-round opponents have similar ratings (1 v 2, 3 v 4...).
  // Casual: a random draw. Byes (when the field isn't a power of two) are
  // spread across the bracket; in ranked they go to the highest rated.
  const order = t.mode === "ranked" ? [...rated] : [...rated].sort(() => Math.random() - 0.5);
  const slots = size / 2;
  const byes = size - order.length;
  const byeSlots = new Set(Array.from({ length: byes }, (_, i) => Math.floor((i * slots) / Math.max(1, byes))));
  let next = 0;
  for (let slot = 0; slot < slots; slot++) {
    const a = order[next++];
    const b = byeSlots.has(slot) ? undefined : order[next++];
    await db.execute(sql`
      UPDATE tournament_matches SET a_id = ${a?.user_id ?? null}, a_name = ${a?.username ?? null}, a_seed = ${a ? seedOf.get(a.user_id) ?? null : null},
        b_id = ${b?.user_id ?? null}, b_name = ${b?.username ?? null}, b_seed = ${b ? seedOf.get(b.user_id) ?? null : null}, updated_at = now()
      WHERE tournament_id = ${t.id} AND round = 1 AND slot = ${slot}`);
  }
  const t2 = { ...t, total_rounds: total };
  for (const m of await matches(t.id, 1)) {
    if (m.a_id && !m.b_id) await finishMatch(t2, m, m.a_id, m.a_name ?? "", "bye");
    else if (m.a_id && m.b_id) await readyMatch(t2, m);
  }
}

async function matches(tid: string, round?: number): Promise<MRow[]> {
  return rowsOf<MRow>(await db.execute(sql`
    SELECT * FROM tournament_matches WHERE tournament_id = ${tid} ${round ? sql`AND round = ${round}` : sql``} ORDER BY round, slot`));
}

/** Both players known: start (daily) or open the show-up window (live). */
async function readyMatch(t: TRow, m: MRow) {
  if (!m.a_id || !m.b_id) return;
  const label = roundLabel(m.round, t.total_rounds ?? 1);
  if (t.kind === "daily") {
    await startDailyMatchGame(t, m, label);
    return;
  }
  const deadline = new Date(Date.now() + SHOW_UP_MS);
  await db.execute(sql`UPDATE tournament_matches SET status = 'ready', deadline = ${deadline.toISOString()}, updated_at = now() WHERE id = ${m.id}`);
  const body = (opp: string) => `${label} vs ${opp}. Open the tournament within 10 minutes to play, or it's a forfeit.`;
  void notify(m.a_id, `${t.name}: your match is ready`, body(m.b_name ?? "your opponent"), url(t.id));
  void notify(m.b_id, `${t.name}: your match is ready`, body(m.a_name ?? "your opponent"), url(t.id));
}

/** Higher seed (a) has white in game 1; colours swap for a replay. */
const aHasWhite = (m: MRow) => m.games_played % 2 === 0;

async function startDailyMatchGame(t: TRow, m: MRow, label: string) {
  if (!m.a_id || !m.b_id || !isDailyTc(t.time_control)) return;
  const aWhite = aHasWhite(m);
  const [wId, wName, bId, bName] = aWhite
    ? [m.a_id, m.a_name ?? "", m.b_id, m.b_name ?? ""]
    : [m.b_id, m.b_name ?? "", m.a_id, m.a_name ?? ""];
  const g = await startDailyGame(wId, wName, bId, bName, t.time_control, t.mode === "ranked" ? "ranked" : "casual");
  await db.execute(sql`
    INSERT INTO tournament_games (tournament_id, game_id, white_user_id, black_user_id, white_username, black_username, kind, match_id)
    VALUES (${t.id}, ${g.id}, ${wId}, ${bId}, ${wName}, ${bName}, 'daily', ${m.id}) ON CONFLICT (game_id) DO NOTHING`);
  await db.execute(sql`
    UPDATE tournament_matches SET status = 'playing', game_id = ${g.id}, games_played = games_played + 1, deadline = NULL, updated_at = now()
    WHERE id = ${m.id}`);
  const replay = m.games_played > 0 ? " (replay after a draw, colours reversed)" : "";
  void notify(wId, `${t.name}: ${label} started`, `You're white vs ${bName}${replay}. Your move.`, `/daily/${g.id}`);
  void notify(bId, `${t.name}: ${label} started`, `You're black vs ${wName}${replay}. Waiting for their first move.`, `/daily/${g.id}`);
}

async function finishMatch(t: TRow, m: MRow, winnerId: string, winnerName: string, note: string | null) {
  await db.execute(sql`
    UPDATE tournament_matches SET status = 'done', winner_id = ${winnerId}, winner_name = ${winnerName}, note = ${note}, deadline = NULL, updated_at = now()
    WHERE id = ${m.id}`);
  const total = t.total_rounds ?? 1;
  const loserId = winnerId === m.a_id ? m.b_id : m.a_id;
  if (m.round >= total) {
    await db.execute(sql`UPDATE tournaments SET status = 'finished', winner_user_id = ${winnerId}, winner_username = ${winnerName}, ends_at = COALESCE(ends_at, now()) WHERE id = ${t.id}`);
    closeTournamentPool(t.id);
    await notifyAll(t.id, `${winnerName} won ${t.name}`, "The final is over. See the full bracket.");
    return;
  }
  if (loserId && note !== "bye") void notify(loserId, `${t.name}: knocked out`, `${winnerName} goes through. Thanks for playing!`, url(t.id));
  // Into the next round.
  const nextSlot = Math.floor(m.slot / 2);
  const seed = winnerId === m.a_id ? m.a_seed : m.b_seed;
  if (m.slot % 2 === 0) {
    await db.execute(sql`UPDATE tournament_matches SET a_id = ${winnerId}, a_name = ${winnerName}, a_seed = ${seed}, updated_at = now()
      WHERE tournament_id = ${t.id} AND round = ${m.round + 1} AND slot = ${nextSlot}`);
  } else {
    await db.execute(sql`UPDATE tournament_matches SET b_id = ${winnerId}, b_name = ${winnerName}, b_seed = ${seed}, updated_at = now()
      WHERE tournament_id = ${t.id} AND round = ${m.round + 1} AND slot = ${nextSlot}`);
  }
  const [next] = rowsOf<MRow>(await db.execute(sql`
    SELECT * FROM tournament_matches WHERE tournament_id = ${t.id} AND round = ${m.round + 1} AND slot = ${nextSlot}`));
  if (next) {
    // Keep the higher seed as "a" (white in game 1).
    if (next.a_id && next.b_id && (next.b_seed ?? 99999) < (next.a_seed ?? 99999)) {
      await db.execute(sql`UPDATE tournament_matches SET
        a_id = ${next.b_id}, a_name = ${next.b_name}, a_seed = ${next.b_seed},
        b_id = ${next.a_id}, b_name = ${next.a_name}, b_seed = ${next.a_seed} WHERE id = ${next.id}`);
      [next.a_id, next.b_id, next.a_name, next.b_name, next.a_seed, next.b_seed] = [next.b_id, next.a_id, next.b_name, next.a_name, next.b_seed, next.a_seed];
    }
    if (next.a_id && next.b_id && next.status === "waiting") await readyMatch(t, next);
    else if (next.a_id || next.b_id) {
      void notify(winnerId, `${t.name}: through to the ${roundLabel(m.round + 1, total).toLowerCase()}`, "We'll tell you when your next opponent is known.", url(t.id));
    }
  }
}

/** A bracket game ended (live or daily). */
async function onBracketGame(tid: string, gameId: string, result: "white" | "black" | "draw") {
  await withLock(tid, async () => {
    const t = await loadT(tid);
    if (!t || t.status !== "running") return;
    const [tg] = rowsOf<{ match_id: number | null; white_user_id: string; black_user_id: string; white_username: string; black_username: string }>(
      await db.execute(sql`SELECT match_id, white_user_id, black_user_id, white_username, black_username FROM tournament_games WHERE game_id = ${gameId}`));
    if (!tg?.match_id) return;
    const [m] = rowsOf<MRow>(await db.execute(sql`SELECT * FROM tournament_matches WHERE id = ${tg.match_id}`));
    if (!m || m.status === "done" || m.game_id !== gameId) return;
    if (result !== "draw") {
      const winnerId = result === "white" ? tg.white_user_id : tg.black_user_id;
      const winnerName = result === "white" ? tg.white_username : tg.black_username;
      await finishMatch(t, m, winnerId, winnerName, null);
      return;
    }
    if (m.games_played < 2) {
      // Replay with colours reversed.
      const fresh = { ...m, status: "waiting" };
      if (t.kind === "daily") await startDailyMatchGame(t, fresh, roundLabel(m.round, t.total_rounds ?? 1));
      else {
        await db.execute(sql`UPDATE tournament_matches SET status = 'waiting', game_id = NULL WHERE id = ${m.id}`);
        await readyMatch(t, fresh);
      }
      return;
    }
    // Two draws: higher seed through.
    await finishMatch(t, m, m.a_id!, m.a_name ?? "", "two draws: higher seed goes through");
  });
}

/** Live bracket: start matches whose players are both here; settle no-shows. */
async function progressLiveBracket(t: TRow) {
  const ready = rowsOf<MRow>(await db.execute(sql`
    SELECT * FROM tournament_matches WHERE tournament_id = ${t.id} AND status = 'ready'`));
  for (const m of ready) {
    if (!m.a_id || !m.b_id) continue;
    const gameId = await tryStartBracketGame(t.id, m.id, m.a_id, m.b_id, aHasWhite(m));
    if (gameId) {
      await db.execute(sql`UPDATE tournament_matches SET status = 'playing', game_id = ${gameId}, games_played = games_played + 1, deadline = NULL WHERE id = ${m.id}`);
      continue;
    }
    if (m.deadline && new Date(m.deadline).getTime() < Date.now()) {
      const aHere = isInTournamentPool(t.id, m.a_id);
      const bHere = isInTournamentPool(t.id, m.b_id);
      await withLock(t.id, async () => {
        if (aHere && !bHere) await finishMatch(t, m, m.a_id!, m.a_name ?? "", "opponent didn't show");
        else if (bHere && !aHere) await finishMatch(t, m, m.b_id!, m.b_name ?? "", "opponent didn't show");
        else if (!aHere && !bHere) await finishMatch(t, m, m.a_id!, m.a_name ?? "", "neither player showed: higher seed goes through");
      });
    }
  }
}

/** A player leaves a running bracket: their opponent goes through. */
export async function withdrawFromBracket(tid: string, userId: string) {
  await withLock(tid, async () => {
    const t = await loadT(tid);
    if (!t || t.format !== "bracket" || t.status !== "running") return;
    const open = rowsOf<MRow>(await db.execute(sql`
      SELECT * FROM tournament_matches WHERE tournament_id = ${tid} AND status <> 'done' AND (a_id = ${userId} OR b_id = ${userId})`));
    for (const m of open) {
      const other = m.a_id === userId ? { id: m.b_id, name: m.b_name } : { id: m.a_id, name: m.a_name };
      if (other.id) await finishMatch(t, m, other.id, other.name ?? "", "opponent withdrew");
    }
  });
}

// ── Arena scoring and daily arena pairing ─────────────────────────────────

async function scoreArena(tid: string, whiteId: string, blackId: string, result: "white" | "black" | "draw") {
  const sides = [
    { id: whiteId, pts: result === "white" ? 2 : result === "draw" ? 1 : 0, w: +(result === "white"), d: +(result === "draw"), l: +(result === "black") },
    { id: blackId, pts: result === "black" ? 2 : result === "draw" ? 1 : 0, w: +(result === "black"), d: +(result === "draw"), l: +(result === "white") },
  ];
  for (const s of sides) {
    await db.execute(sql`UPDATE tournament_players SET score = score + ${s.pts}, games = games + 1,
      wins = wins + ${s.w}, draws = draws + ${s.d}, losses = losses + ${s.l}
      WHERE tournament_id = ${tid} AND user_id = ${s.id}`);
  }
}

async function pairDailyArena(t: TRow) {
  if (!isDailyTc(t.time_control)) return;
  if (t.ends_at && new Date(t.ends_at).getTime() - Date.now() < DAILY_ARENA_STOP_MS) return;
  const busy = new Set(rowsOf<{ white_user_id: string; black_user_id: string }>(await db.execute(sql`
    SELECT white_user_id, black_user_id FROM tournament_games WHERE tournament_id = ${t.id} AND result IS NULL`))
    .flatMap((g) => [g.white_user_id, g.black_user_id]));
  const free = rowsOf<{ user_id: string; username: string; score: number }>(await db.execute(sql`
    SELECT user_id, username, score FROM tournament_players WHERE tournament_id = ${t.id} AND NOT withdrawn
    ORDER BY score DESC, joined_at`)).filter((p) => !busy.has(p.user_id));
  if (free.length < 2) return;
  // Ranked: neighbours by daily rating; casual: random.
  if (t.mode === "ranked") {
    const r = new Map(await Promise.all(free.map(async (p) => [p.user_id, (await loadUserRating(p.user_id, DAILY_RATING_KEY)).rating] as const)));
    free.sort((a, b) => (r.get(b.user_id) ?? 0) - (r.get(a.user_id) ?? 0));
  } else {
    free.sort(() => Math.random() - 0.5);
  }
  const lastRows = rowsOf<{ u: string; white_user_id: string; black_user_id: string }>(await db.execute(sql`
    SELECT DISTINCT ON (u) u, white_user_id, black_user_id FROM (
      SELECT white_user_id AS u, white_user_id, black_user_id, started_at FROM tournament_games WHERE tournament_id = ${t.id}
      UNION ALL
      SELECT black_user_id AS u, white_user_id, black_user_id, started_at FROM tournament_games WHERE tournament_id = ${t.id}
    ) x ORDER BY u, started_at DESC`));
  const last = new Map<string, { opp: string; white: boolean }>();
  for (const r of lastRows) {
    last.set(r.u, { opp: r.white_user_id === r.u ? r.black_user_id : r.white_user_id, white: r.white_user_id === r.u });
  }
  const used = new Set<string>();
  for (let i = 0; i < free.length; i++) {
    const a = free[i];
    if (used.has(a.user_id)) continue;
    let b = free.slice(i + 1).find((p) => !used.has(p.user_id) && last.get(a.user_id)?.opp !== p.user_id);
    // only a repeat opponent left: fine once they're the only two free
    if (!b && free.filter((p) => !used.has(p.user_id)).length === 2) b = free.slice(i + 1).find((p) => !used.has(p.user_id));
    if (!b) continue;
    used.add(a.user_id); used.add(b.user_id);
    const aWhite = last.get(a.user_id)?.white === true ? false : last.get(b.user_id)?.white === true ? true : Math.random() < 0.5;
    const [w, bl] = aWhite ? [a, b] : [b, a];
    const g = await startDailyGame(w.user_id, w.username, bl.user_id, bl.username, t.time_control, t.mode === "ranked" ? "ranked" : "casual");
    await db.execute(sql`
      INSERT INTO tournament_games (tournament_id, game_id, white_user_id, black_user_id, white_username, black_username, kind)
      VALUES (${t.id}, ${g.id}, ${w.user_id}, ${bl.user_id}, ${w.username}, ${bl.username}, 'daily') ON CONFLICT (game_id) DO NOTHING`);
    void notify(w.user_id, `${t.name}: new game`, `You're white vs ${bl.username}. Your move.`, `/daily/${g.id}`);
    void notify(bl.user_id, `${t.name}: new game`, `You're black vs ${w.username}.`, `/daily/${g.id}`);
  }
}

// ── Schedule ───────────────────────────────────────────────────────────────

async function finishArena(t: { id: string; name: string }) {
  const [top] = rowsOf<{ user_id: string; username: string }>(await db.execute(sql`
    SELECT user_id, username FROM tournament_players WHERE tournament_id = ${t.id} AND games > 0
    ORDER BY score DESC, wins DESC, games ASC LIMIT 1`));
  if (top) await db.execute(sql`UPDATE tournaments SET winner_user_id = ${top.user_id}, winner_username = ${top.username} WHERE id = ${t.id}`);
  closeTournamentPool(t.id);
  await notifyAll(t.id, `${t.name} is over`, top ? `${top.username} wins. See the final standings.` : "See the final standings.");
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const started = rowsOf<TRow>(await db.execute(sql`
      UPDATE tournaments SET status = 'running' WHERE status = 'scheduled' AND starts_at <= now() RETURNING *`));
    for (const t of started) {
      if (t.format === "bracket") {
        await withLock(t.id, () => buildBracket(t));
        const now = await loadT(t.id);
        if (now?.status === "running") await notifyAll(t.id, `${t.name} has started`, "The bracket is set. Check your first match.");
      } else {
        await notifyAll(t.id, `${t.name} has started`, t.kind === "daily" ? "Your first game is being paired." : "Tap to get your first pairing.");
        if (t.kind === "live") notifyPoolStarted(t.id);
      }
    }
    const ended = rowsOf<{ id: string; name: string }>(await db.execute(sql`
      UPDATE tournaments SET status = 'finished'
      WHERE status = 'running' AND format = 'arena' AND ends_at IS NOT NULL AND ends_at <= now() RETURNING id, name`));
    for (const t of ended) await finishArena(t);

    const live = rowsOf<TRow>(await db.execute(sql`SELECT * FROM tournaments WHERE status = 'running' AND (format = 'bracket' OR kind = 'daily')`));
    for (const t of live) {
      if (t.format === "bracket" && t.kind === "live") await progressLiveBracket(t);
      else if (t.format === "arena" && t.kind === "daily") await withLock(t.id, () => pairDailyArena(t));
    }
  } catch (err) {
    logger.warn({ err }, "[tournament] tick failed");
  } finally {
    running = false;
  }
}

let started = false;
export function startTournamentEngine() {
  if (started) return;
  started = true;
  // Live bracket games report here; live arena games are scored in liveServer.
  setTournamentGameHook((tid, gameId, result) => onBracketGame(tid, gameId, result));
  // Every finished daily game: is it a tournament game?
  setDailyFinishHook(async (g) => {
    const [tg] = rowsOf<{ tournament_id: string; white_user_id: string; black_user_id: string }>(await db.execute(sql`
      UPDATE tournament_games SET result = ${g.result ?? "draw"}, termination = ${g.termination ?? null}, finished_at = now()
      WHERE game_id = ${g.id} AND result IS NULL RETURNING tournament_id, white_user_id, black_user_id`));
    if (!tg) return;
    const t = await loadT(tg.tournament_id);
    if (!t) return;
    const result = (g.result === "white" || g.result === "black") ? g.result : "draw";
    if (t.format === "bracket") await onBracketGame(t.id, g.id, result);
    else await scoreArena(t.id, tg.white_user_id, tg.black_user_id, result);
  });
  setInterval(() => { void tick(); }, 5000).unref();
}
