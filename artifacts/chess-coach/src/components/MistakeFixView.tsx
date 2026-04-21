import React, { useMemo } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from './ChessBoard';
import { normalizeFen } from '@/lib/utils';
import { ArrowDown, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
    let stripped = c
      .replace(/^\d+\.+/, '')                  // strip "23." or "23..."
      .replace(/[+#!?]+$/g, '')                // strip +, #, !, ? suffixes
      .replace(/^["'`(\[]+|["'`)\]]+$/g, '');  // strip surrounding quotes/brackets
    if (!stripped) continue;
    const tried = tryMove(prevFen, stripped);
    if (tried) return tried;
  }
  return null;
}

const CLASS_STYLES: Record<Classification, { bg: string; border: string; text: string; label: string }> = {
  checkmate:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/40',  text: 'text-amber-300',  label: 'Checkmate' },
  brilliant:  { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/40',   text: 'text-cyan-300',   label: 'Brilliant' },
  great:      { bg: 'bg-sky-500/10',    border: 'border-sky-500/40',    text: 'text-sky-300',    label: 'Great' },
  best:       { bg: 'bg-emerald-500/10',border: 'border-emerald-500/40',text: 'text-emerald-300',label: 'Best' },
  excellent:  { bg: 'bg-teal-500/10',   border: 'border-teal-500/40',   text: 'text-teal-300',   label: 'Excellent' },
  good:       { bg: 'bg-green-500/10',  border: 'border-green-500/40',  text: 'text-green-300',  label: 'Good' },
  book:       { bg: 'bg-blue-500/10',   border: 'border-blue-500/40',   text: 'text-blue-300',   label: 'Book' },
  inaccuracy: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', text: 'text-yellow-300', label: 'Inaccuracy' },
  mistake:    { bg: 'bg-orange-500/10', border: 'border-orange-500/40', text: 'text-orange-300', label: 'Mistake' },
  blunder:    { bg: 'bg-rose-500/10',   border: 'border-rose-500/40',   text: 'text-rose-300',   label: 'Blunder' },
  missed_win: { bg: 'bg-red-500/10',    border: 'border-red-500/40',    text: 'text-red-300',    label: 'Missed Win' },
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

  const cls = CLASS_STYLES[classification];

  return (
    <div className="space-y-3">
      {/* MISTAKE BOARD (top) */}
      <div className={`rounded-xl border-2 ${cls.border} ${cls.bg} overflow-hidden`}>
        <div className={`flex items-center justify-between px-3 py-2 border-b ${cls.border}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-4 h-4 ${cls.text}`} />
            <span className={`text-[11px] font-black uppercase tracking-wider ${cls.text}`}>
              What you played · {cls.label}
            </span>
          </div>
          {playedMove && (
            <span className={`font-mono text-sm font-black ${cls.text}`}>{playedMove.san}</span>
          )}
        </div>
        <div className="p-2">
          <ChessBoard
            fen={playedAfterFen}
            flipped={flipped}
            lastMove={playedMove ? { from: playedMove.from, to: playedMove.to } : null}
            moveQuality={classification}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center justify-center gap-2 py-1">
        <div className="h-px flex-1 bg-white/10" />
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
          <ArrowDown className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">vs Best</span>
        </div>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      {/* FIX BOARD (bottom) */}
      <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-500/40">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
              Best move
            </span>
          </div>
          {better ? (
            <span className="font-mono text-sm font-black text-emerald-300">{better.san}</span>
          ) : betterMoveText ? (
            <span className="font-mono text-sm font-black text-emerald-300/80 truncate max-w-[160px]">{betterMoveText}</span>
          ) : (
            <span className="text-[10px] text-emerald-300/50 italic">unavailable</span>
          )}
        </div>
        <div className="p-2">
          {better ? (
            <ChessBoard
              fen={better.resultFen}
              flipped={flipped}
              lastMove={{ from: better.from, to: better.to }}
              moveQuality="best"
            />
          ) : (
            <div className="aspect-square w-full rounded-xl bg-black/20 flex flex-col items-center justify-center gap-2 text-center px-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400/40" />
              <p className="text-xs text-emerald-300/60 leading-snug">
                {betterMoveText
                  ? `Coach suggests: ${betterMoveText}`
                  : 'No alternative move was suggested.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
