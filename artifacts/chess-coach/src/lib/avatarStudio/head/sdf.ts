// The character's head as a signed distance field (negative inside), sculpted from smooth
// blended forms. Every face setting in the studio is a number that moves, sizes or blends
// one of these forms, so the head is regenerated from the settings (see mesher.ts).
// Units: about 1 = half the head's width. +y up, +z toward the viewer.

export interface FaceShape {
  headWidth: number;    // 0..1
  headHeight: number;   // 0..1
  jaw: number;          // 0 narrow/pointed .. 1 wide/square
  chin: number;         // 0 small .. 1 strong
  cheeks: number;       // 0 flat .. 1 full
  eyeSize: number;      // 0 small .. 1 big
  eyeSpacing: number;   // 0 close .. 1 wide
  eyeHeight: number;    // 0 low .. 1 high
  noseSize: number;     // 0 small .. 1 big
  noseWidth: number;    // 0 narrow .. 1 wide
  noseLength: number;   // 0 short .. 1 long
  mouthWidth: number;   // 0 .. 1
  lipFullness: number;  // 0 thin .. 1 full
  earSize: number;      // 0 .. 1
  browHeight: number;   // 0 low .. 1 high
}

export const DEFAULT_SHAPE: FaceShape = {
  headWidth: 0.5, headHeight: 0.5, jaw: 0.45, chin: 0.5, cheeks: 0.55,
  eyeSize: 0.55, eyeSpacing: 0.5, eyeHeight: 0.5,
  noseSize: 0.45, noseWidth: 0.5, noseLength: 0.5,
  mouthWidth: 0.5, lipFullness: 0.5, earSize: 0.5, browHeight: 0.5,
};

const L = (a: number, b: number, k: number) => a + (b - a) * k;

/** Where the face's parts are, after the shape settings (shared by the mesh and its parts). */
export function anatomy(s: FaceShape) {
  // animated-film proportions: a big rounded cranium, large eyes set a little below the middle
  // of the head, a small button nose, full cheeks and a small soft chin
  const hw = L(0.9, 1.02, s.headWidth), hh = L(0.95, 1.08, s.headHeight);
  const eyeR = L(0.2, 0.27, s.eyeSize);
  const eyeX = L(0.33, 0.42, s.eyeSpacing), eyeY = L(-0.12, 0.02, s.eyeHeight);
  const mouthY = -0.52 + (s.headHeight - 0.5) * -0.05;
  return {
    hw, hh, eyeR, eyeX, eyeY,
    eyeZ: 0.6 + (1 - s.eyeSpacing) * 0.03,
    browY: eyeY + eyeR + L(0.05, 0.13, s.browHeight),
    noseTipY: L(-0.2, -0.3, s.noseLength), noseTipZ: 0.96 + s.noseSize * 0.05,
    noseR: L(0.075, 0.12, s.noseSize), noseW: L(0.85, 1.25, s.noseWidth),
    mouthY, mouthW: L(0.19, 0.29, s.mouthWidth), lip: L(0.045, 0.08, s.lipFullness),
    chinY: -0.92 * hh,
    earS: L(0.8, 1.2, s.earSize),
  };
}

// ── primitives ──
type V = [number, number, number];
const ellipsoid = (x: number, y: number, z: number, c: V, r: V) => {
  // fast, close-enough ellipsoid distance (scaled by the smallest radius)
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
  const k = Math.sqrt(px * px + py * py + pz * pz);
  return (k - 1) * Math.min(r[0], r[1], r[2]);
};
const capsule = (x: number, y: number, z: number, a: V, b: V, r: number) => {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2], bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
};
const smin = (a: number, b: number, k: number) => { const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k)); return b + (a - b) * h - k * h * (1 - h); };
const ssub = (a: number, b: number, k: number) => -smin(-a, b, k); // carve b out of a

export type Field = (x: number, y: number, z: number) => number;

