// Live Play server: WebSocket transport, matchmaking, game state machine, bot fallback.

import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import crypto from 'crypto';
import { db, gamesTable } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { getSession, SESSION_COOKIE } from './auth';
import { logger } from './logger';
import { getBotMove, botThinkMs } from './botEngine';
import { findPersonaForRating, type Persona } from './personaPool';
import { updateRating, DEFAULT_RATING } from './glicko2';

export type TimeControlId = 'blitz_5_0' | 'blitz_5_3' | 'rapid_10_0';

interface TimeControlSpec { id: TimeControlId; initialMs: number; incrementMs: number; label: string; }
const TIME_CONTROLS: Record<TimeControlId, TimeControlSpec> = {
  blitz_5_0:  { id: 'blitz_5_0',  initialMs: 5 * 60 * 1000, incrementMs: 0,        label: '5 min' },
  blitz_5_3:  { id: 'blitz_5_3',  initialMs: 5 * 60 * 1000, incrementMs: 3 * 1000, label: '5 | 3' },
  rapid_10_0: { id: 'rapid_10_0', initialMs: 10 * 60 * 1000,incrementMs: 0,        label: '10 min' },
};

const MATCH_WAIT_MS = 30 * 1000;

interface Player {
  kind: 'human' | 'bot';
  userId?: string;
  username: string;
  rating: number;
  country?: string;
  title?: string | null;
  avatar?: string;
  memberSinceYear?: number;
  personaId?: string;
}

interface LiveGame {
  id: string;
  white: Player;
  black: Player;
  tc: TimeControlSpec;
  chess: Chess;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastTickAt: number;
  status: 'active' | 'finished';
  result?: 'white' | 'black' | 'draw';
  termination?: 'checkmate' | 'resignation' | 'timeout' | 'stalemate' | 'draw_repetition' | 'draw_50' | 'draw_insufficient' | 'draw_agreement';
  startedAt: number;
  finishedAt?: number;
  // SAN list for replay
  sanMoves: string[];
  // Per-color persisted rating snapshots (for human players, taken from DB at start)
  ratingSnapshots: { white?: { userId: string; rating: number; rd: number; vol: number }; black?: { userId: string; rating: number; rd: number; vol: number } };
  // Server-side timers
  expireTimer?: ReturnType<typeof setTimeout>;
  botTimer?: ReturnType<typeof setTimeout>;
  // For UI: rating change applied to each side
  ratingDelta: { white: number; black: number };
}

interface WaitingPlayer {
  userId: string;
  username: string;
  rating: number;
  ws: WebSocket;
  tc: TimeControlSpec;
  joinedAt: number;
  fallbackTimer: ReturnType<typeof setTimeout>;
}

const games = new Map<string, LiveGame>();
const subscribers = new Map<string, Set<WebSocket>>();        // gameId -> sockets
const userActiveGame = new Map<string, string>();             // userId -> gameId
const queues = new Map<TimeControlId, WaitingPlayer[]>();
for (const id of Object.keys(TIME_CONTROLS) as TimeControlId[]) queues.set(id, []);

// Track ws -> userId
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
  // Apply real-time clock to active player
  let whiteTimeMs = g.whiteTimeMs;
  let blackTimeMs = g.blackTimeMs;
  if (g.status === 'active') {
    const elapsed = Date.now() - g.lastTickAt;
    if (g.chess.turn() === 'w') whiteTimeMs = Math.max(0, whiteTimeMs - elapsed);
    else blackTimeMs = Math.max(0, blackTimeMs - elapsed);
  }
  return {
    id: g.id,
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
    ratingDelta: g.status === 'finished' ? g.ratingDelta : undefined,
  };
}

function publicPlayer(p: Player) {
  // IMPORTANT: emit identical shape for human + bot to prevent disguise leakage.
  // Only username + rating; clients render an initial badge for everyone.
  return {
    username: p.username,
    rating: Math.round(p.rating),
  };
}

