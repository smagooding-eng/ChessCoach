// Realistic photo avatar for Streamer Studio, made here with no outside avatar maker.
// One front-facing portrait photo becomes a face that moves with the streamer: the face
// points found in the photo (MediaPipe, the same on-device tracker the studio already uses)
// are joined into a mesh, the photo is stretched over it, and every frame the mesh is bent
// by the live face: head turns (in 3D, using each point's depth), blinks, talking, smiles
// and eyebrows. With no camera it talks with the voice and blinks on its own.
// Drawn with WebGL. The photo and its face points stay on this device (IndexedDB).

export type Pt3 = { x: number; y: number; z: number };
export interface PhotoPose {
  yaw: number; pitch: number; roll: number; // screen terms (already mirrored when the preview is)
  mouth: number; blinkL: number; blinkR: number; smile: number; brow: number; // tracker values
  t: number; mirror: boolean;
}

// ── MediaPipe face mesh points used here ──
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const INNER_MOUTH = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const UPPER_INNER_LIP = [191, 80, 81, 82, 13, 312, 311, 310, 415];
// eyes, upper lid paired with the lower lid point below it
const EYE_A_UP = [246, 161, 160, 159, 158, 157, 173], EYE_A_LO = [7, 163, 144, 145, 153, 154, 155]; // image-left eye (the person's right)
const EYE_B_UP = [466, 388, 387, 386, 385, 384, 398], EYE_B_LO = [249, 390, 373, 374, 380, 381, 382]; // image-right eye
const BROWS = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const CORNER_A = [61, 78, 76, 62], CORNER_B = [291, 308, 306, 292];

// ── Delaunay triangulation (Bowyer–Watson), once per portrait ──
function delaunay(pts: { x: number; y: number }[]): number[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const d = Math.max(maxX - minX, maxY - minY) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P = [...pts, { x: mx - d, y: my - d }, { x: mx, y: my + d }, { x: mx + d, y: my - d }];
  const n = pts.length;
  type Tri = { a: number; b: number; c: number; x: number; y: number; r2: number };
  const circ = (a: number, b: number, c: number): Tri => {
    const A = P[a], B = P[b], C = P[c];
    const D = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y)) || 1e-12;
    const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) + (B.x ** 2 + B.y ** 2) * (C.y - A.y) + (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / D;
    const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) + (B.x ** 2 + B.y ** 2) * (A.x - C.x) + (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / D;
    return { a, b, c, x: ux, y: uy, r2: (A.x - ux) ** 2 + (A.y - uy) ** 2 };
  };
  let tris: Tri[] = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const p = P[i];
    const bad: Tri[] = [], keep: Tri[] = [];
    for (const t of tris) ((p.x - t.x) ** 2 + (p.y - t.y) ** 2 < t.r2 ? bad : keep).push(t);
    const edges = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]);
    }
    for (const [u, v] of edges.values()) keep.push(circ(u, v, i));
    tris = keep;
  }
  const out: number[] = [];
  for (const t of tris) if (t.a < n && t.b < n && t.c < n) out.push(t.a, t.b, t.c);
  return out;
}

const VS = `
attribute vec3 a_pos; attribute vec2 a_uv; attribute float a_alpha;
uniform vec2 u_res; uniform vec3 u_xf; uniform float u_zs;
varying vec2 v_uv; varying float v_a;
void main() {
  vec2 p = a_pos.xy * u_xf.x + u_xf.yz;
  vec2 c = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, clamp(a_pos.z * u_zs, -0.99, 0.99), 1.0);
  v_uv = a_uv; v_a = a_alpha;
}`;
const FS = `
precision mediump float;
uniform sampler2D u_tex; varying vec2 v_uv; varying float v_a;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  float edge = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
  float a = c.a * v_a * smoothstep(0.0, 0.11, edge); // soft edge so the photo sits on the studio background
  gl_FragColor = vec4(c.rgb * a, a);
}`;

