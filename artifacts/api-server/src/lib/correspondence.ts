// Daily games (correspondence): 1, 3 or 7 days per move.
//
// Unlike live play there's no connection to hold state in, so the database
// row IS the game. Matchmaking is a persistent queue -- it's fine to wait
// hours for an opponent, and the player gets a push notification when one is
// found, when it's their move, when time is running low and when the game
// ends. No bots: daily games are always between two real players.
//
// Ranked daily games use one "daily" Glicko-2 rating (stored alongside the
// live ratings in user_live_ratings). Every finished game is also written to
// the main games table for both players, so it shows in Games and feeds
// Analysis like an imported game.

import { Chess } from "chess.js";
import {
  db, gamesTable, correspondenceGamesTable, correspondenceQueueTable, type CorrespondenceGame,
} from "@workspace/db";
import { eq, and, or, ne, desc } from "drizzle-orm";
import { sendPushToUser } from "./pushNotifications";
import { logger } from "./logger";
import { updateRating } from "./glicko2";
import { loadUserRating, saveUserRating, seedRatingFromImports } from "./liveServer";

export type CorrespondenceTimeControlId = "corr_1d" | "corr_3d" | "corr_7d";
export type DailyMode = "casual" | "ranked";

const DAY = 24 * 60 * 60 * 1000;
const TIME_CONTROLS: Record<CorrespondenceTimeControlId, { ms: number; label: string; pgn: string }> = {
  corr_1d: { ms: 1 * DAY, label: "1 day", pgn: "1/86400" },
  corr_3d: { ms: 3 * DAY, label: "3 days", pgn: "1/259200" },
  corr_7d: { ms: 7 * DAY, label: "7 days", pgn: "1/604800" },
};

/** All daily time controls share one rating. */
export const DAILY_RATING_KEY = "daily";

export function listCorrespondenceTimeControls() {
  return (Object.keys(TIME_CONTROLS) as CorrespondenceTimeControlId[]).map((id) => ({ id, ms: TIME_CONTROLS[id].ms, label: TIME_CONTROLS[id].label }));
}

export function isValidTimeControl(id: string): id is CorrespondenceTimeControlId {
  return id in TIME_CONTROLS;
}

export function dailyLabel(id: string): string {
  return TIME_CONTROLS[id as CorrespondenceTimeControlId]?.label ?? id;
}

const gameUrl = (id: string) => `/daily/${id}`;
const push = (userId: string, title: string, body: string, url: string) => {
  sendPushToUser(userId, { title, body, url })
    .catch((err) => logger.warn({ err, userId, title }, "[daily] push failed"));
};

// ── Matchmaking ─────────────────────────────────────────────────────────────

// Rating window for ranked pairing: starts at ±200 and widens by 100 for
// every hour the longer-waiting player has been queued, so nobody waits
// forever just because there's no one near their rating. Casual pairs with
// anyone at the same time control.
function rankedWindow(waitedMs: number): number {
  return 200 + Math.floor(waitedMs / (60 * 60 * 1000)) * 100;
}

export interface CreateGameResult {
  status: "matched" | "queued";
  game?: CorrespondenceGame;
  color?: "white" | "black";
}

export async function createOrJoinCorrespondenceGame(userId: string, username: string, timeControlId: string, mode: DailyMode = "casual"): Promise<CreateGameResult> {
  if (!isValidTimeControl(timeControlId)) throw new Error(`Invalid time control: ${timeControlId}`);
  if (mode !== "casual" && mode !== "ranked") throw new Error("Invalid mode");

  const me = await seedRatingFromImports(userId, DAILY_RATING_KEY);
  const myRating = Math.round(me.rating);

  const waiting = await db.select().from(correspondenceQueueTable)
    .where(and(
      eq(correspondenceQueueTable.timeControl, timeControlId),
      eq(correspondenceQueueTable.mode, mode),
      ne(correspondenceQueueTable.userId, userId),
    ))
    .orderBy(correspondenceQueueTable.joinedAt);

  const opponent = waiting.find((w) => {
    if (mode === "casual") return true;
    const waited = Date.now() - new Date(w.joinedAt).getTime();
    return Math.abs((w.rating ?? 1200) - myRating) <= rankedWindow(waited);
  });

  if (opponent) {
    // Claim the queued player; if someone else got them first, fall through and queue.
    const claimed = await db.delete(correspondenceQueueTable).where(eq(correspondenceQueueTable.id, opponent.id)).returning({ id: correspondenceQueueTable.id });
    if (claimed.length > 0) {
      await leaveQueue(userId, timeControlId, mode);
      const game = await pairPlayers(
        { userId, username },
        { userId: opponent.userId, username: opponent.username },
        timeControlId, mode, "first",
      );
      return { status: "matched", game, color: game.whiteUserId === userId ? "white" : "black" };
    }
  }

  // Already queued for this exact control/mode? Keep their place in line.
  const own = await db.select().from(correspondenceQueueTable)
    .where(and(
      eq(correspondenceQueueTable.userId, userId),
      eq(correspondenceQueueTable.timeControl, timeControlId),
      eq(correspondenceQueueTable.mode, mode),
    )).limit(1);
  if (own.length === 0) {
    await db.insert(correspondenceQueueTable).values({ userId, username, timeControl: timeControlId, mode, rating: myRating });
  }
  return { status: "queued" };
}

