// Chess for Kids -- level data and the small move engine the kids board uses.
//
// The kids board never needs full chess rules except in the checkmate world
// (which uses chess.js). Everything else is one or two pieces, friendly
// shapes to catch, and bushes that block the way, so the rules here are the
// piece-movement rules and nothing else. White ("sunny") always plays up.

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Side = 'w' | 'b';
export type ShapeKind = 'star' | 'heart' | 'gem' | 'balloon' | 'donut' | 'moon';

export interface BoardPiece { type: PieceType; side: Side; sq: string }

export type LevelKind =
  | 'collect'   // move your piece and catch every star (or plum piece)
  | 'tapAll'    // tap every shape your piece could capture in one move
  | 'check'     // make one move that puts the plum king in check
  | 'mate'      // make one move that is checkmate (chess.js decides)
  // Used by the Beginner path (older students):
  | 'best'      // find the right move in a real position (answers, SAN)
  | 'escape'    // get the King out of check in a particular way (goal)
  | 'tapLegal'  // tap every square the piece on `from` can legally move to
  | 'tapSquare' // tap the named squares (board coordinates)
  | 'quiz';     // multiple choice, with an explanation

export interface Level {
  id: string;
  kind: LevelKind;
  title: string;
  say: string;                 // what the buddy says (and reads aloud)
  pieces?: BoardPiece[];       // our piece(s) first, then plum pieces
  shapes?: { sq: string; kind: ShapeKind }[];
  bushes?: string[];
  fen?: string;                // mate / best / escape / tapLegal / quiz (diagram)
  answers?: string[];          // best: accepted moves in SAN, without +/#
  wrong?: Record<string, string>; // best: what to say for a tempting wrong move
  goal?: 'king' | 'block' | 'capture' | 'any'; // escape
  from?: string;               // tapLegal
  squares?: string[];          // tapSquare
  question?: string;           // quiz
  options?: string[];          // quiz
  correct?: number;            // quiz
  explain?: string;            // quiz + best: shown after the right answer
  /** best: after the right move, play these replies on the board, one by one, narrated. */
  followUp?: { san: string; say: string }[];
  /** best: arrows/marks drawn once solved, to show the idea. */
  successViz?: { arrows: { from: string; to: string; color: 'good' | 'bad' | 'info' | 'warn'; dashed?: boolean }[]; marks?: { sq: string; kind: 'x' | 'ring' }[] };
  /** Arrows/marks drawn from the start to show what matters (e.g. an attacked square). */
  guide?: { arrows: { from: string; to: string; color: 'good' | 'bad' | 'info' | 'warn'; dashed?: boolean }[]; marks?: { sq: string; kind: 'x' | 'ring' }[] };
}

export interface World {
  id: string;
  name: string;
  piece: PieceType;
  buddy: string;               // the piece character's name
  color: string;               // world tint
  intro: string;               // one-line rule, read aloud on the world page
  levels: Level[];
}

// ---------------------------------------------------------------- squares

export const FILES = 'abcdefgh';
export function sqToXY(sq: string): [number, number] {
  return [FILES.indexOf(sq[0]), Number(sq[1]) - 1];
}
export function xyToSq(x: number, y: number): string | null {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  return FILES[x] + String(y + 1);
}

const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KING_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];
const KNIGHT_JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

/** What sits on a square, from the moving piece's point of view. */
export type Occupant = 'empty' | 'bush' | 'shape' | 'friend' | 'enemy';

export interface Reach {
  /** Squares the piece can land on (empty, a shape, or an enemy). */
  moves: Set<string>;
  /** Of those, the ones that capture (a shape or an enemy). */
  captures: Set<string>;
  /** For each slider ray: the squares in order until something stops it. */
  rays: string[][];
}

/**
 * Where a piece can go in one move. Shapes behave like enemy pieces (they
 * can be captured and they stop a slider), bushes behave like friendly
 * pieces (they stop a slider and cannot be captured). The knight jumps over
 * everything. Pawns move straight but only capture diagonally -- and a shape
 * straight ahead blocks a pawn, exactly like a piece would.
 */
