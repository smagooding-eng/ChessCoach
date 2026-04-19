import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveStatus = 'idle' | 'connecting' | 'queued' | 'in_game' | 'finished' | 'disconnected' | 'error';

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
  ratingDelta?: { white: number; black: number };
}

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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs avoid stale closures inside ws event handlers
  const gameRef = useRef<LiveGameState | null>(null);
  const queuedTcRef = useRef<string | null>(null);
  const statusRef = useRef<LiveStatus>('idle');
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { queuedTcRef.current = queuedTc; }, [queuedTc]);
  useEffect(() => { statusRef.current = status; }, [status]);

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
    ws.onopen = () => {
      setError(null);
      setStatus(s => (s === 'connecting' ? 'idle' : s));
      // Recover state on reconnect: resubscribe to active game, or rejoin queue
      const g = gameRef.current;
      if (g && g.status === 'active') {
        ws.send(JSON.stringify({ type: 'subscribe', gameId: g.id }));
      } else if (queuedTcRef.current) {
        ws.send(JSON.stringify({ type: 'queue', timeControl: queuedTcRef.current }));
      }
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case 'queued':
          setQueuedTc(msg.tcId);
          setStatus('queued');
          break;
        case 'queue_cancelled':
          setQueuedTc(null);
          setStatus('idle');
          break;
        case 'match_found':
          setGame(msg.state);
          setColor(msg.color);
          setQueuedTc(null);
          setStatus(msg.state.status === 'finished' ? 'finished' : 'in_game');
          break;
        case 'state':
          setGame(msg.state);
          if (msg.state.status === 'finished') setStatus('finished');
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
    ws.onerror = () => {
      setError('Connection error');
    };
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

  const enterQueue = useCallback((timeControl: string) => {
    setError(null);
    setGame(null);
    setColor(null);
    send({ type: 'queue', timeControl });
  }, [send]);

  const cancel = useCallback(() => { send({ type: 'cancel' }); }, [send]);
  const move = useCallback((san: string) => {
    if (game) send({ type: 'move', gameId: game.id, san });
  }, [game, send]);
  const resign = useCallback(() => {
    if (game) send({ type: 'resign', gameId: game.id });
  }, [game, send]);
  const subscribe = useCallback((gameId: string) => { send({ type: 'subscribe', gameId }); }, [send]);
  const reset = useCallback(() => {
    setGame(null);
    setColor(null);
    setError(null);
    setStatus('idle');
    setQueuedTc(null);
  }, []);

  return { status, error, game, color, queuedTc, enterQueue, cancel, move, resign, subscribe, reset };
}