// Starts a game between two players and notifies them. `notify` says who
// needs a push: the one who just clicked "Find opponent" is already looking
// at the game, so only the other ("second") is told; a sweep pairing two
// waiting players tells both.
async function pairPlayers(
  a: { userId: string; username: string },
  b: { userId: string; username: string },
  timeControlId: CorrespondenceTimeControlId, mode: DailyMode, notify: "first" | "both",
): Promise<CorrespondenceGame> {
  const aWhite = Math.random() < 0.5;
  const game = aWhite
    ? await startGame(a.userId, a.username, b.userId, b.username, timeControlId, mode)
    : await startGame(b.userId, b.username, a.userId, a.username, timeControlId, mode);
  const tell = (who: { userId: string }, opp: string) => {
    const white = game.whiteUserId === who.userId;
    push(who.userId, "Daily game found", `You're playing ${opp} (${dailyLabel(timeControlId)} per move). You have ${white ? "White — your move!" : "Black."}`, gameUrl(game.id));
  };
  tell(b, a.username);
  if (notify === "both") tell(a, b.username);
  return game;
}

// Pair players who are both waiting (e.g. queued at the same moment, or a
// ranked window that has since widened). Run by the sweep.
async function pairWaiting(): Promise<void> {
  const all = await db.select().from(correspondenceQueueTable).orderBy(correspondenceQueueTable.joinedAt);
  const used = new Set<string>();
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      if (used.has(b.id) || b.userId === a.userId) continue;
      if (b.timeControl !== a.timeControl || b.mode !== a.mode) continue;
      if (a.mode === "ranked") {
        const waited = Date.now() - new Date(a.joinedAt).getTime();
        if (Math.abs((a.rating ?? 1200) - (b.rating ?? 1200)) > rankedWindow(waited)) continue;
      }
      const gone = await db.delete(correspondenceQueueTable)
        .where(or(eq(correspondenceQueueTable.id, a.id), eq(correspondenceQueueTable.id, b.id)))
        .returning({ id: correspondenceQueueTable.id });
      used.add(a.id); used.add(b.id);
      if (gone.length !== 2 || !isValidTimeControl(a.timeControl)) break; // someone left meanwhile
      await pairPlayers({ userId: a.userId, username: a.username }, { userId: b.userId, username: b.username }, a.timeControl, a.mode === "ranked" ? "ranked" : "casual", "both");
      break;
    }
  }
}

export async function startGame(
  whiteUserId: string, whiteUsername: string,
  blackUserId: string, blackUsername: string,
  timeControlId: CorrespondenceTimeControlId, mode: DailyMode,
): Promise<CorrespondenceGame> {
  const chess = new Chess();
  const bankMs = TIME_CONTROLS[timeControlId].ms;
  let whiteRatingBefore: number | null = null;
  let blackRatingBefore: number | null = null;
  if (mode === "ranked") {
    whiteRatingBefore = Math.round((await seedRatingFromImports(whiteUserId, DAILY_RATING_KEY)).rating);
    blackRatingBefore = Math.round((await seedRatingFromImports(blackUserId, DAILY_RATING_KEY)).rating);
  }
  const [game] = await db.insert(correspondenceGamesTable).values({
    timeControl: timeControlId,
    mode,
    whiteUserId, blackUserId, whiteUsername, blackUsername,
    pgn: "",
    fen: chess.fen(),
    turnUserId: whiteUserId,
    whiteBankMs: bankMs,
    blackBankMs: bankMs,
    whiteRatingBefore,
    blackRatingBefore,
  }).returning();
  return game;
}

