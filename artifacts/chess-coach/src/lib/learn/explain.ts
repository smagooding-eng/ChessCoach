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
  opts: { ok: boolean; what: string; whatAt?: (sq: string) => string; isKing?: boolean; guides?: boolean }): Explained {
  const guides = opts.guides !== false;
  const g = (t: string) => (guides ? t : '');
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

  const all = guides ? moveArrows(type, 'w', from, at) : [];
  const wrongArrow: Arrow = { from, to: target, color: 'bad', dashed: true, knight: false };

  if (type === 'p') {
    if (dx === 0 && dy > 0) {
      return {
        text: `Pawns are unusual: they MOVE straight forward but CAPTURE diagonally. Something standing directly in front (${target}) just blocks the Pawn; it can't take it.${g(' The green diagonal arrows show where this Pawn can capture.')}`,
        arrows: all, marks: [{ sq: target, kind: 'x' }],
      };
    }
    if (dy <= 0) return { text: `Pawns can never move backwards or sideways. They only go forward, and capture one square diagonally forward${g(' (the diagonal arrows)')}.`, arrows: all, marks: [{ sq: target, kind: 'x' }] };
    return { text: `A Pawn captures only one square diagonally forward, never further. ${target} is too far away.${g(' The diagonal arrows show its two capture squares.')}`, arrows: all, marks: [{ sq: target, kind: 'x' }] };
  }

  if (type === 'n') {
    return {
      text: `A Knight jumps in an L: 2 squares in a straight line, then 1 square to the side.${g(` The arrows show all of its landing squares from ${from}.`)} ${target} isn't one of them.`,
      arrows: all, marks: [{ sq: target, kind: 'x' }],
    };
  }

  if (type === 'k') {
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      text: `The King moves only ONE square at a time, in any direction${g(' (arrows)')}. ${target} is ${dist} squares away.`,
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
    text: `${target} isn't on any of the ${n}'s lines. A ${n} only travels ${lines}.${g(` The arrows show every direction it can go from ${from}.`)}`,
    arrows: guides ? [...all, wrongArrow] : [], marks: [{ sq: target, kind: 'x' }],
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

/**
 * After checkmate: why the King can't get out. Covers all three escapes:
 * every square around the King (own piece in the way, or attacked, with
 * the attacker drawn), blocking the check, and capturing the checker.
 */
export function whyMate(g: Chess): Explained {
  const color = g.turn();               // the side that is mated
  const by = color === 'w' ? 'b' : 'w';
  const k = kingSquare(g, color);
  if (!k) return { text: '', arrows: [], marks: [] };
  const checkers = attackersOf(g, k, by);
  const checkArrowsList: Arrow[] = checkers.map((a) => ({ from: a, to: k, color: 'bad' as ArrowColor, knight: g.get(a as Square)?.type === 'n' }));
  const arrows: Arrow[] = [];
  const marks: Mark[] = [];

  const own: string[] = [];
  const covered = new Map<string, string[]>(); // attacker -> squares
  const [kx, ky] = sqToXY(k);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    const sq = xyToSq(kx + dx, ky + dy);
    if (!sq) continue;
    const p = g.get(sq as Square);
    if (p && p.color === color) { own.push(sq); marks.push({ sq, kind: 'ring' }); continue; }
    const att = attackersOf(g, sq, by, k);
    if (att.length) {
      marks.push({ sq, kind: 'x' });
      for (const a of att) covered.set(a, [...(covered.get(a) ?? []), sq]);
    }
  }
  const dist = (a: string, b: string) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
  for (const [a, sqs] of covered) {
    const far = sqs.reduce((m, q) => (dist(a, q) > dist(a, m) ? q : m), sqs[0]);
    arrows.push({ from: a, to: far, color: 'warn', dashed: true, knight: g.get(a as Square)?.type === 'n' });
  }

  const lines: string[] = [];
  if (own.length) lines.push(`${own.join(', ')}: blocked by Black's own pieces (circled).`);
  for (const [a, sqs] of covered) lines.push(`${sqs.join(', ')}: covered by your ${NAME[g.get(a as Square)!.type as PieceType]} on ${a} (dotted arrow).`);
  if (kx === 0 || kx === 7 || ky === 0 || ky === 7) lines.push('The edge of the board takes away the rest.');

  if (checkers.length === 1) {
    const c = checkers[0];
    const cp = g.get(c as Square)!;
    const [cx, cy] = sqToXY(c);
    const adjacent = Math.max(Math.abs(cx - kx), Math.abs(cy - ky)) === 1;
    if (cp.type === 'n') lines.push('Block? A Knight\'s check jumps, so it can\'t be blocked.');
    else if (adjacent) lines.push(`Block? The ${NAME[cp.type as PieceType]} is right next to the King, so there's no gap to block.`);
    else {
      const between: string[] = [];
      const sx = Math.sign(kx - cx), sy = Math.sign(ky - cy);
      for (let i = 1; ; i++) { const s = xyToSq(cx + sx * i, cy + sy * i); if (!s || s === k) break; between.push(s); }
      lines.push(`Block? No black piece can move onto ${between.join(' or ')}.`);
    }
    const takers = attackersOf(g, c, color);
    if (!takers.length) lines.push(`Capture? Nothing black can reach the ${NAME[cp.type as PieceType]} on ${c}.`);
    else {
      const guard = attackersOf(g, c, by);
      lines.push(guard.length
        ? `Capture? The King could take the ${NAME[cp.type as PieceType]}, but it's protected by your ${NAME[g.get(guard[0] as Square)!.type as PieceType]} on ${guard[0]}, so that would be moving into check.`
        : `Capture? It can't be captured legally.`);
      for (const gd of guard) arrows.push({ from: gd, to: c, color: 'good', knight: g.get(gd as Square)?.type === 'n' });
    }
  } else if (checkers.length > 1) {
    lines.push('Double check: two pieces attack at once, so blocking or capturing one still leaves the other. Only a King move could help, and there isn\'t one.');
  }
  // the check line goes on top so it stays visible
  return { text: `Why it's checkmate:\n• ${lines.join('\n• ')}`, arrows: [...arrows, ...checkArrowsList], marks };
}
