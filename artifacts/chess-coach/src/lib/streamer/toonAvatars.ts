// Pro-drawn cartoon avatars (DiceBear art, vendored in src/vendor/dicebear.js) that move
// with the streamer: the head follows the face, the eyes blink and the mouth talks by
// swapping between pre-drawn frames of the same character.

import type { PersonLook } from '@/lib/streamer/avatars';

export type ToonStyle = 'avataaars' | 'toonHead' | 'bigSmile' | 'adventurer' | 'openPeeps' | 'funEmoji' | 'bottts';

export const TOON_STYLES: { id: ToonStyle; label: string }[] = [
  { id: 'avataaars', label: 'Toon' },
  { id: 'toonHead', label: 'Toon head' },
  { id: 'bigSmile', label: 'Big smile' },
  { id: 'adventurer', label: 'Anime' },
  { id: 'openPeeps', label: 'Doodle' },
  { id: 'funEmoji', label: 'Emoji' },
  { id: 'bottts', label: 'Robot' },
];

export const TOON_CREDITS = 'Avatar art: Avataaars, Bottts & Open Peeps by Pablo Stanley; Fun Emoji by Davis Uche; Big Smile by Ashley Seo; Adventurer by Lisa Wischofsky; Toon Head by Johan Melin (CC BY 4.0) — via DiceBear.';

/** Customisation for the "Toon" style (also what "make an avatar from my camera" fills in). */
export interface ToonCustom {
  skinColor: string; hairColor: string; top: string; facialHair: string; clothing: string; clothesColor: string; accessories: string;
}

export interface ToonPick { style: ToonStyle; seed: string; custom?: ToonCustom | null }

// how each style blinks and talks
interface Frames {
  eyes?: { key: string; base: string[]; blink: string | null };
  mouth?: { key: string; closed: string[]; half: string; open: string };
  face?: { key: string; base: string[]; blink: string; half: string; open: string }; // open-peeps draws eyes+mouth as one "face"
  extra?: Record<string, string[]>;
  // where the face is in the picture (fractions): centre and height
  fx: number; fy: number; fh: number;
}
const FRAMES: Record<ToonStyle, Frames> = {
  avataaars: {
    eyes: { key: 'eyes', base: ['default', 'happy', 'side', 'squint'], blink: 'closed' },
    mouth: { key: 'mouth', closed: ['smile', 'default', 'twinkle'], half: 'disbelief', open: 'screamOpen' },
    extra: { eyebrows: ['default', 'defaultNatural', 'raisedExcitedNatural', 'upDownNatural', 'flatNatural'] },
    fx: 0.5, fy: 0.47, fh: 0.36,
  },
  toonHead: { eyes: { key: 'eyes', base: ['happy', 'wide'], blink: 'humble' }, mouth: { key: 'mouth', closed: ['smile'], half: 'agape', open: 'laugh' }, fx: 0.5, fy: 0.46, fh: 0.4 },
  bigSmile: { eyes: { key: 'eyes', base: ['cheery', 'normal', 'starstruck'], blink: 'sleepy' }, mouth: { key: 'mouth', closed: ['awkwardSmile', 'kawaii', 'unimpressed'], half: 'teethSmile', open: 'openedSmile' }, fx: 0.55, fy: 0.55, fh: 0.55 },
  adventurer: { eyes: { key: 'eyes', base: ['variant01', 'variant02', 'variant03', 'variant24', 'variant25', 'variant26'], blink: null }, mouth: { key: 'mouth', closed: ['variant02', 'variant04', 'variant09', 'variant29'], half: 'variant01', open: 'variant26' }, fx: 0.52, fy: 0.55, fh: 0.62 },
  openPeeps: { face: { key: 'face', base: ['smile', 'calm', 'cute', 'driven', 'cheeky'], blink: 'eyesClosed', half: 'explaining', open: 'smileBig' }, fx: 0.55, fy: 0.5, fh: 0.48 },
  funEmoji: { eyes: { key: 'eyes', base: ['plain', 'cute', 'glasses', 'shades', 'stars', 'love'], blink: 'closed' }, mouth: { key: 'mouth', closed: ['lilSmile', 'plain', 'cute'], half: 'smileTeeth', open: 'shout' }, fx: 0.5, fy: 0.5, fh: 0.85 },
  bottts: { eyes: { key: 'eyes', base: ['bulging', 'eva', 'frame1', 'frame2', 'glow', 'happy', 'robocop', 'round', 'roundFrame01', 'roundFrame02', 'sensor', 'shade01'], blink: null }, mouth: { key: 'mouth', closed: ['smile01', 'smile02', 'diagram'], half: 'grill01', open: 'square02' }, fx: 0.5, fy: 0.55, fh: 0.6 },
};