export async function leaveQueue(userId: string, timeControlId: string, mode?: string): Promise<void> {
  const conds = [eq(correspondenceQueueTable.userId, userId), eq(correspondenceQueueTable.timeControl, timeControlId)];
  if (mode) conds.push(eq(correspondenceQueueTable.mode, mode));
  await db.delete(correspondenceQueueTable).where(and(...conds));
}

export async function listQueueForUser(userId: string) {
  return db.select().from(correspondenceQueueTable).where(eq(correspondenceQueueTable.userId, userId));
}

// ── Reading games ───────────────────────────────────────────────────────────

export async function listGamesForUser(userId: string): Promise<{ active: CorrespondenceGame[]; finished: CorrespondenceGame[] }> {
  await applyTimeoutsForUser(userId);
  const mine = or(eq(correspondenceGamesTable.whiteUserId, userId), eq(correspondenceGamesTable.blackUserId, userId));
  const active = await db.select().from(correspondenceGamesTable)
    .where(and(eq(correspondenceGamesTable.status, "active"), mine))
    .orderBy(correspondenceGamesTable.lastMoveAt);
  const finished = await db.select().from(correspondenceGamesTable)
    .where(and(eq(correspondenceGamesTable.status, "finished"), mine))
    .orderBy(desc(correspondenceGamesTable.finishedAt))
    .limit(20);
  return { active, finished };
}

export async function getGame(gameId: string, userId: string): Promise<CorrespondenceGame | null> {
  const [game] = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.id, gameId));
  if (!game) return null;
  if (game.whiteUserId !== userId && game.blackUserId !== userId) return null;
  if (game.status === "active" && await checkAndApplyTimeout(game)) return getGame(gameId, userId);
  return game;
}

// ── Finishing a game (one place for every ending) ──────────────────────────

type Result = "white" | "black" | "draw";

