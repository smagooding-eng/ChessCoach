// Server-side chess engine for bot opponents. Pure JS minimax with alpha-beta + PSTs.
// Parameterized by target ELO so we can produce a continuous rating spectrum.

import { Chess } from 'chess.js';

const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PAWN_TABLE = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];
const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];
const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];
const ROOK_TABLE = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];
const QUEEN_TABLE = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];
const KING_TABLE = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
];
const PST: Record<string, number[]> = { p: PAWN_TABLE, n: KNIGHT_TABLE, b: BISHOP_TABLE, r: ROOK_TABLE, q: QUEEN_TABLE, k: KING_TABLE };

function squareIndex(sq: string): number {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1]) - 1;
  return (7 - rank) * 8 + file;
}
function mirrorIndex(idx: number): number {
  const rank = Math.floor(idx / 8);
  const file = idx % 8;
  return (7 - rank) * 8 + file;
}
function evaluate(chess: Chess): number {
  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const sq = String.fromCharCode(97 + f) + (8 - r);
      const idx = squareIndex(sq);
      const pst = PST[piece.type] ?? [];
      const val = PIECE_VALUES[piece.type] ?? 0;
      const positional = piece.color === 'w' ? (pst[idx] ?? 0) : (pst[mirrorIndex(idx)] ?? 0);
      const total = val + positional;
      score += piece.color === 'w' ? total : -total;
    }
  }
  return score;
}

const MATE_SCORE = 100000;
function minimax(chess: Chess, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) return maximizing ? -MATE_SCORE - depth : MATE_SCORE + depth;
    return 0;
  }
  if (depth === 0) return evaluate(chess);
  const moves = chess.moves();
  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const e = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      if (e > maxEval) maxEval = e;
      if (e > alpha) alpha = e;
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const e = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      if (e < minEval) minEval = e;
      if (e < beta) beta = e;
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Map ELO 600..2400 to engine config.
export function configForRating(elo: number): { depth: number; blunderRate: number; randomRate: number } {
  // depth: ramps 1 -> 4 between 800 and 2200
  let depth: number;
  if (elo < 800) depth = 1;
  else if (elo < 1200) depth = 2;
  else if (elo < 1700) depth = 3;
  else depth = 4;
  // blunderRate: full random move chance
  const blunderRate = Math.max(0.005, Math.min(0.45, 0.55 - (elo - 600) / 4400));
  // randomRate: pick from top-N candidate moves by eval (adds noise without total blunder)
  const randomRate = Math.max(0.05, Math.min(0.6, 0.7 - (elo - 600) / 3600));
  return { depth, blunderRate, randomRate };
}

export function getBotMove(fen: string, elo: number): string | null {
  const chess = new Chess(fen);
  const moves = chess.moves();
  if (moves.length === 0) return null;
  const cfg = configForRating(elo);

  // Pure random blunder
  if (Math.random() < cfg.blunderRate) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const maximizing = chess.turn() === 'w';

  // Cap depth in branching positions to keep latency reasonable
  let effectiveDepth = cfg.depth;
  if (moves.length > 40) effectiveDepth = Math.min(effectiveDepth, 2);
  else if (moves.length > 30 && effectiveDepth > 3) effectiveDepth = 3;

  const evals: { move: string; eval: number }[] = [];
  const shuffled = [...moves].sort(() => Math.random() - 0.5);
  for (const move of shuffled) {
    chess.move(move);
    const e = minimax(chess, effectiveDepth - 1, -Infinity, Infinity, !maximizing);
    chess.undo();
    evals.push({ move, eval: e });
  }
  evals.sort((a, b) => maximizing ? b.eval - a.eval : a.eval - b.eval);

  // With probability randomRate, pick from top-3 instead of best
  if (evals.length > 1 && Math.random() < cfg.randomRate) {
    const topN = Math.min(3, evals.length);
    return evals[Math.floor(Math.random() * topN)].move;
  }
  return evals[0].move;
}

// Simulated thinking time in ms based on rating + branching factor.
export function botThinkMs(elo: number, movesAvailable: number): number {
  const base = 600 + Math.min(2400, elo) * 0.6;
  const branching = Math.min(2.0, movesAvailable / 25);
  const jitter = 0.65 + Math.random() * 0.7;
  return Math.round(base * branching * jitter);
}
