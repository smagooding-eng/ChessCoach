import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Loader2, RefreshCw, Search, Clapperboard, Shuffle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { MiniBoard } from '@/components/MiniBoard';
import { useUser } from '@/hooks/use-user';
import { StudioPlayer, themeLabel, type StudioMoment, type StudioTrap, type StudioSource, type StudioPuzzle, type StudioReview } from '@/components/studio/StudioPlayer';
import { Chess } from 'chess.js';

// Admin > Content Studio: notable moments from every reviewed game on the
// site (not only the admin's), filterable by what happened — brilliant moves,
// traps, forks, sacrifices, mates, blunders, endgames — and by opening. Pick
// one to open it in the 9:16 Studio player for TikTok / Reels / Shorts.

interface Moment extends StudioMoment { id: number; fenBefore: string; score: number; playedAt: string | null; evalAfter: number | null }

const TAGS: { id: string; label: string }[] = [
  { id: 'brilliant', label: 'Brilliant !!' }, { id: 'great', label: 'Great !' }, { id: 'trap', label: 'Traps' }, { id: 'checkmate', label: 'Checkmates' },
  { id: 'sacrifice', label: 'Sacrifices' }, { id: 'fork', label: 'Forks' }, { id: 'pin', label: 'Pins' }, { id: 'skewer', label: 'Skewers' },
  { id: 'discovered', label: 'Discovered attacks' }, { id: 'promotion', label: 'Promotions' }, { id: 'missed_win', label: 'Missed wins' },
  { id: 'blunder', label: 'Blunders ??' }, { id: 'endgame', label: 'Endgames' }, { id: 'opening', label: 'Opening phase' },
];
const TAG_COLOR: Record<string, string> = { brilliant: '#1BACA6', great: '#4A8BD6', trap: '#E8B447', checkmate: '#E8B447', blunder: '#CA3431', missed_win: '#B8343E' };

// One tap: the five best moments of a kind from the last week (or month, if the week is thin), counting down to #1.
const AUTO: { tag: string; label: string; title: (when: string) => string }[] = [
  { tag: 'brilliant', label: 'Brilliant moves', title: (w) => `Top 5 brilliant moves ${w}` },
  { tag: 'blunder', label: 'Blunders', title: (w) => `Top 5 blunders ${w} 💀` },
  { tag: 'checkmate', label: 'Checkmates', title: (w) => `Top 5 checkmates ${w}` },
  { tag: 'sacrifice', label: 'Sacrifices', title: (w) => `Top 5 sacrifices ${w}` },
  { tag: 'trap', label: 'Traps', title: (w) => `Top 5 traps people fell for ${w}` },
  { tag: 'missed_win', label: 'Missed wins', title: (w) => `5 wins thrown away ${w}` },
  { tag: 'fork', label: 'Forks', title: (w) => `Top 5 forks ${w}` },
];

const afterFen = (fen: string, san: string) => { try { const c = new Chess(fen); c.move(san); return c.fen(); } catch { return fen; } };

