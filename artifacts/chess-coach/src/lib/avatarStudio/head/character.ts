// The animated 3D character: a sculpted head generated for the chosen face settings, with
// eyes, lids, lashes, brows, a mouth that opens (teeth and tongue), hair, facial hair,
// clothing and accessories, all real geometry. Expressions are morph targets on the face
// mesh (ARKit-style names), so MediaPipe face tracking and lip sync drive them directly.
// Reusable: the Avatar Studio, the Streamer Studio and (later) Face Chat all use this class.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { anatomy, headField, type FaceShape } from './sdf';
import type { MeshData } from './mesher';
import type { HairStyle, BeardStyle, MustacheStyle, Outfit, Headwear } from './styles';
import { runMeshJob, type MeshJob, type MeshProvider, type AoScene } from './meshJobs';

export type BrowStyle = 'soft' | 'straight' | 'arched' | 'thick' | 'thin';
export type Glasses = 'none' | 'round' | 'square' | 'aviator' | 'shades';
export type Extra = 'none' | 'headphones' | 'earrings' | 'chain';

export interface CharacterLook {
  shape: FaceShape;
  skinTone: string; eyeColor: string; lipTint: number; freckles: boolean;
  brows: BrowStyle;
  hair: HairStyle; hairColor: string;
  beard: BeardStyle; mustache: MustacheStyle; beardColor: string;
  glasses: Glasses; glassesColor: string;
  headwear: Headwear; headwearColor: string;
  extra: Extra; extraColor: string;
  outfit: Outfit; outfitColor: string;
}

/** Expression weights 0..1 (ARKit names, as MediaPipe reports them). */
export type Expression = Partial<Record<
  'jawOpen' | 'mouthSmileLeft' | 'mouthSmileRight' | 'mouthFrownLeft' | 'mouthFrownRight' | 'mouthPucker' | 'mouthFunnel'
  | 'browInnerUp' | 'browOuterUpLeft' | 'browOuterUpRight' | 'browDownLeft' | 'browDownRight'
  | 'eyeBlinkLeft' | 'eyeBlinkRight' | 'eyeWideLeft' | 'eyeWideRight' | 'cheekPuff'
  | 'eyeLookInLeft' | 'eyeLookOutLeft' | 'eyeLookUpLeft' | 'eyeLookDownLeft', number>>;
export interface HeadPose { yaw: number; pitch: number; roll: number } // radians

const MORPHS = ['jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'browDownLeft', 'browDownRight', 'cheekPuff'] as const;
type MorphName = typeof MORPHS[number];

const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (d2: number, s: number) => Math.exp(-d2 / (2 * s * s));
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }


export class Character {
  readonly root: any;
  private head: any; private body: any;
  private T: any;
  private parts: Record<string, any> = {};
  private skin: any = null; private beard: any = null;
  private eyes: { ball: any; upper: any; lower: any; side: 1 | -1 }[] = [];
  private brows: { mesh: any; side: 1 | -1; base: number[] }[] = [];
  private jaw: any = null; private jawPivot = [0, -0.18, -0.2];
  private A: ReturnType<typeof anatomy> | null = null;
  private keys: Record<string, string> = {};
  private tex: Record<string, any> = {};
  private expr: Expression = {};
  quality: 'draft' | 'full' = 'full';
  /** Fewer, slightly thicker hair strands on slower devices. */
  strandDensity = 1;
  private skinAO: Float32Array | null = null;
  private readonly headY = -0.26;
  private mesh: MeshProvider;
  private token = 0;

  constructor(T: any, mesh?: MeshProvider) {
    this.T = T;
    this.mesh = mesh ?? ((j: MeshJob) => Promise.resolve(runMeshJob(j)));
    this.root = new T.Group(); this.head = new T.Group(); this.body = new T.Group(); this.root.add(this.head, this.body);
    this.head.position.y = this.headY; // a short neck, as animated characters have
    this.tex.strands = this.strandTexture();
    this.tex.skin = this.skinNoise();
  }

