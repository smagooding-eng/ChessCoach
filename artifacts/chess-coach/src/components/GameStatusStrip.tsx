import { useMemo } from 'react';
import { Chess } from 'chess.js';
import { evaluatePosition } from '@/lib/chess-bot';

// Reusable eval bar driven directly by a FEN string (via the same
// evaluatePosition() engine already used for bot move quality), so it
// works for any game -- bot or live opponent -- not just bot games.
export function EvalBar({ fen }: { fen: string }) {
  const evalScore = useMemo(() => {
    try {
      return evaluatePosition(fen);
    } catch {
      return 0;
    }
  }, [fen]);

  const clamped = Math.max(-1500, Math.min(1500, evalScore));
  const whitePercent = Math.max(4, Math.min(96, 50 + (clamped / 30)));
  const display = evalScore >= 0 ? `+${(evalScore / 100).toFixed(1)}` : (evalScore / 100).toFixed(1);

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-5 rounded-full overflow-hidden flex border border-white/10">
        <div
          className="h-full bg-[#e8e0d0] transition-all duration-500 ease-out"
          style={{ width: `${whitePercent}%` }}
        />
        <div className="flex-1 bg-[#3a3a3a]" />
      </div>
      <span className="text-[11px] font-mono font-bold tabular-nums text-muted-foreground w-11 text-right">{display}</span>
    </div>
  );
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const PIECE_GLYPHS: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
const STARTING_COUNTS: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

function computeMaterial(fen: string) {
  const chess = new Chess(fen);
  const board = chess.board();
  const onBoard: Record<'w' | 'b', Record<string, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };
  for (const row of board) {
    for (const sq of row) {
      if (!sq || sq.type === 'k') continue;
      onBoard[sq.color][sq.type] = (onBoard[sq.color][sq.type] ?? 0) + 1;
    }
  }
  // "capturedByWhite" = black pieces missing from the board (i.e. what
  // white has taken), and vice versa.
  const capturedByWhite: string[] = [];
  const capturedByBlack: string[] = [];
  let whiteMaterial = 0;
  let blackMaterial = 0;
  (['q', 'r', 'b', 'n', 'p'] as const).forEach((type) => {
    const missingFromWhite = STARTING_COUNTS[type] - (onBoard.w[type] ?? 0);
    const missingFromBlack = STARTING_COUNTS[type] - (onBoard.b[type] ?? 0);
    for (let i = 0; i < missingFromWhite; i++) capturedByBlack.push(type);
    for (let i = 0; i < missingFromBlack; i++) capturedByWhite.push(type);
    whiteMaterial += (onBoard.w[type] ?? 0) * PIECE_VALUES[type];
    blackMaterial += (onBoard.b[type] ?? 0) * PIECE_VALUES[type];
  });
  return { capturedByWhite, capturedByBlack, materialDiff: whiteMaterial - blackMaterial };
}

// Shows the pieces a given side has captured from their opponent, plus
// a "+N" point lead when that side is ahead on material. `vertical`
// stacks the pieces top-to-bottom instead of the default horizontal
// row -- added for side-column layouts (e.g. Local Play) without
// changing behavior for any existing horizontal caller.
export function MaterialStrip({ fen, color, className, vertical = false }: { fen: string; color: 'w' | 'b'; className?: string; vertical?: boolean }) {
  const { capturedByWhite, capturedByBlack, materialDiff } = useMemo(() => {
    try {
      return computeMaterial(fen);
    } catch {
      return { capturedByWhite: [], capturedByBlack: [], materialDiff: 0 };
    }
  }, [fen]);

  const pieces = color === 'w' ? capturedByWhite : capturedByBlack;
  const diff = color === 'w' ? materialDiff : -materialDiff;

  if (vertical) {
    return (
      <div className={`flex flex-col items-center gap-0.5 ${className ?? ''}`} style={{ minWidth: 20 }}>
        {diff > 0 && (
          <span className="text-[11px] font-mono font-bold text-emerald-400 mb-0.5">+{diff}</span>
        )}
        {pieces.map((p, i) => (
          <span key={i} className="text-sm leading-none opacity-80" style={{ color: color === 'w' ? '#e8e0d0' : '#3a3a3a', WebkitTextStroke: color === 'w' ? '0.5px #555' : '0.5px #ccc' }}>
            {PIECE_GLYPHS[p]}
          </span>
        ))}
      </div>
    );
  }

  if (pieces.length === 0 && diff <= 0) return <div className={className} style={{ minHeight: 18 }} />;

  return (
    <div className={`flex items-center gap-0.5 flex-wrap ${className ?? ''}`} style={{ minHeight: 18 }}>
      {pieces.map((p, i) => (
        <span key={i} className="text-sm leading-none opacity-80" style={{ color: color === 'w' ? '#e8e0d0' : '#3a3a3a', WebkitTextStroke: color === 'w' ? '0.5px #555' : '0.5px #ccc' }}>
          {PIECE_GLYPHS[p]}
        </span>
      ))}
      {diff > 0 && (
        <span className="text-[11px] font-mono font-bold text-emerald-400 ml-1">+{diff}</span>
      )}
    </div>
  );
}
