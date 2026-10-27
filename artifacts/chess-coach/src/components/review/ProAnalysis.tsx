import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  BrainCircuit, Check, ChevronRight, FlipVertical2, Lightbulb, Minus, Play, Plus, RotateCcw, Sparkles, Swords, Target, BookOpen,
} from 'lucide-react';
import { RedesignHeader } from '@/components/RedesignHeader';
import { MistakeFixView } from '@/components/MistakeFixView';
import { MoveNavigationBar } from '@/components/MoveNavigationBar';
import { RD } from '@/lib/redesignTheme';
import { normalizeFen } from '@/lib/utils';

// Pro: the full game analysis, rebuilt as two clear screens.
//   Report: the result, both players' accuracy and game rating, an eval graph
//           you can tap to jump to a move, move quality side by side, how
//           each phase went, the coach's summary and the turning points.
//   Board:  the board with the engine line on mistakes, the coach's note on
//           the current move in large type, and the move list.
// Wide screens show the board on the left and the report on the right.

export type Classification = 'checkmate' | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder' | 'missed_win';

export type ProReviewMove = {
  moveIndex: number;
  san: string;
  color: 'white' | 'black';
  classification: Classification;
  explanation: string;
  betterMove: string | null;
  pros: string[];
  cons: string[];
  cpLoss?: number;
  engineAvailable?: boolean;
  evalAfterCp?: number;
  bestLineSan?: string[];
};

export type ProKeyMistake = { moveIndex: number; move: string; whatWentWrong: string; whatYouShouldHaveDone: string; tip: string };
export type ProGameSummary = { overview: string; keyMistakes: ProKeyMistake[]; strengths: string[]; improvementAreas: string[] };

type GameMove = { san: string; fen: string; fenBefore?: string; from?: string; to?: string; clockSeconds?: number | null };

export interface ProAnalysisProps {
  game: {
    whiteUsername: string; blackUsername: string; whiteRating?: number | null; blackRating?: number | null;
    result?: string | null; opening?: string | null; eco?: string | null;
  };
  moves: GameMove[];
  startFen: string;
  reviewMoves: ProReviewMove[];
  summary: ProGameSummary | null;
  accuracy: { white: number; black: number } | null;
  reviewing: boolean;
  progress: { done: number; total: number } | null;
  reviewError: string | null;
  /** Which side is the signed-in player (null = neither, shown as White). */
  meColor: 'w' | 'b' | null;
  whiteAvatar?: string;
  blackAvatar?: string;
  ply: number;
  setPly: (n: number) => void;
  flipped: boolean;
  onFlip: () => void;
  onReview: (force: boolean) => void;
  onStepByStep: () => void;
  onJumpIn: (fenBefore: string) => void;
  initialTab?: 'report' | 'board';
  backHref?: string;
}

// ── Look ────────────────────────────────────────────────────────────────────
export const CLS: Record<Classification, { label: string; glyph: string; color: string }> = {
  checkmate: { label: 'Checkmate', glyph: '#', color: '#E8B447' },
  brilliant: { label: 'Brilliant', glyph: '!!', color: '#26C2C2' },
  great: { label: 'Great', glyph: '!', color: '#5B9BE0' },
  best: { label: 'Best', glyph: '★', color: '#81B64C' },
  excellent: { label: 'Excellent', glyph: '👍', color: '#95C45A' },
  good: { label: 'Good', glyph: '✓', color: '#8FA97A' },
  book: { label: 'Book', glyph: '📖', color: '#B39272' },
  inaccuracy: { label: 'Inaccuracy', glyph: '?!', color: '#E8B447' },
  mistake: { label: 'Mistake', glyph: '?', color: '#FF8A3D' },
  blunder: { label: 'Blunder', glyph: '??', color: '#FF5058' },
  missed_win: { label: 'Missed win', glyph: '✗', color: '#FF5058' },
};
const BAD = new Set<Classification>(['inaccuracy', 'mistake', 'blunder', 'missed_win']);
const card: React.CSSProperties = { background: RD.card, border: `1px solid ${RD.border}` };
const soft = 'rgba(245,247,246,.84)';

