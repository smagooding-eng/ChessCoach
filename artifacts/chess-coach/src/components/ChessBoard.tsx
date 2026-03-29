import React, { useState, useCallback, useMemo } from 'react';
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

    // Last move highlight
    if (lastMove) {
      styles[lastMove.from] = { background: 'rgba(255, 240, 80, 0.38)' };
      styles[lastMove.to] = { background: 'rgba(255, 240, 80, 0.6)' };
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

    // Feedback
    if (feedback === 'correct' && lastMove) {
      styles[lastMove.to] = { background: 'rgba(80, 220, 100, 0.65)' };
    } else if (feedback === 'wrong' && lastMove) {
      styles[lastMove.to] = { background: 'rgba(220, 80, 80, 0.65)' };
    }

    return styles;
  }, [lastMove, selectedSquare, legalTargets, feedback]);

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
