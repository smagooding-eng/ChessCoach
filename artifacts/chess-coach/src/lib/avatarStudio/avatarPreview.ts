// Avatar Studio 3D preview: the starter's procedural bust, drawn with the three.js build the app
// already ships (src/vendor/three-avatar.js, loaded only when the studio opens), so no new
// packages are needed. Drag to rotate, scroll or pinch to zoom.
//
// Extension points (NOT implemented yet):
//  - AvatarSource 'model': a generated, rigged GLB/VRM (e.g. from a selfie-to-3D provider) loaded
//    with GLTFLoader from the same vendored bundle, in place of the procedural bust.
//  - setExpression(): blendshape/viseme weights from face tracking or lip sync would drive the
//    face here. Today only the demo `talking` flag moves the mouth.

import type { AvatarConfig } from './avatarConfig';

type ThreeLib = typeof import('@/vendor/three-avatar.js');
type Three = ThreeLib['THREE'];
let lib: Promise<ThreeLib | null> | null = null;
export function loadAvatarThree(): Promise<ThreeLib | null> {
  lib ??= import('@/vendor/three-avatar.js').catch(() => { lib = null; return null; });
  return lib;
}

/** What the preview shows. Only 'procedural' exists today. */
export type AvatarSource = { kind: 'procedural' } | { kind: 'model'; url: string };

/** Future face animation input (blendshapes / visemes, 0..1). Not wired to anything yet. */
export type AvatarExpression = Partial<Record<'jawOpen' | 'eyeBlinkLeft' | 'eyeBlinkRight' | 'mouthSmile' | 'browInnerUp', number>>;

export class AvatarPreview {
  private T: Three;
  private renderer: InstanceType<Three['WebGLRenderer']>;
  private scene: InstanceType<Three['Scene']>;
  private camera: InstanceType<Three['PerspectiveCamera']>;
  private group: InstanceType<Three['Group']>;
  private mouth: InstanceType<Three['Mesh']> | null = null;
  private disposables: { dispose(): void }[] = [];
  private raf = 0;
  private start = performance.now();
  private ro: ResizeObserver;
  private orbit = { azimuth: 0, polar: Math.PI / 2 - 0.03, radius: 3.5 };
  private drag: { x: number; y: number } | null = null;
  private pinch: number | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  talking = false;

  private constructor(T: ThreeLib, private host: HTMLElement) {
    const THREE = T.THREE;
    this.T = THREE;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // what the starter's react-three-fiber canvas used by default
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a2324');
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
    pm.dispose();
    // softer than the starter's numbers so the swatch colours read true on screen
    this.scene.environmentIntensity = 0.5;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(3, 4, 5); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xcfe6ff, 0.6); rim.position.set(-3, 2, -4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    this.group = new THREE.Group(); this.group.position.set(0, -0.2, 0); this.scene.add(this.group);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindPointer();
    this.loop();
  }

  /** Builds the preview inside `host`, or null if this browser can't draw 3D. */
  static async create(host: HTMLElement): Promise<AvatarPreview | null> {
    const T = await loadAvatarThree();
    if (!T) return null;
    try { return new AvatarPreview(T, host); } catch { return null; }
  }

