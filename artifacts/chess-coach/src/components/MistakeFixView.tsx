import React, { useMemo } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from './ChessBoard';
import { normalizeFen } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';

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

  return (
    <div className="space-y-3">
      {/* Compare header */}
      <div className="flex items-center justify-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-[0.14em] border ${tone.chipBg} ${tone.chipText} ${tone.chipBorder}`}>
          <AlertTriangle className="w-3 h-3" />
          {classLabel}
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-white/30" />
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-[0.14em] border bg-emerald-400/15 text-emerald-300 border-emerald-400/40">
          <CheckCircle2 className="w-3 h-3" />
          ENGINE LINE
        </span>
      </div>

      {/* Dual board grid: stacked on narrow, side-by-side on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[820px] mx-auto">
        {/* WHAT YOU PLAYED */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${tone.chipText}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/70 truncate">
                What you played
              </span>
            </div>
            {playedMove && (
              <span className={`shrink-0 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${tone.chipBg} ${tone.chipText} ${tone.chipBorder}`}>
                {playedMove.san}
              </span>
            )}
          </div>
          <div className={`rounded-xl ring-1 ${tone.ring} overflow-hidden`}>
            <ChessBoard
              fen={playedAfterFen}
              flipped={flipped}
              lastMove={playedMove ? { from: playedMove.from, to: playedMove.to } : null}
              moveQuality={classification}
            />
          </div>
        </div>

        {/* ENGINE LINE */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/70 truncate">
                Engine recommends
              </span>
            </div>
            {better && (
              <span className="shrink-0 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border bg-emerald-400/15 text-emerald-300 border-emerald-400/40">
                {better.san}
              </span>
            )}
          </div>
          {better ? (
            <div className="rounded-xl ring-1 ring-emerald-400/40 overflow-hidden">
              <ChessBoard
                fen={better.resultFen}
                flipped={flipped}
                lastMove={{ from: better.from, to: better.to }}
                moveQuality="best"
              />
            </div>
          ) : (
            <div className="aspect-square w-full rounded-xl bg-white/5 border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-center px-4">
              <CheckCircle2 className="w-7 h-7 text-white/20" />
              <p className="text-[11px] text-white/50 leading-snug">
                {betterMoveText
                  ? <>Coach suggests:<br/><span className="font-mono text-white/70">{betterMoveText}</span></>
                  : 'No alternative move was suggested.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Compact captions row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <p className="text-[10px] text-white/40 text-center px-2 leading-snug">
          Position after your {classLabel.toLowerCase()}
        </p>
        <p className="text-[10px] text-white/40 text-center px-2 leading-snug">
          {better ? "Position after engine's move" : 'No alternative available'}
        </p>
      </div>
    </div>
  );
}
