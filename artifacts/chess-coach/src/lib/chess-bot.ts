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

export function evaluatePosition(fen: string): number {
  return evaluate(new Chess(fen));
}

export interface MoveAnalysisResult {
  quality: 'brilliant' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder';
  evalBefore: number;
  evalAfter: number;
  cpLoss: number;
  bestMoveSan: string | null;
  pros: string[];
  cons: string[];
  summary: string;
}

function isStandardOpeningMove(moveResult: ReturnType<Chess['move']>, turn: string): boolean {
  if (!moveResult) return false;
  if (moveResult.san === 'O-O' || moveResult.san === 'O-O-O') return true;
  if (moveResult.piece === 'p' && ['c4','c5','d4','d5','e4','e5','f4','b3','g3','b6','g6','a3','h3','a6','h6','c3','c6','e3','e6','d3','d6'].includes(moveResult.to)) return true;
  if (['n', 'b'].includes(moveResult.piece)) {
    const r = parseInt(moveResult.from[1]);
    if ((turn === 'w' && r <= 2) || (turn === 'b' && r >= 7)) return true;
  }
  if (moveResult.piece === 'q') {
    const r = parseInt(moveResult.from[1]);
    if ((turn === 'w' && r === 1) || (turn === 'b' && r === 8)) return true;
  }
  return false;
}

export function analyzeMoveQuality(fenBefore: string, san: string): MoveAnalysisResult {
  const chess = new Chess(fenBefore);
  const turn = chess.turn();
  const maximizing = turn === 'w';
  const depth = 2;

  const fenParts = fenBefore.split(' ');
  const fullMoveNum = parseInt(fenParts[5] || '1');
  const halfMoveCount = (fullMoveNum - 1) * 2 + (turn === 'b' ? 1 : 0);

  const evalBefore = evaluate(chess);

  const moveResult = chess.move(san);
  if (!moveResult) {
    return { quality: 'good', evalBefore, evalAfter: evalBefore, cpLoss: 0, bestMoveSan: null, pros: [], cons: [], summary: '' };
  }

  const evalAfter = evaluate(chess);
  const inCheck = chess.inCheck();
  const isMate = chess.isCheckmate();
  chess.undo();

  if (isMate) {
    return {
      quality: 'brilliant', evalBefore, evalAfter, cpLoss: 0, bestMoveSan: null,
      pros: ['Checkmate!'], cons: [], summary: 'Checkmate! Game over.',
    };
  }

  const moves = chess.moves();
  let bestMove = moves[0];
  let bestSearchEval = maximizing ? -Infinity : Infinity;
  let actualSearchEval = 0;
  const allEvals: number[] = [];

  for (const move of moves) {
    chess.move(move);
    const ev = minimax(chess, depth - 1, -Infinity, Infinity, !maximizing);
    chess.undo();
    allEvals.push(ev);
    if (move === san) actualSearchEval = ev;
    if (maximizing ? ev > bestSearchEval : ev < bestSearchEval) {
      bestSearchEval = ev;
      bestMove = move;
    }
  }

  let cpLoss = maximizing ? (bestSearchEval - actualSearchEval) : (actualSearchEval - bestSearchEval);
  cpLoss = Math.max(0, cpLoss);

  const isBest = san === bestMove;

  const movesWithin10 = allEvals.filter(ev => Math.abs(ev - bestSearchEval) <= 10).length;
  const movesWithin30 = allEvals.filter(ev => Math.abs(ev - bestSearchEval) <= 30).length;
  const isComplexPosition = movesWithin10 <= 2 && moves.length > 5;

  const isOpening = halfMoveCount <= 16;
  const isBookMove = isOpening && cpLoss <= 30 && isStandardOpeningMove(moveResult, turn);

  const evalSwing = maximizing ? (evalAfter - evalBefore) : (evalBefore - evalAfter);
  const isSacrifice = moveResult.captured && PIECE_VALUES[moveResult.piece] > (PIECE_VALUES[moveResult.captured] || 0) + 100;

  let quality: MoveAnalysisResult['quality'];
  if (isBookMove) {
    quality = 'book';
  } else if (isBest && cpLoss === 0 && isComplexPosition && (isSacrifice || inCheck || evalSwing > 80)) {
    quality = 'brilliant';
  } else if (isBest && cpLoss === 0 && movesWithin30 <= 3 && !isOpening) {
    quality = 'excellent';
  } else if (cpLoss <= 15) {
    quality = 'good';
  } else if (cpLoss <= 60) {
    quality = 'inaccuracy';
  } else if (cpLoss <= 200) {
    quality = 'mistake';
  } else {
    quality = 'blunder';
  }

  const pros: string[] = [];
  const cons: string[] = [];

  if (moveResult.captured) {
    const names: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };
    pros.push(`Captures ${names[moveResult.captured] ?? 'piece'}`);
  }
  if (inCheck) pros.push('Delivers check');
  if (moveResult.san === 'O-O' || moveResult.san === 'O-O-O') pros.push('Improves king safety');
  if (['d4', 'd5', 'e4', 'e5'].includes(moveResult.to)) pros.push('Controls the center');
  if (['n', 'b'].includes(moveResult.piece)) {
    const r = parseInt(moveResult.from[1]);
    if ((turn === 'w' && r <= 2) || (turn === 'b' && r >= 7)) pros.push('Develops a piece');
  }
  if (moveResult.piece === 'p') {
    const r = parseInt(moveResult.to[1]);
    if ((turn === 'w' && r >= 5) || (turn === 'b' && r <= 4)) pros.push('Advances pawn');
  }

  if (quality === 'inaccuracy') { cons.push('Slightly inaccurate'); if (!isBest) cons.push(`${bestMove} was better`); }
  else if (quality === 'mistake') { cons.push('Misses a stronger continuation'); if (!isBest) cons.push(`${bestMove} was the right call`); }
  else if (quality === 'blunder') { cons.push('Serious error losing advantage'); if (!isBest) cons.push(`${bestMove} was critical`); }

  if (pros.length === 0) {
    if (quality === 'brilliant') pros.push('Only strong move in a sharp position');
    else if (quality === 'excellent') pros.push('Strong continuation');
    else if (quality === 'good') pros.push('Solid move');
    else if (quality === 'book') pros.push('Standard opening move');
  }

  let summary = '';
  switch (quality) {
    case 'brilliant': summary = 'A difficult move to find — the best in a complex position!'; break;
    case 'excellent': summary = 'A strong choice that keeps the advantage.'; break;
    case 'good': summary = 'A solid move. Close to the best option.'; break;
    case 'book': summary = 'A well-known opening move. Good theory.'; break;
    case 'inaccuracy': summary = `Small inaccuracy.${!isBest ? ` Consider ${bestMove}.` : ''}`; break;
    case 'mistake': summary = `This weakens your position.${!isBest ? ` ${bestMove} was better.` : ''}`; break;
    case 'blunder': summary = `A serious mistake.${!isBest ? ` ${bestMove} was essential.` : ''}`; break;
  }

  return { quality, evalBefore, evalAfter, cpLoss, bestMoveSan: isBest ? null : bestMove, pros, cons, summary };
}
