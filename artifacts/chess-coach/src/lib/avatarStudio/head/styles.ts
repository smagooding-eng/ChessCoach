// Hair, facial hair, clothing and accessories as distance fields, fitted to the head's shape.
// Each style is real geometry generated for this head, not a sticker: it follows the skull,
// jaw and settings, and is meshed like the head (mesher.ts).

import { anatomy, headField, type FaceShape, type Field } from './sdf';

export type HairStyle = 'short' | 'sidepart' | 'quiff' | 'buzz' | 'curly' | 'long' | 'bob' | 'bun' | 'afro' | 'bald';
export type BeardStyle = 'none' | 'stubble' | 'short' | 'full' | 'goatee';
export type MustacheStyle = 'none' | 'classic' | 'handlebar';
export type Outfit = 'tee' | 'hoodie' | 'jacket' | 'collar' | 'sweater';
export type Headwear = 'none' | 'cap' | 'beanie';

const smin = (a: number, b: number, k: number) => { const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k)); return b + (a - b) * h - k * h * (1 - h); };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
const ell = (x: number, y: number, z: number, c: number[], r: number[]) => {
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
  return (Math.sqrt(px * px + py * py + pz * pz) - 1) * Math.min(r[0], r[1], r[2]);
};
const cap = (x: number, y: number, z: number, a: number[], b: number[], r: number) => {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2], bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
};

/** Where hair grows: above a hairline that sits high on the forehead and low at the nape. */
function hairline(s: FaceShape, x: number, y: number, z: number, front = 0.42, back = -0.45) {
  const a = anatomy(s);
  const fz = Math.max(0, Math.min(1, (z + 0.2) / 1.0)); // 0 at the back .. 1 at the front
  const line = back + (front - back) * fz ** 1.4;
  // hair comes down a little by the ears (smoothly)
  const sideburn = -0.18 * Math.max(0, Math.min(1, (Math.abs(x) - 0.7 * a.hw) / (0.2 * a.hw))) * Math.exp(-((z - 0.0) ** 2) / 0.08);
  return line + sideburn - y; // < 0 where hair grows
}

/** Strands: shallow grooves running along the hair, so it reads as styled locks, not a helmet. */
const lockPhase = (x: number, y: number, z: number, density: number, sweep = 0) => Math.atan2(x, z) * density * 0.5 + Math.sin(y * 4) * 0.9 + sweep * y;
function grooves(x: number, y: number, z: number, density = 12, depth = 0.03, sweep = 0) {
  // narrow partings between broad, rounded locks (the sculpted look of animated-film hair)
  const w = Math.abs(Math.sin(lockPhase(x, y, z, density, sweep)));
  return depth * (1 - w) ** 2.2;
}
/** How far each lock's rounded tip hangs below the hairline (0 in the partings). */
function lockTips(x: number, y: number, z: number, density: number, sweep = 0) {
  const t = Math.abs(Math.sin(lockPhase(x, y, z, density, sweep)));
  return 1 - (1 - t) ** 3; // broad rounded tips, narrow gaps
}

