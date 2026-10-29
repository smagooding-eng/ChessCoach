import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { buildWsUrl, type LiveGameState } from '@/hooks/use-live-play';

const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * While a live game is going and you're somewhere else in the app, a bar
 * that takes you straight back. It also keeps you "present" in the game
 * (so looking at another page doesn't lose it by abandonment) and shows
 * whose move it is with your clock.
 */
export function LiveGameReturn() {
  const { authUser } = useUser();
  const [location] = useLocation();
  // Only the game screen itself (/live) has the game; Live history etc. don't.
  const onLive = location === '/live';
  const [game, setGame] = useState<LiveGameState | null>(null);
  const [color, setColor] = useState<'w' | 'b' | null>(null);
  const [, setTick] = useState(0);
  const snap = useRef<{ at: number; offset: number }>({ at: Date.now(), offset: 0 });

  // Is there a live game? Checked when you change page and every 15s.
  useEffect(() => {
    if (!authUser || onLive) { setGame(null); return; }
    let live = true;
    const check = () => apiFetch('/api/live/active-game', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!live) return; if (d?.game?.status === 'active') { setGame(d.game); setColor(d.color); snap.current.at = Date.now(); } else setGame((g) => (g && g.status === 'finished' ? g : null)); })
      .catch(() => {});
    void check();
    const t = setInterval(check, 15_000);
    return () => { live = false; clearInterval(t); };
  }, [authUser, onLive, location]);

  // Stay connected to the game while it's on: presence + live updates.
  const gameId = game?.status === 'active' ? game.id : null;
  useEffect(() => {
    if (!gameId || onLive) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let ping: ReturnType<typeof setInterval> | null = null;
    const open = () => {
      ws = new WebSocket(buildWsUrl());
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'subscribe', gameId }));
        ws?.send(JSON.stringify({ type: 'presence', gameId, visible: document.visibilityState === 'visible' }));
      };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if ((m.type === 'state' || m.type === 'match_found') && m.state?.id === gameId) {
            if (typeof m.state.serverNow === 'number') snap.current.offset = m.state.serverNow - Date.now();
            snap.current.at = Date.now();
            setGame(m.state);
            if (m.color) setColor(m.color);
            if (m.state.status === 'active' && m.state.turn === m.color) navigator.vibrate?.(60);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!closed) setTimeout(open, 1500); };
    };
    open();
    const report = () => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'presence', gameId, visible: document.visibilityState === 'visible' })); };
    ping = setInterval(report, 5000);
    document.addEventListener('visibilitychange', report);
    return () => { closed = true; if (ping) clearInterval(ping); document.removeEventListener('visibilitychange', report); ws?.close(); };
  }, [gameId, onLive]);

  useEffect(() => { if (!game) return; const t = setInterval(() => setTick((n) => n + 1), 500); return () => clearInterval(t); }, [game]);
  // A finished game shows its result for a few seconds, then the bar goes.
  useEffect(() => { if (game?.status !== 'finished') return; const t = setTimeout(() => setGame(null), 10_000); return () => clearTimeout(t); }, [game?.status]);

  if (!game || !color || onLive) return null;
  const opp = color === 'w' ? game.black : game.white;
  const finished = game.status === 'finished';
  const yours = !finished && game.turn === color;
  const elapsed = Date.now() - snap.current.at;
  const myMs = (color === 'w' ? game.whiteTimeMs : game.blackTimeMs) - (yours ? elapsed : 0);
  const won = finished && ((game.result === 'white' && color === 'w') || (game.result === 'black' && color === 'b'));
  const label = finished ? (game.result === 'draw' ? 'Game drawn' : won ? 'You won!' : 'You lost') : yours ? `Your move · ${fmt(myMs)}` : `Their move · you have ${fmt(myMs)}`;
  return (
    <Link href="/live" className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[45] mx-auto flex max-w-[560px] items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl lg:bottom-6"
      style={{ background: yours ? '#E5484D' : '#16201F', border: `1px solid ${yours ? '#FF8A8E' : 'rgba(255,255,255,0.14)'}`, color: '#F5F7F6' }}>
      {!finished && <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full" style={{ background: yours ? '#FFFFFF' : '#E5484D' }} />}
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14px] font-extrabold">Live vs {opp.username}</b>
        <span className="block text-[12.5px] font-semibold tabular-nums" style={{ opacity: 0.9 }}>{label}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-extrabold">{finished ? 'See game' : 'Back to game'} <ChevronRight className="h-4 w-4" /></span>
    </Link>
  );
}
