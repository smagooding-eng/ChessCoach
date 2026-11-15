// 3D cartoon head for Streamer Studio, in the spirit of a Memoji: a soft, rounded head
// that sits on top of the streamer's real body and copies their face live (head turns,
// blinks, eyes, eyebrows, talking, smiling). Built here from simple shapes with three.js
// (vendored, loaded only when used), so there is nothing to download or make elsewhere.

/* eslint-disable @typescript-eslint/no-explicit-any */
type ThreeLib = typeof import('@/vendor/three-avatar.js');
let lib: ThreeLib | null = null;
let loading: Promise<ThreeLib | null> | null = null;
export function loadThree(): Promise<ThreeLib | null> {
  if (lib) return Promise.resolve(lib);
  loading ??= import('@/vendor/three-avatar.js').then((m) => { lib = m; return m; }).catch(() => { loading = null; return null; });
  return loading;
}

export type MojiHair = 'short' | 'quiff' | 'buzz' | 'curly' | 'long' | 'bald';
export type MojiBeard = 'none' | 'stubble' | 'full' | 'goatee';
export type MojiMustache = 'none' | 'classic' | 'handlebar';
export type MojiGlasses = 'none' | 'round' | 'square' | 'aviator' | 'shades';
export interface MojiLook {
  skin: string; eyes: string;
  hair: MojiHair; hairColor: string;
  beard: MojiBeard; mustache: MojiMustache; beardColor: string;
  glasses: MojiGlasses; frame: string;
}
export const DEFAULT_MOJI: MojiLook = {
  skin: '#E0A987', eyes: '#4A3324', hair: 'short', hairColor: '#2B2522',
  beard: 'none', mustache: 'none', beardColor: '#2B2522', glasses: 'none', frame: '#1E1E1E',
};
export const MOJI_SKINS = ['#F6D3BD', '#EEC1A2', '#E0A987', '#C98E68', '#A86F4C', '#8A5638', '#6B3F28', '#4A2B1C'];
export const MOJI_HAIR_COLORS = ['#141210', '#2B2522', '#4A3020', '#7A4A2A', '#A8703A', '#D9B26B', '#B23A1E', '#8C8C8C', '#E8E4DC'];
export const MOJI_EYE_COLORS = ['#2E1E14', '#4A3324', '#6B4A2A', '#3D6B4A', '#3C6E9E', '#6E7F8C'];
export const MOJI_FRAMES = ['#1E1E1E', '#C9A24A', '#B8BCC2', '#7A3E1E', '#2E5FA8', '#B0303A'];
export const MOJI_HAIRS: { id: MojiHair; label: string }[] = [
  { id: 'short', label: 'Short' }, { id: 'quiff', label: 'Quiff' }, { id: 'buzz', label: 'Buzz' },
  { id: 'curly', label: 'Curly' }, { id: 'long', label: 'Long' }, { id: 'bald', label: 'Bald' },
];
export const MOJI_BEARDS: { id: MojiBeard; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'stubble', label: 'Stubble' }, { id: 'full', label: 'Full beard' }, { id: 'goatee', label: 'Goatee' },
];
export const MOJI_MUSTACHES: { id: MojiMustache; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'classic', label: 'Moustache' }, { id: 'handlebar', label: 'Handlebar' },
];
export const MOJI_GLASSES: { id: MojiGlasses; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'round', label: 'Round' }, { id: 'square', label: 'Square' },
  { id: 'aviator', label: 'Aviator' }, { id: 'shades', label: 'Sunglasses' },
];

export interface MojiPose {
  yaw: number; pitch: number; roll: number; // screen terms: + yaw = nose toward screen right, + pitch = down, roll in y-down radians
  mouth: number; smile: number; pucker: number; blinkL: number; blinkR: number; // blinkL/R = the screen-left / screen-right eye
  brow: number; lookX: number; lookY: number; // look: + = toward screen right / down
}

