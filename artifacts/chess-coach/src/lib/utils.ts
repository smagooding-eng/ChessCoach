import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Custom piece colors: react-chessboard's stock SVGs hardcode the outline
// (stroke) to black and, for the black knight specifically, the eyes and
// mane-highlight to white -- regardless of whatever fill color is passed
// in. That's invisible when it's wrong: a dark custom piece color on a
// dark board square has no contrasting outline to fall back on (both the
// fill and the fixed black stroke disappear together), and a bright
// custom color like pink or green ends up with a stark, mismatched white
// or black detail slapped on top of it. This computes an outline and a
// softer detail/highlight color from the piece's own chosen color instead
// of a fixed black/white, so both stay visible and cohesive whatever
// color gets picked.
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Blends a color toward white (positive amount) or black (negative
// amount), amount in [-1, 1]. Used instead of a flat gray/white/black so
// the result still reads as a shade of the piece's own color rather than
// an unrelated neutral tacked on top of it.
function blend(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgbToHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
}

// Perceived brightness (0 = black, 255 = white) -- a simpler, faster
// stand-in for true relative luminance, which is plenty precise for
// picking "should the outline go lighter or darker than this."
function perceivedBrightness(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// blend() by percentage breaks down at the extremes: the same 20% blend
// that gives a medium gray a visibly lighter tint gives pure black
// (#000000) only #333333 -- 20% of "not much" is even less. Ensures the
// result is at least minBrightness by blending further toward white if
// the percentage blend alone doesn't reach it, so a pure black or
// near-black custom color still gets a genuinely visible outline/detail
// instead of one that's technically a different hex but reads as the
// same color as the fill.
function blendWithFloor(hex: string, amount: number, minBrightness: number): string {
  const base = blend(hex, amount);
  if (perceivedBrightness(base) >= minBrightness) return base;
  const [r, g, b] = hexToRgb(hex);
  const baseBrightness = perceivedBrightness(hex);
  if (baseBrightness >= minBrightness) return hex;
  const t = (minBrightness - baseBrightness) / (255 - baseBrightness);
  return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

export interface PieceColorScheme {
  outline: string;
  detail: string;
  gradientLight: string;
  gradientDark: string;
}

export function getPieceColorScheme(hex: string): PieceColorScheme {
  const isDark = perceivedBrightness(hex) < 128;
  return {
    // Same reasoning as before, tuned slightly further: even at 50%,
    // combined with the original 1.5 stroke width, this was still
    // reading as too prominent against a busy/textured board. Thinner
    // width (set in remapStyle) plus a little less lightening here.
    // Floors added so this still works for near-black colors specifically
    // -- see blendWithFloor.
    outline: isDark ? blendWithFloor(hex, 0.42, 110) : blend(hex, -0.75),
    // Dark pieces get a lighter tint of their own color for detail lines
    // and eyes; light pieces get a darker one -- a shade of the piece's
    // own color either way, not a fixed black or white.
    //
    // Dark side's detail was still 0.4 here, left over from before the
    // outline-halo fix lowered outline to 0.42 -- that closed the gap
    // between them to just 0.02, which on a neutral/gray custom color
    // (no hue to help tell shades apart) rendered as visually identical,
    // making the whole piece read as "one solid color, no details" even
    // though the detail lines were technically there. Lowered to give a
    // real gap again, similar in proportion to the light side's.
    detail: isDark ? blendWithFloor(hex, 0.2, 70) : blend(hex, -0.5),
    gradientLight: blend(hex, 0.22),
    gradientDark: blend(hex, -0.22),
  };
}

export function normalizeFen(fen: string): string {
  if (!fen) return fen;
  const parts = fen.split(' ');
  if (parts.length < 3) return fen;

  const castling = parts[2];
  if (!castling || castling === '-' || /^[KQkq]+$/.test(castling)) return fen;

  if (!/^[A-Ha-h]+$/.test(castling)) return fen;

  const ranks = parts[0].split('/');
  const whiteBack = ranks[7] || '';
  const blackBack = ranks[0] || '';

  function findKingFile(rank: string): number {
    let file = 0;
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') { file += parseInt(ch); }
      else { if (ch === 'K' || ch === 'k') return file; file++; }
    }
    return -1;
  }

  const wKingFile = findKingFile(whiteBack);
  const bKingFile = findKingFile(blackBack);

  let result = '';
  for (const ch of castling) {
    const file = ch.toLowerCase().charCodeAt(0) - 97;
    if (ch >= 'A' && ch <= 'H') {
      result += file > wKingFile ? 'K' : 'Q';
    } else {
      result += file > bKingFile ? 'k' : 'q';
    }
  }

  const order = (s: string) => {
    const arr = s.split('');
    arr.sort((a, b) => 'KQkq'.indexOf(a) - 'KQkq'.indexOf(b));
    return arr.join('');
  };

  parts[2] = order(result);
  return parts.join(' ');
}