export function reach(type: PieceType, side: Side, from: string, at: (sq: string) => Occupant): Reach {
  const [fx, fy] = sqToXY(from);
  const moves = new Set<string>();
  const captures = new Set<string>();
  const rays: string[][] = [];
  const canTake = (o: Occupant) => o === 'shape' || o === 'enemy';

  const slide = (dirs: number[][], max: number) => {
    for (const [dx, dy] of dirs) {
      const ray: string[] = [];
      for (let i = 1; i <= max; i++) {
        const sq = xyToSq(fx + dx * i, fy + dy * i);
        if (!sq) break;
        const o = at(sq);
        if (o === 'empty') { moves.add(sq); ray.push(sq); continue; }
        if (canTake(o)) { moves.add(sq); captures.add(sq); ray.push(sq); }
        break;
      }
      rays.push(ray);
    }
  };

  switch (type) {
    case 'r': slide(ROOK_DIRS, 7); break;
    case 'b': slide(BISHOP_DIRS, 7); break;
    case 'q': slide(KING_DIRS, 7); break;
    case 'k': slide(KING_DIRS, 1); break;
    case 'n':
      for (const [dx, dy] of KNIGHT_JUMPS) {
        const sq = xyToSq(fx + dx, fy + dy);
        if (!sq) continue;
        const o = at(sq);
        if (o === 'empty') moves.add(sq);
        else if (canTake(o)) { moves.add(sq); captures.add(sq); }
        rays.push([sq]);
      }
      break;
    case 'p': {
      const dir = side === 'w' ? 1 : -1;
      const startRank = side === 'w' ? 1 : 6;
      const one = xyToSq(fx, fy + dir);
      const ray: string[] = [];
      if (one && at(one) === 'empty') {
        moves.add(one); ray.push(one);
        const two = xyToSq(fx, fy + 2 * dir);
        if (fy === startRank && two && at(two) === 'empty') { moves.add(two); ray.push(two); }
      }
      rays.push(ray);
      for (const dx of [-1, 1]) {
        const sq = xyToSq(fx + dx, fy + dir);
        if (sq && canTake(at(sq))) { moves.add(sq); captures.add(sq); rays.push([sq]); }
      }
      break;
    }
  }
  return { moves, captures, rays };
}

/** Squares a piece attacks (for "is the king in check?"). Pawns attack diagonally only. */
export function attacks(type: PieceType, side: Side, from: string, at: (sq: string) => Occupant): Set<string> {
  if (type !== 'p') {
    // Treat everything as capturable so a ray reaching the king counts.
    const r = reach(type, side, from, (sq) => (at(sq) === 'empty' ? 'empty' : 'enemy'));
    return r.moves;
  }
  const [fx, fy] = sqToXY(from);
  const dir = side === 'w' ? 1 : -1;
  const out = new Set<string>();
  for (const dx of [-1, 1]) { const sq = xyToSq(fx + dx, fy + dir); if (sq) out.add(sq); }
  return out;
}

