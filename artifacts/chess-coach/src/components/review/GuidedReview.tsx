import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Chess } from 'chess.js';
import { ArrowLeft, ChevronLeft, ChevronRight, FlipVertical2, ListTree, Star, RotateCcw, X } from 'lucide-react';
import { MaterialStrip } from '@/components/GameStatusStrip';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { normalizeFen } from '@/lib/utils';
import { playMoveSound } from '@/context/SettingsContext';

// Step-by-step game review: the coach talks you through the game one move
// at a time, above a full-width board that shows each move's quality
// (coloured squares, a badge on the piece, arrows for the better move and
// the reply it allows). A move strip under the board, and Best / Retry /
// Show / Next at the bottom. Built on the same review data as the full
// analysis view, which stays one tap away.

export type Classification = MoveQuality;
export interface GuidedReviewMove {
  moveIndex: number; san: string; color: 'white' | 'black'; classification: Classification;
  explanation: string; betterMove: string | null; evalAfterCp?: number; bestLineSan?: string[];
  /** The engine's expected continuation after this move (both sides). */
  replyLineSan?: string[];
  pros?: string[]; cons?: string[];
}
interface PlyMove { san: string; fen: string; from?: string | null; to?: string | null; fenBefore?: string | null }

const GREEN = '#81B64C';
const BG = '#0B1112';
const CLS: Record<Classification, { color: string; glyph: string; phrase: string; strip: boolean; textColor?: string }> = {
  checkmate: { color: '#C9971C', glyph: '#', phrase: 'is checkmate', strip: true },
  brilliant: { color: '#1BACA6', glyph: '!!', phrase: 'is brilliant', strip: true, textColor: '#3FD0C9' },
  great: { color: '#4A8BD6', glyph: '!', phrase: 'is a great move', strip: true, textColor: '#74A8EA' },
  best: { color: '#5FA83A', glyph: '★', phrase: 'is best', strip: true },
  excellent: { color: '#7DB94A', glyph: '!', phrase: 'is excellent', strip: true },
  good: { color: '#8AA86E', glyph: '✓', phrase: 'is good', strip: false },
  book: { color: '#A88865', glyph: '📖', phrase: 'is a book move', strip: true },
  inaccuracy: { color: '#E3AE2A', glyph: '?!', phrase: 'is an inaccuracy', strip: true, textColor: '#F0C14B' },
  mistake: { color: '#E5822A', glyph: '?', phrase: 'is a mistake', strip: true, textColor: '#F29A4A' },
  blunder: { color: '#CA3431', glyph: '??', phrase: 'is a blunder', strip: true, textColor: '#F0605D' },
  missed_win: { color: '#B8343E', glyph: '✗', phrase: 'is a miss', strip: true, textColor: '#F0605D' },
};
const BAD = new Set<Classification>(['inaccuracy', 'mistake', 'blunder', 'missed_win']);
const GOOD_REPLY = new Set<Classification>(['best', 'brilliant', 'great', 'excellent', 'checkmate']);

/** "Nf3" -> "♘f3" (outlined for White, solid for Black), as text not emoji. */
function figurine(san: string, white: boolean): string {
  const map: Record<string, string> = white
    ? { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }
    : { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };
  return san.replace(/^[KQRBN]/, (p) => `${map[p]}︎`);
}
function evalLabel(cp?: number | null): string | null {
  if (typeof cp !== 'number' || !Number.isFinite(cp)) return null;
  if (Math.abs(cp) >= 9000) { const n = Math.max(0, 10000 - Math.abs(cp)); return `${cp > 0 ? '+' : '-'}M${n || ''}`; }
  const v = cp / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
}
function sanToSquares(fen: string, san: string): { from: string; to: string; fen: string } | null {
  try { const c = new Chess(normalizeFen(fen)); const m = c.move(san); return m ? { from: m.from, to: m.to, fen: c.fen() } : null; } catch { return null; }
}
function soundFor(san: string) {
  playMoveSound(san.includes('#') || san.includes('+') ? 'check' : san.startsWith('O-O') ? 'castle' : san.includes('=') ? 'promote' : san.includes('x') ? 'capture' : 'move');
}
/** Splits the coach's text: what fits the top card (about two lines), and the rest for below. */
function splitText(t: string): { top: string; rest: string } {
  const clean = (t || '').replace(/\s+/g, ' ').trim();
  // Sentence breaks are a stop followed by a space and a capital, so move numbers ("8...Bxc6 9.Bxc6") stay whole.
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-Z"(])/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { top: '', rest: '' };
  // One long sentence: it can't fit on top, so it all goes below.
  if (parts[0].length > 110) return { top: '', rest: clean };
  let top = parts[0]; let k = 1;
  while (k < parts.length && (top + ' ' + parts[k]).length <= 100) { top += ' ' + parts[k]; k++; }
  return { top, rest: parts.slice(k).join(' ') };
}

