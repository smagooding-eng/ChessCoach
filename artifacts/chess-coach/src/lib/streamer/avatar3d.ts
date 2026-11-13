// Realistic 3D avatars for Streamer Studio. The streamer brings a 3D avatar file
// (.glb or .vrm, e.g. made from a selfie in Avaturn or MetaPerson, or in VRoid Studio),
// and it moves with them: head turns, blinks, smiles, mouth and eyebrows, driven by the
// same on-device face tracking. Rendered with three.js (vendored, loaded only when used).

/* eslint-disable @typescript-eslint/no-explicit-any */
type ThreeLib = typeof import('@/vendor/three-avatar.js');
let lib: ThreeLib | null = null;
let loading: Promise<ThreeLib | null> | null = null;
export function loadThree(): Promise<ThreeLib | null> {
  if (lib) return Promise.resolve(lib);
  loading ??= import('@/vendor/three-avatar.js').then((m) => { lib = m; return m; }).catch(() => { loading = null; return null; });
  return loading;
}

// ARKit face shapes (what MediaPipe reports) and the names other avatar makers use for them.
const ALIASES: Record<string, string[]> = {
  eyeBlinkLeft: ['eyeBlinkLeft', 'eyeBlink_L', 'EyeBlink_L', 'blink_l', 'Fcl_EYE_Close_L', 'blinkLeft'],
  eyeBlinkRight: ['eyeBlinkRight', 'eyeBlink_R', 'EyeBlink_R', 'blink_r', 'Fcl_EYE_Close_R', 'blinkRight'],
  jawOpen: ['jawOpen', 'JawOpen', 'mouthOpen', 'viseme_aa', 'Fcl_MTH_A', 'aa', 'A'],
  mouthSmileLeft: ['mouthSmileLeft', 'mouthSmile_L', 'Fcl_MTH_Joy'],
  mouthSmileRight: ['mouthSmileRight', 'mouthSmile_R', 'Fcl_MTH_Joy'],
  browInnerUp: ['browInnerUp', 'Fcl_BRW_Surprised'],
  browDownLeft: ['browDownLeft', 'Fcl_BRW_Angry'],
  browDownRight: ['browDownRight', 'Fcl_BRW_Angry'],
};
const HEAD_BONES = ['Head', 'head', 'J_Bip_C_Head', 'mixamorigHead', 'mixamorig:Head', 'CC_Base_Head', 'Bip01_Head'];
const NECK_BONES = ['Neck', 'neck', 'J_Bip_C_Neck', 'mixamorigNeck', 'mixamorig:Neck', 'CC_Base_NeckTwist01'];

export interface Avatar3DPose { yaw: number; pitch: number; roll: number; t: number; mirror: boolean; tracked: boolean; voice: number; blinkL: number; blinkR: number }