export function ContentStudio() {
  const { authUser } = useUser();
  const [tags, setTags] = useState<string[]>([]);
  const [opening, setOpening] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [platform, setPlatform] = useState('');
  const [since, setSince] = useState(0);
  const [sort, setSort] = useState<'best' | 'new' | 'random'>('best');
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [more, setMore] = useState(true);
  const [summary, setSummary] = useState<{ counts: Record<string, number>; progress: { scanned: number; reviewed: number; moments: number } } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<StudioSource | null>(null);
  // Compilation: pick several moments (or traps) and play them back to back as one clip.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<StudioSource[]>([]);
  const [comp, setComp] = useState<StudioSource[] | null>(null);
  const [compTitle, setCompTitle] = useState<string | undefined>(undefined);
  const [autoBusy, setAutoBusy] = useState<string | null>(null);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  // Puzzle compilations: five puzzles of a kind, easiest first, so the clip gets harder as it goes.
  const autoPuzzles = async (key: string, theme: string, title: string, range: [number, number]) => {
    setAutoBusy(key); setAutoNote(null);
    try {
      const q = new URLSearchParams({ sort: 'random', limit: '5', minRating: String(range[0]), maxRating: String(range[1]) });
      if (theme) q.set('theme', theme);
      const list = await apiFetch(`/api/admin/studio/puzzles?${q}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { puzzles: [] })).then((d) => (d.puzzles ?? []) as StudioPuzzle[]);
      if (list.length < 2) { setAutoNote('Not enough puzzles of that kind yet.'); return; }
      // Played first-to-last as #5 … #1, so the hardest is #1.
      setCompTitle(title.replace('5', String(list.length)));
      setComp([...list].sort((a, b) => a.rating - b.rating).map((p) => ({ kind: 'puzzle', puzzle: p })));
    } finally { setAutoBusy(null); }
  };
  const autoTop5 = async (a: (typeof AUTO)[number]) => {
    setAutoBusy(a.tag); setAutoNote(null);
    try {
      const get = (days: number) => apiFetch(`/api/admin/studio/moments?${new URLSearchParams({ tags: a.tag, sort: 'best', limit: '60', sinceDays: String(days) })}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { moments: [] })).then((d) => (d.moments ?? []) as Moment[]);
      let when = 'this week';
      let list = await get(7);
      if (new Set(list.map((m) => m.gameId)).size < 5) { list = await get(30); when = 'this month'; }
      if (new Set(list.map((m) => m.gameId)).size < 3) { list = await get(3650); when = 'ever'; }
      // One moment per game, best five, played worst-to-best so the best is #1.
      const seen = new Set<number>(); const top: Moment[] = [];
      for (const m of list) { if (seen.has(m.gameId)) continue; seen.add(m.gameId); top.push(m); if (top.length === 5) break; }
      if (top.length < 2) { setAutoNote(`Not enough ${a.label.toLowerCase()} yet.`); return; }
      setCompTitle(a.title(when).replace('Top 5', `Top ${top.length}`).replace(/^5 /, `${top.length} `));
      setComp(top.reverse().map((m) => ({ kind: 'game', moment: m })));
    } finally { setAutoBusy(null); }
  };
  const keyOf = (x: StudioSource) => (x.kind === 'trap' ? `t${x.trap.id}` : x.kind === 'puzzle' ? `p${x.puzzle.id}` : x.kind === 'review' ? `r${x.review.id}` : `g${x.moment.gameId}-${x.moment.moveIndex}`);
  const togglePick = (x: StudioSource) => setPicked((cur) => (cur.some((c) => keyOf(c) === keyOf(x)) ? cur.filter((c) => keyOf(c) !== keyOf(x)) : [...cur, x]));
  const isPicked = (x: StudioSource) => picked.some((c) => keyOf(c) === keyOf(x));
  const choose = (x: StudioSource) => (picking ? togglePick(x) : setOpen(x));
  const [view, setView] = useState<'moments' | 'traps' | 'puzzles' | 'reviews'>('moments');
  // Puzzles
  const [puzzles, setPuzzles] = useState<StudioPuzzle[] | null>(null);
  const [themes, setThemes] = useState<{ theme: string; n: number }[]>([]);
  const [pTheme, setPTheme] = useState('');
  const [pRating, setPRating] = useState('');
  const [pSort, setPSort] = useState<'random' | 'hard' | 'easy' | 'new'>('random');
  const [pTick, setPTick] = useState(0);
  const loadPuzzles = useCallback((offset: number) => {
    const [lo, hi] = pRating ? pRating.split('-') : ['', ''];
    const q = new URLSearchParams({ sort: pSort, limit: '48', offset: String(offset) });
    if (pTheme) q.set('theme', pTheme); if (lo) q.set('minRating', lo); if (hi) q.set('maxRating', hi);
    return apiFetch(`/api/admin/studio/puzzles?${q}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { puzzles: [] })).then((d) => (d.puzzles ?? []) as StudioPuzzle[]);
  }, [pTheme, pRating, pSort]);
  useEffect(() => {
    if (view !== 'puzzles') return;
    let live = true; setPuzzles(null);
    loadPuzzles(0).then((p) => live && setPuzzles(p)).catch(() => live && setPuzzles([]));
    if (!themes.length) apiFetch('/api/admin/studio/puzzle-themes', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { themes: [] })).then((d) => live && setThemes(d.themes ?? [])).catch(() => {});
    return () => { live = false; };
  }, [view, loadPuzzles, pTick]); // eslint-disable-line react-hooks/exhaustive-deps
  // Game reviews
  const [reviews, setReviews] = useState<StudioReview[] | null>(null);
  const [rQ, setRQ] = useState('');
  const [rSort, setRSort] = useState<'drama' | 'new' | 'accuracy'>('drama');
  const loadReviews = useCallback((offset: number) => {
    const q = new URLSearchParams({ sort: rSort, limit: '48', offset: String(offset) });
    if (rQ.trim()) q.set('q', rQ.trim()); if (minRating) q.set('minRating', String(minRating)); if (platform) q.set('platform', platform); if (since) q.set('sinceDays', String(since));
    return apiFetch(`/api/admin/studio/reviews?${q}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { reviews: [] })).then((d) => (d.reviews ?? []) as StudioReview[]);
  }, [rQ, rSort, minRating, platform, since]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (view !== 'reviews') return;
    let live = true; setReviews(null);
    const t = setTimeout(() => { loadReviews(0).then((r) => live && setReviews(r)).catch(() => live && setReviews([])); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [view, loadReviews]);
  const [traps, setTraps] = useState<StudioTrap[] | null>(null);
  useEffect(() => {
    if (view !== 'traps' || traps) return;
    apiFetch('/api/admin/studio/traps', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { traps: [] })).then((d) => setTraps(d.traps ?? [])).catch(() => setTraps([]));
  }, [view, traps]);
  // Step through the list from inside the player (N / P).
  const openAt = (k: number) => {
    if (view === 'traps' && traps?.[k]) setOpen({ kind: 'trap', trap: traps[k] });
    if (view === 'moments' && moments?.[k]) setOpen({ kind: 'game', moment: moments[k] });
    if (view === 'puzzles' && puzzles?.[k]) setOpen({ kind: 'puzzle', puzzle: puzzles[k] });
    if (view === 'reviews' && reviews?.[k]) setOpen({ kind: 'review', review: reviews[k] });
  };
  const openIndex = !open ? -1 : open.kind === 'trap' ? (traps ?? []).findIndex((t) => t.id === open.trap.id)
    : open.kind === 'puzzle' ? (puzzles ?? []).findIndex((p) => p.id === open.puzzle.id)
    : open.kind === 'review' ? (reviews ?? []).findIndex((r) => r.id === open.review.id)
    : (moments ?? []).findIndex((m) => m === open.moment);

  const query = useCallback((offset: number) => {
    const p = new URLSearchParams({ tags: tags.join(','), sort, limit: '48', offset: String(offset) });
    if (opening.trim()) p.set('opening', opening.trim());
    if (minRating) p.set('minRating', String(minRating));
    if (platform) p.set('platform', platform);
    if (since) p.set('sinceDays', String(since));
    return apiFetch(`/api/admin/studio/moments?${p}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { moments: [] })).then((d) => (d.moments ?? []) as Moment[]);
  }, [tags, opening, minRating, platform, sort, since]);

  useEffect(() => {
    let live = true;
    setMoments(null);
    const t = setTimeout(() => { query(0).then((m) => { if (live) { setMoments(m); setMore(m.length === 48); } }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query]);
  const loadSummary = () => apiFetch('/api/admin/studio/summary', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setSummary(d)).catch(() => {});
  useEffect(() => { void loadSummary(); }, []);

  const scan = async () => {
    setScanning(true);
    try { await apiFetch('/api/admin/studio/scan', { method: 'POST', credentials: 'include' }); await loadSummary(); setSort((s) => s); setTags((t) => [...t]); } finally { setScanning(false); }
  };

  if (!authUser?.isAdmin) return <div className="p-6 text-white">Admins only.</div>;
  const pr = summary?.progress;

  return (
    <div className="mx-auto max-w-6xl px-3 pb-24 pt-3 text-white md:px-0">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/admin" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Back to admin"><ArrowLeft size={20} /></Link>
        <Clapperboard size={22} className="text-[#81B64C]" />
        <h1 className="text-[22px] font-black">Content Studio</h1>
      </div>
      <p className="mb-3 text-[13px] text-white/60">
        Moments from every reviewed game on ChessScout. Pick one to turn it into a vertical clip with a random board on every move, stickers, a find-the-move countdown and effects. Player names are hidden in clips unless you turn them on.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-[12.5px] text-white/70">
        {pr ? <span><b className="text-white">{pr.moments.toLocaleString()}</b> moments from <b className="text-white">{pr.scanned.toLocaleString()}</b> of {pr.reviewed.toLocaleString()} reviewed games scanned{pr.scanned < pr.reviewed ? ' (the rest are scanned in the background)' : ''}</span> : <span>Loading…</span>}
        <button onClick={scan} disabled={scanning} className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 font-bold text-white disabled:opacity-50">
          {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Scan more now
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
      <button onClick={() => { setPicking((v) => !v); if (picking) setPicked([]); }} className="order-2 rounded-xl px-3.5 py-2 text-[13px] font-black"
        style={{ background: picking ? '#E8B447' : 'rgba(255,255,255,.06)', color: picking ? '#1A1205' : '#C9CFCD' }}>
        {picking ? 'Cancel compilation' : '🎬 Make a compilation'}
      </button>
      <div className="order-1 inline-flex flex-wrap rounded-xl bg-white/5 p-1">
        {([['moments', 'Game moments'], ['reviews', 'Game reviews'], ['puzzles', 'Puzzles'], ['traps', 'Trap lessons']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setView(k)} className="rounded-lg px-3.5 py-1.5 text-[13px] font-black" style={{ background: view === k ? '#81B64C' : 'transparent', color: view === k ? '#fff' : '#C9CFCD' }}>{t}</button>
        ))}
      </div>
      </div>
      <div className="mb-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
        <p className="mb-2 text-[12px] font-black uppercase tracking-wide text-[#E8B447]">⚡ Auto Top 5 · one tap, ready to record</p>
        <div className="flex flex-wrap gap-1.5">
          {AUTO.map((a) => (
            <button key={a.tag} onClick={() => void autoTop5(a)} disabled={!!autoBusy} className="flex items-center gap-1 rounded-full bg-[#2A3335] px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#34403F] disabled:opacity-60">
              {autoBusy === a.tag && <Loader2 size={12} className="animate-spin" />}{a.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {([['pz-m1', 'mateIn1', 'Mate in 1 speed round ⚡', [600, 1800], 'Mate in 1 round'], ['pz-m2', 'mateIn2', 'Can you solve all 5? Mate in 2 🧩', [900, 2200], 'Mate in 2 challenge'],
             ['pz-m3', 'mateIn3', 'Mate in 3: how many can you find? 🧠', [1000, 2600], 'Mate in 3 challenge'], ['pz-m4', 'mateIn4', 'Only geniuses solve all 5: Mate in 4 🤯', [1100, 2900], 'Mate in 4 challenge'],
             ['pz-fork', 'fork', '5 forks, getting harder 🍴', [800, 2400], 'Fork ladder'], ['pz-ladder', '', '5 puzzles: 800 to 2500 🧗', [800, 2500], 'Puzzle ladder'],
             ['pz-end', 'endgame', '5 endgame puzzles 👑', [1000, 2300], 'Endgames']] as const).map(([k, th, title, range, label]) => (
            <button key={k} onClick={() => void autoPuzzles(k, th, title, range as unknown as [number, number])} disabled={!!autoBusy} className="flex items-center gap-1 rounded-full bg-[#2B2A3A] px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#363548] disabled:opacity-60">
              {autoBusy === k && <Loader2 size={12} className="animate-spin" />}🧩 {label}
            </button>
          ))}
        </div>
        {autoNote && <p className="mt-2 text-[12px] text-white/60">{autoNote}</p>}
      </div>
      {picking && <p className="mb-3 text-[12.5px] text-[#E8B447]">Tap moments, reviews, puzzles or traps (you can mix tabs) in the order you want them (they count down #{Math.max(picked.length, 1)} to #1), then play them as one clip.</p>}

      {view === 'puzzles' ? (<>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button onClick={() => setPTheme('')} className="rounded-full px-3 py-1.5 text-[12.5px] font-bold" style={{ background: !pTheme ? '#81B64C' : 'rgba(255,255,255,.06)', color: !pTheme ? '#fff' : '#C9CFCD' }}>All themes</button>
          {[...['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4'].map((m) => themes.find((t) => t.theme === m) ?? { theme: m, n: -1 }), ...themes.filter((t) => !/^mateIn[1-4]$/.test(t.theme))].map((t) => (
            <button key={t.theme} onClick={() => setPTheme(pTheme === t.theme ? '' : t.theme)} className="rounded-full px-3 py-1.5 text-[12.5px] font-bold"
              style={{ background: pTheme === t.theme ? '#81B64C' : 'rgba(255,255,255,.06)', color: pTheme === t.theme ? '#fff' : '#C9CFCD', border: `1px solid ${pTheme === t.theme ? '#81B64C' : 'rgba(255,255,255,.1)'}` }}>
              {themeLabel(t.theme)}{t.n >= 0 && <span className="ml-1 opacity-60">{t.n.toLocaleString()}</span>}
            </button>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={pRating} onChange={(e) => setPRating(e.target.value)} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
            <option value="">Any rating</option><option value="0-1200">Under 1200</option><option value="1200-1600">1200–1600</option><option value="1600-2000">1600–2000</option><option value="2000-2400">2000–2400</option><option value="2400-">2400+</option>
          </select>
          <select value={pSort} onChange={(e) => setPSort(e.target.value as typeof pSort)} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
            <option value="random">Shuffle</option><option value="hard">Hardest first</option><option value="easy">Easiest first</option><option value="new">Newest</option>
          </select>
          {pSort === 'random' && <button onClick={() => setPTick((x) => x + 1)} className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-2 text-[12.5px] font-bold"><Shuffle size={13} />Again</button>}
        </div>
        {!puzzles ? <Loader2 className="mx-auto mt-10 animate-spin text-white/60" /> : puzzles.length === 0 ? <p className="mt-10 text-center text-[14px] text-white/60">No puzzles match.</p> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {puzzles.map((pz, k) => {
                // The solver's position: after the opponent's first move.
                let fen = pz.fen; let blackToMove = false;
                try { const c = new Chess(pz.fen); const u = pz.moves.split(' ')[0]; c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); fen = c.fen(); blackToMove = c.turn() === 'b'; } catch { /* show the stored position */ }
                const src: StudioSource = { kind: 'puzzle', puzzle: pz };
                const th = (pz.themes ?? '').split(/[ ,]+/).filter((t) => t && !['short', 'long', 'veryLong', 'oneMove', 'master', 'masterVsMaster', 'superGM'].includes(t)).slice(0, 3);
                return (
                  <button key={pz.id} onClick={() => (picking ? togglePick(src) : openAt(k))} className="relative overflow-hidden rounded-xl bg-white/5 text-left ring-1 ring-white/10 transition hover:ring-[#81B64C]"
                    style={isPicked(src) ? { boxShadow: '0 0 0 3px #81B64C' } : undefined}>
                    {isPicked(src) && <span className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-[#81B64C] text-[13px] font-black">{picked.findIndex((c) => keyOf(c) === `p${pz.id}`) + 1}</span>}
                    <div className="aspect-square w-full"><MiniBoard fen={fen} size={400} flipped={blackToMove} /></div>
                    <div className="p-2.5">
                      <p className="truncate text-[13.5px] font-black">{blackToMove ? 'Black' : 'White'} to move · {pz.rating}</p>
                      <div className="mt-1 flex flex-wrap gap-1">{th.map((t) => <span key={t} className="rounded bg-[#81B64C]/20 px-1.5 py-0.5 text-[10px] font-black uppercase text-[#B8E08C]">{themeLabel(t)}</span>)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {puzzles.length % 48 === 0 && <button onClick={() => loadPuzzles(puzzles.length).then((m) => setPuzzles((cur) => [...(cur ?? []), ...m]))} className="mx-auto mt-4 block rounded-lg bg-white/10 px-4 py-2 text-[13px] font-bold">Load more</button>}
          </>
        )}
      </>) : view === 'reviews' ? (<>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
            <Search size={15} className="text-white/50" />
            <input value={rQ} onChange={(e) => setRQ(e.target.value)} placeholder="Opening or player" className="w-full bg-transparent text-[13px] text-white outline-none" />
          </div>
          <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
            <option value={0}>Any rating</option><option value={1000}>1000+</option><option value={1500}>1500+</option><option value={2000}>2000+</option><option value={2500}>2500+</option>
          </select>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
            <option value="">All sites</option><option value="chessscout">ChessScout</option><option value="chesscom">Chess.com</option><option value="lichess">Lichess</option>
          </select>
          <select value={since} onChange={(e) => setSince(Number(e.target.value))} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
            <option value={0}>All time</option><option value={7}>This week</option><option value={30}>This month</option>
          </select>
          <select value={rSort} onChange={(e) => setRSort(e.target.value as typeof rSort)} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
            <option value="drama">Most happening</option><option value="new">Newest</option><option value="accuracy">Highest accuracy</option>
          </select>
        </div>
        {!reviews ? <Loader2 className="mx-auto mt-10 animate-spin text-white/60" /> : reviews.length === 0 ? <p className="mt-10 text-center text-[14px] text-white/60">No reviewed games match.</p> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {reviews.map((rv, k) => {
                const src: StudioSource = { kind: 'review', review: rv };
                return (
                  <button key={rv.id} onClick={() => (picking ? togglePick(src) : openAt(k))} className="relative overflow-hidden rounded-xl bg-white/5 text-left ring-1 ring-white/10 transition hover:ring-[#81B64C]"
                    style={isPicked(src) ? { boxShadow: '0 0 0 3px #81B64C' } : undefined}>
                    {isPicked(src) && <span className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-[#81B64C] text-[13px] font-black">{picked.findIndex((c) => keyOf(c) === `r${rv.id}`) + 1}</span>}
                    <div className="aspect-square w-full"><MiniBoard fen={rv.lastFen ?? new Chess().fen()} size={400} /></div>
                    <div className="p-2.5">
                      <p className="truncate text-[13.5px] font-black">{rv.white ?? 'White'} vs {rv.black ?? 'Black'}</p>
                      <p className="truncate text-[11.5px] text-white/55">{rv.opening ?? 'Unknown opening'}{rv.result ? ` · ${rv.result}` : ''}</p>
                      <p className="truncate text-[11.5px] tabular-nums text-white/45">{rv.whiteRating ?? '?'} vs {rv.blackRating ?? '?'}{rv.whiteAccuracy != null && rv.blackAccuracy != null ? ` · ${rv.whiteAccuracy.toFixed(0)}% / ${rv.blackAccuracy.toFixed(0)}%` : ''}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {rv.brilliant > 0 && <span className="rounded bg-[#1BACA6]/20 px-1.5 py-0.5 text-[10px] font-black uppercase text-[#1BACA6]">{rv.brilliant} brilliant</span>}
                        {rv.blunders > 0 && <span className="rounded bg-[#CA3431]/20 px-1.5 py-0.5 text-[10px] font-black uppercase text-[#F0605D]">{rv.blunders} blunder{rv.blunders > 1 ? 's' : ''}</span>}
                        {rv.mate > 0 && <span className="rounded bg-[#E8B447]/20 px-1.5 py-0.5 text-[10px] font-black uppercase text-[#E8B447]">mate</span>}
                        {rv.moments === 0 && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-white/50">not scanned yet</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {reviews.length % 48 === 0 && <button onClick={() => loadReviews(reviews.length).then((m) => setReviews((cur) => [...(cur ?? []), ...m]))} className="mx-auto mt-4 block rounded-lg bg-white/10 px-4 py-2 text-[13px] font-bold">Load more</button>}
          </>
        )}
      </>) : view === 'traps' ? (
        !traps ? <Loader2 className="mx-auto mt-10 animate-spin text-white/60" /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {traps.map((t, k) => {
              let fen = t.startingFen && t.startingFen !== 'startpos' ? t.startingFen : undefined;
              try { const c = fen ? new Chess(fen) : new Chess(); for (const san of t.moves) c.move(san); fen = c.fen(); } catch { /* show the start */ }
              return (
                <button key={t.id} onClick={() => (picking ? togglePick({ kind: 'trap', trap: t }) : openAt(k))} className="relative overflow-hidden rounded-xl bg-white/5 text-left ring-1 ring-white/10 transition hover:ring-[#E8B447]"
                  style={isPicked({ kind: 'trap', trap: t }) ? { boxShadow: '0 0 0 3px #81B64C' } : undefined}>
                  {isPicked({ kind: 'trap', trap: t }) && <span className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-[#81B64C] text-[13px] font-black">{picked.findIndex((c) => keyOf(c) === `t${t.id}`) + 1}</span>}
                  <div className="aspect-square w-full"><MiniBoard fen={fen ?? new Chess().fen()} size={400} flipped={t.trapSide === 'black'} /></div>
                  <div className="p-2.5">
                    <p className="truncate text-[13.5px] font-black">{t.name}</p>
                    <p className="line-clamp-2 text-[11.5px] text-white/55">{t.summary}</p>
                    <p className="mt-1 text-[10.5px] font-black uppercase text-[#E8B447]">{t.difficulty} · {t.moves.length} moves</p>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (<>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {TAGS.map((t) => {
          const on = tags.includes(t.id);
          const n = summary?.counts?.[t.id];
          return (
            <button key={t.id} onClick={() => setTags((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-bold"
              style={{ background: on ? '#81B64C' : 'rgba(255,255,255,.06)', color: on ? '#fff' : '#C9CFCD', border: `1px solid ${on ? '#81B64C' : 'rgba(255,255,255,.1)'}` }}>
              {t.label}{n != null ? <span className="ml-1 opacity-70">{n.toLocaleString()}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <Search size={15} className="text-white/50" />
          <input value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Opening (e.g. Sicilian, Italian, London)" className="w-full bg-transparent text-[13px] text-white outline-none" />
        </div>
        <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
          <option value={0}>Any rating</option><option value={1000}>1000+</option><option value={1500}>1500+</option><option value={2000}>2000+</option><option value={2500}>2500+</option>
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
          <option value="">All sites</option><option value="chessscout">ChessScout</option><option value="chesscom">Chess.com</option><option value="lichess">Lichess</option>
        </select>
        <select value={since} onChange={(e) => setSince(Number(e.target.value))} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
          <option value={0}>All time</option><option value={7}>This week</option><option value={30}>This month</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
          <option value="best">Best first</option><option value="new">Newest</option><option value="random">Shuffle</option>
        </select>
        {sort === 'random' && <button onClick={() => setTags((t) => [...t])} className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-2 text-[12.5px] font-bold"><Shuffle size={13} />Again</button>}
      </div>

      {!moments ? <Loader2 className="mx-auto mt-10 animate-spin text-white/60" /> : moments.length === 0 ? (
        <p className="mt-10 text-center text-[14px] text-white/60">Nothing matches yet{pr && pr.scanned < pr.reviewed ? ' — more games are still being scanned' : ''}.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {moments.map((m) => {
              const white = m.moveIndex % 2 === 0;
              const no = `${Math.floor(m.moveIndex / 2) + 1}${white ? '.' : '...'}`;
              return (
                <button key={m.id} onClick={() => choose({ kind: 'game', moment: m })} className="relative overflow-hidden rounded-xl bg-white/5 text-left ring-1 ring-white/10 transition hover:ring-[#81B64C]"
                  style={isPicked({ kind: 'game', moment: m }) ? { boxShadow: '0 0 0 3px #81B64C' } : undefined}>
                  {isPicked({ kind: 'game', moment: m }) && <span className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-[#81B64C] text-[13px] font-black">{picked.findIndex((c) => keyOf(c) === `g${m.gameId}-${m.moveIndex}`) + 1}</span>}
                  <div className="aspect-square w-full"><MiniBoard fen={afterFen(m.fenBefore, m.san)} size={400} flipped={!white} /></div>
                  <div className="p-2.5">
                    <p className="truncate text-[13.5px] font-black">{no}{m.san}{m.trapName ? <span className="font-bold text-[#E8B447]"> · {m.trapName}</span> : null}</p>
                    <p className="truncate text-[11.5px] text-white/55">{m.opening ?? 'Unknown opening'}</p>
                    <p className="truncate text-[11.5px] text-white/45">{m.whiteRating ?? '?'} vs {m.blackRating ?? '?'} · {m.platform === 'chesscom' ? 'Chess.com' : m.platform === 'lichess' ? 'Lichess' : 'ChessScout'}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.tags.filter((t) => t !== 'opening').slice(0, 4).map((t) => (
                        <span key={t} className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase" style={{ background: `${TAG_COLOR[t] ?? '#81B64C'}33`, color: TAG_COLOR[t] ?? '#B8E08C' }}>{t.replace('_', ' ')}</span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {more && (
            <button onClick={() => query(moments.length).then((m) => { setMoments((cur) => [...(cur ?? []), ...m]); setMore(m.length === 48); })}
              className="mx-auto mt-4 block rounded-lg bg-white/10 px-4 py-2 text-[13px] font-bold">Load more</button>
          )}
        </>
      )}
      </>)}
      {picking && picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-[70] mx-auto flex w-fit items-center gap-3 rounded-2xl bg-[#0B1112] px-4 py-3 shadow-2xl ring-1 ring-[#81B64C] md:bottom-6">
          <span className="text-[13px] font-bold">{picked.length} picked</span>
          <button onClick={() => setPicked([])} className="text-[12.5px] font-bold text-white/60">Clear</button>
          <button onClick={() => { setCompTitle(undefined); setComp(picked); }} className="rounded-lg bg-[#81B64C] px-3 py-1.5 text-[13px] font-black text-white">Play as one clip</button>
        </div>
      )}
      {comp && <StudioPlayer source={comp[0]} queue={comp} title={compTitle} onClose={() => setComp(null)} />}
      {open && (
        <StudioPlayer source={open} onClose={() => setOpen(null)}
          onNext={openIndex >= 0 ? () => openAt(openIndex + 1) : undefined}
          onPrev={openIndex > 0 ? () => openAt(openIndex - 1) : undefined} />
      )}
    </div>
  );
}