export function hairField(s: FaceShape, style: HairStyle, capped = false): Field | null {
  if (style === 'bald') return null;
  const head = headField(s), A = anatomy(s);
  const thick = { short: 0.07, sidepart: 0.08, quiff: 0.07, buzz: 0.04, curly: 0.12, long: 0.08, bob: 0.09, bun: 0.07, afro: 0.3 }[style];
  return (x, y, z) => {
    const h = head(x, y, z);
    let d = h - thick; // a shell the hair's thickness outside the scalp
    d = Math.max(d, -h - 0.004); // not inside the head
    const density = style === 'long' ? 16 : 13, sweep = style === 'sidepart' ? 3 : style === 'short' ? 1.2 : 0;
    const fringe = ({ short: 0.1, sidepart: 0.13, quiff: 0, bob: 0.14, long: 0.12, bun: 0.05, curly: 0.06 } as Record<string, number>)[style] ?? 0;
    const tips = fringe ? fringe * lockTips(x, y, z, density, sweep) * Math.max(0, Math.min(1, (z + 0.1) / 0.6)) : 0;
    d = smax(d, hairline(s, x, y, z, style === 'buzz' ? 0.6 : style === 'quiff' ? 0.68 : style === 'bob' || style === 'long' ? 0.5 : 0.58, style === 'long' || style === 'bob' ? -0.6 : -0.42) - tips, 0.04);
    if (!capped && style === 'sidepart') d = smin(d, smax(ell(x, y, z, [-0.12, 1.0 * A.hh, 0.3], [0.8, 0.28, 0.52]), -h - 0.01, 0.02), 0.14); // swept volume
    if (!capped && style === 'short') d = smin(d, smax(ell(x, y, z, [0, 1.04 * A.hh, 0.15], [0.72, 0.22, 0.56]), -h - 0.01, 0.02), 0.14);
    if (!capped && style === 'quiff') d = smin(d, ell(x, y, z, [0.02, 1.22 * A.hh, 0.52], [0.5, 0.32, 0.42]), 0.18);
    if (!capped && style === 'bun') d = smin(d, ell(x, y, z, [0, 1.3 * A.hh, -0.62], [0.3, 0.28, 0.3]), 0.1);
    if (style === 'long' || style === 'bob') {
      const len = style === 'long' ? -1.55 : -0.8;
      // a curtain of hair behind and beside the face, down to the shoulders (or the jaw for a bob)
      let fall = ell(x, y, z, [0, (0.6 + len) / 2, -0.28], [1.02 * A.hw, (0.6 - len) / 2 + 0.1, 0.86]);
      fall = smax(fall, -h - 0.025, 0.03);                                  // sits on the head, never inside
      fall = smax(fall, z - 0.08 + Math.max(0, Math.abs(x) - 0.72) * 0.9 - Math.max(0, y - 0.1) * 0.6, 0.06); // open in front of the face
      fall = smax(fall, y - 0.55, 0.05);
      d = smin(d, fall, 0.1);
    }
    if (style === 'curly' || style === 'afro') {
      // tight curls: a bumpy surface
      d += (Math.sin(x * 15 + Math.sin(z * 7)) * Math.sin(y * 15 + Math.sin(x * 6)) * Math.sin(z * 15 + Math.sin(y * 5))) * (style === 'afro' ? 0.04 : 0.028);
    } else if (style !== 'buzz') d += grooves(x, y, z, density, 0.024, sweep);
    return d;
  };
}

export function beardField(s: FaceShape, beard: BeardStyle, mustache: MustacheStyle): Field | null {
  if ((beard === 'none' || beard === 'stubble') && mustache === 'none') return null;
  const head = headField(s), A = anatomy(s);
  return (x, y, z) => {
    const h = head(x, y, z);
    let d = 1;
    if (beard === 'full' || beard === 'short') {
      const t = beard === 'full' ? 0.065 : 0.035;
      let b = Math.max(h - t, -h - 0.003);
      const side = Math.max(0, Math.min(1, (Math.abs(x) - 0.35) / 0.45));
      b = smax(b, y - (A.mouthY + 0.1 + side * side * side * 0.5), 0.05); // just above the mouth in front, up to the sideburns at the sides
      b = smax(b, -z - 0.35, 0.05); // front and sides only
      b = smax(b, -(y + 1.22), 0.05); // stops at the top of the neck
      // keep the lips clear
      b = smax(b, -ell(x, y, z, [0, A.mouthY - 0.01, 0.92], [A.mouthW * 1.18, A.lip * 1.9, 0.32]), 0.03);
      if (beard === 'full') { b = smin(b, smax(ell(x, y, z, [0, A.chinY - 0.02, 0.42], [0.32, 0.18, 0.24]), -h - 0.01, 0.02), 0.1); b += grooves(x, y * 2, z, 40, 0.009); }
      d = b;
    }
    if (beard === 'goatee') {
      let g = Math.max(h - 0.05, -h - 0.003);
      g = smax(g, ell(x, y, z, [0, A.mouthY - 0.28, 0.75], [A.mouthW * 0.75, 0.26, 0.4]), 0.05);
      g = smax(g, -ell(x, y, z, [0, A.mouthY - 0.01, 0.9], [A.mouthW * 1.05, A.lip * 1.4, 0.3]), 0.03);
      d = smin(d, g + grooves(x, y * 2, z, 40, 0.006), 0.02);
    }
    if (mustache !== 'none') {
      let m = Math.max(h - 0.055, -h - 0.003);
      m = smax(m, ell(x, y, z, [0, A.mouthY + 0.085, 0.86], [A.mouthW * (mustache === 'handlebar' ? 1.35 : 1.1), 0.07, 0.3]), 0.03);
      if (mustache === 'handlebar') for (const sx of [-1, 1]) m = smin(m, cap(x, y, z, [sx * A.mouthW * 1.2, A.mouthY + 0.07, 0.8], [sx * A.mouthW * 1.55, A.mouthY + 0.16, 0.7], 0.028), 0.04);
      d = smin(d, m + grooves(x * 1.5, y, z, 50, 0.006), 0.02);
    }
    return d;
  };
}