async function finishGame(game: CorrespondenceGame, result: Result, termination: string, pgn: string, fen: string): Promise<CorrespondenceGame> {
  // Only the first caller finishes it (guards against a timeout sweep and a
  // move landing at the same moment).
  const [claimed] = await db.update(correspondenceGamesTable).set({
    status: "finished", result, termination, finishedAt: new Date(), pgn, fen, drawOfferFrom: null,
  }).where(and(eq(correspondenceGamesTable.id, game.id), eq(correspondenceGamesTable.status, "active"))).returning();
  if (!claimed) {
    const [cur] = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.id, game.id));
    return cur;
  }

  const updates: Partial<typeof correspondenceGamesTable.$inferInsert> = {};
  const wScore = result === "white" ? 1 : result === "draw" ? 0.5 : 0;

  // Ranked: update both daily ratings.
  let whiteAfter: number | null = null;
  let blackAfter: number | null = null;
  if (claimed.mode === "ranked") {
    try {
      const w = await loadUserRating(claimed.whiteUserId, DAILY_RATING_KEY);
      const b = await loadUserRating(claimed.blackUserId, DAILY_RATING_KEY);
      const newW = updateRating({ rating: w.rating, rd: w.rd, vol: w.vol }, { rating: b.rating, rd: b.rd, vol: b.vol }, wScore);
      const newB = updateRating({ rating: b.rating, rd: b.rd, vol: b.vol }, { rating: w.rating, rd: w.rd, vol: w.vol }, 1 - wScore);
      await saveUserRating(claimed.whiteUserId, DAILY_RATING_KEY, newW.rating, newW.rd, newW.vol, 1);
      await saveUserRating(claimed.blackUserId, DAILY_RATING_KEY, newB.rating, newB.rd, newB.vol, 1);
      whiteAfter = Math.round(newW.rating);
      blackAfter = Math.round(newB.rating);
      updates.whiteRatingAfter = whiteAfter;
      updates.blackRatingAfter = blackAfter;
      // "before" = rating just before THIS result (other daily games may have
      // finished since this one started), so after - before is this game's change.
      updates.whiteRatingBefore = Math.round(w.rating);
      updates.blackRatingBefore = Math.round(b.rating);
    } catch (err) {
      logger.warn({ err, gameId: claimed.id }, "[daily] rating update failed");
    }
  }

  // Into the main games table for both players (Games list, Analysis).
  const tc = TIME_CONTROLS[claimed.timeControl as CorrespondenceTimeControlId];
  const pgnChess = new Chess();
  try { if (pgn) pgnChess.loadPgn(pgn); } catch { /* keep empty */ }
  const resultTag = result === "white" ? "1-0" : result === "black" ? "0-1" : "1/2-1/2";
  const wElo = claimed.whiteRatingBefore ?? Math.round((await loadUserRating(claimed.whiteUserId, DAILY_RATING_KEY)).rating);
  const bElo = claimed.blackRatingBefore ?? Math.round((await loadUserRating(claimed.blackUserId, DAILY_RATING_KEY)).rating);
  pgnChess.header(
    "Event", `ChessScout ${claimed.mode === "ranked" ? "Ranked" : "Casual"} Daily (${tc?.label ?? ""})`,
    "Site", "ChessScout.net",
    "Date", new Date(claimed.startedAt).toISOString().slice(0, 10).replace(/-/g, "."),
    "White", claimed.whiteUsername,
    "Black", claimed.blackUsername,
    "Result", resultTag,
    "WhiteElo", String(wElo),
    "BlackElo", String(bElo),
    "TimeControl", tc?.pgn ?? "-",
    "Termination", termination,
  );
  const fullPgn = pgnChess.pgn();
  for (const side of ["white", "black"] as const) {
    const isWhite = side === "white";
    const username = isWhite ? claimed.whiteUsername : claimed.blackUsername;
    const won = (result === "white" && isWhite) || (result === "black" && !isWhite);
    const lost = (result === "black" && isWhite) || (result === "white" && !isWhite);
    try {
      const inserted = await db.insert(gamesTable).values({
        username: username.toLowerCase(),
        pgn: fullPgn,
        whiteUsername: claimed.whiteUsername,
        blackUsername: claimed.blackUsername,
        whiteRating: wElo,
        blackRating: bElo,
        result: won ? "win" : lost ? "loss" : "draw",
        timeControl: tc?.pgn ?? claimed.timeControl,
        opening: null,
        eco: null,
        playedAt: new Date(claimed.startedAt),
        url: null,
        platform: "chessscout",
      }).returning({ id: gamesTable.id });
      const id = inserted[0]?.id;
      if (typeof id === "number") {
        if (isWhite) updates.whiteGamesId = id; else updates.blackGamesId = id;
      }
    } catch (err) {
      logger.warn({ err, gameId: claimed.id, side }, "[daily] games-table insert failed");
    }
  }

  let final = claimed;
  if (Object.keys(updates).length > 0) {
    const [u] = await db.update(correspondenceGamesTable).set(updates).where(eq(correspondenceGamesTable.id, claimed.id)).returning();
    if (u) final = u;
  }

  // Tell both players.
  const how: Record<string, string> = {
    checkmate: "by checkmate", resignation: "by resignation", timeout: "on time", stalemate: "by stalemate",
    draw_agreement: "by agreement", draw_repetition: "by repetition", draw_insufficient: "by insufficient material", draw_50: "by the 50-move rule",
  };
  for (const side of ["white", "black"] as const) {
    const isWhite = side === "white";
    const userId = isWhite ? final.whiteUserId : final.blackUserId;
    const opp = isWhite ? final.blackUsername : final.whiteUsername;
    const won = (result === "white" && isWhite) || (result === "black" && !isWhite);
    const title = result === "draw" ? "Daily game drawn" : won ? "You won your daily game" : "Daily game lost";
    const before = isWhite ? (updates.whiteRatingBefore ?? final.whiteRatingBefore) : (updates.blackRatingBefore ?? final.blackRatingBefore);
    const after = isWhite ? whiteAfter : blackAfter;
    const delta = before != null && after != null ? after - before : null;
    const ratingNote = delta != null ? ` Rating ${delta >= 0 ? "+" : ""}${delta}.` : "";
    push(userId, title, `vs ${opp}, ${how[termination] ?? termination}.${ratingNote}`, gameUrl(final.id));
  }
  return final;
}

// ── Clocks ──────────────────────────────────────────────────────────────────

