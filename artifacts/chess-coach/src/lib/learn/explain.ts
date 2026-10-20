// Beginner path -- plain-language explanations with arrows, for students
// who know almost nothing about chess yet. Every "no" says why, and shows
// it on the board: the lines a piece can travel, what's in the way, which
// enemy piece is attacking a square.

import { Chess, type Square, type Move } from 'chess.js';
import { reach, sqToXY, xyToSq, PIECE_NAMES, type Occupant, type PieceType, type Side } from '@/lib/kids/levels';

export type ArrowColor = 'good' | 'bad' | 'info' | 'warn';
export interface Arrow { from: string; to: string; color: ArrowColor; dashed?: boolean; knight?: boolean }
export interface Mark { sq: string; kind: 'x' | 'ring' }
export interface Explained { text: string; arrows: Arrow[]; marks: Mark[] }

const NAME = PIECE_NAMES;
const lower = (t: PieceType) => NAME[t].toLowerCase();

/** One-line rule reminders shown above the board. */
export const RULE: Record<PieceType, string> = {
  r: 'Rook: any number of squares up, down, left or right. Can\'t jump over pieces.',
  b: 'Bishop: any number of squares diagonally. Can\'t jump over pieces.',
  q: 'Queen: any number of squares in any straight line or diagonal. Can\'t jump.',
  n: 'Knight: an L-shape, 2 squares then 1 to the side. Jumps over anything.',
  k: 'King: one square in any direction. Never onto an attacked square.',
  p: 'Pawn: moves 1 forward (2 from its start), captures 1 diagonally forward.',
};

/** Arrows showing every way a piece can travel from `from`. */
export function moveArrows(type: PieceType, side: Side, from: string, at: (sq: string) => Occupant, color: ArrowColor = 'info'): Arrow[] {
  const r = reach(type, side, from, at);
  const out: Arrow[] = [];
  if (type === 'n') {
    for (const ray of r.rays) if (ray[0]) out.push({ from, to: ray[0], color, knight: true });
    return out;
  }
  if (type === 'p') {
    const [fx, fy] = sqToXY(from);
    const dir = side === 'w' ? 1 : -1;
    const fwd = r.rays[0];
    if (fwd?.length) out.push({ from, to: fwd[fwd.length - 1], color });
    for (const dx of [-1, 1]) {
      const sq = xyToSq(fx + dx, fy + dir);
      if (sq) out.push({ from, to: sq, color: r.captures.has(sq) ? 'good' : color, dashed: !r.captures.has(sq) });
    }
    return out;
  }
  for (const ray of r.rays) if (ray.length) out.push({ from, to: ray[ray.length - 1], color });
  return out;
}

/** What kind of line connects two squares, if any. */
function lineName(from: string, to: string): string | null {
  const [fx, fy] = sqToXY(from); const [tx, ty] = sqToXY(to);
  if (fx === tx) return `${from[0]}-file (column)`;
  if (fy === ty) return `${from[1]}${['st', 'nd', 'rd'][Number(from[1]) - 1] ?? 'th'} rank (row)`;
  if (Math.abs(tx - fx) === Math.abs(ty - fy)) return 'diagonal';
  return null;
}

function onPieceLine(type: PieceType, from: string, to: string) {
  const [fx, fy] = sqToXY(from); const [tx, ty] = sqToXY(to);
  const straight = fx === tx || fy === ty;
  const diag = Math.abs(tx - fx) === Math.abs(ty - fy);
  return (type === 'r' && straight) || (type === 'b' && diag) || (type === 'q' && (straight || diag));
}

/**
 * Why a piece can (or can't) capture/reach `target` in one move.
 * `what` names the thing on the target square ("target", "black Rook").
 */
