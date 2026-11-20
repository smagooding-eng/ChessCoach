// Streamer Studio remote: steer games and reviews in the board panel from big controls
// under the preview (never in the stream picture), instead of tapping inside the shrunken
// page. A review shown in the panel reports its moves here and takes commands back
// (see GuidedReview); any other page still gets ← → as key presses.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { apiFetch } from '@/lib/api';

const G = '#81B64C', TEXT = '#F5F7F6', MUTED = '#87918E', CARD = '#0D1516', INNER = '#121B1D', BTN = '#1A2224', LINE = 'rgba(255,255,255,.08)';
const MARK: Record<string, { c: string; s: string }> = {
  blunder: { c: '#E5484D', s: '??' }, mistake: { c: '#E8A23A', s: '?' }, missed_win: { c: '#E8A23A', s: '?' },
  inaccuracy: { c: '#D9C54A', s: '?!' }, brilliant: { c: '#2BB5C7', s: '!!' }, great: { c: G, s: '!' },
};

type ReviewState = { ply: number; total: number; flipped: boolean; white: string; black: string; moves: { san: string; cls: string | null }[] };
type GameRow = { id: number; whiteUsername?: string; blackUsername?: string; result?: string; playedAt?: string; timeClass?: string; timeControl?: string; userColor?: string };

