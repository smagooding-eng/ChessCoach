// Cuts the person out of the camera picture (MediaPipe Selfie Segmenter), so the studio
// background (ChessScout, a colour, your picture, a blurred room) goes behind you instead of
// your room. Loaded from the CDN only when it's needed; frames never leave the device.

const VER = '0.10.14';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

interface MPMask { width: number; height: number; getAsFloat32Array(): Float32Array; close(): void }
interface Segmenter { segmentForVideo(v: HTMLVideoElement, ts: number): { confidenceMasks?: MPMask[]; close?: () => void }; close(): void }

export class PersonSegmenter {
  status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private seg: Segmenter | null = null;
  private loading: Promise<boolean> | null = null;
  private lastTs = 0;
  /** The latest mask: white (opaque) where the person is, transparent elsewhere, at the model's size. */
  readonly mask = document.createElement('canvas');
  private img: ImageData | null = null;
  hasMask = false;

  load(): Promise<boolean> {
    if (this.loading) return this.loading;
    this.status = 'loading';
    this.loading = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import(/* @vite-ignore */ `${BASE}/vision_bundle.mjs`);
        const files = await mod.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
        const opts = (delegate: 'GPU' | 'CPU') => ({
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
        });
        try { this.seg = await mod.ImageSegmenter.createFromOptions(files, opts('GPU')); }
        catch { this.seg = await mod.ImageSegmenter.createFromOptions(files, opts('CPU')); }
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

  /** Update the mask from the current video frame. */
  update(video: HTMLVideoElement): boolean {
    if (!this.seg || video.readyState < 2 || !video.videoWidth) return false;
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    try {
      const res = this.seg.segmentForVideo(video, ts);
      const m = res.confidenceMasks?.[0];
      if (!m) return this.hasMask;
      const w = m.width, h = m.height, data = m.getAsFloat32Array();
      if (this.mask.width !== w || this.mask.height !== h || !this.img) {
        this.mask.width = w; this.mask.height = h;
        this.img = new ImageData(w, h);
        this.img.data.fill(255);
      }
      const px = this.img.data;
      for (let i = 0; i < data.length; i++) {
        // soften the edge a little: below 0.25 gone, above 0.75 solid
        const a = Math.min(1, Math.max(0, (data[i] - 0.25) * 2));
        px[i * 4 + 3] = a * 255;
      }
      this.mask.getContext('2d')!.putImageData(this.img, 0, 0);
      m.close();
      this.hasMask = true;
    } catch { /* keep the last mask */ }
    return this.hasMask;
  }
}
