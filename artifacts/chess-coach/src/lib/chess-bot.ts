import { Chess } from 'chess.js';

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

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

const PST: Record<string, number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_TABLE,
};

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
  if (depth === 0) {
    return evaluate(chess);
  }

  const moves = chess.moves();

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const eval_ = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const eval_ = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export interface BotConfig {
  name: string;
  rating: number;
  depth: number;
  blunderRate: number;
  description: string;
  avatar: string;
  personality: string;
}

export const BOTS: BotConfig[] = [
  {
    name: 'Woody',
    rating: 400,
    depth: 1,
    blunderRate: 0.5,
    description: 'Just learned the rules. Makes lots of random moves.',
    avatar: '🌲',
    personality: 'Beginner',
  },
  {
    name: 'Pepper',
    rating: 800,
    depth: 1,
    blunderRate: 0.3,
    description: 'Knows the basics but misses tactics often.',
    avatar: '🌶️',
    personality: 'Casual',
  },
  {
    name: 'Scout',
    rating: 1000,
    depth: 2,
    blunderRate: 0.2,
    description: 'Developing player. Captures free pieces and controls the center.',
    avatar: '🐕',
    personality: 'Improving',
  },
  {
    name: 'Falcon',
    rating: 1200,
    depth: 2,
    blunderRate: 0.1,
    description: 'Solid fundamentals. Rarely hangs pieces for free.',
    avatar: '🦅',
    personality: 'Club Player',
  },
  {
    name: 'Raven',
    rating: 1400,
    depth: 3,
    blunderRate: 0.08,
    description: 'Sees basic tactics 2-3 moves deep. Punishes blunders fast.',
    avatar: '🐦‍⬛',
    personality: 'Tournament',
  },
  {
    name: 'Phantom',
    rating: 1600,
    depth: 3,
    blunderRate: 0.04,
    description: 'Strong positional play. Exploits weaknesses methodically.',
    avatar: '👻',
    personality: 'Advanced',
  },
  {
    name: 'Magnus Jr.',
    rating: 1800,
    depth: 4,
    blunderRate: 0.02,
    description: 'Expert-level play. Deep calculation and solid endgames.',
    avatar: '🧠',
    personality: 'Expert',
  },
  {
    name: 'Titan',
    rating: 2000,
    depth: 4,
    blunderRate: 0.01,
    description: 'Near-master strength. Very few mistakes.',
    avatar: '⚡',
    personality: 'Master',
  },
];

export function getBotMove(fen: string, bot: BotConfig): string | null {
  const chess = new Chess(fen);
  const moves = chess.moves();
  if (moves.length === 0) return null;

  if (Math.random() < bot.blunderRate) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const maximizing = chess.turn() === 'w';
  let bestMove = moves[0];
  let bestEval = maximizing ? -Infinity : Infinity;

  const shuffled = [...moves].sort(() => Math.random() - 0.5);

  for (const move of shuffled) {
    chess.move(move);
    const eval_ = minimax(chess, bot.depth - 1, -Infinity, Infinity, !maximizing);
    chess.undo();

    if (maximizing ? eval_ > bestEval : eval_ < bestEval) {
      bestEval = eval_;
      bestMove = move;
    }
  }

  return bestMove;
}
