import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBase, apiFetch, getAuthToken } from '@/lib/api';

export type LiveStatus = 'idle' | 'connecting' | 'queued' | 'challenge_waiting' | 'in_game' | 'finished' | 'disconnected' | 'error';
export type LiveMode = 'casual' | 'ranked';

export interface LivePlayer {
  username: string;
  rating: number;
  country?: string;
  title?: string | null;
  avatar?: string;
  memberSinceYear?: number;
  /** Server-labeled bot opponent (only ever offered, never disguised). */
  isBot?: boolean;
  /** Real players only: lets you send a friend request after the game. */
  userId?: string;
}

export interface LiveGameState {
  id: string;
  mode: LiveMode;
  fen: string;
  sanMoves: string[];
  turn: 'w' | 'b';
  status: 'active' | 'finished';
  result?: 'white' | 'black' | 'draw';
  termination?: string;
  whiteTimeMs: number;
  blackTimeMs: number;
  increment: number;
  timeControl: { id: string; initial: number; increment: number; label: string };
  white: LivePlayer;
  black: LivePlayer;
  drawOfferFrom?: 'w' | 'b';
  ratingDelta?: { white: number; black: number };
  dbGameIds?: { white?: number; black?: number };
  /** Sides that have left the game, with the server time they lose by abandonment. */
  away?: { w?: { deadline: number; reason: 'left' | 'offline' }; b?: { deadline: number; reason: 'left' | 'offline' } };
  /** Server clock when this state was sent (to line countdowns up). */
  serverNow?: number;
  /** After the game: which side has asked for a rematch. */
  rematchFrom?: 'w' | 'b';
  /** Arena tournament this game is part of. */
  tournamentId?: string;
}

export interface OpponentDisconnect { side: 'w' | 'b'; graceMs: number; until: number }

