// Checks for a position read from a photo or set up by hand: what makes it
// impossible (so we can say what to fix instead of a bare "invalid FEN"), the
// castling rights its kings and rooks still allow, and whose move it is.
import { Chess } from 'chess.js';

const placementOf = (fen: string) => fen.split(' ')[0] ?? '';
const count = (placement: string, piece: string) => placement.split(piece).length - 1;

/** Plain-English reasons the position can't be played. Empty when it's fine. */
export function positionProblems(fen: string): string[] {
  const placement = placementOf(fen);
  const out: string[] = [];
  const ranks = placement.split('/');
  if (ranks.length !== 8) return ['The board needs 8 rows.'];
  const K = count(placement, 'K'), k = count(placement, 'k');
  if (K !== 1) out.push(K === 0 ? 'There’s no white king.' : `There are ${K} white kings.`);
  if (k !== 1) out.push(k === 0 ? 'There’s no black king.' : `There are ${k} black kings.`);
  if (/[pP]/.test(ranks[0] ?? '') || /[pP]/.test(ranks[7] ?? '')) out.push('A pawn is on the first or last row. Pawns can’t stand there.');
  if (count(placement, 'P') > 8) out.push('More than 8 white pawns.');
  if (count(placement, 'p') > 8) out.push('More than 8 black pawns.');
  const white = (placement.match(/[KQRBNP]/g) ?? []).length, black = (placement.match(/[kqrbnp]/g) ?? []).length;
  if (white > 16) out.push(`${white} white pieces (16 at most).`);
  if (black > 16) out.push(`${black} black pieces (16 at most).`);
  if (out.length) return out;
  // The side that just moved can't still be in check.
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  try {
    const other = new Chess(`${placement} ${turn === 'w' ? 'b' : 'w'} - - 0 1`, { skipValidation: true } as never);
    if (other.inCheck()) out.push(`${turn === 'w' ? 'Black' : 'White'} is in check, so it must be ${turn === 'w' ? 'Black' : 'White'}’s move.`);
  } catch { /* chess.js below says what's wrong */ }
  if (out.length) return out;
  try { new Chess(withCastling(fen)); } catch (e) { out.push((e as Error).message || 'This position isn’t legal.'); }
  return out;
}

/** The castling rights the kings and rooks on their home squares still allow. */
export function castlingFor(placement: string): string {
  const rows = placement.split('/');
  const expand = (row: string) => row.replace(/\d/g, (d) => '.'.repeat(Number(d)));
  const r1 = expand(rows[7] ?? ''), r8 = expand(rows[0] ?? '');
  let c = '';
  if (r1[4] === 'K') { if (r1[7] === 'R') c += 'K'; if (r1[0] === 'R') c += 'Q'; }
  if (r8[4] === 'k') { if (r8[7] === 'r') c += 'k'; if (r8[0] === 'r') c += 'q'; }
  return c || '-';
}

/** The FEN with castling rights filled in from the board (a photo can't show them). */
export function withCastling(fen: string): string {
  const [placement, turn = 'w'] = fen.split(' ');
  return `${placement} ${turn === 'b' ? 'b' : 'w'} ${castlingFor(placement ?? '')} - 0 1`;
}

/** The same position with the other side to move. */
export function setTurn(fen: string, turn: 'w' | 'b'): string {
  const parts = fen.split(' ');
  return [parts[0], turn, parts[2] ?? '-', '-', parts[4] ?? '0', parts[5] ?? '1'].join(' ');
}
