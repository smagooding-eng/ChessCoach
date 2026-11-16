// Groomed hair: thousands of tapered strands grown over a hair (or beard) surface, following
// the style's flow and lying on the surface in layers. This is what makes hair read as hair
// rather than a sculpted shell. Runs in the mesh worker.

import type { Field } from './sdf';
import type { MeshData } from './mesher';
import { meshField } from './mesher';
import type { HairStyle } from './styles';

type V3 = [number, number, number];
export type StrandStyle = HairStyle | 'beard' | 'mustache';

const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Which way the hair runs at a point (before it's laid onto the surface). k: how far along the strand. */
function flow(style: StrandStyle, p: V3, k: number, seed: number): V3 {
  const [x, y, z] = p;
  const fromCrown = norm([x, y - 1.35, z + 0.15]);
  switch (style) {
    case 'sidepart': { const side = x > -0.3 ? 1 : -1; return y > 0.6 ? norm([side * 0.7, -0.2, z > 0.25 ? 0.75 : -0.7]) : fromCrown; }
    case 'short': return y > 0.75 && z > 0.1 ? norm([0.45, -0.2, 0.8]) : fromCrown;
    case 'quiff': return z > 0.15 && y > 0.55 ? norm([x * 0.2, 1, -0.55]) : fromCrown;
    case 'bun': return norm([-x, 1.3 - y, -0.62 - z]);
    case 'buzz': return fromCrown;
    case 'curly': case 'afro': {
      const a = k * (style === 'afro' ? 2.4 : 1.7) + seed * 6.28;
      return norm([fromCrown[0] + Math.cos(a) * 1.4, fromCrown[1] + Math.sin(a) * 1.4, fromCrown[2] + Math.cos(a * 0.7) * 1.4]);
    }
    case 'beard': return norm([x * 0.15, -1, 0.25]);
    case 'mustache': return norm([Math.sign(x) * 1, -0.5, 0.1]);
    default: return fromCrown; // long, bob
  }
}

const PARAMS: Record<StrandStyle, { count: number; len: number; steps: number; width: number }> = {
  short: { count: 14000, len: 0.4, steps: 8, width: 0.011 }, sidepart: { count: 15000, len: 0.55, steps: 10, width: 0.011 },
  quiff: { count: 15000, len: 0.5, steps: 10, width: 0.011 }, buzz: { count: 16000, len: 0.07, steps: 3, width: 0.007 },
  curly: { count: 13000, len: 0.3, steps: 9, width: 0.011 }, afro: { count: 17000, len: 0.3, steps: 9, width: 0.012 },
  long: { count: 17000, len: 1.5, steps: 18, width: 0.013 }, bob: { count: 16000, len: 0.85, steps: 13, width: 0.012 },
  bun: { count: 15000, len: 0.55, steps: 10, width: 0.011 }, bald: { count: 0, len: 0, steps: 0, width: 0 },
  beard: { count: 11000, len: 0.18, steps: 5, width: 0.009 }, mustache: { count: 2400, len: 0.13, steps: 4, width: 0.008 },
};

export function growStrands(f: Field, style: StrandStyle, min: number[], max: number[], seedN = 1, density = 1): MeshData {
  const P0 = PARAMS[style], P = { ...P0, count: Math.round(P0.count * density), width: P0.width / Math.sqrt(Math.max(0.3, density)) };
  const empty: MeshData = { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) };
  if (!P.count) return empty;
  const e = 0.004;
  const grad = (p: V3): V3 => norm([f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)]);
  const settle = (p: V3, iso: number): V3 => { let q = p; for (let i = 0; i < 3; i++) { const d = f(q[0], q[1], q[2]) - iso; const g = grad(q); q = [q[0] - g[0] * d, q[1] - g[1] * d, q[2] - g[2] * d]; } return q; };
  // seeds: vertices of a coarse mesh of the surface, jittered
  const coarse = meshField(f, min, max, 0.05);
  const nv = coarse.positions.length / 3; if (!nv) return empty;
  const r = rng(91 + seedN);
  const pos: number[] = [], nor: number[] = [], tan: number[] = [], shade: number[] = [], idx: number[] = [];
  const step = P.len / P.steps;
  for (let s = 0; s < P.count; s++) {
    const vi = Math.floor(r() * nv);
    const iso = 0.002 + r() * 0.016;              // layered: some strands sit a little above others
    let p: V3 = [coarse.positions[vi * 3] + (r() - 0.5) * 0.05, coarse.positions[vi * 3 + 1] + (r() - 0.5) * 0.05, coarse.positions[vi * 3 + 2] + (r() - 0.5) * 0.05];
    p = settle(p, iso);
    if (Math.abs(f(p[0], p[1], p[2]) - iso) > 0.01) continue;
    const pts: V3[] = [p], ns: V3[] = [grad(p)], ts: V3[] = [];
    const sd = r(), len = 0.6 + r() * 0.6;
    for (let k = 0; k < P.steps; k++) {
      const n = ns[ns.length - 1];
      let t = flow(style, p, k / P.steps * len * 4, sd);
      t = norm([t[0] - n[0] * dot(t, n), t[1] - n[1] * dot(t, n), t[2] - n[2] * dot(t, n)]);
      ts.push(t);
      const q = settle([p[0] + t[0] * step * len, p[1] + t[1] * step * len, p[2] + t[2] * step * len], iso);
      const nq = grad(q);
      if (Math.abs(f(q[0], q[1], q[2]) - iso) > 0.01 || dot(nq, n) < 0.5 || q[1] < min[1] + 0.02) break; // fell off the edge
      pts.push(q); ns.push(nq); p = q;
    }
    if (pts.length < 2) continue;
    ts.push(ts[ts.length - 1]);
    const base = pos.length / 3, w = P.width * (0.7 + r() * 0.6), tone = 0.82 + r() * 0.3;
    for (let k = 0; k < pts.length; k++) {
      const u = k / (pts.length - 1), half = w * 0.5 * (1 - u * 0.9);
      const b = norm(cross(ns[k], ts[k]));
      for (const sgn of [-1, 1]) {
        pos.push(pts[k][0] + b[0] * half * sgn, pts[k][1] + b[1] * half * sgn, pts[k][2] + b[2] * half * sgn);
        nor.push(ns[k][0], ns[k][1], ns[k][2]); tan.push(ts[k][0], ts[k][1], ts[k][2], 1);
        shade.push(tone * (0.55 + 0.45 * Math.min(1, u * 1.6))); // darker at the root
      }
      if (k) { const a = base + (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx), ao: new Float32Array(shade), tangents: new Float32Array(tan) };
}
