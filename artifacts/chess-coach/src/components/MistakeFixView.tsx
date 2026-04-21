import React, { useMemo, useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { motion, AnimatePresence } from 'framer-motion';
import { ChessBoard } from './ChessBoard';
import { normalizeFen } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

type Classification =
  | 'checkmate' | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book'
  | 'inaccuracy' | 'mistake' | 'blunder' | 'missed_win';

interface MistakeFixViewProps {
  prevFen: string;
  playedMove: { san: string; from: string; to: string } | null;
  betterMoveText: string | null;
  classification: Classification;
  flipped: boolean;
  onJumpIn?: () => void;
}

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
  checkmate:   { label: 'CHECKMATE',  ring: 'ring-yellow-400/40',  chipBg: 'bg-yellow-400/15', chipText: 'text-yellow-300',  chipBorder: 'border-yellow-400/40' },
  brilliant:   { label: 'BRILLIANT',  ring: 'ring-cyan-400/40',    chipBg: 'bg-cyan-400/15',   chipText: 'text-cyan-300',    chipBorder: 'border-cyan-400/40' },
  great:       { label: 'GREAT',      ring: 'ring-sky-400/40',     chipBg: 'bg-sky-400/15',    chipText: 'text-sky-300',     chipBorder: 'border-sky-400/40' },
  best:        { label: 'BEST',       ring: 'ring-emerald-400/40', chipBg: 'bg-emerald-400/15',chipText: 'text-emerald-300', chipBorder: 'border-emerald-400/40' },
  excellent:   { label: 'EXCELLENT',  ring: 'ring-teal-400/40',    chipBg: 'bg-teal-400/15',   chipText: 'text-teal-300',    chipBorder: 'border-teal-400/40' },
  good:        { label: 'GOOD',       ring: 'ring-green-400/30',   chipBg: 'bg-green-400/15',  chipText: 'text-green-300',   chipBorder: 'border-green-400/30' },
  book:        { label: 'BOOK',       ring: 'ring-blue-400/30',    chipBg: 'bg-blue-400/15',   chipText: 'text-blue-300',    chipBorder: 'border-blue-400/30' },
  inaccuracy:  { label: 'INACCURACY', ring: 'ring-yellow-400/50',  chipBg: 'bg-yellow-400/15', chipText: 'text-yellow-300',  chipBorder: 'border-yellow-400/40' },
  mistake:     { label: 'MISTAKE',    ring: 'ring-orange-400/50',  chipBg: 'bg-orange-400/15', chipText: 'text-orange-300',  chipBorder: 'border-orange-400/40' },
  blunder:     { label: 'BLUNDER',    ring: 'ring-rose-500/60',    chipBg: 'bg-rose-500/15',   chipText: 'text-rose-300',    chipBorder: 'border-rose-500/40' },
  missed_win:  { label: 'MISSED WIN', ring: 'ring-red-500/50',     chipBg: 'bg-red-500/15',    chipText: 'text-red-300',     chipBorder: 'border-red-500/40' },
};

export function MistakeFixView({
  prevFen,
  playedMove,
  betterMoveText,
  classification,
  flipped,
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

  // Slide state: 0 = "what you played", 1 = "engine recommends".
  // Default to the played side so the user sees their mistake first.
  const [slide, setSlide] = useState<0 | 1>(0);

  // Reset to "what you played" whenever the underlying move changes
  useEffect(() => {
    setSlide(0);
  }, [prevFen, playedMove?.san, betterMoveText]);

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
      moveSan: better?.san ?? null,
      fen: better?.resultFen ?? prevFen,
      lastMove: better ? { from: better.from, to: better.to } : null,
      quality: 'best' as const,
      caption: better ? "Position after engine's move" : 'No alternative available',
      empty: !better,
    },
  ];
  const current = slides[slide];
  const Icon = current.icon;
  const goPrev = () => setSlide(0);
  const goNext = () => setSlide(1);

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
              onClick={() => setSlide(idx as 0 | 1)}
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
      </div>
    </div>
  );
}
