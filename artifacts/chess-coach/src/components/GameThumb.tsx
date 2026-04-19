import React, { useMemo } from 'react';
import { Chess } from 'chess.js';

const PIECE_GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function fenToBoard(fen: string): (string | null)[][] {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const rows = fen.split(' ')[0].split('/');
  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) c += parseInt(ch, 10);
      else { board[r][c] = ch; c++; }
    }
  }
  return board;
}

function pgnToFinalFen(pgn: string): string {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn, { strict: false } as any);
    return chess.fen();
  } catch {
    return STARTING_FEN;
  }
}

export const GameThumb = React.memo(function GameThumb({
  pgn,
  userColor,
  size = 56,
}: {
  pgn: string;
  userColor: 'white' | 'black' | null;
  size?: number;
}) {
  const fen = useMemo(() => pgnToFinalFen(pgn), [pgn]);
  const board = useMemo(() => fenToBoard(fen), [fen]);

  const flipped = userColor === 'black';
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];

  const borderColor =
    userColor === 'white' ? '#f0f0f0' :
    userColor === 'black' ? '#1a1a1a' :
    'rgba(255,255,255,0.15)';

  const fontSize = Math.max(8, Math.floor(size / 8 * 0.78));

  return (
    <div
      className="grid grid-cols-8 shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        border: `2.5px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      }}
    >
      {ranks.map((rank) =>
        files.map((file) => {
          const rowIdx = 8 - rank;
          const colIdx = file.charCodeAt(0) - 97;
          const piece = board[rowIdx][colIdx];
          const isLight = (rowIdx + colIdx) % 2 === 0;
          const bg = isLight ? '#f0d9b5' : '#b58863';
          const isWhitePiece = piece && piece === piece.toUpperCase();
          return (
            <div
              key={`${file}${rank}`}
              className="flex items-center justify-center leading-none"
              style={{
                background: bg,
                fontFamily: '"Segoe UI Symbol", "DejaVu Sans", "Apple Color Emoji", sans-serif',
                fontSize,
                color: isWhitePiece ? '#fff' : '#1a1a1a',
                textShadow: isWhitePiece ? '0 1px 1px rgba(0,0,0,0.55)' : 'none',
              }}
            >
              {piece ? PIECE_GLYPH[piece] || '' : ''}
            </div>
          );
        })
      )}
    </div>
  );
});