/** Why a tapped shape can't be captured -- the friendly explanation shown to the child. */
export function whyNot(type: PieceType, side: Side, from: string, target: string, at: (sq: string) => Occupant, tone: 'kids' | 'plain' = 'kids'): string {
  if (tone === 'plain') return whyNotPlain(type, side, from, target, at);
  const [fx, fy] = sqToXY(from);
  const [tx, ty] = sqToXY(target);
  const dx = tx - fx, dy = ty - fy;
  const name = PIECE_NAMES[type];
  if (type === 'p') {
    const fwd = side === 'w' ? 1 : -1;
    if (dx === 0 && dy * fwd > 0) return 'Pawns walk straight, but they capture diagonally!';
    if (dy * fwd < 0) return 'Pawns can never go backwards!';
    return 'A pawn only captures one square diagonally forward.';
  }
  if (type === 'n') return 'The Knight jumps in an L: two squares, then one to the side.';
  const straight = dx === 0 || dy === 0;
  const diag = Math.abs(dx) === Math.abs(dy);
  const lineOk = (type === 'r' && straight) || (type === 'b' && diag) || (type === 'q' && (straight || diag)) ||
    (type === 'k' && Math.max(Math.abs(dx), Math.abs(dy)) === 1);
  if (type === 'k' && (straight || diag)) return 'The King only moves one square at a time.';
  if (lineOk) {
    // On the right line, so something is in the way.
    const sx = Math.sign(dx), sy = Math.sign(dy);
    for (let i = 1; ; i++) {
      const sq = xyToSq(fx + sx * i, fy + sy * i);
      if (!sq || sq === target) break;
      const o = at(sq);
      if (o === 'bush') return 'Oops, a bush is in the way!';
      if (o !== 'empty') return `Something is in the way! The ${name} has to stop there first.`;
    }
  }
  if (type === 'r') return 'The Rook only moves in straight lines: up, down and sideways.';
  if (type === 'b') return 'The Bishop only moves on diagonals.';
  if (type === 'q') return 'The Queen moves in straight lines and diagonals, but not like that!';
  return `The ${name} can't reach that one.`;
}

function whyNotPlain(type: PieceType, side: Side, from: string, target: string, at: (sq: string) => Occupant): string {
  const [fx, fy] = sqToXY(from);
  const [tx, ty] = sqToXY(target);
  const dx = tx - fx, dy = ty - fy;
  if (type === 'p') {
    const fwd = side === 'w' ? 1 : -1;
    if (dx === 0 && dy * fwd > 0) return 'Pawns move straight ahead but capture only diagonally, so a piece directly in front blocks them.';
    if (dy * fwd < 0) return 'Pawns never move backwards.';
    return 'A pawn captures one square diagonally forward, nowhere else.';
  }
  if (type === 'n') return 'Not a knight move. The Knight goes two squares in one direction, then one square sideways (an L).';
  const straight = dx === 0 || dy === 0;
  const diag = Math.abs(dx) === Math.abs(dy);
  if (type === 'k' && (straight || diag)) return 'The King moves only one square at a time.';
  const lineOk = (type === 'r' && straight) || (type === 'b' && diag) || (type === 'q' && (straight || diag));
  if (lineOk) {
    const sx = Math.sign(dx), sy = Math.sign(dy);
    for (let i = 1; ; i++) {
      const sq = xyToSq(fx + sx * i, fy + sy * i);
      if (!sq || sq === target) break;
      const o = at(sq);
      if (o === 'friend' || o === 'bush') return `Blocked: your own piece on ${sq} is in the way, and pieces can't jump over it.`;
      if (o !== 'empty') return `Blocked: the ${PIECE_NAMES[type]} would have to stop at ${sq} first.`;
    }
  }
  if (type === 'r') return 'The Rook moves only along ranks and files (straight lines).';
  if (type === 'b') return 'The Bishop moves only along diagonals.';
  if (type === 'q') return 'The Queen moves along ranks, files and diagonals, but this square is on none of them.';
  return `The ${PIECE_NAMES[type]} can't reach that square in one move.`;
}

export const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
};

// ---------------------------------------------------------------- level helpers

const SHAPE_CYCLE: ShapeKind[] = ['star', 'heart', 'gem', 'balloon', 'donut', 'moon'];
/** Give each square a fun shape, mixed up but the same every time. */
function shapes(list: string[], offset = 0): { sq: string; kind: ShapeKind }[] {
  return list.map((sq, i) => ({ sq, kind: SHAPE_CYCLE[(i + offset) % SHAPE_CYCLE.length] }));
}
const stars = (list: string[]) => list.map((sq) => ({ sq, kind: 'star' as ShapeKind }));
const me = (type: PieceType, sq: string): BoardPiece => ({ type, side: 'w', sq });
const plum = (type: PieceType, sq: string): BoardPiece => ({ type, side: 'b', sq });

// ---------------------------------------------------------------- worlds

