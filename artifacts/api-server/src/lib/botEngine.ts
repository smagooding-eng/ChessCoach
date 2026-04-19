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
//
// Tuning intent: bots should play noticeably "for their level" and not throw
// away pieces or hang mate at any rating above ~900. Blunder/randomness curves
// are aggressive at the low end and taper off quickly through the middle band.
export function configForRating(elo: number): {
  depth: number;
  blunderRate: number;     // chance of a fully random legal move
  randomRate: number;      // chance of choosing from top-N instead of best
  topN: number;            // how many "good enough" candidates to mix in
  avoidHangCap: number;    // max material loss (centipawns) tolerated when avoiding hangs; 0 disables filter
} {
  let depth: number;
  if (elo < 800) depth = 2;
  else if (elo < 1100) depth = 2;
  else if (elo < 1400) depth = 3;
  else if (elo < 1800) depth = 3;
  else if (elo < 2100) depth = 4;
  else depth = 4;

  // Smooth, gentler blunder curve — at 1200 ~6%, 1500 ~3%, 1800 ~1.5%, 800 ~14%.
  const t = Math.max(0, Math.min(1, (elo - 600) / 1600));
  const blunderRate = Math.max(0.005, 0.18 * Math.pow(1 - t, 2.0));
  // Top-N noise: pick a near-best move instead of best move some of the time.
  const randomRate = Math.max(0.08, 0.55 * Math.pow(1 - t, 1.4));
  // Wider candidate set at low ratings.
  const topN = elo < 1000 ? 4 : elo < 1500 ? 3 : 2;
  // Hanging-piece filter: at >=1100 we re-roll moves that drop more than a
  // pawn for nothing; at higher ratings tolerance drops to "no free material at all".
  const avoidHangCap = elo < 1100 ? 0 : elo < 1500 ? 150 : elo < 1900 ? 80 : 30;
  return { depth, blunderRate, randomRate, topN, avoidHangCap };
}

// Heuristic SEE-lite: after our move, look one ply ahead — the worst recapture
// our opponent can play. Returns the centipawn material we lose on the next ply.
function worstReplyMaterialLoss(chess: Chess): number {
  const replies = chess.moves({ verbose: true });
  let worst = 0;
  for (const r of replies) {
    if (!r.captured) continue;
    const gain = PIECE_VALUES[r.captured] ?? 0;
    // Approximate net loss: opponent gains this much material.
    if (gain > worst) worst = gain;
  }
  return worst;
}

export function getBotMove(fen: string, elo: number): string | null {
  const chess = new Chess(fen);
  const moves = chess.moves();
  if (moves.length === 0) return null;
  const cfg = configForRating(elo);

  // Pure random blunder — kept small at all but the lowest ratings.
  if (Math.random() < cfg.blunderRate) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const maximizing = chess.turn() === 'w';

  // Cap depth in branching positions to keep latency reasonable.
  let effectiveDepth = cfg.depth;
  if (moves.length > 40) effectiveDepth = Math.min(effectiveDepth, 2);
  else if (moves.length > 30 && effectiveDepth > 3) effectiveDepth = 3;

  const evals: { move: string; eval: number; hangLoss: number }[] = [];
  const shuffled = [...moves].sort(() => Math.random() - 0.5);
  for (const move of shuffled) {
    chess.move(move);
    const e = minimax(chess, effectiveDepth - 1, -Infinity, Infinity, !maximizing);
    const hangLoss = cfg.avoidHangCap > 0 ? worstReplyMaterialLoss(chess) : 0;
    chess.undo();
    evals.push({ move, eval: e, hangLoss });
  }
  evals.sort((a, b) => maximizing ? b.eval - a.eval : a.eval - b.eval);

  // Apply a "don't drop pieces" filter for ratings high enough to be expected
  // to see basic tactics. We keep moves whose worst 1-ply reply doesn't lose
  // more than the cap. If everything hangs, fall back to original list (it's
  // probably forced).
  let pool = evals;
  if (cfg.avoidHangCap > 0) {
    const safe = evals.filter(e => e.hangLoss <= cfg.avoidHangCap);
    if (safe.length > 0) pool = safe;
  }

  // With probability randomRate, pick from top-N (within the safe pool).
  if (pool.length > 1 && Math.random() < cfg.randomRate) {
    const topN = Math.min(cfg.topN, pool.length);
    return pool[Math.floor(Math.random() * topN)].move;
  }
  return pool[0].move;
}

// Simulated thinking time in ms based on rating + branching factor.
//
// Goal: feels human, never instant. Lower bound ~1.4s in trivial positions,
// upper bound ~10s in complex middlegames. Higher ratings think a touch longer.
export function botThinkMs(elo: number, movesAvailable: number): number {
  const eloN = Math.max(600, Math.min(2400, elo));
  const base = 1500 + (eloN - 600) * 0.9;            // 1.5s @ 600 → ~3.1s @ 2400
  const branching = 0.55 + Math.min(1.6, movesAvailable / 22); // 0.55 → 2.15
  const jitter = 0.75 + Math.random() * 0.6;         // 0.75 → 1.35
  const ms = base * branching * jitter;
  return Math.max(1400, Math.min(10000, Math.round(ms)));
}