export function StudioRemote({ frame, appPath, onOpen, notesOn, setNotesOn, peek, setPeek, myNames }: {
  frame: RefObject<HTMLIFrameElement | null>;
  appPath: string;
  onOpen: (path: string) => void;
  notesOn: boolean; setNotesOn: (v: boolean) => void;
  peek: boolean; setPeek: (v: boolean) => void;
  /** The streamer's usernames, to name the opponent in the games list. */
  myNames: string[];
}) {
  const [rev, setRev] = useState<ReviewState | null>(null);
  const onReview = /^\/games\/[^/?]+/.test(appPath);
  const [tab, setTab] = useState<'games' | 'review' | 'live'>(onReview ? 'review' : 'games');
  useEffect(() => { if (onReview) setTab('review'); }, [appPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- talk to the page in the panel
  const send = useCallback((msg: Record<string, unknown>) => {
    try { frame.current?.contentWindow?.postMessage({ src: 'cs-remote', ...msg }, window.location.origin); } catch { /* frame gone */ }
  }, [frame]);
  const key = useCallback((k: 'ArrowLeft' | 'ArrowRight') => {
    try { frame.current?.contentWindow?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); } catch { /* */ }
  }, [frame]);
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as ({ src?: string; gone?: boolean } & Partial<ReviewState>) | null;
      if (!m || m.src !== 'cs-review') return;
      if (m.gone) { setRev(null); return; }
      setRev({ ply: m.ply ?? 0, total: m.total ?? 0, flipped: !!m.flipped, white: m.white ?? '', black: m.black ?? '', moves: m.moves ?? [] });
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [frame]);
  // A new page in the panel: forget the old review, and ask a review for its state once it loads.
  useEffect(() => {
    setRev(null);
    const f = frame.current; if (!f) return undefined;
    const hello = () => send({ cmd: 'hello' });
    f.addEventListener('load', hello);
    const t = window.setInterval(hello, 1500);
    const stop = window.setTimeout(() => window.clearInterval(t), 12000);
    return () => { f.removeEventListener('load', hello); window.clearInterval(t); window.clearTimeout(stop); };
  }, [appPath, frame, send]);

  const step = useCallback((d: number) => (rev ? send({ cmd: 'step', d }) : key(d > 0 ? 'ArrowRight' : 'ArrowLeft')), [rev, send, key]);
  const goTo = useCallback((n: number) => send({ cmd: 'go', n }), [send]);
  const mistake = useCallback((d: 1 | -1) => send({ cmd: 'mistake', d }), [send]);
  const flip = useCallback(() => send({ cmd: 'flip' }), [send]);

  // Keyboard on the Studio page itself (not while typing).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!onReview) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const d = e.key === 'ArrowRight' ? 1 : -1;
        if (e.shiftKey) mistake(d as 1 | -1); else step(d);
      } else if (e.key === ' ' && t?.tagName !== 'BUTTON') { e.preventDefault(); step(1); }
      else if (e.key === 'f' || e.key === 'F') flip();
      else if (e.key === 'Home' && rev) goTo(0);
      else if (e.key === 'End' && rev) goTo(rev.total);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onReview, rev, step, mistake, flip, goTo]);

  // ---- my games
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [gamesErr, setGamesErr] = useState(false);
  useEffect(() => {
    if (tab !== 'games' || games) return;
    apiFetch('/api/games?limit=15', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setGames((d?.games ?? []) as GameRow[]))
      .catch(() => setGamesErr(true));
  }, [tab, games]);
  const mine = myNames.map((n) => n.toLowerCase()).filter(Boolean);
  const opponentOf = (g: GameRow) => {
    const w = g.whiteUsername ?? '', b = g.blackUsername ?? '';
    if (mine.includes(w.toLowerCase())) return b;
    if (mine.includes(b.toLowerCase())) return w;
    return g.userColor === 'black' ? w : g.userColor === 'white' ? b : `${w} vs ${b}`;
  };

  // ---- timeline: where the mistakes and good moves are
  const strip = useRef<HTMLDivElement>(null);
  const cur = rev && rev.ply > 0 ? rev.moves[rev.ply - 1] : null;
  const curMark = cur?.cls ? MARK[cur.cls] : null;
  const moveLabel = (i: number) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '…'}${rev?.moves[i]?.san ?? ''}`;
  useEffect(() => {
    const row = strip.current; if (!row || !rev) return;
    const on = row.querySelector<HTMLElement>('[data-on="1"]');
    if (on) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
  }, [rev?.ply]); // eslint-disable-line react-hooks/exhaustive-deps

  const pill = (on: boolean) => (on ? { background: G, color: '#06110A' } : { color: MUTED });
  const small = { background: INNER, border: `1px solid ${LINE}`, color: '#C9CFCD' };

  return (
    <div className="mt-2 w-full max-w-[920px] rounded-[16px] p-2.5" style={{ background: CARD, border: `1px solid ${LINE}`, color: TEXT }}>
      <div className="mb-2 flex items-center gap-2">
        <div className="grid flex-1 grid-cols-3 gap-1 rounded-[11px] p-1" style={{ background: INNER }}>
          {([['games', 'My games'], ['review', 'Review'], ['live', 'Play']] as const).map(([id, l]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className="rounded-[8px] py-1.5 text-[12px] font-extrabold" style={pill(tab === id)}>{l}</button>
          ))}
        </div>
        <span className="hidden text-[10px] font-black uppercase tracking-[.12em] sm:block" style={{ color: MUTED }}>Remote · off stream</span>
      </div>

      {tab === 'games' && (
        <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
          {!games && !gamesErr && <p className="py-3 text-center text-[12px]" style={{ color: MUTED }}>Loading your games…</p>}
          {gamesErr && <p className="py-3 text-center text-[12px]" style={{ color: MUTED }}>Couldn’t load your games. <button className="underline" onClick={() => { setGamesErr(false); setGames(null); }}>Try again</button></p>}
          {games && games.length === 0 && <p className="py-3 text-center text-[12px]" style={{ color: MUTED }}>No games yet. Play one, then review it here.</p>}
          {games?.map((g) => {
            const r = (g.result ?? '').toLowerCase();
            const badge = r === 'win' ? { t: 'W', bg: G, c: '#06110A' } : r === 'loss' ? { t: 'L', bg: '#E5484D', c: '#fff' } : { t: 'D', bg: '#2A3133', c: '#C9CFCD' };
            const open = appPath.startsWith(`/games/${g.id}`);
            return (
              <button key={g.id} type="button" onClick={() => { onOpen(`/games/${g.id}`); setTab('review'); }}
                className="flex w-full items-center gap-2.5 rounded-[11px] p-2 text-left" style={{ background: INNER, boxShadow: open ? `inset 0 0 0 1.5px ${G}` : undefined }}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-[12px] font-black" style={{ background: badge.bg, color: badge.c }}>{badge.t}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px]">vs {opponentOf(g) || 'opponent'}</b>
                  <small className="block truncate text-[11px]" style={{ color: MUTED }}>{[g.timeClass ?? g.timeControl, g.playedAt ? new Date(g.playedAt).toLocaleDateString() : null].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[11px] font-black" style={{ background: G, color: '#06110A' }}>{open ? 'Showing' : 'Review'}</span>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'review' && (
        !onReview ? (
          <p className="py-3 text-center text-[12.5px]" style={{ color: MUTED }}>No review in the board panel. <button className="font-bold underline" style={{ color: G }} onClick={() => setTab('games')}>Pick a game</button></p>
        ) : (
          <>
            <div className="mb-1.5 flex items-end justify-between gap-2">
              <b className="truncate text-[20px] font-black leading-none">
                {rev ? (rev.ply === 0 ? 'Start position' : moveLabel(rev.ply - 1)) : 'Review'}
                {curMark && <span style={{ color: curMark.c }}> {curMark.s}</span>}
              </b>
              <span className="shrink-0 text-right text-[11px] font-bold leading-tight" style={{ color: MUTED }}>
                {rev ? <>Move {Math.ceil(rev.ply / 2)} of {Math.ceil(rev.total / 2)}<br /><span className="normal-case">{rev.white} vs {rev.black}</span></> : 'Waiting for the review to load…'}
              </span>
            </div>

            {rev && rev.total > 0 && (
              // Timeline: tap anywhere to jump; marks show mistakes and good moves
              <div className="relative mb-2 h-7 cursor-pointer overflow-hidden rounded-[8px]" style={{ background: INNER }}
                onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); goTo(Math.round(((e.clientX - b.left) / b.width) * rev.total)); }}>
                <div className="absolute inset-y-0 left-0" style={{ width: `${(rev.ply / rev.total) * 100}%`, background: '#1F2A2C' }} />
                {rev.moves.map((m, i) => (m.cls && MARK[m.cls] && m.cls !== 'great' ? (
                  <span key={i} className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full" title={moveLabel(i)}
                    style={{ left: `${((i + 1) / rev.total) * 100}%`, background: MARK[m.cls].c }} />
                ) : null))}
                <div className="absolute inset-y-0.5 w-1 -translate-x-1/2 rounded" style={{ left: `${(rev.ply / rev.total) * 100}%`, background: TEXT }} />
              </div>
            )}

            <div className="grid gap-1.5" style={{ gridTemplateColumns: '1fr 1fr 1.6fr 1fr 1fr' }}>
              {[
                { l: '⏮', t: 'First move', f: () => (rev ? goTo(0) : undefined), off: !rev },
                { l: '◀', t: 'Back', f: () => step(-1) },
                { l: 'Next ▶', t: 'Next move', f: () => step(1), big: true },
                { l: '▶▶', t: 'Forward 5', f: () => (rev ? goTo(rev.ply + 5) : step(1)) },
                { l: '⏭', t: 'Last move', f: () => (rev ? goTo(rev.total) : undefined), off: !rev },
              ].map((b) => (
                <button key={b.t} type="button" title={b.t} aria-label={b.t} onClick={b.f} disabled={b.off}
                  className="h-12 rounded-[12px] text-[18px] font-black transition-transform active:scale-95 disabled:opacity-40"
                  style={b.big ? { background: G, color: '#06110A', fontSize: 15 } : { background: BTN, color: TEXT }}>{b.l}</button>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[11.5px] font-extrabold sm:grid-cols-6">
              <button type="button" onClick={() => mistake(-1)} disabled={!rev} className="h-9 rounded-[10px] disabled:opacity-40" style={small}>◀ Mistake</button>
              <button type="button" onClick={() => mistake(1)} disabled={!rev} className="h-9 rounded-[10px] disabled:opacity-40" style={small}>Mistake ▶</button>
              <button type="button" onClick={flip} disabled={!rev} className="h-9 rounded-[10px] disabled:opacity-40" style={small}>⇅ Flip</button>
              <button type="button" onClick={() => setNotesOn(!notesOn)} className="h-9 rounded-[10px]" style={notesOn ? { background: G, color: '#06110A' } : small}>💬 Coach note</button>
              <button type="button" onClick={() => setPeek(!peek)} className="h-9 rounded-[10px]" style={peek ? { background: G, color: '#06110A' } : small}>⤢ Whole page</button>
              <button type="button" onClick={() => { onOpen('/games'); setTab('games'); }} className="h-9 rounded-[10px]" style={small}>📚 Games</button>
            </div>

            {rev && rev.total > 0 && (
              <div ref={strip} className="relative mt-2 flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
                <button type="button" data-on={rev.ply === 0 ? '1' : '0'} onClick={() => goTo(0)} className="shrink-0 rounded-[7px] px-2 py-1 text-[11px] font-extrabold"
                  style={rev.ply === 0 ? { background: TEXT, color: '#06110A' } : { background: INNER, color: '#C9CFCD' }}>Start</button>
                {rev.moves.map((m, i) => {
                  const on = rev.ply === i + 1, mk = m.cls ? MARK[m.cls] : null;
                  return (
                    <button key={i} type="button" data-on={on ? '1' : '0'} onClick={() => goTo(i + 1)} className="shrink-0 whitespace-nowrap rounded-[7px] px-2 py-1 text-[11px] font-extrabold"
                      style={{ ...(on ? { background: TEXT, color: '#06110A' } : { background: INNER, color: '#C9CFCD' }), boxShadow: mk && m.cls !== 'great' ? `inset 0 0 0 1.5px ${mk.c}` : undefined }}>
                      {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{m.san}{mk && m.cls !== 'great' ? ` ${mk.s}` : ''}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-center text-[10.5px]" style={{ color: MUTED }}>Keys: ← → moves · Shift+← → mistakes · Space next · F flip · Home / End</p>
          </>
        )
      )}

      {tab === 'live' && (
        <div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {[['/live', '⚡ Play online'], ['/play-now', '🤖 Quick bot game'], ['/play', '🧠 Play the computer'], ['/lichess', '♞ Lichess']].map(([p, l]) => (
              <button key={p} type="button" onClick={() => onOpen(p)} className="h-11 rounded-[11px] text-[12px] font-extrabold"
                style={appPath === p ? { background: G, color: '#06110A' } : { background: BTN, color: TEXT }}>{l}</button>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => setPeek(!peek)} className="h-9 rounded-[10px] text-[11.5px] font-extrabold" style={peek ? { background: G, color: '#06110A' } : small}>⤢ Whole page (to pick or start)</button>
            <button type="button" onClick={() => { onOpen('/games'); setTab('games'); }} className="h-9 rounded-[10px] text-[11.5px] font-extrabold" style={small}>🔎 Review a game</button>
          </div>
          <p className="mt-1.5 text-center text-[11px]" style={{ color: MUTED }}>When the game starts, the board fills the panel by itself. Use Whole page to tap through menus.</p>
        </div>
      )}
    </div>
  );
}
