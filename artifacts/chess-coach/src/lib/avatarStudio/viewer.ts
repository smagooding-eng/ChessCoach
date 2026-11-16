// The Avatar Studio's 3D viewport, reusable anywhere a character is shown (studio, streams,
// and later Face Chat): lighting and background presets, drag to turn, zoom, front/side/rear
// views, idle life (breathing, blinking), and live driving from face tracking or a microphone.
// Uses the three.js build the app already ships (src/vendor/three-avatar.js).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Character, type Expression, type CharacterLook } from './head/character';
import { createMeshProvider, type MeshProvider } from './head/meshJobs';

type ThreeLib = typeof import('@/vendor/three-avatar.js');
let lib: Promise<ThreeLib | null> | null = null;
export function loadAvatarThree(): Promise<ThreeLib | null> {
  lib ??= import('@/vendor/three-avatar.js').catch(() => { lib = null; return null; });
  return lib;
}
let sharedMeshes: MeshProvider | null = null;
const meshes = () => (sharedMeshes ??= createMeshProvider());

export type Lighting = 'studio' | 'warm' | 'cool' | 'night';
export type Backdrop = 'chessscout' | 'dusk' | 'soft' | 'green';
export type View = 'front' | 'three' | 'side' | 'rear';
export const LIGHTINGS: { id: Lighting; label: string }[] = [{ id: 'studio', label: 'Studio' }, { id: 'warm', label: 'Warm' }, { id: 'cool', label: 'Cool' }, { id: 'night', label: 'Night' }];
export const BACKDROPS: { id: Backdrop; label: string; css: string }[] = [
  { id: 'chessscout', label: 'ChessScout', css: 'radial-gradient(circle at 50% 35%, #1d3328, #0b1213 60%, #050a0b)' },
  { id: 'dusk', label: 'Dusk', css: 'linear-gradient(160deg, #3a6fd8, #8a5ad0 55%, #d07ab0)' },
  { id: 'soft', label: 'Soft', css: 'radial-gradient(circle at 50% 30%, #f2efea, #cfc9c1)' },
  { id: 'green', label: 'Green', css: 'linear-gradient(180deg, #2b4a1e, #81b64c)' },
];

function gradientTexture(T: any, css: Backdrop) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 512; const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 512);
  const stops: Record<Backdrop, string[]> = { chessscout: ['#1d3328', '#0b1213', '#050a0b'], dusk: ['#3a6fd8', '#8a5ad0', '#d07ab0'], soft: ['#f2efea', '#e2ddd6', '#cfc9c1'], green: ['#2b4a1e', '#4f7a30', '#81b64c'] };
  stops[css].forEach((s, i) => g.addColorStop(i / 2, s)); c.fillStyle = g; c.fillRect(0, 0, 64, 512);
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
}

export class AvatarViewer {
  readonly character: Character;
  private T: any; private renderer: any; private scene: any; private camera: any;
  private lights: Record<string, any> = {};
  private raf = 0; private ro: ResizeObserver;
  private yaw = 0.0; private yawTarget = 0.0; private pitch = 0.04; private dist = 9.4; private distTarget = 9.4; private fit = 1;
  private focusY = -0.3; private focusTarget = -0.3;
  private pointers = new Map<number, { x: number; y: number }>(); private pinch = 0; private dragged = false;
  private start = performance.now(); private nextBlink = 1.5; private blinkUntil = 0;
  private demo: { name: string; until: number } | null = null;
  private live: Expression | null = null; private livePose = { yaw: 0, pitch: 0, roll: 0 };
  private voice: { analyser: AnalyserNode; buf: Uint8Array<ArrayBuffer>; ctx: AudioContext } | null = null;
  autoTurn = false;