function buildWsUrl(): string {
  // Session token as a query param too: browsers that block cross-site
  // cookies (Safari, some Android webviews) can't authenticate otherwise.
  const t = getAuthToken();
  const q = t ? `?token=${encodeURIComponent(t)}` : '';
  return buildBaseWsUrl() + q;
}
function buildBaseWsUrl(): string {
  const apiBase = getApiBase();
  if (apiBase) {
    // apiBase is an absolute http(s) URL to the backend (e.g. Render) —
    // swap the scheme for its ws(s) equivalent.
    return apiBase.replace(/^http/, 'ws') + '/api/live/ws';
  }
  // No VITE_API_URL configured — same-origin case (local dev, or a
  // deployment where frontend and backend share a host).
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/live/ws`;
}

export function useLivePlay() {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<LiveGameState | null>(null);
  const [color, setColor] = useState<'w' | 'b' | null>(null);
  const [queuedTc, setQueuedTc] = useState<string | null>(null);
  const [queuedMode, setQueuedMode] = useState<LiveMode | null>(null);
  const [opponentDisconnect, setOpponentDisconnect] = useState<OpponentDisconnect | null>(null);
  const [premove, setPremove] = useState<{ from: string; to: string; promotion?: string } | null>(null);
  // When queued: when we joined and when the "play a bot instead" offer appears.
  const [queuedAt, setQueuedAt] = useState<number | null>(null);
  const [botOfferMs, setBotOfferMs] = useState<number>(20000);
  // Accepted a friend's challenge but they're not online yet.
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const pendingAcceptRef = useRef<string | null>(null);
  // Owner accepting a request made through their open link.
  const pendingApproveRef = useRef<string | null>(null);
  // Joining someone's search from a "looking for a game" alert.
  const pendingSeekRef = useRef<string | null>(null);
  const [seekGone, setSeekGone] = useState<string | null>(null);
  // What the "waiting" screen is about: you accepted a link, you sent a
  // request and they haven't answered yet, or you accepted a request.
  const [waitingKind, setWaitingKind] = useState<'accepted' | 'request' | 'approving'>('accepted');
  // serverTime - localTime, so abandonment countdowns match the server.
  const [serverOffset, setServerOffset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // Arena tournament: waiting in the pairing pool, or told it has ended.
  const [tournamentWaiting, setTournamentWaiting] = useState<{ id: string; started: boolean } | null>(null);
  const [tournamentOver, setTournamentOver] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  // Socket up right now? A game stays on screen through a brief drop (phones
  // lose the connection often); the board just waits until it's back.
  const [connected, setConnected] = useState(false);
  const unmountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameRef = useRef<LiveGameState | null>(null);
  const colorRef = useRef<'w' | 'b' | null>(null);
  const queuedTcRef = useRef<string | null>(null);
  const queuedModeRef = useRef<LiveMode | null>(null);
  const statusRef = useRef<LiveStatus>('idle');
  const premoveRef = useRef<typeof premove>(null);
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { queuedTcRef.current = queuedTc; }, [queuedTc]);
  useEffect(() => { queuedModeRef.current = queuedMode; }, [queuedMode]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { premoveRef.current = premove; }, [premove]);

  const send = useCallback((msg: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    setStatus(s => (s === 'in_game' || s === 'finished' ? s : 'connecting'));
    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;
    ws.onopen = async () => {
      setConnected(true);
      setError(null);
      setStatus(s => (s === 'connecting' ? 'idle' : s));
      let g = gameRef.current;
      // Auto-resume after a hard refresh: if we don't have an in-memory game, ask the
      // server whether this user has an active live game and rehydrate it before subscribing.
      if (!g) {
        try {
          const r = await apiFetch('/api/live/active-game', { credentials: 'include' });
          if (r.ok) {
            const j = await r.json();
            if (j?.game) {
              setGame(j.game);
              gameRef.current = j.game;
              g = j.game;
              if (j.color === 'w' || j.color === 'b') { setColor(j.color); colorRef.current = j.color; }
              setStatus(j.game.status === 'finished' ? 'finished' : 'in_game');
            }
          }
        } catch {}
      }
      if (pendingApproveRef.current && !(g && g.status === 'active')) {
        ws.send(JSON.stringify({ type: 'approve_request', code: pendingApproveRef.current }));
        return;
      }
      if (pendingSeekRef.current && !(g && g.status === 'active')) {
        ws.send(JSON.stringify({ type: 'join_seek', seekerId: pendingSeekRef.current }));
        return;
      }
      if (pendingAcceptRef.current && !(g && g.status === 'active')) {
        ws.send(JSON.stringify({ type: 'accept_challenge', code: pendingAcceptRef.current }));
        return;
      }
      if (g && g.status === 'active') {
        ws.send(JSON.stringify({ type: 'subscribe', gameId: g.id }));
        ws.send(JSON.stringify({ type: 'presence', gameId: g.id, visible: document.visibilityState === 'visible' }));
      } else if (g && g.status === 'finished') {
        // still on the result screen: re-subscribe so rematch offers reach us
        ws.send(JSON.stringify({ type: 'subscribe', gameId: g.id }));
      }
      else if (queuedTcRef.current && queuedModeRef.current) ws.send(JSON.stringify({ type: 'queue', timeControl: queuedTcRef.current, mode: queuedModeRef.current }));
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case 'queued':
          setQueuedTc(msg.tcId);
          setQueuedMode(msg.mode);
          setQueuedAt(Date.now());
          if (typeof msg.botOfferMs === 'number') setBotOfferMs(msg.botOfferMs);
          setStatus('queued');
          break;
        case 'challenge_waiting':
          setWaitingKind(msg.request ? 'request' : msg.approving ? 'approving' : 'accepted');
          setWaitingFor(msg.creator ?? 'your friend');
          setStatus('challenge_waiting');
          break;
        case 'queue_cancelled':
          setQueuedTc(null);
          setQueuedMode(null);
          setQueuedAt(null);
          setWaitingFor(null);
          pendingAcceptRef.current = null;
          pendingApproveRef.current = null;
          setStatus('idle');
          break;
        case 'tournament_waiting':
          setTournamentWaiting({ id: msg.tournamentId, started: !!msg.started });
          break;
        case 'tournament_paused':
          setTournamentWaiting(null);
          break;
        case 'tournament_over':
          setTournamentWaiting(null);
          setTournamentOver(msg.tournamentId);
          break;
        case 'seek_gone':
          pendingSeekRef.current = null;
          setSeekGone(String(msg.seekerId ?? ''));
          break;
        case 'match_found':
          pendingSeekRef.current = null;
          setSeekGone(null);
          setTournamentWaiting(null);
          pendingApproveRef.current = null;
          if (typeof msg.state?.serverNow === 'number') setServerOffset(msg.state.serverNow - Date.now());
          setNotice(null);
          setPremove(null);
          pendingAcceptRef.current = null;
          setWaitingFor(null);
          setQueuedAt(null);
          setGame(msg.state);
          setColor(msg.color);
          setQueuedTc(null);
          setQueuedMode(null);
          setOpponentDisconnect(null);
          setStatus(msg.state.status === 'finished' ? 'finished' : 'in_game');
          break;
        case 'state':
          if (typeof msg.state?.serverNow === 'number') setServerOffset(msg.state.serverNow - Date.now());
          setGame(msg.state);
          if (msg.state.status === 'finished') setStatus('finished');
          // Premove is replayed by LiveGame from the new state's `turn` and `fen`.
          break;
        case 'opponent_disconnected':
          setOpponentDisconnect({ side: msg.side, graceMs: msg.graceMs, until: Date.now() + msg.graceMs });
          break;
        case 'opponent_reconnected':
          setOpponentDisconnect(null);
          break;
        case 'rematch_declined':
          if (gameRef.current && colorRef.current) {
            const mine = msg.by === colorRef.current;
            if (!mine) {
              setNotice(msg.left ? 'Your opponent left — no rematch.' : 'Rematch declined.');
              setTimeout(() => setNotice(null), 4000);
            }
          }
          break;
        case 'draw_declined':
          setError('Draw declined');
          setTimeout(() => setError(null), 2500);
          break;
        case 'takeback_declined':
          // legacy no-op (takebacks removed)
          setTimeout(() => setError(null), 2500);
          break;
        case 'error':
          // A finished game is dropped from the server after a few minutes;
          // re-subscribing to it then is harmless, so don't show that.
          if (msg.message === 'Game not found' && gameRef.current?.status === 'finished') break;
          setError(msg.message);
          if (pendingAcceptRef.current || pendingApproveRef.current) {
            // a failed challenge accept must not be re-sent on reconnect
            pendingAcceptRef.current = null;
            pendingApproveRef.current = null;
            setWaitingFor(null);
            if (statusRef.current === 'challenge_waiting') setStatus('idle');
          }
          break;
      }
    };
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      setConnected(false);
      setTournamentWaiting(null); // the server drops you from the pairing pool
      if (unmountedRef.current) return; // left the page: don't reconnect
      // Keep an in-progress (or just-finished) game on screen -- switching to
      // the lobby and back rebuilt the board mid-move. Only the lobby shows
      // "disconnected".
      const g = gameRef.current;
      const inGame = !!g && (statusRef.current === 'in_game' || statusRef.current === 'finished');
      if (!inGame) setStatus('disconnected');
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, 1000);
      }
    };
    ws.onerror = () => { setError("Couldn't connect to live play — retrying…"); };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enterQueue = useCallback((timeControl: string, mode: LiveMode) => {
    setError(null);
    setGame(null);
    setColor(null);
    setOpponentDisconnect(null);
    setPremove(null);
    send({ type: 'queue', timeControl, mode });
  }, [send]);

  const cancel = useCallback(() => { send({ type: 'cancel' }); }, [send]);
  // Opt-in, clearly labeled bot game (always casual) when nobody's free.
  const playBot = useCallback((timeControl: string) => { setError(null); send({ type: 'play_bot', timeControl }); }, [send]);
  // Accept a friend's live challenge link. Sent now if connected, or as soon
  // as the socket opens.
  const acceptChallenge = useCallback((code: string) => {
    setError(null);
    pendingAcceptRef.current = code;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'accept_challenge', code }));
  }, []);
  // Tapped "<name> is looking for a game": play them if they're still searching.
  const joinSeek = useCallback((seekerId: string) => {
    setError(null);
    setSeekGone(null);
    pendingSeekRef.current = seekerId;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'join_seek', seekerId }));
  }, []);
  const clearSeekGone = useCallback(() => setSeekGone(null), []);
  // Accept a request someone made through your open challenge link.
  const approveRequest = useCallback((code: string) => {
    setError(null);
    pendingApproveRef.current = code;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'approve_request', code }));
  }, []);
  const move = useCallback((san: string) => { if (game) send({ type: 'move', gameId: game.id, san }); }, [game, send]);
  const resign = useCallback(() => { if (game) send({ type: 'resign', gameId: game.id }); }, [game, send]);
  const offerDraw = useCallback(() => { if (game) send({ type: 'draw_offer', gameId: game.id }); }, [game, send]);
  const acceptDraw = useCallback(() => { if (game) send({ type: 'draw_accept', gameId: game.id }); }, [game, send]);
  const declineDraw = useCallback(() => { if (game) send({ type: 'draw_decline', gameId: game.id }); }, [game, send]);
  // Presence: tell the server when the game goes off screen (other app/tab,
  // phone locked) and ping every 5s while it's on screen. Leaving for 30s
  // loses the game by abandonment.
  const activeGameId = game && game.status === 'active' ? game.id : null;
  useEffect(() => {
    if (!activeGameId) return;
    const report = () => send({ type: 'presence', gameId: activeGameId, visible: document.visibilityState === 'visible' });
    report();
    const onVis = () => report();
    const onHide = () => send({ type: 'presence', gameId: activeGameId, visible: false });
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    const t = setInterval(() => { if (document.visibilityState === 'visible') report(); }, 5000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      clearInterval(t);
    };
  }, [activeGameId, send]);

  const offerRematch = useCallback(() => { if (game) { setNotice(null); send({ type: 'rematch_offer', gameId: game.id }); } }, [game, send]);
  const declineRematch = useCallback(() => { if (game) send({ type: 'rematch_decline', gameId: game.id }); }, [game, send]);

  const tournamentReady = useCallback((tournamentId: string) => { setError(null); send({ type: 'tournament_ready', tournamentId }); }, [send]);
  const tournamentPause = useCallback((tournamentId: string) => { setTournamentWaiting(null); send({ type: 'tournament_pause', tournamentId }); }, [send]);

  const reset = useCallback(() => {
    const g = gameRef.current;
    if (g && g.status === 'finished') send({ type: 'leave_game', gameId: g.id });
    setNotice(null);
    setGame(null); setColor(null); setError(null); setStatus('idle');
    setQueuedTc(null); setQueuedMode(null); setOpponentDisconnect(null); setPremove(null);
  }, [send]);

  return {
    status, error, game, color, queuedTc, queuedMode, opponentDisconnect, premove, setPremove,
    queuedAt, botOfferMs, waitingFor, waitingKind, serverOffset, notice, approveRequest, connected, joinSeek, seekGone, clearSeekGone,
    enterQueue, offerRematch, declineRematch, cancel, playBot, acceptChallenge, move, resign, offerDraw, acceptDraw, declineDraw,
    reset, tournamentWaiting, tournamentOver, tournamentReady, tournamentPause,
  };
}
