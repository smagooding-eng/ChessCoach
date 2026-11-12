// Face tracking for streamer avatars, in the browser (MediaPipe Face Landmarker).
// Loaded from the CDN only when a streamer turns on a face disguise, so it adds
// nothing to the app bundle. Nothing leaves the device: frames are processed locally.

const VER = '0.10.14';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Everything in video pixels. */
export interface FacePose {
  x: number; y: number; size: number;   // face centre and forehead-to-chin height
  roll: number; yaw: number; pitch: number; // radians / -1..1 / -1..1
  mouth: number; blinkL: number; blinkR: number; smile: number; // 0..1
  brow: number; lookX: number; lookY: number; // -1..1
}

type Landmark = { x: number; y: number; z: number };
type Category = { categoryName: string; score: number };
interface LandmarkerResult { faceLandmarks?: Landmark[][]; faceBlendshapes?: { categories: Category[] }[] }
interface Landmarker { detectForVideo(v: HTMLVideoElement, ts: number): LandmarkerResult; close(): void }

export class FaceTracker {
  status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private lm: Landmarker | null = null;
  private loading: Promise<boolean> | null = null;
  private lastTs = 0;

  load(): Promise<boolean> {
    if (this.loading) return this.loading;
    this.status = 'loading';
    this.loading = (async () => {
      try {
        const url = `${BASE}/vision_bundle.mjs`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import(/* @vite-ignore */ url);
        const files = await mod.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
        const opts = (delegate: 'GPU' | 'CPU') => ({
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
        });
        try { this.lm = await mod.FaceLandmarker.createFromOptions(files, opts('GPU')); }
        catch { this.lm = await mod.FaceLandmarker.createFromOptions(files, opts('CPU')); }
        this.status = 'ready';
        return true;
      } catch {
        this.status = 'failed';
        this.loading = null;
        return false;
      }
    })();
    return this.loading;
  }

  detect(video: HTMLVideoElement): FacePose | null {
    if (!this.lm || video.readyState < 2 || !video.videoWidth) return null;
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    let res: LandmarkerResult;
    try { res = this.lm.detectForVideo(video, ts); } catch { return null; }
    const f = res.faceLandmarks?.[0];
    if (!f || f.length < 455) return null;
    const W = video.videoWidth, H = video.videoHeight;
    const P = (i: number) => ({ x: f[i].x * W, y: f[i].y * H });
    const top = P(10), chin = P(152), l = P(234), r = P(454), eyeL = P(33), eyeR = P(263), nose = P(1);
    const cx = (l.x + r.x) / 2, cy = (top.y + chin.y) / 2;
    const size = Math.hypot(chin.x - top.x, chin.y - top.y);
    const half = Math.max(1, Math.hypot(r.x - l.x, r.y - l.y) / 2);
    const bs: Record<string, number> = {};
    for (const c of res.faceBlendshapes?.[0]?.categories ?? []) bs[c.categoryName] = c.score;
    return {
      x: cx, y: cy, size,
      roll: Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x),
      yaw: Math.max(-1, Math.min(1, (nose.x - cx) / half)),
      pitch: Math.max(-1, Math.min(1, ((nose.y - cy) / size) * 4)),
      mouth: Math.min(1, (bs.jawOpen ?? 0) * 1.6),
      blinkL: bs.eyeBlinkLeft ?? 0, blinkR: bs.eyeBlinkRight ?? 0,
      smile: ((bs.mouthSmileLeft ?? 0) + (bs.mouthSmileRight ?? 0)) / 2,
      brow: Math.max(-1, Math.min(1, (bs.browInnerUp ?? 0) * 1.4 + ((bs.browOuterUpLeft ?? 0) + (bs.browOuterUpRight ?? 0)) * 0.4 - ((bs.browDownLeft ?? 0) + (bs.browDownRight ?? 0)) * 0.9)),
      // in the camera image: + = the person looks toward image-right
      lookX: Math.max(-1, Math.min(1, ((bs.eyeLookOutLeft ?? 0) + (bs.eyeLookInRight ?? 0) - (bs.eyeLookInLeft ?? 0) - (bs.eyeLookOutRight ?? 0)) * 0.9)),
      lookY: Math.max(-1, Math.min(1, ((bs.eyeLookDownLeft ?? 0) + (bs.eyeLookDownRight ?? 0) - (bs.eyeLookUpLeft ?? 0) - (bs.eyeLookUpRight ?? 0)) * 0.7)),
    };
  }

  close() { try { this.lm?.close(); } catch { /* ignore */ } this.lm = null; this.loading = null; this.status = 'idle'; }
}