export class PhotoAvatar {
  readonly canvas: HTMLCanvasElement; // what the studio draws
  private gl: WebGLRenderingContext | null;
  private glCanvas: HTMLCanvasElement;
  private prog: WebGLProgram | null = null;
  private buf: { pos: WebGLBuffer; uv: WebGLBuffer; alpha: WebGLBuffer; idx: WebGLBuffer } | null = null;
  private tex: WebGLTexture | null = null;
  private src: Pt3[] = []; // mesh points in photo pixels (z: depth, toward camera is negative)
  private headW: number[] = []; // how much each point follows the head (1 face … 0 photo edge)
  private isFace = 0; // points [0, isFace) are face landmarks
  private count = 0;
  private pos = new Float32Array(0);
  private imgW = 1; private imgH = 1;
  private F = 1; // face height (forehead to chin) in photo pixels
  private C = { x: 0, y: 0, z: 0 }; // turning point (middle of the head)
  ready = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.glCanvas = document.createElement('canvas');
    this.gl = this.glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true });
    const gl = this.gl; if (!gl) return;
    const sh = (type: number, code: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, code); gl.compileShader(s); return s; };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return;
    this.prog = p;
    this.buf = { pos: gl.createBuffer()!, uv: gl.createBuffer()!, alpha: gl.createBuffer()!, idx: gl.createBuffer()! };
    gl.getExtension('OES_element_index_uint');
  }

  get supported() { return !!this.prog; }

  /** The portrait (any size, drawn upright) and its face points (0..1 of the image, z as MediaPipe gives it). */
  setPortrait(img: HTMLCanvasElement, lm: Pt3[]): boolean {
    const gl = this.gl; if (!gl || !this.prog || !this.buf || lm.length < 468) return false;
    const W = img.width, H = img.height;
    this.imgW = W; this.imgH = H;
    const face: Pt3[] = lm.slice(0, 478).map((p) => ({ x: p.x * W, y: p.y * H, z: p.z * W }));
    const at = (i: number) => face[i];
    this.F = Math.hypot(at(152).x - at(10).x, at(152).y - at(10).y);
    const oval = FACE_OVAL.map(at);
    const cx = oval.reduce((n, p) => n + p.x, 0) / oval.length, cy = oval.reduce((n, p) => n + p.y, 0) / oval.length;
    const zMid = face.reduce((n, p) => n + p.z, 0) / face.length;
    this.C = { x: cx, y: cy, z: zMid + this.F * 0.35 }; // the head turns about a point behind the face
    const pts: Pt3[] = [...face], w: number[] = face.map(() => 1);
    const inside = (x: number, y: number) => ({ x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) });
    // two rings around the face: hair, ears and neck follow the head less and less
    for (const [k, follow] of [[1.28, 0.75], [1.75, 0.3]] as [number, number][]) {
      for (const p of oval) {
        const q = inside(cx + (p.x - cx) * k, cy + (p.y - cy) * k);
        pts.push({ x: q.x, y: q.y, z: zMid + this.F * 0.15 * k }); w.push(follow);
      }
    }
    // the photo's edge stays put
    const N = 8;
    for (let i = 0; i <= N; i++) {
      for (const [x, y] of [[(W * i) / N, 0], [(W * i) / N, H], [0, (H * i) / N], [W, (H * i) / N]]) {
        if (pts.some((p) => Math.abs(p.x - x) < 1 && Math.abs(p.y - y) < 1)) continue;
        pts.push({ x, y, z: zMid + this.F }); w.push(0);
      }
    }
    // drop ring points that landed on top of each other (face near the photo edge)
    const keepPts: Pt3[] = [], keepW: number[] = [];
    pts.forEach((p, i) => {
      if (i >= face.length && keepPts.some((q) => Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2)) return;
      keepPts.push(p); keepW.push(w[i]);
    });
    this.src = keepPts; this.headW = keepW; this.isFace = face.length; this.count = keepPts.length;
    const tris = delaunay(keepPts);
    const alpha = new Float32Array(this.count).fill(1);
    const uv = new Float32Array(this.count * 2);
    keepPts.forEach((p, i) => { uv[i * 2] = p.x / W; uv[i * 2 + 1] = p.y / H; });
    this.pos = new Float32Array(this.count * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.uv); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.alpha); gl.bufferData(gl.ARRAY_BUFFER, alpha, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buf.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(tris), gl.STATIC_DRAW);
    this.triCount = tris.length;
    if (this.tex) gl.deleteTexture(this.tex);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.ready = true;
    return true;
  }
  private triCount = 0;

  /** Bends the face for this moment: expressions first, then the head turn. */
  private pose(p: PhotoPose): Pt3[] {
    const F = this.F, S = this.src;
    const out = S.map((q) => ({ ...q }));
    const lip = S[13], chin = S[152];
    const halfW = Math.max(1, Math.abs(S[454].x - S[234].x) / 2);
    const mouth = Math.max(0, Math.min(1, p.mouth));
    // jaw drops: everything below the upper lip, most in the middle, fading below the chin
    for (let i = 0; i < this.count; i++) {
      const q = S[i];
      const u = (q.y - lip.y) / F;
      if (u <= 0) continue;
      let w = Math.min(1, u / 0.025);
      const dx = (q.x - lip.x) / halfW;
      w *= Math.max(0.05, Math.min(1, 1.15 - dx * dx));
      if (q.y > chin.y) w *= Math.max(0, 1 - (q.y - chin.y) / (F * 0.3)) * 0.85;
      out[i].y += mouth * F * 0.12 * w;
    }
    for (const i of UPPER_INNER_LIP) out[i].y -= mouth * F * 0.012;
    // smile: mouth corners out and up
    const sm = Math.max(0, Math.min(1, p.smile)) * F;
    for (const i of CORNER_A) { out[i].x -= sm * 0.03; out[i].y -= sm * 0.025; }
    for (const i of CORNER_B) { out[i].x += sm * 0.03; out[i].y -= sm * 0.025; }
    // eyebrows
    const br = Math.max(-1, Math.min(1, p.brow)) * F * 0.03;
    for (const i of BROWS) out[i].y -= br;
    // blinks: a mirror view closes the eye on the same side of the screen as yours
    const blinkA = p.mirror ? p.blinkL : p.blinkR, blinkB = p.mirror ? p.blinkR : p.blinkL;
    const close = (up: number[], lo: number[], b: number) => {
      const k = Math.max(0, Math.min(1, (b - 0.15) / 0.6)) * 0.92;
      up.forEach((u, j) => { out[u].x += (S[lo[j]].x - S[u].x) * k; out[u].y += (S[lo[j]].y - S[u].y) * k; });
    };
    close(EYE_A_UP, EYE_A_LO, blinkA); close(EYE_B_UP, EYE_B_LO, blinkB);
    // head turn in 3D around the middle of the head, plus a little breathing
    const yaw = p.yaw * 0.42, pitch = p.pitch * 0.3, roll = p.roll;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const C = this.C, bob = Math.sin(p.t * 1.6) * F * 0.006;
    for (let i = 0; i < this.count; i++) {
      const w = this.headW[i]; if (!w) continue;
      const o = out[i];
      let x = o.x - C.x, y = o.y - C.y, z = o.z - C.z;
      let x2 = x * cy - z * sy; const z2 = x * sy + z * cy;  // turn left/right
      const y2 = y * cp - z2 * sp; const z3 = y * sp + z2 * cp; // nod
      const x3 = x2 * cr - y2 * sr; const y3 = x2 * sr + y2 * cr; // tilt
      x2 = x3;
      o.x += (x2 + C.x - o.x) * w; o.y += (y3 + C.y + bob - o.y) * w; o.z += (z3 + C.z - o.z) * w;
    }
    return out;
  }

  render(w: number, h: number, zoom: number, p: PhotoPose): HTMLCanvasElement {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const c2 = this.canvas.getContext('2d')!;
    c2.clearRect(0, 0, w, h);
    if (!gl || !this.ready || !this.prog || !this.buf || !this.tex) return this.canvas;
    if (this.glCanvas.width !== w || this.glCanvas.height !== h) { this.glCanvas.width = w; this.glCanvas.height = h; }
    const pts = this.pose(p);
    for (let i = 0; i < this.count; i++) { this.pos[i * 3] = pts[i].x; this.pos[i * 3 + 1] = pts[i].y; this.pos[i * 3 + 2] = pts[i].z - this.C.z; }
    // framing: the face about 40% of the picture tall (times the size slider), a bit above the middle
    const s = (h * 0.4 * Math.max(0.3, zoom)) / this.F;
    const ox = w / 2 - this.C.x * s, oy = h * 0.46 - this.C.y * s;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
    const attr = (name: string, b: WebGLBuffer, size: number) => {
      const loc = gl.getAttribLocation(this.prog!, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.pos); gl.bufferData(gl.ARRAY_BUFFER, this.pos, gl.DYNAMIC_DRAW);
    attr('a_pos', this.buf.pos, 3); attr('a_uv', this.buf.uv, 2); attr('a_alpha', this.buf.alpha, 1);
    gl.uniform2f(gl.getUniformLocation(this.prog, 'u_res'), w, h);
    gl.uniform3f(gl.getUniformLocation(this.prog, 'u_xf'), s, ox, oy);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_zs'), 1 / (this.F * 4));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(gl.getUniformLocation(this.prog, 'u_tex'), 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buf.idx);
    gl.drawElements(gl.TRIANGLES, this.triCount, gl.UNSIGNED_SHORT, 0);
    c2.drawImage(this.glCanvas, 0, 0);
    // the open mouth: dark inside, a hint of top teeth
    const open = (pts[14].y - pts[13].y) / this.F;
    if (open > 0.012) {
      c2.save();
      c2.beginPath();
      INNER_MOUTH.forEach((i, k) => { const x = pts[i].x * s + ox, y = pts[i].y * s + oy; if (k) c2.lineTo(x, y); else c2.moveTo(x, y); });
      c2.closePath();
      c2.clip();
      const top = pts[13].y * s + oy, bot = pts[14].y * s + oy, left = pts[78].x * s + ox, right = pts[308].x * s + ox;
      const g = c2.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, '#2a0c0e'); g.addColorStop(0.6, '#160506'); g.addColorStop(1, '#3a1416');
      c2.fillStyle = g; c2.fillRect(left - 4, top - 4, right - left + 8, bot - top + 8);
      const teeth = Math.min((bot - top) * 0.32, this.F * s * 0.035);
      c2.fillStyle = 'rgba(236,230,220,0.92)';
      c2.beginPath(); c2.ellipse((left + right) / 2, top, (right - left) * 0.36, teeth, 0, 0, Math.PI); c2.fill();
      c2.restore();
    }
    return this.canvas;
  }

  dispose() { const gl = this.gl; if (gl && this.tex) gl.deleteTexture(this.tex); this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
}

/** A photo, made upright and at most 1024px, ready for the face finder and the mesh. */
export async function portraitCanvas(src: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  return cv;
}

// ── kept on this device ──
const DB = 'cs_streamer', STORE = 'files', KEY = 'photoAvatar';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
export interface SavedPortrait { name: string; image: Blob; landmarks: Pt3[] }
export async function savePortrait(v: SavedPortrait) {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export async function loadPortrait(): Promise<SavedPortrait | null> {
  try {
    const d = await db();
    return await new Promise((res) => { const tx = d.transaction(STORE, 'readonly'); const g = tx.objectStore(STORE).get(KEY); g.onsuccess = () => res((g.result as SavedPortrait) ?? null); g.onerror = () => res(null); });
  } catch { return null; }
}
export async function clearPortrait() {
  try { const d = await db(); const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); } catch { /* ignore */ }
}