// Each move resets the mover's allowance to the full time control; a player
// loses if their current allowance runs out. Evaluated whenever a game is
// read, and by the sweep below every few minutes (so timeouts and low-time
// reminders happen even if nobody opens the game).
async function checkAndApplyTimeout(game: CorrespondenceGame): Promise<boolean> {
  const elapsedMs = Date.now() - new Date(game.lastMoveAt).getTime();
  const isWhiteTurn = game.turnUserId === game.whiteUserId;
  const bankMs = isWhiteTurn ? game.whiteBankMs : game.blackBankMs;
  if (elapsedMs <= bankMs) return false;
  await finishGame(game, isWhiteTurn ? "black" : "white", "timeout", game.pgn, game.fen);
  return true;
}

async function applyTimeoutsForUser(userId: string): Promise<void> {
  const activeGames = await db.select().from(correspondenceGamesTable)
    .where(and(
      eq(correspondenceGamesTable.status, "active"),
      or(eq(correspondenceGamesTable.whiteUserId, userId), eq(correspondenceGamesTable.blackUserId, userId)),
    ));
  for (const game of activeGames) await checkAndApplyTimeout(game);
}

const LOW_TIME_FRACTION = 0.15; // remind when under 15% of the allowance is left (e.g. ~3.6h of a 1-day game)

async function sweep(): Promise<void> {
  try { await pairWaiting(); } catch (err) { logger.warn({ err }, "[daily] queue pairing failed"); }
  const active = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.status, "active"));
  for (const game of active) {
    try {
      if (await checkAndApplyTimeout(game)) continue;
      const isWhiteTurn = game.turnUserId === game.whiteUserId;
      const bankMs = isWhiteTurn ? game.whiteBankMs : game.blackBankMs;
      const leftMs = bankMs - (Date.now() - new Date(game.lastMoveAt).getTime());
      const alreadyReminded = game.lowTimeNotifiedAt && new Date(game.lowTimeNotifiedAt).getTime() > new Date(game.lastMoveAt).getTime();
      if (!alreadyReminded && leftMs < bankMs * LOW_TIME_FRACTION) {
        await db.update(correspondenceGamesTable).set({ lowTimeNotifiedAt: new Date() }).where(eq(correspondenceGamesTable.id, game.id));
        const hours = Math.max(1, Math.round(leftMs / (60 * 60 * 1000)));
        const opp = isWhiteTurn ? game.blackUsername : game.whiteUsername;
        push(game.turnUserId, "Time running low", `About ${hours}h left to move in your daily game vs ${opp}.`, gameUrl(game.id));
      }
    } catch (err) {
      logger.warn({ err, gameId: game.id }, "[daily] sweep failed for game");
    }
  }
}

export function startDailySweep(): void {
  const run = () => { sweep().catch((err) => logger.warn({ err }, "[daily] sweep failed")); };
  setTimeout(run, 30 * 1000).unref?.();
  setInterval(run, 5 * 60 * 1000).unref?.();
}

// ── Moves, resign, draws ────────────────────────────────────────────────────

export interface MoveResult {
  success: boolean;
  error?: string;
  game?: CorrespondenceGame;
}