// Head shape: a soft egg with a narrower jaw. Units: head half-width ≈ 1.
const A = 0.92, B = 1.08, C = 0.95;
const taper = (y: number) => { const s = Math.min(1, Math.max(0, -y / B)); return { x: 1 - 0.24 * s ** 1.5, z: 1 - 0.1 * s }; };
function shapeHead(geo: any, scale = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1;
    const ux = p.getX(i) / r, uy = p.getY(i) / r, uz = p.getZ(i) / r;
    const y = uy * B, t = taper(y);
    p.setXYZ(i, ux * A * t.x * scale, y * scale, uz * C * t.z * scale);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
/** How far forward the face surface is at (x, y). */
function frontZ(x: number, y: number, scale = 1) {
  const t = taper(y);
  const ux = x / (A * t.x * scale), uy = y / (B * scale);
  return C * t.z * scale * Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
}

const SIZE = 512;
const MOUTH_Y = -0.5, EYE_Y = 0.1, EYE_X = 0.35, EYE_R = 0.19;

export class MojiHead {
  readonly canvas: HTMLCanvasElement;
  private T: any; private renderer: any; private scene: any; private camera: any;
  private root: any; private head: any; private neckHolder: any;
  private parts: any; // rebuilt when the look changes
  private eyes: { ball: any; lid: any; lash: any; x: number }[] = [];
  private brows: any[] = [];
  private mouth: { inner: any; lips: any; teeth: any; z: number } | null = null;
  private lookKey = '';
  private mouthKey = '';
  ok = false;

  constructor(T: ThreeLib) {
    this.T = T.THREE;
    const THREE = this.T;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch { return; }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(SIZE, SIZE, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 3, 5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 0.6); rim.position.set(-3, 2, -4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.camera.position.set(0, -0.12, 7.4); this.camera.lookAt(0, -0.12, 0);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.neckHolder = new THREE.Group(); this.scene.add(this.neckHolder);
    this.ok = true;
  }

  /** Forehead-to-chin height as a share of the picture, to line the head up with a real face. */
  static readonly FACE_SHARE = 0.5;

  private mat(color: string, rough = 0.6, extra: Record<string, unknown> = {}) {
    return new this.T.MeshStandardMaterial({ color: new this.T.Color(color), roughness: rough, metalness: 0, ...extra });
  }

  private build(look: MojiLook) {
    const THREE = this.T;
    if (this.parts) { this.root.remove(this.parts); this.parts.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    for (const o of [...this.neckHolder.children]) { this.neckHolder.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); }
    const g = new THREE.Group(); this.parts = g; this.root.add(g);
    this.eyes = []; this.brows = []; this.mouthKey = '';
    const skin = this.mat(look.skin, 0.55, { emissive: new THREE.Color(look.skin), emissiveIntensity: 0.06 });
    const skinShade = this.mat(new THREE.Color(look.skin).multiplyScalar(0.9).getStyle(), 0.6);

    // head, ears, nose, neck
    this.head = new THREE.Mesh(shapeHead(new THREE.SphereGeometry(1, 64, 48)), skin); g.add(this.head);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), skin);
      ear.scale.set(0.45, 1, 0.75); ear.position.set(s * A * 0.97, -0.02, -0.08); g.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), skinShade);
    nose.scale.set(0.95, 0.85, 0.8); nose.position.set(0, -0.14, frontZ(0, -0.14) + 0.02); g.add(nose);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.9, 32), skinShade);
    neck.position.set(0, -1.25, -0.12); this.neckHolder.add(neck);

    // eyes: white, iris, pupil, shine; skin lids that close
    for (const s of [-1, 1]) {
      const x = s * EYE_X, z = frontZ(x, EYE_Y) - 0.085;
      const holder = new THREE.Group(); holder.position.set(x, EYE_Y, z); g.add(holder);
      const ball = new THREE.Group(); holder.add(ball);
      ball.add(new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 32, 24), this.mat('#FBFBF8', 0.25)));
      // iris and pupil are curved caps on the eyeball, so a closing lid covers them fully
      const capOn = (r: number, lift: number, m: any) => {
        const c = new THREE.Mesh(new THREE.SphereGeometry(EYE_R + lift, 40, 8, 0, Math.PI * 2, 0, Math.asin(r / EYE_R)), m);
        c.rotation.x = Math.PI / 2; ball.add(c);
      };
      capOn(0.115, 0.001, this.mat(look.eyes, 0.35));
      capOn(0.058, 0.002, this.mat('#0A0807', 0.2));
      const shine = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(0.04, 0.045, Math.sqrt((EYE_R + 0.003) ** 2 - 0.04 ** 2 - 0.045 ** 2)); ball.add(shine);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(EYE_R + 0.012, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(look.skin, 0.55, { side: THREE.DoubleSide }));
      holder.add(lid);
      // closed-eye lash line, shown only during a blink
      const lash = new THREE.Mesh(new THREE.TorusGeometry(EYE_R * 0.78, 0.012, 8, 24, Math.PI), this.mat('#2A1C16', 0.6));
      lash.rotation.z = Math.PI; lash.position.set(0, 0.01, EYE_R + 0.016); lash.scale.set(1, 0.45, 1); holder.add(lash);
      this.eyes.push({ ball, lid, lash, x });
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 6, 12), this.mat(look.hair === 'bald' ? look.beardColor : look.hairColor, 0.8));
      brow.rotation.z = Math.PI / 2; g.add(brow); this.brows.push(brow);
    }

    // mouth (shapes rebuilt as it moves)
    const onBeard = look.beard === 'full' ? 0.055 : 0.012;
    this.mouth = {
      inner: new THREE.Mesh(new THREE.BufferGeometry(), this.mat('#3A1012', 0.7)),
      lips: new THREE.Mesh(new THREE.BufferGeometry(), this.mat(new THREE.Color(look.skin).lerp(new THREE.Color('#B4475A'), 0.45).getStyle(), 0.45)),
      teeth: new THREE.Mesh(new THREE.BufferGeometry(), this.mat('#F4F1EA', 0.35)),
      z: onBeard,
    };
    g.add(this.mouth.lips, this.mouth.inner, this.mouth.teeth);

    // hair
    const hairMat = this.mat(look.hairColor, 0.85);
    const cap = (thetaLen: number, scale: number, tilt: number) => {
      const m = new THREE.Mesh(shapeHead(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, thetaLen), scale), hairMat);
      m.rotation.x = -tilt; m.position.y = 0.02; g.add(m); return m;
    };
    if (look.hair === 'short' || look.hair === 'quiff' || look.hair === 'long') cap(Math.PI * 0.44, 1.06, 0.32);
    if (look.hair === 'buzz') cap(Math.PI * 0.42, 1.035, 0.3);
    if (look.hair === 'quiff') {
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), hairMat);
      tuft.scale.set(1.2, 0.5, 0.75); tuft.position.set(0.08, 1.02, 0.32); tuft.rotation.z = -0.15; g.add(tuft);
    }
    if (look.hair === 'long') {
      const back = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), hairMat);
      back.scale.set(1.05, 1.45, 0.62); back.position.set(0, -0.45, -0.42); g.add(back);
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 20), hairMat);
        side.scale.set(0.45, 1.6, 0.7); side.position.set(s * 0.98, -0.35, -0.05); g.add(side);
      }
    }
    if (look.hair === 'curly') {
      const n = 110, geo = new THREE.SphereGeometry(0.2, 14, 10);
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 1.25; // top down to about ear level
        const r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (z > 0.35 && y < 0.55) continue; // keep the forehead clear
        const ball = new THREE.Mesh(geo, hairMat);
        ball.position.set(x * A * 1.04, y * B * 1.04 + 0.04, z * C * 1.04 - 0.02); g.add(ball);
      }
    }

    // facial hair
    const beardMat = this.mat(look.beardColor, 0.9);
    if (look.beard === 'full' || look.beard === 'stubble') {
      const geo = shapeHead(new THREE.SphereGeometry(1, 64, 40, Math.PI / 2 - 1.95, 3.9, Math.PI * 0.53, Math.PI * 0.47), look.beard === 'full' ? 1.045 : 1.008);
      if (look.beard === 'full') {
        const p = geo.attributes.position; // a little fuller below the chin
        for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.75) p.setY(i, y - (-(y) - 0.75) * 0.35); }
        p.needsUpdate = true; geo.computeVertexNormals();
      }
      const m = new THREE.Mesh(geo, look.beard === 'full' ? beardMat : this.mat(look.beardColor, 1, { transparent: true, opacity: 0.32, depthWrite: false }));
      g.add(m);
    }
    if (look.beard === 'goatee') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), beardMat);
      m.scale.set(0.95, 0.85, 0.55); m.position.set(0, -0.86, frontZ(0, -0.86) + 0.02); g.add(m);
    }
    if (look.mustache !== 'none') {
      const z = frontZ(0, -0.34) + onBeard + 0.03;
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 12, 32, Math.PI), beardMat);
      m.scale.set(1.15, 0.55, 0.6); m.position.set(0, -0.42, z); g.add(m);
      if (look.mustache === 'handlebar') {
        for (const s of [-1, 1]) {
          const curl = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 10, 20, Math.PI * 1.3), beardMat);
          curl.position.set(s * 0.27, -0.36, z - 0.02); curl.rotation.z = s > 0 ? -0.9 : Math.PI - 2.2; g.add(curl);
        }
      }
    }

    // glasses
    if (look.glasses !== 'none') {
      const frameMat = look.glasses === 'aviator' ? this.mat(look.frame, 0.25, { metalness: 0.8 }) : this.mat(look.frame, 0.35);
      const lensMat = new THREE.MeshPhysicalMaterial({
        color: look.glasses === 'shades' ? 0x161616 : look.glasses === 'aviator' ? 0x8a6a50 : 0xffffff,
        transparent: true, opacity: look.glasses === 'shades' ? 0.88 : look.glasses === 'aviator' ? 0.32 : 0.08, roughness: 0.1, metalness: 0, depthWrite: false,
      });
      const zf = frontZ(EYE_X, EYE_Y) + 0.15;
      for (const s of [-1, 1]) {
        const square = look.glasses === 'square';
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.022, 10, square ? 4 : 48), frameMat);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.23, square ? 4 : 48), lensMat);
        for (const o of [ring, lens]) {
          o.position.set(s * EYE_X, EYE_Y - (look.glasses === 'aviator' || look.glasses === 'shades' ? 0.03 : 0), zf);
          if (square) { o.rotation.z = Math.PI / 4; o.scale.set(1.15, 0.95, 1); }
          if (look.glasses === 'aviator' || look.glasses === 'shades') o.scale.set(1.12, 0.98, 1);
          g.add(o);
        }
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 8), frameMat);
        arm.rotation.x = Math.PI / 2; arm.position.set(s * (EYE_X + 0.26), EYE_Y + 0.02, zf - 0.48); g.add(arm);
      }
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, EYE_X * 2 - 0.46, 8), frameMat);
      bridge.rotation.z = Math.PI / 2; bridge.position.set(0, EYE_Y + 0.05, zf + 0.01); g.add(bridge);
    }
  }

  /** The mouth outline: corners lift with a smile, the lower lip drops as it opens. */
  private shapeMouth(open: number, smile: number, pucker: number) {
    if (!this.mouth) return;
    const key = `${open.toFixed(2)}|${smile.toFixed(2)}|${pucker.toFixed(2)}`;
    if (key === this.mouthKey) return;
    this.mouthKey = key;
    const THREE = this.T;
    const w = 0.25 * (1 + smile * 0.25) * (1 - pucker * 0.4), lift = smile * 0.1, h = open * 0.34 + pucker * 0.05;
    const N = 24;
    // an outline from an upper edge and a lower edge, each a function of u (-1 corner … 1 corner)
    const outline = (ww: number, up: (u: number) => number, lo: (u: number) => number) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= N; i++) { const u = -1 + (2 * i) / N; pts.push([u * ww, MOUTH_Y + lift * u * u + up(u)]); }
      for (let i = N; i >= 0; i--) { const u = -1 + (2 * i) / N; pts.push([u * ww, MOUTH_Y + lift * u * u + lo(u)]); }
      return pts;
    };
    const bow = (u: number) => 1 - u * u;
    const inner = outline(w, (u) => bow(u) * 0.008, (u) => -bow(u) * (h + 0.012));
    const lips = outline(w * 1.12, (u) => bow(u) * 0.045 + 0.006, (u) => -bow(u) * (h + 0.06) - 0.006);
    const teethH = Math.min(h * 0.35, 0.06);
    const teeth = outline(w * 0.82, (u) => bow(u) * 0.004, (u) => bow(u) * 0.004 - bow(u) * teethH);
    const toGeo = (pts: [number, number][], dz: number) => {
      const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = new THREE.ShapeGeometry(shape, 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, frontZ(p.getX(i), p.getY(i)) + this.mouth!.z + dz);
      p.needsUpdate = true; geo.computeVertexNormals();
      return geo;
    };
    const swap = (mesh: any, geo: any) => { mesh.geometry.dispose(); mesh.geometry = geo; };
    swap(this.mouth.lips, toGeo(lips, 0.004));
    swap(this.mouth.inner, toGeo(inner, 0.008));
    this.mouth.teeth.visible = open > 0.12;
    if (open > 0.12) swap(this.mouth.teeth, toGeo(teeth, 0.011));
  }

  render(look: MojiLook, p: MojiPose): HTMLCanvasElement {
    if (!this.ok) return this.canvas;
    const key = JSON.stringify(look);
    if (key !== this.lookKey) { this.build(look); this.lookKey = key; }
    const cl = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    this.root.rotation.set(cl(p.pitch, -1, 1) * 0.5, cl(p.yaw, -1, 1) * 0.75, -p.roll, 'YXZ');
    // eyes: the screen-left eye is at -x
    for (const e of this.eyes) {
      const blink = cl(((e.x < 0 ? p.blinkL : p.blinkR) - 0.12) / 0.6);
      e.lid.rotation.x = -0.55 + blink * 2.1;
      e.lash.visible = blink > 0.75;
      e.ball.rotation.set(cl(p.lookY, -1, 1) * 0.35, cl(p.lookX, -1, 1) * 0.45, 0);
    }
    const br = cl(p.brow, -1, 1);
    this.brows.forEach((b, i) => {
      const s = i === 0 ? -1 : 1, y = EYE_Y + 0.31 + br * 0.07;
      b.position.set(s * EYE_X, y, frontZ(s * EYE_X, y) + 0.025);
      b.rotation.set(0, s * -0.25, Math.PI / 2 + s * (br < 0 ? br * 0.25 : br * 0.08));
    });
    this.shapeMouth(cl(p.mouth), cl(p.smile), cl(p.pucker));
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }

  dispose() { try { this.renderer?.dispose(); this.renderer?.forceContextLoss?.(); } catch { /* ignore */ } }
}