  private constructor(T: ThreeLib, private host: HTMLElement) {
    const THREE = T.THREE; this.T = THREE;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const el: HTMLCanvasElement = this.renderer.domElement;
    Object.assign(el.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' });
    host.appendChild(el);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; pm.dispose();
    this.scene.environmentIntensity = 0.45;
    const key = new THREE.DirectionalLight(0xfff0e2, 2.0); key.position.set(-2.5, 3, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
    const fill = new THREE.DirectionalLight(0xd8e6ff, 0.6); fill.position.set(3, 0.5, 3);
    const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(1, 3, -5);
    const hemi = new THREE.HemisphereLight(0xfff6ee, 0x403030, 0.35);
    this.scene.add(key, fill, rim, hemi); this.lights = { key, fill, rim, hemi };
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
    this.character = new Character(THREE, meshes());
    try { if (matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4) this.character.strandDensity = 0.6; } catch { /* keep full detail */ }
    this.scene.add(this.character.root);
    this.setLighting('studio'); this.setBackdrop('chessscout');
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
    this.bindPointer();
    this.loop();
  }

  static async create(host: HTMLElement): Promise<AvatarViewer | null> {
    const T = await loadAvatarThree(); if (!T) return null;
    try { return new AvatarViewer(T, host); } catch { return null; }
  }

  /** Apply a look; draft = quick, lighter geometry while a slider is moving. */
  async setLook(look: CharacterLook, draft = false) { this.character.quality = draft ? 'draft' : 'full'; return this.character.setLook(look); }

  setLighting(l: Lighting) {
    const { key, fill, rim, hemi } = this.lights;
    const P: Record<Lighting, [number, number, number, number, number, number, number]> = {
      // key colour, key, fill colour, fill, rim colour, rim, ambient
      studio: [0xfff0e2, 2.0, 0xd8e6ff, 0.6, 0xffffff, 1.4, 0.35],
      warm: [0xffd2a0, 2.2, 0xffe4c8, 0.5, 0xffb070, 1.2, 0.3],
      cool: [0xe0ecff, 1.9, 0xa8c8ff, 0.7, 0x9fd0ff, 1.6, 0.3],
      night: [0xb8c8ff, 1.0, 0x6a7cff, 0.5, 0x81b64c, 2.4, 0.12],
    };
    const p = P[l];
    key.color.set(p[0]); key.intensity = p[1]; fill.color.set(p[2]); fill.intensity = p[3]; rim.color.set(p[4]); rim.intensity = p[5]; hemi.intensity = p[6];
  }
  setBackdrop(b: Backdrop) { this.scene.background?.dispose?.(); this.scene.background = gradientTexture(this.T, b); }

  view(v: View) { this.yawTarget = { front: 0, three: 0.6, side: Math.PI / 2, rear: Math.PI }[v]; }
  zoom(dir: 1 | -1) { this.distTarget = Math.max(3.4, Math.min(13, this.distTarget * (dir > 0 ? 0.85 : 1.18))); this.focusTarget = this.distTarget < 7 ? -0.05 : -0.3; }
  resetView() { this.yawTarget = 0; this.distTarget = 9.4; this.focusTarget = -0.3; }

  /** Show an expression for a moment (Smile, Laugh, Wow, Wink, Talk…). */
  playExpression(name: string, seconds = 2.2) { this.demo = { name, until: performance.now() / 1000 + seconds }; }

  /** Live face tracking: call every frame with the tracker's blendshapes and head turn. */
  setLiveFace(bs: Expression | null, pose?: { yaw: number; pitch: number; roll: number }) { this.live = bs; if (pose) this.livePose = pose; }

  /** Mouth follows a microphone (lip sync). Pass null to stop. */
  setVoice(stream: MediaStream | null) {
    if (this.voice) { void this.voice.ctx.close(); this.voice = null; }
    if (!stream) return;
    const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream); const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    src.connect(analyser); this.voice = { analyser, buf: new Uint8Array(new ArrayBuffer(analyser.fftSize)), ctx };
  }
  private voiceLevel() {
    if (!this.voice) return 0;
    this.voice.analyser.getByteTimeDomainData(this.voice.buf);
    let sum = 0; for (const v of this.voice.buf) { const d = (v - 128) / 128; sum += d * d; }
    return Math.min(1, Math.sqrt(sum / this.voice.buf.length) * 6);
  }

  /** A still picture of the current character (for thumbnails and sharing). */
  snapshot(): string { this.render(); return this.renderer.domElement.toDataURL('image/jpeg', 0.85); }

  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.fit = w / h < 0.85 ? 0.85 / (w / h) : 1; // narrow screens: step back so the head fits
  }

