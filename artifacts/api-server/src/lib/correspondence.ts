import { Chess } from "chess.js";
import { db, correspondenceGamesTable, correspondenceQueueTable, botPersonasTable, type CorrespondenceGame } from "@workspace/db";
import { eq, and, or, ne, sql } from "drizzle-orm";
import { sendPushToUser } from "./pushNotifications";
import { logger } from "./logger";

export type CorrespondenceTimeControlId = "corr_1d" | "corr_3d" | "corr_7d";

const TIME_CONTROLS: Record<CorrespondenceTimeControlId, { ms: number; label: string }> = {
  corr_1d: { ms: 1 * 24 * 60 * 60 * 1000, label: "1 day" },
  corr_3d: { ms: 3 * 24 * 60 * 60 * 1000, label: "3 days" },
  corr_7d: { ms: 7 * 24 * 60 * 60 * 1000, label: "7 days" },
};

export function listCorrespondenceTimeControls() {
  return (Object.keys(TIME_CONTROLS) as CorrespondenceTimeControlId[]).map((id) => ({ id, ...TIME_CONTROLS[id] }));
}

function isValidTimeControl(id: string): id is CorrespondenceTimeControlId {
  return id in TIME_CONTROLS;
}

// How long a player sits in the queue before create-game gives up
// waiting for a real opponent and pairs them with a bot instead. Short
// enough that someone starting a game doesn't just wait forever with no
// feedback, long enough to give a real match a real chance first.
const BOT_FALLBACK_WAIT_MS = 15 * 1000;

async function pickBotOpponent(): Promise<{ id: string; username: string } | null> {
  const bots = await db.select({ id: botPersonasTable.id, username: botPersonasTable.username }).from(botPersonasTable);
  if (bots.length === 0) return null;
  return bots[Math.floor(Math.random() * bots.length)];
}

export interface CreateGameResult {
  status: "matched" | "queued";
  game?: CorrespondenceGame;
  color?: "white" | "black";
}

// No lobby -- this either immediately pairs with whoever's already
// waiting for the same time control, or queues the caller and returns
// "queued" so the client can poll (or just check back later; there's no
// live connection expected here, unlike live play's matchmaking).
export async function createOrJoinCorrespondenceGame(userId: string, username: string, timeControlId: string): Promise<CreateGameResult> {
  if (!isValidTimeControl(timeControlId)) {
    throw new Error(`Invalid time control: ${timeControlId}`);
  }
  const tc = TIME_CONTROLS[timeControlId];

  // Look for someone else already queued at this time control (not the
  // same user re-queuing against themselves).
  const waiting = await db.select().from(correspondenceQueueTable)
    .where(and(eq(correspondenceQueueTable.timeControl, timeControlId), ne(correspondenceQueueTable.userId, userId)))
    .orderBy(correspondenceQueueTable.joinedAt)
    .limit(1);

  if (waiting.length > 0) {
    const opponent = waiting[0];
    await db.delete(correspondenceQueueTable).where(eq(correspondenceQueueTable.id, opponent.id));
    const game = await startGame(userId, username, opponent.userId, opponent.username, timeControlId, tc.ms);
    return { status: "matched", game, color: "white" };
  }

  // Nobody waiting -- check if this exact user already has a stale queue
  // entry from a previous call past the bot-fallback window, and if so,
  // resolve it with a bot rather than leaving them queued indefinitely.
  const ownEntry = await db.select().from(correspondenceQueueTable)
    .where(and(eq(correspondenceQueueTable.userId, userId), eq(correspondenceQueueTable.timeControl, timeControlId)))
    .limit(1);

  if (ownEntry.length > 0) {
    const waitedMs = Date.now() - new Date(ownEntry[0].joinedAt).getTime();
    if (waitedMs >= BOT_FALLBACK_WAIT_MS) {
      const bot = await pickBotOpponent();
      await db.delete(correspondenceQueueTable).where(eq(correspondenceQueueTable.id, ownEntry[0].id));
      if (bot) {
        const game = await startGame(userId, username, bot.id, bot.username, timeControlId, tc.ms, { blackIsBot: true });
        return { status: "matched", game, color: "white" };
      }
      // No bot personas seeded at all -- re-queue rather than error, so
      // this resolves itself once one exists.
    } else {
      return { status: "queued" };
    }
  }

  await db.insert(correspondenceQueueTable).values({ userId, username, timeControl: timeControlId });
  return { status: "queued" };
}

