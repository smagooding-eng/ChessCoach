import React, { useMemo } from 'react';
import { Chess } from 'chess.js';
import { MiniBoard } from './MiniBoard';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// The thumbnail must show where the game ENDED. chess.js's loadPgn rejects the
// whole PGN on any hiccup (an unusual header, a clock comment it dislikes, a
// variant tag), and the old code then silently drew the starting position. Now:
// try the fast path, and if it fails, replay the moves ourselves -- honouring a
// [FEN] start position -- keeping every move that parses.
function pgnToFinalFen(pgn: string): string {
  if (!pgn) return STARTING_FEN;
  try {
    const chess = new Chess();
    chess.loadPgn(pgn, { strict: false } as any);
    return chess.fen();
  } catch { /* fall through to the tolerant replay */ }

  const fenHeader = pgn.match(/\[FEN\s+"([^"]+)"\]/i)?.[1];
  let chess: Chess;
  try { chess = new Chess(fenHeader || undefined); } catch { chess = new Chess(); }

  let body = pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, ' ');       // headers
  body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' '); // comments
  let prev = '';
  while (prev !== body) { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } // variations
  body = body.replace(/\$\d+/g, ' ').replace(/\d+\.(\.\.)?/g, ' ');           // NAGs, move numbers
  const tokens = body.split(/\s+/).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  for (const raw of tokens) {
    const san = raw.replace(/[!?]+$/g, '').replace(/^0-0(-0)?/, (m) => m.replace(/0/g, 'O'));
    try { chess.move(san, { strict: false } as any); } catch { break; }
  }
  return chess.fen();
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

  const flipped = userColor === 'black';

  const borderColor =
    userColor === 'white' ? '#f0f0f0' :
    userColor === 'black' ? '#1a1a1a' :
    'rgba(255,255,255,0.15)';

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        border: `2.5px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        boxSizing: 'content-box',
      }}
    >
      <MiniBoard fen={fen} size={size} flipped={flipped} />
    </div>
  );
});
