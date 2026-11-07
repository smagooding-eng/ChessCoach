// Watching a tournament: anyone with the link (signed in or not) can follow
// one game move by move, or every board in play at once (the TV view, made
// for streaming: fullscreen it and capture the window in OBS).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, Loader2, Maximize2, Minimize2, Radio, Tv, RotateCcw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { ChessBoard } from '@/components/ChessBoard';
import { ThemedMiniBoard } from '@/components/ThemedMiniBoard';
import { MoveBrowserBar } from '@/components/MoveBrowserBar';
import { useMoveBrowser, positionsFromSan } from '@/hooks/use-move-browser';
import { playSound } from '@/lib/sounds';
import { PT, cardStyle, ghostBtn } from '@/lib/playTheme';

export interface WatchGame {
  id: string; kind: string; white: string; black: string; sans: string[]; fen: string | null;
  status: 'active' | 'finished'; result: string | null; termination: string | null; turn: 'w' | 'b';
  whiteTimeMs: number | null; blackTimeMs: number | null; lastMoveAt: string | null; timeControl: string | null;
}
interface TInfo { id: string; name: string; kind: string }

const scoreOf = (r: string | null) => (r === 'white' ? '1–0' : r === 'black' ? '0–1' : r === 'draw' ? '½–½' : null);
const ENDED: Record<string, string> = {
  checkmate: 'Checkmate', resignation: 'Resignation', timeout: 'On time', stalemate: 'Stalemate', draw_repetition: 'Repetition',
  draw_50: '50-move rule', draw_insufficient: 'Insufficient material', draw_agreement: 'Draw agreed', abandoned: 'Abandoned',
};