async function startGame(
  whiteUserId: string, whiteUsername: string,
  blackUserId: string, blackUsername: string,
  timeControlId: CorrespondenceTimeControlId, bankMs: number,
  opts?: { blackIsBot?: boolean },
): Promise<CorrespondenceGame> {
  const chess = new Chess();
  const [game] = await db.insert(correspondenceGamesTable).values({
    timeControl: timeControlId,
    whiteUserId, blackUserId, whiteUsername, blackUsername,
    blackIsBot: opts?.blackIsBot ? 1 : 0,
    pgn: "",
    fen: chess.fen(),
    turnUserId: whiteUserId,
    whiteBankMs: bankMs,
    blackBankMs: bankMs,
  }).returning();

  // Let the opponent know a new correspondence game started and it's
  // their turn as soon as White actually moves -- not sent here (there's
  // no move yet), sent from makeMove below on White's first move instead.
  return game;
}

export async function leaveQueue(userId: string, timeControlId: string): Promise<void> {
  await db.delete(correspondenceQueueTable).where(and(eq(correspondenceQueueTable.userId, userId), eq(correspondenceQueueTable.timeControl, timeControlId)));
}

export async function listGamesForUser(userId: string): Promise<CorrespondenceGame[]> {
  await applyTimeoutsForUser(userId);
  return db.select().from(correspondenceGamesTable)
    .where(and(
      eq(correspondenceGamesTable.status, "active"),
      or(eq(correspondenceGamesTable.whiteUserId, userId), eq(correspondenceGamesTable.blackUserId, userId)),
    ))
    .orderBy(correspondenceGamesTable.lastMoveAt);
}

export async function getGame(gameId: string, userId: string): Promise<CorrespondenceGame | null> {
  const [game] = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.id, gameId));
  if (!game) return null;
  if (game.whiteUserId !== userId && game.blackUserId !== userId) return null;
  if (game.status === "active") {
    const timedOut = await checkAndApplyTimeout(game);
    if (timedOut) return getGame(gameId, userId); // re-fetch the now-finished row
  }
  return game;
}

// Lazy timeout check -- there's no background timer ticking correspondence
// clocks (nothing to tick when no one's connected), so "did someone run
// out of time" is only ever evaluated when a game is actually read: on
// game load, or when listing a user's games. A player who times out
// still shows correctly the next time anyone looks at that game, just
// not necessarily the exact instant it happened.
async function checkAndApplyTimeout(game: CorrespondenceGame): Promise<boolean> {
  const elapsedMs = Date.now() - new Date(game.lastMoveAt).getTime();
  const isWhiteTurn = game.turnUserId === game.whiteUserId;
  const bankMs = isWhiteTurn ? game.whiteBankMs : game.blackBankMs;
  if (elapsedMs <= bankMs) return false;

  const winnerColor = isWhiteTurn ? "black" : "white";
  await db.update(correspondenceGamesTable).set({
    status: "finished",
    result: winnerColor,
    termination: "timeout",
    finishedAt: new Date(),
  }).where(and(eq(correspondenceGamesTable.id, game.id), eq(correspondenceGamesTable.status, "active")));

  const loserUserId = isWhiteTurn ? game.whiteUserId : game.blackUserId;
  const winnerUserId = isWhiteTurn ? game.blackUserId : game.whiteUserId;
  sendPushToUser(winnerUserId, {
    title: "You won on time",
    body: `Your opponent ran out of time in your ${TIME_CONTROLS[game.timeControl as CorrespondenceTimeControlId]?.label ?? ""} correspondence game.`,
    url: `/correspondence/${game.id}`,
  }).catch((err) => logger.warn({ err }, "[correspondence] timeout win push failed"));
  void loserUserId; // no notification to the loser needed beyond them seeing it next time they open the game

  return true;
}

async function applyTimeoutsForUser(userId: string): Promise<void> {
  const activeGames = await db.select().from(correspondenceGamesTable)
    .where(and(
      eq(correspondenceGamesTable.status, "active"),
      or(eq(correspondenceGamesTable.whiteUserId, userId), eq(correspondenceGamesTable.blackUserId, userId)),
    ));
  for (const game of activeGames) {
    await checkAndApplyTimeout(game);
  }
}

export interface MoveResult {
  success: boolean;
  error?: string;
  game?: CorrespondenceGame;
}