export class Avatar3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: any; private scene: any; private camera: any; private model: any = null;
  private morphs: { mesh: any; dict: Record<string, number> }[] = [];
  private head: any = null; private neck: any = null;
  private headRest: any = null; private neckRest: any = null;
  private headPos: any = null;
  private front = 1;
  private frameH = 0.55; // how much of the model fills the picture, in model units
  status: 'empty' | 'loading' | 'ready' | 'failed' = 'empty';
  faceShapes = 0; // how many expression shapes the model has (0 = head moves only)

  constructor(private T: ThreeLib) {
    const THREE = T.THREE;
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(0.6, 1.4, 1.2); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd36a, 0.9); rim.position.set(-1, 1.2, -1); this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223322, 0.6));
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  }

  async load(data: ArrayBuffer): Promise<boolean> {
    const THREE = this.T.THREE;
    this.status = 'loading';
    try {
      const loader = new this.T.GLTFLoader();
      // compressed avatar files (meshopt / Draco geometry, KTX2 textures)
      loader.setMeshoptDecoder(this.T.MeshoptDecoder);
      const draco = new this.T.DRACOLoader(); draco.setDecoderPath('/three-decoders/draco/'); loader.setDRACOLoader(draco);
      const ktx2 = new this.T.KTX2Loader(); ktx2.setTranscoderPath('/three-decoders/basis/'); ktx2.detectSupport(this.renderer); loader.setKTX2Loader(ktx2);
      const gltf: any = await new Promise((resolve, reject) => loader.parse(data, '', resolve, reject));
      if (this.model) this.scene.remove(this.model);
      this.model = gltf.scene;
      this.scene.add(this.model);
      this.morphs = []; this.head = null; this.neck = null;
      this.model.traverse((o: any) => {
        if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences) this.morphs.push({ mesh: o, dict: o.morphTargetDictionary });
        if (o.isMesh) { o.frustumCulled = false; }
        if (o.isBone || o.type === 'Bone') {
          if (!this.head && HEAD_BONES.includes(o.name)) this.head = o;
          if (!this.neck && NECK_BONES.includes(o.name)) this.neck = o;
        }
      });
      const names = new Set<string>(); for (const m of this.morphs) Object.keys(m.dict).forEach((k) => names.add(k));
      this.faceShapes = Object.values(ALIASES).filter((list) => list.some((n) => names.has(n))).length;
      this.headRest = this.head ? this.head.quaternion.clone() : null;
      this.neckRest = this.neck ? this.neck.quaternion.clone() : null;
      this.model.updateMatrixWorld(true);
      // frame head and shoulders
      const box = new THREE.Box3().setFromObject(this.model);
      const size = box.getSize(new THREE.Vector3());
      // a whole person in metres (what avatar makers export): tall and narrow-ish
      const fullBody = !!this.head && size.y > 1.0 && size.y < 3 && size.y > size.z * 2;
      if (fullBody) { this.headPos = this.head.getWorldPosition(new THREE.Vector3()); this.frameH = 0.55; }
      else { // a head-and-shoulders model, any scale
        this.headPos = box.getCenter(new THREE.Vector3());
        this.frameH = Math.max(size.y, size.x) * 1.35;
      }
      // models face +z by default (glTF); VRM 0.x faces -z
      this.front = this.faceDirection();
      this.status = 'ready';
      return true;
    } catch {
      this.status = 'failed';
      return false;
    }
  }

  private faceDirection(): number {
    // look for the eyes / nose: if they sit on the -z side, the model faces -z
    let z = 0, n = 0;
    this.model.traverse((o: any) => { if (/eye|nose/i.test(o.name) && !/brow|lash/i.test(o.name) && o.getWorldPosition) { const p = o.getWorldPosition(new this.T.THREE.Vector3()); z += p.z - (this.headPos?.z ?? 0); n++; } });
    return n && z / n < -0.005 ? -1 : 1;
  }

  /** Draws the avatar for this moment and returns the picture. */
  render(w: number, h: number, zoom: number, pose: Avatar3DPose, shapes: Record<string, number>): HTMLCanvasElement {
    const THREE = this.T.THREE;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    if (this.model) {
      // camera distance from the size slider
      const front = this.front;
      const fh = this.frameH / Math.max(0.5, zoom);
      const dist = (fh / 2) / Math.tan((this.camera.fov * Math.PI) / 360);
      const drop = fh * 0.12; // a little below the eyes, so shoulders show
      this.camera.near = dist / 50; this.camera.far = dist * 50; this.camera.updateProjectionMatrix();
      this.camera.position.set(this.headPos.x, this.headPos.y - drop * 0.3, this.headPos.z + front * dist);
      this.camera.lookAt(this.headPos.x, this.headPos.y - drop, this.headPos.z);
      // head and neck turn with the streamer (shared between neck and head looks natural)
      // pose is already in screen terms (mirrored when the preview is mirrored)
      const e = new THREE.Euler(pose.pitch * 0.45, pose.yaw * 0.75 * front, -pose.roll * front, 'YXZ');
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x * 0.5, e.y * 0.5, e.z * 0.5, 'YXZ'));
      if (this.head && this.headRest) this.head.quaternion.copy(this.headRest).multiply(q);
      if (this.neck && this.neckRest) this.neck.quaternion.copy(this.neckRest).multiply(q);
      // face expressions
      const s: Record<string, number> = { ...shapes };
      if (!pose.tracked) {
        s.jawOpen = Math.min(0.8, pose.voice * 1.6);
        s.eyeBlinkLeft = pose.blinkL; s.eyeBlinkRight = pose.blinkR;
        s.mouthSmileLeft = s.mouthSmileRight = 0.25;
      }
      if (pose.mirror) { // a mirror: your left eye closes the eye on the left of the screen
        const sw: Record<string, number> = {};
        for (const [k, v] of Object.entries(s)) sw[k.replace(/Left$/, '§').replace(/Right$/, 'Left').replace(/§$/, 'Right')] = v;
        Object.assign(s, sw);
      }
      for (const { mesh, dict } of this.morphs) {
        const inf = mesh.morphTargetInfluences;
        for (const [name, idx] of Object.entries(dict)) {
          let v = s[name];
          if (v === undefined) for (const [arkit, list] of Object.entries(ALIASES)) if (list.includes(name)) { v = s[arkit]; break; }
          if (v !== undefined) inf[idx] = inf[idx] + (Math.min(1, v) - inf[idx]) * 0.6;
        }
      }
      this.model.position.y = Math.sin(pose.t * 1.6) * this.frameH * 0.004;
    }
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }

  dispose() { try { this.renderer.dispose(); } catch { /* ignore */ } }
}

// The streamer's avatar file is kept on this device (IndexedDB), never uploaded.
const DB = 'cs_streamer', STORE = 'files', KEY = 'avatar3d';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
export async function saveAvatarFile(name: string, data: ArrayBuffer) {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put({ name, data }, KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export async function loadAvatarFile(): Promise<{ name: string; data: ArrayBuffer } | null> {
  try {
    const d = await db();
    return await new Promise((res) => { const tx = d.transaction(STORE, 'readonly'); const g = tx.objectStore(STORE).get(KEY); g.onsuccess = () => res((g.result as { name: string; data: ArrayBuffer }) ?? null); g.onerror = () => res(null); });
  } catch { return null; }
}
export async function clearAvatarFile() {
  try { const d = await db(); const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); } catch { /* ignore */ }
}