export async function makeMove(gameId: string, userId: string, san: string): Promise<MoveResult> {
  const [game] = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.id, gameId));
  if (!game) return { success: false, error: "Game not found" };
  if (game.status !== "active") return { success: false, error: "This game has already finished" };
  if (await checkAndApplyTimeout(game)) return { success: false, error: "This game ended on time" };
  if (game.turnUserId !== userId) return { success: false, error: "It's not your turn" };
  const isWhite = game.whiteUserId === userId;

  const chess = new Chess();
  if (game.pgn) chess.loadPgn(game.pgn);
  let moveResult;
  try { moveResult = chess.move(san); } catch { moveResult = null; }
  if (!moveResult) return { success: false, error: "Illegal move" };

  if (chess.isCheckmate()) return { success: true, game: await finishGame(game, isWhite ? "white" : "black", "checkmate", chess.pgn(), chess.fen()) };
  if (chess.isStalemate()) return { success: true, game: await finishGame(game, "draw", "stalemate", chess.pgn(), chess.fen()) };
  if (chess.isThreefoldRepetition()) return { success: true, game: await finishGame(game, "draw", "draw_repetition", chess.pgn(), chess.fen()) };
  if (chess.isInsufficientMaterial()) return { success: true, game: await finishGame(game, "draw", "draw_insufficient", chess.pgn(), chess.fen()) };
  if (chess.isDraw()) return { success: true, game: await finishGame(game, "draw", "draw_50", chess.pgn(), chess.fen()) };

  const nextTurnUserId = isWhite ? game.blackUserId : game.whiteUserId;
  const bankMs = TIME_CONTROLS[game.timeControl as CorrespondenceTimeControlId]?.ms ?? game.whiteBankMs;
  const updates: Partial<typeof correspondenceGamesTable.$inferInsert> = {
    pgn: chess.pgn(),
    fen: chess.fen(),
    turnUserId: nextTurnUserId,
    lastMoveAt: new Date(),
    // a standing offer from the opponent is declined by moving
    drawOfferFrom: game.drawOfferFrom === (isWhite ? "black" : "white") ? null : game.drawOfferFrom,
  };
  if (isWhite) updates.whiteBankMs = bankMs; else updates.blackBankMs = bankMs;

  const [updated] = await db.update(correspondenceGamesTable).set(updates)
    .where(and(
      eq(correspondenceGamesTable.id, gameId),
      eq(correspondenceGamesTable.status, "active"),
      eq(correspondenceGamesTable.turnUserId, userId),
      eq(correspondenceGamesTable.pgn, game.pgn),
    )).returning();
  if (!updated) return { success: false, error: "The game changed — reload and try again" };

  const mover = isWhite ? game.whiteUsername : game.blackUsername;
  push(nextTurnUserId, "Your move", `${mover} played ${moveResult.san}. You have ${dailyLabel(game.timeControl)} to reply.`, gameUrl(gameId));
  return { success: true, game: updated };
}

export async function resignGame(gameId: string, userId: string): Promise<MoveResult> {
  const [game] = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.id, gameId));
  if (!game) return { success: false, error: "Game not found" };
  if (game.status !== "active") return { success: false, error: "This game has already finished" };
  if (game.whiteUserId !== userId && game.blackUserId !== userId) return { success: false, error: "Not your game" };
  const isWhite = game.whiteUserId === userId;
  return { success: true, game: await finishGame(game, isWhite ? "black" : "white", "resignation", game.pgn, game.fen) };
}

export async function offerDraw(gameId: string, userId: string): Promise<MoveResult> {
  const [game] = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.id, gameId));
  if (!game || game.status !== "active") return { success: false, error: "Game not active" };
  if (game.whiteUserId !== userId && game.blackUserId !== userId) return { success: false, error: "Not your game" };
  const side = game.whiteUserId === userId ? "white" : "black";
  if (game.drawOfferFrom === side) return { success: true, game };
  if (game.drawOfferFrom && game.drawOfferFrom !== side) {
    // they offered first -- offering back = accepting
    return { success: true, game: await finishGame(game, "draw", "draw_agreement", game.pgn, game.fen) };
  }
  const [updated] = await db.update(correspondenceGamesTable).set({ drawOfferFrom: side }).where(eq(correspondenceGamesTable.id, gameId)).returning();
  const otherId = side === "white" ? game.blackUserId : game.whiteUserId;
  const me = side === "white" ? game.whiteUsername : game.blackUsername;
  push(otherId, "Draw offer", `${me} offered a draw in your daily game.`, gameUrl(gameId));
  return { success: true, game: updated };
}

export async function respondDraw(gameId: string, userId: string, accept: boolean): Promise<MoveResult> {
  const [game] = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.id, gameId));
  if (!game || game.status !== "active" || !game.drawOfferFrom) return { success: false, error: "No draw offer" };
  const side = game.whiteUserId === userId ? "white" : game.blackUserId === userId ? "black" : null;
  if (!side || side === game.drawOfferFrom) return { success: false, error: "Not your offer to answer" };
  if (accept) return { success: true, game: await finishGame(game, "draw", "draw_agreement", game.pgn, game.fen) };
  const [updated] = await db.update(correspondenceGamesTable).set({ drawOfferFrom: null }).where(eq(correspondenceGamesTable.id, gameId)).returning();
  return { success: true, game: updated };
}

export async function getDailyRating(userId: string) {
  const r = await seedRatingFromImports(userId, DAILY_RATING_KEY);
  return { rating: Math.round(r.rating), rd: Math.round(r.rd), gamesPlayed: r.gamesPlayed, isProvisional: r.gamesPlayed < 8 };
}