export async function makeMove(gameId: string, userId: string, san: string): Promise<MoveResult> {
  const [game] = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.id, gameId));
  if (!game) return { success: false, error: "Game not found" };
  if (game.status !== "active") return { success: false, error: "This game has already finished" };

  const timedOut = await checkAndApplyTimeout(game);
  if (timedOut) return { success: false, error: "This game ended on time" };

  if (game.turnUserId !== userId) return { success: false, error: "It's not your turn" };
  const isWhite = game.whiteUserId === userId;

  const chess = new Chess();
  if (game.pgn) chess.loadPgn(game.pgn);

  let moveResult;
  try {
    moveResult = chess.move(san);
  } catch {
    moveResult = null;
  }
  if (!moveResult) return { success: false, error: "Illegal move" };

  // Time actually spent on this move comes out of the mover's bank
  // permanently is NOT how this works -- correspondence resets to the
  // full per-move allowance on every move (see the bank field comment in
  // the schema). What matters here is only whether they moved in time,
  // already confirmed via checkAndApplyTimeout above.
  const nextTurnUserId = isWhite ? game.blackUserId : game.whiteUserId;
  const bankMs = TIME_CONTROLS[game.timeControl as CorrespondenceTimeControlId]?.ms ?? game.whiteBankMs;

  let status: "active" | "finished" = "active";
  let result: string | null = null;
  let termination: string | null = null;
  if (chess.isCheckmate()) {
    status = "finished"; result = isWhite ? "white" : "black"; termination = "checkmate";
  } else if (chess.isStalemate()) {
    status = "finished"; result = "draw"; termination = "stalemate";
  } else if (chess.isDraw()) {
    status = "finished"; result = "draw"; termination = "draw_50";
  }

  const updates: Partial<typeof correspondenceGamesTable.$inferInsert> = {
    pgn: chess.pgn(),
    fen: chess.fen(),
    turnUserId: nextTurnUserId,
    lastMoveAt: new Date(),
    status,
  };
  if (isWhite) updates.whiteBankMs = bankMs; else updates.blackBankMs = bankMs;
  if (status === "finished") {
    updates.result = result;
    updates.termination = termination;
    updates.finishedAt = new Date();
  }

  const [updated] = await db.update(correspondenceGamesTable).set(updates)
    .where(eq(correspondenceGamesTable.id, gameId)).returning();

  // Tell the opponent it's their move now -- this is the entire point of
  // correspondence needing push notifications at all. Best-effort: a
  // failed push shouldn't fail the move itself, the move already
  // succeeded and is saved.
  if (status === "active" && !(isWhite ? game.blackIsBot : game.whiteIsBot)) {
    sendPushToUser(nextTurnUserId, {
      title: "Your move",
      body: `${isWhite ? game.whiteUsername : game.blackUsername} played ${san}. It's your turn.`,
      url: `/correspondence/${gameId}`,
    }).catch((err) => logger.warn({ err, gameId }, "[correspondence] your-move push failed"));
  }
  if (status === "finished") {
    const otherUserId = isWhite ? game.blackUserId : game.whiteUserId;
    const otherIsBot = isWhite ? game.blackIsBot : game.whiteIsBot;
    if (!otherIsBot) {
      sendPushToUser(otherUserId, {
        title: "Game over",
        body: `Your correspondence game vs ${isWhite ? game.whiteUsername : game.blackUsername} ended: ${result === "draw" ? "draw" : `${result} wins`} by ${termination}.`,
        url: `/correspondence/${gameId}`,
      }).catch((err) => logger.warn({ err, gameId }, "[correspondence] game-over push failed"));
    }
  }

  return { success: true, game: updated };
}

export async function resignGame(gameId: string, userId: string): Promise<MoveResult> {
  const [game] = await db.select().from(correspondenceGamesTable).where(eq(correspondenceGamesTable.id, gameId));
  if (!game) return { success: false, error: "Game not found" };
  if (game.status !== "active") return { success: false, error: "This game has already finished" };
  if (game.whiteUserId !== userId && game.blackUserId !== userId) return { success: false, error: "Not your game" };

  const isWhite = game.whiteUserId === userId;
  const result = isWhite ? "black" : "white";
  const [updated] = await db.update(correspondenceGamesTable).set({
    status: "finished", result, termination: "resignation", finishedAt: new Date(),
  }).where(eq(correspondenceGamesTable.id, gameId)).returning();

  const otherUserId = isWhite ? game.blackUserId : game.whiteUserId;
  const otherIsBot = isWhite ? game.blackIsBot : game.whiteIsBot;
  if (!otherIsBot) {
    sendPushToUser(otherUserId, {
      title: "Opponent resigned",
      body: `${isWhite ? game.whiteUsername : game.blackUsername} resigned. You win.`,
      url: `/correspondence/${gameId}`,
    }).catch((err) => logger.warn({ err, gameId }, "[correspondence] resign push failed"));
  }

  return { success: true, game: updated };
}