async function loadUserRating(userId: string, tc: TimeControlId): Promise<{ rating: number; rd: number; vol: number; gamesPlayed: number }> {
  const rows: any[] = await db.execute(sql`SELECT rating, rd, vol, games_played FROM user_live_ratings WHERE user_id = ${userId} AND time_control = ${tc}`).then((r: any) => r.rows ?? r);
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

// Initialize user's rating from imported games avg if no ranked games yet.
async function seedRatingFromImports(userId: string, tc: TimeControlId): Promise<{ rating: number; rd: number; vol: number; gamesPlayed: number }> {
  const existing = await loadUserRating(userId, tc);
  if (existing.gamesPlayed > 0 || existing.rating !== DEFAULT_RATING.rating) return existing;
  // Try to derive from imports — average of white/black ratings of games where the user played
  try {
    const rows: any[] = await db.execute(sql`
      SELECT username, white_username, black_username, white_rating, black_rating
      FROM games
      WHERE username = (SELECT COALESCE(chesscom_username, lichess_username) FROM users WHERE id = ${userId})
      LIMIT 50
    `).then((r: any) => r.rows ?? r);
    if (rows && rows.length > 0) {
      const ratings: number[] = [];
      for (const g of rows) {
        const me = String(g.username).toLowerCase();
        if (String(g.white_username).toLowerCase() === me && g.white_rating > 0) ratings.push(Number(g.white_rating));
        else if (String(g.black_username).toLowerCase() === me && g.black_rating > 0) ratings.push(Number(g.black_rating));
      }
      if (ratings.length > 0) {
        const avg = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
        const seeded = Math.max(600, Math.min(2400, avg));
        return { rating: seeded, rd: 200, vol: DEFAULT_RATING.vol, gamesPlayed: 0 };
      }
    }
  } catch (e) {
    logger.warn({ e }, 'seedRatingFromImports failed');
  }
  return { rating: 1200, rd: 350, vol: DEFAULT_RATING.vol, gamesPlayed: 0 };
}

function generateGameId() {
  return crypto.randomBytes(8).toString('hex');
}

async function createGame(white: Player, black: Player, tc: TimeControlSpec): Promise<LiveGame> {
  const game: LiveGame = {
    id: generateGameId(),
    white, black, tc,
    chess: new Chess(),
    whiteTimeMs: tc.initialMs,
    blackTimeMs: tc.initialMs,
    lastTickAt: Date.now(),
    status: 'active',
    startedAt: Date.now(),
    sanMoves: [],
    ratingSnapshots: {},
    ratingDelta: { white: 0, black: 0 },
  };

  // Snapshot ratings for human players
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
  // Reject if mover already flagged
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
  const moverColor = moveResult.color; // 'w' | 'b'
  if (moverColor === 'w') g.whiteTimeMs = Math.max(0, g.whiteTimeMs - elapsed) + g.tc.incrementMs;
  else g.blackTimeMs = Math.max(0, g.blackTimeMs - elapsed) + g.tc.incrementMs;
  g.lastTickAt = now;
  g.sanMoves.push(moveResult.san);

  // Check end states
  if (g.chess.isCheckmate()) {
    finishGame(g, moverColor === 'w' ? 'white' : 'black', 'checkmate');
    return true;
  }
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

  // Update ratings + persist
  void persistFinishedGame(g).catch(err => logger.error({ err, gameId: g.id }, 'persistFinishedGame failed'));

  // Free user→game maps
  if (g.white.kind === 'human' && g.white.userId) userActiveGame.delete(g.white.userId);
  if (g.black.kind === 'human' && g.black.userId) userActiveGame.delete(g.black.userId);

  broadcast(g.id, { type: 'state', state: gamePublicState(g) });

  // Cleanup after grace period for reconnect
  setTimeout(() => {
    games.delete(g.id);
    subscribers.delete(g.id);
  }, 5 * 60 * 1000);
}

async function persistFinishedGame(g: LiveGame) {
  // Compute Glicko updates
  const wScore = g.result === 'white' ? 1 : g.result === 'draw' ? 0.5 : 0;
  const bScore = 1 - wScore;

  const ws = g.ratingSnapshots.white;
  const bs = g.ratingSnapshots.black;

  // White update — needs opponent rating for matchmaking purposes
  if (ws) {
    const opp = bs ? { rating: bs.rating, rd: bs.rd, vol: bs.vol } : { rating: g.black.rating, rd: 80, vol: DEFAULT_RATING.vol };
    const newW = updateRating({ rating: ws.rating, rd: ws.rd, vol: ws.vol }, opp, wScore);
    g.ratingDelta.white = Math.round(newW.rating - ws.rating);
    await saveUserRating(ws.userId, g.tc.id, newW.rating, newW.rd, newW.vol, 1);
  }
  if (bs) {
    const opp = ws ? { rating: ws.rating, rd: ws.rd, vol: ws.vol } : { rating: g.white.rating, rd: 80, vol: DEFAULT_RATING.vol };
    const newB = updateRating({ rating: bs.rating, rd: bs.rd, vol: bs.vol }, opp, bScore);
    g.ratingDelta.black = Math.round(newB.rating - bs.rating);
    await saveUserRating(bs.userId, g.tc.id, newB.rating, newB.rd, newB.vol, 1);
  }

  // Build PGN
  const pgnChess = new Chess();
  for (const san of g.sanMoves) pgnChess.move(san);
  pgnChess.header(
    'Event', `ChessScout ${g.tc.label}`,
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

  // Determine `username` field for each persisted record (for ownership filtering)
  // Persist one record per human player so it shows up in their Games page.
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
      await db.insert(gamesTable).values({
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
      });
    } catch (e) {
      logger.warn({ e, gameId: g.id, userId: p.userId }, 'failed to persist live game');
    }
  }
}

