import React, { useState, useCallback, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type MoveQuality = 'brilliant' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder';

const QUALITY_COLOR: Record<MoveQuality, string> = {
  brilliant:  'rgba(0, 220, 240, 0.60)',
  excellent:  'rgba(50, 210, 110, 0.60)',
  good:       'rgba(100, 200, 80, 0.50)',
  book:       'rgba(90, 140, 255, 0.55)',
  inaccuracy: 'rgba(255, 215, 40, 0.60)',
  mistake:    'rgba(255, 130, 20, 0.65)',
  blunder:    'rgba(220, 50, 50, 0.70)',
};

const QUALITY_LABEL: Record<MoveQuality, { text: string; icon: string }> = {
  brilliant:  { text: 'Brilliant!!', icon: '✦' },
  excellent:  { text: 'Excellent!',  icon: '!' },
  good:       { text: 'Good',        icon: '✓' },
  book:       { text: 'Book Move',   icon: '📖' },
  inaccuracy: { text: 'Inaccuracy',  icon: '?!' },
  mistake:    { text: 'Mistake',     icon: '?' },
  blunder:    { text: 'Blunder??',   icon: '??' },
};

interface ChessBoardProps {
  fen?: string | null;
  flipped?: boolean;
  practiceMode?: boolean;
  expectedMoveSan?: string | null;
  onMovePlayed?: (san: string, isCorrect: boolean) => void;
  lastMove?: { from: string; to: string } | null;
  moveQuality?: MoveQuality | null;
}

export function ChessBoard({
  fen,
  flipped = false,
  practiceMode = false,
  expectedMoveSan,
  onMovePlayed,
  lastMove,
  moveQuality,
}: ChessBoardProps) {
  const position = fen || START_FEN;
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  // Clear selection when position changes (e.g. navigation)
  const [prevPosition, setPrevPosition] = useState(position);
  if (position !== prevPosition) {
    setPrevPosition(position);
    setSelectedSquare(null);
    setFeedback(null);
  }

  // Compute legal target squares for selected piece
  const legalTargets = useMemo(() => {
    if (!selectedSquare || !practiceMode) return [];
    try {
      const chess = new Chess(position);
      return chess.moves({ square: selectedSquare as Parameters<typeof chess.moves>[0]['square'], verbose: true })
        .map((m) => m.to as string);
    } catch {
      return [];
    }
  }, [selectedSquare, position, practiceMode]);

  const tryMove = useCallback((from: string, to: string) => {
    try {
      const chess = new Chess(position);
      const move = chess.move({ from, to, promotion: 'q' });
      if (!move) return false;
      const san = move.san;
      const isCorrect = !expectedMoveSan || san === expectedMoveSan;
      setFeedback(isCorrect ? 'correct' : 'wrong');
      setTimeout(() => setFeedback(null), 900);
      onMovePlayed?.(san, isCorrect);
      return true;
    } catch {
      return false;
    }
  }, [position, expectedMoveSan, onMovePlayed]);

  const handleSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (!practiceMode) return;

    // If a square is already selected
    if (selectedSquare) {
      // Clicking the same square → deselect
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
      // Clicking a legal target → attempt move
      if (legalTargets.includes(square)) {
        const moved = tryMove(selectedSquare, square);
        setSelectedSquare(null);
        if (!moved) {
          // illegal for some reason — try selecting new square if it has a piece
          if (piece) setSelectedSquare(square);
        }
        return;
      }
      // Clicking another piece → switch selection (or deselect)
      if (piece) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
      return;
    }

    // No square selected: select if there's a piece of the side to move
    if (piece) {
      try {
        const chess = new Chess(position);
        const turn = chess.turn(); // 'w' or 'b'
        const pieceColor = piece.pieceType[0].toLowerCase(); // 'w' or 'b'
        if (pieceColor === turn) {
          setSelectedSquare(square);
        }
      } catch {
        setSelectedSquare(square);
      }
    }
  }, [practiceMode, selectedSquare, legalTargets, tryMove, position]);

  // Build square styles
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    // Last move highlight — use quality color if available, else yellow
    if (lastMove) {
      styles[lastMove.from] = { background: 'rgba(255, 240, 80, 0.30)' };
      styles[lastMove.to] = moveQuality
        ? { background: QUALITY_COLOR[moveQuality] }
        : { background: 'rgba(255, 240, 80, 0.55)' };
    }

    // Selected square
    if (selectedSquare) {
      styles[selectedSquare] = { background: 'rgba(100, 180, 255, 0.55)', borderRadius: '4px' };
    }

    // Legal move dots
    for (const sq of legalTargets) {
      styles[sq] = {
        background: 'radial-gradient(circle, rgba(100,180,255,0.55) 28%, transparent 30%)',
        ...(styles[sq] || {}),
      };
    }

    // Practice feedback overrides
    if (feedback === 'correct' && lastMove) {
      styles[lastMove.to] = { background: 'rgba(80, 220, 100, 0.65)' };
    } else if (feedback === 'wrong' && lastMove) {
      styles[lastMove.to] = { background: 'rgba(220, 80, 80, 0.65)' };
    }

    return styles;
  }, [lastMove, selectedSquare, legalTargets, feedback, moveQuality]);

  return (
    <div className="relative w-full max-w-[580px] mx-auto">
      <Chessboard
        options={{
          position,
          boardOrientation: flipped ? 'black' : 'white',
          allowDragging: false,
          squareStyles,
          onSquareClick: handleSquareClick,
          boardStyle: {
            borderRadius: '10px',
            boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
            cursor: practiceMode ? 'pointer' : 'default',
          },
          lightSquareStyle: { backgroundColor: '#f0d9b5' },
          darkSquareStyle: { backgroundColor: '#b58863' },
          animationDurationInMs: 180,
        }}
      />
      {/* Practice feedback overlay */}
      {feedback && (
        <div className={`absolute inset-0 rounded-[10px] pointer-events-none flex items-center justify-center
          ${feedback === 'correct' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
          <span className={`text-5xl font-black drop-shadow-lg ${feedback === 'correct' ? 'text-emerald-400' : 'text-red-400'}`}>
            {feedback === 'correct' ? '✓' : '✗'}
          </span>
        </div>
      )}

      {/* Move quality badge — shown in top-right corner of the board */}
      {moveQuality && !practiceMode && !feedback && (
        <div className="absolute top-2 right-2 pointer-events-none z-10">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg backdrop-blur-sm border
            ${moveQuality === 'brilliant'  ? 'bg-cyan-950/90 text-cyan-300 border-cyan-400/40' :
              moveQuality === 'excellent'  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-400/40' :
              moveQuality === 'good'       ? 'bg-green-950/90 text-green-300 border-green-400/40' :
              moveQuality === 'book'       ? 'bg-blue-950/90 text-blue-300 border-blue-400/40' :
              moveQuality === 'inaccuracy' ? 'bg-yellow-950/90 text-yellow-300 border-yellow-400/40' :
              moveQuality === 'mistake'    ? 'bg-orange-950/90 text-orange-300 border-orange-400/40' :
                                            'bg-red-950/90 text-red-300 border-red-400/40'}`}>
            <span>{QUALITY_LABEL[moveQuality].icon}</span>
            <span>{QUALITY_LABEL[moveQuality].text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