export const WORLDS: World[] = [
  {
    id: 'rook', name: 'Rook Castle', piece: 'r', buddy: 'Rocky the Rook', color: '#F97362',
    intro: 'The Rook zooms in straight lines: up, down, left and right, as far as it wants.',
    levels: [
      { id: 'r1', kind: 'collect', title: 'Catch the star', say: 'Hi, I am Rocky! I zoom in straight lines. Move me onto the star!',
        pieces: [me('r', 'a1')], shapes: stars(['a6']) },
      { id: 'r2', kind: 'collect', title: 'Catch all the stars', say: 'Catch every star! You can take as many moves as you need.',
        pieces: [me('r', 'd4')], shapes: stars(['d8', 'h8', 'h2']) },
      { id: 'r3', kind: 'tapAll', title: 'Tap what I can catch', say: 'Tap every shape I could capture in ONE move. Remember, I only go in straight lines!',
        pieces: [me('r', 'd4')], shapes: shapes(['d7', 'g4', 'a4', 'f6', 'b2', 'd1']) },
      { id: 'r4', kind: 'tapAll', title: 'Bushes block the way', say: 'Bushes block my path. Tap every shape I can still reach in one move!',
        pieces: [me('r', 'e5')], shapes: shapes(['e8', 'h5', 'b5', 'e2', 'c7'], 1), bushes: ['e7', 'c5'] },
      { id: 'r5', kind: 'tapAll', title: 'First one wins', say: 'When two shapes are in a line, I stop at the first one. Tap only the ones I can capture!',
        pieces: [me('r', 'c3')], shapes: shapes(['c5', 'c8', 'f3', 'h3', 'a3', 'e6'], 2) },
      { id: 'r6', kind: 'collect', title: 'Capture the plum pieces', say: 'Plum pieces are on the other team. Capture them all!',
        pieces: [me('r', 'b2'), plum('p', 'b7'), plum('n', 'g7'), plum('b', 'g3')] },
    ],
  },
  {
    id: 'bishop', name: 'Bishop Hills', piece: 'b', buddy: 'Bea the Bishop', color: '#A78BFA',
    intro: 'The Bishop slides on diagonals, like a slanted slide. It always stays on its own color.',
    levels: [
      { id: 'b1', kind: 'collect', title: 'Catch the star', say: 'Hello, I am Bea! I slide on diagonals. Slide me onto the star!',
        pieces: [me('b', 'c1')], shapes: stars(['h6']) },
      { id: 'b2', kind: 'collect', title: 'Catch all the stars', say: 'Catch every star! Some take two moves, so plan your slide.',
        pieces: [me('b', 'f1')], shapes: stars(['b5', 'e8', 'h3']) },
      { id: 'b3', kind: 'tapAll', title: 'Tap what I can catch', say: 'Tap every shape I could capture in one move. Diagonals only!',
        pieces: [me('b', 'd4')], shapes: shapes(['g7', 'a7', 'b2', 'f2', 'd7', 'g4']) },
      { id: 'b4', kind: 'tapAll', title: 'Bushes block the way', say: 'A bush stops my slide. Which shapes can I still reach?',
        pieces: [me('b', 'e4')], shapes: shapes(['h7', 'b7', 'b1', 'h1', 'e8'], 3), bushes: ['f5', 'c2'] },
      { id: 'b5', kind: 'tapAll', title: 'Light or dark?', say: 'I stay on my own color forever! Tap only the shapes I can capture in one move.',
        pieces: [me('b', 'c4')], shapes: shapes(['e6', 'f7', 'a6', 'a2', 'd5', 'c6', 'e2'], 1) },
      { id: 'b6', kind: 'collect', title: 'Capture the plum pieces', say: 'Capture every plum piece! Watch the diagonals.',
        pieces: [me('b', 'c1'), plum('r', 'h6'), plum('p', 'd8'), plum('n', 'a3')] },
    ],
  },
  {
    id: 'queen', name: 'Queen Palace', piece: 'q', buddy: 'Queenie', color: '#F472B6',
    intro: 'The Queen is super strong! She moves like a Rook AND a Bishop: straight lines and diagonals.',
    levels: [
      { id: 'q1', kind: 'collect', title: 'Catch the star', say: 'I am Queenie! I go straight AND diagonal. Catch the star!',
        pieces: [me('q', 'h8')], shapes: stars(['f8']) },
      { id: 'q2', kind: 'collect', title: 'Catch all the stars', say: 'Catch every star, as fast as you can!',
        pieces: [me('q', 'd1')], shapes: stars(['h5', 'a5', 'a8', 'e8']) },
      { id: 'q3', kind: 'tapAll', title: 'Tap what I can catch', say: 'Tap every shape I could capture in one move. I have eight directions!',
        pieces: [me('q', 'd5')], shapes: shapes(['d8', 'h1', 'a8', 'a5', 'f4', 'b2', 'g5', 'e7']) },
      { id: 'q4', kind: 'tapAll', title: 'Bushes block the way', say: 'Even a Queen cannot pass a bush. Tap only what I can reach!',
        pieces: [me('q', 'e4')], shapes: shapes(['e8', 'h7', 'a8', 'a4', 'h4', 'b1', 'g2'], 2), bushes: ['e6', 'c6', 'f4'] },
      { id: 'q5', kind: 'collect', title: 'Capture the plum pieces', say: 'Capture all the plum pieces, one move at a time!',
        pieces: [me('q', 'a1'), plum('r', 'a7'), plum('b', 'f6'), plum('n', 'f2'), plum('p', 'c7')] },
    ],
  },
  {
    id: 'king', name: 'King Garden', piece: 'k', buddy: 'King Leo', color: '#FBBF24',
    intro: 'The King is the most important piece. He moves just one square, in any direction.',
    levels: [
      { id: 'k1', kind: 'collect', title: 'Catch the star', say: 'I am King Leo! I take one small step at a time. Walk me to the star!',
        pieces: [me('k', 'b8')], shapes: stars(['c8']) },
      { id: 'k2', kind: 'collect', title: 'A little walk', say: 'Walk me to the star, one step at a time!',
        pieces: [me('k', 'c8')], shapes: stars(['g6']) },
      { id: 'k3', kind: 'tapAll', title: 'Tap what I can catch', say: 'Tap every shape I could capture with ONE little step.',
        pieces: [me('k', 'e4')], shapes: shapes(['e5', 'f3', 'd4', 'e6', 'c4', 'g4', 'd3']) },
      { id: 'k4', kind: 'tapAll', title: 'In the corner', say: 'I am in the corner! Which shapes can I catch with one step?',
        pieces: [me('k', 'h1')], shapes: shapes(['h2', 'g1', 'g2', 'h3', 'f1', 'f3'], 4) },
      { id: 'k5', kind: 'collect', title: 'Capture the plum pieces', say: 'Capture the plum pieces with little steps!',
        pieces: [me('k', 'd2'), plum('p', 'e3'), plum('n', 'f4'), plum('b', 'f5')] },
    ],
  },
  {
    id: 'knight', name: 'Knight Forest', piece: 'n', buddy: 'Nico the Knight', color: '#34D399',
    intro: 'The Knight jumps in an L shape: two squares one way, then one square to the side. It can jump over anything!',
    levels: [
      { id: 'n1', kind: 'collect', title: 'Catch the star', say: 'Neigh! I am Nico. I jump in an L. Jump onto the star!',
        pieces: [me('n', 'b1')], shapes: stars(['c3']) },
      { id: 'n2', kind: 'collect', title: 'Hop, hop, star', say: 'This star takes two jumps. You can do it!',
        pieces: [me('n', 'g1')], shapes: stars(['g5']) },
      { id: 'n3', kind: 'tapAll', title: 'Tap what I can catch', say: 'Tap every shape I could capture with one L-jump!',
        pieces: [me('n', 'd4')], shapes: shapes(['e6', 'f3', 'b5', 'c2', 'd6', 'f4', 'b3']) },
      { id: 'n4', kind: 'tapAll', title: 'Jump over the bushes', say: 'Bushes cannot stop me, I jump right over them! Tap every shape I can catch.',
        pieces: [me('n', 'e5')], shapes: shapes(['f7', 'g4', 'c4', 'd7', 'e7', 'g5'], 2), bushes: ['e6', 'f6', 'f5', 'f4', 'e4', 'd4', 'd5', 'd6'] },
      { id: 'n5', kind: 'tapAll', title: 'Edge of the board', say: 'Near the edge, I have fewer jumps. Find them all!',
        pieces: [me('n', 'a8')], shapes: shapes(['b6', 'c7', 'a6', 'b7', 'c6'], 5) },
      { id: 'n6', kind: 'collect', title: 'Capture the plum pieces', say: 'Capture all the plum pieces with your jumps!',
        pieces: [me('n', 'b1'), plum('p', 'c3'), plum('r', 'e4'), plum('b', 'f6')] },
    ],
  },
  {
    id: 'pawn', name: 'Pawn Village', piece: 'p', buddy: 'Pip the Pawn', color: '#60A5FA',
    intro: 'The Pawn walks straight forward one square (two on its very first move), but it captures diagonally!',
    levels: [
      { id: 'p1', kind: 'collect', title: 'March forward', say: 'I am Pip! I walk straight forward. Walk me to the star!',
        pieces: [me('p', 'e3')], shapes: stars(['e5']) },
      { id: 'p2', kind: 'collect', title: 'Big first step', say: 'On my very first move, I can take two steps! Get to the star.',
        pieces: [me('p', 'd2')], shapes: stars(['d4']) },
      { id: 'p3', kind: 'tapAll', title: 'Diagonal captures', say: 'Pawns capture diagonally forward! Tap every shape I could capture.',
        pieces: [me('p', 'e4')], shapes: shapes(['d5', 'f5', 'e5', 'd3', 'e6']) },
      { id: 'p4', kind: 'collect', title: 'Capture!', say: 'Capture the plum piece. Remember, diagonally!',
        pieces: [me('p', 'f6'), plum('r', 'e7')] },
      { id: 'p5', kind: 'tapAll', title: 'Tricky pawn', say: 'Careful! Tap only the shapes I could capture in one move.',
        pieces: [me('p', 'b2')], shapes: shapes(['a3', 'c3', 'b3', 'b4', 'a1', 'c1'], 3) },
      { id: 'p6', kind: 'collect', title: 'Pawn parade', say: 'Capture both plum pieces, one step at a time!',
        pieces: [me('p', 'c3'), plum('n', 'd4'), plum('b', 'e5')] },
    ],
  },
  {
    id: 'capture', name: 'Capture Cove', piece: 'q', buddy: 'Queenie', color: '#22D3EE',
    intro: 'Capturing means landing on a plum piece to take it off the board. Each piece captures the way it moves (except the sneaky Pawn)!',
    levels: [
      { id: 'c1', kind: 'tapAll', title: 'Rook captures', say: 'Tap every plum piece my Rook could capture in one move!',
        pieces: [me('r', 'd3'), plum('n', 'd7'), plum('b', 'g3'), plum('p', 'f5'), plum('r', 'a3'), plum('q', 'b6')] },
      { id: 'c2', kind: 'tapAll', title: 'Knight captures', say: 'Tap every plum piece my Knight could capture in one jump!',
        pieces: [me('n', 'e4'), plum('p', 'f6'), plum('r', 'c5'), plum('b', 'e6'), plum('q', 'g3'), plum('n', 'd2')] },
      { id: 'c3', kind: 'tapAll', title: 'Bishop captures', say: 'Tap every plum piece my Bishop could capture!',
        pieces: [me('b', 'e3'), plum('r', 'b6'), plum('n', 'h6'), plum('p', 'c1'), plum('q', 'e6'), plum('b', 'g1')] },
      { id: 'c4', kind: 'tapAll', title: 'Pawn captures', say: 'Tap every plum piece my Pawn could capture. Pawns are sneaky!',
        pieces: [me('p', 'e5'), plum('n', 'd6'), plum('r', 'e6'), plum('b', 'f6'), plum('q', 'd4'), plum('p', 'f4')] },
      { id: 'c5', kind: 'tapAll', title: 'Queen captures', say: 'Tap every plum piece my Queen could capture in one move!',
        pieces: [me('q', 'd4'), plum('r', 'd8'), plum('n', 'd6'), plum('b', 'g7'), plum('p', 'b6'), plum('q', 'f3'), plum('k', 'h4')] },
    ],
  },
  {
    id: 'check', name: 'Check Mountain', piece: 'k', buddy: 'King Leo', color: '#FB923C',
    intro: 'Attacking the King is called check! In chess you go after the other King.',
    levels: [
      { id: 'x1', kind: 'check', title: 'Check the King', say: 'Make one move with your Rook to attack the plum King. That is check!',
        pieces: [me('r', 'e8'), plum('k', 'd4')] },
      { id: 'x2', kind: 'check', title: 'Bishop check', say: 'Slide your Bishop to attack the plum King!',
        pieces: [me('b', 'c1'), plum('k', 'e7')] },
      { id: 'x3', kind: 'check', title: 'Knight check', say: 'Jump your Knight to attack the plum King!',
        pieces: [me('n', 'g5'), plum('k', 'd8')] },
      { id: 'x4', kind: 'check', title: 'Queen check', say: 'Use your Queen to put the plum King in check!',
        pieces: [me('q', 'a1'), plum('k', 'f5')] },
      { id: 'x5', kind: 'check', title: 'Pawn check', say: 'Even a Pawn can give check! Remember how pawns capture.',
        pieces: [me('p', 'c5'), plum('k', 'd7')] },
    ],
  },
  {
    id: 'mate', name: 'Checkmate Castle', piece: 'k', buddy: 'King Leo', color: '#E879F9',
    intro: 'Checkmate is when the King is in check and has no way out. That is how you win the game!',
    levels: [
      { id: 'm1', kind: 'mate', title: 'Back row mate', say: 'The plum King is stuck behind his pawns. Find the move that wins!', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1' },
      { id: 'm2', kind: 'mate', title: 'Queen mate', say: 'Use your Queen to checkmate the plum King!', fen: '6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1' },
      { id: 'm3', kind: 'mate', title: 'King and Rook', say: 'Your King blocks the escape. Now let the Rook finish!', fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1' },
      { id: 'm4', kind: 'mate', title: 'Rook ladder', say: 'Two Rooks work together like a ladder. Climb to checkmate!', fen: '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1' },
      { id: 'm5', kind: 'mate', title: 'Queen and King', say: 'Bring the Queen right next to the King, with your King helping!', fen: '7k/8/6K1/8/8/8/1Q6/8 w - - 0 1' },
      { id: 'm6', kind: 'mate', title: 'Sneaky Knight', say: 'The plum King has no room at all. Can the Knight finish it?', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1' },
    ],
  },
];

export function findWorld(id: string): World | undefined {
  return WORLDS.find((w) => w.id === id);
}

/** Goals (targets or black pieces) a piece can no longer reach in any number of moves, from `from`. */
export function unreachableGoals(type: PieceType, from: string, others: { side: string; sq: string; type: PieceType }[], targets: { sq: string }[], bushes?: Set<string>) {
  const goals = [...targets.map((t) => ({ sq: t.sq, name: 'star' })), ...others.filter((p) => p.side === 'b').map((p) => ({ sq: p.sq, name: PIECE_NAMES[p.type] }))];
  const at = (x: string): Occupant => {
    if (targets.some((t) => t.sq === x)) return type === 'p' ? 'empty' : 'shape';
    if (bushes?.has(x)) return 'friend';
    const p = others.find((o) => o.sq === x);
    return !p ? 'empty' : p.side === 'w' ? 'friend' : 'enemy';
  };
  const seen = new Set([from]); const queue = [from]; const hit = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    const rr = reach(type, 'w', cur, at);
    for (const x of [...rr.moves, ...rr.captures]) {
      hit.add(x);
      if (!seen.has(x)) { seen.add(x); queue.push(x); }
    }
  }
  return goals.filter((g) => !hit.has(g.sq));
}