function Glyph({ c, size = 22 }: { c: Classification; size?: number }) {
  const k = CLS[c];
  const emoji = k.glyph === '📖' || k.glyph === '👍';
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-black text-white"
      style={{ width: size, height: size, background: k.color, fontSize: emoji ? size * 0.5 : size * (k.glyph.length > 1 ? 0.42 : 0.5), boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.18)' }}>
      {k.glyph}
    </span>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: RD.muted }}>{children}</h3>
      {right}
    </div>
  );
}

// ── Numbers (same formulas as the rest of the review) ───────────────────────
const LOSS_BY_CLASS: Record<Classification, number> = {
  checkmate: 0, brilliant: 0, great: 0, best: 0, excellent: 0.5, book: 0.7, good: 2,
  inaccuracy: 8, mistake: 16, blunder: 33, missed_win: 25,
};
function fallbackAccuracy(moves: ProReviewMove[]): number {
  if (moves.length === 0) return 0;
  const total = moves.reduce((s, m) => {
    if (m.cpLoss != null && m.engineAvailable) return s + m.cpLoss;
    const base = LOSS_BY_CLASS[m.classification];
    return s + Math.max(base, ['good', 'book', 'excellent', 'best', 'great'].includes(m.classification) && !m.engineAvailable ? 3 : base);
  }, 0);
  return Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.075 * (total / moves.length)) - 3.1668));
}
function gameRating(acc: number): number {
  if (acc <= 10) return 0;
  if (acc >= 99.5) return 3200;
  const a = [[20, 0], [40, 100], [50, 250], [55, 350], [60, 500], [65, 700], [70, 950], [75, 1200], [80, 1500], [85, 1850], [90, 2200], [95, 2700], [99, 3150]];
  for (let i = 1; i < a.length; i++) if (acc <= a[i][0]) return Math.round(a[i - 1][1] + (a[i][1] - a[i - 1][1]) * (acc - a[i - 1][0]) / (a[i][0] - a[i - 1][0]));
  return 3200;
}
const accColor = (acc: number) => acc >= 85 ? '#81B64C' : acc >= 70 ? '#A6CF6E' : acc >= 55 ? '#E8B447' : acc >= 40 ? '#FF8A3D' : '#FF5058';
/** Centipawns (White's side) to White's winning chances, 0–100. */
const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1500, Math.min(1500, cp)))) - 1);

const PHASES = [
  { label: 'Opening', from: 0, to: 20 },
  { label: 'Middlegame', from: 20, to: 60 },
  { label: 'Endgame', from: 60, to: Infinity },
];
function phaseGrade(moves: ProReviewMove[], from: number, to: number): Classification | null {
  const ph = moves.filter(m => m.moveIndex >= from && m.moveIndex < to);
  if (ph.length === 0) return null;
  for (const c of ['blunder', 'missed_win', 'mistake', 'inaccuracy', 'brilliant', 'great'] as Classification[]) if (ph.some(m => m.classification === c)) return c;
  return 'best';
}
const PHASE_WORD: Partial<Record<Classification, string>> = {
  blunder: 'Blunder', missed_win: 'Missed win', mistake: 'Mistake', inaccuracy: 'Inaccuracy', brilliant: 'Brilliant', great: 'Great', best: 'Clean',
};

// ── Pieces ──────────────────────────────────────────────────────────────────
function AccuracyRing({ value, size = 92 }: { value: number; size?: number }) {
  const r = 42, c = 2 * Math.PI * r;
  const col = accColor(value);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, value)) / 100)} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="relative text-center leading-none">
        <div className="font-black tabular-nums" style={{ color: RD.text, fontSize: size * 0.26 }}>{value.toFixed(1)}</div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: RD.muted }}>Accuracy</div>
      </div>
    </div>
  );
}

function Avatar({ src, name, light }: { src?: string; name: string; light: boolean }) {
  return src
    ? <img src={src} alt={name} className="h-11 w-11 rounded-[12px] object-cover" style={{ border: '2px solid rgba(255,255,255,.14)' }} />
    : <span className="grid h-11 w-11 place-items-center rounded-[12px] text-[17px] font-black"
        style={{ background: light ? '#EDE6D6' : '#262A2B', color: light ? '#262A2B' : '#EDE6D6', border: '2px solid rgba(255,255,255,.14)' }}>{name[0]?.toUpperCase()}</span>;
}