export function explainReach(type: PieceType, from: string, target: string, at: (sq: string) => Occupant,
  opts: { ok: boolean; what: string; whatAt?: (sq: string) => string; isKing?: boolean }): Explained {
  const n = NAME[type];
  if (opts.isKing) {
    return {
      text: 'Kings can never be captured. Attacking the King is called "check", and the player has to get out of it on their next move. So the King is never one of the answers here.',
      arrows: opts.ok ? [{ from, to: target, color: 'warn' }] : [], marks: [{ sq: target, kind: 'ring' }],
    };
  }
  const [fx, fy] = sqToXY(from); const [tx, ty] = sqToXY(target);
  const dx = tx - fx, dy = ty - fy;

  if (opts.ok) {
    const how = type === 'n' ? 'exactly one L-jump away (2 squares, then 1 to the side)'
      : type === 'k' ? 'right next to the King'
      : type === 'p' ? 'one square diagonally forward, which is how Pawns capture'
      : `on the same ${lineName(from, target)}, with nothing in between`;
    return { text: `Yes. ${target} is ${how}.`, arrows: [{ from, to: target, color: 'good', knight: type === 'n' }], marks: [] };
  }

  const all = moveArrows(type, 'w', from, at);
  const wrongArrow: Arrow = { from, to: target, color: 'bad', dashed: true, knight: false };

  if (type === 'p') {
    if (dx === 0 && dy > 0) {
      return {
        text: `Pawns are unusual: they MOVE straight forward but CAPTURE diagonally. Something standing directly in front (${target}) just blocks the Pawn; it can't take it. The green diagonal arrows show where this Pawn can capture.`,
        arrows: all, marks: [{ sq: target, kind: 'x' }],
      };
    }
    if (dy <= 0) return { text: 'Pawns can never move backwards or sideways. They only go forward, and capture one square diagonally forward (the diagonal arrows).', arrows: all, marks: [{ sq: target, kind: 'x' }] };
    return { text: `A Pawn captures only one square diagonally forward, never further. ${target} is too far away. The diagonal arrows show its two capture squares.`, arrows: all, marks: [{ sq: target, kind: 'x' }] };
  }

  if (type === 'n') {
    return {
      text: `A Knight jumps in an L: 2 squares in a straight line, then 1 square to the side. The arrows show all of its landing squares from ${from}. ${target} isn't one of them.`,
      arrows: all, marks: [{ sq: target, kind: 'x' }],
    };
  }

  if (type === 'k') {
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      text: `The King moves only ONE square at a time, in any direction (arrows). ${target} is ${dist} squares away.`,
      arrows: all, marks: [{ sq: target, kind: 'x' }],
    };
  }

  // sliders: rook, bishop, queen
  if (onPieceLine(type, from, target)) {
    const sx = Math.sign(dx), sy = Math.sign(dy);
    let prev = from;
    for (let i = 1; ; i++) {
      const sq = xyToSq(fx + sx * i, fy + sy * i);
      if (!sq || sq === target) break;
      const o = at(sq);
      if (o === 'empty') { prev = sq; continue; }
      const line = lineName(from, target);
      if (o === 'friend' || o === 'bush') {
        return {
          text: `${target} is on the ${n}'s ${line}, but your own piece on ${sq} is in the way. Only the Knight can jump over pieces, and you can't capture your own piece, so the ${n} has to stop on ${prev === from ? 'its own square' : prev}.`,
          arrows: [...(prev !== from ? [{ from, to: prev, color: 'good' as ArrowColor }] : []), { from: sq, to: target, color: 'bad', dashed: true }],
          marks: [{ sq, kind: 'x' }],
        };
      }
      const blocker = opts.whatAt?.(sq) ?? 'piece';
      return {
        text: `${target} is on the ${n}'s ${line}, but the ${blocker} on ${sq} comes first. A ${n} stops on the first piece it meets. It could capture ${sq}, but it can't go past it to reach ${target} in the same move.`,
        arrows: [{ from, to: sq, color: 'good' }, { from: sq, to: target, color: 'bad', dashed: true }],
        marks: [],
      };
    }
  }
  const lines = type === 'r' ? 'straight up, down, left or right' : type === 'b' ? 'along diagonals' : 'along straight lines and diagonals';
  return {
    text: `${target} isn't on any of the ${n}'s lines. A ${n} only travels ${lines}. The arrows show every direction it can go from ${from}.`,
    arrows: [...all, wrongArrow], marks: [{ sq: target, kind: 'x' }],
  };
}