function clock(ms: number | null): string {
  if (ms == null) return '';
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
function ago(iso: string | null, now: number): string {
  if (!iso) return '';
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
function soundFor(san: string | undefined) {
  if (!san) return;
  try { playSound(san.includes('#') || san.includes('+') ? 'check' : san.startsWith('O-') ? 'castle' : san.includes('x') ? 'capture' : san.includes('=') ? 'promote' : 'move'); } catch { /* sound is optional */ }
}

/** Polls while the tab is visible: fast for live games, slowly for daily ones, not at all once over. */
function usePoll(fn: () => Promise<boolean>, ms: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (!alive) return;
      const again = document.visibilityState === 'visible' ? await fnRef.current().catch(() => true) : true;
      if (alive && again) timer = setTimeout(tick, ms);
    };
    void tick();
    const onVis = () => { if (document.visibilityState === 'visible' && timer) { clearTimeout(timer); void tick(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [ms]);
}

// ── One game ────────────────────────────────────────────────────────────────

export function TournamentWatch() {
  const { id, gameId } = useParams<{ id: string; gameId: string }>();
  const [t, setT] = useState<TInfo | null>(null);
  const [g, setG] = useState<WatchGame | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [offset, setOffset] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const seen = useRef<number | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    const r = await apiFetch(`/api/tournaments/${id}/watch/${gameId}`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || 'Could not load the game'); return false; }
    setT(d.tournament); setG(d.game); setOffset(d.serverNow - Date.now()); setFetchedAt(Date.now());
    const n = (d.game as WatchGame).sans.length;
    if (seen.current !== null && n > seen.current) soundFor((d.game as WatchGame).sans[n - 1]);
    seen.current = n;
    return d.game.status === 'active';
  }, [id, gameId]);
  usePoll(load, g?.kind === 'daily' ? 30000 : 2500);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(iv); }, []);

  const positions = useMemo(() => positionsFromSan(g?.sans ?? []), [g?.sans?.join(' ')]); // eslint-disable-line react-hooks/exhaustive-deps
  const browser = useMoveBrowser(positions, gameId);

  if (err) return <div className="mx-auto max-w-xl p-6 text-center"><p style={{ color: PT.text }}>{err}</p><Link href={`/tournaments/${id}`} className="mt-3 inline-block rounded-xl px-4 py-2 text-[13px] font-bold" style={ghostBtn}>Back to the tournament</Link></div>;
  if (!g) return <div className="grid place-items-center p-10"><Loader2 className="animate-spin" style={{ color: PT.green }} /></div>;

  // Live clocks run down between polls on the side to move.
  const run = g.status === 'active' && g.kind !== 'daily' ? now - fetchedAt : 0;
  const wMs = g.whiteTimeMs == null ? null : g.whiteTimeMs - (g.turn === 'w' ? run : 0);
  const bMs = g.blackTimeMs == null ? null : g.blackTimeMs - (g.turn === 'b' ? run : 0);
  const top = flipped ? { name: g.white, ms: wMs, side: 'w' as const } : { name: g.black, ms: bMs, side: 'b' as const };
  const bottom = flipped ? { name: g.black, ms: bMs, side: 'b' as const } : { name: g.white, ms: wMs, side: 'w' as const };
  const toMove = g.status === 'active' ? g.turn : null;
  const score = scoreOf(g.result);
  const last = positions[positions.length - 1];
  const fen = browser.viewing && browser.fen ? browser.fen : (g.fen ?? last?.fen ?? null);
  const lastMove = browser.viewing ? browser.lastMove : (last?.lastMove ?? null);
  void offset;

  const row = (p: typeof top) => (
    <div className="flex items-center justify-between gap-2 text-[15px] font-bold" style={{ color: PT.text }}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.side === 'w' ? '#F5F7F6' : '#111', border: '1px solid rgba(255,255,255,.3)' }} />
        <span className="truncate">{p.name}</span>
        {toMove === p.side && <span className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-black uppercase" style={{ background: PT.greenSoft, color: PT.green }}>to move</span>}
      </span>
      {p.ms != null && <span className="shrink-0 rounded-lg px-2 py-0.5 tabular-nums" style={{ background: toMove === p.side ? PT.green : 'rgba(0,0,0,.3)', color: '#fff' }}>{clock(p.ms)}</span>}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-3 px-3 py-4">
      <div className="flex items-center gap-3">
        <Link href={`/tournaments/${id}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: PT.muted, background: 'rgba(255,255,255,.05)' }} aria-label="Back to the tournament"><ArrowLeft size={18} /></Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>{t?.name}</p>
          <p className="flex items-center gap-1.5 text-[15px] font-extrabold" style={{ color: PT.text }}>
            {g.status === 'active' ? <><Radio size={14} style={{ color: '#E5484D' }} className="animate-pulse" /> {g.kind === 'daily' ? 'Playing (daily)' : 'Live now'}</> : <>Finished {score && <span style={{ color: PT.green }}>{score}</span>}</>}
          </p>
        </div>
        <Link href={`/tournaments/${id}/tv`} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={ghostBtn}><Tv size={14} /> All boards</Link>
      </div>

      <div className="space-y-2 p-3" style={cardStyle}>
        {row(top)}
        <ChessBoard fen={fen} lastMove={lastMove} flipped={flipped} maxWidthOverride="100%" suppressConfirmMoves />
        {row(bottom)}
        {positions.length > 1 && <MoveBrowserBar browser={browser} />}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]" style={{ color: PT.muted }}>
          <span>
            {g.status === 'finished'
              ? `${score ?? ''}${g.termination ? ` · ${ENDED[g.termination] ?? g.termination}` : ''}`
              : g.kind === 'daily' ? `${g.turn === 'w' ? g.white : g.black} to move${g.lastMoveAt ? ` · last move ${ago(g.lastMoveAt, now)}` : ''}` : `Move ${Math.ceil(g.sans.length / 2) || 1}`}
            {g.timeControl ? ` · ${g.timeControl.replace(/^corr_(\d+)d$/, '$1 day per move')}` : ''}
          </span>
          <button onClick={() => setFlipped((f) => !f)} className="inline-flex items-center gap-1 font-bold" style={{ color: PT.text }}><RotateCcw size={13} /> Flip board</button>
        </div>
      </div>

      {g.sans.length > 0 && (
        <div className="p-3" style={cardStyle}>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Moves</p>
          <div className="flex flex-wrap gap-x-1 gap-y-1 text-[13px]">
            {g.sans.map((san, k) => (
              <React.Fragment key={k}>
                {k % 2 === 0 && <span className="ml-1 tabular-nums" style={{ color: PT.muted }}>{k / 2 + 1}.</span>}
                <button onClick={() => browser.goTo(k + 1)} className="rounded px-1 py-0.5 font-semibold"
                  style={{ background: browser.index === k + 1 ? PT.green : 'transparent', color: browser.index === k + 1 ? '#fff' : PT.text }}>{san}</button>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {g.status === 'active' && <p className="text-center text-[11.5px]" style={{ color: PT.muted }}>{g.kind === 'daily' ? 'New moves show up here on their own (checked every 30 seconds).' : 'Updates live as they play.'}</p>}
    </div>
  );
}

// ── Every board (TV) ────────────────────────────────────────────────────────

export function TournamentTV() {
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<TInfo | null>(null);
  const [boards, setBoards] = useState<WatchGame[] | null>(null);
  const [live, setLive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const boxRef = useRef<HTMLDivElement | null>(null);
  const counts = useRef<Record<string, number>>({});

  const load = useCallback(async (): Promise<boolean> => {
    const r = await apiFetch(`/api/tournaments/${id}/boards`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || 'Could not load the boards'); return false; }
    const list = d.boards as WatchGame[];
    // One move sound per refresh at most, even when several boards moved.
    let moved: string | undefined;
    for (const b of list) { const prev = counts.current[b.id]; if (prev !== undefined && b.sans.length > prev) moved = b.sans[b.sans.length - 1]; counts.current[b.id] = b.sans.length; }
    if (moved) soundFor(moved);
    setT(d.tournament); setBoards(list); setLive(!!d.live); setFetchedAt(Date.now());
    return true;
  }, [id]);
  const anyLive = !!boards?.some((b) => b.status === 'active' && b.kind !== 'daily');
  usePoll(load, anyLive ? 3000 : 30000);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    try { if (document.fullscreenElement) void document.exitFullscreen(); else void boxRef.current?.requestFullscreen(); } catch { /* not supported */ }
  };

  if (err) return <div className="mx-auto max-w-xl p-6 text-center"><p style={{ color: PT.text }}>{err}</p></div>;
  if (!boards) return <div className="grid place-items-center p-10"><Loader2 className="animate-spin" style={{ color: PT.green }} /></div>;

  const n = boards.length;
  const size = full ? (n <= 1 ? 560 : n <= 4 ? 300 : n <= 9 ? 210 : 170) : (n <= 1 ? 320 : n <= 4 ? 220 : 160);
  return (
    <div ref={boxRef} className="mx-auto w-full max-w-[1200px] space-y-3 px-3 py-4" style={{ background: full ? PT.bg : undefined, minHeight: full ? '100vh' : undefined }}>
      <div className="flex items-center gap-3">
        {!full && <Link href={`/tournaments/${id}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: PT.muted, background: 'rgba(255,255,255,.05)' }} aria-label="Back to the tournament"><ArrowLeft size={18} /></Link>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] font-black" style={{ color: PT.text }}>{t?.name}</p>
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: live ? '#E5484D' : PT.muted }}>
            {live ? <><Radio size={13} className="animate-pulse" /> {n} {n === 1 ? 'game' : 'games'} in play</> : 'No games in play right now · latest results'}
            <span style={{ color: PT.muted }}> · chessscout.net</span>
          </p>
        </div>
        <button onClick={toggleFull} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={ghostBtn}>
          {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {full ? 'Exit' : 'Fullscreen'}
        </button>
      </div>

      {n === 0 ? (
        <p className="py-10 text-center text-[14px]" style={{ color: PT.muted }}>Games show up here as soon as the tournament starts.</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          {boards.map((b) => {
            const pos = positionsFromSan(b.sans);
            const last = pos[pos.length - 1];
            const run = b.status === 'active' && b.kind !== 'daily' ? now - fetchedAt : 0;
            const wMs = b.whiteTimeMs == null ? null : b.whiteTimeMs - (b.turn === 'w' ? run : 0);
            const bMs = b.blackTimeMs == null ? null : b.blackTimeMs - (b.turn === 'b' ? run : 0);
            const line = (name: string, ms: number | null, side: 'w' | 'b') => (
              <div className="flex items-center justify-between gap-2 px-0.5 text-[12.5px] font-bold" style={{ color: PT.text }}>
                <span className="truncate" style={{ color: b.status === 'active' && b.turn === side ? PT.green : PT.text }}>{name}</span>
                <span className="shrink-0 tabular-nums" style={{ color: PT.muted }}>{ms != null ? clock(ms) : b.status === 'finished' ? '' : ''}</span>
              </div>
            );
            return (
              <Link key={b.id} href={`/tournaments/${id}/watch/${b.id}`} className="block space-y-1 rounded-2xl p-2" style={{ background: PT.cardSolid, border: `1px solid ${b.status === 'active' ? PT.greenLine : PT.border}`, width: size + 16 }}>
                {line(b.black, bMs, 'b')}
                <ThemedMiniBoard fen={b.fen ?? last?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'} size={size} lastMove={last?.lastMove ?? null} />
                {line(b.white, wMs, 'w')}
                <p className="truncate px-0.5 text-[11px] font-bold" style={{ color: b.status === 'active' ? PT.gold : PT.muted }}>
                  {b.status === 'active' ? (b.kind === 'daily' ? `${b.turn === 'w' ? b.white : b.black} to move${b.lastMoveAt ? ` · ${ago(b.lastMoveAt, now)}` : ''}` : `Move ${Math.ceil(b.sans.length / 2) || 1}`) : `${scoreOf(b.result) ?? 'Over'}${b.termination ? ` · ${ENDED[b.termination] ?? b.termination}` : ''}`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
