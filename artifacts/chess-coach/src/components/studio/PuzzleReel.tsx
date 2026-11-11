// Quick puzzle reels (about 8-15 seconds, 9:16), the formats doing best for
// small chess accounts right now:
//  - "Mate in 2. Looks easy. It isn't." A real mate-in-2 from the puzzle
//    database, a countdown, then either "comment your move" (made to loop and
//    pull comments) or the solution played out.
//  - "Which move is correct? A, B or C": the right move and two tempting wrong
//    ones drawn as lettered arrows, a countdown, then the answer (or not).
// The puzzle is chosen in the editor and saved with the render, so the MP4
// shows exactly the puzzle you picked.
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2, Shuffle, Loader2 } from 'lucide-react';
import { Chess } from 'chess.js';
import { playMoveSound, LookOverride } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { apiFetch } from '@/lib/api';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { HookPicker } from './HookPicker';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { reelFrameSize, CaptionBox, LookPicker, useReelLook, type ReelLook, EngagePicker, EngageOverlay, withEngage, PinnedBox, hiddenAnswer } from './reelKit';

const G = '#81B64C', BG = '#0B1112', TEXT = '#F5F7F6', MUTED = '#8E9996', GOLD = '#E8B447';
const ABC_COLORS = ['#3D8BFD', '#F2A93B', '#B05CE8'];

export interface PuzzleData { id: number; fen: string; moves: string; rating: number; themes: string[] }
export interface PuzzleReelOpts {
  mode: 'mate2' | 'abc';
  /** Lichess theme tag the puzzle comes from (mateIn2, fork, rookEndgame...). */
  theme?: string;
  puzzle: PuzzleData | null;
  seconds: number;
  reveal: boolean;
  headline: string;
  sub: string;
  music: MusicStyle;
  /** For A/B/C: the letters' moves, fixed when the puzzle is picked. */
  choices?: { uci: string; san: string; correct: boolean }[];
  /** Board look: your board, one random look, or a new one each scene / move. */
  look?: ReelLook;
  /** One-tap comment prompt shown beside the countdown (empty = the default). */
  engage?: string;
}

/** Puzzle themes to pull from (Lichess theme tags), with a headline for each. */
export const THEMES: { id: string; label: string; group: 'Mates' | 'Tactics' | 'Endgames'; headline: string; sub: string }[] = [
  { id: 'mateIn1', label: 'Mate in 1', group: 'Mates', headline: 'MATE IN 1', sub: 'Most people miss it.' },
  { id: 'mateIn2', label: 'Mate in 2', group: 'Mates', headline: 'MATE IN 2', sub: "Looks easy. It isn't." },
  { id: 'mateIn3', label: 'Mate in 3', group: 'Mates', headline: 'MATE IN 3', sub: 'Three moves. Find them all.' },
  { id: 'backRankMate', label: 'Back-rank mate', group: 'Mates', headline: 'BACK-RANK MATE', sub: 'Find the finish.' },
  { id: 'smotheredMate', label: 'Smothered mate', group: 'Mates', headline: 'SMOTHERED MATE', sub: 'The knight does it all.' },
  { id: 'fork', label: 'Fork', group: 'Tactics', headline: 'FIND THE FORK', sub: 'Two pieces, one move.' },
  { id: 'pin', label: 'Pin', group: 'Tactics', headline: 'USE THE PIN', sub: "That piece can't move." },
  { id: 'skewer', label: 'Skewer', group: 'Tactics', headline: 'FIND THE SKEWER', sub: 'Win what\'s behind it.' },
  { id: 'discoveredAttack', label: 'Discovered attack', group: 'Tactics', headline: 'DISCOVERED ATTACK', sub: 'Move one, attack with another.' },
  { id: 'doubleCheck', label: 'Double check', group: 'Tactics', headline: 'DOUBLE CHECK', sub: 'The king has to run.' },
  { id: 'deflection', label: 'Deflection', group: 'Tactics', headline: 'DEFLECT THE DEFENDER', sub: 'Pull it away. Win.' },
  { id: 'sacrifice', label: 'Sacrifice', group: 'Tactics', headline: 'SACRIFICE!', sub: 'Give it up to win.' },
  { id: 'hangingPiece', label: 'Hanging piece', group: 'Tactics', headline: 'FREE PIECE?', sub: 'Or is it a trap?' },
  { id: 'trappedPiece', label: 'Trapped piece', group: 'Tactics', headline: 'TRAP THE PIECE', sub: 'It has nowhere to go.' },
  { id: 'promotion', label: 'Promotion', group: 'Endgames', headline: 'PROMOTE IT', sub: 'Get the pawn home.' },
  { id: 'pawnEndgame', label: 'Pawn endgame', group: 'Endgames', headline: 'PAWN ENDGAME', sub: 'One move decides it.' },
  { id: 'rookEndgame', label: 'Rook endgame', group: 'Endgames', headline: 'ROOK ENDGAME', sub: 'Win it or draw it?' },
  { id: 'queenEndgame', label: 'Queen endgame', group: 'Endgames', headline: 'QUEEN ENDGAME', sub: 'Find the winning move.' },
  { id: 'knightEndgame', label: 'Knight endgame', group: 'Endgames', headline: 'KNIGHT ENDGAME', sub: 'Tricky. Find it.' },
  { id: 'bishopEndgame', label: 'Bishop endgame', group: 'Endgames', headline: 'BISHOP ENDGAME', sub: 'Find the winning move.' },
  { id: 'zugzwang', label: 'Zugzwang', group: 'Endgames', headline: 'ZUGZWANG', sub: 'Make them move.' },
  { id: 'advancedPawn', label: 'Advanced pawn', group: 'Endgames', headline: 'STOP THE PAWN?', sub: 'Or push it?' },
];
export const themeOf = (id?: string) => THEMES.find((t) => t.id === id) ?? THEMES[1];

