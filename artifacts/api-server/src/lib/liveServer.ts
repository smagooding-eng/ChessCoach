// Live Play server: WebSocket transport, matchmaking, game state machine, bot fallback.
// Supports two modes: 'casual' (no rating change) and 'ranked' (Glicko-2 update).

import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import crypto from 'crypto';
import { db, gamesTable } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { getSession, SESSION_COOKIE } from './auth';
import { logger } from './logger';
import { getBotMove, botThinkMs } from './botEngine';
import { findPersonaForRating, getAllPersonas, type Persona } from './personaPool';
import { updateRating, DEFAULT_RATING } from './glicko2';
import { fetchChessComProfile } from './chesscom';
import { fetchLichessProfile } from './lichess';
import { usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

export type TimeControlId = 'blitz_5_0' | 'blitz_5_3' | 'rapid_10_0';
export type Mode = 'casual' | 'ranked';

interface TimeControlSpec { id: TimeControlId; initialMs: number; incrementMs: number; label: string; }
const TIME_CONTROLS: Record<TimeControlId, TimeControlSpec> = {
  blitz_5_0:  { id: 'blitz_5_0',  initialMs: 5 * 60 * 1000, incrementMs: 0,        label: '5 min' },
  blitz_5_3:  { id: 'blitz_5_3',  initialMs: 5 * 60 * 1000, incrementMs: 3 * 1000, label: '5 | 3' },
  rapid_10_0: { id: 'rapid_10_0', initialMs: 10 * 60 * 1000,incrementMs: 0,        label: '10 min' },
};

const BOT_FALLBACK_MS = 30 * 1000;        // after this, spawn a bot if still queued
const DISCONNECT_GRACE_MS = 30 * 1000;    // opponent disconnect → 30s to reconnect
const WIDEN_INTERVAL_MS = 2_000;          // periodic match scanner
const HUMAN_COUNTRIES = [
  'US','CA','GB','DE','FR','IT','ES','NL','BR','AR','MX','PL','RU','UA','TR','IN','PH',
  'AU','NZ','ZA','SE','NO','DK','FI','PT','GR','JP','KR','VN','CL','CO','PE','RO','HU','CZ','BE','IE','CH',
];
function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h >>> 0; }
// Same title distribution as bots so titles never act as a "human vs bot" tell.
const HUMAN_TITLES: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,'NM','CM','FM','IM'];

interface HumanProfileData { country: string; title: string | null; avatar: string; memberSinceYear: number }