type Lib = typeof import('@/vendor/dicebear.js');
let lib: Lib | null = null;
let loading: Promise<Lib | null> | null = null;
export function loadToons(): Promise<Lib | null> {
  if (lib) return Promise.resolve(lib);
  loading ??= import('@/vendor/dicebear.js').then((m) => { lib = m; return m; }).catch(() => { loading = null; return null; });
  return loading;
}

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pickFrom = (arr: string[], seed: string, salt: string) => arr[hash(seed + salt) % arr.length];
const noHash = (h: string) => h.replace('#', '').slice(0, 6);

function options(p: ToonPick, eyesClosed: boolean, mouth: 0 | 1 | 2, size: number): Record<string, unknown> {
  const F = FRAMES[p.style];
  const o: Record<string, unknown> = { seed: p.seed, size };
  if (F.eyes) o[F.eyes.key] = [eyesClosed && F.eyes.blink ? F.eyes.blink : pickFrom(F.eyes.base, p.seed, 'e')];
  if (F.mouth) o[F.mouth.key] = [mouth === 2 ? F.mouth.open : mouth === 1 ? F.mouth.half : pickFrom(F.mouth.closed, p.seed, 'm')];
  if (F.face) o[F.face.key] = [mouth === 2 ? F.face.open : mouth === 1 ? F.face.half : eyesClosed ? F.face.blink : pickFrom(F.face.base, p.seed, 'f')];
  for (const [k, arr] of Object.entries(F.extra ?? {})) o[k] = [pickFrom(arr, p.seed, k)];
  if (p.style === 'avataaars' && p.custom) {
    const c = p.custom;
    o.skinColor = [noHash(c.skinColor)]; o.hairColor = [noHash(c.hairColor)]; o.facialHairColor = [noHash(c.hairColor)];
    if (c.top === 'none') o.topProbability = 0; else { o.top = [c.top]; o.topProbability = 100; }
    if (c.facialHair === 'none') o.facialHairProbability = 0; else { o.facialHair = [c.facialHair]; o.facialHairProbability = 100; }
    o.clothing = [c.clothing]; o.clothesColor = [noHash(c.clothesColor)];
    if (c.accessories === 'none') o.accessoriesProbability = 0; else { o.accessories = [c.accessories]; o.accessoriesProbability = 100; }
  }
  return o;
}

/** A small picture for the picker. */
export function toonThumb(p: ToonPick): string | null {
  if (!lib) return null;
  return lib.createAvatar(lib[p.style], options(p, false, 0, 128)).toDataUri();
}