/** White's winning chances over the game, with the big moments marked. Tap to jump there. */
function EvalGraph({ reviewMoves, ply, maxPly, onPick, flipped }: { reviewMoves: ProReviewMove[]; ply: number; maxPly: number; onPick: (ply: number) => void; flipped: boolean }) {
  const W = 300, H = 92;
  const pts = useMemo(() => {
    const byPly = new Map<number, ProReviewMove>();
    for (const m of reviewMoves) byPly.set(m.moveIndex + 1, m);
    const out: { ply: number; y: number; m?: ProReviewMove }[] = [{ ply: 0, y: winPct(20) }];
    let last = 20;
    for (let p = 1; p <= maxPly; p++) {
      const m = byPly.get(p);
      if (typeof m?.evalAfterCp === 'number') last = m.evalAfterCp;
      out.push({ ply: p, y: winPct(last), m });
    }
    return out;
  }, [reviewMoves, maxPly]);
  const x = (p: number) => (maxPly > 0 ? (p / maxPly) * W : 0);
  // Your side's chances sit on the bottom when you play White (board not flipped).
  const yOf = (v: number) => (flipped ? (v / 100) * H : H - (v / 100) * H);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ply).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${flipped ? 0 : H} L0,${flipped ? 0 : H} Z`;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pick = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || maxPly === 0) return;
    onPick(Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * maxPly));
  };
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[112px] w-full cursor-pointer touch-none select-none rounded-[12px]"
      onPointerDown={(e) => pick(e.clientX)} onPointerMove={(e) => { if (e.buttons) pick(e.clientX); }} role="img" aria-label="Evaluation graph">
      <rect width={W} height={H} fill="#2B3032" />
      <path d={area} fill="#E9E6DE" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(120,120,120,.45)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke={RD.green} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {pts.filter(p => p.m && (BAD.has(p.m.classification) && p.m.classification !== 'inaccuracy' || p.m.classification === 'brilliant')).map(p => (
        <circle key={p.ply} cx={x(p.ply)} cy={yOf(p.y)} r="3.6" fill={CLS[p.m!.classification].color} stroke="#0D1516" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
export function ProAnalysis(props: ProAnalysisProps) {
  const {
    game, moves, startFen, reviewMoves, summary, accuracy, reviewing, progress, reviewError, meColor,
    whiteAvatar, blackAvatar, ply, setPly, flipped, onFlip, onReview, onStepByStep, onJumpIn, backHref = '/games',
  } = props;
  const [tab, setTab] = useState<'report' | 'board'>(props.initialTab ?? 'report');
  const [isPlaying, setIsPlaying] = useState(false);
  const [slide, setSlide] = useState<0 | 1>(0);
  const [engineStep, setEngineStep] = useState(0);
  useEffect(() => { setSlide(0); setEngineStep(0); }, [ply]);
  const maxPly = moves.length;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 1024px)');
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(() => {
      if (ply >= maxPly) { setIsPlaying(false); return; }
      setPly(ply + 1);
    }, 900);
    return () => clearInterval(t);
  }, [isPlaying, ply, maxPly, setPly]);

  const topRef = useRef<HTMLDivElement | null>(null);
  const goBoard = (p: number) => {
    setIsPlaying(false);
    setPly(Math.max(0, Math.min(maxPly, p)));
    setTab('board');
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const reviewed = reviewMoves.length > 0;
  const me: 'w' | 'b' = meColor ?? 'w';
  const side = (c: 'w' | 'b') => ({
    name: c === 'w' ? game.whiteUsername : game.blackUsername,
    rating: c === 'w' ? game.whiteRating : game.blackRating,
    avatar: c === 'w' ? whiteAvatar : blackAvatar,
    moves: reviewMoves.filter(m => m.color === (c === 'w' ? 'white' : 'black')),
  });
  const you = side(me), opp = side(me === 'w' ? 'b' : 'w');
  const accOf = (c: 'w' | 'b') => (accuracy ? (c === 'w' ? accuracy.white : accuracy.black) : fallbackAccuracy(side(c).moves));
  const youAcc = accOf(me), oppAcc = accOf(me === 'w' ? 'b' : 'w');

  const result = game.result === 'win' ? { t: 'You won', fg: '#95C45A', bg: 'rgba(129,182,76,.16)' }
    : game.result === 'loss' ? { t: 'You lost', fg: '#FF7A80', bg: 'rgba(255,80,88,.16)' }
    : { t: 'Draw', fg: '#C9D2CF', bg: 'rgba(255,255,255,.10)' };

  const turning = useMemo(() => reviewMoves
    .filter(m => ['blunder', 'mistake', 'missed_win', 'brilliant', 'great'].includes(m.classification))
    .sort((a, b) => a.moveIndex - b.moveIndex), [reviewMoves]);

  const keyMistakePly = (km: ProKeyMistake) => {
    const san = (km.move || '').replace(/^\d+\.(\.\.)?\s*/, '').trim();
    const hits = reviewMoves.filter(r => r.san === san);
    if (hits.length) return hits.reduce((a, b) => Math.abs(b.moveIndex - km.moveIndex) < Math.abs(a.moveIndex - km.moveIndex) ? b : a).moveIndex + 1;
    return km.moveIndex + 1;
  };

  // Current move
  const fenAt = (p: number) => (p <= 0 ? startFen : (moves[p - 1]?.fen ?? startFen));
  const current = ply > 0 ? (reviewMoves.find(r => r.moveIndex === ply - 1) ?? null) : null;
  const curMove = ply > 0 ? moves[ply - 1] : null;
  const lastMove = useMemo(() => {
    if (!curMove) return null;
    if (curMove.from && curMove.to) return { from: curMove.from, to: curMove.to };
    try { const c = new Chess(normalizeFen(fenAt(ply - 1))); const r = c.move(curMove.san); return r ? { from: r.from, to: r.to } : null; } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply, curMove]);
  const evalAfter = (p: number): number | null => {
    if (p <= 0) return reviewed ? 20 : null;
    const r = reviewMoves.find(m => m.moveIndex === p - 1);
    return typeof r?.evalAfterCp === 'number' ? r.evalAfterCp : null;
  };
  const isBad = !!current && BAD.has(current.classification);
  const lineLen = current?.bestLineSan?.length ?? 0;
  const moveNo = (idx: number) => `${Math.floor(idx / 2) + 1}${idx % 2 === 0 ? '.' : '...'}`;

  // ── Report ────────────────────────────────────────────────────────────────
  const qualityRows = (['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder', 'missed_win'] as Classification[])
    .map(c => ({ c, you: you.moves.filter(m => m.classification === c).length, opp: opp.moves.filter(m => m.classification === c).length }))
    .filter(r => r.you + r.opp > 0);

  const report = (
    <div className="space-y-3">
      {/* Hero: result, players, accuracy, game rating */}
      <div className="rounded-[20px] p-4" style={card}>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full px-3 py-1 text-[12.5px] font-black" style={{ background: result.bg, color: result.fg }}>{result.t}</span>
          {game.opening && (
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: RD.muted }}>
              <BookOpen className="h-3.5 w-3.5 shrink-0" style={{ color: RD.green }} />
              <span className="truncate">{game.eco ? `${game.eco} · ` : ''}{game.opening}</span>
            </span>
          )}
        </div>
        {reviewed ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[{ p: you, acc: youAcc, label: 'You' }, { p: opp, acc: oppAcc, label: 'Opponent' }].map(({ p, acc, label }, i) => (
              <div key={i} className="flex flex-col items-center rounded-[16px] px-2 py-3" style={{ background: RD.cardLight }}>
                <div className="flex w-full min-w-0 items-center gap-2">
                  <Avatar src={p.avatar} name={p.name} light={(i === 0 ? me : me === 'w' ? 'b' : 'w') === 'w'} />
                  <div className="min-w-0 leading-tight">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: RD.muted }}>{label}</p>
                    <p className="truncate text-[14px] font-extrabold" style={{ color: RD.text }}>{p.name}</p>
                    {p.rating ? <p className="text-[12px] font-bold" style={{ color: RD.muted }}>{p.rating}</p> : null}
                  </div>
                </div>
                <div className="mt-3"><AccuracyRing value={acc} /></div>
                <div className="mt-2 text-center">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: RD.muted }}>Game rating</p>
                  <p className="text-[20px] font-black tabular-nums" style={{ color: RD.text }}>{gameRating(acc).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-[14px] px-3.5 py-3" style={{ background: RD.cardLight }}>
            {reviewing ? <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2" style={{ borderColor: RD.green, borderTopColor: 'transparent' }} /> : <BrainCircuit className="h-5 w-5 shrink-0" style={{ color: RD.green }} />}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold" style={{ color: RD.text }}>{reviewing ? 'Reviewing your game…' : reviewError ? 'The review didn\'t finish' : 'Review this game'}</p>
              <p className="text-[12.5px]" style={{ color: RD.muted }}>
                {reviewing ? (progress ? `Move ${progress.done} of ${progress.total}` : 'Starting the engine…') : reviewError ?? 'Accuracy, game rating, every move graded and the coach\'s summary.'}
              </p>
              {reviewing && progress && progress.total > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round(progress.done / progress.total * 100)}%`, background: RD.green }} />
                </div>
              )}
            </div>
            {!reviewing && (
              <button onClick={() => onReview(!!reviewError)} className="shrink-0 rounded-[12px] px-3.5 py-2.5 text-[13px] font-extrabold text-white" style={{ background: RD.green }}>
                {reviewError ? 'Retry' : 'Review'}
              </button>
            )}
          </div>
        )}
      </div>

      {reviewed && (
        <>
          {/* Eval graph */}
          <div className="rounded-[20px] p-4" style={card}>
            <SectionTitle right={<span className="text-[11.5px]" style={{ color: RD.muted }}>Tap to jump to a move</span>}>Game flow</SectionTitle>
            <EvalGraph reviewMoves={reviewMoves} ply={ply} maxPly={maxPly} flipped={me === 'b'} onPick={(p) => setPly(p)} />
            <div className="mt-2 flex items-center justify-between text-[11.5px] font-semibold" style={{ color: RD.muted }}>
              <span>Start</span>
              <span className="tabular-nums" style={{ color: RD.text }}>{ply > 0 ? `${moveNo(ply - 1)} ${moves[ply - 1]?.san ?? ''}` : 'Start position'}</span>
              <button onClick={() => goBoard(ply)} className="flex items-center gap-0.5 font-extrabold" style={{ color: RD.green }}>On the board <ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          {/* Move quality */}
          <div className="rounded-[20px] p-4" style={card}>
            <SectionTitle>Move quality</SectionTitle>
            <div className="grid grid-cols-[1fr_56px_56px] items-center gap-y-1 text-[13.5px]">
              <span />
              <span className="text-center text-[10.5px] font-black uppercase tracking-wider" style={{ color: RD.muted }}>You</span>
              <span className="text-center text-[10.5px] font-black uppercase tracking-wider" style={{ color: RD.muted }}>Opp</span>
              {qualityRows.map(r => (
                <React.Fragment key={r.c}>
                  <span className="flex items-center gap-2.5 py-1.5 font-semibold" style={{ color: RD.text }}><Glyph c={r.c} /> {CLS[r.c].label}</span>
                  <span className="text-center text-[17px] font-black tabular-nums" style={{ color: r.you ? CLS[r.c].color : 'rgba(255,255,255,.22)' }}>{r.you}</span>
                  <span className="text-center text-[17px] font-black tabular-nums" style={{ color: r.opp ? CLS[r.c].color : 'rgba(255,255,255,.22)' }}>{r.opp}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Phases */}
          <div className="rounded-[20px] p-4" style={card}>
            <SectionTitle>How each phase went</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {PHASES.map(ph => {
                const g = phaseGrade(you.moves, ph.from, ph.to);
                const o = phaseGrade(opp.moves, ph.from, ph.to);
                return (
                  <div key={ph.label} className="flex flex-col items-center gap-1.5 rounded-[14px] px-1 py-3 text-center" style={{ background: RD.cardLight }}>
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: RD.muted }}>{ph.label}</span>
                    {g ? <Glyph c={g} size={30} /> : <span className="grid h-[30px] place-items-center" style={{ color: RD.muted }}>—</span>}
                    <span className="text-[13px] font-extrabold" style={{ color: g ? CLS[g].color : RD.muted }}>{g ? PHASE_WORD[g] : 'Not reached'}</span>
                    {o && <span className="text-[10.5px]" style={{ color: RD.muted }}>Opp: {PHASE_WORD[o]}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coach's summary */}
          {summary && (
            <div className="rounded-[20px] p-4" style={card}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: 'rgba(129,182,76,.16)' }}>
                  <BrainCircuit className="h-[18px] w-[18px]" style={{ color: RD.green }} />
                </span>
                <span className="text-[16px] font-extrabold" style={{ color: RD.text }}>Coach's summary</span>
              </div>
              <p className="text-[15px] leading-relaxed" style={{ color: soft }}>{summary.overview}</p>

              {summary.keyMistakes.length > 0 && (
                <div className="mt-5 space-y-2.5">
                  <SectionTitle>Key mistakes</SectionTitle>
                  {summary.keyMistakes.map((km, i) => (
                    <button key={i} onClick={() => goBoard(keyMistakePly(km))} className="block w-full rounded-[16px] p-3.5 text-left transition-transform active:scale-[0.99]" style={{ background: RD.cardLight, border: `1px solid ${RD.border}` }}>
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 rounded-[9px] px-2 py-1 text-[13px] font-black" style={{ background: 'rgba(255,80,88,.14)', color: '#FF7A80' }}>{km.move}</span>
                        <p className="flex-1 pt-0.5 text-[14px] font-semibold leading-snug" style={{ color: RD.text }}>{km.whatWentWrong}</p>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0" style={{ color: RD.muted }} />
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-start gap-2.5 rounded-[11px] px-3 py-2" style={{ background: 'rgba(129,182,76,.10)' }}>
                          <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: RD.green }} strokeWidth={3} />
                          <p className="text-[13.5px] leading-snug" style={{ color: soft }}>{km.whatYouShouldHaveDone}</p>
                        </div>
                        <div className="flex items-start gap-2.5 px-1">
                          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: RD.gold }} />
                          <p className="text-[13px] leading-snug" style={{ color: RD.muted }}>{km.tip}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {(summary.strengths.length > 0 || summary.improvementAreas.length > 0) && (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {summary.strengths.length > 0 && (
                    <div>
                      <SectionTitle>What you did well</SectionTitle>
                      <ul className="space-y-1.5">
                        {summary.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-2.5 rounded-[12px] px-3 py-2.5 text-[14px] leading-snug" style={{ background: 'rgba(129,182,76,.08)', color: RD.text }}>
                            <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: RD.green }} strokeWidth={3} />{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summary.improvementAreas.length > 0 && (
                    <div>
                      <SectionTitle>Work on</SectionTitle>
                      <ul className="space-y-1.5">
                        {summary.improvementAreas.map((a, i) => (
                          <li key={i} className="flex items-start gap-2.5 rounded-[12px] px-3 py-2.5 text-[14px] leading-snug" style={{ background: 'rgba(232,180,71,.08)', color: RD.text }}>
                            <Target className="mt-0.5 h-4 w-4 shrink-0" style={{ color: RD.gold }} />{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Turning points */}
          {turning.length > 0 && (
            <div className="overflow-hidden rounded-[20px]" style={card}>
              <div className="px-4 pt-4"><SectionTitle right={<span className="text-[11.5px] font-bold" style={{ color: RD.muted }}>{turning.length}</span>}>Turning points</SectionTitle></div>
              {turning.map((m, i) => {
                const mine = (m.color === 'white') === (me === 'w');
                return (
                  <button key={m.moveIndex} onClick={() => goBoard(m.moveIndex + 1)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]" style={{ borderTop: i ? `1px solid ${RD.border}` : undefined }}>
                    <Glyph c={m.classification} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <b className="text-[15px] font-extrabold" style={{ color: RD.text }}>{moveNo(m.moveIndex)} {m.san}</b>
                        <span className="text-[11.5px] font-bold" style={{ color: CLS[m.classification].color }}>{CLS[m.classification].label}</span>
                        <span className="text-[11px]" style={{ color: RD.muted }}>{mine ? 'You' : 'Opponent'}</span>
                      </span>
                      {m.betterMove && BAD.has(m.classification) && <span className="block truncate text-[12.5px] font-semibold" style={{ color: RD.green }}>Better: {m.betterMove}</span>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: RD.muted }} />
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={onStepByStep} className="flex items-center justify-center gap-2 rounded-[14px] py-3.5 text-[14px] font-extrabold text-white" style={{ background: `linear-gradient(180deg, #8FC25A, ${RD.green})`, boxShadow: '0 3px 0 #5F8F36' }}>
              <Play className="h-4 w-4" fill="currentColor" /> Step-by-step
            </button>
            <button onClick={() => onReview(true)} disabled={reviewing} className="flex items-center justify-center gap-2 rounded-[14px] py-3.5 text-[14px] font-extrabold disabled:opacity-50" style={{ background: 'rgba(255,255,255,.06)', border: `1px solid ${RD.border}`, color: RD.text }}>
              <RotateCcw className="h-4 w-4" /> {reviewing ? 'Analyzing…' : 'Re-analyze'}
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ── Board ────────────────────────────────────────────────────────────────
  const coach = (
    <div className="rounded-[20px] p-4" style={card}>
      {ply === 0 ? (
        <div className="flex items-start gap-3">
          <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0" style={{ color: RD.green }} />
          <p className="text-[14.5px] leading-relaxed" style={{ color: soft }}>
            {reviewed ? 'Step through the game with the arrows, or tap a move below. The coach explains every move here.' : reviewing ? 'The coach is reviewing this game. Notes for each move appear here when it\'s done.' : 'Review this game to get the coach\'s notes on every move.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            {current ? <Glyph c={current.classification} size={30} /> : null}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[17px] font-black" style={{ color: RD.text }}>{moveNo(ply - 1)} {curMove?.san}</p>
              <p className="text-[12.5px] font-bold" style={{ color: current ? CLS[current.classification].color : RD.muted }}>
                {current ? CLS[current.classification].label : reviewed ? 'Not graded' : 'Not reviewed yet'}
                <span style={{ color: RD.muted }}> · {(ply - 1) % 2 === 0 ? game.whiteUsername : game.blackUsername}</span>
              </p>
            </div>
          </div>
          {current?.explanation && <p className="mt-3 text-[15px] leading-relaxed" style={{ color: soft }}>{current.explanation}</p>}
          {current && (current.pros?.length > 0 || current.cons?.length > 0) && (
            <ul className="mt-3 space-y-1.5">
              {current.pros?.map((p, i) => (
                <li key={`p${i}`} className="flex items-start gap-2.5 text-[13.5px] leading-snug" style={{ color: soft }}>
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(129,182,76,.2)' }}><Plus className="h-3 w-3" style={{ color: RD.green }} strokeWidth={3} /></span>{p}
                </li>
              ))}
              {current.cons?.map((c, i) => (
                <li key={`c${i}`} className="flex items-start gap-2.5 text-[13.5px] leading-snug" style={{ color: soft }}>
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(255,80,88,.2)' }}><Minus className="h-3 w-3" style={{ color: '#FF7A80' }} strokeWidth={3} /></span>{c}
                </li>
              ))}
            </ul>
          )}
          {isBad && current?.betterMove && (
            <div className="mt-3 flex items-start gap-2.5 rounded-[13px] px-3.5 py-3" style={{ background: 'rgba(129,182,76,.10)', border: '1px solid rgba(129,182,76,.25)' }}>
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: RD.green }} />
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: RD.green }}>Better move</p>
                <p className="text-[14px] leading-snug" style={{ color: RD.text }}>{current.betterMove}</p>
                {lineLen > 1 && <p className="mt-1 text-[12px]" style={{ color: RD.muted }}>Tap "Engine line" above the board to play it out.</p>}
              </div>
            </div>
          )}
          <button onClick={() => onJumpIn(fenAt(ply - 1))} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[13px] py-3 text-[14px] font-extrabold" style={{ background: 'rgba(255,255,255,.06)', border: `1px solid ${RD.border}`, color: RD.text }}>
            <Swords className="h-4 w-4" style={{ color: RD.green }} /> Play from here vs a bot
          </button>
        </>
      )}
    </div>
  );

  const moveList = (
    <div className="rounded-[20px] p-3" style={card}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: RD.muted }}>Moves</h3>
        <button onClick={() => setPly(0)} className="text-[12px] font-bold" style={{ color: ply === 0 ? RD.green : RD.muted }}>Start</button>
      </div>
      <div className="grid grid-cols-[30px_1fr_1fr] gap-x-1 gap-y-0.5">
        {Array.from({ length: Math.ceil(maxPly / 2) }).map((_, i) => (
          <React.Fragment key={i}>
            <span className="self-center text-right text-[12px] font-bold tabular-nums" style={{ color: RD.muted }}>{i + 1}.</span>
            {[i * 2, i * 2 + 1].map(idx => {
              const m = moves[idx];
              if (!m) return <span key={idx} />;
              const r = reviewMoves.find(x => x.moveIndex === idx);
              const active = ply === idx + 1;
              const showMark = r && (BAD.has(r.classification) || r.classification === 'brilliant' || r.classification === 'great');
              return (
                <button key={idx} onClick={() => { setIsPlaying(false); setPly(idx + 1); }}
                  className="flex min-w-0 items-center gap-1.5 rounded-[9px] px-2 py-1.5 text-left text-[14px] font-bold"
                  style={active ? { background: RD.green, color: '#fff' } : { color: RD.text }}>
                  <span className="truncate">{m.san}</span>
                  {showMark && <span className="text-[11px] font-black" style={{ color: active ? '#fff' : CLS[r!.classification].color }}>{CLS[r!.classification].glyph}</span>}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  const board = (
    <div className="space-y-3">
      <div className="mx-auto w-full" style={{ maxWidth: 'min(100%, max(300px, calc(100dvh - 300px)))' }}>
        <MistakeFixView
          playedEvalCp={evalAfter(ply)}
          engineEvalCp={evalAfter(ply - 1)}
          prevFen={isBad ? fenAt(ply - 1) : fenAt(ply)}
          playedMove={isBad && curMove && lastMove ? { san: curMove.san, from: lastMove.from, to: lastMove.to } : null}
          betterMoveText={isBad ? current!.betterMove : null}
          bestLineSan={isBad ? (current!.bestLineSan ?? []) : []}
          classification={current?.classification ?? 'best'}
          flipped={flipped}
          slide={isBad ? slide : 0}
          onSlideChange={setSlide}
          engineStep={isBad ? engineStep : 0}
          plain={isBad ? null : {
            fen: fenAt(ply), lastMove, quality: current?.classification ?? null,
            label: ply === 0 ? 'Start position' : current ? CLS[current.classification].label : 'Move',
            san: curMove?.san ?? null, evalCp: evalAfter(ply),
          }}
        />
      </div>
      <MoveNavigationBar
        variant="redesign"
        isPlaying={isPlaying}
        onFirst={() => { setIsPlaying(false); setPly(0); }}
        onPrev={() => { if (isBad && slide === 1 && lineLen > 1 && engineStep > 0) setEngineStep(s => s - 1); else setPly(Math.max(0, ply - 1)); }}
        onPlayPause={() => setIsPlaying(p => !p)}
        onNext={() => { if (isBad && slide === 1 && lineLen > 1 && engineStep < lineLen - 1) setEngineStep(s => s + 1); else setPly(Math.min(maxPly, ply + 1)); }}
        onLast={() => { setIsPlaying(false); setPly(maxPly); }}
        canGoBack={isBad && slide === 1 && lineLen > 1 ? engineStep > 0 : ply > 0}
        canGoForward={isBad && slide === 1 && lineLen > 1 ? engineStep < lineLen - 1 : ply < maxPly}
      />
      {coach}
      {moveList}
    </div>
  );

  const tabBtn = (id: 'report' | 'board', label: string) => (
    <button onClick={() => setTab(id)} className="flex-1 rounded-[12px] py-2.5 text-[14px] font-extrabold transition-colors"
      style={tab === id ? { background: RD.green, color: '#fff' } : { color: RD.muted }}>{label}</button>
  );

  return (
    <div className="mx-auto w-full max-w-[1180px] px-3 pb-28 md:px-0 md:pb-10">
      <div ref={topRef} className="scroll-mt-2" />
      <RedesignHeader dense title="Game Analysis" backHref={backHref}
        right={<>
          <button onClick={onStepByStep} disabled={!reviewed} aria-label="Step-by-step review" title="Step-by-step review" className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30"><Sparkles size={19} /></button>
          <button onClick={onFlip} aria-label="Flip board" title="Flip board" className="grid h-9 w-9 place-items-center rounded-full"><FlipVertical2 size={19} /></button>
        </>} />
      {/* Phones and tablets: two tabs. Wide screens: both side by side. */}
      {wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-5">
          <div className="mx-auto w-full max-w-[700px]">{board}</div>
          <div className="sticky top-3 max-h-[calc(100vh-1.5rem)] overflow-y-auto pr-1 hide-scrollbar">{report}</div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-1 rounded-[15px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
            {tabBtn('report', 'Report')}
            {tabBtn('board', 'Board')}
          </div>
          {tab === 'report' ? report : board}
        </>
      )}
    </div>
  );
}
