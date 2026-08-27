import React, { useMemo } from 'react';
import { Chess } from 'chess.js';
import { motion, AnimatePresence } from 'framer-motion';
import { ChessBoard } from './ChessBoard';
import { MaterialStrip, EvalBar } from './GameStatusStrip';
import { normalizeFen, cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

type Classification =
  | 'checkmate' | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book'
  | 'inaccuracy' | 'mistake' | 'blunder' | 'missed_win';

interface MistakeFixViewProps {
  prevFen: string;
  playedMove: { san: string; from: string; to: string } | null;
  betterMoveText: string | null;
  /** Engine principal variation (SAN) starting from prevFen. First element is the recommended move. */
  bestLineSan?: string[];
  classification: Classification;
  flipped: boolean;
  onJumpIn?: () => void;
  /** Controlled slide state (0 = played, 1 = engine) -- lifted to the
      parent so the app's existing move-navigation buttons can drive
      stepping through the engine's continuation while this tab is
      active, instead of a separate bespoke stepper widget living here. */
  slide: 0 | 1;
  onSlideChange: (slide: 0 | 1) => void;
  /** Controlled step index into bestLineSan, also lifted to the parent
      for the same reason. */
  engineStep: number;
}

/** Render a SAN sequence with proper move numbers, e.g. "12. Nxe5 Nxe5 13. d4 Bb4+".
 *  prevFen tells us whose turn it is and what the move number is at the start of the line. */
function tryMove(fen: string, san: string): { from: string; to: string; resultFen: string; san: string } | null {
  try {
    const chess = new Chess(normalizeFen(fen));
    const m = chess.move(san, { strict: false } as never);
    if (!m) return null;
    return { from: m.from, to: m.to, resultFen: chess.fen(), san: m.san };
  } catch {
    return null;
  }
}

function parseBetterMove(text: string, prevFen: string): { from: string; to: string; resultFen: string; san: string } | null {
  if (!text) return null;
  const cleaned = text.replace(/[—–-].*$/s, '').trim();
  const candidates = [
    cleaned,
    ...cleaned.split(/[\s,;:]+/).filter(Boolean),
    ...text.split(/[\s,;:]+/).filter(Boolean),
  ];
  for (const c of candidates) {
    const stripped = c
      .replace(/^\d+\.+/, '')
      .replace(/[+#!?]+$/g, '')
      .replace(/^["'`(\[]+|["'`)\]]+$/g, '');
    if (!stripped) continue;
    const tried = tryMove(prevFen, stripped);
    if (tried) return tried;
  }
  return null;
}

const CLASS_LABEL: Record<Classification, string> = {
  checkmate: 'Checkmate', brilliant: 'Brilliant', great: 'Great', best: 'Best',
  excellent: 'Excellent', good: 'Good', book: 'Book', inaccuracy: 'Inaccuracy',
  mistake: 'Mistake', blunder: 'Blunder', missed_win: 'Missed Win',
};

const CLASS_TONE: Record<Classification, { label: string; ring: string; chipBg: string; chipText: string; chipBorder: string }> = {
  checkmate:   { label: 'CHECKMATE',  ring: 'ring-yellow-400/40',  chipBg: 'bg-yellow-400/30',  chipText: 'text-yellow-200',  chipBorder: 'border-yellow-400/60' },
  brilliant:   { label: 'BRILLIANT',  ring: 'ring-cyan-400/40',    chipBg: 'bg-cyan-400/30',    chipText: 'text-cyan-100',    chipBorder: 'border-cyan-400/60' },
  great:       { label: 'GREAT',      ring: 'ring-sky-400/40',     chipBg: 'bg-sky-400/30',     chipText: 'text-sky-100',     chipBorder: 'border-sky-400/60' },
  best:        { label: 'BEST',       ring: 'ring-emerald-400/40', chipBg: 'bg-emerald-400/30', chipText: 'text-emerald-100', chipBorder: 'border-emerald-400/60' },
  excellent:   { label: 'EXCELLENT',  ring: 'ring-teal-400/40',    chipBg: 'bg-teal-400/30',    chipText: 'text-teal-100',    chipBorder: 'border-teal-400/60' },
  good:        { label: 'GOOD',       ring: 'ring-green-400/30',   chipBg: 'bg-green-400/30',   chipText: 'text-green-100',   chipBorder: 'border-green-400/60' },
  book:        { label: 'BOOK',       ring: 'ring-blue-400/30',    chipBg: 'bg-blue-400/30',    chipText: 'text-blue-100',    chipBorder: 'border-blue-400/60' },
  inaccuracy:  { label: 'INACCURACY', ring: 'ring-yellow-400/50',  chipBg: 'bg-yellow-400/30',  chipText: 'text-yellow-200',  chipBorder: 'border-yellow-400/60' },
  mistake:     { label: 'MISTAKE',    ring: 'ring-orange-400/50',  chipBg: 'bg-orange-400/30',  chipText: 'text-orange-100',  chipBorder: 'border-orange-400/60' },
  blunder:     { label: 'BLUNDER',    ring: 'ring-rose-500/60',    chipBg: 'bg-rose-500/30',    chipText: 'text-rose-100',    chipBorder: 'border-rose-500/60' },
  missed_win:  { label: 'MISSED WIN', ring: 'ring-red-500/50',     chipBg: 'bg-red-500/30',     chipText: 'text-red-100',     chipBorder: 'border-red-500/60' },
};

export function MistakeFixView({
  prevFen,
  playedMove,
  betterMoveText,
  bestLineSan = [],
  classification,
  flipped,
  slide,
  onSlideChange,
  engineStep,
}: MistakeFixViewProps) {
  const better = useMemo(
    () => betterMoveText ? parseBetterMove(betterMoveText, prevFen) : null,
    [betterMoveText, prevFen]
  );

  const playedAfterFen = useMemo(() => {
    if (!playedMove) return prevFen;
    try {
      const chess = new Chess(normalizeFen(prevFen));
      chess.move(playedMove.san, { strict: false } as never);
      return chess.fen();
    } catch {
      return prevFen;
    }
  }, [prevFen, playedMove]);

  const classLabel = CLASS_LABEL[classification];
  const tone = CLASS_TONE[classification];

  // Computes the FEN after replaying prevFen + bestLineSan[0..step]
  // (inclusive). Falls back gracefully to whatever's already valid if a
  // move in the line can't be replayed for any reason.
  const stepFen = useMemo(() => {
    if (!better || bestLineSan.length === 0) return better?.resultFen ?? prevFen;
    try {
      const chess = new Chess(normalizeFen(prevFen));
      for (let i = 0; i <= Math.min(engineStep, bestLineSan.length - 1); i++) {
        chess.move(bestLineSan[i], { strict: false } as never);
      }
      return chess.fen();
    } catch {
      return better.resultFen;
    }
  }, [prevFen, bestLineSan, engineStep, better]);

  const stepLastMove = useMemo(() => {
    if (!better || bestLineSan.length === 0) return better ? { from: better.from, to: better.to } : null;
    try {
      const chess = new Chess(normalizeFen(prevFen));
      let last: { from: string; to: string } | null = null;
      const clampedStep = Math.min(engineStep, bestLineSan.length - 1);
      for (let i = 0; i <= clampedStep; i++) {
        const result = chess.move(bestLineSan[i], { strict: false } as never);
        if (result) last = { from: result.from, to: result.to };
      }
      return last;
    } catch {
      return better ? { from: better.from, to: better.to } : null;
    }
  }, [prevFen, bestLineSan, engineStep, better]);

  const slides = [
    {
      key: 'played' as const,
      title: 'What you played',
      icon: AlertTriangle,
      iconClass: tone.chipText,
      ring: tone.ring,
      chipBg: tone.chipBg,
      chipText: tone.chipText,
      chipBorder: tone.chipBorder,
      moveSan: playedMove?.san ?? null,
      fen: playedAfterFen,
      lastMove: playedMove ? { from: playedMove.from, to: playedMove.to } : null,
      quality: classification,
      caption: `Position after your ${classLabel.toLowerCase()}`,
      empty: false,
    },
    {
      key: 'engine' as const,
      title: 'Engine recommends',
      icon: CheckCircle2,
      iconClass: 'text-emerald-400',
      ring: 'ring-emerald-400/40',
      chipBg: 'bg-emerald-400/15',
      chipText: 'text-emerald-300',
      chipBorder: 'border-emerald-400/40',
      moveSan: bestLineSan.length > 0 ? bestLineSan[Math.min(engineStep, bestLineSan.length - 1)] : (better?.san ?? null),
      fen: stepFen,
      lastMove: stepLastMove,
      quality: 'best' as const,
      caption: better
        ? (bestLineSan.length > 1 ? `Move ${Math.min(engineStep, bestLineSan.length - 1) + 1} of ${bestLineSan.length} in the engine's line` : "Position after engine's move")
        : 'No alternative available',
      empty: !better,
    },
  ];
  const current = slides[slide];
  const Icon = current.icon;
  const goPrev = () => onSlideChange(0);
  const goNext = () => onSlideChange(1);

  return (
    <div className="space-y-1.5 md:space-y-2 max-w-[520px] mx-auto">
      {/* Tab toggle */}
      <div role="tablist" aria-label="Compare your move with the engine" className="flex items-stretch gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
        {slides.map((s, idx) => {
          const active = idx === slide;
          const SIcon = s.icon;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={active}
              onClick={() => onSlideChange(idx as 0 | 1)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-[0.12em] transition-colors ${
                active
                  ? `${s.chipBg} ${s.chipText} border ${s.chipBorder}`
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent'
              }`}
            >
              <SIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">{idx === 0 ? classLabel : 'Engine line'}</span>
              {s.moveSan && (
                <span className={`hidden sm:inline-block font-mono normal-case tracking-normal text-[10px] font-bold ml-1 ${active ? s.chipText : 'text-white/40'}`}>
                  {s.moveSan}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Single board, sliding between the two views */}
      <div className="relative">
        {/* Prev arrow */}
        <button
          type="button"
          onClick={goPrev}
          disabled={slide === 0}
          aria-label="Show what you played"
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/60 border border-white/10 backdrop-blur flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {/* Next arrow */}
        <button
          type="button"
          onClick={goNext}
          disabled={slide === 1}
          aria-label="Show engine's recommended move"
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/60 border border-white/10 backdrop-blur flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Slide header */}
        <div className="hidden md:flex items-center justify-between gap-2 px-1 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon className={`w-3.5 h-3.5 shrink-0 ${current.iconClass}`} />
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/70 truncate">
              {current.title}
            </span>
          </div>
          {current.moveSan && (
            <span className={`shrink-0 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${current.chipBg} ${current.chipText} ${current.chipBorder}`}>
              {current.moveSan}
            </span>
          )}
        </div>

        {!current.empty && (
          <MaterialStrip fen={current.fen} color={flipped ? 'w' : 'b'} className="px-1" />
        )}

        <div className="relative overflow-hidden rounded-xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.key}
              initial={{ opacity: 0, x: slide === 1 ? 24 : -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: slide === 1 ? -24 : 24 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {current.empty ? (
                <div className="aspect-square w-full rounded-xl bg-white/5 border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-center px-4">
                  <CheckCircle2 className="w-7 h-7 text-white/20" />
                  <p className="text-[11px] text-white/50 leading-snug">
                    {betterMoveText
                      ? <>Coach suggests:<br/><span className="font-mono text-white/70">{betterMoveText}</span></>
                      : 'No alternative move was suggested.'}
                  </p>
                </div>
              ) : (
                <div className={`rounded-xl ring-1 ${current.ring} overflow-hidden`}>
                  <ChessBoard
                    fen={current.fen}
                    flipped={flipped}
                    lastMove={current.lastMove}
                    moveQuality={current.quality}
                    arrows={(current.key === 'engine' && current.lastMove) ? [{
                      from: current.lastMove.from,
                      to: current.lastMove.to,
                      color: 'rgba(52,211,153,0.9)',
                    }] : undefined}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Caption — hidden on mobile to save vertical space; the tab toggle already labels the view */}
        <p className="hidden md:block text-[10px] text-white/40 text-center px-2 leading-snug mt-1.5">
          {current.caption}
        </p>

        {!current.empty && (
          <>
            <MaterialStrip fen={current.fen} color={flipped ? 'b' : 'w'} className="px-1" />
            <EvalBar fen={current.fen} />
          </>
        )}
      </div>
    </div>
  );
}