const DEFAULTS: Record<PuzzleReelOpts['mode'], Pick<PuzzleReelOpts, 'headline' | 'sub'>> = {
  mate2: { headline: 'MATE IN 2', sub: "Looks easy. It isn't." },
  abc: { headline: 'Which move is correct?', sub: 'A, B or C' },
};

/** Full options for a puzzle reel from a few choices (mode, theme, reveal). */
export function puzzleOptsFor(o: Partial<PuzzleReelOpts>): PuzzleReelOpts {
  const mode = o.mode ?? 'mate2';
  const t = themeOf(o.theme);
  return { mode, theme: t.id, puzzle: null, seconds: o.seconds ?? 7, reveal: o.reveal ?? false, music: o.music ?? 'hype',
    ...(mode === 'abc' ? DEFAULTS.abc : { headline: t.headline, sub: t.sub }) };
}

const uciMove = (c: Chess, uci: string) => {
  try { return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }); } catch { return null; }
};

/** The right move plus two tempting wrong ones (checks and captures first), shuffled. */
function pickChoices(p: PuzzleData): PuzzleReelOpts['choices'] {
  const c = new Chess(p.fen);
  const right = p.moves.split(' ')[0];
  const legal = c.moves({ verbose: true });
  const best = legal.find((m) => m.from + m.to + (m.promotion ?? '') === right);
  if (!best) return [];
  const others = legal.filter((m) => m !== best);
  const score = (m: (typeof legal)[number]) => (m.san.includes('+') ? 3 : 0) + (m.captured ? 2 : 0) + (m.piece === best.piece ? 1 : 0) + Math.random();
  const wrong = others.sort((a, b) => score(b) - score(a)).slice(0, 2);
  const all = [{ uci: right, san: best.san, correct: true }, ...wrong.map((m) => ({ uci: m.from + m.to + (m.promotion ?? ''), san: m.san, correct: false }))];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

export function PuzzleReel({ opts: initial, render = false, onClose }: { opts?: PuzzleReelOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<PuzzleReelOpts>(initial ?? { mode: 'mate2', puzzle: null, seconds: 7, reveal: false, ...DEFAULTS.mate2, music: 'hype' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'ask' | 'answer' | 'end'>('idle');
  const [left, setLeft] = useState(0);
  const [ply, setPly] = useState(0);
  const [clean, setClean] = useState(false);
  const seen = useRef<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const rec = useRef<MediaRecorder | null>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const at = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => { clear(); music.current?.stop(); routeSoundsTo(null, null); }, []);

  // Puzzle rating range (remembered on this device).
  const [range, setRangeState] = useState<[number, number]>(() => {
    try { const v = JSON.parse(localStorage.getItem('cs_puzzle_reel_range') || 'null'); if (Array.isArray(v) && v.length === 2) return [Number(v[0]) || 400, Number(v[1]) || 3200]; } catch { /* default */ }
    return [900, 1900];
  });
  const setRange = (r: [number, number]) => {
    const lo = Math.max(400, Math.min(3200, Math.round(r[0]))), hi = Math.max(lo + 50, Math.min(3300, Math.round(r[1])));
    setRangeState([lo, hi]); try { localStorage.setItem('cs_puzzle_reel_range', JSON.stringify([lo, hi])); } catch { /* ignore */ }
    return [lo, hi] as [number, number];
  };
  const load = async (mode = opts.mode, theme = opts.theme ?? 'mateIn2', rr: [number, number] = range) => {
    setLoading(true); setErr(null);
    try {
      const q = new URLSearchParams({ minRating: String(rr[0]), maxRating: String(rr[1]), exclude: seen.current.slice(-50).join(',') });
      q.set('puzzleTheme', theme);
      const r = await apiFetch(`/api/puzzles/next?${q}`, { credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.puzzle) { setErr(d.error || 'Could not load a puzzle'); return; }
      const p: PuzzleData = { id: d.puzzle.id, fen: d.puzzle.fen, moves: d.puzzle.moves, rating: d.puzzle.rating, themes: d.puzzle.themes ?? [] };
      seen.current.push(p.id);
      const t = themeOf(theme);
      const words = mode === 'abc' ? DEFAULTS.abc : { headline: t.headline, sub: t.sub };
      setOpts((o) => ({ ...o, mode, theme, puzzle: p, choices: mode === 'abc' ? pickChoices(p) : undefined, ...(o.mode !== mode || o.theme !== theme ? words : {}) }));
    } catch { setErr('Could not load a puzzle'); } finally { setLoading(false); }
  };
  useEffect(() => { if (!render && !opts.puzzle) void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const p = opts.puzzle;
  const toPlay = p?.fen.split(' ')[1] === 'b' ? 'Black' : 'White';
  const solution = p?.moves.split(' ').filter(Boolean) ?? [];
  const answerPlies = opts.mode === 'mate2' ? solution.length : 1;

  const play = (onDone?: () => void) => {
    if (!p) return;
    clear();
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (opts.music !== 'off') m.start(opts.music); } catch { /* ignore */ }
    setPhase('ask'); setPly(0); setLeft(opts.seconds); mus().accent('riser');
    for (let s = 1; s <= opts.seconds; s++) at(s * 1000, () => { setLeft(opts.seconds - s); mus().accent('tick'); });
    const t = opts.seconds * 1000 + 200;
    if (opts.reveal) {
      at(t, () => { setPhase('answer'); mus().accent('whoosh'); });
      for (let i = 1; i <= answerPlies; i++) at(t + 300 + (i - 1) * 900, () => { setPly(i); playMoveSound(i === answerPlies ? 'check' : i % 2 === 0 ? 'move' : 'capture'); });
      const t2 = t + 300 + answerPlies * 900 + 700;
      at(t2, () => { setPhase('end'); mus().accent('impact'); });
      at(t2 + 2400, () => { music.current?.stop(); onDone?.(); });
    } else {
      at(t, () => { setPhase('end'); mus().accent('impact'); });
      at(t + 2200, () => { music.current?.stop(); onDone?.(); });
    }
  };
  useEffect(() => { if (!render && p) play(); }, [p?.id, opts.mode, opts.reveal, opts.seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!render) return;
    const w = window as unknown as { __studioRender?: Record<string, unknown> };
    w.__studioRender = { ready: true, done: false, start: () => {
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

  // ── The board for the current moment ─────────────────────────────────────
  let fen = p?.fen;
  let lastMove: { from: string; to: string } | null = null;
  let quality: MoveQuality | null = null;
  let arrows: { from: string; to: string; color?: string }[] = [];
  let marks: Record<string, { text: string; color: string; strong?: boolean }> | undefined;
  if (p) {
    if (phase === 'answer' || (phase === 'end' && opts.reveal)) {
      const c = new Chess(p.fen);
      const n = phase === 'end' ? answerPlies : ply;
      const moves = opts.mode === 'abc' ? [opts.choices?.find((x) => x.correct)?.uci ?? solution[0]] : solution;
      for (let i = 0; i < n; i++) { const m = uciMove(c, moves[i]); if (m) lastMove = { from: m.from, to: m.to }; }
      fen = c.fen();
      if (n === answerPlies) quality = c.isCheckmate() ? 'checkmate' : 'best';
    } else if (opts.mode === 'abc' && opts.choices) {
      arrows = opts.choices.map((ch, i) => ({ from: ch.uci.slice(0, 2), to: ch.uci.slice(2, 4), color: ABC_COLORS[i] }));
      marks = Object.fromEntries(opts.choices.map((ch, i) => [ch.uci.slice(2, 4), { text: 'ABC'[i], color: ABC_COLORS[i], strong: true }]));
    }
  }
  const look = useReelLook(opts.look, phase, ply);
  const correctLetter = opts.choices ? 'ABC'[opts.choices.findIndex((c) => c.correct)] : '';
  const flipped = toPlay === 'Black';

  const frame = (
    <div className="relative overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif', ...reelFrameSize(clean || render), background: `radial-gradient(ellipse at 50% 0%, #12301F 0%, ${BG} 60%)` }}
      onClick={() => { if (clean && phase === 'end') setClean(false); }}>
      {p && (
        <div className="flex h-full flex-col items-center justify-center gap-[2.2cqh] px-[5cqw]">
          <div className="text-center">
            <motion.p key={opts.headline} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}
              className="font-black leading-none" style={{ fontSize: opts.mode === 'mate2' ? '8cqh' : '5.2cqh', color: TEXT, letterSpacing: '-0.02em' }}>{opts.headline}</motion.p>
            <p className="mt-[1.2cqh] font-black" style={{ fontSize: '3.3cqh', color: opts.mode === 'abc' ? GOLD : G }}>{opts.sub}</p>
            <p className="mt-[0.8cqh] font-bold" style={{ fontSize: '2.2cqh', color: MUTED }}>{toPlay} to play</p>
          </div>
          <div className="relative w-full rounded-[1.6cqh] p-[1.2cqh]" style={{ background: '#141D1F', border: '1px solid #243033' }}>
            <LookOverride look={look}><ChessBoard fen={fen} lastMove={lastMove} moveQuality={quality} arrows={arrows} squareMarks={marks} flipped={flipped} maxWidthOverride="100%" suppressConfirmMoves animationMs={260} /></LookOverride>
          </div>
          <div className="flex h-[9cqh] items-center justify-center">
            <AnimatePresence mode="wait">
              {phase === 'ask' && (
                <div className="flex items-center gap-[3cqw]">
                  <motion.div key={`c${left}`} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25 }}
                    className="grid shrink-0 place-items-center rounded-full font-black tabular-nums" style={{ width: '8.5cqh', height: '8.5cqh', fontSize: '4.4cqh', color: '#fff', background: left <= 3 ? '#E5484D' : G }}>{left}</motion.div>
                  {/* Comments push a reel out the most, so the ask is on screen the whole countdown. */}
                  <motion.p initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
                    className="font-black leading-tight" style={{ fontSize: '3cqh', color: TEXT }}>{opts.engage ? opts.engage : opts.mode === 'abc' ? <>Comment<br /><span style={{ color: GOLD }}>A, B or C</span> 👇</> : <>Comment<br /><span style={{ color: G }}>your move</span> 👇</>}</motion.p>
                </div>
              )}
              {phase === 'answer' && opts.mode === 'abc' && (
                <motion.p key="ans" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-black" style={{ fontSize: '3.6cqh', color: G }}>
                  {correctLetter}: {opts.choices?.find((c) => c.correct)?.san}
                </motion.p>
              )}
              {phase === 'end' && (
                <motion.div key="end" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
                  <p className="font-black" style={{ fontSize: '3.6cqh', color: TEXT }}>
                    {opts.reveal ? (opts.mode === 'abc' ? `It was ${correctLetter}. Did you get it?` : 'Did you find it?') : opts.mode === 'abc' ? 'Comment A, B or C 👇' : 'Drop your move in the comments 👇'}
                  </p>
                  <p className="mt-[0.6cqh] font-black" style={{ fontSize: '2.4cqh', color: MUTED }}>Chess<span style={{ color: G }}>Scout</span>.net</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  const setMode = (mode: PuzzleReelOpts['mode']) => { if (mode !== opts.mode) void load(mode); };
  const theme = themeOf(opts.theme);
  // The answer in plain moves, for the pinned comment.
  const answerSan = (() => { if (!p) return ''; try { const c = new Chess(p.fen); const mv = opts.mode === 'abc' ? [opts.choices?.find((x) => x.correct)?.uci ?? solution[0]] : solution.slice(0, answerPlies); return mv.map((u) => uciMove(c, u)?.san).filter(Boolean).join(' '); } catch { return ''; } })();
  const caption = opts.mode === 'mate2'
    ? `${opts.headline.charAt(0) + opts.headline.slice(1).toLowerCase()}. ${opts.sub} ${toPlay} to play — drop your move below 👇${opts.reveal ? '' : '\nAnswer in tomorrow\'s reel 👀'}\n\nUnlimited free puzzles at chessscout.net\n\n#chess #chesspuzzle #${theme.group === 'Endgames' ? 'chessendgame' : 'chesstactics'} #${theme.id.toLowerCase()}`
    : `Which move is correct? A, B or C 👇\n${toPlay} to play.${opts.reveal ? '' : ' Answer tomorrow 👀'}\n\nUnlimited free puzzles at chessscout.net\n\n#chess #chesspuzzle #chesstactics #chessgame`;
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">Puzzle reels</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {p ? frame : <div className="grid place-items-center" style={{ aspectRatio: '9 / 16', height: 'min(78dvh, 820px)' }}>{loading ? <Loader2 className="animate-spin" /> : <p className="text-sm text-white/60">{err ?? 'No puzzle yet'}</p>}</div>}
        <div className="w-full max-w-[440px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">Puzzle reels</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex gap-1.5">
            {([['mate2', 'Find the move ★'], ['abc', 'A, B or C?']] as const).map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-black" style={{ background: opts.mode === m ? G : 'rgba(255,255,255,.08)' }}>{l}</button>
            ))}
            <button onClick={() => void load()} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black">{loading ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} />} New puzzle</button>
          </div>
          <div className="space-y-1.5">
            {(['Mates', 'Tactics', 'Endgames'] as const).map((g) => (
              <div key={g} className="flex flex-wrap items-center gap-1">
                <span className="w-[70px] text-[11px] font-bold uppercase tracking-wider text-white/40">{g}</span>
                {THEMES.filter((t) => t.group === g).map((t) => (
                  <button key={t.id} onClick={() => void load(opts.mode, t.id)} className="rounded-md px-2 py-1 text-[11.5px] font-bold"
                    style={{ background: theme.id === t.id ? G : 'rgba(255,255,255,.07)' }}>{t.label}</button>
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-[70px] text-[11px] font-bold uppercase tracking-wider text-white/40">Rating</span>
            {([[400, 1000, 'Beginner'], [1000, 1500, '1000–1500'], [1500, 1900, '1500–1900'], [1900, 2300, '1900–2300'], [2300, 3300, '2300+']] as const).map(([lo, hi, l]) => (
              <button key={l} onClick={() => void load(opts.mode, opts.theme, setRange([lo, hi]))} className="rounded-md px-2 py-1 text-[11.5px] font-bold"
                style={{ background: range[0] === lo && range[1] === hi ? G : 'rgba(255,255,255,.07)' }}>{l}</button>
            ))}
            <span className="ml-1 flex items-center gap-1 text-[11.5px] text-white/50">
              <input type="number" step={50} value={range[0]} onChange={(e) => setRangeState([Number(e.target.value), range[1]])} onBlur={() => void load(opts.mode, opts.theme, setRange(range))} className="w-[64px] rounded-md bg-white/5 px-1.5 py-1 text-[12px] font-bold text-white ring-1 ring-white/10" aria-label="Lowest rating" />
              to
              <input type="number" step={50} value={range[1]} onChange={(e) => setRangeState([range[0], Number(e.target.value)])} onBlur={() => void load(opts.mode, opts.theme, setRange(range))} className="w-[64px] rounded-md bg-white/5 px-1.5 py-1 text-[12px] font-bold text-white ring-1 ring-white/10" aria-label="Highest rating" />
            </span>
          </div>
          {err && <p className="text-[12px] text-[#E5484D]">{err}</p>}
          {p && <p className="text-[12px] text-white/55">Puzzle #{p.id} · rated {p.rating}{opts.mode === 'abc' ? ` · answer: ${correctLetter}` : ''}</p>}
          <HookPicker topics={opts.mode === 'abc' ? ['puzzle'] : themeOf(opts.theme).group === 'Endgames' ? ['endgame', 'puzzle'] : ['puzzle', 'tactics']} onPick={(h) => setOpts({ ...opts, headline: h.text, sub: h.sub ?? '' })} />
          <label className="block text-[12px] text-white/60">Headline<input value={opts.headline} onChange={(e) => setOpts({ ...opts, headline: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
          <label className="block text-[12px] text-white/60">Second line<input value={opts.sub} onChange={(e) => setOpts({ ...opts, sub: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
          <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
            <label className="flex items-center gap-2">Countdown
              <select value={opts.seconds} onChange={(e) => setOpts({ ...opts, seconds: Number(e.target.value) })} className="rounded-lg bg-white/5 px-2 py-1.5 font-bold ring-1 ring-white/10">
                {[5, 7, 10, 15].map((s) => <option key={s} value={s} className="bg-[#0B1112]">{s}s</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={opts.reveal} onChange={(e) => setOpts({ ...opts, reveal: e.target.checked })} className="h-4 w-4 accent-[#81B64C]" /> Show the answer at the end</label>
          </div>
          <p className="text-[11.5px] text-white/45">Answer hidden = "comment your move": it loops and gets comments, which is what the algorithm rewards. Answer shown = a satisfying payoff. So far, "Find the move" (Mate in 2, 12s) has beaten A/B/C on views, rewatches and comments: keep the total around 12 seconds.</p>
          <label className="block text-[12px] text-white/60">Music
            <select value={opts.music} onChange={(e) => setOpts({ ...opts, music: e.target.value as MusicStyle })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10">
              {(['hype', 'epic', 'playful', 'lofi', 'suspense', 'off'] as MusicStyle[]).map((m) => <option key={m} value={m} className="bg-[#0B1112]">{m === 'off' ? 'No music (add a trending sound in Instagram)' : m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>
          <LookPicker value={opts.look} onChange={(v) => setOpts({ ...opts, look: v })} />
          <EngagePicker kind="puzzle" value={opts.engage} onChange={(v) => setOpts({ ...opts, engage: v })} label="Comment prompt beside the countdown (and first line of the caption)" />
          <CaptionBox key={caption + (opts.engage ?? '')} text={withEngage(opts.engage, caption)} />
          {p && <PinnedBox text={hiddenAnswer(answerSan || 'see tomorrow’s reel')} />}
          {!opts.reveal && <p className="text-[11.5px] text-white/45">Tip: post the answer as its own reel the next day ("Yesterday's puzzle: here's the answer"), with the same puzzle and "Show the answer" ticked.</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => play()} disabled={!p} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Play size={14} />Replay</button>
            <button onClick={() => { clear(); music.current?.stop(); setClean(true); setPhase('idle'); at(4000, () => play()); }} disabled={!p} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
            {p && <RenderMp4 name={`chessscout-${opts.mode === 'mate2' ? theme.id : 'abc'}-${p.id}`} shareText={caption} payload={() => ({ source: { kind: 'puzzleReel', opts }, prefs: {} })} />}
          </div>
        </div>
      </div>
    </div>
  );
}