// --- Matchmaking ---

async function joinQueue(ws: WebSocket, userId: string, username: string, tcId: TimeControlId) {
  // Already in a game?
  const existing = userActiveGame.get(userId);
  if (existing) {
    const g = games.get(existing);
    if (g) {
      send(ws, { type: 'match_found', state: gamePublicState(g), color: g.white.userId === userId ? 'w' : 'b' });
      subscribeWs(ws, g.id);
      return;
    }
  }
  // Already queued? Cancel old.
  cancelQueue(userId);

  const tc = TIME_CONTROLS[tcId];
  if (!tc) { send(ws, { type: 'error', message: 'Invalid time control' }); return; }

  const seed = await seedRatingFromImports(userId, tcId);
  const myRating = seed.rating;

  // Try to match against another waiter
  const queue = queues.get(tcId)!;
  const idx = queue.findIndex(w => Math.abs(w.rating - myRating) <= 200 && w.userId !== userId);
  if (idx >= 0) {
    const opp = queue.splice(idx, 1)[0];
    clearTimeout(opp.fallbackTimer);
    const whiteFirst = Math.random() < 0.5;
    const myPlayer: Player = { kind: 'human', userId, username, rating: myRating };
    const oppPlayer: Player = { kind: 'human', userId: opp.userId, username: opp.username, rating: opp.rating };
    const game = await createGame(whiteFirst ? myPlayer : oppPlayer, whiteFirst ? oppPlayer : myPlayer, tc);
    subscribeWs(ws, game.id);
    subscribeWs(opp.ws, game.id);
    send(ws,     { type: 'match_found', state: gamePublicState(game), color: whiteFirst ? 'w' : 'b' });
    send(opp.ws, { type: 'match_found', state: gamePublicState(game), color: whiteFirst ? 'b' : 'w' });
    return;
  }

  // Queue with bot fallback
  const fallbackTimer = setTimeout(() => spawnBotMatch(userId, username, myRating, tcId), MATCH_WAIT_MS);
  queue.push({ userId, username, rating: myRating, ws, tc, joinedAt: Date.now(), fallbackTimer });
  send(ws, { type: 'queued', tcId, eta: MATCH_WAIT_MS });
}

function cancelQueue(userId: string) {
  for (const [tcId, list] of queues) {
    const idx = list.findIndex(w => w.userId === userId);
    if (idx >= 0) {
      clearTimeout(list[idx].fallbackTimer);
      list.splice(idx, 1);
    }
  }
}