function standing(cp: number | null | undefined): string {
  if (cp == null) return '';
  const side = cp > 0 ? 'White' : 'Black';
  if (Math.abs(cp) >= 9000) return `${side} has a forced mate`;
  const a = Math.abs(cp);
  return a < 50 ? 'About equal' : a < 150 ? `${side} is slightly better` : a < 400 ? `${side} is better` : `${side} is winning`;
}


function Badge({ cls, size = 22 }: { cls: Classification; size?: number }) {
  const c = CLS[cls];
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-black text-white" aria-hidden
      style={{ width: size, height: size, background: c.color, fontSize: size * (c.glyph.length > 1 ? 0.46 : 0.58), boxShadow: '0 1px 0 rgba(0,0,0,.25)' }}>
      {c.glyph}
    </span>
  );
}

function EvalBarH({ cp }: { cp: number | null }) {
  const white = cp == null ? 50 : Math.abs(cp) >= 9000 ? (cp > 0 ? 100 : 0) : Math.max(4, Math.min(96, 50 + 50 * (2 / (1 + Math.exp(-cp / 400)) - 1)));
  const label = evalLabel(cp);
  return (
    <div className="relative h-[14px] w-full overflow-hidden rounded-[4px]" style={{ background: '#3A3A38' }} aria-label={`Evaluation ${label ?? ''}`}>
      <div className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out" style={{ background: '#F2F2EE', width: `${white}%` }} />
      {label && <span className="absolute inset-y-0 flex items-center px-1.5 text-[10px] font-black tabular-nums"
        style={white >= 50 ? { left: 0, color: '#1C1C1C' } : { right: 0, color: '#F2F2EE' }}>{label}</span>}
    </div>
  );
}

export interface GuidedReviewProps {
  moves: PlyMove[];
  startFen: string;
  reviewMoves: GuidedReviewMove[];
  ply: number;
  setPly: (n: number) => void;
  flipped: boolean;
  onFlip: () => void;
  whiteName: string; blackName: string;
  accuracy?: { white: number; black: number } | null;
  result?: string | null;
  onExit: () => void;
  onBack: () => void;
  /** 'preparing' while the engine reviews the game; the moves can still be browsed. */
  status?: 'ready' | 'loading' | 'preparing' | 'error';
  progress?: { done: number; total: number } | null;
  errorText?: string | null;
  onRetryReview?: () => void;
  /** Pro: the full in-depth analysis view is available. */
  canFullAnalysis?: boolean;
  /** Not Pro: where "Full analysis (Pro)" goes (the Pro page). */
  onUpgrade?: () => void;
}

type Mode = { kind: 'main' } | { kind: 'best'; step: number } | { kind: 'reply'; step: number } | { kind: 'retry'; state: 'trying' | 'right' | 'wrong' };

