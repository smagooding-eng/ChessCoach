import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { generateAnalyzerGame, type EngineSide } from '@/lib/analyzerGame';
import { ArrowLeft, Loader2, RefreshCw, Search, Clapperboard, Shuffle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { MiniBoard } from '@/components/MiniBoard';
import { useUser } from '@/hooks/use-user';
import { StudioPlayer, themeLabel, type StudioMoment, type StudioTrap, type StudioSource, type StudioPuzzle, type StudioReview, type StudioScout, type StudioLesson, type StudioPromo } from '@/components/studio/StudioPlayer';
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
  // Analyzer games: Stockfish plays a whole game (best / worst per side) and it opens as a clip.
  const [ag, setAg] = useState<{ w: EngineSide; b: EngineSide; moves: number; fen: string }>({ w: 'best', b: 'worst', moves: 40, fen: '' });
  const [agBusy, setAgBusy] = useState<string | null>(null);
  const [agErr, setAgErr] = useState<string | null>(null);
  const runAnalyzerGame = async () => {
    setAgErr(null);
    let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (ag.fen.trim()) { try { fen = new Chess(ag.fen.trim()).fen(); } catch { setAgErr("That FEN isn't a legal position."); return; } }
    const t0 = Date.now();
    setAgBusy('Stockfish is playing…');
    const tick = setInterval(() => setAgBusy(`Stockfish is playing… ${Math.round((Date.now() - t0) / 1000)}s`), 1000);
    try { setOpen({ kind: 'line', line: await generateAnalyzerGame(fen, ag.w, ag.b, ag.moves) }); }
    catch (e) { setAgErr(e instanceof Error ? e.message : 'Could not make the game.'); }
    finally { clearInterval(tick); setAgBusy(null); }
  };
  // A game made in the Position Explorer ("Make video") opens straight in the player.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('cs_studio_line');
      if (!raw) return;
      sessionStorage.removeItem('cs_studio_line');
      setOpen({ kind: 'line', line: JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
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
  const keyOf = (x: StudioSource): string => (x.kind === 'trap' ? `t${x.trap.id}` : x.kind === 'puzzle' ? `p${x.puzzle.id}` : x.kind === 'review' ? `r${x.review.id}`
    : x.kind === 'scout' ? `s${x.scout.id}` : x.kind === 'lesson' ? `l${x.lesson.id}` : x.kind === 'scan' ? `x${x.fen}` : x.kind === 'promo' ? `promo-${x.promo.template}-${x.promo.hook}` : x.kind === 'line' ? `line-${x.line.moves.map((m) => m.san).join(' ')}` : `g${x.moment.gameId}-${x.moment.moveIndex}`);
  const togglePick = (x: StudioSource) => setPicked((cur) => (cur.some((c) => keyOf(c) === keyOf(x)) ? cur.filter((c) => keyOf(c) !== keyOf(x)) : [...cur, x]));
  const isPicked = (x: StudioSource) => picked.some((c) => keyOf(c) === keyOf(x));
  const choose = (x: StudioSource) => (picking ? togglePick(x) : setOpen(x));
  const [view, setView] = useState<'moments' | 'traps' | 'puzzles' | 'reviews' | 'kids' | 'scout' | 'scan' | 'analyzer' | 'promo'>('moments');
  // Kids & beginners: the Beginner Path / Chess for Kids lessons
  const [courses, setCourses] = useState<{ id: number; title: string; description: string; icon: string; lessons: StudioLesson[] }[] | null>(null);
  useEffect(() => {
    if (view !== 'kids' || courses) return;
    apiFetch('/api/admin/studio/lessons', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { courses: [] })).then((d) => setCourses(d.courses ?? [])).catch(() => setCourses([]));
  }, [view, courses]);
  // Opponent scout
  const [scouts, setScouts] = useState<StudioScout[] | null>(null);
  const [scoutQ, setScoutQ] = useState('');
  const [scoutName, setScoutName] = useState('');
  const [scoutBusy, setScoutBusy] = useState<string | null>(null);
  const [topPlayers, setTopPlayers] = useState<{ username: string; rating: number }[]>([]);
  const loadScouts = useCallback(() => apiFetch(`/api/admin/studio/scouts${scoutQ.trim() ? `?q=${encodeURIComponent(scoutQ.trim())}` : ''}`, { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : { scouts: [] })).then((d) => setScouts(d.scouts ?? [])).catch(() => setScouts([])), [scoutQ]);
  useEffect(() => {
    if (view !== 'scout') return;
    const t = setTimeout(() => void loadScouts(), 250);
    if (!topPlayers.length) apiFetch('/api/opponents/top-players').then((r) => (r.ok ? r.json() : { players: [] })).then((d) => setTopPlayers((d.players ?? []).slice(0, 12))).catch(() => {});
    return () => clearTimeout(t);
  }, [view, loadScouts]); // eslint-disable-line react-hooks/exhaustive-deps
  const runScout = async (username: string) => {
    const u = username.trim(); if (!u) return;
    setScoutBusy(`Scouting ${u}…`);
    try {
      const r = await apiFetch('/api/opponents/start', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.jobId) { setScoutBusy(d.error || "Couldn't start the scout."); return; }
      for (let k = 0; k < 60; k++) {
        await new Promise((res) => setTimeout(res, 3000));
        const st = await apiFetch(`/api/opponents/status/${d.jobId}`, { credentials: 'include' }).then((x) => x.json()).catch(() => null);
        if (st?.status === 'done') {
          setScoutBusy(null); setScoutName('');
          await loadScouts();
          setOpen({ kind: 'scout', scout: { id: d.jobId, username: u.toLowerCase(), result: st.result } });
          return;
        }
        if (st?.status === 'error') { setScoutBusy(st.error || 'The scout failed.'); return; }
      }
      setScoutBusy('Still working on it. Check back in a minute.');
    } catch { setScoutBusy("Couldn't start the scout."); }
  };
  // Scan position
  const [scans, setScans] = useState<{ id: number; fen: string; label: string | null }[] | null>(null);
  const [scanBusy, setScanBusy] = useState<string | null>(null);
  const [fenInput, setFenInput] = useState('');
  useEffect(() => {
    if (view !== 'scan' || scans) return;
    apiFetch('/api/admin/studio/scans', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { scans: [] })).then((d) => setScans(d.scans ?? [])).catch(() => setScans([]));
  }, [view, scans]);
  const scanPhoto = async (file: File) => {
    setScanBusy('Reading the board…');
    try {
      // Shrink big phone photos before sending (the scanner reads them fine at this size).
      const url = await new Promise<string>((res, rej) => {
        const img = new Image();
        img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.88)); };
        img.onerror = () => rej(new Error('bad image'));
        img.src = URL.createObjectURL(file);
      });
      const r = await apiFetch('/api/analysis/scan-position', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: url }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.fen) { setScanBusy(d.error || d.message || "Couldn't read a chess position in that photo."); return; }
      setScanBusy(null);
      setOpen({ kind: 'scan', fen: d.fen, photo: url });
    } catch { setScanBusy("Couldn't read that photo."); }
  };
  // Promos
  const [promoT, setPromoT] = useState<'versus' | 'challenge'>('versus');
  const [promo, setPromo] = useState<StudioPromo>({
    template: 'versus', hook: 'Stop paying to review your chess games 🛑', rival: 'Chess.com',
    rows: [
      { label: 'Full game reviews', us: 'Free, unlimited', them: '1 free a day' },
      { label: 'Puzzles', us: 'Free, unlimited', them: 'Limited free' },
      { label: 'Scout any opponent', us: 'Free', them: '—' },
      { label: 'Live + daily games', us: 'Free', them: 'Free' },
      { label: 'Chess for Kids path', us: 'Free', them: '—' },
    ],
    closer: 'Switch in 30 seconds at chessscout.net',
  });
  const challengePromo: StudioPromo = { template: 'challenge', hook: 'Your friend thinks they are better than you 😤', rival: '', rows: [], closer: 'Settle it on chessscout.net' };
  const [challenge, setChallenge] = useState<StudioPromo>(challengePromo);
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
    : open.kind === 'game' ? (moments ?? []).findIndex((m) => m === open.moment) : -1;

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
        {([['moments', 'Game moments'], ['reviews', 'Game reviews'], ['puzzles', 'Puzzles'], ['traps', 'Trap lessons'], ['kids', 'Kids & beginners'], ['scout', 'Opponent scout'], ['scan', 'Scan position'], ['analyzer', 'Analyzer games'], ['promo', 'Promos']] as const).map(([k, t]) => (
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

      {view === 'kids' ? (<>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button onClick={() => void autoPuzzles('kid-m1', 'mateIn1', 'Can your kid find mate in 1? 🧒', [400, 1000])} disabled={!!autoBusy} className="rounded-full bg-[#FF6FA8] px-3 py-1.5 text-[12.5px] font-black text-white disabled:opacity-60">🧒 Easy mate in 1 (kids)</button>
          <button onClick={() => void autoPuzzles('beg-ladder', '', '5 puzzles for beginners 🌱', [400, 1200])} disabled={!!autoBusy} className="rounded-full bg-[#7C5CFF] px-3 py-1.5 text-[12.5px] font-black text-white disabled:opacity-60">🌱 Beginner puzzle ladder</button>
          <button onClick={() => setView('traps')} className="rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-bold text-white">🪤 Beginner traps</button>
        </div>
        <p className="mb-3 text-[12.5px] text-white/55">Tip: open a lesson and tap the <b>Kids</b> preset (bright background, playful music, friendly coach voice, subtitles).</p>
        {!courses ? <Loader2 className="mx-auto mt-10 animate-spin text-white/60" /> : courses.length === 0 ? <p className="mt-10 text-center text-[14px] text-white/60">No lessons yet.</p> : courses.map((c) => (
          <div key={c.id} className="mb-5">
            <p className="mb-2 text-[15px] font-black">{c.icon} {c.title} <span className="text-[12px] font-bold text-white/45">· {c.lessons.length} lessons</span></p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {c.lessons.map((l) => {
                const src: StudioSource = { kind: 'lesson', lesson: { ...l, course: { title: c.title, icon: c.icon } } };
                const fen = l.steps.find((st) => st.fen)?.fen;
                const ok = fen && fen.split(' ')[0].split('/').length === 8 ? fen : undefined;
                return (
                  <button key={l.id} onClick={() => choose(src)} className="relative overflow-hidden rounded-xl bg-white/5 text-left ring-1 ring-white/10 transition hover:ring-[#FF6FA8]"
                    style={isPicked(src) ? { boxShadow: '0 0 0 3px #81B64C' } : undefined}>
                    {isPicked(src) && <span className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-[#81B64C] text-[13px] font-black">{picked.findIndex((x) => keyOf(x) === keyOf(src)) + 1}</span>}
                    <div className="aspect-square w-full"><MiniBoard fen={ok ?? new Chess().fen()} size={400} /></div>
                    <div className="p-2.5">
                      <p className="truncate text-[13.5px] font-black">{l.title}</p>
                      <p className="line-clamp-2 text-[11.5px] text-white/55">{l.summary}</p>
                      <p className="mt-1 text-[10.5px] font-black uppercase text-[#FF9BC4]">{l.steps.length} steps · {l.steps.filter((st) => st.type === 'practice').length} to try</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </>) : view === 'scout' ? (<>
        <form onSubmit={(e) => { e.preventDefault(); void runScout(scoutName); }} className="mb-2 flex flex-wrap gap-2">
          <input value={scoutName} onChange={(e) => setScoutName(e.target.value)} placeholder="Chess.com username to scout" className="min-w-[220px] flex-1 rounded-lg bg-white/5 px-3 py-2 text-[13px] text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />
          <button type="submit" disabled={!!scoutBusy && scoutBusy.endsWith('…')} className="rounded-lg bg-[#81B64C] px-4 py-2 text-[13px] font-black text-white disabled:opacity-60">🔍 Scout</button>
        </form>
        {scoutBusy && <p className="mb-2 flex items-center gap-2 text-[12.5px] text-[#E8B447]">{scoutBusy.endsWith('…') && <Loader2 size={13} className="animate-spin" />}{scoutBusy}</p>}
        {topPlayers.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase text-white/45">Top players</span>
            {topPlayers.map((p) => <button key={p.username} onClick={() => void runScout(p.username)} disabled={!!scoutBusy && scoutBusy.endsWith('…')} className="rounded-full bg-white/[.07] px-2.5 py-1 text-[12px] font-bold text-white hover:bg-white/15 disabled:opacity-50">{p.username} <span className="text-white/45">{p.rating}</span></button>)}
          </div>
        )}
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"><Search size={15} className="text-white/50" /><input value={scoutQ} onChange={(e) => setScoutQ(e.target.value)} placeholder="Search scouted players" className="w-full bg-transparent text-[13px] text-white outline-none" /></div>
        {!scouts ? <Loader2 className="mx-auto mt-10 animate-spin text-white/60" /> : scouts.length === 0 ? <p className="mt-10 text-center text-[14px] text-white/60">No scouts yet. Scout someone above.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {scouts.map((sc) => {
              const d = sc.result; const src: StudioSource = { kind: 'scout', scout: sc };
              return (
                <button key={sc.id} onClick={() => choose(src)} className="relative rounded-xl bg-white/5 p-3 text-left ring-1 ring-white/10 transition hover:ring-[#81B64C]" style={isPicked(src) ? { boxShadow: '0 0 0 3px #81B64C' } : undefined}>
                  {isPicked(src) && <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-[#81B64C] text-[13px] font-black">{picked.findIndex((x) => keyOf(x) === keyOf(src)) + 1}</span>}
                  <div className="flex items-center gap-2">
                    {d.profile?.avatar ? <img src={d.profile.avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10">🔍</span>}
                    <div className="min-w-0"><p className="truncate text-[13.5px] font-black">{d.profile?.title ? `${d.profile.title} ` : ''}{d.profile?.name || sc.username}</p><p className="truncate text-[11px] text-white/50">@{sc.username}</p></div>
                  </div>
                  <p className="mt-2 text-[12px] font-bold tabular-nums"><span className="text-[#81B64C]">{d.wins}W</span> · <span className="text-white/60">{d.draws}D</span> · <span className="text-[#F0605D]">{d.losses}L</span> <span className="text-white/45">in {d.gamesAnalyzed}</span></p>
                  {d.topOpenings?.[0] && <p className="mt-1 truncate text-[11.5px] text-white/55">Plays the {d.topOpenings[0].opening}</p>}
                  <p className="mt-1 text-[10.5px] font-black uppercase text-[#E8B447]">{d.weaknesses?.length ? `${d.weaknesses.length} weak spots` : 'Stats only'}</p>
                </button>
              );
            })}
          </div>
        )}
      </>) : view === 'scan' ? (<>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg bg-[#81B64C] px-4 py-2 text-[13px] font-black text-white">
            📸 Scan a photo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanPhoto(f); e.currentTarget.value = ''; }} />
          </label>
          <form onSubmit={(e) => { e.preventDefault(); const f = fenInput.trim(); try { new Chess(f); setOpen({ kind: 'scan', fen: f }); } catch { setScanBusy("That FEN isn't a legal position."); } }} className="flex min-w-[260px] flex-1 gap-2">
            <input value={fenInput} onChange={(e) => setFenInput(e.target.value)} placeholder="…or paste a FEN" className="min-w-0 flex-1 rounded-lg bg-white/5 px-3 py-2 text-[13px] text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />
            <button type="submit" className="rounded-lg bg-white/10 px-3 py-2 text-[13px] font-bold">Open</button>
          </form>
        </div>
        {scanBusy && <p className="mb-2 flex items-center gap-2 text-[12.5px] text-[#E8B447]">{scanBusy.endsWith('…') && <Loader2 size={13} className="animate-spin" />}{scanBusy}</p>}
        <p className="mb-2 text-[12.5px] text-white/55">The clip shows your photo being scanned, then the engine's best move and line. Recent scans from the app (positions only, no photos):</p>
        {!scans ? <Loader2 className="mx-auto mt-10 animate-spin text-white/60" /> : scans.length === 0 ? <p className="mt-6 text-center text-[14px] text-white/60">No saved scans yet.</p> : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {scans.map((sc) => {
              let ok = true; try { new Chess(sc.fen); } catch { ok = false; }
              if (!ok) return null;
              const src: StudioSource = { kind: 'scan', fen: sc.fen, label: sc.label ?? undefined };
              return (
                <button key={sc.id} onClick={() => choose(src)} className="relative overflow-hidden rounded-xl bg-white/5 text-left ring-1 ring-white/10 hover:ring-[#81B64C]" style={isPicked(src) ? { boxShadow: '0 0 0 3px #81B64C' } : undefined}>
                  <div className="aspect-square w-full"><MiniBoard fen={sc.fen} size={300} flipped={sc.fen.split(' ')[1] === 'b'} /></div>
                  <p className="truncate p-2 text-[11.5px] font-bold text-white/70">{sc.label || (sc.fen.split(' ')[1] === 'b' ? 'Black to move' : 'White to move')}</p>
                </button>
              );
            })}
          </div>
        )}
      </>) : view === 'analyzer' ? (<>
        <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <p className="text-[15px] font-black text-white">Games played by the analyzer</p>
          <p className="mt-1 text-[13px] text-[#9AA4A1]">Stockfish plays a whole game, each side making its <b className="text-white">best</b> or its <b className="text-white">worst</b> move. Every move is graded and the game opens here as a clip, like a game review. Set the pacing with Speed in the player.</p>
          <div className="mt-3 space-y-2">
            {(['w', 'b'] as const).map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="w-12 text-[13px] font-black text-white">{c === 'w' ? 'White' : 'Black'}</span>
                <div className="inline-flex rounded-xl bg-black/30 p-1">
                  {(['best', 'worst'] as const).map((m) => (
                    <button key={m} onClick={() => setAg((x) => ({ ...x, [c]: m }))} className="rounded-lg px-3.5 py-1.5 text-[13px] font-black capitalize"
                      style={{ background: ag[c] === m ? (m === 'worst' ? '#D9443F' : '#81B64C') : 'transparent', color: ag[c] === m ? '#fff' : '#C9CFCD' }}>{m}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-12 text-[13px] font-black text-white">Length</span>
              {[10, 20, 40, 80].map((n) => (
                <button key={n} onClick={() => setAg((x) => ({ ...x, moves: n }))} className="rounded-lg px-3 py-1.5 text-[13px] font-black"
                  style={{ background: ag.moves === n ? '#81B64C' : 'rgba(255,255,255,.06)', color: ag.moves === n ? '#fff' : '#C9CFCD' }}>{n}</button>
              ))}
              <span className="text-[12px] text-[#9AA4A1]">moves max (ends early on mate or a draw)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-[13px] font-black text-white">Start</span>
              <input value={ag.fen} onChange={(e) => setAg((x) => ({ ...x, fen: e.target.value }))} placeholder="Starting position, or paste a FEN"
                className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-[13px] text-white placeholder:text-white/40 ring-1 ring-white/10" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => void runAnalyzerGame()} disabled={!!agBusy} className="flex items-center gap-1.5 rounded-xl bg-[#81B64C] px-4 py-2.5 text-[14px] font-black text-white disabled:opacity-60">
              {agBusy ? <Loader2 size={15} className="animate-spin" /> : <Clapperboard size={15} />}{agBusy ? agBusy : 'Generate game & open'}
            </button>
            <Link href={`/explore?studio=1&w=you&b=${ag.b}${ag.fen.trim() ? `&fen=${encodeURIComponent(ag.fen.trim())}` : ''}`} className="rounded-xl bg-white/5 px-3.5 py-2.5 text-[13px] font-black text-[#C9CFCD] ring-1 ring-white/10">
              Or play the moves yourself on a board
            </Link>
          </div>
          {agErr && <p className="mt-2 text-[12.5px] text-[#FF7A80]">{agErr}</p>}
        </div>
      </>) : view === 'promo' ? (<>
        <div className="mb-3 inline-flex rounded-xl bg-white/5 p-1">
          {([['versus', 'ChessScout vs …'], ['challenge', 'Challenge your friends']] as const).map(([k, t]) => (
            <button key={k} onClick={() => setPromoT(k)} className="rounded-lg px-3.5 py-1.5 text-[13px] font-black" style={{ background: promoT === k ? '#81B64C' : 'transparent', color: promoT === k ? '#fff' : '#C9CFCD' }}>{t}</button>
          ))}
        </div>
        {promoT === 'versus' ? (
          <div className="max-w-2xl space-y-2 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex flex-wrap gap-1.5">
              {['Stop paying to review your chess games 🛑', 'Chess.com is dead? 💀', 'Why I stopped using Chess.com', 'The free Chess.com alternative nobody talks about'].map((h) => (
                <button key={h} onClick={() => setPromo((p) => ({ ...p, hook: h }))} className="rounded-full bg-white/[.07] px-2.5 py-1 text-[12px] font-bold text-white hover:bg-white/15">{h}</button>
              ))}
            </div>
            <label className="block text-[12px] text-white/60">Hook<input value={promo.hook} onChange={(e) => setPromo({ ...promo, hook: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
            <label className="block text-[12px] text-white/60">Compared with<input value={promo.rival} onChange={(e) => setPromo({ ...promo, rival: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[13px] text-white ring-1 ring-white/10" /></label>
            <p className="pt-1 text-[11px] font-bold uppercase text-white/50">Rows · feature / ChessScout / {promo.rival || 'them'}</p>
            {promo.rows.map((r, k) => (
              <div key={k} className="grid grid-cols-[1.3fr_1fr_1fr_auto] gap-1.5">
                {(['label', 'us', 'them'] as const).map((f) => <input key={f} value={r[f]} onChange={(e) => setPromo({ ...promo, rows: promo.rows.map((x, j) => (j === k ? { ...x, [f]: e.target.value } : x)) })} className="min-w-0 rounded-md bg-white/5 px-2 py-1.5 text-[12.5px] text-white ring-1 ring-white/10" />)}
                <button onClick={() => setPromo({ ...promo, rows: promo.rows.filter((_, j) => j !== k) })} className="px-1.5 text-[#F59B98]" aria-label="Remove row">✕</button>
              </div>
            ))}
            {promo.rows.length < 7 && <button onClick={() => setPromo({ ...promo, rows: [...promo.rows, { label: '', us: '', them: '' }] })} className="rounded-md bg-white/10 px-2.5 py-1 text-[12px] font-bold">+ Row</button>}
            <label className="block text-[12px] text-white/60">Closing line<input value={promo.closer} onChange={(e) => setPromo({ ...promo, closer: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[13px] text-white ring-1 ring-white/10" /></label>
            <p className="text-[11.5px] leading-snug text-[#E8B447]">Every claim about {promo.rival || 'the other site'} needs to be true on the day you post. Check their current free plan and edit these rows. The ChessScout column matches what's free on our site today. Text only, no logos.</p>
            <button onClick={() => setOpen({ kind: 'promo', promo: { ...promo, rows: promo.rows.filter((r) => r.label.trim()) } })} className="rounded-lg bg-[#81B64C] px-4 py-2 text-[13px] font-black text-white">🎬 Make the clip</button>
          </div>
        ) : (
          <div className="max-w-2xl space-y-2 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex flex-wrap gap-1.5">
              {['Your friend thinks they are better than you 😤', 'Settle it over a game of chess ♟️', 'Send this to the friend who always says "rematch"', 'One move a day. No excuses. 📅'].map((h) => (
                <button key={h} onClick={() => setChallenge((p) => ({ ...p, hook: h }))} className="rounded-full bg-white/[.07] px-2.5 py-1 text-[12px] font-bold text-white hover:bg-white/15">{h}</button>
              ))}
            </div>
            <label className="block text-[12px] text-white/60">Hook<input value={challenge.hook} onChange={(e) => setChallenge({ ...challenge, hook: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
            <label className="block text-[12px] text-white/60">Closing line<input value={challenge.closer} onChange={(e) => setChallenge({ ...challenge, closer: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[13px] text-white ring-1 ring-white/10" /></label>
            <p className="text-[12px] text-white/55">The clip plays a classic game with ticking clocks, then shows live games (5 min, 5|3, 10 min, 15 min), daily games (1, 3 or 7 days a move) and a challenge link.</p>
            <button onClick={() => setOpen({ kind: 'promo', promo: challenge })} className="rounded-lg bg-[#81B64C] px-4 py-2 text-[13px] font-black text-white">🎬 Make the clip</button>
          </div>
        )}
      </>) : view === 'puzzles' ? (<>
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
