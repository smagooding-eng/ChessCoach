// Building a part's mesh from its settings: the same code runs in a worker (meshWorker.ts)
// or, if workers aren't available, on the page.
import { headField, HEAD_BOUNDS, type FaceShape } from './sdf';
import { meshField, type MeshData } from './mesher';
import { growStrands } from './strands';
import { hairField, beardField, outfitField, headwearField, type HairStyle, type BeardStyle, type MustacheStyle, type Outfit, type Headwear } from './styles';

export type MeshJob =
  | { kind: 'head'; shape: FaceShape; h: number }
  | { kind: 'hair'; shape: FaceShape; style: HairStyle; capped?: boolean; h: number }
  | { kind: 'beard'; shape: FaceShape; beard: BeardStyle; mustache: MustacheStyle; h: number }
  | { kind: 'outfit'; outfit: Outfit; h: number }
  | { kind: 'headwear'; shape: FaceShape; headwear: Headwear; h: number }
  | { kind: 'strands'; shape: FaceShape; style: HairStyle | 'beard'; capped?: boolean; beard?: BeardStyle; mustache?: MustacheStyle; density?: number }
  | { kind: 'ao'; space: 'head' | 'body'; scene: AoScene; positions: Float32Array; normals: Float32Array };

/** Everything that can shade everything else: the whole character, for soft contact shadows. */
export interface AoScene { shape: FaceShape; hair: HairStyle; capped: boolean; beard: BeardStyle; mustache: MustacheStyle; headwear: Headwear; outfit: Outfit; headY: number }

/** Ambient occlusion per vertex, measured from the character's distance fields: how much of the
 *  space just outside each point is taken up by the character itself (creases, under hair, the
 *  eye sockets, under the chin). It is what gives the soft shadowing of a film render. */
function occlusion(j: Extract<MeshJob, { kind: 'ao' }>): Float32Array {
  const S = j.scene;
  const head = headField(S.shape), hair = hairField(S.shape, S.hair, S.capped), beard = beardField(S.shape, S.beard, S.mustache);
  const hw = headwearField(S.shape, S.headwear), outfit = outfitField(S.outfit);
  const scene = (x: number, y: number, z: number) => { // head space
    let d = head(x, y, z);
    if (d > -0.5) {
      if (hair) d = Math.min(d, hair(x, y, z));
      if (beard && y < 0.2 && z > -0.3) d = Math.min(d, beard(x, y, z));
      if (hw && y > -0.3) d = Math.min(d, hw(x, y, z));
    }
    if (y + S.headY < -0.8) d = Math.min(d, outfit(x, y + S.headY, z));
    return d;
  };
  const P = j.positions, N = j.normals, n = P.length / 3, out = new Float32Array(n);
  const off = j.space === 'body' ? -S.headY : 0;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1] + off, z = P[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    let occ = 0, w = 1;
    for (let k = 1; k <= 5; k++) {
      const h = 0.025 + 0.055 * k;
      const d = scene(x + nx * h, y + ny * h, z + nz * h);
      occ += Math.max(0, h - d) * w; w *= 0.72;
    }
    out[i] = Math.max(0.12, Math.min(1, 1 - occ * 2.4));
  }
  return out;
}

// a fresh empty mesh each time: a worker hands its buffers over, so one can't be shared
const empty = (): MeshData => ({ positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) });

export function runMeshJob(j: MeshJob): MeshData {
  switch (j.kind) {
    case 'head': return meshField(headField(j.shape), HEAD_BOUNDS.min, HEAD_BOUNDS.max, j.h);
    case 'hair': { const f = hairField(j.shape, j.style, j.capped); return f ? meshField(f, [-1.6, -1.9, -1.6], [1.6, 1.95, 1.6], j.h) : empty(); }
    case 'beard': { const f = beardField(j.shape, j.beard, j.mustache); return f ? meshField(f, [-1.1, -1.5, -0.2], [1.1, 0.1, 1.3], j.h) : empty(); }
    case 'outfit': return meshField(outfitField(j.outfit), [-2.4, -3.3, -1.3], [2.4, -0.9, 0.9], j.h);
    case 'strands': {
      if (j.style === 'beard') {
        const f = beardField(j.shape, j.beard ?? 'none', j.mustache ?? 'none'); if (!f) return empty();
        return growStrands(f, j.beard === 'none' ? 'mustache' : 'beard', [-1.1, -1.5, -0.2], [1.1, 0.1, 1.3], 3, j.density);
      }
      const f = hairField(j.shape, j.style, j.capped); return f ? growStrands(f, j.style, [-1.6, -1.9, -1.6], [1.6, 1.95, 1.6], 1, j.density) : empty();
    }
    case 'ao': return { ...empty(), ao: occlusion(j) };
    case 'headwear': { const f = headwearField(j.shape, j.headwear); return f ? meshField(f, [-1.5, -0.2, -1.5], [1.5, 1.95, 1.9], j.h) : empty(); }
  }
}
export type MeshProvider = (j: MeshJob) => Promise<MeshData>;

/** Meshes built off the page's main thread when possible, and remembered. */
export function createMeshProvider(): MeshProvider {
  const cache = new Map<string, Promise<MeshData>>();
  let worker: Worker | null = null; let seq = 0;
  const waiting = new Map<number, { job: MeshJob; done: (m: MeshData) => void }>();
  try {
    worker = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; mesh: MeshData }>) => { waiting.get(e.data.id)?.done(e.data.mesh); waiting.delete(e.data.id); };
    // if the worker can't run here, finish its jobs on the page instead
    worker.onerror = () => { worker = null; for (const [id, w] of waiting) { waiting.delete(id); setTimeout(() => w.done(runMeshJob(w.job)), 0); } };
  } catch { worker = null; }
  return (j) => {
    const key = j.kind === 'ao' ? '' : JSON.stringify(j); // occlusion jobs carry whole meshes: never cached
    const hit = key ? cache.get(key) : undefined; if (hit) return hit;
    const p = worker
      ? new Promise<MeshData>((res) => { const id = ++seq; waiting.set(id, { job: j, done: res }); worker!.postMessage({ id, job: j }); })
      : new Promise<MeshData>((res) => setTimeout(() => res(runMeshJob(j)), 0));
    if (key) cache.set(key, p); if (cache.size > 40) cache.delete(cache.keys().next().value as string);
    return p;
  };
}