// ---------------------------------------------------------------- real positions

const pieceName = (g: Chess, sq: string) => {
  const p = g.get(sq as Square);
  return p ? `${p.color === 'w' ? 'white' : 'black'} ${NAME[p.type as PieceType]}` : 'piece';
};

/** Squares of `by`'s pieces attacking `sq`, as if the `ignore` square were empty (e.g. the moving King). */
export function attackersOf(g: Chess, sq: string, by: 'w' | 'b', ignore?: string): string[] {
  try {
    const c = new Chess(g.fen(), { skipValidation: true });
    if (ignore) c.remove(ignore as Square);
    return c.attackers(sq as Square, by) as string[];
  } catch { return []; }
}

export function kingSquare(g: Chess, color: 'w' | 'b'): string | null {
  for (const row of g.board()) for (const c of row) if (c && c.type === 'k' && c.color === color) return c.square as string;
  return null;
}

/** The pieces giving check right now, as red arrows into the King. */
export function checkArrows(g: Chess): { arrows: Arrow[]; text: string } {
  const color = g.turn();
  const k = kingSquare(g, color);
  if (!k || !g.inCheck()) return { arrows: [], text: '' };
  const by = color === 'w' ? 'b' : 'w';
  const att = attackersOf(g, k, by);
  const arrows = att.map((a) => ({ from: a, to: k, color: 'bad' as ArrowColor, knight: g.get(a as Square)?.type === 'n' }));
  const who = att.map((a) => `the ${pieceName(g, a)} on ${a}`).join(' and ');
  return { arrows, text: `Your King on ${k} is in check: ${who} attacks it (red arrow).` };
}

/** Why the King can't step on `sq` (attacked), with the attackers drawn. */
export function explainKingSquare(g: Chess, kingFrom: string, sq: string): Explained {
  const [fx, fy] = sqToXY(kingFrom); const [tx, ty] = sqToXY(sq);
  if (Math.max(Math.abs(tx - fx), Math.abs(ty - fy)) > 1) {
    return { text: `The King moves only one square at a time. ${sq} is too far.`, arrows: [], marks: [{ sq, kind: 'x' }] };
  }
  const own = g.get(sq as Square);
  if (own && own.color === g.get(kingFrom as Square)?.color) {
    return { text: `${sq} has your own piece on it. You can't move onto (or capture) your own pieces.`, arrows: [], marks: [{ sq, kind: 'x' }] };
  }
  const by = g.get(kingFrom as Square)?.color === 'w' ? 'b' : 'w';
  const att = attackersOf(g, sq, by, kingFrom);
  if (!att.length) return { text: `The King can't go to ${sq} right now.`, arrows: [], marks: [{ sq, kind: 'x' }] };
  const who = att.map((a) => `the ${pieceName(g, a)} on ${a}`).join(' and ');
  return {
    text: `${sq} is attacked by ${who} (red arrow${att.length > 1 ? 's' : ''}). A King may never step onto a square an enemy piece attacks. That would be walking into check, which is against the rules.`,
    arrows: att.map((a) => ({ from: a, to: sq, color: 'bad' as ArrowColor, knight: g.get(a as Square)?.type === 'n' })),
    marks: [{ sq, kind: 'x' }],
  };
}