async function spawnBotMatch(userId: string, username: string, userRating: number, tcId: TimeControlId) {
  const queue = queues.get(tcId)!;
  const idx = queue.findIndex(w => w.userId === userId);
  if (idx < 0) return;
  const waiter = queue.splice(idx, 1)[0];
  clearTimeout(waiter.fallbackTimer);
  const tc = TIME_CONTROLS[tcId];
  // Pick persona within ±150 of user rating
  const targetRating = Math.max(600, Math.min(2200, userRating + (Math.random() * 200 - 100)));
  const persona: Persona = findPersonaForRating(targetRating);
  const userPlayer: Player = { kind: 'human', userId, username, rating: userRating };
  const botPlayer: Player = {
    kind: 'bot', username: persona.username, rating: persona.rating,
    country: persona.country, title: persona.title, avatar: persona.avatar,
    memberSinceYear: persona.memberSinceYear, personaId: persona.id,
  };
  const userIsWhite = Math.random() < 0.5;
  const game = await createGame(userIsWhite ? userPlayer : botPlayer, userIsWhite ? botPlayer : userPlayer, tc);
  subscribeWs(waiter.ws, game.id);
  send(waiter.ws, { type: 'match_found', state: gamePublicState(game), color: userIsWhite ? 'w' : 'b' });
}

function subscribeWs(ws: WebSocket, gameId: string) {
  let set = subscribers.get(gameId);
  if (!set) { set = new Set(); subscribers.set(gameId, set); }
  set.add(ws);
}

function unsubscribeAll(ws: WebSocket) {
  for (const [, set] of subscribers) set.delete(ws);
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

function handleSubscribe(ws: WebSocket, gameId: string) {
  const g = games.get(gameId);
  if (!g) return send(ws, { type: 'error', message: 'Game not found' });
  const userId = wsUser.get(ws)?.userId;
  let color: 'w' | 'b' | null = null;
  if (g.white.userId === userId) color = 'w';
  else if (g.black.userId === userId) color = 'b';
  if (!color) return send(ws, { type: 'error', message: 'Not a participant' });
  subscribeWs(ws, gameId);
  send(ws, { type: 'match_found', state: gamePublicState(g), color });
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

  server.on('upgrade', async (req, socket, head) => {
    const url = req.url || '';
    if (!url.startsWith('/api/live/ws')) return;
    let session: Awaited<ReturnType<typeof getSession>> = null;
    try {
      const cookies = parseCookie(req);
      const sid = cookies[SESSION_COOKIE];
      if (sid) session = await getSession(sid);
    } catch {}
    if (!session?.user?.id) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return;
    }
    const userInfo = {
      userId: session.user.id,
      username: session.user.chesscomUsername || session.user.lichessUsername || (session.user.firstName || session.user.email?.split('@')[0] || 'Player'),
    };
    wss.handleUpgrade(req, socket, head, ws => {
      wsUser.set(ws, userInfo);
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
            await joinQueue(ws, info.userId, info.username, msg.timeControl);
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

    ws.on('close', () => {
      cancelQueue(info.userId);
      unsubscribeAll(ws);
    });
  });

  logger.info('Live play WebSocket server attached on /api/live/ws');
}

// --- REST helpers exported for routes ---
export async function getUserRatings(userId: string) {
  const out: Record<string, { rating: number; rd: number; gamesPlayed: number; isProvisional: boolean }> = {};
  for (const id of Object.keys(TIME_CONTROLS) as TimeControlId[]) {
    const r = await loadUserRating(userId, id);
    out[id] = {
      rating: Math.round(r.rating),
      rd: Math.round(r.rd),
      gamesPlayed: r.gamesPlayed,
      isProvisional: r.gamesPlayed < 8,
    };
  }
  return out;
}

export function listTimeControls() {
  return Object.values(TIME_CONTROLS).map(tc => ({ id: tc.id, label: tc.label, initialMs: tc.initialMs, incrementMs: tc.incrementMs }));
}