/** Shoulders and chest, cut away around the neck, with each outfit's details. */
export function outfitField(outfit: Outfit): Field {
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = ell(x, y, z, [0, -2.55, -0.22], [1.5, 0.95, 0.72]); // chest
    d = smin(d, ell(ax, y, z, [1.0, -2.0, -0.22], [0.5, 0.36, 0.5]), 0.4); // shoulders
    d = smin(d, cap(x, y, z, [-0.9, -1.92, -0.22], [0.9, -1.92, -0.22], 0.28), 0.35); // trapezius line
    const neckHole = cap(x, y, z, [0, -1.0, -0.22], [0, -2.0, -0.24], outfit === 'sweater' ? 0.39 : 0.42);
    d = smax(d, -neckHole, 0.06);
    if (outfit === 'tee' || outfit === 'sweater') d = smin(d, smax(Math.abs(cap(x, y, z, [0, -1.48, -0.24], [0, -1.62, -0.24], 0.44)) - 0.04, y + 1.62, 0.02), 0.03); // collar band
    if (outfit === 'hoodie') {
      d = smin(d, ell(x, y, z, [0, -1.25, -0.75], [0.62, 0.5, 0.38]), 0.2); // hood bunched behind the neck
      d = smin(d, smax(Math.abs(cap(x, y, z, [0, -1.4, -0.22], [0, -1.55, -0.22], 0.5)) - 0.07, y + 1.6, 0.03), 0.04);
    }
    if (outfit === 'collar' || outfit === 'jacket') {
      for (const sx of [-1, 1]) d = smin(d, ell(x, y, z, [sx * 0.32, -1.5, 0.08], [0.24, 0.18, 0.08]), 0.06); // collar points
    }
    if (outfit === 'sweater') d += Math.sin(x * 40) * 0.006 * (y < -1.62 ? 1 : 0); // knit ribs
    d += Math.sin(x * 5 + y * 3) * Math.sin(y * 7) * 0.012; // soft folds in the fabric
    return d;
  };
}

export function headwearField(s: FaceShape, kind: Headwear): Field | null {
  if (kind === 'none') return null;
  const head = headField(s), A = anatomy(s);
  return (x, y, z) => {
    const h = head(x, y, z);
    let d = Math.max(h - (kind === 'beanie' ? 0.15 : 0.15), -h - 0.01); // roomy enough to cover the hair
    d = smax(d, (kind === 'beanie' ? 0.36 : 0.42) - y + Math.max(0, -z) * 0.25, 0.04);
    if (kind === 'cap') d = smin(d, smax(ell(x, y + (z - 0.8) * 0.4, z, [0, 0.47, 1.08], [0.7, 0.05, 0.72]), -z + 0.5, 0.02), 0.04); // brim, tipped down a little
    if (kind === 'beanie') { d = smin(d, smax(Math.abs(h - 0.16) - 0.035, Math.abs(y - 0.46) - 0.09, 0.02), 0.02); d += Math.sin(Math.atan2(x, z) * 60) * 0.006; }
    return d;
  };
}