/** Why castling isn't allowed right now (when the student taps g1/c1). */
export function explainNoCastle(g: Chess, side: 'k' | 'q'): Explained | null {
  const rank = g.turn() === 'w' ? '1' : '8';
  const by = g.turn() === 'w' ? 'b' : 'w';
  const king = 'e' + rank;
  if (g.get(king as Square)?.type !== 'k') return null;
  const path = side === 'k' ? ['f' + rank, 'g' + rank] : ['d' + rank, 'c' + rank];
  const between = side === 'k' ? ['f' + rank, 'g' + rank] : ['d' + rank, 'c' + rank, 'b' + rank];
  if (g.inCheck()) {
    const c = checkArrows(g);
    return { text: `You can't castle while your King is in check. ${c.text}`, arrows: c.arrows, marks: [] };
  }
  const blocked = between.find((s) => g.get(s as Square));
  if (blocked) return { text: `You can't castle: there's a piece on ${blocked}. Every square between the King and the Rook must be empty.`, arrows: [], marks: [{ sq: blocked, kind: 'x' }] };
  for (const s of path) {
    const att = attackersOf(g, s, by);
    if (att.length) {
      return {
        text: `You can't castle ${side === 'k' ? 'kingside' : 'queenside'}: the ${pieceName(g, att[0])} on ${att[0]} attacks ${s} (red arrow), a square the King would ${s === path[1] ? 'land on' : 'pass through'}. The King may not castle out of, through, or into check.`,
        arrows: att.map((a) => ({ from: a, to: s, color: 'bad' as ArrowColor })), marks: [{ sq: s, kind: 'x' }],
      };
    }
  }
  return { text: 'Castling isn\'t allowed here: the King or that Rook has already moved.', arrows: [], marks: [] };
}

/** After a move: which enemy pieces does the moved piece now attack? (forks, double attacks) */
export function attackedTargets(g: Chess, sq: string): { arrows: Arrow[]; names: string[] } {
  const p = g.get(sq as Square);
  if (!p) return { arrows: [], names: [] };
  const arrows: Arrow[] = []; const names: string[] = [];
  for (const row of g.board()) for (const c of row) {
    if (!c || c.color === p.color || c.type === 'p') continue;
    if (attackersOf(g, c.square, p.color).includes(sq)) {
      arrows.push({ from: sq, to: c.square, color: c.type === 'k' ? 'bad' : 'good', knight: p.type === 'n' });
      names.push(`the ${c.type === 'k' ? 'King' : NAME[c.type as PieceType]} on ${c.square}`);
    }
  }
  return { arrows, names };
}

/** After a wrong move: can the opponent simply take the piece that moved? */
export function recapture(g: Chess, m: Move): Explained | null {
  const reply = g.moves({ verbose: true }).find((x) => x.to === m.to && x.captured);
  if (!reply) return null;
  return {
    text: `Black can just capture it: ${reply.san} (red arrow).`,
    arrows: [{ from: reply.from, to: reply.to, color: 'bad', knight: reply.piece === 'n' }], marks: [],
  };
}

/** After a non-mating move: how does Black's King get out? */
export function escapes(g: Chess): Explained {
  const k = kingSquare(g, 'b');
  const ms = g.moves({ verbose: true });
  if (g.isStalemate() && k) {
    return {
      text: `Stalemate. Black isn't in check, but has no legal move at all: every square around the King on ${k} is covered. That is a DRAW, not a win. Checkmate needs check AND no escape.`,
      arrows: [], marks: [{ sq: k, kind: 'ring' }],
    };
  }
  if (!g.inCheck()) {
    return { text: 'That isn\'t check: nothing attacks the black King, so Black can just play on. Checkmate always starts with check.', arrows: [], marks: k ? [{ sq: k, kind: 'ring' }] : [] };
  }
  const arrows: Arrow[] = ms.slice(0, 4).map((m) => ({ from: m.from, to: m.to, color: 'warn' as ArrowColor, knight: m.piece === 'n' }));
  const how = ms.slice(0, 3).map((m) => m.san).join(', ');
  return {
    text: `Check, but not checkmate: Black can escape with ${how} (orange arrow${ms.length > 1 ? 's' : ''}). Checkmate means the King has no way out at all.`,
    arrows, marks: [],
  };
}

export { lower, pieceName };
