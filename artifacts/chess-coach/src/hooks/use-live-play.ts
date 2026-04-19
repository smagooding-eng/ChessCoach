import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveStatus = 'idle' | 'connecting' | 'queued' | 'in_game' | 'finished' | 'disconnected' | 'error';
export type LiveMode = 'casual' | 'ranked';

export interface LivePlayer {
  username: string;
  rating: number;
  country?: string;
  title?: string | null;
  avatar?: string;
  memberSinceYear?: number;
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
}

export interface OpponentDisconnect { side: 'w' | 'b'; graceMs: number; until: number }

function buildWsUrl(): string {
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

  const wsRef = useRef<WebSocket | null>(null);
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
      setError(null);
      setStatus(s => (s === 'connecting' ? 'idle' : s));
      let g = gameRef.current;
      // Auto-resume after a hard refresh: if we don't have an in-memory game, ask the
      // server whether this user has an active live game and rehydrate it before subscribing.
      if (!g) {
        try {
          const r = await fetch(`${import.meta.env.BASE_URL}api/live/active-game`, { credentials: 'include' });
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
      if (g && g.status === 'active') ws.send(JSON.stringify({ type: 'subscribe', gameId: g.id }));
      else if (queuedTcRef.current && queuedModeRef.current) ws.send(JSON.stringify({ type: 'queue', timeControl: queuedTcRef.current, mode: queuedModeRef.current }));
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case 'queued':
          setQueuedTc(msg.tcId);
          setQueuedMode(msg.mode);
          setStatus('queued');
          break;
        case 'queue_cancelled':
          setQueuedTc(null);
          setQueuedMode(null);
          setStatus('idle');
          break;
        case 'match_found':
          setGame(msg.state);
          setColor(msg.color);
          setQueuedTc(null);
          setQueuedMode(null);
          setOpponentDisconnect(null);
          setStatus(msg.state.status === 'finished' ? 'finished' : 'in_game');
          break;
        case 'state':
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
        case 'draw_declined':
          setError('Draw declined');
          setTimeout(() => setError(null), 2500);
          break;
        case 'error':
          setError(msg.message);
          break;
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
      if (statusRef.current !== 'finished') {
        setStatus('disconnected');
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 1500);
        }
      }
    };
    ws.onerror = () => { setError('Connection error'); };
  }, []);

  useEffect(() => {
    connect();
    return () => {
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
  const move = useCallback((san: string) => { if (game) send({ type: 'move', gameId: game.id, san }); }, [game, send]);
  const resign = useCallback(() => { if (game) send({ type: 'resign', gameId: game.id }); }, [game, send]);
  const offerDraw = useCallback(() => { if (game) send({ type: 'draw_offer', gameId: game.id }); }, [game, send]);
  const acceptDraw = useCallback(() => { if (game) send({ type: 'draw_accept', gameId: game.id }); }, [game, send]);
  const declineDraw = useCallback(() => { if (game) send({ type: 'draw_decline', gameId: game.id }); }, [game, send]);
  const reset = useCallback(() => {
    setGame(null); setColor(null); setError(null); setStatus('idle');
    setQueuedTc(null); setQueuedMode(null); setOpponentDisconnect(null); setPremove(null);
  }, []);

  return {
    status, error, game, color, queuedTc, queuedMode, opponentDisconnect, premove, setPremove,
    enterQueue, cancel, move, resign, offerDraw, acceptDraw, declineDraw, reset,
  };
}