/** The head (with neck) for these settings. */
export function headField(s: FaceShape): Field {
  const A = anatomy(s);
  const jawW = L(0.44, 0.7, s.jaw), chinR = L(0.17, 0.26, s.chin), cheek = L(0.2, 0.29, s.cheeks);
  const lipY = A.mouthY, lipZ = 0.9;
  return (x, y, z) => {
    const ax = Math.abs(x);
    // skull, forehead and the face's mass: a big rounded cranium over a compact face
    let d = ellipsoid(x, y, z, [0, 0.26 * A.hh, -0.1], [0.98 * A.hw, 1.06 * A.hh, 1.02]);
    d = smin(d, ellipsoid(x, y, z, [0, 0.42 * A.hh, 0.34], [0.78 * A.hw, 0.56, 0.54]), 0.32);
    d = smin(d, ellipsoid(x, y, z, [0, -0.3 * A.hh, 0.2], [0.74 * A.hw, 0.64 * A.hh, 0.7]), 0.36);
    // soft jaw, small round chin, full apple cheeks, the muzzle around the mouth
    d = smin(d, ellipsoid(ax, y, z, [jawW * 0.46, -0.6 * A.hh, 0.16], [0.3, 0.28, 0.4]), 0.32);
    d = smin(d, ellipsoid(x, y, z, [0, A.chinY + 0.1, 0.46 + s.chin * 0.05], [chinR, 0.15, 0.2]), 0.22);
    d = smin(d, ellipsoid(ax, y, z, [0.44 * A.hw, -0.3, 0.5], [cheek + 0.08, cheek, cheek]), 0.24);
    d = smin(d, ellipsoid(x, y, z, [0, lipY + 0.02, 0.64], [0.3, 0.22, 0.26]), 0.2);
    // brow ridge, then the eye sockets
    d = smin(d, ellipsoid(ax, y, z, [A.eyeX, A.browY - 0.03, 0.68], [0.22, 0.075, 0.13]), 0.13);
    d = ssub(d, ellipsoid(ax, y, z, [A.eyeX, A.eyeY, A.eyeZ + 0.03], [A.eyeR * 1.18, A.eyeR * 1.08, A.eyeR * 1.15]), 0.06);
    // nose: bridge, tip, wings, nostrils
    const tz = A.noseTipZ + 0.06;
    d = smin(d, capsule(x, y, z, [0, A.eyeY - 0.02, 0.74], [0, A.noseTipY + 0.05, tz - 0.07], 0.04 + s.noseSize * 0.02), 0.12);
    d = smin(d, ellipsoid(x, y, z, [0, A.noseTipY, tz - 0.04], [A.noseR * A.noseW * 0.85, A.noseR * 0.8, A.noseR * 0.82]), 0.12);
    d = smin(d, ellipsoid(ax, y, z, [0.09 * A.noseW + 0.025, A.noseTipY - 0.035, tz - 0.1], [0.07 * A.noseW, 0.06, 0.07]), 0.05);
    d = ssub(d, ellipsoid(ax, y, z, [0.05 * A.noseW + 0.01, A.noseTipY - 0.085, tz - 0.07], [0.028 * A.noseW, 0.016, 0.035]), 0.02);
    // lips: an upper lip with a cupid's bow, a fuller lower lip, the line between them
    d = smin(d, ellipsoid(ax, y, z, [A.mouthW * 0.38, lipY + 0.035, lipZ], [A.mouthW * 0.66, A.lip * 0.7, 0.085]), 0.045);
    d = smin(d, ellipsoid(x, y, z, [0, lipY - 0.05, lipZ - 0.015], [A.mouthW * 0.82, A.lip, 0.09]), 0.05);
    d = ssub(d, ellipsoid(x, y, z, [0, lipY, lipZ + 0.02], [A.mouthW * 1.0, 0.022, 0.2]), 0.02);
    d = ssub(d, ellipsoid(ax, y, z, [A.mouthW * 1.02, lipY, lipZ - 0.02], [0.02, 0.02, 0.05]), 0.03); // corners
    d = ssub(d, ellipsoid(x, y, z, [0, (lipY + A.noseTipY) / 2 - 0.01, lipZ + 0.07], [0.035, 0.06, 0.04]), 0.04); // philtrum
    // ears
    const ec: V = [0.9 * A.hw, A.eyeY - 0.12, -0.12];
    let ear = ellipsoid(ax, y, z, ec, [0.085 * A.earS, 0.22 * A.earS, 0.16 * A.earS]);
    ear = ssub(ear, ellipsoid(ax, y, z, [ec[0] + 0.065, ec[1] - 0.01, ec[2] + 0.03], [0.05 * A.earS, 0.14 * A.earS, 0.09 * A.earS]), 0.03);
    d = smin(d, ear, 0.07);
    // neck
    d = smin(d, capsule(x, y, z, [0, -0.6, -0.22], [0, -1.75, -0.26], 0.33), 0.3);
    return d;
  };
}

export const HEAD_BOUNDS = { min: [-1.25, -1.75, -1.2] as V, max: [1.25, 1.55, 1.3] as V };