  private bindPointer() {
    const el: HTMLCanvasElement = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.dragged = false; el.style.cursor = 'grabbing';
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId); if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY }; this.pointers.set(e.pointerId, cur);
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.distTarget = Math.max(3.4, Math.min(13, this.distTarget * (this.pinch / d))); this.pinch = d; return;
      }
      this.yawTarget += (cur.x - prev.x) * 0.012; this.pitch = Math.max(-0.25, Math.min(0.35, this.pitch + (cur.y - prev.y) * 0.004)); this.dragged = true;
    });
    const end = (e: PointerEvent) => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch = 0; el.style.cursor = 'grab'; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }

  private expressionAt(t: number): Expression {
    if (this.live) return this.live;
    const e: Expression = {};
    // idle life: blinks and a hint of a smile
    if (t > this.nextBlink) { this.blinkUntil = t + 0.13; this.nextBlink = t + 2.2 + ((t * 7.3) % 1) * 3; }
    const blink = t < this.blinkUntil ? 1 : 0; e.eyeBlinkLeft = blink; e.eyeBlinkRight = blink;
    e.mouthSmileLeft = 0.12; e.mouthSmileRight = 0.12;
    if (this.demo && t < this.demo.until) {
      const k = Math.min(1, (this.demo.until - t) / 0.3, (t - (this.demo.until - 2.2)) / 0.25);
      const talk = Math.abs(Math.sin(t * 9)) * 0.55 + Math.abs(Math.sin(t * 13.7)) * 0.25;
      const D: Record<string, Expression> = {
        smile: { mouthSmileLeft: 1, mouthSmileRight: 1, cheekPuff: 0 },
        laugh: { mouthSmileLeft: 1, mouthSmileRight: 1, jawOpen: 0.55 + Math.sin(t * 16) * 0.15, eyeBlinkLeft: 0.55, eyeBlinkRight: 0.55, browInnerUp: 0.3 },
        wow: { jawOpen: 0.7, mouthPucker: 0.3, browInnerUp: 1, browOuterUpLeft: 1, browOuterUpRight: 1, eyeWideLeft: 1, eyeWideRight: 1 },
        wink: { eyeBlinkLeft: 1, mouthSmileLeft: 0.2, mouthSmileRight: 0.9, browDownLeft: 0.4 },
        angry: { browDownLeft: 1, browDownRight: 1, mouthFrownLeft: 0.8, mouthFrownRight: 0.8 },
        sad: { browInnerUp: 1, mouthFrownLeft: 1, mouthFrownRight: 1 },
        talk: { jawOpen: talk, mouthPucker: Math.max(0, Math.sin(t * 5)) * 0.3, browInnerUp: Math.max(0, Math.sin(t * 2)) * 0.4 },
      };
      for (const [n, v] of Object.entries(D[this.demo.name] ?? {})) (e as Record<string, number>)[n] = Math.max(0, Math.min(1, v as number)) * Math.max(0, k) + ((e as Record<string, number>)[n] ?? 0) * (1 - Math.max(0, k));
    }
    const lv = this.voiceLevel();
    if (lv > 0.05) e.jawOpen = Math.max(e.jawOpen ?? 0, lv * 0.9);
    return e;
  }

  private render() {
    const t = (performance.now() - this.start) / 1000;
    if (this.autoTurn && !this.pointers.size) this.yawTarget += 0.004;
    this.yaw += (this.yawTarget - this.yaw) * 0.12; this.dist += (this.distTarget - this.dist) * 0.12; this.focusY += (this.focusTarget - this.focusY) * 0.12;
    const breathe = Math.sin(t * 1.6) * 0.01;
    this.character.root.rotation.y = this.yaw;
    const live = this.live ? this.livePose : { yaw: Math.sin(t * 0.5) * 0.06, pitch: Math.sin(t * 0.37) * 0.03, roll: Math.sin(t * 0.43) * 0.02 };
    this.character.setPose(live);
    this.character.root.position.y = breathe;
    this.character.setExpression(this.expressionAt(t));
    const dd = this.dist * this.fit; this.camera.position.set(0, this.focusY + Math.sin(this.pitch) * dd, Math.cos(this.pitch) * dd);
    this.camera.lookAt(0, this.focusY, 0);
    this.renderer.render(this.scene, this.camera);
  }
  private loop = () => { this.raf = requestAnimationFrame(this.loop); this.render(); };

  dispose() { cancelAnimationFrame(this.raf); this.ro.disconnect(); this.setVoice(null); this.character.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}

/** Small pictures of a style option on the current character, made one at a time in the background. */
export class ThumbMaker {
  private renderer: any; private scene: any; private camera: any; private character: Character; private T: any;
  private queue: { key: string; look: CharacterLook; focus: 'face' | 'bust'; done: (url: string) => void }[] = [];
  private busy = false; private cache = new Map<string, string>();
  private constructor(T: ThreeLib) {
    const THREE = T.THREE; this.T = THREE;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); this.renderer.setSize(160, 160, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; pm.dispose(); this.scene.environmentIntensity = 0.5;
    const key = new THREE.DirectionalLight(0xfff0e2, 2.0); key.position.set(-2.5, 3, 5); const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(1, 3, -5);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xfff6ee, 0x403030, 0.4));
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
    this.character = new Character(THREE, meshes());
    try { if (matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4) this.character.strandDensity = 0.6; } catch { /* keep full detail */ } this.character.quality = 'draft'; this.scene.add(this.character.root);
  }
  static async create() { const T = await loadAvatarThree(); if (!T) return null; try { return new ThumbMaker(T); } catch { return null; } }
  request(key: string, look: CharacterLook, focus: 'face' | 'bust', done: (url: string) => void) {
    const hit = this.cache.get(key); if (hit) { done(hit); return; }
    this.queue = this.queue.filter((q) => q.key !== key); this.queue.push({ key, look, focus, done }); void this.pump();
  }
  clear() { this.queue = []; }
  private async pump() {
    if (this.busy) return; this.busy = true;
    while (this.queue.length) {
      const q = this.queue.shift()!;
      await this.character.setLook(q.look);
      this.character.root.rotation.y = 0.35; this.character.setExpression({ mouthSmileLeft: 0.3, mouthSmileRight: 0.3 });
      const bust = q.focus === 'bust';
      this.camera.position.set(0, bust ? -0.9 : -0.05, bust ? 9.5 : 7.0); this.camera.lookAt(0, bust ? -0.9 : -0.05, 0);
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL('image/png'); this.cache.set(q.key, url); q.done(url);
      await new Promise((r) => setTimeout(r, 0));
    }
    this.busy = false;
  }
  dispose() { this.queue = []; this.character.dispose(); this.renderer.dispose(); }
}
