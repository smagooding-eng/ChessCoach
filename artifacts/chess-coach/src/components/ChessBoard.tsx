import React, { useState, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface ChessBoardProps {
  fen?: string | null;
  flipped?: boolean;
  practiceMode?: boolean;
  expectedMoveSan?: string | null;
  onMovePlayed?: (san: string, isCorrect: boolean) => void;
  lastMove?: { from: string; to: string } | null;
}

export function ChessBoard({
  fen,
  flipped = false,
  practiceMode = false,
  expectedMoveSan,
  onMovePlayed,
  lastMove,
}: ChessBoardProps) {
  const position = fen || START_FEN;
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { background: 'rgba(255, 240, 80, 0.4)' };
    squareStyles[lastMove.to] = { background: 'rgba(255, 240, 80, 0.65)' };
  }
  if (feedback === 'correct') {
    if (lastMove) {
      squareStyles[lastMove.to] = { background: 'rgba(80, 220, 100, 0.7)' };
    }
  } else if (feedback === 'wrong') {
    if (lastMove) {
      squareStyles[lastMove.to] = { background: 'rgba(220, 80, 80, 0.7)' };
    }
  }

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }: { piece: { isSparePiece: boolean; position: string; pieceType: string }; sourceSquare: string; targetSquare: string | null }) => {
    if (!practiceMode || !targetSquare) return false;
    try {
      const chess = new Chess(position);
      const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
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
  }, [position, practiceMode, expectedMoveSan, onMovePlayed]);

  return (
    <div className="relative w-full max-w-[580px] mx-auto">
      <Chessboard
        options={{
          position,
          boardOrientation: flipped ? 'black' : 'white',
          allowDragging: practiceMode,
          onPieceDrop: handlePieceDrop,
          squareStyles,
          boardStyle: {
            borderRadius: '10px',
            boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
          },
          lightSquareStyle: { backgroundColor: '#f0d9b5' },
          darkSquareStyle: { backgroundColor: '#b58863' },
          animationDurationInMs: 180,
        }}
      />
      {feedback && (
        <div className={`absolute inset-0 rounded-[10px] pointer-events-none flex items-center justify-center
          ${feedback === 'correct' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
          <span className={`text-5xl font-black drop-shadow-lg ${feedback === 'correct' ? 'text-emerald-400' : 'text-red-400'}`}>
            {feedback === 'correct' ? '✓' : '✗'}
          </span>
        </div>
      )}
    </div>
  );
}