  /** Skin that glows warm where light wraps around it, like an animated film's skin shader. */
  private softSkin(m: any) {
    const T = this.T;
    m.onBeforeCompile = (sh: any) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', T.ShaderChunk.lights_physical_pars_fragment.replace(
        'vec3 irradiance = dotNL * directLight.color;',
        'float wNL = dot( geometryNormal, directLight.direction ); vec3 irradiance = ( saturate( ( wNL + 0.45 ) / 1.45 ) * vec3( 1.0, 0.78, 0.72 ) + saturate( wNL ) * vec3( 0.0, 0.22, 0.28 ) ) * directLight.color;'));
    };
    m.customProgramCacheKey = () => 'soft-skin';
    return m;
  }

  // ── textures drawn once ──
  private strandTexture() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d')!;
    c.fillStyle = '#808080'; c.fillRect(0, 0, 256, 256); const r = rng(7);
    for (let i = 0; i < 700; i++) { const x = r() * 256, v = 70 + r() * 150; c.strokeStyle = `rgb(${v},${v},${v})`; c.lineWidth = 0.6 + r() * 1.6; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + (r() - 0.5) * 18, 90, x + (r() - 0.5) * 18, 170, x + (r() - 0.5) * 10, 256); c.stroke(); }
    const t = new this.T.CanvasTexture(cv); t.wrapS = t.wrapT = this.T.RepeatWrapping; return t;
  }
  private skinNoise() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d')!; const img = c.createImageData(256, 256); const r = rng(13);
    for (let i = 0; i < img.data.length; i += 4) { const v = 214 + r() * 38; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    c.putImageData(img, 0, 0); const t = new this.T.CanvasTexture(cv); t.wrapS = t.wrapT = this.T.RepeatWrapping; t.repeat.set(8, 8); return t;
  }
  private eyeShadowTexture() {
    // sphere UVs: u = 0.25 faces forward, v = 0 at the top
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const c = cv.getContext('2d')!; const img = c.createImageData(128, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const u = x / 128, v = y / 64; let du = Math.abs(u - 0.25); du = Math.min(du, 1 - du);
      const top = Math.max(0, Math.min(1, (0.5 - v) / 0.22)) ** 1.6 * 0.75;    // under the upper lid
      const side = Math.max(0, Math.min(1, (du - 0.1) / 0.18)) ** 2 * 0.55;    // the corners of the eye
      const a = Math.min(0.85, top + side) * 255; const k = (y * 128 + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = a; img.data[k + 3] = 255;
    }
    c.putImageData(img, 0, 0); return new this.T.CanvasTexture(cv);
  }
  private irisTexture(color: string) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const c = cv.getContext('2d')!;
    const base = new this.T.Color(color); const css = (k: number) => `#${base.clone().multiplyScalar(k).getHexString()}`;
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#030202'); g.addColorStop(0.4, '#030202'); g.addColorStop(0.44, css(0.45)); g.addColorStop(0.56, css(1.55));
    g.addColorStop(0.78, css(1.15)); g.addColorStop(0.9, css(0.55)); g.addColorStop(1, css(0.12));
    c.fillStyle = g; c.fillRect(0, 0, 256, 128); const r = rng(3);
    for (let i = 0; i < 220; i++) { const x = r() * 256; c.strokeStyle = r() > 0.5 ? 'rgba(255,236,200,0.2)' : 'rgba(0,0,0,0.25)'; c.lineWidth = 0.8 + r(); c.beginPath(); c.moveTo(x, 56); c.lineTo(x + (r() - 0.5) * 6, 116); c.stroke(); }
    const t = new this.T.CanvasTexture(cv); t.colorSpace = this.T.SRGBColorSpace; return t;
  }

  private geo(m: MeshData) {
    const g = new this.T.BufferGeometry();
    g.setAttribute('position', new this.T.BufferAttribute(m.positions.slice(), 3));
    g.setAttribute('normal', new this.T.BufferAttribute(m.normals.slice(), 3));
    g.setIndex(new this.T.BufferAttribute(m.indices, 1));
    // a simple projection for the strand / pore textures
    const p = m.positions, uv = new Float32Array((p.length / 3) * 2);
    for (let i = 0; i < p.length / 3; i++) { uv[i * 2] = (Math.atan2(p[i * 3], p[i * 3 + 2]) / Math.PI + 1) * 2; uv[i * 2 + 1] = p[i * 3 + 1] * 0.6; }
    g.setAttribute('uv', new this.T.BufferAttribute(uv, 2));
    return g;
  }

  private replace(name: string, obj: any) {
    const old = this.parts[name];
    const host = name === 'outfit' || name === 'extra:body' ? this.body : this.head;
    if (old) { old.parent?.remove(old); old.traverse?.((o: any) => { o.geometry?.dispose?.(); }); }
    if (obj) host.add(obj);
    this.parts[name] = obj;
  }

  /** Apply a look. Only what changed is rebuilt; colours never rebuild geometry. */
  async setLook(look: CharacterLook): Promise<boolean> {
    const T = this.T; const token = ++this.token;
    const h = this.quality === 'draft' ? 0.036 : 0.022;
    const shapeKey = JSON.stringify(look.shape);
    this.A = anatomy(look.shape);
    const A = this.A;

    // ── face ──
    const skinKey = `${shapeKey}|${h}`;
    if (this.keys.skin !== skinKey) {
      const m = await this.mesh({ kind: 'head', shape: look.shape, h });
      if (token !== this.token) return false;
      this.A = anatomy(look.shape);
      const g = this.geo(m);
      this.addMorphs(g, look.shape);
      g.setAttribute('color', new T.BufferAttribute(new Float32Array(m.positions.length), 3));
      const mat = this.softSkin(new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, roughnessMap: this.tex.skin, specularIntensity: 0.32, sheen: 0.35, sheenColor: new T.Color('#ff8a70'), sheenRoughness: 0.6, envMapIntensity: 0.5 }));
      this.skinAO = null; this.keys.ao = '';
      this.skin = new T.Mesh(g, mat); this.skin.morphTargetInfluences = new Array(MORPHS.length).fill(0);
      this.replace('skin', this.skin); this.keys.skin = skinKey; this.keys.skinColor = '';
      this.buildEyes(look); this.buildMouth(look); this.keys.brows = '';
    }
    const colorKey = `${look.skinTone}|${look.lipTint}|${look.freckles}|${look.beard}|${look.beardColor}|${look.brows}|${look.hairColor}|${look.hair === 'bald'}|${skinKey}`;
    if (this.keys.skinColor !== colorKey) { this.paintSkin(look); this.keys.skinColor = colorKey; this.keys.eyeColor = ''; }
    if (this.keys.eyeColor !== `${look.eyeColor}|${look.skinTone}|${skinKey}`) { this.paintEyes(look); this.keys.eyeColor = `${look.eyeColor}|${look.skinTone}|${skinKey}`; }

    // ── brows ──
    const browKey = `${look.brows}|${look.hairColor}|${look.hair}|${look.beardColor}|${shapeKey}`;
    if (this.keys.brows !== browKey) { this.buildBrows(look); this.keys.brows = browKey; }

    // ── hair, facial hair, clothing, headwear ──
    const part = async (name: string, key: string, job: MeshJob, color: string, mat: () => any, hStep: number, morphJaw = false) => {
      const k = `${key}|${hStep}`;
      if (this.keys[name] !== k) {
        const m = await this.mesh(job);
        if (token !== this.token) return;
        if (!m.indices.length) { this.replace(name, null); this.keys[name] = k; this.keys[name + 'c'] = ''; return; }
        const g = this.geo(m);
        if (morphJaw) this.addJawMorph(g);
        const mesh = new T.Mesh(g, mat()); if (morphJaw) mesh.morphTargetInfluences = [0];
        this.replace(name, mesh); this.keys[name] = k; this.keys[name + 'c'] = '';
      }
      const mesh = this.parts[name];
      if (mesh && this.keys[name + 'c'] !== color) { mesh.material.color.set(color); if (name === 'hair' || name === 'beard') { mesh.material.color.multiplyScalar(0.5); for (const c of mesh.children) c.material?.color?.set(color); } if (mesh.material.sheenColor) mesh.material.sheenColor.set(new T.Color(color).lerp(new T.Color('#ffffff'), 0.3)); this.keys[name + 'c'] = color; }
    };
    const hairMat = () => new T.MeshPhysicalMaterial({ roughness: 0.5, bumpMap: this.tex.strands, bumpScale: 0.5, sheen: 0.5, sheenRoughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.35 });
    const hs = this.quality === 'draft' ? 0.042 : 0.026, bs = this.quality === 'draft' ? 0.032 : 0.018;
    await Promise.all([
      part('hair', `${look.hair}|${look.headwear !== 'none'}|${shapeKey}`, { kind: 'hair', shape: look.shape, style: look.hair, capped: look.headwear !== 'none', h: hs }, look.hairColor, hairMat, hs),
      part('beard', `${look.beard}|${look.mustache}|${shapeKey}`, { kind: 'beard', shape: look.shape, beard: look.beard, mustache: look.mustache, h: bs }, look.beardColor, hairMat, bs, true),
      part('outfit', look.outfit, { kind: 'outfit', outfit: look.outfit, h: this.quality === 'draft' ? 0.05 : 0.032 }, look.outfitColor,
        () => new T.MeshPhysicalMaterial({ roughness: 0.85, sheen: 0.6, sheenRoughness: 0.8, bumpMap: this.tex.skin, bumpScale: 1.2 }), this.quality === 'draft' ? 0.05 : 0.032),
      part('headwear', `${look.headwear}|${shapeKey}`, { kind: 'headwear', shape: look.shape, headwear: look.headwear, h: this.quality === 'draft' ? 0.042 : 0.026 }, look.headwearColor,
        () => new T.MeshPhysicalMaterial({ roughness: 0.75, sheen: 0.4 }), this.quality === 'draft' ? 0.042 : 0.026),
    ]);
    if (token !== this.token) return false;
    
    this.beard = this.parts.beard;
    if (this.parts.hair && this.keys.hairFlow !== this.keys.hair) { this.groomHair(this.parts.hair, look.hair); this.keys.hairFlow = this.keys.hair; }
    if (this.parts.beard && this.keys.beardFlow !== this.keys.beard) { this.groomHair(this.parts.beard, 'beard'); this.keys.beardFlow = this.keys.beard; }
    // collar trim around the neck, a shade darker than the outfit
    const trimKey = `${look.outfit}|${look.outfitColor}`;
    if (this.keys.trim !== trimKey) {
      const trim = new T.Group(); const c = new T.Color(look.outfitColor).multiplyScalar(0.75);
      const m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.8, sheen: 0.5 });
      const ring = new T.Mesh(new T.TorusGeometry(look.outfit === 'hoodie' ? 0.5 : 0.43, look.outfit === 'sweater' ? 0.07 : 0.045, 16, 64), m);
      ring.rotation.x = Math.PI / 2 - 0.12; ring.position.set(0, -1.58, -0.2); ring.scale.set(1, 1.08, 1); trim.add(ring);
      if (look.outfit === 'hoodie') for (const s of [-1, 1]) { const str = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.55, 8), new T.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 })); str.position.set(s * 0.16, -1.9, 0.33); str.rotation.x = 0.15; trim.add(str); }
      if (look.outfit === 'jacket' || look.outfit === 'collar') { const sh = new T.Mesh(new T.CylinderGeometry(0.4, 0.42, 0.3, 32, 1, true), new T.MeshPhysicalMaterial({ color: look.outfit === 'jacket' ? 0xf2f2f2 : c, roughness: 0.8, side: T.DoubleSide })); sh.position.set(0, -1.62, -0.2); trim.add(sh); }
      this.replace('trim', trim); this.keys.trim = trimKey;
      this.body.add(trim);
    }
    if (this.parts.hair) this.parts.hair.visible = !(look.headwear !== 'none' && look.hair === 'afro');

    // ── glasses and extras ──
    const gKey = `${look.glasses}|${look.glassesColor}|${shapeKey}`;
    if (this.keys.glasses !== gKey) { this.replace('glasses', this.buildGlasses(look)); this.keys.glasses = gKey; }
    const xKey = `${look.extra}|${look.extraColor}|${shapeKey}|${look.headwear}`;
    if (this.keys.extra !== xKey) { this.replace('extra', this.buildExtra(look)); this.keys.extra = xKey; }
    for (const o of Object.values(this.parts)) o?.traverse?.((m: any) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    if (this.quality === 'full') {
      const grow = async (name: 'hair' | 'beard', job: MeshJob, color: string) => {
        const host = this.parts[name]; if (!host || this.keys[name + 'Strands'] === this.keys[name]) return;
        const m = await this.mesh(job);
        if (token !== this.token || this.parts[name] !== host || !m.indices.length || !m.ao || !m.tangents) return;
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(m.positions, 3)); g.setAttribute('normal', new T.BufferAttribute(m.normals, 3));
        g.setAttribute('tangent', new T.BufferAttribute(m.tangents, 4));
        const col = new Float32Array(m.ao.length * 3); for (let i = 0; i < m.ao.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = m.ao[i];
        g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setIndex(new T.BufferAttribute(m.indices, 1));
        if (name === 'beard') this.addJawMorph(g);
        const mat = new T.MeshPhysicalMaterial({ color: new T.Color(color), vertexColors: true, roughness: 0.46, specularIntensity: 0.55, specularColor: new T.Color(color).lerp(new T.Color('#ffffff'), 0.55), anisotropy: 0.85, anisotropyRotation: Math.PI / 2, sheen: 0.15, sheenRoughness: 0.5, side: T.DoubleSide });
        const mesh = new T.Mesh(g, mat); mesh.userData.strands = true; mesh.castShadow = true; mesh.receiveShadow = true;
        if (name === 'beard') mesh.morphTargetInfluences = [0];
        host.add(mesh); this.keys[name + 'Strands'] = this.keys[name];
      };
      await Promise.all([
        grow('hair', { kind: 'strands', shape: look.shape, style: look.hair, capped: look.headwear !== 'none', density: this.strandDensity }, look.hairColor),
        grow('beard', { kind: 'strands', shape: look.shape, style: 'beard', beard: look.beard, mustache: look.mustache, density: this.strandDensity }, look.beardColor),
      ]);
      if (token !== this.token) return false;
    }
    this.setExpression(this.expr);
    if (this.quality === 'full') {
      const aoKey = ['skin', 'hair', 'beard', 'outfit', 'headwear'].map((k) => this.keys[k]).join('#');
      if (this.keys.ao !== aoKey) {
        const scene: AoScene = { shape: look.shape, hair: look.hair, capped: look.headwear !== 'none', beard: look.beard, mustache: look.mustache, headwear: look.headwear, outfit: look.outfit, headY: this.headY };
        const shade = async (name: string, mesh: any, space: 'head' | 'body') => {
          if (!mesh) return;
          const g = mesh.geometry;
          const r = await this.mesh({ kind: 'ao', space, scene, positions: g.attributes.position.array, normals: g.attributes.normal.array });
          if (token !== this.token || !r.ao || this.parts[name] !== mesh) return;
          if (name === 'skin') { this.skinAO = r.ao; this.paintSkin(look); return; }
          const col = new Float32Array(r.ao.length * 3); for (let i = 0; i < r.ao.length; i++) { const v = 0.2 + 0.8 * r.ao[i]; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
          g.setAttribute('color', new T.BufferAttribute(col, 3)); mesh.material.vertexColors = true; mesh.material.needsUpdate = true;
        };
        const strandShade = async (host: any) => {
          const st = host?.children.find((c: any) => c.userData.strands); if (!st) return;
          const g = st.geometry; const r = await this.mesh({ kind: 'ao', space: 'head', scene, positions: g.attributes.position.array, normals: g.attributes.normal.array });
          if (token !== this.token || !r.ao || !st.parent) return;
          const c = g.attributes.color; for (let i = 0; i < r.ao.length; i++) { const v = 0.35 + 0.65 * r.ao[i]; c.setXYZ(i, c.getX(i) * v, c.getY(i) * v, c.getZ(i) * v); } c.needsUpdate = true;
        };
        await Promise.all([strandShade(this.parts.hair), strandShade(this.parts.beard), shade('skin', this.skin, 'head'), shade('hair', this.parts.hair, 'head'), shade('beard', this.parts.beard, 'head'), shade('outfit', this.parts.outfit, 'body'), shade('headwear', this.parts.headwear, 'head')]);
        if (token !== this.token) return false;
        this.keys.ao = aoKey;
      }
    }
    return true;
  }

  /** Groomed hair: strands run along each style's flow, with a long soft highlight across them. */
  private groomHair(hair: any, style: HairStyle | 'beard') {
    const T = this.T;
    const flowOf: Record<string, (p: number[]) => number[]> = {
      short: (p) => (p[2] > 0.3 && p[1] > 0.5 ? [0.5, -0.3, 0.6] : [p[0] * 0.4, -0.5, -1]),
      sidepart: (p) => (p[1] > 0.45 ? [1, -0.2, p[2] > 0.3 ? 0.3 : -0.5] : [p[0] * 0.3, -1, -0.3]),
      quiff: (p) => (p[2] > 0.2 && p[1] > 0.6 ? [0, 1, -0.5] : [p[0] * 0.3, -0.3, -1]),
      buzz: (p) => [p[0] * 0.3, -0.4, -1],
      curly: (p) => [Math.sin(p[1] * 9), Math.cos(p[0] * 9), Math.sin(p[2] * 9)],
      afro: (p) => [Math.sin(p[1] * 7), Math.cos(p[2] * 7), Math.sin(p[0] * 7)],
      long: (p) => [p[0] * 0.25, -1, p[1] > 0.6 ? 0.4 : 0],
      bob: (p) => [p[0] * 0.3, -1, p[1] > 0.6 ? 0.4 : 0.1],
      bun: (p) => [-p[0] * 0.3, 0.8, -1],
      beard: (p) => [p[0] * 0.15, -1, 0.2],
    };
    const flow = flowOf[style] ?? flowOf.short;
    const g = hair.geometry, pos = g.attributes.position, nor = g.attributes.normal;
    const tan = new Float32Array(pos.count * 4); const t = new T.Vector3(), n = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const f = flow([pos.getX(i), pos.getY(i), pos.getZ(i)]);
      n.set(nor.getX(i), nor.getY(i), nor.getZ(i)); t.set(f[0], f[1], f[2]);
      t.addScaledVector(n, -t.dot(n)); if (t.lengthSq() < 1e-6) t.set(1, 0, 0).addScaledVector(n, -n.x); t.normalize();
      tan[i * 4] = t.x; tan[i * 4 + 1] = t.y; tan[i * 4 + 2] = t.z; tan[i * 4 + 3] = 1;
    }
    g.setAttribute('tangent', new T.BufferAttribute(tan, 4));
    const m = hair.material;
    const curls = style === 'curly' || style === 'afro';
    Object.assign(m, { roughness: curls ? 0.8 : 0.5, anisotropy: curls ? 0 : 0.8, anisotropyRotation: Math.PI / 2, bumpMap: null, sheen: 0.25, clearcoat: 0.0, specularIntensity: curls ? 0.3 : 1 });
    m.needsUpdate = true;
  }

  // ── expressions as morph targets on the face ──
  private jawDelta(x: number, y: number, z: number, A: ReturnType<typeof anatomy>, out: number[]) {
    const ax = Math.abs(x);
    let w = sstep(A.mouthY + 0.012, A.mouthY - 0.05, y); // everything below the mouth line
    w *= 1 - sstep(0.5, 0.82, ax);                        // not the ears / back of the jaw
    w *= 1 - sstep(-1.05, -1.4, y);                       // the neck stays
    w *= sstep(-0.45, -0.05, z);                          // the face, not the back of the neck
    w *= 1 - 0.9 * sstep(A.mouthW * 0.5, A.mouthW * 1.1, ax) * gauss((y - A.mouthY) ** 2, 0.05); // the lips open in a lens shape; corners stay closed
    const ang = 0.32 * w, [px, py, pz] = this.jawPivot; // rotate the jaw open around below the ears
    const dy = y - py, dz = z - pz;
    out[0] = 0; out[1] = dy * Math.cos(ang) - dz * Math.sin(ang) + py - y; out[2] = dy * Math.sin(ang) + dz * Math.cos(ang) + pz - z;
    void px;
  }
  private addJawMorph(g: any) {
    const A = this.A!; const p = g.attributes.position; const d = new Float32Array(p.count * 3), o = [0, 0, 0];
    for (let i = 0; i < p.count; i++) { this.jawDelta(p.getX(i), p.getY(i), p.getZ(i), A, o); d[i * 3] = o[0]; d[i * 3 + 1] = o[1]; d[i * 3 + 2] = o[2]; }
    g.morphAttributes.position = [new this.T.BufferAttribute(d, 3)]; g.morphTargetsRelative = true;
  }
  private addMorphs(g: any, shape: FaceShape) {
    const A = anatomy(shape); const p = g.attributes.position; const n = p.count;
    const targets: Record<MorphName, Float32Array> = Object.fromEntries(MORPHS.map((k) => [k, new Float32Array(n * 3)])) as never;
    const o = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x), side = x >= 0 ? 1 : -1; // +x = the character's left
      const front = sstep(0.2, 0.6, z);
      const set = (k: MorphName, dx: number, dy: number, dz: number) => { targets[k][i * 3] = dx; targets[k][i * 3 + 1] = dy; targets[k][i * 3 + 2] = dz; };
      this.jawDelta(x, y, z, A, o); set('jawOpen', o[0], o[1], o[2]);
      // smile: corners out, up and back; cheeks lift
      const corner = gauss((ax - A.mouthW) ** 2 + (y - A.mouthY) ** 2, 0.11) * front;
      const cheek = gauss((ax - 0.42) ** 2 + (y + 0.28) ** 2, 0.16) * front;
      const sm = [side * 0.045 * corner, 0.055 * corner + 0.03 * cheek, -0.025 * corner + 0.012 * cheek];
      set(side > 0 ? 'mouthSmileLeft' : 'mouthSmileRight', sm[0], sm[1], sm[2]);
      set(side > 0 ? 'mouthFrownLeft' : 'mouthFrownRight', side * 0.01 * corner, -0.05 * corner, 0);
      // pucker: lips forward and in
      const lips = gauss(x * x * 0.7 + (y - A.mouthY) ** 2, 0.1) * front;
      set('mouthPucker', -x * 0.35 * lips, 0, 0.07 * lips);
      // brows
      const inner = gauss((ax - 0.12) ** 2 + (y - A.browY) ** 2, 0.1) * front;
      const outer = gauss((ax - A.eyeX - 0.1) ** 2 + (y - A.browY) ** 2, 0.12) * front;
      const brow = gauss((ax - A.eyeX) ** 2 + (y - A.browY) ** 2 * 1.5, 0.16) * front;
      set('browInnerUp', 0, 0.05 * inner, 0);
      set(side > 0 ? 'browOuterUpLeft' : 'browOuterUpRight', 0, 0.045 * outer, 0);
      set(side > 0 ? 'browDownLeft' : 'browDownRight', -side * 0.012 * brow, -0.04 * brow, 0.01 * brow);
      const puff = gauss((ax - 0.4) ** 2 + (y + 0.42) ** 2, 0.17) * front;
      set('cheekPuff', side * 0.05 * puff, 0, 0.04 * puff);
    }
    g.morphAttributes.position = MORPHS.map((k) => new this.T.BufferAttribute(targets[k], 3));
    g.morphTargetsRelative = true;
  }

  private paintSkin(look: CharacterLook) {
    const T = this.T, A = this.A!; const g = this.skin.geometry; const p = g.attributes.position, c = g.attributes.color;
    const skin = new T.Color(look.skinTone), blush = skin.clone().lerp(new T.Color('#d4566a'), 0.3), deep = skin.clone().multiplyScalar(0.78);
    const lip = skin.clone().lerp(new T.Color('#b8485c'), 0.35 + look.lipTint * 0.35);
    const freck = skin.clone().multiplyScalar(0.72); const r = rng(5); const tmp = new T.Color();
    const stub = skin.clone().lerp(new T.Color(look.beardColor), 0.75);
    const inner = new T.Color('#7a3036'), nrm = g.attributes.normal;
    const ao = this.skinAO && this.skinAO.length === p.count ? this.skinAO : null;
    const bp = this.browProfile(look), browTint = new T.Color(look.hair === 'bald' ? look.beardColor : look.hairColor).lerp(skin, 0.35);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x);
      tmp.copy(skin);
      const front = sstep(0.3, 0.7, z);
      tmp.lerp(blush, Math.min(0.85, gauss((ax - 0.45) ** 2 + (y + 0.3) ** 2, 0.15) * front * 0.9 + gauss(x * x + (y - A.noseTipY) ** 2, 0.08) * front * 0.6));
      tmp.lerp(deep, gauss((ax - A.eyeX) ** 2 + (y - A.eyeY) ** 2, A.eyeR * 0.9) * front * 0.45); // soft shade in the sockets
      tmp.lerp(blush, sstep(0.8, 0.95, ax) * (1 - sstep(0.1, 0.3, Math.abs(y - A.eyeY + 0.12))) * 0.6); // ears
      const lipW = gauss(x * x / (A.mouthW * A.mouthW * 1.2) * 0.012 + (y - A.mouthY) ** 2, A.lip * 1.0) * sstep(0.75, 0.86, z) * (1 - sstep(A.mouthW * 0.9, A.mouthW * 1.08, ax));
      tmp.lerp(lip, Math.min(1, lipW * 2.2));
      { // a soft shadow of colour under the brow hairs
        const bu = (ax - (bp.cx - bp.len / 2)) / bp.len;
        if (bu > -0.05 && bu < 1.05 && front > 0) {
          const uu = Math.max(0, Math.min(1, bu)), th = bp.inner * (1 - uu) + bp.outer * uu, cy = bp.cy + Math.sin(uu * Math.PI) * bp.arch + uu * 0.01;
          tmp.lerp(browTint, Math.max(0, 1 - Math.abs(y - cy) / (th * 0.6)) * sstep(-0.05, 0.08, bu) * (1 - sstep(0.92, 1.05, bu)) * 0.45);
        }
      }
      // the inside of the lips (seen when the mouth opens) is darker and redder
      const ny = Math.abs(nrm.getY(i));
      tmp.lerp(inner, sstep(0.35, 0.75, ny) * gauss((y - A.mouthY) ** 2, 0.035) * (1 - sstep(A.mouthW * 1.02, A.mouthW * 1.25, ax)) * sstep(0.62, 0.8, z) * 0.9);
      // soft shading in the creases: mouth corners and nostrils
      tmp.lerp(deep, gauss((ax - A.mouthW * 1.02) ** 2 + (y - A.mouthY + 0.01) ** 2, 0.03) * front * 0.65);
      tmp.lerp(deep.clone().multiplyScalar(0.7), gauss((ax - 0.05 * A.noseW - 0.01) ** 2 + (y - A.noseTipY + 0.085) ** 2, 0.022) * front * 0.85);
      if (look.beard === 'stubble' || look.beard === 'short') {
        const sd = Math.max(0, Math.min(1, (ax - 0.35) / 0.45)), top = A.mouthY + 0.1 + sd * sd * sd * 0.5;
        const region = sstep(top + 0.04, top - 0.08, y) * sstep(-0.5, 0.0, z) * (1 - sstep(-1.15, -1.3, y)) * (1 - Math.min(1, lipW * 3));
        if (region > 0) tmp.lerp(stub, region * (look.beard === 'short' ? 0.4 : 0.22));
      }
      if (look.freckles && front > 0.5 && gauss((ax - 0.3) ** 2 + (y + 0.12) ** 2, 0.16) > 0.35 && r() > 0.86) tmp.lerp(freck, 0.6);
      if (ao) tmp.multiplyScalar(0.25 + 0.75 * ao[i]); // soft contact shadow, a little warm in the creases
      c.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    c.needsUpdate = true;
    this.skin.material.sheenColor.copy(skin).lerp(new T.Color('#ff7a60'), 0.35);
    for (const e of this.eyes) for (const lid of [e.upper, e.lower]) lid.traverse((o: any) => { if (o.material?.userData?.skin) o.material.color.copy(skin); });
  }

  private buildEyes(look: CharacterLook) {
    const T = this.T, A = this.A!;
    const g = new T.Group(); this.eyes = [];
    const white = new T.MeshPhysicalMaterial({ color: 0xf4f1ec, roughness: 0.25 });
    const cornea = new T.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0, clearcoat: 1, clearcoatRoughness: 0, depthWrite: false });
    const lash = new T.MeshStandardMaterial({ color: 0x15100d, roughness: 0.6 });
    const lidShadow = new T.MeshBasicMaterial({ color: 0x2a1410, transparent: true, depthWrite: false, alphaMap: this.eyeShadowTexture() });
    const wetMat = new T.MeshPhysicalMaterial({ color: 0xffe6e0, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.55 });
    const lidSkin = () => { const m = this.softSkin(new T.MeshPhysicalMaterial({ color: new T.Color(look.skinTone), roughness: 0.55, specularIntensity: 0.45, sheen: 0.35, sheenColor: new T.Color('#ff8a70'), side: T.DoubleSide })); m.userData.skin = true; return m; };
    for (const side of [1, -1] as const) {
      const holder = new T.Group(); holder.position.set(side * A.eyeX, A.eyeY, A.eyeZ); g.add(holder);
      const ball = new T.Group(); holder.add(ball);
      ball.add(new T.Mesh(new T.SphereGeometry(A.eyeR, 48, 32), white));
      const irisR = A.eyeR * 0.7;
      const iris = new T.Mesh(new T.SphereGeometry(A.eyeR * 1.004, 64, 16, 0, Math.PI * 2, 0, Math.asin(irisR / A.eyeR)), new T.MeshPhysicalMaterial({ roughness: 0.3 }));
      iris.rotation.x = Math.PI / 2; iris.name = 'iris'; ball.add(iris);
      const dome = new T.Mesh(new T.SphereGeometry(A.eyeR * 1.03, 48, 16, 0, Math.PI * 2, 0, Math.asin(irisR * 1.1 / A.eyeR)), cornea); dome.rotation.x = Math.PI / 2; ball.add(dome);
      const hl = new T.MeshBasicMaterial({ color: 0xffffff });
      for (const [hx, hy, hr] of [[-0.3, 0.34, 0.17], [0.28, -0.26, 0.07]]) {
        const d = new T.Mesh(new T.CircleGeometry(A.eyeR * hr, 20), hl); const x = A.eyeR * hx, y = A.eyeR * hy;
        d.position.set(x, y, Math.sqrt((A.eyeR * 1.035) ** 2 - x * x - y * y)); ball.add(d);
      }
      // the shadow the upper lid and the socket cast on the eye (fixed to the head, not the eyeball)
      const shade = new T.Mesh(new T.SphereGeometry(A.eyeR * 1.008, 48, 24), lidShadow); holder.add(shade);
      // a wet line along the lower lid
      const wetPts = []; for (let i = 0; i <= 24; i++) { const a = Math.PI * (0.18 + 0.64 * (i / 24)); wetPts.push(new T.Vector3(Math.cos(a) * A.eyeR * 1.02, -A.eyeR * 0.62, Math.sin(a) * A.eyeR * 0.82)); }
      const wet = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(wetPts), 32, 0.006, 6, false), wetMat); holder.add(wet);
      // lids: skin shells with a lash line on the edge; they rotate to blink
      const mkLid = (upper: boolean) => {
        const lid = new T.Group(); holder.add(lid);
        const shell = new T.Mesh(new T.SphereGeometry(A.eyeR * 1.06, 48, 20, 0, Math.PI * 2, upper ? 0 : Math.PI / 2, Math.PI / 2), lidSkin()); lid.add(shell);
        const pts = []; for (let i = 0; i <= 28; i++) { const a = Math.PI * (0.1 + 0.8 * (i / 28)); pts.push(new T.Vector3(Math.cos(a) * A.eyeR * 1.07, 0, Math.sin(a) * A.eyeR * 1.07)); }
        const thickness = upper ? 0.016 : 0.007;
        const line = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 40, thickness, 8, false), lash); lid.add(line);
        if (upper) { // a few lashes flicking out at the outer corner
          for (let i = 0; i < 4; i++) {
            const a = Math.PI * (side > 0 ? 0.14 + i * 0.05 : 0.86 - i * 0.05);
            const c = new T.Mesh(new T.ConeGeometry(0.008, 0.06, 6), lash);
            c.position.set(Math.cos(a) * A.eyeR * 1.1, 0.012, Math.sin(a) * A.eyeR * 1.1); c.rotation.set(0.4, 0, (side > 0 ? -1 : 1) * (0.9 + i * 0.1)); lid.add(c);
          }
        }
        return lid;
      };
      const upper = mkLid(true), lower = mkLid(false);
      this.eyes.push({ ball, upper, lower, side });
    }
    this.replace('eyes', g);
  }
  private paintEyes(look: CharacterLook) {
    const tex = this.irisTexture(look.eyeColor);
    for (const e of this.eyes) e.ball.traverse((o: any) => { if (o.name === 'iris') { o.material.map?.dispose?.(); o.material.map = tex; o.material.needsUpdate = true; } });
    for (const e of this.eyes) for (const lid of [e.upper, e.lower]) lid.traverse((o: any) => { if (o.material?.userData?.skin) o.material.color.set(look.skinTone); });
  }

  private buildMouth(look: CharacterLook) {
    const T = this.T, A = this.A!; void look;
    const g = new T.Group();
    const cavity = new T.Mesh(new T.SphereGeometry(1, 32, 20), new T.MeshStandardMaterial({ color: 0x3a1014, roughness: 0.9 }));
    cavity.scale.set(A.mouthW * 0.95, 0.16, 0.2); cavity.position.set(0, A.mouthY - 0.05, 0.68); g.add(cavity);
    const teethMat = new T.MeshPhysicalMaterial({ color: 0xf6f1e8, roughness: 0.25, clearcoat: 0.5 });
    const upperTeeth = new T.Mesh(new T.TorusGeometry(A.mouthW * 0.55, 0.032, 12, 32, Math.PI * 0.62), teethMat);
    upperTeeth.rotation.set(Math.PI / 2, 0, Math.PI * 0.19); upperTeeth.scale.set(1, 0.75, 1.6); upperTeeth.position.set(0, A.mouthY - 0.01, 0.72); g.add(upperTeeth);
    // the jaw: lower teeth and tongue open with it
    const jaw = new T.Group(); jaw.position.set(0, this.jawPivot[1], this.jawPivot[2]); g.add(jaw);
    const lowerTeeth = upperTeeth.clone(); lowerTeeth.position.set(0, A.mouthY - 0.06 - this.jawPivot[1], 0.71 - this.jawPivot[2]); jaw.add(lowerTeeth);
    const tongue = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshPhysicalMaterial({ color: 0xc0505f, roughness: 0.35, clearcoat: 0.4 }));
    tongue.scale.set(A.mouthW * 0.7, 0.06, 0.16); tongue.position.set(0, A.mouthY - 0.09 - this.jawPivot[1], 0.66 - this.jawPivot[2]); jaw.add(tongue);
    this.jaw = jaw;
    this.replace('mouth', g);
  }

  private buildBrows(look: CharacterLook) {
    const T = this.T, A = this.A!;
    const g = new T.Group(); this.brows = [];
    const color = look.hair === 'bald' ? look.beardColor : look.hairColor;
    const mat = new T.MeshPhysicalMaterial({ color: new T.Color(color).multiplyScalar(0.85), vertexColors: true, roughness: 0.55, specularIntensity: 0.4, side: T.DoubleSide });
    const prof = this.browProfile(look);
    const field = headField(look.shape); const e = 0.004;
    const onSkin = (x: number, y: number, lift: number) => {
      let zz = 1.2; for (let it = 0; it < 30; it++) { const d = field(x, y, zz); if (d < 0.003) break; zz -= Math.max(0.003, d * 0.8); }
      const n = new T.Vector3(field(x + e, y, zz) - field(x - e, y, zz), field(x, y + e, zz) - field(x, y - e, zz), field(x, y, zz + e) - field(x, y, zz - e)).normalize();
      return { p: new T.Vector3(x, y, zz).addScaledVector(n, lift), n };
    };
    const r = rng(23);
    for (const side of [1, -1] as const) {
      // individual brow hairs: rising at the inner end, combed outward along the brow
      const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
      const count = Math.round(260 * (prof.inner + prof.outer) / 0.11);
      for (let h = 0; h < count; h++) {
        const u = r(), v = r() - 0.5, th = prof.inner * (1 - u) + prof.outer * u;
        const x0 = side * (prof.cx - prof.len / 2 + u * prof.len), y0 = prof.cy + Math.sin(u * Math.PI) * prof.arch + u * 0.01 + v * th * 0.9;
        const dir = new T.Vector2(side * (0.25 + u * 0.9), u < 0.2 ? 1 : 0.35 - u * 0.45).normalize();
        const len = 0.045 + r() * 0.03, w = 0.006 + r() * 0.003, tone = 0.75 + r() * 0.35;
        const base = pos.length / 3;
        for (let k = 0; k <= 3; k++) {
          const t = k / 3; const s0 = onSkin(x0 + dir.x * len * t, y0 + dir.y * len * t, 0.004 + t * 0.006);
          const b = new T.Vector3(-dir.y, dir.x, 0).multiplyScalar(w * 0.5 * (1 - t * 0.85));
          for (const sg of [-1, 1]) { pos.push(s0.p.x + b.x * sg, s0.p.y + b.y * sg, s0.p.z + b.z * sg); nor.push(s0.n.x, s0.n.y, s0.n.z); const c = tone * (0.7 + 0.3 * t); col.push(c, c, c); }
          if (k) { const a = base + (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
      const mesh = new T.Mesh(geo, mat); g.add(mesh);
      this.brows.push({ mesh, side, base: [0, 0, 0] });
    }
    this.replace('brows', g);
  }

  private browProfile(look: CharacterLook) {
    const A = this.A!;
    const p = { soft: [0.07, 0.04, 0.05], straight: [0.065, 0.05, 0.0], arched: [0.06, 0.032, 0.1], thick: [0.095, 0.07, 0.04], thin: [0.04, 0.024, 0.06] }[look.brows];
    return { inner: p[0], outer: p[1], arch: p[2], len: 0.38, cx: A.eyeX + 0.02, cy: A.browY };
  }

  private buildGlasses(look: CharacterLook) {
    if (look.glasses === 'none') return null;
    const T = this.T, A = this.A!; const g = new T.Group();
    const metal = look.glasses === 'aviator';
    const frame = new T.MeshPhysicalMaterial({ color: new T.Color(look.glassesColor), roughness: metal ? 0.2 : 0.3, metalness: metal ? 0.9 : 0, clearcoat: metal ? 0 : 0.8 });
    const lens = new T.MeshPhysicalMaterial({ color: look.glasses === 'shades' ? 0x0e0e10 : look.glasses === 'aviator' ? 0x9a7656 : 0xffffff, transparent: true, opacity: look.glasses === 'shades' ? 0.9 : look.glasses === 'aviator' ? 0.38 : 0.07, roughness: 0.05, clearcoat: 1, depthWrite: false });
    const zf = A.eyeZ + A.eyeR + 0.13, w = A.eyeR * 1.25;
    const shape = (s: number) => {
      const sh = new T.Shape();
      if (look.glasses === 'square') { const hw = w * 1.08, hh = w * 0.82, r = 0.05; sh.moveTo(-hw + r, -hh); sh.lineTo(hw - r, -hh); sh.quadraticCurveTo(hw, -hh, hw, -hh + r); sh.lineTo(hw, hh - r); sh.quadraticCurveTo(hw, hh, hw - r, hh); sh.lineTo(-hw + r, hh); sh.quadraticCurveTo(-hw, hh, -hw, hh - r); sh.lineTo(-hw, -hh + r); sh.quadraticCurveTo(-hw, -hh, -hw + r, -hh); }
      else if (look.glasses === 'aviator' || look.glasses === 'shades') { sh.moveTo(-w * s, w * 0.72); sh.bezierCurveTo(0.2 * w * s, w * 0.85, w * 1.12 * s, w * 0.72, w * 1.12 * s, 0.05 * w); sh.bezierCurveTo(w * 1.12 * s, -w * 0.85, 0.25 * w * s, -w * 1.1, -0.4 * w * s, -w * 0.9); sh.bezierCurveTo(-w * s, -w * 0.7, -w * 1.12 * s, 0, -w * s, w * 0.72); }
      else sh.absarc(0, 0, w, 0, Math.PI * 2, false);
      return sh;
    };
    for (const s of [1, -1]) {
      const sh = shape(s);
      const l = new T.Mesh(new T.ShapeGeometry(sh, 24), lens);
      const ring = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(sh.getSpacedPoints(80).map((q: any) => new T.Vector3(q.x, q.y, 0)), true), 120, metal ? 0.014 : 0.024, 8, true), frame);
      for (const o of [l, ring]) { o.position.set(s * A.eyeX, A.eyeY, zf); o.rotation.y = s * 0.1; g.add(o); }
      const arm = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 1.05, 8), frame); arm.rotation.x = Math.PI / 2; arm.position.set(s * (A.eyeX + w + 0.03), A.eyeY + 0.06, zf - 0.52); g.add(arm);
    }
    const bridge = new T.Mesh(new T.TorusGeometry(A.eyeX - w, metal ? 0.012 : 0.02, 8, 16, Math.PI), frame); bridge.position.set(0, A.eyeY + 0.04, zf + 0.01); g.add(bridge);
    return g;
  }

  private buildExtra(look: CharacterLook) {
    if (look.extra === 'none') return null;
    const T = this.T, A = this.A!; const g = new T.Group();
    const mat = new T.MeshPhysicalMaterial({ color: new T.Color(look.extraColor), roughness: 0.3, metalness: look.extra === 'headphones' ? 0.2 : 0.9, clearcoat: 0.8 });
    if (look.extra === 'headphones') {
      const band = new T.Mesh(new T.TorusGeometry(A.hw * 1.12, 0.055, 16, 48, Math.PI), mat); band.position.set(0, 0.05, -0.05); g.add(band);
      for (const s of [1, -1]) { const cup = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.16, 32), mat); cup.rotation.z = Math.PI / 2; cup.position.set(s * A.hw * 1.04, -0.1, -0.1); g.add(cup); const pad = new T.Mesh(new T.TorusGeometry(0.2, 0.06, 12, 32), new T.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 })); pad.rotation.y = Math.PI / 2; pad.position.set(s * (A.hw * 1.04 - s * 0.09), -0.1, -0.1); g.add(pad); }
    }
    if (look.extra === 'earrings') for (const s of [1, -1]) { const r = new T.Mesh(new T.TorusGeometry(0.05, 0.012, 10, 24), mat); r.position.set(s * 0.9 * A.hw, A.eyeY - 0.36, -0.06); r.rotation.y = Math.PI / 2; g.add(r); }
    if (look.extra === 'chain') { const c = new T.Mesh(new T.TorusGeometry(0.5, 0.025, 10, 64), mat); c.rotation.x = Math.PI / 2 - 0.5; c.position.set(0, -1.55, 0.02); c.scale.set(1, 1.15, 1); g.add(c); }
    return g;
  }

  /** Face expression (0..1 weights) — from sliders, face tracking or lip sync. */
  setExpression(e: Expression) {
    this.expr = e;
    if (!this.skin) return;
    const inf = this.skin.morphTargetInfluences as number[];
    MORPHS.forEach((k, i) => { inf[i] = Math.max(0, Math.min(1, e[k] ?? 0)); });
    const jaw = Math.max(0, Math.min(1, e.jawOpen ?? 0));
    if (this.beard?.morphTargetInfluences) this.beard.morphTargetInfluences[0] = jaw;
    for (const c of this.beard?.children ?? []) if (c.morphTargetInfluences) c.morphTargetInfluences[0] = jaw;
    if (this.jaw) this.jaw.rotation.x = 0.32 * jaw;
    const A = this.A!;
    for (const eye of this.eyes) {
      const left = eye.side > 0; // the character's left eye
      const blink = Math.max(0, Math.min(1, ((left ? e.eyeBlinkLeft : e.eyeBlinkRight) ?? 0)));
      const wide = (left ? e.eyeWideLeft : e.eyeWideRight) ?? 0;
      eye.upper.rotation.x = -0.62 - wide * 0.2 + blink * 2.02;
      eye.lower.rotation.x = 0.62 - blink * 0.3;
      const lx = (e.eyeLookOutLeft ?? 0) - (e.eyeLookInLeft ?? 0), ly = (e.eyeLookDownLeft ?? 0) - (e.eyeLookUpLeft ?? 0);
      eye.ball.rotation.set(ly * 0.35, (left ? 1 : -1) * lx * 0.45, 0);
    }
    for (const b of this.brows) {
      const left = b.side > 0;
      const up = (e.browInnerUp ?? 0) * 0.04 + ((left ? e.browOuterUpLeft : e.browOuterUpRight) ?? 0) * 0.04 - ((left ? e.browDownLeft : e.browDownRight) ?? 0) * 0.04;
      b.mesh.position.set(0, up, 0.004 * Math.abs(up) / 0.04);
    }
    void A;
  }

  /** Head turn; the body follows a little. */
  setPose(p: HeadPose) { this.head.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ'); this.body.rotation.set(0, p.yaw * 0.25, p.roll * 0.15); }

  dispose() { for (const k of Object.keys(this.parts)) this.replace(k, null); }
}
