// Selfie to character. Today: the photo is measured on this device (MediaPipe face points)
// and those measurements set the character's face shape, colours and facial hair; the
// photo is never uploaded. An AI service that generates a 3D model from a photo can be
// connected later through the SelfieGenerator interface below.

import { FaceTracker } from '@/lib/streamer/faceTracker';
import { normalizeAvatarConfig, type AvatarConfig } from './avatarConfig';

export interface SelfieResult { config: AvatarConfig; notes: string[] }
/** A way to turn a photo into a character. Only 'measure' (on-device) exists today. */
export interface SelfieGenerator { id: string; label: string; uploadsPhoto: boolean; generate(photo: HTMLCanvasElement, base: AvatarConfig): Promise<SelfieResult> }

let tracker: FaceTracker | null = null;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const map = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));

export async function photoCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close?.();
  return cv;
}

export const measureGenerator: SelfieGenerator = {
  id: 'measure', label: 'Match from photo (on this device)', uploadsPhoto: false,
  async generate(cv, base) {
    tracker ??= new FaceTracker();
    if (!(await tracker.load())) throw new Error('Face finding couldn’t load on this device.');
    const lm = tracker.detectImage(cv);
    if (!lm) throw new Error('No face found. Use a clear, front-facing photo with your whole face in view.');
    const W = cv.width, H = cv.height;
    const P = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H });
    const d = (a: number, b: number) => Math.hypot(P(a).x - P(b).x, P(a).y - P(b).y);
    const faceW = d(234, 454), faceH = d(10, 152);
    const eyeW = (d(33, 133) + d(362, 263)) / 2;
    const shape = {
      headWidth: map(faceW / faceH, 0.78, 0.98),
      headHeight: map(faceH / faceW, 1.05, 1.3),
      jaw: map(d(172, 397) / faceW, 0.68, 0.86),
      chin: map(d(17, 152) / faceH, 0.17, 0.25),
      cheeks: map(d(50, 280) / faceW, 0.62, 0.74),
      eyeSize: map(eyeW / faceW, 0.17, 0.235),
      eyeSpacing: map(d(133, 362) / faceW, 0.22, 0.31),
      eyeHeight: map(1 - (P(159).y - P(10).y) / faceH, 0.58, 0.7),
      noseSize: map(d(4, 168) / faceH, 0.2, 0.28),
      noseWidth: map(d(64, 294) / faceW, 0.22, 0.31),
      noseLength: map(d(168, 2) / faceH, 0.24, 0.32),
      mouthWidth: map(d(61, 291) / faceW, 0.32, 0.46),
      lipFullness: map(d(0, 17) / faceH, 0.07, 0.13),
      earSize: base.shape.earSize,
      browHeight: map((P(159).y - P(105).y) / faceH, 0.07, 0.13),
    };
    // colours: cheeks for skin, above the forehead for hair, chin and upper lip for facial hair
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    const sample = (x: number, y: number, r: number) => {
      const img = c.getImageData(Math.max(0, Math.round(x - r)), Math.max(0, Math.round(y - r)), Math.max(1, Math.round(r * 2)), Math.max(1, Math.round(r * 2))).data;
      let R = 0, G = 0, B = 0, n = 0; for (let i = 0; i < img.length; i += 4) { R += img[i]; G += img[i + 1]; B += img[i + 2]; n++; }
      return n ? [R / n, G / n, B / n] : [0, 0, 0];
    };
    const lum = (v: number[]) => 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
    const hex = (v: number[]) => `#${v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
    const r = faceH * 0.035;
    const skinV = [sample(P(50).x, P(50).y, r), sample(P(280).x, P(280).y, r)].reduce((a, b) => a.map((x, i) => (x + b[i]) / 2));
    const hairV = sample(P(10).x, P(10).y - faceH * 0.13, r * 1.4);
    const sideV = sample(P(234).x - faceW * 0.08, P(152).y, r * 1.2);
    const chinV = sample(P(152).x, P(152).y - faceH * 0.05, r);
    const lipTopV = sample(P(164).x, P(164).y, r * 0.6);
    const jawV = [sample(P(172).x, P(172).y, r), sample(P(397).x, P(397).y, r)];
    const sk = lum(skinV);
    const near = (a: number[], b: number[], t: number) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < t;
    const bald = near(hairV, skinV, 60);
    const longHair = !bald && near(sideV, hairV, 70);
    const darkChin = lum(chinV) < sk * 0.7, darkJaw = jawV.every((v) => lum(v) < sk * 0.72), mustache = lum(lipTopV) < sk * 0.72;
    const notes = ['Face shape, skin, hair and facial hair matched from your photo.', 'Pick glasses, outfit and finer details yourself.'];
    const config = normalizeAvatarConfig({
      ...base, shape,
      skinTone: hex(skinV.map((x) => x * 1.03)),
      hair: bald ? 'bald' : longHair ? (base.hair === 'bob' ? 'bob' : 'long') : (['bald', 'long', 'bob'].includes(base.hair) ? 'sidepart' : base.hair),
      hairColor: bald ? base.hairColor : hex(hairV.map((x) => x * 0.95)),
      beard: darkChin && darkJaw ? 'full' : darkChin ? 'goatee' : 'none',
      mustache: mustache ? (base.mustache === 'none' ? 'classic' : base.mustache) : 'none',
      beardColor: darkChin || mustache ? hex(chinV.map((x) => x * 0.9)) : base.beardColor,
    });
    return { config, notes };
  },
};