/** Skin, hair and facial hair colours read off the camera, to start the head looking like you. */
export function lookFromCamera(video: HTMLVideoElement, lm: { x: number; y: number }[], base: MojiLook): MojiLook | null {
  const W = video.videoWidth, H = video.videoHeight;
  if (!W || !H || lm.length < 455) return null;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true }); if (!c) return null;
  c.drawImage(video, 0, 0);
  const P = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const faceH = Math.hypot(P(152).x - P(10).x, P(152).y - P(10).y);
  const sample = (x: number, y: number, r: number) => {
    const d = c.getImageData(Math.max(0, Math.round(x - r)), Math.max(0, Math.round(y - r)), Math.max(1, Math.round(r * 2)), Math.max(1, Math.round(r * 2))).data;
    let R = 0, G = 0, Bl = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; Bl += d[i + 2]; n++; }
    return n ? [R / n, G / n, Bl / n] : [0, 0, 0];
  };
  const lum = (v: number[]) => 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
  const hex = (v: number[]) => `#${v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
  const r = faceH * 0.04;
  const cheeks = [sample(P(50).x, P(50).y, r), sample(P(280).x, P(280).y, r)];
  const skinV = [0, 1, 2].map((k) => (cheeks[0][k] + cheeks[1][k]) / 2);
  const top = P(10);
  const hairV = sample(top.x, top.y - faceH * 0.12, r * 1.5);
  const chinV = sample(P(152).x, P(152).y - faceH * 0.05, r);
  const lipTopV = sample(P(164).x, P(164).y, r * 0.6);
  const jawV = [sample(P(172).x, P(172).y, r), sample(P(397).x, P(397).y, r)];
  const sk = lum(skinV);
  const bald = Math.abs(lum(hairV) - sk) < 18 && Math.abs(hairV[0] - skinV[0]) < 22;
  const darkChin = lum(chinV) < sk * 0.68, darkJaw = jawV.every((v) => lum(v) < sk * 0.7);
  const mustache = lum(lipTopV) < sk * 0.72;
  const facial = darkChin ? hex(chinV.map((x) => x * 0.9)) : base.beardColor;
  return {
    ...base,
    skin: hex(skinV.map((x) => x * 1.04)),
    hair: bald ? 'bald' : base.hair === 'bald' ? 'short' : base.hair,
    hairColor: bald ? base.hairColor : hex(hairV.map((x) => x * 0.95)),
    beard: darkChin && darkJaw ? 'full' : darkChin ? 'goatee' : 'none',
    mustache: mustache ? (base.mustache === 'none' ? 'classic' : base.mustache) : 'none',
    beardColor: facial,
  };
}
