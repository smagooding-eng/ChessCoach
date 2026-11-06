// "App in 20 seconds": a fast cut through every main feature (Live play, Game
// review, Weaknesses, Openings, Tactics, Endgames, Puzzles, Scan a position,
// Opponent Scout) under one hook line, ending on chessscout.net. Real boards and
// the regular move sound; optional music, and a new board look every scene or
// every move. Example numbers on screen are labelled as examples, not claims.
// Also played by the video maker (render mode).
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2, Shuffle } from 'lucide-react';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/ChessBoard';
import { LookOverride, randomLook, type BoardLook } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { apiFetch } from '@/lib/api';

const GREEN = '#81B64C';
type Kind = 'live' | 'review' | 'weak' | 'openings' | 'tactics' | 'endgames' | 'puzzles' | 'scan' | 'scout';
interface Scene { kind: Kind; title: string; line: string; fen: string; move?: string; arrow?: [string, string] }
// Real footage: the app page for each section, and how far to scroll it during the scene.
const APP_PATH: Record<Kind, { path: string; scroll: number }> = {
  live: { path: '/live', scroll: 160 }, review: { path: '/games', scroll: 420 }, weak: { path: '/analysis', scroll: 380 },
  openings: { path: '/openings', scroll: 360 }, tactics: { path: '/tactics', scroll: 520 }, endgames: { path: '/endgames', scroll: 420 },
  puzzles: { path: '/puzzles', scroll: 0 }, scan: { path: '/scan', scroll: 120 }, scout: { path: '/opponents', scroll: 300 },
};
const SCENES: Scene[] = [
  { kind: 'live', title: 'Live play', line: 'Real opponents, any clock. Daily games too.', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', move: 'Bb5' },
  { kind: 'review', title: 'Free game review', line: 'Every move rated, every mistake explained.', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 6 5', move: 'Ng5', arrow: ['g5', 'f7'] },
  { kind: 'weak', title: 'Your weaknesses', line: 'Found in your own games, then fixed.', fen: '' },
  { kind: 'openings', title: 'Openings', line: 'Drill your lines until they’re automatic.', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', move: 'Nc6', arrow: ['f1', 'c4'] },
  { kind: 'tactics', title: 'Tactics', line: 'Forks, pins, mates: learn the pattern, then drill it.', fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', move: 'Nc7+' },
  { kind: 'endgames', title: 'Endgames', line: 'Finish the games you’re winning.', fen: '8/4P3/8/8/8/8/k7/6K1 w - - 0 1', move: 'e8=Q' },
  { kind: 'puzzles', title: 'Puzzles', line: 'Puzzles at your level, every day.', fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', move: 'Re8#' },
  { kind: 'scan', title: 'Scan a position', line: 'Photo of any board → instant analysis.', fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7' },
  { kind: 'scout', title: 'Opponent Scout', line: 'See what they play before the game starts.', fen: '' },
];

export interface FeatureBlitzOpts { hook: string; beat: number; music: MusicStyle; looks: 'mine' | 'scene' | 'move'; footage?: 'app' | 'boards' }
export const FEATURE_BLITZ_DEFAULT: FeatureBlitzOpts = { hook: "Use this app for a week and you'll never go back to Chess.com", beat: 3.6, music: 'hype', looks: 'scene', footage: 'app' };

/** The real app page in a phone-sized frame, scrolled a little while it's on screen. */
// Scenes that open one thing inside their section part-way through: an opening
// trainer, a tactic, an endgame pattern. (Their scenes run twice as long.)
const FLOW: Partial<Record<Kind, { to: string; at: number }>> = {
  // '' = found on the page: the first weakness on the Analysis page.
  weak: { to: '', at: 0.36 },
  // Scan: a photo is scanned, then the position opens with the engine's ratings.
  scan: { to: '/explore?from=scan&fen=' + encodeURIComponent('r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7'), at: 0.42 },
  // Scout: the account's latest scouting report ('' = found from its history).
  scout: { to: '', at: 0.34 },
  openings: { to: '/practice?tab=openings&eco=C50', at: 0.38 },
  tactics: { to: '/tactics/fork', at: 0.32 },
  endgames: { to: '/tactics/rook-endgame', at: 0.32 },
};
// Where to find the link a scene taps into (when its page decides it).
const DISCOVER: Partial<Record<Kind, string>> = { weak: 'a[href*="/analysis/"]' };
const EMPTY = /no games imported|no puzzles match|is part of pro|import your games to|no games yet|nothing here yet|no weaknesses yet/i;
const FAILED = /didn.?t load|couldn.?t load|something went wrong|not found|failed to load|try again later/i;

/** Waits for one frame's page: content drawn, nothing spinning or skeleton-loading.
 *  An error page, or still loading after 25 seconds, counts as failed. */
function useFrameReady(ref: React.RefObject<HTMLIFrameElement | null>, src: string | undefined, onDone: (ok: boolean, text: string) => void) {
  useEffect(() => {
    if (!src) return;
    let done = false; const t0 = Date.now(); let calm = 0;
    const id = setInterval(() => {
      if (done) return;
      let ok = false, bad = false;
      try {
        const d = ref.current?.contentDocument;
        const text = d?.getElementById('root')?.innerText ?? '';
        const loading = !!d?.querySelector('.animate-spin, [aria-busy="true"]') || (d?.querySelectorAll('.animate-pulse').length ?? 0) >= 4;
        ok = !!d && d.readyState === 'complete' && text.length > 120 && !loading;
        bad = !!d && d.readyState === 'complete' && !loading && text.length < 600 && FAILED.test(text);
      } catch { ok = true; }
      if (bad || Date.now() - t0 > 25_000) { done = true; clearInterval(id); onDone(false, ''); return; }
      calm = ok ? calm + 1 : 0;
      if (calm >= 4) { done = true; clearInterval(id); let t = ''; try { t = ref.current?.contentDocument?.getElementById('root')?.innerText ?? ''; } catch { /* ignore */ } onDone(true, t); }
    }, 300);
    return () => clearInterval(id);
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The real app page in a phone-sized frame. While it's on screen it scrolls slowly
 *  through the page; a game review plays through the game first; a scene with a
 *  second page (an opening trainer, a tactic…) taps through to it. Both pages are
 *  loaded before the clip starts, so nothing is ever seen loading. */
function AppScreen({ src, src2, flowAt = 0.35, pos, scroll, beat, onReady, onFail, review = false, solve = false, discover, onDiscover, onEmpty, scanFx = false }: { src: string; src2?: string; flowAt?: number; pos: -1 | 0 | 1; scroll: number; beat: number; onReady: (src: string) => void; onFail: (src: string, which: 'page' | 'second') => void; review?: boolean; solve?: boolean; discover?: string; onDiscover?: (path: string | null) => void; onEmpty?: (empty: boolean) => void; scanFx?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const ref2 = useRef<HTMLIFrameElement>(null);
  const active = pos === 0;
  const ok = useRef<{ a: boolean; b: boolean }>({ a: false, b: !src2 });
  const check = () => { if (ok.current.a && ok.current.b) onReady(src); };
  useEffect(() => { ok.current.a = false; }, [src]);
  // Dropping the second page (it failed) shouldn't hold the scene up.
  useEffect(() => { ok.current.b = !src2; if (!src2) check(); }, [src2]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrameReady(ref, src, (good, text) => {
    if (!good) { onFail(src, 'page'); return; }
    onEmpty?.(EMPTY.test(text));
    ok.current.a = true;
    // A scene that taps into something on its page finds the link now.
    if (discover && !src2 && onDiscover) {
      let href: string | null = null;
      try { href = ref.current?.contentDocument?.querySelector<HTMLAnchorElement>(discover)?.getAttribute('href') ?? null; } catch { /* ignore */ }
      onDiscover(href);
      if (href) return; // wait for that page to load too
    }
    check();
  });
  useFrameReady(ref2, src2, (good) => { if (!good) { onFail(src, 'second'); return; } ok.current.b = true; check(); });
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 390));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const [second, setSecond] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [tap, setTap] = useState(0);
  useEffect(() => {
    const w = ref.current?.contentWindow; if (!w) return;
    try { w.scrollTo({ top: 0 }); ref2.current?.contentWindow?.scrollTo({ top: 0 }); } catch { /* ignore */ }
    setSecond(false);
    if (!active) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    const scrollTo = (win: Window, to: number, after: number, dur: number) => {
      timers.push(setTimeout(() => {
        const from = win.scrollY || 0, t0 = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / dur);
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          try { win.scrollTo({ top: Math.round(from + (to - from) * e) }); } catch { /* ignore */ }
          if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      }, after));
    };
    const total = beat * 1000;
    if (review) {
      const moves = 5, gap = 650;
      for (let n = 0; n < moves; n++) timers.push(setTimeout(() => { try { w.dispatchEvent(new (w as unknown as typeof window).KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); } catch { /* ignore */ } }, 600 + n * gap));
      // Then one steady scroll down through the review that lasts to the end of the scene.
      const after = 600 + moves * gap + 200;
      const h = (() => { try { return Math.max(0, (w.document.documentElement.scrollHeight || 0) - 780); } catch { return 1600; } })();
      scrollTo(w, Math.min(h, 700), after, Math.max(900, total - after - 100));
    } else if (src2) {
      const at = total * flowAt;
      if (scroll) scrollTo(w, Math.min(scroll, 360), 500, Math.max(500, at - 1100));
      timers.push(setTimeout(() => setTap((x) => x + 1), at - 450));
      if (scanFx) timers.push(setTimeout(() => setScanning(true), Math.max(300, at - 1500)), setTimeout(() => setScanning(false), at + 150));
      timers.push(setTimeout(() => {
        setSecond(true);
        // The page underneath restarts its demo now that it's on screen.
        try { ref2.current?.contentWindow?.postMessage({ type: 'cs-studio-restart' }, '*'); } catch { /* ignore */ }
      }, at));
    } else if (solve) {
      // The page solves its puzzle itself once it's on screen.
      timers.push(setTimeout(() => { try { w.postMessage({ type: 'cs-studio-restart' }, '*'); } catch { /* ignore */ } }, 500));
    } else {
      timers.push(setTimeout(() => setTap((x) => x + 1), Math.min(1100, total * 0.3)));
      if (scroll) scrollTo(w, scroll, 700, Math.max(800, total - 1300));
    }
    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const frameStyle = { width: 390, height: 780, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#0B1112' } as const;
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden rounded-[5cqw]"
      style={{ transform: `translateX(${pos * 110}%) scale(${active ? 1 : 0.92})`, opacity: active ? 1 : 0, transition: 'transform .45s cubic-bezier(.2,.8,.2,1), opacity .35s', pointerEvents: 'none' }}>
      <iframe ref={ref} src={src} title="" tabIndex={-1} aria-hidden="true" style={{ ...frameStyle, position: 'absolute', inset: 0 }} />
      {src2 && <iframe ref={ref2} src={src2} title="" tabIndex={-1} aria-hidden="true" style={{ ...frameStyle, position: 'absolute', inset: 0, opacity: second ? 1 : 0, transition: 'opacity .35s' }} />}
      {/* "Scanning a photo": a framed board shot with a sweeping line. */}
      {active && scanning && (
        <div className="absolute inset-0 z-10 grid place-items-center" style={{ background: 'rgba(5,8,6,.82)' }}>
          <div className="relative w-[72%]" style={{ aspectRatio: '1 / 1' }}>
            <div className="absolute inset-0 rounded-[6%]" style={{ border: '3px dashed rgba(255,255,255,.7)' }} />
            <div className="absolute inset-[6%] grid grid-cols-8 overflow-hidden rounded-[3%]" style={{ filter: 'blur(0.4px) saturate(.9)' }}>
              {Array.from({ length: 64 }, (_, q) => <span key={q} style={{ background: (Math.floor(q / 8) + q) % 2 ? '#769656' : '#EEEED2' }} />)}
            </div>
            <motion.div className="absolute inset-x-[2%] h-[3%] rounded-full" style={{ background: '#81B64C', boxShadow: '0 0 16px #81B64C' }} initial={{ top: '2%' }} animate={{ top: ['2%', '94%', '2%'] }} transition={{ duration: 1.3, ease: 'easeInOut' }} />
            <p className="absolute -bottom-[16%] inset-x-0 text-center text-[15px] font-black text-white">Reading the board…</p>
          </div>
        </div>
      )}
      {active && tap > 0 && (
        <motion.span key={tap} className="absolute left-1/2 top-[38%] block h-[16%] w-[16%] -translate-x-1/2 rounded-full" style={{ border: '3px solid rgba(255,255,255,.85)', background: 'rgba(255,255,255,.18)' }}
          initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 1.5] }} transition={{ duration: 0.7 }} />
      )}
    </div>
  );
}

type Phase = 'idle' | 'hook' | 'scene' | 'end' | 'done';

function afterMove(fen: string, san?: string) {
  if (!san) return { fen, last: null as { from: string; to: string } | null };
  try { const c = new Chess(fen); const m = c.move(san); return { fen: c.fen(), last: { from: m.from, to: m.to } }; } catch { return { fen, last: null }; }
}

export function FeatureBlitz({ opts: initial = FEATURE_BLITZ_DEFAULT, render = false, onClose }: { opts?: FeatureBlitzOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<FeatureBlitzOpts>(initial);
  const [phase, setPhase] = useState<Phase>('idle');
  const [k, setK] = useState(0); // scene
  const [moved, setMoved] = useState(false); // the scene's move has been played
  const [clean, setClean] = useState(false);
  const [blank, setBlank] = useState(false);
  const [seed, setSeed] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const rec = useRef<MediaRecorder | null>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => { clear(); music.current?.stop(); routeSoundsTo(null, null); }, []);

  // Board looks: one per scene, or a fresh one each move.
  const looks = useMemo(() => SCENES.map(() => [randomLook(), randomLook()] as [BoardLook, BoardLook]), [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const look: BoardLook | null = opts.looks === 'mine' ? null : opts.looks === 'scene' ? looks[k][0] : looks[k][moved ? 1 : 0];

  // ── Real app footage ──
  const appFootage = (opts.footage ?? 'app') === 'app';
  // Shown signed in as the ChessScout.net account (not yours), in frames of their own.
  const [account, setAccount] = useState(() => { try { return localStorage.getItem('cs_studio_showcase') || 'chessscout'; } catch { return 'chessscout'; } });
  const [accountDraft, setAccountDraft] = useState(account);
  const [showcase, setShowcase] = useState<{ token: string | null; name: string | null; error?: string; games?: number; reviewed?: number; linked?: string | null } | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!appFootage) return;
    setShowcase(null);
    void apiFetch('/api/admin/studio/showcase-session', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: account }) })
      .then(async (r) => { const d = await r.json().catch(() => null); setShowcase(r.ok && d?.token ? { token: d.token, name: d.name, games: d.games, reviewed: d.reviewed, linked: d.linked } : { token: null, name: null, error: d?.error ?? "Couldn't sign in to that account" }); })
      .catch(() => setShowcase({ token: null, name: null, error: "Couldn't sign in to that account" }));
  }, [account, appFootage, reload]);
  // Fill the showcase account: import its games, find its weaknesses, review a game.
  const [importFrom, setImportFrom] = useState('');
  const [setup, setSetup] = useState<string | null>(null);
  const runSetup = async () => {
    const tok = showcase?.token; const who = (importFrom || showcase?.linked || '').trim();
    if (!tok || !who) { setSetup('Type the Chess.com username whose games this account should have.'); return; }
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
    try {
      setSetup('Importing games…');
      const im = await apiFetch('/api/games/import', { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ username: who, platform: 'chesscom', months: 2 }) });
      if (!im.ok) { const d = await im.json().catch(() => null); setSetup(d?.error ?? "Couldn't import those games."); return; }
      setSetup('Finding weaknesses…');
      await apiFetch('/api/analysis/start', { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ username: who }) }).catch(() => null);
      setSetup('Reviewing a game…');
      const list = await apiFetch('/api/games?limit=5', { credentials: 'include', headers: H }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const g = list?.games?.[0];
      if (g?.id) await apiFetch(`/api/games/${g.id}/review`, { method: 'POST', credentials: 'include', headers: H, body: '{}' }).catch(() => null);
      setSetup('Scouting an opponent…');
      const opp = list?.games?.[0] ? ((list.games[0].whiteUsername ?? '').toLowerCase() === who.toLowerCase() ? list.games[0].blackUsername : list.games[0].whiteUsername) : null;
      if (opp) {
        const st = await apiFetch('/api/opponents/start', { method: 'POST', credentials: 'include', headers: { ...H, 'x-chess-username': who }, body: JSON.stringify({ username: opp }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const jobId = st?.jobId ?? st?.id;
        for (let n = 0; jobId && n < 40; n++) {
          await new Promise((res) => setTimeout(res, 3000));
          const js = await apiFetch(`/api/opponents/status/${jobId}`, { credentials: 'include', headers: H, cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          const status = js?.status ?? js?.job?.status;
          if (status === 'done' || status === 'error') break;
        }
      }
      setSetup('Done. Reloading the footage…');
      readySet.current.clear(); setFailed({}); setFlowFailed({}); setFound({});
      setReload((x) => x + 1);
      setTimeout(() => setSetup(null), 4000);
    } catch { setSetup('Something went wrong setting it up.'); }
  };
  // Scenes whose page has nothing to show yet (empty account, needs games…).
  const [empty, setEmpty] = useState<Record<string, boolean>>({});

  // That account's latest scouting report, for the scout scene.
  useEffect(() => {
    if (!showcase) return;
    void apiFetch('/api/opponents/history', { credentials: 'include', headers: showcase.token ? { Authorization: `Bearer ${showcase.token}` } : {} })
      .then((r) => (r.ok ? r.json() : null)).then((d) => {
        const id = d?.scouts?.[0]?.id;
        if (id) setFound((f) => ({ ...f, scout: `/opponents?job=${id}` }));
        else setFlowFailed((f) => ({ ...f, scout: true }));
      }).catch(() => {});
  }, [showcase]);

  // That account's latest reviewed game, for the review scene.
  const [reviewPath, setReviewPath] = useState('/games');
  useEffect(() => {
    if (!showcase) return;
    void apiFetch('/api/games?limit=30', { credentials: 'include', headers: showcase.token ? { Authorization: `Bearer ${showcase.token}` } : {} }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const g = (d?.games ?? []).find((x: { reviewed?: boolean }) => x.reviewed) ?? d?.games?.[0];
      setReviewPath(g?.id ? `/games/${g.id}` : '/games');
    }).catch(() => {});
  }, [showcase]);
  // Each scene's page, with its own random board look.
  // A page that showed an error falls back to a safer one (the review → your games list).
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [flowFailed, setFlowFailed] = useState<Record<string, boolean>>({});
  const [found, setFound] = useState<Record<string, string | null>>({});
  // A path with the frame's sign-in and board look added to its own query.
  const withQ = (pathWithQuery: string, j: number) => {
    const [path, own] = pathWithQuery.split('?');
    const q = new URLSearchParams(own ?? '');
    if (showcase?.token) q.set('studioAs', showcase.token);
    if (showcase?.token && opts.looks !== 'mine') q.set('studioLook', JSON.stringify(looks[j][0]));
    const qs = q.toString();
    return `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}${qs ? `?${qs}` : ''}`;
  };
  const srcOf = (j: number) => {
    const x = SCENES[j];
    const path = x.kind === 'review' ? (failed.review || !reviewPath ? '/games' : reviewPath) : failed[x.kind] && x.kind !== 'live' ? '/' : APP_PATH[x.kind].path;
    return withQ(path, j);
  };
  // Wait for every page to finish loading before the clip starts.
  const [, bump] = useState(0);
  const readySet = useRef(new Set<string>());
  const markReady = (src: string) => { if (!readySet.current.has(src)) { readySet.current.add(src); bump((x) => x + 1); } };
  const readyN = showcase ? SCENES.filter((_, j) => readySet.current.has(srcOf(j))).length : 0;
  const allReady = !appFootage || readyN >= SCENES.length;
  const allReadyRef = useRef(allReady); allReadyRef.current = allReady;
  const pending = useRef<null | (() => void)>(null);
  useEffect(() => { if (allReady && pending.current) { const f = pending.current; pending.current = null; f(); } }, [allReady]);
  useEffect(() => {
    if (!render) return;
    const w = window as unknown as { __studioRender?: Record<string, unknown> };
    if (w.__studioRender) w.__studioRender.ready = allReady;
  }, [allReady, render]);

  // The game review gets three times as long: it plays through the game and the review.
  const lenOf = (sc: Scene) => opts.beat * 1000 * (!appFootage ? 1 : sc.kind === 'review' ? 1.8 : sc.kind === 'puzzles' ? 2.2 : FLOW[sc.kind] && !flowFailed[sc.kind] ? 2 : 1);
  // (Scout and Weaknesses find their second page from the account; until then they run as one page.)
  const total = () => 2800 + SCENES.reduce((a, sc) => a + lenOf(sc), 0) + 3400;
  const play = (onDone?: () => void) => {
    // App footage: start once every page has loaded.
    if (!allReadyRef.current) { clear(); setPhase('idle'); pending.current = () => play(onDone); return; }
    clear(); if (!appFootage) setSeed((x) => x + 1); // (new looks would reload the app pages)
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (opts.music !== 'off') m.start(opts.music); } catch { /* ignore */ }
    setPhase('hook'); setK(0); setMoved(false);
    later(150, () => mus().accent('riser'));
    let t = 2800;
    SCENES.forEach((sc, j) => {
      const beat = lenOf(sc);
      later(t, () => { setPhase('scene'); setK(j); setMoved(false); mus().accent('whoosh'); });
      // The board plays the regular move sound itself.
      if (sc.move) later(t + Math.min(650, beat * 0.35), () => setMoved(true));
      t += beat;
    });
    later(t, () => { setPhase('end'); mus().accent('impact'); });
    later(t + 3400, () => { setPhase('done'); music.current?.stop(); onDone?.(); });
  };
  useEffect(() => { if (!render) play(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const enterClean = () => { clear(); music.current?.stop(); setClean(true); setBlank(true); setPhase('idle'); later(5000, () => { setBlank(false); play(); }); };

  useEffect(() => {
    if (!render) return;
    const w = window as unknown as { __studioRender?: Record<string, unknown> };
    w.__studioRender = { ready: allReadyRef.current, done: false, start: () => {
      const m = mus(); routeSoundsTo(m.unlock(), m.sfx);
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((x) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(x)) ?? '';
      const chunks: Blob[] = [];
      try {
        const r = new MediaRecorder(m.stream, type ? { mimeType: type, audioBitsPerSecond: 192_000 } : undefined);
        r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        r.onstop = () => {
          const ended = Date.now(); const fr = new FileReader();
          fr.onload = () => { w.__studioRender = { ...(w.__studioRender ?? {}), audio: String(fr.result).split(',')[1] ?? '', ext: type.includes('mp4') ? 'm4a' : 'webm', endedAt: ended, done: true }; };
          fr.readAsDataURL(new Blob(chunks, { type: type || 'audio/webm' }));
        };
        r.start(500); rec.current = r;
      } catch { /* finish without audio */ }
      (w.__studioRender as Record<string, unknown>).startedAt = Date.now();
      play(() => setTimeout(() => {
        if (rec.current?.state === 'recording') rec.current.stop();
        else w.__studioRender = { ...(w.__studioRender ?? {}), endedAt: Date.now(), done: true };
      }, 300));
    } };
  }, [render]); // eslint-disable-line react-hooks/exhaustive-deps

  const sc = SCENES[k];
  const shown = sc.fen ? (moved ? afterMove(sc.fen, sc.move) : { fen: sc.fen, last: null }) : null;
  const flipped = sc.fen ? sc.fen.split(' ')[1] === 'b' && sc.kind !== 'review' : false;

  const visual = (() => {
    if (sc.kind === 'weak') return (
      <div className="w-[80cqw] space-y-[2.4cqh] rounded-[4cqw] p-[5cqw]" style={{ background: 'rgba(255,255,255,.06)' }}>
        {[['Hanging pieces', 78], ['Back-rank safety', 55], ['Endgame technique', 40]].map(([label, v], j) => (
          <div key={label as string}>
            <p className="mb-[0.8cqh] font-extrabold" style={{ fontSize: '4cqw' }}>{label}</p>
            <div className="h-[1.6cqh] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.1)' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ delay: 0.15 + j * 0.15, duration: 0.6 }} className="h-full rounded-full" style={{ background: j === 0 ? '#FF6B6B' : j === 1 ? '#E8B447' : GREEN }} />
            </div>
          </div>
        ))}
        <p className="text-center" style={{ fontSize: '3cqw', color: 'rgba(255,255,255,.5)' }}>Example report</p>
      </div>
    );
    if (sc.kind === 'scout') return (
      <div className="w-[80cqw] space-y-[1.6cqh] rounded-[4cqw] p-[5cqw]" style={{ background: 'rgba(255,255,255,.06)' }}>
        <div className="flex items-center gap-[3cqw]">
          <span className="grid h-[12cqw] w-[12cqw] place-items-center rounded-full font-black" style={{ background: '#2B3A2A', fontSize: '6cqw' }}>?</span>
          <div><p className="font-black" style={{ fontSize: '5cqw' }}>Your next opponent</p><p style={{ fontSize: '3.4cqw', color: 'rgba(255,255,255,.6)' }}>Scouted from their recent games</p></div>
        </div>
        {['As White: 1.e4 most games', 'As Black vs 1.e4: the Sicilian', 'Weak spot: endgames'].map((t, j) => (
          <motion.p key={t} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + j * 0.18 }} className="rounded-[2.4cqw] px-[3cqw] py-[1.4cqh] font-bold" style={{ background: 'rgba(255,255,255,.07)', fontSize: '3.8cqw' }}>{t}</motion.p>
        ))}
        <p className="text-center" style={{ fontSize: '3cqw', color: 'rgba(255,255,255,.5)' }}>Example scouting report</p>
      </div>
    );
    const board = shown && (
      <LookOverride look={look}>
        <div className="relative w-[84cqw]">
          <ChessBoard fen={shown.fen} lastMove={shown.last} flipped={flipped} maxWidthOverride="100%" suppressConfirmMoves
            moveQuality={sc.kind === 'review' && moved ? 'great' : sc.kind === 'tactics' && moved ? 'brilliant' : null}
            arrows={sc.arrow && (sc.kind === 'openings' || moved) ? [{ from: sc.arrow[0], to: sc.arrow[1], color: sc.kind === 'review' ? 'rgba(129,182,76,.9)' : 'rgba(232,180,71,.85)' }] : undefined} />
          {sc.kind === 'scan' && (
            <>
              <motion.div className="pointer-events-none absolute inset-x-0 h-[1.2cqh] rounded-full" style={{ background: GREEN, boxShadow: `0 0 18px ${GREEN}` }} initial={{ top: '0%' }} animate={{ top: ['0%', '96%', '0%'] }} transition={{ duration: opts.beat * 0.9, ease: 'easeInOut' }} />
              <div className="pointer-events-none absolute -inset-[2cqw] rounded-[3cqw]" style={{ border: '3px dashed rgba(255,255,255,.55)' }} />
            </>
          )}
          {sc.kind === 'live' && <span className="absolute -top-[4.4cqh] left-0 rounded-full px-[2.4cqw] py-[0.4cqh] font-black text-white" style={{ background: '#FF5058', fontSize: '3.2cqw' }}>● LIVE</span>}
          {sc.kind === 'puzzles' && moved && <span className="absolute -top-[4.4cqh] right-0 rounded-full px-[2.4cqw] py-[0.4cqh] font-black" style={{ background: GREEN, fontSize: '3.2cqw' }}>Solved ✓</span>}
          {sc.kind === 'review' && moved && <span className="absolute -top-[4.4cqh] right-0 rounded-full px-[2.4cqw] py-[0.4cqh] font-black" style={{ background: '#3B9EDB', fontSize: '3.2cqw' }}>! Great move</span>}
        </div>
      </LookOverride>
    );
    return board;
  })();

  const frame = (
    <div className="relative overflow-hidden" style={{ aspectRatio: '9 / 16', height: clean || render ? '100dvh' : 'min(78dvh, 820px)', maxWidth: '100%', containerType: 'size', background: 'radial-gradient(120% 80% at 50% 30%, #1d2a17 0%, #0d110c 55%, #070807 100%)', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}
      onClick={() => { if (clean && (phase === 'done' || phase === 'idle')) setClean(false); }}>
      {/* Real app footage: every section's page stays loaded; the current one shows. */}
        {appFootage && showcase && (
          <div className="pointer-events-none absolute left-1/2 z-10 h-[60cqh] w-[30cqh] -translate-x-1/2 rounded-[5cqw]"
            style={{ bottom: '9.5cqh', opacity: phase === 'scene' ? 1 : 0, transition: 'opacity .2s', boxShadow: '0 0 0 1.2cqw #1C1F1E, 0 0 0 1.5cqw rgba(255,255,255,.12), 0 18px 50px rgba(0,0,0,.6)' }}>
            {SCENES.map((x, j) => (
              <AppScreen key={x.kind} src={srcOf(j)} pos={phase !== 'scene' ? 1 : j < k ? -1 : j === k ? 0 : 1} scroll={APP_PATH[x.kind].scroll} beat={lenOf(x) / 1000} review={x.kind === 'review' && !failed.review && reviewPath !== '/games'} solve={x.kind === 'puzzles' && !failed.puzzles} src2={failed[x.kind] || flowFailed[x.kind] || !FLOW[x.kind] ? undefined : FLOW[x.kind]!.to ? withQ(FLOW[x.kind]!.to, j) : found[x.kind] ? withQ(found[x.kind]!, j) : undefined}
                onEmpty={(e) => setEmpty((m) => { if (!!m[x.kind] === e) return m; const n = { ...m }; if (e) n[x.kind] = true; else delete n[x.kind]; return n; })}
                discover={DISCOVER[x.kind]} scanFx={x.kind === 'scan'} onDiscover={(href) => { if (!href) setFlowFailed((f) => ({ ...f, [x.kind]: true })); else setFound((f) => (f[x.kind] === href ? f : { ...f, [x.kind]: href.replace(/\?.*$/, '') })); }} flowAt={FLOW[x.kind]?.at} onReady={markReady} onFail={(src, which) => { if (which === 'page' && failed[x.kind]) { markReady(src); return; } (which === 'second' ? setFlowFailed : setFailed)((f) => (f[x.kind] ? f : { ...f, [x.kind]: true })); }} />
            ))}
          </div>
        )}

      {appFootage && !allReady && phase === 'idle' && !blank && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-[2cqh] text-center" style={{ background: '#0B1112' }}>
          <div className="h-[8cqw] w-[8cqw] animate-spin rounded-full border-[0.8cqw] border-white/15 border-t-[#81B64C]" />
          <p className="font-extrabold" style={{ fontSize: '4.4cqw' }}>Loading the app… {readyN}/{SCENES.length}</p>
        </div>
      )}
      {!blank && phase !== 'idle' && (<>
        {/* The hook stays on top the whole time. */}
        <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: phase === 'end' || phase === 'done' ? 0 : 1, y: 0, scale: phase === 'hook' ? 1.08 : 1 }} transition={{ duration: 0.35 }}
          className="absolute inset-x-0 z-20 px-[6cqw] text-center font-black leading-[1.12]"
          style={{ top: phase === 'hook' ? '36cqh' : '7cqh', fontSize: phase === 'hook' ? '8.2cqw' : '5.4cqw', textShadow: '0 3px 14px rgba(0,0,0,.7)', transition: 'top .45s ease, font-size .45s ease' }}>
          {opts.hook}
        </motion.p>

        <AnimatePresence mode="wait">
          {phase === 'scene' && (
            <motion.div key={k} initial={{ opacity: 0, scale: 0.9, x: 40 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 1.04, x: -40 }} transition={{ duration: 0.22 }}
              className="absolute inset-0 flex flex-col items-center justify-center pt-[8cqh]">
              <p className="mb-[0.6cqh] font-black" style={{ fontSize: '3.4cqw', color: GREEN, letterSpacing: '.14em' }}>{String(k + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}</p>
              <p className="font-black leading-none" style={{ fontSize: '10cqw', letterSpacing: '-0.02em' }}>{sc.title}</p>
              <p className="mb-[3.4cqh] mt-[1cqh] px-[8cqw] text-center font-bold" style={{ fontSize: '4.2cqw', color: 'rgba(255,255,255,.75)' }}>{sc.line}</p>
              {appFootage ? <div className="h-[60cqh] w-[30cqh]" /> : visual}
            </motion.div>
          )}
          {(phase === 'end' || phase === 'done') && (
            <motion.div key="end" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-[6cqw] text-center">
              <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" className="mb-[2.4cqh] h-[22cqw] w-[22cqw]" />
              <p className="font-black leading-none" style={{ fontSize: '11cqw', letterSpacing: '-0.02em' }}>Chess<span style={{ color: GREEN }}>Scout</span>.net</p>
              <p className="mt-[2cqh] font-extrabold" style={{ fontSize: '5cqw', color: 'rgba(255,255,255,.8)' }}>All of it. Free to start.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'scene' && (
          <div className="absolute inset-x-[8cqw] bottom-[6cqh] flex gap-[1cqw]">
            {SCENES.map((_, j) => <span key={j} className="h-[0.7cqh] flex-1 rounded-full" style={{ background: j <= k ? GREEN : 'rgba(255,255,255,.18)' }} />)}
          </div>
        )}
      </>)}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  const pill = (on: boolean) => ({ background: on ? GREEN : 'rgba(255,255,255,.07)' });
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">App in {Math.round(total() / 1000)} seconds</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame}
        <div className="w-full max-w-[420px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">App in {Math.round(total() / 1000)} seconds</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-[12.5px] text-white/60">A fast cut through every feature: {SCENES.map((s) => s.title).join(', ')}. Ends on chessscout.net.</p>
          <label className="block text-[12px] text-white/60">Hook (stays on top)<input value={opts.hook} onChange={(e) => setOpts({ ...opts, hook: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
          <div className="flex flex-wrap gap-1.5">
            {["Use this app for a week and you'll never go back to Chess.com", 'Everything Chess.com charges for. Free.', '9 reasons I stopped opening Chess.com'].map((h) => (
              <button key={h} onClick={() => setOpts({ ...opts, hook: h })} className="rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={pill(opts.hook === h)}>{h}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-white/60">Pace:</span>
            {[[2.8, 'Quick'], [3.6, 'Normal'], [4.6, 'Relaxed']].map(([b, l]) => <button key={l} onClick={() => setOpts({ ...opts, beat: b as number })} className="rounded-full px-2.5 py-1 font-bold" style={pill(opts.beat === b)}>{l as string}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-white/60">Footage:</span>
            {([['app', 'The real app'], ['boards', 'Board animations']] as const).map(([v, l]) => <button key={v} onClick={() => setOpts({ ...opts, footage: v })} className="rounded-full px-2.5 py-1 font-bold" style={pill((opts.footage ?? 'app') === v)}>{l}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-white/60">Board:</span>
            {(appFootage ? ([['scene', 'Random board every scene'], ['mine', 'Account’s own board']] as const) : ([['scene', 'New look every scene'], ['move', 'Every move'], ['mine', 'My board']] as const)).map(([v, l]) => <button key={v} onClick={() => setOpts({ ...opts, looks: v })} className="rounded-full px-2.5 py-1 font-bold" style={pill(opts.looks === v)}>{l}</button>)}
            {opts.looks !== 'mine' && <button onClick={() => setSeed((x) => x + 1)} className="rounded-full bg-white/10 px-2 py-1" aria-label="Shuffle looks"><Shuffle size={12} /></button>}
          </div>
          {appFootage && (
            <div className="space-y-1 rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
              <label className="block text-[12px] text-white/60">Account shown in the footage
                <span className="mt-0.5 flex gap-1.5">
                  <input value={accountDraft} onChange={(e) => setAccountDraft(e.target.value)} className="min-w-0 flex-1 rounded-md bg-white/5 px-2.5 py-1.5 text-[13px] font-bold text-white ring-1 ring-white/10" />
                  <button onClick={() => { const v = accountDraft.trim(); if (!v) return; try { localStorage.setItem('cs_studio_showcase', v); } catch { /* ignore */ } setAccount(v); }} className="rounded-md bg-white/10 px-2.5 text-[12px] font-bold">Use</button>
                </span>
              </label>
              <p className="text-[11.5px]" style={{ color: showcase?.error ? '#FF9AA0' : 'rgba(255,255,255,.5)' }}>
                {!showcase ? 'Signing in…' : showcase.error ? `${showcase.error}. Showing your own account instead.` : `Showing ${showcase.name}: ${showcase.games ?? 0} games, ${showcase.reviewed ?? 0} reviewed. Loaded ${readyN}/${SCENES.length}.`}
              </p>
              {showcase?.token && ((showcase.games ?? 0) < 5 || (showcase.reviewed ?? 0) < 1 || Object.keys(empty).length > 0) && (
                <div className="space-y-1 border-t border-white/10 pt-1.5">
                  <p className="text-[11.5px] text-[#E8B447]">
                    {Object.keys(empty).length ? `Nothing to show yet in: ${SCENES.filter((x) => empty[x.kind]).map((x) => x.title).join(', ')}. ` : ''}This account needs games so the footage has something real in it.
                  </p>
                  <span className="flex gap-1.5">
                    <input value={importFrom} onChange={(e) => setImportFrom(e.target.value)} placeholder={showcase.linked ? `Chess.com: ${showcase.linked}` : 'Chess.com username to import'} className="min-w-0 flex-1 rounded-md bg-white/5 px-2.5 py-1.5 text-[12.5px] text-white ring-1 ring-white/10" />
                    <button onClick={() => void runSetup()} disabled={!!setup && !setup.startsWith('Done')} className="rounded-md bg-[#81B64C] px-2.5 text-[12px] font-bold text-white disabled:opacity-50">Set it up</button>
                  </span>
                  {setup && <p className="text-[11.5px] text-white/60">{setup}</p>}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-white/60">Music:</span>
            {(['hype', 'epic', 'lofi', 'off'] as MusicStyle[]).map((v) => <button key={v} onClick={() => setOpts({ ...opts, music: v })} className="rounded-full px-2.5 py-1 font-bold capitalize" style={pill(opts.music === v)}>{v === 'off' ? 'None' : v}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => play()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Play size={14} />Replay</button>
            <button onClick={enterClean} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
            <RenderMp4 name="chessscout-app-in-20s" shareText="Everything in one chess app ♞ chessscout.net" payload={() => ({ source: { kind: 'featureBlitz', opts }, prefs: {} })} />
          </div>
        </div>
      </div>
    </div>
  );
}
