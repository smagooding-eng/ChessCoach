import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface ChessBoardProps {
  fen?: string | null;
  flipped?: boolean;
}

const PIECE_SYMBOLS: Record<string, string> = {
  'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
  'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♟'
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function ChessBoard({ fen, flipped = false }: ChessBoardProps) {
  const position = fen || START_FEN;

  const board = useMemo(() => {
    const boardStr = position.split(' ')[0];
    const rows = boardStr.split('/');
    const grid: { char: string | null; isWhite: boolean }[] = [];

    rows.forEach(row => {
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (!isNaN(parseInt(char))) {
          for (let j = 0; j < parseInt(char); j++) {
            grid.push({ char: null, isWhite: false });
          }
        } else {
          grid.push({
            char: PIECE_SYMBOLS[char],
            isWhite: char === char.toUpperCase()
          });
        }
      }
    });

    return flipped ? grid.reverse() : grid;
  }, [position, flipped]);

  const files = flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
  const ranks = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];

  return (
    <div className="w-full max-w-2xl mx-auto aspect-square rounded-lg overflow-hidden border-4 border-secondary/50 shadow-2xl shadow-black/50 grid grid-cols-8 relative">
      {board.map((square, index) => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        const isLight = (row + col) % 2 === 0;

        return (
          <div
            key={index}
            className={cn(
              "w-full h-full flex items-center justify-center relative select-none",
              isLight ? "bg-[#e5cda7]" : "bg-[#9a6e4d]"
            )}
          >
            {/* Coordinates */}
            {col === 0 && (
              <span className={cn(
                "absolute top-0.5 left-1 text-[10px] sm:text-xs font-bold",
                isLight ? "text-[#9a6e4d]" : "text-[#e5cda7]"
              )}>
                {ranks[row]}
              </span>
            )}
            {row === 7 && (
              <span className={cn(
                "absolute bottom-0 right-1 text-[10px] sm:text-xs font-bold",
                isLight ? "text-[#9a6e4d]" : "text-[#e5cda7]"
              )}>
                {files[col]}
              </span>
            )}

            {square.char && (
              <span 
                className={cn(
                  "text-3xl sm:text-5xl md:text-6xl drop-shadow-md",
                  square.isWhite ? "text-[#ffffff] drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]" : "text-[#111111] drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]"
                )}
                style={{ WebkitTextStroke: square.isWhite ? '1px #333' : '1px #000' }}
              >
                {square.char}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
