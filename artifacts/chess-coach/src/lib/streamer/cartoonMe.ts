// "Cartoon me": reads the streamer's camera once and builds a matching person avatar
// (skin, hair colour and style, facial hair, eye colour, shirt). Runs on the device only.

import { EYE_COLORS, type Facial, type HairStyle, type PersonLook } from '@/lib/streamer/avatars';

type RGB = [number, number, number];
type Pt = { x: number; y: number };

const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lum = (a: RGB) => 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function hexToRgb(h: string): RGB { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/** A bit brighter and more colourful: cameras make everyone look grey. */
function cartoonize(c: RGB, lift = 1.08, sat = 1.18): RGB {
  const l = lum(c);
  return c.map((v) => (l + (v - l) * sat) * lift) as RGB;
}

export function cartoonFromCamera(video: HTMLVideoElement, landmarks: Pt[], base: PersonLook): PersonLook | null {
  const W = video.videoWidth, H = video.videoHeight;
  if (!W || !H || landmarks.length < 455) return null;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); if (!ctx) return null;
  ctx.drawImage(video, 0, 0, W, H);
  const P = (i: number): Pt => ({ x: landmarks[i].x * W, y: landmarks[i].y * H });
  const top = P(10), chin = P(152), left = P(234), right = P(454), nose = P(1);
  const fh = Math.hypot(chin.x - top.x, chin.y - top.y);
  const sample = (p: Pt, r: number): RGB | null => {
    const s = Math.max(2, Math.round(r * 2));
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return null;
    const x0 = Math.max(0, Math.min(W - s, Math.round(p.x - r))), y0 = Math.max(0, Math.min(H - s, Math.round(p.y - r)));
    const d = ctx.getImageData(x0, y0, s, s).data;
    // median-ish: average the middle half by brightness to ignore glare and shadows
    const px: RGB[] = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    px.sort((a, b) => lum(a) - lum(b));
    const mid = px.slice(Math.floor(px.length * 0.25), Math.ceil(px.length * 0.75));
    const sum = mid.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as RGB, [0, 0, 0] as RGB);
    return sum.map((v) => v / mid.length) as RGB;
  };
  const avg = (...cs: (RGB | null)[]): RGB | null => { const ok = cs.filter(Boolean) as RGB[]; if (!ok.length) return null; return ok.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as RGB, [0, 0, 0] as RGB).map((v) => v / ok.length) as RGB; };

  const skin = avg(sample(P(50), fh * 0.04), sample(P(280), fh * 0.04), sample(lerp(top, P(168), 0.45), fh * 0.035));
  if (!skin) return null;
  const up = (p: Pt, k: number): Pt => ({ x: p.x, y: p.y - fh * k });
  const hairTop = avg(sample(up(top, 0.1), fh * 0.05), sample({ x: top.x - fh * 0.2, y: top.y - fh * 0.03 }, fh * 0.04), sample({ x: top.x + fh * 0.2, y: top.y - fh * 0.03 }, fh * 0.04));
  const volume = sample(up(top, 0.32), fh * 0.05);
  const bg = avg(sample({ x: left.x - fh * 0.55, y: top.y }, fh * 0.05), sample({ x: right.x + fh * 0.55, y: top.y }, fh * 0.05));
  const sides = avg(sample({ x: left.x - fh * 0.1, y: chin.y }, fh * 0.05), sample({ x: right.x + fh * 0.1, y: chin.y }, fh * 0.05));

  // hair
  let hairColor = base.hairColor, hair: HairStyle = base.hair;
  if (!hairTop || dist(hairTop, skin) < 42) { hair = 'bald'; if (sides && dist(sides, skin) > 50) hairColor = hex(cartoonize(sides)); }
  else {
    hairColor = hex(cartoonize(hairTop, 1.05, 1.1));
    const isHair = (c: RGB | null) => !!c && dist(c, hairTop) < 55 && (!bg || dist(c, bg) > 40);
    if (isHair(volume)) hair = lum(hairTop) < 90 ? 'afro' : 'curly';
    else if (isHair(sides)) hair = 'long';
    else hair = 'short';
  }

  // facial hair: darker than skin and close to the hair colour
  const lip = sample(lerp(P(164), P(0), 0.5), fh * 0.025);
  const chinS = sample(lerp(P(17), chin, 0.55), fh * 0.035);
  const jaw = avg(sample(lerp(P(172), chin, 0.3), fh * 0.035), sample(lerp(P(397), chin, 0.3), fh * 0.035));
  const hairy = (c: RGB | null, strong: boolean) => !!c && lum(c) < lum(skin) * (strong ? 0.72 : 0.86) && (!hairTop || dist(c, hairTop) < dist(c, skin) + (strong ? 0 : 25));
  let facial: Facial = 'none';
  if (hairy(chinS, true) && hairy(jaw, true)) facial = 'beard';
  else if (hairy(chinS, true)) facial = hairy(lip, true) ? 'goatee' : 'goatee';
  else if (hairy(lip, true)) facial = 'mustache';
  else if (hairy(chinS, false) && hairy(jaw, false)) facial = 'stubble';

  // eyes (iris points exist on the full face model)
  let eyes = base.eyes;
  if (landmarks.length >= 478) {
    const iris = avg(sample(P(468), fh * 0.012), sample(P(473), fh * 0.012));
    if (iris) eyes = EYE_COLORS.reduce((best, e) => (dist(hexToRgb(e), iris) < dist(hexToRgb(best), iris) ? e : best), EYE_COLORS[0]);
  }

  // shirt, if it's in view
  const shirtC = sample({ x: nose.x, y: chin.y + fh * 0.45 }, fh * 0.08);
  const shirt = shirtC && dist(shirtC, skin) > 45 ? hex(cartoonize(shirtC, 1.05, 1.25)) : base.shirt;

  return { ...base, skin: hex(cartoonize(skin, 1.06, 1.12)), hair, hairColor, facial, eyes, shirt };
}