export function GuidedReview({ moves, startFen, reviewMoves, ply, setPly, flipped, onFlip, whiteName, blackName, accuracy, result, onExit, onBack, status = 'ready', progress, errorText, onRetryReview, canFullAnalysis = true, onUpgrade }: GuidedReviewProps) {
  // Full analysis (with the AI coach) is Pro: members go there, others to the Pro page.
  const openFull = canFullAnalysis ? onExit : (onUpgrade ?? onExit);
  const ProTag = () => <span className="ml-1 rounded px-1 py-px text-[9.5px] font-black tracking-wide" style={{ background: '#E8B447', color: '#1C1C1C' }}>PRO</span>;
  const max = moves.length;
  const [mode, setMode] = useState<Mode>({ kind: 'main' });
  const [expanded, setExpanded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const byIndex = useMemo(() => new Map(reviewMoves.map((r) => [r.moveIndex, r])), [reviewMoves]);
  const fenAt = useCallback((n: number) => (n <= 0 ? startFen : moves[n - 1]?.fen ?? startFen), [moves, startFen]);
  const rev = ply > 0 ? byIndex.get(ply - 1) ?? null : null;
  const move = ply > 0 ? moves[ply - 1] : null;
  const fenBefore = ply > 0 ? (move?.fenBefore || fenAt(ply - 1)) : startFen;
  const isWhiteMove = ply > 0 && (rev ? rev.color === 'white' : new Chess(normalizeFen(fenBefore)).turn() === 'w');
  const bad = !!rev && BAD.has(rev.classification);

  // Leaving a move resets the side views.
  useEffect(() => { setMode({ kind: 'main' }); setExpanded(false); }, [ply]);

  const go = useCallback((n: number) => {
    const next = Math.max(0, Math.min(max, n));
    if (next === ply) return;
    if (next === ply + 1 && moves[next - 1]?.san) soundFor(moves[next - 1].san);
    setPly(next);
  }, [max, ply, moves, setPly]);

  // Keyboard and swipe.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(ply + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(ply - 1); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [go, ply]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { if (mode.kind === 'retry') return; touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(ply + (dx < 0 ? 1 : -1));
  };

  // What the board shows.
  const lastMoveOf = (n: number) => {
    if (n <= 0) return null;
    const m = moves[n - 1];
    if (m?.from && m?.to) return { from: m.from, to: m.to };
    const r = m?.san ? sanToSquares(m.fenBefore || fenAt(n - 1), m.san) : null;
    return r ? { from: r.from, to: r.to } : null;
  };
  const bestApplied = rev?.betterMove ? sanToSquares(fenBefore, rev.betterMove) : null;
  const line = useMemo(() => {
    const out: { san: string; from: string; to: string; fen: string }[] = [];
    let f = fenBefore;
    for (const san of rev?.bestLineSan ?? []) { const r = sanToSquares(f, san); if (!r) break; out.push({ san, ...r }); f = r.fen; }
    return out;
  }, [fenBefore, rev?.bestLineSan]);

  // Best: the better move and the engine's next few moves after it.
  const bestLine = useMemo(() => {
    if (line.length && (!rev?.betterMove || line[0].san === rev.betterMove)) return line;
    return bestApplied && rev?.betterMove ? [{ san: rev.betterMove, ...bestApplied }] : [];
  }, [line, bestApplied, rev?.betterMove]);

  // What the engine expects next, from the position after this move.
  const replyLine = useMemo(() => {
    const out: { san: string; from: string; to: string; fen: string }[] = [];
    if (ply <= 0) return out;
    let f = fenAt(ply);
    for (const san of rev?.replyLineSan ?? []) { const r = sanToSquares(f, san); if (!r) break; out.push({ san, ...r }); f = r.fen; }
    return out;
  }, [ply, fenAt, rev?.replyLineSan]);

  // The reply this move allows (the engine's choice for the other side next).
  const replyArrow = useMemo(() => {
    if (!rev || !bad || ply >= max) return null;
    const next = byIndex.get(ply);
    const nm = moves[ply];
    const san = next && GOOD_REPLY.has(next.classification) ? nm?.san : next?.betterMove;
    if (!san) return null;
    const r = sanToSquares(fenAt(ply), san);
    return r ? { from: r.from, to: r.to, color: 'rgba(66,153,225,0.85)' } : null;
  }, [rev, bad, ply, max, byIndex, moves, fenAt]);

  let boardFen = fenAt(ply);
  let lastMove = lastMoveOf(ply);
  let quality: MoveQuality | null = rev?.classification ?? null;
  let arrows: { from: string; to: string; color?: string }[] = [];
  if (mode.kind === 'main') {
    if (bad && bestApplied) arrows.push({ from: bestApplied.from, to: bestApplied.to, color: 'rgba(129,182,76,0.9)' });
    if (replyArrow) arrows.push(replyArrow);
  } else if (mode.kind === 'best' && bestLine.length) {
    const step = Math.min(mode.step, bestLine.length - 1);
    boardFen = bestLine[step].fen; lastMove = { from: bestLine[step].from, to: bestLine[step].to }; quality = step === 0 ? 'best' : null; arrows = [];
  } else if (mode.kind === 'reply' && replyLine.length) {
    const step = Math.min(mode.step, replyLine.length - 1);
    boardFen = replyLine[step].fen; lastMove = { from: replyLine[step].from, to: replyLine[step].to }; quality = null; arrows = [];
  } else if (mode.kind === 'retry') {
    boardFen = fenBefore; lastMove = ply > 1 ? lastMoveOf(ply - 1) : null; quality = null; arrows = [];
  }
  const cpNow = mode.kind === 'main' ? (ply === 0 ? 20 : rev?.evalAfterCp ?? null) : rev?.evalAfterCp ?? null;

  // Best: play the line through, one move at a time (tap a move to jump to it).
  const [autoPlay, setAutoPlay] = useState(true);
  useEffect(() => {
    if ((mode.kind !== 'best' && mode.kind !== 'reply') || !autoPlay) return;
    const l = mode.kind === 'best' ? bestLine : replyLine;
    if (mode.step >= l.length - 1) return;
    const kind = mode.kind;
    const t = setTimeout(() => { soundFor(l[mode.step + 1].san); setMode({ kind, step: mode.step + 1 }); }, 1100);
    return () => clearTimeout(t);
  }, [mode, bestLine, replyLine, autoPlay]);

  // ── The coach's bubble ─────────────────────────────────────────────────
  const counts = useMemo(() => {
    const keys: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'missed_win', 'blunder'];
    const c = (color: 'white' | 'black') => Object.fromEntries(keys.map((k) => [k, reviewMoves.filter((m) => m.color === color && m.classification === k).length])) as Record<Classification, number>;
    return { keys, white: c('white'), black: c('black') };
  }, [reviewMoves]);

  // Top card: short, fixed height (so the board never moves). Under the
  // board: the fuller explanation and extras for the same move.
  const H = 'text-[15px] font-extrabold text-[#F5F7F6]';
  const P = 'text-[13.5px] leading-snug text-[#C9CFCD]';
  const pieceName: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
  const chipsFor = (kind: 'best' | 'reply', l: { san: string; fen: string }[], start: string, minLen: number) => l.length >= minLen && (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[13.5px] text-[#C9CFCD]">
      {l.map((m, i) => {
        const w = new Chess(normalizeFen(i === 0 ? start : l[i - 1].fen)).turn() === 'w';
        const on = mode.kind === kind && i === mode.step;
        return (
          <button key={i} onClick={() => { setAutoPlay(false); if (mode.kind !== kind) soundFor(m.san); setMode({ kind, step: i }); }}
            className={`rounded px-1.5 py-0.5 ${on ? 'bg-[#81B64C]/25 font-bold text-[#F5F7F6]' : 'bg-white/5'}`}>
            {figurine(m.san, w)}
          </button>
        );
      })}
      {mode.kind === kind
        ? <button onClick={() => { setAutoPlay(true); soundFor(l[0].san); setMode({ kind, step: 0 }); }} className="ml-1 text-[12px] font-bold text-[#81B64C]">Replay</button>
        : <button onClick={() => { setAutoPlay(true); soundFor(l[0].san); setMode({ kind, step: 0 }); }} className="ml-1 text-[12px] font-bold text-[#81B64C]">Play</button>}
    </div>
  );
  const lineChips = chipsFor('best', bestLine, fenBefore, 2);
  const L = 'text-[11.5px] font-bold uppercase tracking-wide text-[#87918E]';

  let top: React.ReactNode = null;
  let detail: React.ReactNode = null;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  if (status === 'loading' && !rev) {
    top = (<><p className={H}>Loading your review…</p><p className={`mt-0.5 ${P}`}>Just a moment.</p></>);
  } else if (status === 'preparing' && !rev) {
    top = (
      <>
        <p className={H}>Reviewing your game…</p>
        <p className={`mt-0.5 ${P}`}>{progress ? `Move ${progress.done} of ${progress.total}` : 'Starting the engine'}. You can look through the moves meanwhile.</p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(5, pct)}%`, background: GREEN }} /></div>
      </>
    );
  } else if (status === 'error' && !rev) {
    top = (
      <>
        <p className={H}>Couldn't review this game</p>
        <div className="mt-1 flex items-center gap-2">
          <p className={`min-w-0 flex-1 truncate ${P}`}>{errorText || 'Something went wrong.'}</p>
          {onRetryReview && <button onClick={onRetryReview} className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold text-white" style={{ background: GREEN }}>Try again</button>}
        </div>
      </>
    );
  } else if (ply === 0 && mode.kind === 'main') {
    top = (<><p className={H}>Let's review your game</p><p className={`mt-0.5 ${P}`}>Move by move. Tap Next, or swipe the board.</p></>);
  } else if (mode.kind === 'best' && rev?.betterMove) {
    top = (
      <>
        <div className="flex items-center gap-2"><Badge cls="best" /><p className={`flex-1 truncate ${H}`}>{figurine(rev.betterMove, isWhiteMove)} was best</p></div>
        <p className={`mt-1 line-clamp-2 ${P}`}>Instead of {figurine(rev.san, isWhiteMove)}. Watch the engine's line play out.</p>
      </>
    );
    detail = (
      <>
        <p className="text-[12px] font-bold uppercase tracking-wide text-[#87918E]">Engine line</p>
        {lineChips || <p className={`mt-1 ${P}`}>{figurine(rev.betterMove, isWhiteMove)}</p>}
        <p className={`mt-2 ${P}`}>{rev.explanation}</p>
      </>
    );
  } else if (mode.kind === 'reply' && rev && move) {
    top = (
      <>
        <p className={`truncate ${H}`}>{bad ? 'How this gets punished' : 'What the engine expects next'}</p>
        <p className={`mt-1 line-clamp-2 ${P}`}>The engine's main line after {figurine(move.san, isWhiteMove)}. Tap a move to stop on it.</p>
      </>
    );
    detail = (
      <>
        <p className={L}>Engine line</p>
        {chipsFor('reply', replyLine, fenAt(ply), 1)}
        <p className={`mt-2 text-[12.5px] ${P}`}>{standing(rev.evalAfterCp)}</p>
      </>
    );
  } else if (mode.kind === 'retry') {
    top = mode.state === 'right' ? (
      <>
        <div className="flex items-center gap-2"><Badge cls="best" /><p className={H}>That's it!</p></div>
        <p className={`mt-1 line-clamp-2 ${P}`}>{rev?.betterMove ? `${figurine(rev.betterMove, isWhiteMove)} is the best move here.` : 'Well found.'}</p>
      </>
    ) : (
      <><p className={H}>{mode.state === 'wrong' ? 'Not quite. Try again' : 'Find a better move'}</p><p className={`mt-0.5 ${P}`}>{isWhiteMove ? 'White' : 'Black'} to move. Drag a piece to try.</p></>
    );
    const p0 = rev?.betterMove?.[0] ?? '';
    detail = mode.state === 'right' ? (rev ? <p className={P}>{rev.explanation}</p> : null) : (
      <p className={P}><b className="text-[#F5F7F6]">Hint:</b> it's a {pieceName[p0] ?? 'pawn'} move{rev?.betterMove?.includes('x') ? ' that captures' : ''}{rev?.betterMove?.includes('+') ? ', with check' : ''}.</p>
    );
  } else if (rev && move) {
    const t = splitText(rev.explanation);
    const ev = evalLabel(rev.evalAfterCp);
    top = (
      <>
        <div className="flex items-center gap-2">
          <Badge cls={rev.classification} />
          <p className={`min-w-0 flex-1 truncate ${H}`}>{figurine(move.san, isWhiteMove)} {CLS[rev.classification].phrase}</p>
          {ev && <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[13px] font-extrabold tabular-nums text-[#F5F7F6]">{ev}</span>}
        </div>
        {expanded
          ? <p className={`mt-1 ${P}`}>{rev.explanation}</p>
          : (t.top || t.rest) && <p className={`mt-1 line-clamp-2 ${P}`}>{t.top || t.rest}{t.top && t.rest && <span className="ml-1 font-bold text-[#81B64C]">More</span>}</p>}
      </>
    );
    // AI-coached reviews (Pro): the coach's full explanation and its pros and
    // cons go in a card under the board, as before. Free reviews have neither.
    const aiCoached = !!(rev.pros?.length || rev.cons?.length);
    if (aiCoached) {
      detail = (
        <>
          <p className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-[#87918E]">AI coach</p>
          {t.rest && <p className={P}>{t.rest}</p>}
          {!!rev.pros?.length && (
            <ul className={`${t.rest ? 'mt-2' : ''} space-y-0.5`}>{rev.pros.map((x, i) => <li key={i} className={`flex gap-1.5 ${P}`}><span className="text-[#81B64C]">+</span>{x}</li>)}</ul>
          )}
          {!!rev.cons?.length && (
            <ul className="mt-1.5 space-y-0.5">{rev.cons.map((x, i) => <li key={i} className={`flex gap-1.5 ${P}`}><span className="text-[#F0605D]">−</span>{x}</li>)}</ul>
          )}
        </>
      );
    }
  } else if (move) {
    top = <p className={H}>{figurine(move.san, isWhiteMove)}</p>;
  }
  const accent = mode.kind === 'reply' ? '#4299E1' : mode.kind === 'best' || (mode.kind === 'retry' && mode.state === 'right') ? CLS.best.color : rev && mode.kind === 'main' ? CLS[rev.classification].color : GREEN;
  const animKey = `${ply}-${mode.kind}-${mode.kind === 'retry' ? mode.state : ''}`;

  const atEnd = ply >= max && mode.kind === 'main';
  const canExpand = mode.kind === 'main' && !!rev && ply > 0 && !!splitText(rev.explanation).rest;

  // ── Move strip ─────────────────────────────────────────────────────────
  const stripRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = activeRef.current, box = stripRef.current;
    if (!el || !box) return;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [ply]);

  const startFenTurnWhite = new Chess(normalizeFen(startFen)).turn() === 'w';
  const startNo = parseInt(startFen.split(' ')[5] || '1', 10) || 1;

  // ── Buttons ─────────────────────────────────────────────────────────────
  const canBest = bad && bestLine.length > 0;
  const canRetry = bad && !!rev?.betterMove;
  const next = () => {
    if (mode.kind !== 'main') { setMode({ kind: 'main' }); return; }
    go(ply + 1);
  };

  const tool = (label: string, icon: React.ReactNode, on: boolean, enabled: boolean, onClick: () => void) => (
    <button onClick={onClick} disabled={!enabled}
      className="flex w-[64px] flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11.5px] font-bold transition-colors disabled:opacity-30"
      style={{ color: on ? GREEN : '#C9CFCD', background: on ? 'rgba(129,182,76,.12)' : 'transparent' }}>
      {icon}{label}
    </button>
  );

  const resultLine = (() => {
    if (result === '1-0') return `${whiteName} won`;
    if (result === '0-1') return `${blackName} won`;
    if (result === '1/2-1/2') return 'Draw';
    return null;
  })();

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: BG }}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button onClick={onBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-xl text-white active:scale-95"><ArrowLeft size={22} /></button>
        <p className="flex-1 text-center text-[18px] font-black text-white">Game Review</p>
        <button onClick={onFlip} aria-label="Flip board" className="grid h-10 w-10 place-items-center rounded-xl text-[#C9CFCD] active:scale-95"><FlipVertical2 size={20} /></button>
        <button onClick={openFull} aria-label="Full analysis (Pro)" title="Full analysis (Pro)" className="relative grid h-10 w-10 place-items-center rounded-xl text-[#C9CFCD] active:scale-95">
          <ListTree size={20} />
          {!canFullAnalysis && <span className="absolute -right-0.5 top-0.5 rounded px-0.5 text-[8px] font-black" style={{ background: '#E8B447', color: '#1C1C1C' }}>PRO</span>}
        </button>
      </div>

      {/* Phones: one column. Wide desktop (lg): board on the left, the coach, summary, moves and buttons on the right. */}
      <div className="mx-auto flex w-full max-w-[560px] min-h-0 flex-1 flex-col lg:grid lg:max-w-[1180px] lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_minmax(0,1fr)_auto_auto] lg:gap-x-6 lg:px-6 lg:pb-4">
        {/* Top card: fixed height so the board never shifts */}
        <div className="relative z-20 h-[92px] shrink-0 px-3 pb-2 pt-1 lg:col-start-2 lg:row-start-1 lg:px-0">
          {/* Tap to read the whole explanation; it opens over the board, so nothing moves. */}
          <div onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
            className={`absolute inset-x-3 top-1 overflow-hidden rounded-[14px] px-3.5 py-2.5 ${expanded ? 'min-h-[84px] shadow-2xl' : 'h-[84px]'} ${canExpand ? 'cursor-pointer' : ''}`}
            style={{ background: '#162022', border: '1px solid rgba(255,255,255,.07)', borderLeft: `4px solid ${accent}` }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={animKey} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
                {top}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        {/* Board with eval bar */}
        {/* Desktop: board, eval bar and material keep one width that fits the window height. */}
        <div className="cs-review-board shrink-0 px-1.5 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:self-start lg:pt-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="min-w-0">
            <ChessBoard
              key={mode.kind === 'retry' ? `retry-${retryKey}` : 'review'}
              fen={boardFen}
              flipped={flipped}
              lastMove={lastMove}
              moveQuality={quality}
              arrows={arrows}
              maxWidthOverride="100%"
              animationMs={260}
              suppressConfirmMoves
              practiceMode={mode.kind === 'retry' && mode.state !== 'right'}
              expectedMoveSan={mode.kind === 'retry' ? rev?.betterMove ?? null : null}
              onMovePlayed={(_san, ok) => {
                if (mode.kind !== 'retry') return;
                if (ok) setMode({ kind: 'retry', state: 'right' });
                else { setMode({ kind: 'retry', state: 'wrong' }); setTimeout(() => setRetryKey((k) => k + 1), 900); }
              }}
            />
          </div>
          {/* Evaluation bar, then the material each side has won */}
          <div className="mt-1.5 px-0.5"><EvalBarH cp={cpNow} /></div>
          <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[11.5px] text-[#C9CFCD]">
            <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-bold">{whiteName}</span><MaterialStrip fen={boardFen} color="w" /></span>
            <span className="flex min-w-0 items-center justify-end gap-1.5"><MaterialStrip fen={boardFen} color="b" /><span className="truncate font-bold">{blackName}</span></span>
          </div>
        </div>

        {/* Between the board and the move strip: the start and end summaries (scrolls if tall). */}
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pb-1 lg:col-start-2 lg:row-start-2 lg:[&>div]:mx-0">
        {/* More from the coach about this move */}
        {detail && (
          <div className="px-3 pt-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={animKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
                className="rounded-[14px] px-3.5 py-3" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.07)' }}>
                {detail}
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* The whole game at a glance, the same on every move */}
        {ply > 0 && mode.kind === 'main' && reviewMoves.length > 0 && (() => {
          const keys = (['brilliant', 'great', 'best', 'inaccuracy', 'mistake', 'missed_win', 'blunder'] as Classification[])
            .filter((k) => counts.white[k] || counts.black[k] || k === 'best' || k === 'mistake' || k === 'blunder');
          const row = (name: string, acc: number | null, side: 'white' | 'black') => (
            <div className="flex items-center gap-2">
              <span className="w-[72px] truncate text-[12.5px] font-bold text-white">{name}</span>
              <span className="w-[34px] text-[17px] font-black tabular-nums text-white">{acc != null ? Math.round(acc) : '–'}</span>
              <div className="flex flex-1 items-center justify-end gap-2.5">
                {keys.map((k) => (
                  <span key={k} className="flex w-[30px] items-center justify-end gap-1 text-[12.5px] font-bold tabular-nums" style={{ color: counts[side][k] ? (CLS[k].textColor ?? '#E7ECEA') : '#55605D' }}>
                    {counts[side][k]}<Badge cls={k} size={14} />
                  </span>
                ))}
              </div>
            </div>
          );
          return (
            <div className="mx-3 mt-2 rounded-[14px] px-3 py-2.5" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.07)' }}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#87918E]">Game rating · accuracy</p>
              <div className="space-y-1.5">
                {row(whiteName, accuracy?.white ?? null, 'white')}
                {row(blackName, accuracy?.black ?? null, 'black')}
              </div>
            </div>
          );
        })()}

        {/* End of game summary */}
        {atEnd && (
          <div className="mx-3 mt-2 rounded-[16px] p-3" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.08)' }}>
            <p className="text-[15px] font-extrabold text-white">{resultLine ?? 'Game over'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setPly(0)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>Start over</button>
              <button onClick={() => { const i = reviewMoves.filter((m) => BAD.has(m.classification)).sort((a, b) => a.moveIndex - b.moveIndex)[0]; if (i) setPly(i.moveIndex + 1); }}
                className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>First mistake</button>

            </div>
          </div>
        )}

        {/* Opening summary: who played how (start of the review) */}
        {ply === 0 && mode.kind === 'main' && reviewMoves.length > 0 && (
          <div className="mx-3 mt-2 overflow-hidden rounded-[16px]" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.08)' }}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 text-[12.5px] font-bold text-white">
              <span className="truncate">{whiteName}</span><span className="text-[#87918E]">Accuracy</span><span className="truncate text-right">{blackName}</span>
              {accuracy && <>
                <span className="text-[20px] font-black">{Math.round(accuracy.white)}</span><span />
                <span className="text-right text-[20px] font-black">{Math.round(accuracy.black)}</span>
              </>}
            </div>
            <div className="grid grid-cols-[2rem_1fr_2rem] gap-y-1 border-t border-white/5 px-3 py-2 text-[12.5px]">
              {counts.keys.filter((k) => counts.white[k] || counts.black[k]).map((k) => (
                <React.Fragment key={k}>
                  <span className="text-center font-bold" style={{ color: CLS[k].textColor ?? '#E7ECEA' }}>{counts.white[k]}</span>
                  <span className="flex items-center justify-center gap-1.5 capitalize text-[#C9CFCD]"><Badge cls={k} size={16} />{k === 'missed_win' ? 'Miss' : k}</span>
                  <span className="text-center font-bold" style={{ color: CLS[k].textColor ?? '#E7ECEA' }}>{counts.black[k]}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        </div>

        {/* Move strip */}
        <div className="flex shrink-0 items-center gap-1 px-1 py-2 lg:col-start-2 lg:row-start-3 lg:min-w-0">
          <button onClick={() => go(ply - 1)} disabled={ply <= 0} aria-label="Previous move" className="grid h-10 w-9 shrink-0 place-items-center text-[#C9CFCD] disabled:opacity-25"><ChevronLeft size={26} /></button>
          <div ref={stripRef} className="hide-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scroll-smooth">
            {moves.map((m, i) => {
              const r = byIndex.get(i);
              const white = (i % 2 === 0) === startFenTurnWhite;
              const no = startNo + Math.floor((i + (startFenTurnWhite ? 0 : 1)) / 2);
              const active = ply === i + 1;
              const c = r ? CLS[r.classification] : null;
              return (
                <React.Fragment key={i}>
                  {(white || i === 0) && <span className="shrink-0 pl-1.5 text-[15px] text-[#87918E]">{no}.{!white ? '..' : ''}</span>}
                  <button ref={active ? activeRef : undefined} onClick={() => go(i + 1)}
                    className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[16px] font-bold"
                    style={{ color: c?.textColor ?? '#E7ECEA', background: active ? 'rgba(255,255,255,.10)' : 'transparent', boxShadow: active ? `inset 0 -2px 0 ${GREEN}` : 'none' }}>
                    {r && c?.strip && r.classification !== 'good' && <Badge cls={r.classification} size={18} />}
                    {figurine(m.san, white)}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
          <button onClick={() => go(ply + 1)} disabled={ply >= max} aria-label="Next move" className="grid h-10 w-9 shrink-0 place-items-center text-[#C9CFCD] disabled:opacity-25"><ChevronRight size={26} /></button>
        </div>

        {/* Bottom bar */}
        <div className="flex shrink-0 items-center gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 lg:col-start-2 lg:row-start-4 lg:px-0">
          {tool('Best', <Star size={21} />, mode.kind === 'best', canBest, () => { if (mode.kind === 'best') setMode({ kind: 'main' }); else { setAutoPlay(true); soundFor(bestLine[0].san); setMode({ kind: 'best', step: 0 }); } })}
          {tool('Retry', <RotateCcw size={21} />, mode.kind === 'retry', canRetry, () => setMode(mode.kind === 'retry' ? { kind: 'main' } : { kind: 'retry', state: 'trying' }))}
          <button onClick={atEnd ? openFull : next}
            className="ml-auto flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-[14px] text-[18px] font-black text-white transition-transform active:scale-[0.98]"
            style={{ background: `linear-gradient(180deg, #8FC25A, ${GREEN})`, boxShadow: '0 4px 0 #5F8F36' }}>
            {mode.kind !== 'main' ? <><X size={18} /> Back to game</> : ply === 0 ? (status === 'ready' ? 'Start review' : 'Next') : atEnd ? <>Full analysis<ProTag /></> : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