  setConfig(c: AvatarConfig) {
    const THREE = this.T;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.clear();
    const mat = (color: string, roughness: number, extra: Record<string, unknown> = {}) => {
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, ...extra }); this.disposables.push(m); return m;
    };
    const geo = <G extends { dispose(): void }>(g: G) => { this.disposables.push(g); return g; };
    const sphere = (r: number, w: number, h: number) => geo(new THREE.SphereGeometry(r, w, h));
    const add = (g: unknown, m: unknown, pos: [number, number, number], scale?: [number, number, number] | number, parent = this.group) => {
      const mesh = new THREE.Mesh(g as never, m as never);
      mesh.position.set(...pos);
      if (typeof scale === 'number') mesh.scale.setScalar(scale); else if (scale) mesh.scale.set(...scale);
      parent.add(mesh); return mesh;
    };
    const skin = mat(c.skinTone, 0.78), hair = mat(c.hairColor, 0.9), shirt = mat(c.shirtColor, 0.85), eyes = mat(c.eyeColor, 0.35);
    const dark = mat('#211b1c', 0.9), frame = mat('#d6ad43', 0.28, { metalness: 0.65 }), white = mat('#fffaf3', 0.5);
    const shine = new THREE.MeshBasicMaterial({ color: 0xffffff }); this.disposables.push(shine);

    // shoulders and neck
    add(sphere(0.9, 40, 32), shirt, [0, -1.18, 0], [1.05, 0.7, 0.55]);
    add(geo(new THREE.CylinderGeometry(0.42, 0.48, 1, 32)), skin, [0, -0.65, 0], [0.34, 0.55, 0.32]);
    // ears and head
    for (const s of [-1, 1]) add(sphere(1, 32, 24), skin, [s * 0.69, 0.08, 0], [0.22, 0.34, 0.16]);
    add(sphere(1, 48, 40), skin, [0, 0.1, 0], [0.68, 0.91, 0.58]);
    // hair
    if (c.hairStyle !== 'bald') {
      add(sphere(1, 40, 28), hair, [0, 0.67, -0.015], [0.69, 0.43, 0.61]);
      if (c.hairStyle === 'short') add(sphere(1, 32, 20), hair, [0, 0.43, 0.43], [0.58, 0.18, 0.19]);
      if (c.hairStyle === 'long') for (const s of [-1, 1]) add(sphere(1, 28, 20), hair, [s * 0.57, -0.05, -0.04], [0.18, 0.9, 0.38]);
      if (c.hairStyle === 'curly') for (let i = 0; i < 9; i++) add(sphere(0.16, 20, 16), hair, [(i - 4) * 0.14, 0.72 + (i % 2) * 0.05, 0.25]);
    }
    // eyes
    for (const s of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(s * 0.27, 0.19, 0.505); this.group.add(eye);
      add(sphere(1, 24, 20), white, [0, 0, 0], [0.19, 0.13, 0.055], eye);
      add(sphere(1, 24, 20), eyes, [0, 0, 0.047], [0.075, 0.09, 0.045], eye);
      add(sphere(1, 16, 12), shine, [0.018, 0.035, 0.085], 0.022, eye);
    }
    // nose, mouth
    add(sphere(1, 24, 20), skin, [0, -0.02, 0.61], [0.14, 0.2, 0.16]);
    this.mouth = add(sphere(1, 24, 16), dark, [0, -0.38, 0.55], [0.17, 0.25, 0.045]);
    // beard
    if (c.beard) add(sphere(1, 32, 24), hair, [0, -0.48, 0.35], [0.55, 0.43, 0.3]);
    // glasses
    if (c.glasses) {
      const gl = new THREE.Group(); gl.position.set(0, 0.18, 0.57); this.group.add(gl);
      for (const s of [-1, 1]) add(geo(new THREE.TorusGeometry(0.205, 0.025, 8, 48)), frame, [s * 0.27, 0, 0], undefined, gl);
      add(geo(new THREE.BoxGeometry(1, 1, 1)), frame, [0, 0, 0], [0.15, 0.025, 0.025], gl);
    }
  }

  /** Not implemented yet: face tracking / lip sync will set these. */
  setExpression(_e: AvatarExpression) { /* reserved for blendshape-driven models */ }

  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private placeCamera() {
    const { azimuth, polar, radius } = this.orbit;
    this.camera.position.set(radius * Math.sin(polar) * Math.sin(azimuth), 0.1 + radius * Math.cos(polar), radius * Math.sin(polar) * Math.cos(azimuth));
    this.camera.lookAt(0, 0.1, 0);
  }

  private bindPointer() {
    const el: HTMLCanvasElement = this.renderer.domElement;
    const clampPolar = (p: number) => Math.max(1.1, Math.min(1.9, p));
    const clampRadius = (r: number) => Math.max(2.8, Math.min(4.6, r));
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.drag = { x: e.clientX, y: e.clientY };
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.drag = null; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.orbit.radius = clampRadius(this.orbit.radius * (this.pinch / d)); this.pinch = d; return;
      }
      if (!this.drag) return;
      this.orbit.azimuth -= (e.clientX - this.drag.x) * 0.008;
      this.orbit.polar = clampPolar(this.orbit.polar - (e.clientY - this.drag.y) * 0.006);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    const end = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.drag = null; if (this.pointers.size < 2) this.pinch = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.orbit.radius = clampRadius(this.orbit.radius * (1 + Math.sign(e.deltaY) * 0.08)); }, { passive: false });
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = (performance.now() - this.start) / 1000;
    this.group.rotation.y = Math.sin(t * 0.45) * 0.12;
    this.group.position.y = -0.2 + Math.sin(t * 1.2) * 0.025;
    if (this.mouth) this.mouth.scale.y = this.talking ? 0.45 + Math.abs(Math.sin(t * 12)) * 1.5 : 0.25;
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const d of this.disposables) d.dispose();
    this.scene.environment?.dispose?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