function defaultHumanProfile(userId: string, username: string, createdAtIso?: string): HumanProfileData {
  const h = hashStr(userId);
  const country = HUMAN_COUNTRIES[h % HUMAN_COUNTRIES.length];
  const title = HUMAN_TITLES[(h >>> 7) % HUMAN_TITLES.length];
  const memberSinceYear = createdAtIso ? new Date(createdAtIso).getFullYear() : (2014 + ((h >>> 13) % 11));
  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}&backgroundType=gradientLinear`;
  return { country, title, avatar, memberSinceYear };
}

// Cache of resolved human profile data per userId. Real data fetched once per
// process from chess.com / lichess (when the user has a linked handle), then
// merged with deterministic defaults so every field is always populated —
// matching the bot persona shape exactly. Bots get the same treatment via
// personaPool, so flag/title/avatar can never be used as a "this is a bot" tell.
const humanProfileCache = new Map<string, HumanProfileData>();
const humanProfileInflight = new Map<string, Promise<HumanProfileData>>();

async function resolveHumanProfile(userId: string, username: string): Promise<HumanProfileData> {
  const cached = humanProfileCache.get(userId);
  if (cached) return cached;
  const inflight = humanProfileInflight.get(userId);
  if (inflight) return inflight;
  const p = (async () => {
    const fallback = defaultHumanProfile(userId, username);
    let chesscom: string | null = null;
    let lichess: string | null = null;
    let dbCreatedAt: Date | null = null;
    try {
      const rows = await db.select({
        chesscomUsername: usersTable.chesscomUsername,
        lichessUsername: usersTable.lichessUsername,
        createdAt: usersTable.createdAt,
        profileImageUrl: usersTable.profileImageUrl,
      }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      const u = rows[0];
      if (u) {
        chesscom = u.chesscomUsername ?? null;
        lichess = u.lichessUsername ?? null;
        dbCreatedAt = u.createdAt ?? null;
        if (u.profileImageUrl) fallback.avatar = u.profileImageUrl;
      }
    } catch (e) {
      logger.warn({ e, userId }, 'resolveHumanProfile: user lookup failed');
    }
    if (dbCreatedAt) fallback.memberSinceYear = new Date(dbCreatedAt).getFullYear();

    let country: string | undefined;
    let title: string | undefined;
    let avatar: string | undefined;

    // Bound external fetches so a slow chess.com / lichess response can't
    // delay match start. If the timeout fires, fallback values are used; the
    // result is cached either way so subsequent matches benefit from a
    // background refresh on next request.
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
      new Promise(resolve => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms);
        p.then(v => { if (!done) { done = true; clearTimeout(timer); resolve(v); } })
         .catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
      });

    if (chesscom) {
      const cp = await withTimeout(fetchChessComProfile(chesscom), 1500);
      if (cp) {
        if (cp.country && /^[A-Za-z]{2}$/.test(cp.country)) country = cp.country.toUpperCase();
        if (cp.title) title = cp.title;
        if (cp.avatar) avatar = cp.avatar;
        if (cp.joined) fallback.memberSinceYear = new Date(cp.joined * 1000).getFullYear();
      }
    }
    if ((!country || !title) && lichess) {
      const lp = await withTimeout(fetchLichessProfile(lichess), 1500);
      if (lp) {
        if (!country && lp.country && /^[A-Za-z]{2}$/.test(lp.country)) country = lp.country.toUpperCase();
        if (!title && lp.title) title = lp.title;
        if (lp.createdAt) fallback.memberSinceYear = new Date(lp.createdAt).getFullYear();
      }
    }

    const resolved: HumanProfileData = {
      country: country ?? fallback.country,
      title: title ?? fallback.title,
      avatar: avatar ?? fallback.avatar,
      memberSinceYear: fallback.memberSinceYear,
    };
    humanProfileCache.set(userId, resolved);
    humanProfileInflight.delete(userId);
    return resolved;
  })();
  humanProfileInflight.set(userId, p);
  return p;
}

interface Player {
  kind: 'human' | 'bot';
  userId?: string;
  username: string;
  rating: number;
  country: string;
  title: string | null;
  avatar: string;
  memberSinceYear: number;
  personaId?: string;
}

interface LiveGame {
  id: string;
  mode: Mode;
  white: Player;
  black: Player;
  tc: TimeControlSpec;
  chess: Chess;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastTickAt: number;
  status: 'active' | 'finished';
  result?: 'white' | 'black' | 'draw';
  termination?: 'checkmate' | 'resignation' | 'timeout' | 'stalemate' | 'draw_repetition' | 'draw_50' | 'draw_insufficient' | 'draw_agreement' | 'abandoned';
  startedAt: number;
  finishedAt?: number;
  sanMoves: string[];
  ratingSnapshots: { white?: { userId: string; rating: number; rd: number; vol: number }; black?: { userId: string; rating: number; rd: number; vol: number } };
  ratingAfter: { white?: { rating: number; rd: number; vol: number }; black?: { rating: number; rd: number; vol: number } };
  expireTimer?: ReturnType<typeof setTimeout>;
  botTimer?: ReturnType<typeof setTimeout>;
  ratingDelta: { white: number; black: number };
  // DB ids in the unified games table after persistence (for deep-linking to Review)
  dbGameIds: { white?: number; black?: number };
  // Pending draw offer from a side; cleared after one move
  drawOfferFrom?: 'w' | 'b';
  // Per-side ply at which a draw offer was last made. Used to enforce
  // "single offer per side per side-to-move" — a side cannot re-offer
  // (after a decline or otherwise) until at least one move has been
  // played to advance the ply. Indexed by side.
  lastDrawOfferPly: { w: number; b: number };
  // Pending takeback request from a side; cleared on any move or rejection. Casual games only.
  takebackRequestFrom?: 'w' | 'b';
  // Snapshot of clocks BEFORE each move was applied — index i corresponds to the position after i moves.
  // Used to restore clocks on takeback. clockHistory[0] is the starting clocks.
  clockHistory: { whiteTimeMs: number; blackTimeMs: number }[];
  // Disconnect tracking → 30s grace
  disconnectTimers: { w?: ReturnType<typeof setTimeout>; b?: ReturnType<typeof setTimeout> };
}

interface WaitingPlayer {
  userId: string;
  username: string;
  rating: number;
  ws: WebSocket;
  tc: TimeControlSpec;
  mode: Mode;
  joinedAt: number;
  fallbackTimer: ReturnType<typeof setTimeout>;
}

const games = new Map<string, LiveGame>();
const subscribers = new Map<string, Set<WebSocket>>();        // gameId -> sockets
const userActiveGame = new Map<string, string>();             // userId -> gameId
const userSockets = new Map<string, Set<WebSocket>>();        // userId -> sockets
// queues keyed by `${tcId}:${mode}`
const queues = new Map<string, WaitingPlayer[]>();
function queueKey(tc: TimeControlId, mode: Mode) { return `${tc}:${mode}`; }
for (const id of Object.keys(TIME_CONTROLS) as TimeControlId[]) {
  for (const m of ['casual', 'ranked'] as Mode[]) queues.set(queueKey(id, m), []);
}

const wsUser = new WeakMap<WebSocket, { userId: string; username: string }>();

function send(ws: WebSocket, msg: any) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(gameId: string, msg: any) {
  const set = subscribers.get(gameId);
  if (!set) return;
  for (const ws of set) send(ws, msg);
}

function gamePublicState(g: LiveGame) {
  let whiteTimeMs = g.whiteTimeMs;
  let blackTimeMs = g.blackTimeMs;
  if (g.status === 'active') {
    const elapsed = Date.now() - g.lastTickAt;
    if (g.chess.turn() === 'w') whiteTimeMs = Math.max(0, whiteTimeMs - elapsed);
    else blackTimeMs = Math.max(0, blackTimeMs - elapsed);
  }
  return {
    id: g.id,
    mode: g.mode,
    fen: g.chess.fen(),
    sanMoves: g.sanMoves,
    turn: g.chess.turn() as 'w' | 'b',
    status: g.status,
    result: g.result,
    termination: g.termination,
    whiteTimeMs,
    blackTimeMs,
    increment: g.tc.incrementMs,
    timeControl: { id: g.tc.id, initial: g.tc.initialMs, increment: g.tc.incrementMs, label: g.tc.label },
    white: publicPlayer(g.white),
    black: publicPlayer(g.black),
    drawOfferFrom: g.drawOfferFrom,
    takebackRequestFrom: g.takebackRequestFrom,
    ratingDelta: g.status === 'finished' ? g.ratingDelta : undefined,
    dbGameIds: g.status === 'finished' ? g.dbGameIds : undefined,
  };
}

function publicPlayer(p: Player) {
  // Identical shape for humans and bots — disguise via uniformity.
  return {
    username: p.username,
    rating: Math.round(p.rating),
    country: p.country,
    title: p.title,
    avatar: p.avatar,
    memberSinceYear: p.memberSinceYear,
  };
}

interface DbResult<T> { rows?: T[] }
function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = res as DbResult<T>;
  return r?.rows ?? [];
}

interface RatingRow { rating: number | string; rd: number | string; vol: number | string; games_played: number | string }
async function loadUserRating(userId: string, tc: TimeControlId): Promise<{ rating: number; rd: number; vol: number; gamesPlayed: number }> {
  const res = await db.execute(sql`SELECT rating, rd, vol, games_played FROM user_live_ratings WHERE user_id = ${userId} AND time_control = ${tc}`);
  const rows = rowsOf<RatingRow>(res);
  if (rows.length > 0) {
    const r = rows[0];
    return { rating: Number(r.rating), rd: Number(r.rd), vol: Number(r.vol), gamesPlayed: Number(r.games_played) };
  }
  return { ...DEFAULT_RATING, gamesPlayed: 0 };
}

async function saveUserRating(userId: string, tc: TimeControlId, rating: number, rd: number, vol: number, gamesPlayedDelta: number) {
  await db.execute(sql`
    INSERT INTO user_live_ratings (user_id, time_control, rating, rd, vol, games_played, updated_at)
    VALUES (${userId}, ${tc}, ${rating}, ${rd}, ${vol}, ${gamesPlayedDelta}, now())
    ON CONFLICT (user_id, time_control) DO UPDATE SET
      rating = EXCLUDED.rating, rd = EXCLUDED.rd, vol = EXCLUDED.vol,
      games_played = user_live_ratings.games_played + ${gamesPlayedDelta},
      updated_at = now()
  `);
}

async function seedRatingFromImports(userId: string, tc: TimeControlId): Promise<{ rating: number; rd: number; vol: number; gamesPlayed: number }> {
  const existing = await loadUserRating(userId, tc);
  if (existing.gamesPlayed > 0 || existing.rating !== DEFAULT_RATING.rating) return existing;
  try {
    interface ImportRow { username: string; white_username: string; black_username: string; white_rating: number | string; black_rating: number | string }
    // Pull from BOTH linked platform usernames so we can average across them.
    const res = await db.execute(sql`
      SELECT username, white_username, black_username, white_rating, black_rating
      FROM games
      WHERE username IN (
        SELECT LOWER(chesscom_username) FROM users WHERE id = ${userId} AND chesscom_username IS NOT NULL
        UNION
        SELECT LOWER(lichess_username) FROM users WHERE id = ${userId} AND lichess_username IS NOT NULL
      )
      LIMIT 100
    `);
    const rows = rowsOf<ImportRow>(res);
    if (rows && rows.length > 0) {
      const ratings: number[] = [];
      for (const g of rows) {
        const me = String(g.username).toLowerCase();
        const wr = Number(g.white_rating);
        const br = Number(g.black_rating);
        if (String(g.white_username).toLowerCase() === me && wr > 0) ratings.push(wr);
        else if (String(g.black_username).toLowerCase() === me && br > 0) ratings.push(br);
      }
      if (ratings.length > 0) {
        const avg = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
        const seeded = Math.max(600, Math.min(2400, avg));
        // Persist seed so matchmaking and snapshot agree
        await saveUserRating(userId, tc, seeded, 200, DEFAULT_RATING.vol, 0);
        return { rating: seeded, rd: 200, vol: DEFAULT_RATING.vol, gamesPlayed: 0 };
      }
    }
  } catch (e) {
    logger.warn({ e }, 'seedRatingFromImports failed');
  }
  // No imports — persist the 1200 baseline so matchmaking and rating snapshot agree.
  await saveUserRating(userId, tc, 1200, 350, DEFAULT_RATING.vol, 0);
  return { rating: 1200, rd: 350, vol: DEFAULT_RATING.vol, gamesPlayed: 0 };
}

function generateGameId() { return crypto.randomBytes(8).toString('hex'); }

async function createGame(white: Player, black: Player, tc: TimeControlSpec, mode: Mode): Promise<LiveGame> {
  const game: LiveGame = {
    id: generateGameId(),
    mode, white, black, tc,
    chess: new Chess(),
    whiteTimeMs: tc.initialMs,
    blackTimeMs: tc.initialMs,
    lastTickAt: Date.now(),
    status: 'active',
    startedAt: Date.now(),
    sanMoves: [],
    ratingSnapshots: {},
    ratingAfter: {},
    ratingDelta: { white: 0, black: 0 },
    dbGameIds: {},
    clockHistory: [{ whiteTimeMs: tc.initialMs, blackTimeMs: tc.initialMs }],
    lastDrawOfferPly: { w: -1, b: -1 },
    disconnectTimers: {},
  };

  for (const color of ['white', 'black'] as const) {
    const p = color === 'white' ? white : black;
    if (p.kind === 'human' && p.userId) {
      const cur = await loadUserRating(p.userId, tc.id);
      game.ratingSnapshots[color] = { userId: p.userId, rating: cur.rating, rd: cur.rd, vol: cur.vol };
    }
  }

  games.set(game.id, game);
  if (white.kind === 'human' && white.userId) userActiveGame.set(white.userId, game.id);
  if (black.kind === 'human' && black.userId) userActiveGame.set(black.userId, game.id);
  scheduleExpire(game);
  scheduleBotIfNeeded(game);
  return game;
}

function scheduleExpire(g: LiveGame) {
  if (g.expireTimer) clearTimeout(g.expireTimer);
  if (g.status !== 'active') return;
  const turn = g.chess.turn();
  const remaining = turn === 'w' ? g.whiteTimeMs : g.blackTimeMs;
  const elapsed = Date.now() - g.lastTickAt;
  const ms = Math.max(0, remaining - elapsed);
  g.expireTimer = setTimeout(() => {
    if (g.status !== 'active') return;
    finishGame(g, turn === 'w' ? 'black' : 'white', 'timeout');
  }, ms + 50);
}

function scheduleBotIfNeeded(g: LiveGame) {
  if (g.botTimer) { clearTimeout(g.botTimer); g.botTimer = undefined; }
  if (g.status !== 'active') return;
  const turn = g.chess.turn();
  const player = turn === 'w' ? g.white : g.black;
  if (player.kind !== 'bot') return;
  const moves = g.chess.moves();
  if (moves.length === 0) return;
  const think = botThinkMs(player.rating, moves.length);
  g.botTimer = setTimeout(() => {
    if (g.status !== 'active') return;
    if (g.chess.turn() !== turn) return;
    const san = getBotMove(g.chess.fen(), player.rating);
    if (!san) return;
    applyMoveInternal(g, san);
  }, think);
}

function applyMoveInternal(g: LiveGame, san: string): boolean {
  const now = Date.now();
  const elapsed = now - g.lastTickAt;
  const turnBefore = g.chess.turn();
  const remainingBefore = turnBefore === 'w' ? g.whiteTimeMs : g.blackTimeMs;
  if (remainingBefore - elapsed <= 0) {
    finishGame(g, turnBefore === 'w' ? 'black' : 'white', 'timeout');
    return false;
  }
  const moveResult = g.chess.move(san);
  if (!moveResult) return false;
  const moverColor = moveResult.color;
  if (moverColor === 'w') g.whiteTimeMs = Math.max(0, g.whiteTimeMs - elapsed) + g.tc.incrementMs;
  else g.blackTimeMs = Math.max(0, g.blackTimeMs - elapsed) + g.tc.incrementMs;
  g.lastTickAt = now;
  g.sanMoves.push(moveResult.san);
  g.clockHistory.push({ whiteTimeMs: g.whiteTimeMs, blackTimeMs: g.blackTimeMs });
  // Any active draw offer is auto-declined when the offerer's opponent moves
  if (g.drawOfferFrom && g.drawOfferFrom !== moverColor) g.drawOfferFrom = undefined;
  // The mover making a move clears their own offer too (no double-offer spam)
  if (g.drawOfferFrom === moverColor) g.drawOfferFrom = undefined;
  // Any active takeback request is cleared on any move
  if (g.takebackRequestFrom) g.takebackRequestFrom = undefined;

  if (g.chess.isCheckmate()) { finishGame(g, moverColor === 'w' ? 'white' : 'black', 'checkmate'); return true; }
  if (g.chess.isStalemate()) { finishGame(g, 'draw', 'stalemate'); return true; }
  if (g.chess.isThreefoldRepetition()) { finishGame(g, 'draw', 'draw_repetition'); return true; }
  if (g.chess.isInsufficientMaterial()) { finishGame(g, 'draw', 'draw_insufficient'); return true; }
  if (g.chess.isDraw()) { finishGame(g, 'draw', 'draw_50'); return true; }

  scheduleExpire(g);
  scheduleBotIfNeeded(g);
  broadcast(g.id, { type: 'state', state: gamePublicState(g) });
  return true;
}

function finishGame(g: LiveGame, result: 'white' | 'black' | 'draw', termination: NonNullable<LiveGame['termination']>) {
  if (g.status === 'finished') return;
  g.status = 'finished';
  g.result = result;
  g.termination = termination;
  g.finishedAt = Date.now();
  if (g.expireTimer) { clearTimeout(g.expireTimer); g.expireTimer = undefined; }
  if (g.botTimer) { clearTimeout(g.botTimer); g.botTimer = undefined; }
  if (g.disconnectTimers.w) { clearTimeout(g.disconnectTimers.w); g.disconnectTimers.w = undefined; }
  if (g.disconnectTimers.b) { clearTimeout(g.disconnectTimers.b); g.disconnectTimers.b = undefined; }

  void persistFinishedGame(g)
    .then(() => broadcast(g.id, { type: 'state', state: gamePublicState(g) }))
    .catch(err => {
      logger.error({ err, gameId: g.id }, 'persistFinishedGame failed');
      broadcast(g.id, { type: 'state', state: gamePublicState(g) });
    });

  if (g.white.kind === 'human' && g.white.userId) userActiveGame.delete(g.white.userId);
  if (g.black.kind === 'human' && g.black.userId) userActiveGame.delete(g.black.userId);

  setTimeout(() => {
    games.delete(g.id);
    subscribers.delete(g.id);
  }, 5 * 60 * 1000);
}

async function persistFinishedGame(g: LiveGame) {
  const wScore = g.result === 'white' ? 1 : g.result === 'draw' ? 0.5 : 0;
  const bScore = 1 - wScore;
  const ws = g.ratingSnapshots.white;
  const bs = g.ratingSnapshots.black;

  // Only RANKED games update Glicko ratings
  if (g.mode === 'ranked') {
    if (ws) {
      const opp = bs ? { rating: bs.rating, rd: bs.rd, vol: bs.vol } : { rating: g.black.rating, rd: 80, vol: DEFAULT_RATING.vol };
      const newW = updateRating({ rating: ws.rating, rd: ws.rd, vol: ws.vol }, opp, wScore);
      g.ratingDelta.white = Math.round(newW.rating - ws.rating);
      g.ratingAfter.white = newW;
      await saveUserRating(ws.userId, g.tc.id, newW.rating, newW.rd, newW.vol, 1);
    }
    if (bs) {
      const opp = ws ? { rating: ws.rating, rd: ws.rd, vol: ws.vol } : { rating: g.white.rating, rd: 80, vol: DEFAULT_RATING.vol };
      const newB = updateRating({ rating: bs.rating, rd: bs.rd, vol: bs.vol }, opp, bScore);
      g.ratingDelta.black = Math.round(newB.rating - bs.rating);
      g.ratingAfter.black = newB;
      await saveUserRating(bs.userId, g.tc.id, newB.rating, newB.rd, newB.vol, 1);
    }
  }

  // Build PGN
  const pgnChess = new Chess();
  for (const san of g.sanMoves) pgnChess.move(san);
  pgnChess.header(
    'Event', `ChessScout ${g.mode === 'ranked' ? 'Ranked' : 'Casual'} ${g.tc.label}`,
    'Site', 'ChessScout.net',
    'Date', new Date(g.startedAt).toISOString().slice(0, 10).replace(/-/g, '.'),
    'White', g.white.username,
    'Black', g.black.username,
    'Result', g.result === 'white' ? '1-0' : g.result === 'black' ? '0-1' : '1/2-1/2',
    'WhiteElo', String(Math.round(g.white.rating)),
    'BlackElo', String(Math.round(g.black.rating)),
    'TimeControl', `${Math.floor(g.tc.initialMs / 1000)}+${Math.floor(g.tc.incrementMs / 1000)}`,
    'Termination', g.termination ?? '',
  );
  const pgn = pgnChess.pgn();

  // Persist live_games row (canonical record)
  try {
    await db.execute(sql`
      INSERT INTO live_games (
        id, mode, time_control, white_user_id, black_user_id,
        white_username, black_username, white_persona_id, black_persona_id,
        result, termination, pgn,
        white_rating_before, black_rating_before, white_rating_after, black_rating_after,
        started_at, finished_at
      ) VALUES (
        ${g.id}, ${g.mode}, ${g.tc.id},
        ${g.white.userId ?? null}, ${g.black.userId ?? null},
        ${g.white.username}, ${g.black.username},
        ${g.white.personaId ?? null}, ${g.black.personaId ?? null},
        ${g.result}, ${g.termination}, ${pgn},
        ${ws?.rating ?? null}, ${bs?.rating ?? null},
        ${g.ratingAfter.white?.rating ?? null}, ${g.ratingAfter.black?.rating ?? null},
        ${new Date(g.startedAt).toISOString()}, ${new Date(g.finishedAt!).toISOString()}
      )
    `);
  } catch (e) {
    logger.warn({ e, gameId: g.id }, 'failed to persist live_games row');
  }

  // Dual-write per human player into the unified games table so it appears in Dashboard/Games/Review.
  const playedAtIso = new Date(g.startedAt);
  const tcLabel = `${Math.floor(g.tc.initialMs / 60000)}+${Math.floor(g.tc.incrementMs / 1000)}`;
  for (const side of ['white', 'black'] as const) {
    const p = side === 'white' ? g.white : g.black;
    if (p.kind !== 'human' || !p.userId) continue;
    const playedAsWhite = side === 'white';
    const won = (g.result === 'white' && playedAsWhite) || (g.result === 'black' && !playedAsWhite);
    const lost = (g.result === 'black' && playedAsWhite) || (g.result === 'white' && !playedAsWhite);
    const resultStr = won ? 'win' : lost ? 'loss' : 'draw';
    try {
      const inserted = await db.insert(gamesTable).values({
        username: p.username.toLowerCase(),
        pgn,
        whiteUsername: g.white.username,
        blackUsername: g.black.username,
        whiteRating: Math.round(g.white.rating),
        blackRating: Math.round(g.black.rating),
        result: resultStr,
        timeControl: tcLabel,
        opening: null,
        eco: null,
        playedAt: playedAtIso,
        url: null,
        platform: 'chessscout',
      }).returning({ id: gamesTable.id });
      const insertedId = inserted[0]?.id;
      if (typeof insertedId === 'number') g.dbGameIds[side] = insertedId;
    } catch (e) {
      logger.warn({ e, gameId: g.id, userId: p.userId }, 'failed to persist live game into games table');
    }
  }
}

// --- Matchmaking with widening bracket ---

function matchWindowFor(joinedAt: number): number {
  const waitedSec = (Date.now() - joinedAt) / 1000;
  // start at 100, +50 every 5s, max 800
  return Math.min(800, 100 + Math.floor(waitedSec / 5) * 50);
}

function tryMatchInQueue(key: string) {
  const queue = queues.get(key)!;
  if (queue.length < 2) return;
  // Sort by joinedAt to prioritize longest waiters
  const sorted = [...queue].sort((a, b) => a.joinedAt - b.joinedAt);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const aWin = matchWindowFor(a.joinedAt);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const bWin = matchWindowFor(b.joinedAt);
      const window = Math.max(aWin, bWin);
      if (Math.abs(a.rating - b.rating) <= window) {
        // Match!
        const idxA = queue.indexOf(a);
        const idxB = queue.indexOf(b);
        if (idxA < 0 || idxB < 0) return;
        // Remove highest index first
        if (idxA > idxB) { queue.splice(idxA, 1); queue.splice(idxB, 1); }
        else { queue.splice(idxB, 1); queue.splice(idxA, 1); }
        clearTimeout(a.fallbackTimer);
        clearTimeout(b.fallbackTimer);
        void startHumanMatch(a, b);
        return;
      }
    }
  }
}

async function startHumanMatch(a: WaitingPlayer, b: WaitingPlayer) {
  const whiteFirst = Math.random() < 0.5;
  const [aProfile, bProfile] = await Promise.all([
    resolveHumanProfile(a.userId, a.username),
    resolveHumanProfile(b.userId, b.username),
  ]);
  const aPlayer: Player = { kind: 'human', userId: a.userId, username: a.username, rating: a.rating, ...aProfile };
  const bPlayer: Player = { kind: 'human', userId: b.userId, username: b.username, rating: b.rating, ...bProfile };
  const game = await createGame(whiteFirst ? aPlayer : bPlayer, whiteFirst ? bPlayer : aPlayer, a.tc, a.mode);
  subscribeWs(a.ws, game.id);
  subscribeWs(b.ws, game.id);
  send(a.ws, { type: 'match_found', state: gamePublicState(game), color: whiteFirst ? 'w' : 'b' });
  send(b.ws, { type: 'match_found', state: gamePublicState(game), color: whiteFirst ? 'b' : 'w' });
}

setInterval(() => {
  for (const key of queues.keys()) tryMatchInQueue(key);
}, WIDEN_INTERVAL_MS).unref();

async function joinQueue(ws: WebSocket, userId: string, username: string, tcId: TimeControlId, mode: Mode) {
  const existing = userActiveGame.get(userId);
  if (existing) {
    const g = games.get(existing);
    if (g) {
      send(ws, { type: 'match_found', state: gamePublicState(g), color: g.white.userId === userId ? 'w' : 'b' });
      subscribeWs(ws, g.id);
      return;
    }
  }
  cancelQueue(userId);
  const tc = TIME_CONTROLS[tcId];
  if (!tc) { send(ws, { type: 'error', message: 'Invalid time control' }); return; }
  if (mode !== 'casual' && mode !== 'ranked') { send(ws, { type: 'error', message: 'Invalid mode' }); return; }

  const seed = await seedRatingFromImports(userId, tcId);
  const myRating = seed.rating;

  const key = queueKey(tcId, mode);
  const queue = queues.get(key)!;
  const fallbackTimer = setTimeout(() => spawnBotMatch(userId, username, myRating, tcId, mode), BOT_FALLBACK_MS);
  queue.push({ userId, username, rating: myRating, ws, tc, mode, joinedAt: Date.now(), fallbackTimer });
  send(ws, { type: 'queued', tcId, mode, eta: BOT_FALLBACK_MS });
  // Try immediate match
  tryMatchInQueue(key);
}

function cancelQueue(userId: string) {
  for (const list of queues.values()) {
    const idx = list.findIndex(w => w.userId === userId);
    if (idx >= 0) {
      clearTimeout(list[idx].fallbackTimer);
      list.splice(idx, 1);
    }
  }
}

// Track the last bot persona served per user so they don't see the same one twice in a row.
const userLastPersona = new Map<string, string>();

async function spawnBotMatch(userId: string, username: string, userRating: number, tcId: TimeControlId, mode: Mode) {
  const queue = queues.get(queueKey(tcId, mode))!;
  const idx = queue.findIndex(w => w.userId === userId);
  if (idx < 0) return;
  const waiter = queue.splice(idx, 1)[0];
  clearTimeout(waiter.fallbackTimer);
  const tc = TIME_CONTROLS[tcId];
  const targetRating = Math.max(600, Math.min(2200, userRating + (Math.random() * 200 - 100)));
  const exclude = new Set<string>();
  const last = userLastPersona.get(userId);
  if (last) exclude.add(last);
  const persona: Persona = findPersonaForRating(targetRating, exclude);
  userLastPersona.set(userId, persona.id);
  const userProfile = await resolveHumanProfile(userId, username);
  const userPlayer: Player = { kind: 'human', userId, username, rating: userRating, ...userProfile };
  const botPlayer: Player = {
    kind: 'bot', username: persona.username, rating: persona.rating,
    country: persona.country, title: persona.title, avatar: persona.avatar,
    memberSinceYear: persona.memberSinceYear, personaId: persona.id,
  };
  const userIsWhite = Math.random() < 0.5;
  const game = await createGame(userIsWhite ? userPlayer : botPlayer, userIsWhite ? botPlayer : userPlayer, tc, mode);
  subscribeWs(waiter.ws, game.id);
  send(waiter.ws, { type: 'match_found', state: gamePublicState(game), color: userIsWhite ? 'w' : 'b' });
}

function subscribeWs(ws: WebSocket, gameId: string) {
  let set = subscribers.get(gameId);
  if (!set) { set = new Set(); subscribers.set(gameId, set); }
  set.add(ws);
}

function unsubscribeAll(ws: WebSocket) {
  for (const set of subscribers.values()) set.delete(ws);
}

function handleMove(ws: WebSocket, userId: string, gameId: string, san: string) {
  const g = games.get(gameId);
  if (!g) return send(ws, { type: 'error', message: 'Game not found' });
  if (g.status !== 'active') return;
  const turn = g.chess.turn();
  const player = turn === 'w' ? g.white : g.black;
  if (player.kind !== 'human' || player.userId !== userId) {
    return send(ws, { type: 'error', message: 'Not your turn' });
  }
  const ok = applyMoveInternal(g, san);
  if (!ok) return send(ws, { type: 'error', message: 'Illegal move' });
}

function handleResign(ws: WebSocket, userId: string, gameId: string) {
  const g = games.get(gameId);
  if (!g || g.status !== 'active') return;
  if (g.white.userId === userId) finishGame(g, 'black', 'resignation');
  else if (g.black.userId === userId) finishGame(g, 'white', 'resignation');
}

function handleDrawOffer(ws: WebSocket, userId: string, gameId: string) {
  const g = games.get(gameId);
  if (!g || g.status !== 'active') return;
  let mySide: 'w' | 'b' | null = null;
  if (g.white.userId === userId) mySide = 'w';
  else if (g.black.userId === userId) mySide = 'b';
  if (!mySide) return;
  // Server-authoritative draw rules:
  //  - You may only offer a draw on your own turn (matches standard chess UX
  //    and prevents spamming offers while the opponent is thinking).
  //  - Single offer per side per side-to-move: if you already have an offer
  //    standing on this turn, ignore re-offers; if your opponent already has
  //    one standing, you should accept/decline that instead of overwriting.
  if (g.chess.turn() !== mySide) return send(ws, { type: 'error', message: 'You can only offer a draw on your own turn' });
  if (g.drawOfferFrom) return; // an offer (yours or opponent's) is already pending — no overwrite
  // One offer per side per side-to-move: ply increases on every move, so a
  // decline followed by an immediate re-offer (same ply) is rejected here
  // until the offerer has actually moved and ply has advanced.
  const currentPly = g.sanMoves.length;
  if (g.lastDrawOfferPly[mySide] === currentPly) {
    return send(ws, { type: 'error', message: 'You already offered a draw this turn — make a move first' });
  }
  const oppPlayer = mySide === 'w' ? g.black : g.white;
  g.drawOfferFrom = mySide;
  g.lastDrawOfferPly[mySide] = currentPly;
  broadcast(g.id, { type: 'state', state: gamePublicState(g) });
  if (oppPlayer.kind === 'bot') {
    // Behave like a human: think for 1.5–4s, then accept (~15%) or decline.
    // In losing positions for the bot, accept rate goes up. We keep it lightweight.
    const delay = 1500 + Math.floor(Math.random() * 2500);
    setTimeout(() => {
      if (g.status !== 'active' || g.drawOfferFrom !== mySide) return;
      const accept = Math.random() < 0.15;
      if (accept) finishGame(g, 'draw', 'draw_agreement');
      else { g.drawOfferFrom = undefined; broadcast(g.id, { type: 'draw_declined' }); broadcast(g.id, { type: 'state', state: gamePublicState(g) }); }
    }, delay);
  }
}

function handleDrawAccept(ws: WebSocket, userId: string, gameId: string) {
  const g = games.get(gameId);
  if (!g || g.status !== 'active' || !g.drawOfferFrom) return;
  let mySide: 'w' | 'b' | null = null;
  if (g.white.userId === userId) mySide = 'w';
  else if (g.black.userId === userId) mySide = 'b';
  if (!mySide || mySide === g.drawOfferFrom) return;
  finishGame(g, 'draw', 'draw_agreement');
}

function handleDrawDecline(ws: WebSocket, userId: string, gameId: string) {
  const g = games.get(gameId);
  if (!g || !g.drawOfferFrom) return;
  let mySide: 'w' | 'b' | null = null;
  if (g.white.userId === userId) mySide = 'w';
  else if (g.black.userId === userId) mySide = 'b';
  if (!mySide || mySide === g.drawOfferFrom) return;
  g.drawOfferFrom = undefined;
  broadcast(g.id, { type: 'state', state: gamePublicState(g) });
}

function handleTakebackRequest(ws: WebSocket, userId: string, gameId: string) {
  const g = games.get(gameId);
  if (!g || g.status !== 'active') return;
  // Takebacks disabled in ranked games to protect rating integrity.
  if (g.mode !== 'casual') return send(ws, { type: 'error', message: 'Takebacks are not allowed in ranked games' });
  let mySide: 'w' | 'b' | null = null;
  if (g.white.userId === userId) mySide = 'w';
  else if (g.black.userId === userId) mySide = 'b';
  if (!mySide) return;
  // Single pending takeback request at a time, regardless of which side raised it.
  // The opposing side must accept or decline before another can be queued.
  if (g.takebackRequestFrom) return;
  // Need at least one of requester's own moves on the board to take back.
  const requesterMovesPlayed = mySide === 'w'
    ? Math.ceil(g.sanMoves.length / 2)
    : Math.floor(g.sanMoves.length / 2);
  if (requesterMovesPlayed < 1) return send(ws, { type: 'error', message: 'No moves to take back yet' });
  const oppPlayer = mySide === 'w' ? g.black : g.white;
  g.takebackRequestFrom = mySide;
  broadcast(g.id, { type: 'state', state: gamePublicState(g) });
  if (oppPlayer.kind === 'bot') {
    // Bots act like a friendly human in casual: short think, accept ~70% of the time.
    const delay = 1500 + Math.floor(Math.random() * 2000);
    setTimeout(() => {
      if (g.status !== 'active' || g.takebackRequestFrom !== mySide) return;
      const accept = Math.random() < 0.7;
      if (accept) applyTakeback(g, mySide!);
      else { g.takebackRequestFrom = undefined; broadcast(g.id, { type: 'takeback_declined' }); broadcast(g.id, { type: 'state', state: gamePublicState(g) }); }
    }, delay);
  }
}

function applyTakeback(g: LiveGame, requesterSide: 'w' | 'b') {
  // Roll back plies until it's the requester's turn AND we have removed at least
  // one of the requester's own moves. Result: requester is on move, at the position
  // before their last move (1 ply if it's currently the opponent's turn, 2 if the
  // requester's turn). Clocks are restored to the snapshot taken right after that
  // earlier position was reached.
  const plies = g.chess.turn() === requesterSide ? 2 : 1;
  if (g.sanMoves.length < plies) return;
  for (let i = 0; i < plies; i++) {
    g.chess.undo();
    g.sanMoves.pop();
    g.clockHistory.pop();
  }
  const last = g.clockHistory[g.clockHistory.length - 1];
  g.whiteTimeMs = last.whiteTimeMs;
  g.blackTimeMs = last.blackTimeMs;
  g.lastTickAt = Date.now();
  g.takebackRequestFrom = undefined;
  g.drawOfferFrom = undefined;
  scheduleExpire(g);
  scheduleBotIfNeeded(g);
  broadcast(g.id, { type: 'state', state: gamePublicState(g) });
}

function handleTakebackAccept(ws: WebSocket, userId: string, gameId: string) {
  const g = games.get(gameId);
  if (!g || g.status !== 'active' || !g.takebackRequestFrom) return;
  let mySide: 'w' | 'b' | null = null;
  if (g.white.userId === userId) mySide = 'w';
  else if (g.black.userId === userId) mySide = 'b';
  if (!mySide || mySide === g.takebackRequestFrom) return;
  applyTakeback(g, g.takebackRequestFrom);
}

function handleTakebackDecline(ws: WebSocket, userId: string, gameId: string) {
  const g = games.get(gameId);
  if (!g || !g.takebackRequestFrom) return;
  let mySide: 'w' | 'b' | null = null;
  if (g.white.userId === userId) mySide = 'w';
  else if (g.black.userId === userId) mySide = 'b';
  if (!mySide || mySide === g.takebackRequestFrom) return;
  g.takebackRequestFrom = undefined;
  broadcast(g.id, { type: 'state', state: gamePublicState(g) });
}

function handleSubscribe(ws: WebSocket, gameId: string) {
  const g = games.get(gameId);
  if (!g) return send(ws, { type: 'error', message: 'Game not found' });
  const userId = wsUser.get(ws)?.userId;
  let color: 'w' | 'b' | null = null;
  if (g.white.userId === userId) color = 'w';
  else if (g.black.userId === userId) color = 'b';
  if (!color) return send(ws, { type: 'error', message: 'Not a participant' });
  subscribeWs(ws, gameId);
  // Cancel any pending disconnect timer for this side
  if (g.disconnectTimers[color]) {
    clearTimeout(g.disconnectTimers[color]!);
    g.disconnectTimers[color] = undefined;
    broadcast(g.id, { type: 'opponent_reconnected', side: color });
  }
  send(ws, { type: 'match_found', state: gamePublicState(g), color });
}

function handleSocketClose(ws: WebSocket) {
  const info = wsUser.get(ws);
  if (info) {
    const set = userSockets.get(info.userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) userSockets.delete(info.userId);
    }
    cancelQueue(info.userId);
    // Disconnect grace for any active game where they're a participant
    if (!userSockets.has(info.userId)) {
      const gid = userActiveGame.get(info.userId);
      if (gid) {
        const g = games.get(gid);
        if (g && g.status === 'active') {
          const side: 'w' | 'b' | null =
            g.white.userId === info.userId ? 'w' :
            g.black.userId === info.userId ? 'b' : null;
          if (side) {
            broadcast(g.id, { type: 'opponent_disconnected', side, graceMs: DISCONNECT_GRACE_MS });
            if (g.disconnectTimers[side]) clearTimeout(g.disconnectTimers[side]!);
            g.disconnectTimers[side] = setTimeout(() => {
              if (g.status !== 'active') return;
              if (userSockets.has(info.userId)) return; // reconnected
              finishGame(g, side === 'w' ? 'black' : 'white', 'abandoned');
            }, DISCONNECT_GRACE_MS);
          }
        }
      }
    }
  }
  unsubscribeAll(ws);
}

function parseCookie(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

export function attachLiveServer(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return false;
    let host: string;
    try { host = new URL(origin).host; } catch { return false; }
    const allow = new Set<string>();
    const replitDomain = process.env.REPLIT_DEV_DOMAIN;
    const replitDeployment = process.env.REPLIT_DEPLOYMENT_DOMAIN;
    const allowed = process.env.LIVE_WS_ALLOWED_ORIGINS;
    if (replitDomain) allow.add(replitDomain);
    if (replitDeployment) allow.add(replitDeployment);
    if (allowed) for (const d of allowed.split(',')) allow.add(d.trim());
    // Same-origin loopback only in dev.
    if (process.env.NODE_ENV !== 'production') {
      if (host === 'localhost' || host.startsWith('localhost:')) return true;
      if (host === '127.0.0.1' || host.startsWith('127.0.0.1:')) return true;
      if (host === '0.0.0.0' || host.startsWith('0.0.0.0:')) return true;
    }
    return allow.has(host);
  }

  server.on('upgrade', async (req, socket, head) => {
    const url = req.url || '';
    if (!url.startsWith('/api/live/ws')) return;
    const origin = req.headers.origin as string | undefined;
    if (!isOriginAllowed(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
    }
    let session: Awaited<ReturnType<typeof getSession>> = null;
    try {
      const cookies = parseCookie(req);
      const sid = cookies[SESSION_COOKIE];
      if (sid) session = await getSession(sid);
    } catch {}
    if (!session?.user?.id) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return;
    }
    const userInfo: { userId: string; username: string } = {
      userId: session.user.id,
      username: session.user.chesscomUsername || session.user.lichessUsername || (session.user.firstName || session.user.email?.split('@')[0] || 'Player'),
    };
    wss.handleUpgrade(req, socket, head, ws => {
      wsUser.set(ws, userInfo);
      let set = userSockets.get(userInfo.userId);
      if (!set) { set = new Set(); userSockets.set(userInfo.userId, set); }
      set.add(ws);
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const info = wsUser.get(ws);
    if (!info) { ws.close(); return; }
    send(ws, { type: 'hello', username: info.username });

    ws.on('message', async (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      try {
        switch (msg.type) {
          case 'queue':
            await joinQueue(ws, info.userId, info.username, msg.timeControl, (msg.mode as Mode) || 'casual');
            break;
          case 'cancel':
            cancelQueue(info.userId);
            send(ws, { type: 'queue_cancelled' });
            break;
          case 'move':
            handleMove(ws, info.userId, msg.gameId, msg.san);
            break;
          case 'resign':
            handleResign(ws, info.userId, msg.gameId);
            break;
          case 'draw_offer':
            handleDrawOffer(ws, info.userId, msg.gameId);
            break;
          case 'draw_accept':
            handleDrawAccept(ws, info.userId, msg.gameId);
            break;
          case 'draw_decline':
            handleDrawDecline(ws, info.userId, msg.gameId);
            break;
          case 'takeback_request':
            handleTakebackRequest(ws, info.userId, msg.gameId);
            break;
          case 'takeback_accept':
            handleTakebackAccept(ws, info.userId, msg.gameId);
            break;
          case 'takeback_decline':
            handleTakebackDecline(ws, info.userId, msg.gameId);
            break;
          case 'subscribe':
            handleSubscribe(ws, msg.gameId);
            break;
          case 'ping':
            send(ws, { type: 'pong' });
            break;
        }
      } catch (err) {
        logger.error({ err, type: msg?.type }, 'live ws message error');
        send(ws, { type: 'error', message: 'Server error' });
      }
    });

    ws.on('close', () => handleSocketClose(ws));
  });

  logger.info('Live play WebSocket server attached on /api/live/ws');
}

export async function seedBotPersonas() {
  for (const p of getAllPersonas()) {
    try {
      await db.execute(sql`
        INSERT INTO bot_personas (id, username, rating, country, title, avatar, member_since_year)
        VALUES (${p.id}, ${p.username}, ${Math.round(p.rating)}, ${p.country}, ${p.title}, ${p.avatar}, ${p.memberSinceYear})
        ON CONFLICT (id) DO UPDATE SET
          rating = EXCLUDED.rating, country = EXCLUDED.country, title = EXCLUDED.title,
          avatar = EXCLUDED.avatar, member_since_year = EXCLUDED.member_since_year
      `);
    } catch (e) {
      logger.warn({ e, personaId: p.id }, 'persona upsert failed');
      break; // table likely missing; abort batch
    }
  }
}

// --- REST helpers ---
export async function getUserRatings(userId: string) {
  const out: Record<string, { rating: number; rd: number; gamesPlayed: number; isProvisional: boolean }> = {};
  for (const id of Object.keys(TIME_CONTROLS) as TimeControlId[]) {
    // Eagerly seed the per-time-control rating row from imports (or 1200 baseline)
    // so /live/ratings always reflects a stored, persistent value — even before
    // the user has queued for their first live game.
    const r = await seedRatingFromImports(userId, id);
    out[id] = {
      rating: Math.round(r.rating),
      rd: Math.round(r.rd),
      gamesPlayed: r.gamesPlayed,
      isProvisional: r.gamesPlayed < 8,
    };
  }
  return out;
}

export function getActiveGameForUser(userId: string): { state: ReturnType<typeof gamePublicState>; color: 'w' | 'b' } | null {
  const gid = userActiveGame.get(userId);
  if (!gid) return null;
  const g = games.get(gid);
  if (!g) return null;
  const color: 'w' | 'b' | null = g.white.userId === userId ? 'w' : g.black.userId === userId ? 'b' : null;
  if (!color) return null;
  return { state: gamePublicState(g), color };
}

interface LiveHistoryRow {
  id: string;
  mode: string;
  time_control: string;
  white_user_id: string | null;
  black_user_id: string | null;
  white_username: string;
  black_username: string;
  result: string;
  termination: string;
  white_rating_before: number | string | null;
  black_rating_before: number | string | null;
  white_rating_after: number | string | null;
  black_rating_after: number | string | null;
  started_at: string | Date;
  finished_at: string | Date;
  games_id: number | string | null;
}

export async function getUserLiveHistory(userId: string, limit: number) {
  const res = await db.execute(sql`
    SELECT
      lg.id, lg.mode, lg.time_control,
      lg.white_user_id, lg.black_user_id,
      lg.white_username, lg.black_username,
      lg.result, lg.termination,
      lg.white_rating_before, lg.black_rating_before,
      lg.white_rating_after, lg.black_rating_after,
      lg.started_at, lg.finished_at,
      g.id AS games_id
    FROM live_games lg
    LEFT JOIN games g ON g.platform = 'chessscout'
      AND g.played_at = lg.started_at
      AND (
        (lg.white_user_id = ${userId} AND LOWER(g.username) = LOWER(lg.white_username))
        OR (lg.black_user_id = ${userId} AND LOWER(g.username) = LOWER(lg.black_username))
      )
    WHERE lg.white_user_id = ${userId} OR lg.black_user_id = ${userId}
    ORDER BY lg.finished_at DESC
    LIMIT ${limit}
  `);
  const rows = rowsOf<LiveHistoryRow>(res);
  return rows.map(r => {
    const userIsWhite = r.white_user_id === userId;
    const myRatingBefore = userIsWhite ? r.white_rating_before : r.black_rating_before;
    const myRatingAfter = userIsWhite ? r.white_rating_after : r.black_rating_after;
    const oppRatingBefore = userIsWhite ? r.black_rating_before : r.white_rating_before;
    const myResult: 'win' | 'loss' | 'draw' =
      r.result === 'draw' ? 'draw'
      : (r.result === 'white' && userIsWhite) || (r.result === 'black' && !userIsWhite) ? 'win'
      : 'loss';
    return {
      id: r.id,
      gamesId: r.games_id != null ? Number(r.games_id) : null,
      mode: r.mode,
      timeControl: r.time_control,
      color: userIsWhite ? 'white' : 'black',
      opponentUsername: userIsWhite ? r.black_username : r.white_username,
      result: myResult,
      termination: r.termination,
      ratingBefore: myRatingBefore != null ? Math.round(Number(myRatingBefore)) : null,
      ratingAfter: myRatingAfter != null ? Math.round(Number(myRatingAfter)) : null,
      opponentRating: oppRatingBefore != null ? Math.round(Number(oppRatingBefore)) : null,
      startedAt: typeof r.started_at === 'string' ? r.started_at : r.started_at.toISOString(),
      finishedAt: typeof r.finished_at === 'string' ? r.finished_at : r.finished_at.toISOString(),
    };
  });
}

export function listTimeControls() {
  return Object.values(TIME_CONTROLS).map(tc => ({ id: tc.id, label: tc.label, initialMs: tc.initialMs, incrementMs: tc.incrementMs }));
}
