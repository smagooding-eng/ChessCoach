// Turns a distance field into a smooth triangle mesh (naive surface nets), then settles each
// vertex onto the true surface and takes its normal from the field, so shading is smooth.
// Only cells near the surface are measured finely: a coarse pass finds them first.

import type { Field } from './sdf';

export interface MeshData { positions: Float32Array; normals: Float32Array; indices: Uint32Array; ao?: Float32Array; tangents?: Float32Array }

export function meshField(f: Field, min: number[], max: number[], h: number): MeshData {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  // coarse pass every C cells; fill far cells with the coarse value, measure near ones exactly
  const C = 4, band = h * C * 1.8;
  for (let k = 0; k < nz; k += 1) {
    const z = min[2] + k * h;
    for (let j = 0; j < ny; j += 1) {
      const y = min[1] + j * h;
      let coarse = 0, coarseAt = -1;
      for (let i = 0; i < nx; i++) {
        const x = min[0] + i * h;
        if (i - coarseAt >= C || coarseAt < 0) { coarse = f(x, y, z); coarseAt = i; }
        vals[at(i, j, k)] = Math.abs(coarse) > band ? coarse : f(x, y, z);
      }
    }
  }
  // one vertex per cell the surface passes through
  const cellIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cat = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) { v[c] = vals[at(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; if (v[c] < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
      sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
      sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
      n++;
    }
    cellIdx[cat(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
  }
  // a quad for every grid edge the surface crosses, joining the four cells around it
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = vals[at(i, j, k)] < 0;
    if (i < nx - 1 && v0 !== (vals[at(i + 1, j, k)] < 0)) // x edge: cells around in y,z
      quad(cellIdx[cat(i, j - 1, k - 1)], cellIdx[cat(i, j, k - 1)], cellIdx[cat(i, j - 1, k)], cellIdx[cat(i, j, k)], !v0);
    if (j < ny - 1 && v0 !== (vals[at(i, j + 1, k)] < 0)) // y edge: cells around in x,z
      quad(cellIdx[cat(i - 1, j, k - 1)], cellIdx[cat(i - 1, j, k)], cellIdx[cat(i, j, k - 1)], cellIdx[cat(i, j, k)], !v0);
    if (k < nz - 1 && v0 !== (vals[at(i, j, k + 1)] < 0)) // z edge: cells around in x,y
      quad(cellIdx[cat(i - 1, j - 1, k)], cellIdx[cat(i, j - 1, k)], cellIdx[cat(i - 1, j, k)], cellIdx[cat(i, j, k)], !v0);
  }
  // settle on the surface; normals from the field's slope
  const positions = new Float32Array(pos), normals = new Float32Array(pos.length);
  const e = h * 0.5;
  for (let p = 0; p < positions.length; p += 3) {
    let x = positions[p], y = positions[p + 1], z = positions[p + 2];
    let gx = 0, gy = 0, gz = 1;
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z);
      gx = f(x + e, y, z) - f(x - e, y, z); gy = f(x, y + e, z) - f(x, y - e, z); gz = f(x, y, z + e) - f(x, y, z - e);
      const g2 = (gx * gx + gy * gy + gz * gz) / (4 * e * e) || 1;
      const s = d / g2 / (2 * e);
      let mx = gx * s, my = gy * s, mz = gz * s; const ml = Math.hypot(mx, my, mz);
      if (ml > h * 0.75) { const k = (h * 0.75) / ml; mx *= k; my *= k; mz *= k; }
      x -= mx; y -= my; z -= mz;
    }
    const gl = Math.hypot(gx, gy, gz) || 1;
    positions[p] = x; positions[p + 1] = y; positions[p + 2] = z;
    normals[p] = gx / gl; normals[p + 1] = gy / gl; normals[p + 2] = gz / gl;
  }
  // wind every triangle to face outward (along the field's normal)
  const indices = new Uint32Array(idx);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * (normals[a] + normals[b] + normals[c]) + cy * (normals[a + 1] + normals[b + 1] + normals[c + 1]) + cz * (normals[a + 2] + normals[b + 2] + normals[c + 2]) < 0) {
      const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp;
    }
  }
  return { positions, normals, indices };
}
