import React, { useMemo, useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from './ChessBoard';
import { normalizeFen } from '@/lib/utils';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

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

export function MistakeFixView({
  prevFen,
  playedMove,
  betterMoveText,
  classification,
  flipped,
}: MistakeFixViewProps) {
  const [tab, setTab] = useState<'mistake' | 'fix'>('mistake');

  // Reset to mistake tab whenever the move changes
  useEffect(() => {
    setTab('mistake');
  }, [prevFen, playedMove?.san, betterMoveText]);

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

  return (
    <div className="space-y-2">
      {/* Tab toggle */}
      <div className="inline-flex w-full rounded-lg bg-white/5 border border-white/10 p-1">
        <button
          type="button"
          onClick={() => setTab('mistake')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
            tab === 'mistake'
              ? 'bg-white/10 text-white'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Mistake</span>
          {playedMove && (
            <span className="font-mono text-[11px] opacity-70 ml-1">{playedMove.san}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('fix')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
            tab === 'fix'
              ? 'bg-white/10 text-white'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Fix</span>
          {better && (
            <span className="font-mono text-[11px] opacity-70 ml-1">{better.san}</span>
          )}
        </button>
      </div>

      {/* Board */}
      {tab === 'mistake' ? (
        <ChessBoard
          fen={playedAfterFen}
          flipped={flipped}
          lastMove={playedMove ? { from: playedMove.from, to: playedMove.to } : null}
          moveQuality={classification}
        />
      ) : better ? (
        <ChessBoard
          fen={better.resultFen}
          flipped={flipped}
          lastMove={{ from: better.from, to: better.to }}
          moveQuality="best"
        />
      ) : (
        <div className="aspect-square w-full rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 text-center px-4">
          <CheckCircle2 className="w-8 h-8 text-white/20" />
          <p className="text-xs text-white/50 leading-snug">
            {betterMoveText
              ? `Coach suggests: ${betterMoveText}`
              : 'No alternative move was suggested.'}
          </p>
        </div>
      )}

      {/* Subtle caption under board */}
      <p className="text-[11px] text-white/40 text-center px-2">
        {tab === 'mistake'
          ? `Position after your ${classLabel.toLowerCase()}`
          : better
            ? 'Position after engine\'s recommended move'
            : 'No alternative move available'}
      </p>
    </div>
  );
}