const cache = new Map<string, HTMLImageElement>();
function frame(p: ToonPick, eyesClosed: boolean, mouth: 0 | 1 | 2): HTMLImageElement | null {
  if (!lib) return null;
  const key = `${p.style}|${p.seed}|${JSON.stringify(p.custom ?? null)}|${eyesClosed ? 1 : 0}|${mouth}`;
  let im = cache.get(key);
  if (!im) {
    if (cache.size > 120) cache.clear();
    im = new Image();
    im.src = lib.createAvatar(lib[p.style], options(p, eyesClosed, mouth, 512)).toDataUri();
    cache.set(key, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}

/** Get every frame ready so the first blink / word doesn't flicker. */
export function warmToon(p: ToonPick) { for (const e of [false, true]) for (const m of [0, 1, 2] as const) frame(p, e, m); }

export interface ToonPose { x: number; y: number; size: number; roll: number; yaw: number; mouth: number; blinkL: number; blinkR: number; t: number }

let lastGood: HTMLImageElement | null = null;
export function drawToon(c: CanvasRenderingContext2D, p: ToonPick, pose: ToonPose) {
  const F = FRAMES[p.style];
  const closed = Math.max(pose.blinkL, pose.blinkR) > 0.5;
  const m: 0 | 1 | 2 = pose.mouth > 0.45 ? 2 : pose.mouth > 0.15 ? 1 : 0;
  const im = frame(p, closed, m) ?? frame(p, false, 0) ?? lastGood;
  if (!im) return;
  lastGood = im;
  const H = pose.size / F.fh;
  c.save();
  c.translate(pose.x, pose.y + Math.sin(pose.t * 1.7) * pose.size * 0.01);
  c.rotate(pose.roll);
  c.scale(1 - Math.abs(pose.yaw) * 0.1, 1);
  c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = pose.size * 0.08; c.shadowOffsetY = pose.size * 0.03;
  c.drawImage(im, -F.fx * H + pose.yaw * pose.size * 0.04, -F.fy * H, H, H);
  c.restore();
}

// ── "Make an avatar from my camera" in the Toon style ──
export const TOON_TOPS: { id: string; label: string }[] = [
  { id: 'shortFlat', label: 'Short' }, { id: 'shortWaved', label: 'Wavy' }, { id: 'shortCurly', label: 'Curly' }, { id: 'theCaesar', label: 'Buzz' },
  { id: 'sides', label: 'Balding' }, { id: 'none', label: 'Bald' }, { id: 'shavedSides', label: 'Shaved sides' }, { id: 'frizzle', label: 'Frizzy' },
  { id: 'fro', label: 'Afro' }, { id: 'dreads01', label: 'Dreads' }, { id: 'bun', label: 'Bun' }, { id: 'bob', label: 'Bob' },
  { id: 'straight01', label: 'Long' }, { id: 'curvy', label: 'Long wavy' }, { id: 'curly', label: 'Long curly' }, { id: 'bigHair', label: 'Big hair' },
  { id: 'hat', label: 'Hat' }, { id: 'winterHat1', label: 'Winter hat' }, { id: 'hijab', label: 'Hijab' }, { id: 'turban', label: 'Turban' },
];
export const TOON_FACIAL: { id: string; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'beardLight', label: 'Light beard' }, { id: 'beardMedium', label: 'Beard' }, { id: 'beardMajestic', label: 'Big beard' },
  { id: 'moustacheFancy', label: 'Fancy mustache' }, { id: 'moustacheMagnum', label: 'Mustache' },
];
export const TOON_CLOTHES: { id: string; label: string }[] = [
  { id: 'shirtCrewNeck', label: 'T-shirt' }, { id: 'shirtVNeck', label: 'V-neck' }, { id: 'hoodie', label: 'Hoodie' }, { id: 'collarAndSweater', label: 'Sweater' },
  { id: 'blazerAndShirt', label: 'Blazer' }, { id: 'blazerAndSweater', label: 'Blazer & sweater' }, { id: 'graphicShirt', label: 'Graphic tee' }, { id: 'overall', label: 'Overalls' },
];
export const TOON_GLASSES: { id: string; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'prescription01', label: 'Glasses' }, { id: 'round', label: 'Round' }, { id: 'wayfarers', label: 'Shades' },
  { id: 'sunglasses', label: 'Sunglasses' }, { id: 'kurt', label: 'Retro' }, { id: 'eyepatch', label: 'Eye patch' },
];
export const TOON_SKINS = ['#ffdbb4', '#edb98a', '#fd9841', '#d08b5b', '#ae5d29', '#614335'];
export const DEFAULT_TOON_CUSTOM: ToonCustom = { skinColor: '#d08b5b', hairColor: '#2c1b18', top: 'shortFlat', facialHair: 'none', clothing: 'hoodie', clothesColor: '#81B64C', accessories: 'none' };

/** Turn what the camera saw into Toon-style settings. */
export function toonFromPerson(p: PersonLook, prev: ToonCustom): ToonCustom {
  const top: Record<string, string> = { short: 'shortFlat', long: 'straight01', curly: 'shortCurly', afro: 'fro', bun: 'bun', ponytail: 'longButNotTooLong', spiky: 'frizzle', mohawk: 'shavedSides', buzz: 'theCaesar', bald: 'none' };
  const fh: Record<string, string> = { none: 'none', beard: 'beardMedium', stubble: 'beardLight', mustache: 'moustacheMagnum', goatee: 'beardLight' };
  const cl: Record<string, string> = { tee: 'shirtCrewNeck', hoodie: 'hoodie', sweater: 'collarAndSweater', suit: 'blazerAndShirt', turtleneck: 'shirtCrewNeck' };
  return { ...prev, skinColor: p.skin, hairColor: p.hairColor, top: top[p.hair] ?? prev.top, facialHair: fh[p.facial] ?? 'none', clothing: cl[p.outfit ?? 'tee'] ?? prev.clothing, clothesColor: p.shirt };
}
