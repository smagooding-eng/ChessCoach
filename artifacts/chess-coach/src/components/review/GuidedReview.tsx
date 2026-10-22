import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Chess } from 'chess.js';
import { ArrowLeft, ChevronLeft, ChevronRight, FlipVertical2, ListTree, Star, RotateCcw, Route, X } from 'lucide-react';
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
/** First sentence or two, so the bubble stays short; the rest on tap. */
function shortText(t: string): { short: string; more: boolean } {
  const clean = (t || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 170) return { short: clean, more: false };
  const parts = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = '';
  for (const p of parts) { if ((out + p).length > 170 && out) break; out += p; }
  return { short: out.trim() || clean.slice(0, 167) + '…', more: true };
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

function EvalBarV({ cp, flipped }: { cp: number | null; flipped: boolean }) {
  const white = cp == null ? 50 : Math.abs(cp) >= 9000 ? (cp > 0 ? 100 : 0) : Math.max(4, Math.min(96, 50 + 50 * (2 / (1 + Math.exp(-cp / 400)) - 1)));
  return (
    <div className="relative w-[10px] shrink-0 overflow-hidden rounded-[3px] sm:w-3" style={{ background: '#3A3A38' }} aria-label="Evaluation">
      <div className="absolute inset-x-0 transition-[height] duration-500 ease-out" style={{ background: '#F2F2EE', height: `${white}%`, ...(flipped ? { top: 0 } : { bottom: 0 }) }} />
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
}

type Mode = { kind: 'main' } | { kind: 'best' } | { kind: 'line'; step: number } | { kind: 'retry'; state: 'trying' | 'right' | 'wrong' };

export function GuidedReview({ moves, startFen, reviewMoves, ply, setPly, flipped, onFlip, whiteName, blackName, accuracy, result, onExit, onBack }: GuidedReviewProps) {
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
  } else if (mode.kind === 'best' && bestApplied) {
    boardFen = bestApplied.fen; lastMove = { from: bestApplied.from, to: bestApplied.to }; quality = 'best'; arrows = [];
  } else if (mode.kind === 'line' && line.length) {
    const step = Math.min(mode.step, line.length - 1);
    boardFen = line[step].fen; lastMove = { from: line[step].from, to: line[step].to }; quality = null; arrows = [];
  } else if (mode.kind === 'retry') {
    boardFen = fenBefore; lastMove = ply > 1 ? lastMoveOf(ply - 1) : null; quality = null; arrows = [];
  }
  const cpNow = mode.kind === 'main' ? (ply === 0 ? 20 : rev?.evalAfterCp ?? null) : rev?.evalAfterCp ?? null;

  // Show: play the engine's best line through, one move at a time.
  useEffect(() => {
    if (mode.kind !== 'line') return;
    if (mode.step >= line.length - 1) return;
    const t = setTimeout(() => { soundFor(line[mode.step + 1].san); setMode({ kind: 'line', step: mode.step + 1 }); }, 900);
    return () => clearTimeout(t);
  }, [mode, line]);

  // ── The coach's bubble ─────────────────────────────────────────────────
  const counts = useMemo(() => {
    const keys: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'missed_win', 'blunder'];
    const c = (color: 'white' | 'black') => Object.fromEntries(keys.map((k) => [k, reviewMoves.filter((m) => m.color === color && m.classification === k).length])) as Record<Classification, number>;
    return { keys, white: c('white'), black: c('black') };
  }, [reviewMoves]);

  let bubble: React.ReactNode;
  if (ply === 0 && mode.kind === 'main') {
    bubble = (
      <>
        <p className="text-[15px] font-extrabold text-[#1C1C1C]">Let's review your game</p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-[#3A3A3A]">I'll take you through it move by move. Tap Next, or swipe the board.</p>
      </>
    );
  } else if (mode.kind === 'best' && rev?.betterMove) {
    bubble = (
      <>
        <div className="flex items-center gap-2"><Badge cls="best" /><p className="flex-1 text-[15px] font-extrabold text-[#1C1C1C]">{figurine(rev.betterMove, isWhiteMove)} was best</p></div>
        <p className="mt-1 text-[13.5px] leading-snug text-[#3A3A3A]">This is what the engine wanted instead of {figurine(rev.san, isWhiteMove)}.</p>
      </>
    );
  } else if (mode.kind === 'line') {
    bubble = (
      <>
        <p className="text-[15px] font-extrabold text-[#1C1C1C]">The better line</p>
        <p className="mt-1 flex flex-wrap gap-x-1.5 text-[13.5px] leading-snug text-[#3A3A3A]">
          {line.map((m, i) => {
            const w = new Chess(normalizeFen(i === 0 ? fenBefore : line[i - 1].fen)).turn() === 'w';
            return <span key={i} className={i === mode.step ? 'rounded bg-[#E6F0DA] px-1 font-bold text-[#1C1C1C]' : ''}>{figurine(m.san, w)}</span>;
          })}
        </p>
      </>
    );
  } else if (mode.kind === 'retry') {
    bubble = mode.state === 'right' ? (
      <>
        <div className="flex items-center gap-2"><Badge cls="best" /><p className="text-[15px] font-extrabold text-[#1C1C1C]">That's it!</p></div>
        <p className="mt-1 text-[13.5px] text-[#3A3A3A]">{rev?.betterMove ? `${figurine(rev.betterMove, isWhiteMove)} is the best move here.` : 'Well found.'}</p>
      </>
    ) : (
      <>
        <p className="text-[15px] font-extrabold text-[#1C1C1C]">{mode.state === 'wrong' ? 'Not quite. Try again' : 'Find a better move'}</p>
        <p className="mt-0.5 text-[13.5px] text-[#3A3A3A]">{isWhiteMove ? 'White' : 'Black'} to move. Drag a piece to try.</p>
      </>
    );
  } else if (rev && move) {
    const t = shortText(rev.explanation);
    const ev = evalLabel(rev.evalAfterCp);
    bubble = (
      <>
        <div className="flex items-center gap-2">
          <Badge cls={rev.classification} />
          <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#1C1C1C]">{figurine(move.san, isWhiteMove)} {CLS[rev.classification].phrase}</p>
          {ev && <span className="shrink-0 rounded-md bg-[#ECECEA] px-2 py-0.5 text-[13px] font-extrabold tabular-nums text-[#1C1C1C]">{ev}</span>}
        </div>
        {t.short && (
          <p className="mt-1 text-[13.5px] leading-snug text-[#3A3A3A]">
            {expanded ? rev.explanation : t.short}
            {t.more && <button onClick={() => setExpanded((v) => !v)} className="ml-1 font-bold text-[#4B7A2B]">{expanded ? 'less' : 'more'}</button>}
          </p>
        )}
      </>
    );
  } else if (move) {
    bubble = <p className="text-[15px] font-extrabold text-[#1C1C1C]">{figurine(move.san, isWhiteMove)}</p>;
  }

  const atEnd = ply >= max && mode.kind === 'main';

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
  const canBest = bad && !!bestApplied;
  const canLine = bad && line.length > 1;
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
        <button onClick={onExit} aria-label="Full analysis" title="Full analysis" className="grid h-10 w-10 place-items-center rounded-xl text-[#C9CFCD] active:scale-95"><ListTree size={20} /></button>
      </div>

      <div className="mx-auto flex w-full max-w-[560px] min-h-0 flex-1 flex-col">
        {/* Coach + bubble */}
        <div className="flex shrink-0 items-end gap-2 px-3 pb-2 pt-1">
          <div className="h-[58px] w-[58px] shrink-0 overflow-hidden rounded-full ring-2 ring-[#81B64C]/60" style={{ background: 'radial-gradient(circle at 50% 40%, #1F3A27, #0D1A13)' }}>
            <img src={`${import.meta.env.BASE_URL}chessscout/scout-knight.webp`} alt="Coach" className="cs-keep-img h-full w-full object-cover object-[70%_20%]" />
          </div>
          <div className="relative min-h-[76px] flex-1 rounded-[16px] bg-white px-3.5 py-2.5 shadow-lg">
            <span aria-hidden className="absolute -left-[7px] bottom-4 h-0 w-0 border-y-[7px] border-r-[8px] border-y-transparent border-r-white" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${ply}-${mode.kind}-${mode.kind === 'retry' ? mode.state : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
                {bubble}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Board with eval bar */}
        <div className="flex shrink-0 items-stretch gap-1 px-1.5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <EvalBarV cp={cpNow} flipped={flipped} />
          <div className="min-w-0 flex-1">
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
        </div>

        {/* Between the board and the move strip: the start and end summaries (scrolls if tall). */}
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pb-1">
        {/* End of game summary */}
        {atEnd && (
          <div className="mx-3 mt-2 rounded-[16px] p-3" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.08)' }}>
            <p className="text-[15px] font-extrabold text-white">{resultLine ?? 'Game over'}</p>
            {accuracy && <p className="mt-0.5 text-[12.5px] text-[#C9CFCD]">Accuracy: {whiteName} {Math.round(accuracy.white)} · {blackName} {Math.round(accuracy.black)}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setPly(0)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>Start over</button>
              <button onClick={() => { const i = reviewMoves.filter((m) => BAD.has(m.classification)).sort((a, b) => a.moveIndex - b.moveIndex)[0]; if (i) setPly(i.moveIndex + 1); }}
                className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>First mistake</button>
              <button onClick={onExit} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: GREEN }}>Full analysis</button>
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
        <div className="flex shrink-0 items-center gap-1 px-1 py-2">
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
        <div className="flex shrink-0 items-center gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          {tool('Best', <Star size={21} />, mode.kind === 'best', canBest, () => setMode(mode.kind === 'best' ? { kind: 'main' } : { kind: 'best' }))}
          {tool('Retry', <RotateCcw size={21} />, mode.kind === 'retry', canRetry, () => setMode(mode.kind === 'retry' ? { kind: 'main' } : { kind: 'retry', state: 'trying' }))}
          {tool('Show', <Route size={21} />, mode.kind === 'line', canLine, () => { if (mode.kind === 'line') setMode({ kind: 'main' }); else { soundFor(line[0].san); setMode({ kind: 'line', step: 0 }); } })}
          <button onClick={atEnd ? onExit : next}
            className="ml-auto flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-[14px] text-[18px] font-black text-white transition-transform active:scale-[0.98]"
            style={{ background: `linear-gradient(180deg, #8FC25A, ${GREEN})`, boxShadow: '0 4px 0 #5F8F36' }}>
            {mode.kind !== 'main' ? <><X size={18} /> Back to game</> : ply === 0 ? 'Start review' : atEnd ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
