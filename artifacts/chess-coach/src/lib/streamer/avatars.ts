// Streamer avatars, drawn on a canvas and driven by the face tracker (or by the
// voice when there is no camera). All original artwork made from shapes.

export type PieceAvatar = 'wK' | 'wQ' | 'wR' | 'wB' | 'wN' | 'wP' | 'bK' | 'bQ' | 'bR' | 'bB' | 'bN' | 'bP';
export type AvatarId =
  | 'knight' | 'robot' | 'cat' | 'alien' | 'panda' | 'ghost' | 'mystery' | 'smiley' | 'fox'
  | 'owl' | 'bear' | 'dragon' | 'astronaut' | 'ninja' | 'skeleton' | 'frog' | 'penguin' | 'vampire'
  | 'alex' | 'sam' | 'jordan' | 'riley' | 'maya' | 'leo' | 'grandpa' | 'me'
  | 'romantic' | 'grandmaster' | 'prodigy' | 'professor' | 'hustler' | 'champion' | PieceAvatar;

// ── "Make your own" person + accessories for any avatar ──
export type HairStyle = 'short' | 'long' | 'curly' | 'bun' | 'buzz' | 'mohawk' | 'bald' | 'ponytail' | 'afro' | 'spiky';
export type Facial = 'none' | 'beard' | 'mustache' | 'stubble' | 'goatee';
export type Outfit = 'tee' | 'suit' | 'hoodie' | 'sweater' | 'turtleneck';
export interface PersonLook { skin: string; hair: HairStyle; hairColor: string; facial: Facial; shirt: string; eyes: string; outfit?: Outfit }
export const OUTFITS: { id: Outfit; label: string }[] = [
  { id: 'tee', label: 'T-shirt' }, { id: 'hoodie', label: 'Hoodie' }, { id: 'sweater', label: 'Sweater' }, { id: 'turtleneck', label: 'Turtleneck' }, { id: 'suit', label: 'Suit & tie' },
];
export type Hat = 'none' | 'crown' | 'tophat' | 'beanie' | 'cap' | 'party' | 'wizard' | 'viking' | 'headphones' | 'halo' | 'cowboy' | 'chef';
export type Eyewear = 'none' | 'sunglasses' | 'round' | 'eyepatch' | 'visor' | 'monocle' | 'hearts' | 'goggles';
export interface AvatarLook { person?: PersonLook; hat?: Hat; eyewear?: Eyewear; style?: 'cartoon' | 'real' }

export const SKIN_TONES = ['#f6d5bd', '#f1c7a3', '#e0a986', '#c68a63', '#a8693f', '#8d5a3b', '#6b4026', '#4a2c1a'];
export const HAIR_COLORS = ['#141414', '#3b2416', '#6b4423', '#b5472a', '#d9a441', '#e8e2d0', '#9aa0a6', '#81B64C', '#5aa8ff', '#e86a9a'];
export const EYE_COLORS = ['#4a3326', '#2f5fa8', '#3a6a2a', '#6b6f78', '#7a4a12'];
export const SHIRT_COLORS = ['#81B64C', '#2f5fa8', '#E8B447', '#6b3fa0', '#c0303a', '#1d1d1d', '#e9e9e9', '#e8762b'];
export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'Short' }, { id: 'long', label: 'Long' }, { id: 'curly', label: 'Curly' }, { id: 'afro', label: 'Afro' },
  { id: 'bun', label: 'Bun' }, { id: 'ponytail', label: 'Ponytail' }, { id: 'spiky', label: 'Spiky' }, { id: 'mohawk', label: 'Mohawk' },
  { id: 'buzz', label: 'Buzz' }, { id: 'bald', label: 'Bald' },
];
export const FACIAL_HAIR: { id: Facial; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'stubble', label: 'Stubble' }, { id: 'mustache', label: 'Mustache' }, { id: 'goatee', label: 'Goatee' }, { id: 'beard', label: 'Beard' },
];
export const HATS: { id: Hat; label: string; emoji: string }[] = [
  { id: 'none', label: 'No hat', emoji: '🚫' }, { id: 'crown', label: 'Crown', emoji: '👑' }, { id: 'tophat', label: 'Top hat', emoji: '🎩' },
  { id: 'beanie', label: 'Beanie', emoji: '🧶' }, { id: 'cap', label: 'Cap', emoji: '🧢' }, { id: 'party', label: 'Party', emoji: '🥳' },
  { id: 'wizard', label: 'Wizard', emoji: '🧙' }, { id: 'viking', label: 'Viking', emoji: '🪓' }, { id: 'cowboy', label: 'Cowboy', emoji: '🤠' },
  { id: 'chef', label: 'Chef', emoji: '👨‍🍳' }, { id: 'headphones', label: 'Headphones', emoji: '🎧' }, { id: 'halo', label: 'Halo', emoji: '😇' },
];
export const EYEWEAR: { id: Eyewear; label: string; emoji: string }[] = [
  { id: 'none', label: 'None', emoji: '🚫' }, { id: 'sunglasses', label: 'Shades', emoji: '🕶️' }, { id: 'round', label: 'Glasses', emoji: '👓' },
  { id: 'visor', label: 'Cyber visor', emoji: '🥽' }, { id: 'goggles', label: 'Goggles', emoji: '🤿' }, { id: 'hearts', label: 'Hearts', emoji: '😍' },
  { id: 'monocle', label: 'Monocle', emoji: '🧐' }, { id: 'eyepatch', label: 'Eye patch', emoji: '🏴‍☠️' },
];
const PEOPLE: Record<string, PersonLook> = {
  alex: { skin: '#f1c7a3', hair: 'short', hairColor: '#3b2416', facial: 'none', shirt: '#81B64C', eyes: '#4a3326' },
  sam: { skin: '#8d5a3b', hair: 'long', hairColor: '#141414', facial: 'none', shirt: '#2f5fa8', eyes: '#4a3326' },
  jordan: { skin: '#c68a63', hair: 'curly', hairColor: '#b5472a', facial: 'none', shirt: '#E8B447', eyes: '#3a6a2a' },
  riley: { skin: '#e0a986', hair: 'short', hairColor: '#141414', facial: 'beard', shirt: '#6b3fa0', eyes: '#4a3326' },
  maya: { skin: '#6b4026', hair: 'bun', hairColor: '#141414', facial: 'none', shirt: '#c0303a', eyes: '#4a3326' },
  leo: { skin: '#f6d5bd', hair: 'mohawk', hairColor: '#5aa8ff', facial: 'stubble', shirt: '#1d1d1d', eyes: '#2f5fa8' },
  grandpa: { skin: '#e0a986', hair: 'bald', hairColor: '#e8e2d0', facial: 'beard', shirt: '#6b6f78', eyes: '#6b6f78', outfit: 'sweater' },
  // chess characters: classic chess archetypes (not real people)
  romantic: { skin: '#f1c7a3', hair: 'short', hairColor: '#2b1a10', facial: 'mustache', shirt: '#2b2b30', eyes: '#4a3326', outfit: 'suit' },
  grandmaster: { skin: '#f6d5bd', hair: 'short', hairColor: '#6b4423', facial: 'none', shirt: '#3a4a5a', eyes: '#6b6f78', outfit: 'suit' },
  prodigy: { skin: '#c68a63', hair: 'curly', hairColor: '#141414', facial: 'none', shirt: '#81B64C', eyes: '#4a3326', outfit: 'hoodie' },
  professor: { skin: '#e0a986', hair: 'bald', hairColor: '#9aa0a6', facial: 'beard', shirt: '#7a5a3a', eyes: '#2f5fa8', outfit: 'sweater' },
  hustler: { skin: '#6b4026', hair: 'buzz', hairColor: '#141414', facial: 'stubble', shirt: '#c0303a', eyes: '#4a3326', outfit: 'tee' },
  champion: { skin: '#a8693f', hair: 'short', hairColor: '#141414', facial: 'goatee', shirt: '#141414', eyes: '#4a3326', outfit: 'suit' },
};
export const DEFAULT_PERSON: PersonLook = { skin: '#c68a63', hair: 'afro', hairColor: '#141414', facial: 'none', shirt: '#81B64C', eyes: '#4a3326', outfit: 'tee' };
/** Hats / glasses that come with the chess characters */
export const CHARACTER_EXTRAS: Partial<Record<AvatarId, { hat: Hat; eyewear: Eyewear }>> = {
  romantic: { hat: 'tophat', eyewear: 'monocle' }, grandmaster: { hat: 'none', eyewear: 'none' }, prodigy: { hat: 'headphones', eyewear: 'none' },
  professor: { hat: 'none', eyewear: 'round' }, hustler: { hat: 'cap', eyewear: 'sunglasses' }, champion: { hat: 'crown', eyewear: 'none' },
};

const PIECE_NAMES: Record<string, string> = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };
export const AVATARS: { id: AvatarId; label: string; emoji: string; group: 'piece' | 'cartoon' | 'person' | 'character' }[] = [
  ...(['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as PieceAvatar[]).map((id) => ({
    id: id as AvatarId, label: `${id[0] === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[id[1]]}`, emoji: '♟', group: 'piece' as const,
  })),
  { id: 'knight', label: 'Scout Knight', emoji: '🛡️', group: 'cartoon' },
  { id: 'robot', label: 'Robot', emoji: '🤖', group: 'cartoon' },
  { id: 'cat', label: 'Cat', emoji: '🐱', group: 'cartoon' },
  { id: 'fox', label: 'Fox', emoji: '🦊', group: 'cartoon' },
  { id: 'panda', label: 'Panda', emoji: '🐼', group: 'cartoon' },
  { id: 'alien', label: 'Alien', emoji: '👽', group: 'cartoon' },
  { id: 'ghost', label: 'Ghost', emoji: '👻', group: 'cartoon' },
  { id: 'mystery', label: 'Hooded', emoji: '🥷', group: 'cartoon' },
  { id: 'smiley', label: 'Smiley', emoji: '😀', group: 'cartoon' },
  { id: 'owl', label: 'Owl', emoji: '🦉', group: 'cartoon' },
  { id: 'bear', label: 'Bear', emoji: '🐻', group: 'cartoon' },
  { id: 'dragon', label: 'Dragon', emoji: '🐲', group: 'cartoon' },
  { id: 'frog', label: 'Frog', emoji: '🐸', group: 'cartoon' },
  { id: 'penguin', label: 'Penguin', emoji: '🐧', group: 'cartoon' },
  { id: 'astronaut', label: 'Astronaut', emoji: '🧑‍🚀', group: 'cartoon' },
  { id: 'ninja', label: 'Ninja', emoji: '🥷', group: 'cartoon' },
  { id: 'skeleton', label: 'Skeleton', emoji: '💀', group: 'cartoon' },
  { id: 'vampire', label: 'Vampire', emoji: '🧛', group: 'cartoon' },
  { id: 'alex', label: 'Alex', emoji: '🧑', group: 'person' },
  { id: 'sam', label: 'Sam', emoji: '👩🏾', group: 'person' },
  { id: 'jordan', label: 'Jordan', emoji: '🧑🏽‍🦰', group: 'person' },
  { id: 'riley', label: 'Riley', emoji: '🧔', group: 'person' },
  { id: 'maya', label: 'Maya', emoji: '👩🏿', group: 'person' },
  { id: 'leo', label: 'Leo', emoji: '🧑‍🎤', group: 'person' },
  { id: 'grandpa', label: 'Grandpa', emoji: '👴', group: 'person' },
  { id: 'me', label: 'Make your own', emoji: '✏️', group: 'person' },
  { id: 'romantic', label: 'Romantic Master', emoji: '🎩', group: 'character' },
  { id: 'grandmaster', label: 'Grandmaster', emoji: '♟', group: 'character' },
  { id: 'prodigy', label: 'Prodigy', emoji: '🎧', group: 'character' },
  { id: 'professor', label: 'Professor', emoji: '👓', group: 'character' },
  { id: 'hustler', label: 'Park Hustler', emoji: '🧢', group: 'character' },
  { id: 'champion', label: 'Champion', emoji: '👑', group: 'character' },
];

export interface AvatarPose {
  x: number; y: number; size: number; roll: number; yaw: number; pitch: number;
  mouth: number; blinkL: number; blinkR: number; smile: number; t: number;
  brow?: number;   // -1 frown .. +1 raised
  lookX?: number;  // -1..1 where the eyes look
  lookY?: number;
}

// ChessScout's own piece art (Ink & Cream) for the piece avatars
const SPRITES: Record<string, HTMLImageElement> = {};
function sprite(key: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let im = SPRITES[key];
  if (!im) { im = new Image(); im.src = `/pieces/ink-cream/${key}.webp?v=1`; SPRITES[key] = im; }
  return im.complete && im.naturalWidth ? im : null;
}
export function preloadPieceAvatars() { for (const a of AVATARS) if (a.group === 'piece') sprite(a.id); }

// where the face sits on each piece (fractions of the 256px sprite)
const PIECE_FACE: Record<string, { ex: number; ey: number; gap: number; my: number; er: number; mw: number }> = {
  K: { ex: 0.5, ey: 0.5, gap: 0.11, my: 0.63, er: 0.065, mw: 0.16 },
  Q: { ex: 0.5, ey: 0.56, gap: 0.1, my: 0.67, er: 0.06, mw: 0.15 },
  R: { ex: 0.5, ey: 0.5, gap: 0.1, my: 0.63, er: 0.06, mw: 0.15 },
  B: { ex: 0.5, ey: 0.43, gap: 0.12, my: 0.64, er: 0.055, mw: 0.13 },
  N: { ex: 0.53, ey: 0.3, gap: 0, my: 0.5, er: 0.06, mw: 0.12 },
  P: { ex: 0.5, ey: 0.39, gap: 0.075, my: 0.48, er: 0.05, mw: 0.1 },
};

/** Soft 3D shading over a round shape that's already been drawn. */
function shade(c: C, x: number, y: number, rx: number, ry: number) {
  c.save(); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.clip();
  const g = c.createRadialGradient(x - rx * 0.35, y - ry * 0.45, rx * 0.05, x, y, Math.max(rx, ry) * 1.05);
  g.addColorStop(0, 'rgba(255,255,255,.38)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(0,0,0,.08)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
  c.fillStyle = g; c.fillRect(x - rx, y - ry, rx * 2, ry * 2);
  c.restore();
}
function brows(c: C, x: number, y: number, gap: number, w: number, brow: number, color: string, lw: number) {
  const lift = brow * w * 0.35;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(x + s * (gap + w * 0.5), y - lift * 0.6 + (brow < 0 ? -brow * w * 0.15 : 0));
    c.quadraticCurveTo(x + s * gap, y - w * 0.25 - lift, x + s * (gap - w * 0.5), y - lift + (brow < 0 ? brow * w * 0.2 : 0));
    c.lineWidth = lw * 1.4; c.lineCap = 'round'; c.strokeStyle = color; c.stroke();
  }
}

type C = CanvasRenderingContext2D;
const INK = '#141414';

function ell(c: C, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke: string | null = INK, lw = 0) {
  c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  c.fillStyle = fill; c.fill();
  if (stroke && lw > 0) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
}
function rrect(c: C, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Cartoon eye: white, iris, pupil, highlight; closes with blink. */
function eye(c: C, x: number, y: number, r: number, blink: number, iris: string, look: number, lw: number, lookY = 0) {
  const open = Math.max(0.08, 1 - blink * 1.1);
  if (open < 0.2) { c.beginPath(); c.moveTo(x - r, y); c.quadraticCurveTo(x, y + r * 0.5, x + r, y); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); return; }
  ell(c, x, y, r, r * 1.1 * open, '#fff', INK, lw);
  c.save(); c.beginPath(); c.ellipse(x, y, r, r * 1.1 * open, 0, 0, Math.PI * 2); c.clip();
  const ix = x + look * r * 0.38, iy = y + r * 0.1 + lookY * r * 0.3;
  const ig = c.createRadialGradient(ix, iy, r * 0.1, ix, iy, r * 0.62);
  ig.addColorStop(0, iris); ig.addColorStop(1, '#00000088');
  ell(c, ix, iy, r * 0.62, r * 0.68, iris); ell(c, ix, iy, r * 0.62, r * 0.68, ig);
  ell(c, ix, iy, r * 0.32, r * 0.36, INK);
  ell(c, ix - r * 0.2, iy - r * 0.25, r * 0.16, r * 0.16, '#fff');
  ell(c, ix + r * 0.18, iy + r * 0.15, r * 0.07, r * 0.07, 'rgba(255,255,255,.7)');
  c.restore();
}

/** Mouth: a smile line when closed, an open mouth with tongue when talking. */
function mouth(c: C, x: number, y: number, w: number, open: number, smile: number, lw: number, inside = '#5a1a1a') {
  const o = Math.min(1, open);
  if (o < 0.08) {
    c.beginPath(); c.moveTo(x - w / 2, y); c.quadraticCurveTo(x, y + w * (0.18 + smile * 0.35), x + w / 2, y);
    c.lineWidth = lw; c.lineCap = 'round'; c.strokeStyle = INK; c.stroke(); return;
  }
  const h = w * (0.15 + o * 0.75);
  c.beginPath(); c.moveTo(x - w / 2, y); c.quadraticCurveTo(x, y - h * 0.15 + smile * w * 0.1, x + w / 2, y);
  c.quadraticCurveTo(x, y + h * 1.5, x - w / 2, y); c.closePath();
  c.fillStyle = inside; c.fill();
  c.save(); c.clip(); ell(c, x, y + h * 0.95, w * 0.28, h * 0.45, '#e2656f'); c.restore();
  c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
}

function shoulders(c: C, R: number, shirt: string, lw: number, breathe = 0) {
  c.save(); c.translate(0, breathe);
  c.beginPath(); c.moveTo(-R * 1.9, R * 2.9); c.quadraticCurveTo(-R * 1.7, R * 1.25, -R * 0.35, R * 1.12);
  c.lineTo(R * 0.35, R * 1.12); c.quadraticCurveTo(R * 1.7, R * 1.25, R * 1.9, R * 2.9); c.closePath();
  c.fillStyle = shirt; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
  const g = c.createLinearGradient(0, R * 1.1, 0, R * 2.9); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
  c.fillStyle = g; c.fill();
  c.restore();
}

// ── realistic (painted) person + outfits ──
function hexRgb(h: string): [number, number, number] {
  const m = h.replace('#', ''); const v = m.length === 3 ? m.split('').map((x) => x + x).join('') : m.slice(0, 6);
  const n = parseInt(v, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const x = hexRgb(a), y = hexRgb(b);
  return `rgb(${Math.round(x[0] + (y[0] - x[0]) * t)},${Math.round(x[1] + (y[1] - x[1]) * t)},${Math.round(x[2] + (y[2] - x[2]) * t)})`;
}

function drawOutfit(c: C, R: number, L: PersonLook, lw: number, breathe: number, real: boolean) {
  const o = L.outfit ?? 'tee';
  const ink = real ? 'rgba(0,0,0,.25)' : INK;
  c.save(); c.translate(0, breathe); c.lineWidth = real ? lw * 0.5 : lw; c.strokeStyle = ink;
  if (o === 'suit') {
    c.beginPath(); c.moveTo(-R * 0.36, R * 1.1); c.lineTo(0, R * 1.85); c.lineTo(R * 0.36, R * 1.1); c.closePath(); c.fillStyle = '#f4f4ef'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-R * 0.09, R * 1.25); c.lineTo(R * 0.09, R * 1.25); c.lineTo(R * 0.12, R * 1.95); c.lineTo(0, R * 2.1); c.lineTo(-R * 0.12, R * 1.95); c.closePath(); c.fillStyle = '#c0303a'; c.fill(); c.stroke();
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * R * 0.36, R * 1.1); c.lineTo(sd * R * 0.05, R * 1.95); c.lineTo(sd * R * 0.55, R * 1.5); c.closePath(); c.fillStyle = mix(L.shirt, '#000000', 0.25); c.fill(); c.stroke(); }
  } else if (o === 'hoodie') {
    c.beginPath(); c.moveTo(-R * 0.95, R * 1.2); c.quadraticCurveTo(0, R * 1.75, R * 0.95, R * 1.2); c.quadraticCurveTo(0, R * 1.35, -R * 0.95, R * 1.2); c.fillStyle = mix(L.shirt, '#000000', 0.3); c.fill(); c.stroke();
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * R * 0.22, R * 1.4); c.lineTo(sd * R * 0.25, R * 2.0); c.lineWidth = lw * 0.9; c.strokeStyle = '#f4f4ef'; c.stroke(); }
  } else if (o === 'sweater') {
    c.beginPath(); c.ellipse(0, R * 1.14, R * 0.42, R * 0.14, 0, 0, Math.PI * 2); c.lineWidth = R * 0.1; c.strokeStyle = mix(L.shirt, '#000000', 0.25); c.stroke();
    c.lineWidth = lw * 0.5; c.strokeStyle = 'rgba(0,0,0,.15)';
    for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(i * R * 0.25, R * 1.5); c.lineTo(i * R * 0.3, R * 2.8); c.stroke(); }
  } else if (o === 'turtleneck') {
    rrect(c, -R * 0.36, R * 0.7, R * 0.72, R * 0.55, R * 0.12); c.fillStyle = L.shirt; c.fill(); c.stroke();
    c.lineWidth = lw * 0.5; c.strokeStyle = 'rgba(0,0,0,.2)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-R * 0.34, R * (0.8 + i * 0.11)); c.lineTo(R * 0.34, R * (0.8 + i * 0.11)); c.stroke(); }
  }
  c.restore();
}

function drawRealPerson(c: C, R: number, L: PersonLook, o: { fx: number; fy: number; lw: number; brow: number; breathe: number; look: number; lookY: number; blinkL: number; blinkR: number; mouthOpen: number; smile: number; t: number }) {
  const { fx, fy, lw, brow, breathe } = o;
  const skin = L.skin, hc = L.hairColor;
  const dark = (col: string, t: number) => mix(col, '#1a0c06', t), light = (col: string, t: number) => mix(col, '#ffffff', t);
  const hairFill = () => { const g = c.createLinearGradient(0, -R * 1.3, 0, R * 0.4); g.addColorStop(0, light(hc, 0.18)); g.addColorStop(1, dark(hc, 0.25)); return g; };
  // hair behind
  c.fillStyle = hairFill();
  if (L.hair === 'long') { rrect(c, -R * 1.08, -R * 0.98, R * 2.16, R * 2.5, R * 0.95); c.fill(); }
  if (L.hair === 'afro') { c.beginPath(); c.ellipse(0, -R * 0.3, R * 1.32, R * 1.22, 0, 0, Math.PI * 2); c.fill(); }
  if (L.hair === 'ponytail') { c.beginPath(); c.moveTo(R * 0.6, -R * 0.6); c.quadraticCurveTo(R * 1.45, -R * 0.4, R * 1.05, R * 0.9); c.quadraticCurveTo(R * 0.95, R * 0.1, R * 0.5, -R * 0.2); c.closePath(); c.fill(); }
  if (L.hair === 'bun') { c.beginPath(); c.ellipse(0, -R * 1.22, R * 0.4, R * 0.36, 0, 0, Math.PI * 2); c.fill(); }
  // body
  c.save(); c.translate(0, breathe);
  c.beginPath(); c.moveTo(-R * 1.95, R * 2.9); c.quadraticCurveTo(-R * 1.75, R * 1.25, -R * 0.36, R * 1.1); c.lineTo(R * 0.36, R * 1.1); c.quadraticCurveTo(R * 1.75, R * 1.25, R * 1.95, R * 2.9); c.closePath();
  { const g = c.createLinearGradient(0, R * 1.1, 0, R * 2.9); g.addColorStop(0, light(L.shirt, 0.08)); g.addColorStop(1, dark(L.shirt, 0.35)); c.fillStyle = g; c.fill(); }
  c.restore();
  // neck
  { const g = c.createLinearGradient(-R * 0.32, 0, R * 0.32, 0); g.addColorStop(0, dark(skin, 0.25)); g.addColorStop(0.5, skin); g.addColorStop(1, dark(skin, 0.25)); c.fillStyle = g; c.fillRect(-R * 0.32, R * 0.55, R * 0.64, R * 0.65); }
  c.fillStyle = 'rgba(40,15,5,.28)'; c.beginPath(); c.ellipse(0, R * 0.72, R * 0.36, R * 0.14, 0, 0, Math.PI * 2); c.fill();
  drawOutfit(c, R, L, lw, breathe, true);
  // ears
  for (const sd of [-1, 1]) { const g = c.createRadialGradient(sd * R * 0.9, R * 0.05, 0, sd * R * 0.9, R * 0.05, R * 0.22); g.addColorStop(0, skin); g.addColorStop(1, dark(skin, 0.3)); ell(c, sd * R * 0.88, R * 0.05, R * 0.15, R * 0.22, g); }
  // head: softer jaw
  c.beginPath(); c.moveTo(0, -R * 1.02);
  c.bezierCurveTo(R * 0.62, -R * 1.02, R * 0.9, -R * 0.62, R * 0.88, -R * 0.05);
  c.bezierCurveTo(R * 0.86, R * 0.5, R * 0.5, R * 0.95, 0, R * 1.02);
  c.bezierCurveTo(-R * 0.5, R * 0.95, -R * 0.86, R * 0.5, -R * 0.88, -R * 0.05);
  c.bezierCurveTo(-R * 0.9, -R * 0.62, -R * 0.62, -R * 1.02, 0, -R * 1.02); c.closePath();
  { const g = c.createRadialGradient(-R * 0.15 + fx, -R * 0.25, R * 0.1, 0, 0, R * 1.05); g.addColorStop(0, light(skin, 0.12)); g.addColorStop(0.6, skin); g.addColorStop(1, dark(skin, 0.3)); c.fillStyle = g; c.fill(); }
  c.save(); c.clip();
  // cheeks, temples, under-brow and jaw shading
  for (const sd of [-1, 1]) {
    const g = c.createRadialGradient(sd * R * 0.5 + fx, R * 0.28 + fy, 0, sd * R * 0.5 + fx, R * 0.28 + fy, R * 0.3); g.addColorStop(0, 'rgba(220,90,90,.22)'); g.addColorStop(1, 'rgba(220,90,90,0)');
    c.fillStyle = g; c.fillRect(-R, -R, R * 2, R * 2.2);
    const s2 = c.createRadialGradient(sd * R * 0.34 + fx, -R * 0.2 + fy, 0, sd * R * 0.34 + fx, -R * 0.2 + fy, R * 0.28); s2.addColorStop(0, 'rgba(60,25,10,.18)'); s2.addColorStop(1, 'rgba(60,25,10,0)');
    c.fillStyle = s2; c.fillRect(-R, -R, R * 2, R * 2.2);
  }
  // facial hair (painted)
  if (L.facial !== 'none') {
    c.fillStyle = L.facial === 'stubble' ? `rgba(${hexRgb(hc).join(',')},.3)` : hc;
    if (L.facial === 'beard' || L.facial === 'stubble') { c.beginPath(); c.moveTo(-R * 0.9, R * 0.0); c.quadraticCurveTo(-R * 0.82, R * 1.15, 0, R * 1.1); c.quadraticCurveTo(R * 0.82, R * 1.15, R * 0.9, R * 0.0); c.quadraticCurveTo(R * 0.55, R * 0.5, fx, R * 0.36 + fy); c.quadraticCurveTo(-R * 0.55, R * 0.5, -R * 0.9, R * 0.0); c.fill(); }
    if (L.facial === 'goatee') { c.beginPath(); c.ellipse(fx, R * 0.8 + fy, R * 0.2, R * 0.2, 0, 0, Math.PI * 2); c.fill(); }
    if (L.facial !== 'stubble') { c.beginPath(); c.moveTo(fx, R * 0.33 + fy); c.quadraticCurveTo(-R * 0.25 + fx, R * 0.26 + fy, -R * 0.36 + fx, R * 0.44 + fy); c.quadraticCurveTo(-R * 0.18 + fx, R * 0.38 + fy, fx, R * 0.41 + fy); c.quadraticCurveTo(R * 0.18 + fx, R * 0.38 + fy, R * 0.36 + fx, R * 0.44 + fy); c.quadraticCurveTo(R * 0.25 + fx, R * 0.26 + fy, fx, R * 0.33 + fy); c.fill(); }
  }
  c.restore();
  // hair on top
  c.fillStyle = hairFill();
  const front = () => { c.beginPath(); c.moveTo(-R * 0.9, -R * 0.0); c.quadraticCurveTo(-R * 1.0, -R * 1.18, 0, -R * 1.14); c.quadraticCurveTo(R * 1.0, -R * 1.18, R * 0.9, -R * 0.0); c.quadraticCurveTo(R * 0.72, -R * 0.62, R * 0.12 + fx, -R * 0.64); c.quadraticCurveTo(-R * 0.6, -R * 0.56, -R * 0.9, -R * 0.0); c.fill(); };
  switch (L.hair) {
    case 'bald': for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * R * 0.82, -R * 0.12, R * 0.12, R * 0.3, 0, 0, Math.PI * 2); c.fill(); } break;
    case 'buzz': c.save(); c.globalAlpha = 0.7; front(); c.restore(); break;
    case 'afro': case 'curly': { const big = L.hair === 'afro' ? 1.35 : 1.12;
      c.beginPath(); c.moveTo(-R * 0.92, -R * 0.1); c.quadraticCurveTo(-R * 0.6, -R * 0.72, 0, -R * 0.6); c.quadraticCurveTo(R * 0.6, -R * 0.72, R * 0.92, -R * 0.1);
      c.bezierCurveTo(R * big, -R * 0.6, R * 0.75 * big, -R * 1.3 * big, 0, -R * 1.25 * (big * 0.9)); c.bezierCurveTo(-R * 0.75 * big, -R * 1.3 * big, -R * big, -R * 0.6, -R * 0.92, -R * 0.1); c.closePath(); c.fill(); }
      c.save(); c.globalAlpha = 0.25; for (let i = 0; i < 40; i++) { const a = (i * 2.39) % (Math.PI * 2), rr2 = R * (0.4 + ((i * 37) % 60) / 100); ell(c, Math.cos(a) * rr2 * 0.95, -R * 0.45 + Math.sin(a) * rr2 * 0.75, R * 0.07, R * 0.07, light(hc, 0.3)); } c.restore(); break;
    case 'mohawk': c.beginPath(); c.moveTo(-R * 0.2, -R * 0.6); c.quadraticCurveTo(fx * 0.3, -R * 1.65, R * 0.2, -R * 0.6); c.closePath(); c.fill(); break;
    case 'spiky': { c.beginPath(); c.moveTo(-R * 0.95, -R * 0.1); const sp = 7; for (let i = 0; i <= sp; i++) { const a = Math.PI + (i / sp) * Math.PI; c.lineTo(Math.cos(a) * R * 1.2, -R * 0.35 + Math.sin(a) * R * 0.95); if (i < sp) { const b = Math.PI + ((i + 0.5) / sp) * Math.PI; c.lineTo(Math.cos(b) * R * 0.85, -R * 0.3 + Math.sin(b) * R * 0.65); } } c.lineTo(R * 0.95, -R * 0.1); c.quadraticCurveTo(0, -R * 0.6, -R * 0.95, -R * 0.1); c.fill(); break; }
    default: front();
  }
  if (L.hair !== 'bald' && L.hair !== 'buzz') {
    c.save(); c.globalAlpha = 0.22; c.strokeStyle = light(hc, 0.45); c.lineWidth = Math.max(1, R * 0.015);
    for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(-R * 0.6 + i * R * 0.12, -R * 1.05); c.quadraticCurveTo(-R * 0.5 + i * R * 0.1, -R * 0.85, -R * 0.55 + i * R * 0.13 + fx * 0.3, -R * 0.66); c.stroke(); }
    c.restore();
  }
  // brows
  c.lineCap = 'round'; c.strokeStyle = L.hair === 'bald' && L.facial === 'none' ? dark(skin, 0.6) : dark(hc, 0.1); c.lineWidth = R * 0.07;
  { const bl = brow * R * 0.1; for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * R * 0.55 + fx, -R * 0.3 + fy - bl * 0.6); c.quadraticCurveTo(sd * R * 0.36 + fx, -R * 0.42 + fy - bl, sd * R * 0.15 + fx, -R * 0.33 + fy - bl + (brow < 0 ? -brow * R * 0.05 : 0)); c.stroke(); } }
  // eyes: almond shape, iris, lids, lashes
  for (const sd of [-1, 1]) {
    const ex = sd * R * 0.34 + fx, ey = -R * 0.12 + fy, w = R * 0.2, h = R * 0.1;
    const bl = sd < 0 ? o.blinkL : o.blinkR, open = Math.max(0, 1 - bl * 1.1);
    c.save();
    c.beginPath(); c.moveTo(ex - w, ey); c.quadraticCurveTo(ex, ey - h * 2 * open, ex + w, ey); c.quadraticCurveTo(ex, ey + h * 1.3 * open, ex - w, ey); c.closePath();
    if (open > 0.1) {
      c.fillStyle = '#f6f2ee'; c.fill(); c.clip();
      const ix = ex + o.look * w * 0.35, iy = ey + o.lookY * h * 0.4;
      const g = c.createRadialGradient(ix, iy, 0, ix, iy, h * 1.05); g.addColorStop(0, light(L.eyes, 0.25)); g.addColorStop(0.75, L.eyes); g.addColorStop(1, dark(L.eyes, 0.5));
      ell(c, ix, iy, h * 1.05, h * 1.05, g); ell(c, ix, iy, h * 0.45, h * 0.45, '#0b0b0b'); ell(c, ix - h * 0.35, iy - h * 0.35, h * 0.2, h * 0.2, 'rgba(255,255,255,.9)');
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(ex - w, ey - h * 2, w * 2, h * 0.9);
    }
    c.restore();
    c.beginPath(); c.moveTo(ex - w * 1.05, ey + 0.5); c.quadraticCurveTo(ex, ey - h * 2 * open - 1, ex + w * 1.05, ey - h * 0.2);
    c.lineWidth = Math.max(1.5, R * 0.03); c.strokeStyle = '#1a0f0a'; c.stroke();
    c.beginPath(); c.moveTo(ex - w, ey + h * 0.2); c.quadraticCurveTo(ex, ey + h * 1.5 * open + 1, ex + w, ey); c.lineWidth = Math.max(1, R * 0.012); c.strokeStyle = 'rgba(80,40,30,.45)'; c.stroke();
  }
  // nose
  { const nx = fx * 1.3, ny = fy;
    const g = c.createLinearGradient(nx - R * 0.12, 0, nx + R * 0.12, 0); g.addColorStop(0, 'rgba(60,25,10,0)'); g.addColorStop(0.7, 'rgba(60,25,10,.18)'); g.addColorStop(1, 'rgba(60,25,10,0)');
    c.fillStyle = g; c.fillRect(nx - R * 0.12, -R * 0.12 + ny, R * 0.24, R * 0.36);
    ell(c, nx - R * 0.07, R * 0.22 + ny, R * 0.045, R * 0.025, 'rgba(50,20,10,.55)'); ell(c, nx + R * 0.07, R * 0.22 + ny, R * 0.045, R * 0.025, 'rgba(50,20,10,.55)');
    c.beginPath(); c.moveTo(nx - R * 0.13, R * 0.2 + ny); c.quadraticCurveTo(nx, R * 0.3 + ny, nx + R * 0.13, R * 0.2 + ny); c.lineWidth = Math.max(1, R * 0.018); c.strokeStyle = 'rgba(60,25,10,.35)'; c.stroke();
    ell(c, nx - R * 0.02, R * 0.08 + ny, R * 0.025, R * 0.07, 'rgba(255,255,255,.18)'); }
  // lips
  { const mx = fx, my = R * 0.5 + fy, mw = R * 0.24, op = Math.min(1, o.mouthOpen), sm = o.smile * R * 0.05;
    const lip = mix(skin, '#b0404c', 0.45), lipD = mix(skin, '#6a1f2a', 0.5);
    if (op > 0.08) {
      const h = R * (0.05 + op * 0.2);
      c.beginPath(); c.moveTo(mx - mw, my - sm); c.quadraticCurveTo(mx, my - R * 0.03, mx + mw, my - sm); c.quadraticCurveTo(mx, my + h * 1.6, mx - mw, my - sm); c.closePath();
      c.fillStyle = '#2a0b0e'; c.fill();
      c.save(); c.clip(); c.fillStyle = '#f4f0ea'; c.fillRect(mx - mw, my - R * 0.03, mw * 2, h * 0.35); ell(c, mx, my + h * 1.1, mw * 0.55, h * 0.45, '#b85a62'); c.restore();
      c.beginPath(); c.moveTo(mx - mw, my - sm); c.quadraticCurveTo(mx, my + h * 1.6, mx + mw, my - sm); c.quadraticCurveTo(mx, my + h * 1.9 + R * 0.06, mx - mw, my - sm); c.fillStyle = lip; c.fill();
    } else {
      c.beginPath(); c.moveTo(mx - mw, my - sm); c.quadraticCurveTo(mx - mw * 0.4, my - R * 0.07, mx, my - R * 0.04); c.quadraticCurveTo(mx + mw * 0.4, my - R * 0.07, mx + mw, my - sm); c.quadraticCurveTo(mx, my + R * 0.01, mx - mw, my - sm); c.fillStyle = lipD; c.fill();
      c.beginPath(); c.moveTo(mx - mw, my - sm); c.quadraticCurveTo(mx, my + R * 0.12, mx + mw, my - sm); c.quadraticCurveTo(mx, my + R * 0.01, mx - mw, my - sm); c.fillStyle = lip; c.fill();
      ell(c, mx, my + R * 0.05, mw * 0.4, R * 0.015, 'rgba(255,255,255,.25)');
    }
  }
}

interface Anchor { cx: number; top: number; hw: number; eyeY: number; gap: number; er: number }

function star(c: C, x: number, y: number, r: number, fill: string) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr2 = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  c.closePath(); c.fillStyle = fill; c.fill();
}

function drawHat(c: C, hat: Hat, A: Anchor, lw: number, t: number) {
  const x = A.cx, y = A.top, w = A.hw * 2;
  c.lineWidth = lw; c.strokeStyle = INK; c.lineJoin = 'round';
  const fillStroke = (f: string | CanvasGradient) => { c.fillStyle = f; c.fill(); c.stroke(); };
  switch (hat) {
    case 'crown': {
      const g = c.createLinearGradient(0, y - w * 0.3, 0, y + w * 0.06); g.addColorStop(0, '#fff0a8'); g.addColorStop(0.5, '#e8b447'); g.addColorStop(1, '#9a6a12');
      c.beginPath(); c.moveTo(x - w * 0.36, y + w * 0.06);
      const pts = [[-0.36, -0.22], [-0.2, -0.06], [0, -0.3], [0.2, -0.06], [0.36, -0.22], [0.36, 0.06]];
      for (const [px, py] of pts) c.lineTo(x + px * w, y + py * w);
      c.closePath(); fillStroke(g);
      for (const [px, py] of [[-0.36, -0.22], [0, -0.3], [0.36, -0.22]]) ell(c, x + px * w, y + py * w, w * 0.035, w * 0.035, '#fff', INK, lw * 0.6);
      ell(c, x, y - w * 0.02, w * 0.04, w * 0.04, '#d22', INK, lw * 0.5); ell(c, x - w * 0.2, y, w * 0.03, w * 0.03, '#2f5fa8'); ell(c, x + w * 0.2, y, w * 0.03, w * 0.03, '#3ca866');
      break;
    }
    case 'tophat': {
      c.beginPath(); c.ellipse(x, y + w * 0.04, w * 0.55, w * 0.09, 0, 0, Math.PI * 2); fillStroke('#141414');
      rrect(c, x - w * 0.32, y - w * 0.62, w * 0.64, w * 0.66, w * 0.05); fillStroke('#1d1d1d');
      c.fillStyle = '#c0303a'; c.fillRect(x - w * 0.32, y - w * 0.12, w * 0.64, w * 0.1);
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x - w * 0.24, y - w * 0.58, w * 0.08, w * 0.42);
      break;
    }
    case 'beanie': {
      c.beginPath(); c.moveTo(x - w * 0.5, y + w * 0.2); c.bezierCurveTo(x - w * 0.52, y - w * 0.42, x + w * 0.52, y - w * 0.42, x + w * 0.5, y + w * 0.2); c.closePath(); fillStroke('#81B64C');
      c.save(); c.clip(); c.strokeStyle = 'rgba(0,0,0,.15)'; c.lineWidth = lw * 0.8;
      for (let i = -5; i <= 5; i++) { c.beginPath(); c.moveTo(x + i * w * 0.09, y + w * 0.2); c.lineTo(x + i * w * 0.07, y - w * 0.4); c.stroke(); }
      c.restore();
      rrect(c, x - w * 0.53, y + w * 0.08, w * 1.06, w * 0.16, w * 0.06); c.strokeStyle = INK; c.lineWidth = lw; fillStroke('#5F8F36');
      ell(c, x, y - w * 0.3, w * 0.1, w * 0.1, '#F5F7F6', INK, lw);
      break;
    }
    case 'cap': {
      c.beginPath(); c.ellipse(x, y + w * 0.16, w * 0.5, w * 0.42, 0, Math.PI, 0); c.closePath(); fillStroke('#81B64C');
      c.beginPath(); c.ellipse(x + w * 0.32, y + w * 0.15, w * 0.42, w * 0.08, -0.08, 0, Math.PI * 2); fillStroke('#5F8F36');
      ell(c, x, y - w * 0.25, w * 0.04, w * 0.03, '#5F8F36', INK, lw * 0.6);
      ell(c, x - w * 0.08, y - w * 0.05, w * 0.1, w * 0.1, '#F5F7F6', INK, lw * 0.6);
      c.fillStyle = INK; c.font = `900 ${w * 0.12}px "DM Sans", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♜', x - w * 0.08, y - w * 0.045);
      break;
    }
    case 'party': {
      c.beginPath(); c.moveTo(x - w * 0.26, y + w * 0.08); c.lineTo(x + w * 0.04, y - w * 0.62); c.lineTo(x + w * 0.3, y + w * 0.08); c.closePath();
      const g = c.createLinearGradient(x - w * 0.3, 0, x + w * 0.3, 0); g.addColorStop(0, '#e86a9a'); g.addColorStop(1, '#ff9a3c'); fillStroke(g);
      c.save(); c.clip(); for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(x - w * 0.5, y - w * 0.5 + i * w * 0.15); c.lineTo(x + w * 0.5, y - w * 0.3 + i * w * 0.15); c.lineWidth = w * 0.04; c.strokeStyle = '#ffe34d'; c.stroke(); } c.restore();
      star(c, x + w * 0.04, y - w * 0.66, w * 0.08, '#ffe34d');
      break;
    }
    case 'wizard': {
      c.beginPath(); c.ellipse(x, y + w * 0.06, w * 0.62, w * 0.1, 0, 0, Math.PI * 2); fillStroke('#4c2a85');
      c.beginPath(); c.moveTo(x - w * 0.34, y + w * 0.05); c.quadraticCurveTo(x - w * 0.1, y - w * 0.5, x + w * 0.32 + Math.sin(t * 2) * w * 0.03, y - w * 0.95); c.quadraticCurveTo(x + w * 0.12, y - w * 0.45, x + w * 0.34, y + w * 0.05); c.closePath(); fillStroke('#6b3fa0');
      star(c, x - w * 0.05, y - w * 0.25, w * 0.07, '#E8B447'); star(c, x + w * 0.14, y - w * 0.5, w * 0.05, '#E8B447'); star(c, x - w * 0.15, y - w * 0.02, w * 0.04, '#fff0a8');
      break;
    }
    case 'viking': {
      for (const sd of [-1, 1]) {
        c.beginPath(); c.moveTo(x + sd * w * 0.38, y - w * 0.02); c.quadraticCurveTo(x + sd * w * 0.72, y - w * 0.1, x + sd * w * 0.66, y - w * 0.55);
        c.quadraticCurveTo(x + sd * w * 0.58, y - w * 0.2, x + sd * w * 0.36, y - w * 0.16); c.closePath(); fillStroke('#f3ead7');
      }
      const g = c.createLinearGradient(x - w * 0.45, 0, x + w * 0.45, 0); g.addColorStop(0, '#6d7682'); g.addColorStop(0.45, '#e9edf2'); g.addColorStop(1, '#5c646f');
      c.beginPath(); c.ellipse(x, y + w * 0.14, w * 0.47, w * 0.42, 0, Math.PI, 0); c.closePath(); fillStroke(g);
      rrect(c, x - w * 0.5, y + w * 0.06, w * 1.0, w * 0.12, w * 0.04); fillStroke('#8a6a45');
      for (let i = -3; i <= 3; i++) ell(c, x + i * w * 0.13, y + w * 0.12, w * 0.018, w * 0.018, '#e8b447');
      break;
    }
    case 'cowboy': {
      c.beginPath(); c.moveTo(x - w * 0.7, y + w * 0.02); c.quadraticCurveTo(x, y + w * 0.22, x + w * 0.7, y + w * 0.02); c.quadraticCurveTo(x, y + w * 0.08, x - w * 0.7, y + w * 0.02); fillStroke('#8a5a2b');
      c.beginPath(); c.moveTo(x - w * 0.34, y + w * 0.06); c.quadraticCurveTo(x - w * 0.36, y - w * 0.42, x - w * 0.1, y - w * 0.36); c.quadraticCurveTo(x, y - w * 0.28, x + w * 0.1, y - w * 0.36);
      c.quadraticCurveTo(x + w * 0.36, y - w * 0.42, x + w * 0.34, y + w * 0.06); c.closePath(); fillStroke('#a8693f');
      c.fillStyle = '#4a2c1a'; c.fillRect(x - w * 0.34, y - w * 0.05, w * 0.68, w * 0.08);
      star(c, x, y - w * 0.01, w * 0.05, '#E8B447');
      break;
    }
    case 'chef': {
      c.beginPath(); c.moveTo(x - w * 0.36, y + w * 0.08);
      c.bezierCurveTo(x - w * 0.62, y - w * 0.2, x - w * 0.3, y - w * 0.6, x - w * 0.1, y - w * 0.45);
      c.bezierCurveTo(x, y - w * 0.75, x + w * 0.3, y - w * 0.65, x + w * 0.18, y - w * 0.42);
      c.bezierCurveTo(x + w * 0.55, y - w * 0.55, x + w * 0.62, y - w * 0.15, x + w * 0.36, y + w * 0.08); c.closePath(); fillStroke('#fbfbf7');
      rrect(c, x - w * 0.38, y - w * 0.02, w * 0.76, w * 0.16, w * 0.04); fillStroke('#efefe8');
      break;
    }
    case 'headphones': {
      c.beginPath(); c.moveTo(x - A.hw * 1.0, A.eyeY + A.er); c.bezierCurveTo(x - A.hw * 1.15, y - w * 0.35, x + A.hw * 1.15, y - w * 0.35, x + A.hw * 1.0, A.eyeY + A.er);
      c.lineWidth = w * 0.07; c.strokeStyle = INK; c.stroke(); c.lineWidth = w * 0.045; c.strokeStyle = '#3a4048'; c.stroke();
      for (const sd of [-1, 1]) {
        rrect(c, x + sd * A.hw * 1.0 - w * 0.09, A.eyeY - A.er * 0.2, w * 0.18, w * 0.3, w * 0.07); c.lineWidth = lw; c.strokeStyle = INK; fillStroke('#1d232b');
        c.fillStyle = '#81B64C'; c.fillRect(x + sd * A.hw * 1.0 - w * 0.02, A.eyeY + A.er * 0.3, w * 0.04, w * 0.14);
      }
      break;
    }
    case 'halo': {
      c.save(); c.shadowColor = '#ffe34d'; c.shadowBlur = w * 0.15;
      c.beginPath(); c.ellipse(x, y - w * 0.2 + Math.sin(t * 2) * w * 0.02, w * 0.36, w * 0.08, 0, 0, Math.PI * 2); c.lineWidth = w * 0.05; c.strokeStyle = '#ffd23f'; c.stroke();
      c.restore();
      break;
    }
    default: break;
  }
}

function drawEyewear(c: C, ew: Eyewear, A: Anchor, lw: number, t: number) {
  const x = A.cx, y = A.eyeY, g = A.gap, r = A.er;
  const eyesAt = g > 0 ? [-g, g] : [0];
  c.lineWidth = lw; c.strokeStyle = INK;
  switch (ew) {
    case 'sunglasses': {
      for (const ox of eyesAt) {
        rrect(c, x + ox - r * 1.5, y - r * 1.05, r * 3, r * 2.1, r * 0.7);
        const gr = c.createLinearGradient(0, y - r, 0, y + r); gr.addColorStop(0, '#2b3036'); gr.addColorStop(1, '#050608'); c.fillStyle = gr; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x + ox - r * 0.9, y - r * 0.5); c.lineTo(x + ox - r * 0.3, y - r * 0.5); c.lineWidth = lw * 0.9; c.strokeStyle = 'rgba(255,255,255,.55)'; c.stroke(); c.lineWidth = lw; c.strokeStyle = INK;
      }
      if (g > 0) { c.beginPath(); c.moveTo(x - g + r * 1.5, y - r * 0.4); c.quadraticCurveTo(x, y - r * 0.8, x + g - r * 1.5, y - r * 0.4); c.stroke(); }
      break;
    }
    case 'round': case 'hearts': case 'goggles': {
      for (const ox of eyesAt) {
        if (ew === 'hearts') {
          const hx = x + ox, hy = y - r * 0.2, s2 = r * 1.5;
          c.beginPath(); c.moveTo(hx, hy + s2 * 0.9); c.bezierCurveTo(hx - s2 * 1.4, hy - s2 * 0.1, hx - s2 * 0.6, hy - s2 * 1.1, hx, hy - s2 * 0.35);
          c.bezierCurveTo(hx + s2 * 0.6, hy - s2 * 1.1, hx + s2 * 1.4, hy - s2 * 0.1, hx, hy + s2 * 0.9); c.closePath();
          c.fillStyle = 'rgba(232,80,130,.75)'; c.fill(); c.stroke();
        } else if (ew === 'goggles') {
          ell(c, x + ox, y, r * 1.55, r * 1.45, '#8a6a45', INK, lw * 1.2);
          const gr = c.createRadialGradient(x + ox - r * 0.4, y - r * 0.4, 0, x + ox, y, r * 1.2); gr.addColorStop(0, 'rgba(160,220,255,.7)'); gr.addColorStop(1, 'rgba(40,110,160,.55)');
          ell(c, x + ox, y, r * 1.2, r * 1.1, gr, INK, lw);
        } else {
          c.beginPath(); c.arc(x + ox, y, r * 1.4, 0, Math.PI * 2); c.lineWidth = lw * 1.1; c.strokeStyle = '#b8862b'; c.stroke();
          c.fillStyle = 'rgba(200,230,255,.12)'; c.fill();
        }
      }
      if (g > 0) { c.beginPath(); c.moveTo(x - g + r * 1.4, y - r * 0.2); c.quadraticCurveTo(x, y - r * 0.7, x + g - r * 1.4, y - r * 0.2); c.lineWidth = lw; c.strokeStyle = ew === 'round' ? '#b8862b' : INK; c.stroke(); }
      if (ew === 'goggles') { c.beginPath(); c.moveTo(x - g - r * 1.5, y); c.lineTo(x - A.hw * 1.05, y - r * 0.2); c.moveTo(x + g + r * 1.5, y); c.lineTo(x + A.hw * 1.05, y - r * 0.2); c.lineWidth = r * 0.5; c.strokeStyle = '#4a2c1a'; c.stroke(); }
      break;
    }
    case 'visor': {
      const half = (g > 0 ? g : r) + r * 1.8;
      rrect(c, x - half, y - r * 0.85, half * 2, r * 1.7, r * 0.8);
      const gr = c.createLinearGradient(x - half, 0, x + half, 0); gr.addColorStop(0, 'rgba(129,182,76,.85)'); gr.addColorStop(0.5, 'rgba(180,255,120,.9)'); gr.addColorStop(1, 'rgba(129,182,76,.85)');
      c.save(); c.shadowColor = '#81B64C'; c.shadowBlur = r * 1.2; c.fillStyle = gr; c.fill(); c.restore(); c.stroke();
      const sy = y - r * 0.7 + ((t * 1.2) % 1) * r * 1.4;
      c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(x - half + r * 0.4, sy, half * 2 - r * 0.8, r * 0.12);
      break;
    }
    case 'monocle': {
      const ox = eyesAt[eyesAt.length - 1];
      c.beginPath(); c.arc(x + ox, y, r * 1.45, 0, Math.PI * 2); c.fillStyle = 'rgba(200,230,255,.15)'; c.fill(); c.lineWidth = lw * 1.3; c.strokeStyle = '#E8B447'; c.stroke();
      c.beginPath(); c.moveTo(x + ox + r * 1.0, y + r * 1.05); c.quadraticCurveTo(x + ox + r * 2.2, y + r * 3.5, x + ox + r * 1.2, y + r * 5); c.lineWidth = lw * 0.6; c.stroke();
      break;
    }
    case 'eyepatch': {
      const ox = eyesAt[eyesAt.length - 1];
      c.beginPath(); c.moveTo(x - A.hw * 1.02, y - r * 2.2); c.lineTo(x + A.hw * 1.02, y + r * 0.6); c.lineWidth = r * 0.3; c.strokeStyle = INK; c.stroke();
      ell(c, x + ox, y, r * 1.3, r * 1.15, '#111', INK, lw);
      break;
    }
    default: break;
  }
}

function drawPerson(c: C, R: number, L: PersonLook, o: { fx: number; fy: number; lw: number; brow: number; breathe: number; eyes: (ex: number, ey: number, er: number, iris: string) => void; mouthOpen: number; smile: number; t: number }) {
  const { fx, fy, lw, brow, breathe } = o;
  const hc = L.hairColor;
  const shine = (x: number, y: number, rx: number, ry: number) => { c.save(); c.globalAlpha = 0.18; ell(c, x, y, rx, ry, '#fff'); c.restore(); };
  // hair behind the head
  if (L.hair === 'long') { rrect(c, -R * 1.12, -R * 0.98, R * 2.24, R * 2.55, R * 0.9); c.fillStyle = hc; c.fill(); }
  if (L.hair === 'afro') { for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; ell(c, Math.cos(a) * R * 0.95, -R * 0.25 + Math.sin(a) * R * 0.95, R * 0.42, R * 0.42, hc); } ell(c, 0, -R * 0.25, R * 1.1, R * 1.05, hc); }
  if (L.hair === 'ponytail') { c.beginPath(); c.moveTo(R * 0.6, -R * 0.6); c.quadraticCurveTo(R * 1.5, -R * 0.4 + Math.sin(o.t * 2) * R * 0.05, R * 1.1, R * 0.9); c.quadraticCurveTo(R * 1.0, R * 0.1, R * 0.5, -R * 0.2); c.closePath(); c.fillStyle = hc; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); }
  if (L.hair === 'bun') { ell(c, 0, -R * 1.25, R * 0.42, R * 0.38, hc, INK, lw); shine(-R * 0.12, -R * 1.35, R * 0.15, R * 0.08); }
  shoulders(c, R, L.shirt, lw, breathe);
  c.fillStyle = L.skin; c.fillRect(-R * 0.3, R * 0.6, R * 0.6, R * 0.6);
  drawOutfit(c, R, L, lw, breathe, false);
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(-R * 0.3, R * 0.75, R * 0.6, R * 0.12);
  ell(c, -R * 0.92, R * 0.05, R * 0.16, R * 0.22, L.skin, INK, lw); ell(c, R * 0.92, R * 0.05, R * 0.16, R * 0.22, L.skin, INK, lw);
  ell(c, 0, 0, R * 0.9, R * 1.02, L.skin, INK, lw); shade(c, 0, 0, R * 0.9, R * 1.02);
  // facial hair
  c.fillStyle = hc;
  if (L.facial === 'beard') {
    c.beginPath(); c.moveTo(-R * 0.86, R * 0.0); c.quadraticCurveTo(-R * 0.8, R * 1.2, 0, R * 1.15); c.quadraticCurveTo(R * 0.8, R * 1.2, R * 0.86, R * 0.0);
    c.quadraticCurveTo(R * 0.55, R * 0.5, 0, R * 0.36); c.quadraticCurveTo(-R * 0.55, R * 0.5, -R * 0.86, R * 0.0); c.fill();
  }
  if (L.facial === 'stubble') { c.save(); c.globalAlpha = 0.28; c.beginPath(); c.ellipse(fx, R * 0.55 + fy, R * 0.62, R * 0.42, 0, 0, Math.PI); c.fill(); c.restore(); }
  if (L.facial === 'goatee') { c.beginPath(); c.ellipse(fx, R * 0.82 + fy, R * 0.18, R * 0.2, 0, 0, Math.PI * 2); c.fill(); }
  if (L.facial === 'mustache' || L.facial === 'beard' || L.facial === 'goatee') {
    c.beginPath(); c.moveTo(fx, R * 0.33 + fy);
    c.quadraticCurveTo(-R * 0.25 + fx, R * 0.22 + fy, -R * 0.42 + fx, R * 0.42 + fy); c.quadraticCurveTo(-R * 0.2 + fx, R * 0.36 + fy, fx, R * 0.4 + fy);
    c.quadraticCurveTo(R * 0.2 + fx, R * 0.36 + fy, R * 0.42 + fx, R * 0.42 + fy); c.quadraticCurveTo(R * 0.25 + fx, R * 0.22 + fy, fx, R * 0.33 + fy); c.fill();
  }
  // hair on top
  c.fillStyle = hc; c.lineWidth = lw; c.strokeStyle = INK;
  switch (L.hair) {
    case 'curly': for (let i = 0; i < 11; i++) { const a = Math.PI + (i / 10) * Math.PI; ell(c, Math.cos(a) * R * 0.85, -R * 0.38 + Math.sin(a) * R * 0.78, R * 0.28, R * 0.28, hc); } break;
    case 'afro': c.beginPath(); c.moveTo(-R * 0.9, -R * 0.1); c.quadraticCurveTo(-R * 0.6, -R * 0.75, 0, -R * 0.62); c.quadraticCurveTo(R * 0.6, -R * 0.75, R * 0.9, -R * 0.1); c.lineTo(R * 1.0, -R * 1.0); c.lineTo(-R * 1.0, -R * 1.0); c.closePath(); c.fill(); break;
    case 'buzz': c.save(); c.globalAlpha = 0.75; c.beginPath(); c.ellipse(0, -R * 0.1, R * 0.92, R * 0.98, 0, Math.PI * 1.08, Math.PI * 1.92); c.lineTo(R * 0.7, -R * 0.45); c.quadraticCurveTo(0, -R * 0.7, -R * 0.7, -R * 0.45); c.closePath(); c.fill(); c.restore(); break;
    case 'mohawk': for (let i = 0; i < 5; i++) { const yy = -R * 1.0 + i * R * 0.15; c.beginPath(); c.moveTo(-R * 0.14, yy + R * 0.3); c.lineTo(fx * 0.3, yy - R * 0.38); c.lineTo(R * 0.14, yy + R * 0.3); c.closePath(); c.fill(); c.stroke(); } break;
    case 'spiky': {
      c.beginPath(); c.moveTo(-R * 0.95, -R * 0.1);
      const sp = 7; for (let i = 0; i <= sp; i++) { const a = Math.PI + (i / sp) * Math.PI; c.lineTo(Math.cos(a) * R * 1.25, -R * 0.35 + Math.sin(a) * R * 1.0); if (i < sp) { const b = Math.PI + ((i + 0.5) / sp) * Math.PI; c.lineTo(Math.cos(b) * R * 0.8, -R * 0.3 + Math.sin(b) * R * 0.6); } }
      c.lineTo(R * 0.95, -R * 0.1); c.quadraticCurveTo(0, -R * 0.6, -R * 0.95, -R * 0.1); c.fill(); c.stroke();
      break;
    }
    case 'bald': {
      shine(-R * 0.3, -R * 0.7, R * 0.25, R * 0.12);
      for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * R * 0.82, -R * 0.15, R * 0.14, R * 0.32, 0, 0, Math.PI * 2); c.fill(); }
      break;
    }
    case 'long': case 'ponytail': case 'bun': {
      c.beginPath(); c.moveTo(-R * 0.95, R * 0.2); c.quadraticCurveTo(-R * 1.05, -R * 1.2, 0, -R * 1.12); c.quadraticCurveTo(R * 1.05, -R * 1.2, R * 0.95, R * 0.2);
      c.quadraticCurveTo(R * 0.8, -R * 0.55, fx + R * 0.05, -R * 0.68); c.quadraticCurveTo(-R * 0.75, -R * 0.55, -R * 0.95, R * 0.2); c.fill();
      shine(-R * 0.4, -R * 0.85, R * 0.3, R * 0.1);
      break;
    }
    default: {
      c.beginPath(); c.moveTo(-R * 0.92, -R * 0.05); c.quadraticCurveTo(-R * 1.0, -R * 1.15, 0, -R * 1.12); c.quadraticCurveTo(R * 1.0, -R * 1.15, R * 0.92, -R * 0.05);
      c.quadraticCurveTo(R * 0.7, -R * 0.65, R * 0.1 + fx, -R * 0.62); c.quadraticCurveTo(-R * 0.6, -R * 0.55, -R * 0.92, -R * 0.05); c.fill();
      shine(-R * 0.35, -R * 0.85, R * 0.3, R * 0.1);
    }
  }
  // brows, eyes, nose, cheeks, mouth
  c.lineWidth = lw * 1.4; c.strokeStyle = L.hair === 'bald' && L.facial === 'none' ? '#5a4030' : hc;
  { const bl = brow * R * 0.1; for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * R * 0.52 + fx, -R * 0.32 + fy - bl * 0.6); c.quadraticCurveTo(sd * R * 0.35 + fx, -R * 0.43 + fy - bl, sd * R * 0.16 + fx, -R * 0.34 + fy - bl + (brow < 0 ? -brow * R * 0.05 : 0)); c.stroke(); } }
  o.eyes(R * 0.34, -R * 0.12, R * 0.15, L.eyes);
  c.beginPath(); c.moveTo(fx * 1.3, R * 0.02 + fy); c.quadraticCurveTo(R * 0.1 + fx * 1.3, R * 0.22 + fy, fx * 1.3 - R * 0.04, R * 0.25 + fy);
  c.lineWidth = lw * 0.8; c.strokeStyle = 'rgba(0,0,0,.45)'; c.stroke();
  ell(c, -R * 0.55 + fx, R * 0.25 + fy, R * 0.14, R * 0.08, 'rgba(230,110,110,.28)'); ell(c, R * 0.55 + fx, R * 0.25 + fy, R * 0.14, R * 0.08, 'rgba(230,110,110,.28)');
  mouth(c, fx, R * 0.5 + fy, R * 0.42, o.mouthOpen, o.smile, lw);
}

export function drawAvatar(c: C, id: AvatarId, p: AvatarPose, lookOpts: AvatarLook = {}) {
  const R = p.size * 0.62;          // head radius
  const lw = Math.max(2, R * 0.045);
  const fx = p.yaw * R * 0.22;       // features follow head turn
  const fy = p.pitch * R * 0.12;
  const look = Math.max(-1, Math.min(1, (p.lookX ?? 0) + p.yaw * 0.5));
  const lookY = Math.max(-1, Math.min(1, p.lookY ?? 0));
  const brow = p.brow ?? 0;
  const breathe = Math.sin(p.t * 1.7) * R * 0.025;
  const A: Anchor = { cx: 0, top: -R * 1.0, hw: R * 0.95, eyeY: -R * 0.12, gap: R * 0.36, er: R * 0.2 };
  const finish = () => {
    if (lookOpts.eyewear && lookOpts.eyewear !== 'none') drawEyewear(c, lookOpts.eyewear, { ...A, cx: A.cx + fx, eyeY: A.eyeY + fy }, lw, p.t);
    if (lookOpts.hat && lookOpts.hat !== 'none') drawHat(c, lookOpts.hat, { ...A, cx: A.cx + fx * 0.4 }, lw, p.t);
  };
  c.save();
  c.translate(p.x, p.y);
  c.rotate(p.roll);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const eyes = (ex: number, ey: number, er: number, iris: string) => {
    eye(c, -ex + fx, ey + fy, er, p.blinkL, iris, look, lw, lookY);
    eye(c, ex + fx, ey + fy, er, p.blinkR, iris, look, lw, lookY);
  };
  if (/^[wb][KQRBNP]$/.test(id)) {
    const kind = id[1], F = PIECE_FACE[kind], im = sprite(id);
    const H = R * 3.3;                       // sprite size
    const flip = kind === 'N' && p.yaw > 0.4; // the knight turns to face where you look
    // put the face point of the sprite on the tracked face
    const ox = -F.ex * H, oy = -F.ey * H - R * 0.05;
    c.save();
    c.translate(0, breathe * 0.5);
    c.scale((flip ? -1 : 1) * (1 - Math.abs(p.yaw) * 0.12), 1);
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = R * 0.25; c.shadowOffsetY = R * 0.08;
    if (im) c.drawImage(im, ox, oy, H, H);
    else { ell(c, 0, R * 0.3, R * 0.9, R * 1.2, id[0] === 'w' ? '#efe6d2' : '#2b2e38', INK, lw); }
    c.shadowBlur = 0; c.shadowOffsetY = 0;
    const fx2 = (flip ? -1 : 1) * fx * 0.6;
    const er = F.er * H, gap = F.gap * H;
    const iris = id[0] === 'w' ? '#4a3326' : '#3a6a2a';
    if (kind === 'N') {
      eye(c, (0.53 - F.ex) * H + fx2, 0 + fy, er * 1.15, Math.max(p.blinkL, p.blinkR), iris, flip ? -look : look, lw, lookY);
      brows(c, (0.53 - F.ex) * H + fx2, -er * 1.6 + fy, 0, er * 1.4, brow, INK, lw * 0.8);
      mouth(c, (0.27 - F.ex) * H + fx2 * 0.5, (F.my - F.ey) * H + fy, F.mw * H, p.mouth, p.smile, lw * 0.9);
    } else {
      eye(c, -gap + fx2, fy, er, p.blinkL, iris, look, lw * 0.9, lookY);
      eye(c, gap + fx2, fy, er, p.blinkR, iris, look, lw * 0.9, lookY);
      brows(c, fx2, -er * 1.7 + fy, gap, er * 1.5, brow, INK, lw * 0.8);
      ell(c, -gap * 1.75 + fx2, er * 1.3 + fy, er * 0.8, er * 0.45, 'rgba(232,110,120,.35)');
      ell(c, gap * 1.75 + fx2, er * 1.3 + fy, er * 0.8, er * 0.45, 'rgba(232,110,120,.35)');
      mouth(c, fx2, (F.my - F.ey) * H + fy, F.mw * H, p.mouth, p.smile, lw * 0.9);
    }
    c.restore();
    const tops: Record<string, number> = { K: 0.3, Q: 0.3, R: 0.16, B: 0.14, N: 0.12, P: 0.2 };
    const fl = flip ? -1 : 1;
    A.cx = kind === 'N' ? fl * (0.53 - F.ex) * H : 0; A.top = (tops[kind] - F.ey) * H - R * 0.05;
    A.hw = H * (kind === 'P' ? 0.17 : kind === 'N' ? 0.2 : 0.28); A.eyeY = 0; A.gap = gap; A.er = er * (kind === 'N' ? 1.15 : 1);
    if (lookOpts.eyewear && lookOpts.eyewear !== 'none') drawEyewear(c, lookOpts.eyewear, { ...A, cx: A.cx + fx * 0.6 }, lw, p.t);
    if (lookOpts.hat && lookOpts.hat !== 'none') drawHat(c, lookOpts.hat, { ...A, cx: kind === 'N' ? fl * (0.62 - F.ex) * H : 0 }, lw, p.t);
    c.restore();
    return;
  }
  switch (id) {
    case 'knight': {
      A.top = -R * 1.05; A.eyeY = -R * 0.04; A.gap = R * 0.33; A.er = R * 0.15;
      shoulders(c, R, '#3a4048', lw, breathe);
      // plume
      c.save(); c.rotate(Math.sin(p.t * 2) * 0.05);
      c.beginPath(); c.moveTo(-R * 0.15, -R * 0.95); c.quadraticCurveTo(R * 0.2, -R * 1.9, R * 1.05, -R * 1.45);
      c.quadraticCurveTo(R * 0.55, -R * 1.25, R * 0.25, -R * 0.9); c.closePath(); c.fillStyle = '#81B64C'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      c.restore();
      const g = c.createLinearGradient(-R, 0, R, 0); g.addColorStop(0, '#6d7682'); g.addColorStop(0.45, '#e9edf2'); g.addColorStop(1, '#5c646f');
      rrect(c, -R * 0.95, -R * 1.05, R * 1.9, R * 2.15, R * 0.75); c.fillStyle = g; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      // visor slit with glowing eyes
      rrect(c, -R * 0.75 + fx, -R * 0.2 + fy, R * 1.5, R * 0.32, R * 0.12); c.fillStyle = '#0b0f10'; c.fill(); c.stroke();
      const glow = 1 - Math.max(p.blinkL, p.blinkR) * 0.8;
      c.shadowColor = '#81B64C'; c.shadowBlur = R * 0.3 * glow;
      ell(c, -R * 0.33 + fx, -R * 0.04 + fy, R * 0.15, R * 0.07 * glow + 0.5, `rgba(129,182,76,${0.35 + glow * 0.65})`);
      ell(c, R * 0.33 + fx, -R * 0.04 + fy, R * 0.15, R * 0.07 * glow + 0.5, `rgba(129,182,76,${0.35 + glow * 0.65})`);
      c.shadowBlur = 0;
      // breathing vents light up when talking
      for (let i = -2; i <= 2; i++) {
        c.beginPath(); c.moveTo(i * R * 0.17 + fx, R * 0.42 + fy); c.lineTo(i * R * 0.17 + fx, R * 0.72 + fy);
        c.lineWidth = lw * 1.4; c.strokeStyle = p.mouth > 0.1 ? `rgba(232,180,71,${0.4 + p.mouth * 0.6})` : '#2b3036'; c.stroke();
      }
      break;
    }
    case 'robot': {
      A.top = -R * 1.05; A.eyeY = -R * 0.35; A.gap = R * 0.41; A.er = R * 0.18; A.hw = R;
      shoulders(c, R, '#4b5563', lw, breathe);
      c.beginPath(); c.moveTo(0, -R * 1.05); c.lineTo(0, -R * 1.45); c.lineWidth = lw * 1.4; c.strokeStyle = INK; c.stroke();
      ell(c, 0, -R * 1.5, R * 0.13, R * 0.13, Math.sin(p.t * 5) > 0 ? '#ff5058' : '#7a1f27', INK, lw);
      rrect(c, -R, -R * 1.05, R * 2, R * 2.05, R * 0.25); c.fillStyle = '#aab3bf'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      ell(c, -R * 1.05, 0, R * 0.12, R * 0.3, '#7d8794', INK, lw); ell(c, R * 1.05, 0, R * 0.12, R * 0.3, '#7d8794', INK, lw);
      const eh = Math.max(0.05, 1 - Math.max(p.blinkL, p.blinkR)) * R * 0.28;
      c.shadowColor = '#5ad7ff'; c.shadowBlur = R * 0.25;
      rrect(c, -R * 0.62 + fx, -R * 0.35 + fy - eh / 2, R * 0.42, eh, R * 0.06); c.fillStyle = '#5ad7ff'; c.fill();
      rrect(c, R * 0.2 + fx, -R * 0.35 + fy - eh / 2, R * 0.42, eh, R * 0.06); c.fill();
      c.shadowBlur = 0;
      rrect(c, -R * 0.55 + fx, R * 0.3 + fy, R * 1.1, R * 0.38, R * 0.08); c.fillStyle = '#1d232b'; c.fill(); c.stroke();
      for (let i = 0; i < 7; i++) {
        const bh = R * 0.3 * (0.15 + p.mouth * (0.5 + 0.5 * Math.abs(Math.sin(p.t * 18 + i))));
        c.fillStyle = '#81B64C'; c.fillRect(-R * 0.48 + i * R * 0.145 + fx, R * 0.49 + fy - bh / 2, R * 0.09, bh);
      }
      break;
    }
    case 'cat': case 'fox': {
      A.top = -R * 0.88; A.eyeY = -R * 0.12; A.gap = R * 0.38; A.er = R * 0.2;
      const fox = id === 'fox';
      const fur = fox ? '#e8762b' : '#f2a33a', inner = fox ? '#fff3e6' : '#f6b5c0';
      shoulders(c, R, fox ? '#2f5fa8' : '#81B64C', lw, breathe);
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(s * R * 0.25, -R * 0.85); c.lineTo(s * R * (fox ? 0.95 : 0.85), -R * (fox ? 1.55 : 1.35)); c.lineTo(s * R * 0.95, -R * 0.35); c.closePath();
        c.fillStyle = fur; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.moveTo(s * R * 0.4, -R * 0.75); c.lineTo(s * R * (fox ? 0.85 : 0.78), -R * (fox ? 1.3 : 1.15)); c.lineTo(s * R * 0.82, -R * 0.5); c.closePath(); c.fillStyle = inner; c.fill();
      }
      ell(c, 0, 0, R, R * 0.92, fur, INK, lw); shade(c, 0, 0, R, R * 0.92);
      if (fox) { c.beginPath(); c.moveTo(-R, R * 0.05); c.quadraticCurveTo(-R * 0.2, R * 0.1, 0 + fx, R * 0.92); c.quadraticCurveTo(R * 0.2, R * 0.1, R, R * 0.05); c.quadraticCurveTo(R * 0.6, R * 0.9, 0, R * 0.92); c.quadraticCurveTo(-R * 0.6, R * 0.9, -R, R * 0.05); c.fillStyle = '#fff3e6'; c.fill(); }
      else ell(c, fx, R * 0.42 + fy, R * 0.55, R * 0.38, '#fff3e6');
      eyes(R * 0.38, -R * 0.12, R * 0.2, fox ? '#7a4a12' : '#59b34a');
      brows(c, fx, -R * 0.42 + fy, R * 0.38, R * 0.28, brow, fox ? '#7a3a10' : '#a8641c', lw);
      c.beginPath(); c.moveTo(-R * 0.09 + fx, R * 0.18 + fy); c.lineTo(R * 0.09 + fx, R * 0.18 + fy); c.lineTo(fx, R * 0.29 + fy); c.closePath(); c.fillStyle = fox ? INK : '#e86a85'; c.fill();
      mouth(c, fx, R * 0.4 + fy, R * 0.42, p.mouth, p.smile, lw);
      c.lineWidth = lw * 0.7; c.strokeStyle = INK;
      for (const s of [-1, 1]) for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(s * R * 0.32 + fx, R * 0.28 + fy + k * R * 0.07); c.lineTo(s * R * 1.05 + fx, R * 0.22 + fy + k * R * 0.14); c.stroke(); }
      break;
    }
    case 'panda': {
      A.top = -R * 0.9; A.eyeY = -R * 0.1; A.gap = R * 0.38; A.er = R * 0.2;
      shoulders(c, R, '#1b1b1b', lw, breathe);
      ell(c, -R * 0.72, -R * 0.75, R * 0.3, R * 0.3, '#1b1b1b'); ell(c, R * 0.72, -R * 0.75, R * 0.3, R * 0.3, '#1b1b1b');
      ell(c, 0, 0, R, R * 0.9, '#f7f7f2', INK, lw); shade(c, 0, 0, R, R * 0.9);
      c.save(); c.translate(fx, fy);
      for (const s of [-1, 1]) { c.save(); c.translate(s * R * 0.38, -R * 0.08); c.rotate(s * -0.5); ell(c, 0, 0, R * 0.26, R * 0.34, '#1b1b1b'); c.restore(); }
      c.restore();
      eye(c, -R * 0.38 + fx, -R * 0.1 + fy, R * 0.12, p.blinkL, '#2a2a2a', look, lw * 0.6);
      eye(c, R * 0.38 + fx, -R * 0.1 + fy, R * 0.12, p.blinkR, '#2a2a2a', look, lw * 0.6);
      ell(c, fx, R * 0.2 + fy, R * 0.13, R * 0.08, '#1b1b1b');
      mouth(c, fx, R * 0.4 + fy, R * 0.36, p.mouth, p.smile, lw);
      break;
    }
    case 'alien': {
      A.top = -R * 1.22; A.eyeY = -R * 0.12; A.gap = R * 0.4; A.er = R * 0.24;
      shoulders(c, R, '#4c2a85', lw, breathe);
      c.beginPath(); c.moveTo(0, -R * 1.25); c.bezierCurveTo(R * 1.35, -R * 1.2, R * 0.9, R * 0.75, 0, R * 1.0); c.bezierCurveTo(-R * 0.9, R * 0.75, -R * 1.35, -R * 1.2, 0, -R * 1.25);
      c.fillStyle = '#8fdc6a'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); shade(c, 0, -R * 0.15, R * 0.95, R * 1.1);
      for (const s of [-1, 1]) {
        const bl = s < 0 ? p.blinkL : p.blinkR, open = Math.max(0.08, 1 - bl * 1.1);
        c.save(); c.translate(s * R * 0.4 + fx, -R * 0.12 + fy); c.rotate(s * 0.45);
        ell(c, 0, 0, R * 0.36, R * 0.2 * open, '#0b0b0b');
        if (open > 0.4) ell(c, -R * 0.1, -R * 0.05, R * 0.07, R * 0.05, '#fff');
        c.restore();
      }
      mouth(c, fx, R * 0.55 + fy, R * 0.24, p.mouth, p.smile, lw, '#2a0f2a');
      break;
    }
    case 'ghost': {
      A.top = -R * 1.08; A.eyeY = -R * 0.15; A.gap = R * 0.35; A.er = R * 0.2;
      const bob = Math.sin(p.t * 2) * R * 0.05;
      c.translate(0, bob);
      c.beginPath(); c.moveTo(-R, R * 1.4); c.lineTo(-R, -R * 0.1); c.arc(0, -R * 0.1, R, Math.PI, 0); c.lineTo(R, R * 1.4);
      for (let i = 0; i < 4; i++) { const x1 = R - (i + 0.5) * R * 0.5, x2 = R - (i + 1) * R * 0.5; c.quadraticCurveTo(x1, R * (1.4 + (i % 2 ? -0.18 : 0.18) * Math.sin(p.t * 3 + i)), x2, R * 1.4); }
      c.closePath(); c.fillStyle = '#f4f6fb'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      for (const s of [-1, 1]) { const bl = s < 0 ? p.blinkL : p.blinkR; ell(c, s * R * 0.35 + fx, -R * 0.15 + fy, R * 0.16, R * 0.24 * Math.max(0.1, 1 - bl), '#141414'); }
      ell(c, fx, R * 0.45 + fy, R * 0.16, R * (0.06 + p.mouth * 0.24), '#141414');
      ell(c, -R * 0.62 + fx, R * 0.2 + fy, R * 0.14, R * 0.07, 'rgba(255,120,140,.35)'); ell(c, R * 0.62 + fx, R * 0.2 + fy, R * 0.14, R * 0.07, 'rgba(255,120,140,.35)');
      break;
    }
    case 'mystery': {
      A.top = -R * 1.55; A.hw = R * 1.1; A.eyeY = -R * 0.08; A.gap = R * 0.3; A.er = R * 0.14;
      c.beginPath(); c.moveTo(-R * 2.1, R * 3); c.quadraticCurveTo(-R * 1.8, R * 0.9, -R * 1.05, R * 0.2); c.quadraticCurveTo(-R * 1.25, -R * 1.5, 0, -R * 1.6);
      c.quadraticCurveTo(R * 1.25, -R * 1.5, R * 1.05, R * 0.2); c.quadraticCurveTo(R * 1.8, R * 0.9, R * 2.1, R * 3); c.closePath();
      const g = c.createLinearGradient(0, -R * 1.6, 0, R * 3); g.addColorStop(0, '#26302f'); g.addColorStop(1, '#0b1012'); c.fillStyle = g; c.fill(); c.lineWidth = lw; c.strokeStyle = '#000'; c.stroke();
      ell(c, 0, R * 0.05, R * 0.82, R * 0.98, '#030405');
      const glow = 1 - Math.max(p.blinkL, p.blinkR) * 0.85;
      c.shadowColor = '#81B64C'; c.shadowBlur = R * 0.4;
      for (const s of [-1, 1]) { c.save(); c.translate(s * R * 0.3 + fx, -R * 0.08 + fy); c.rotate(s * 0.2); ell(c, 0, 0, R * 0.16, R * 0.06 * glow + 0.6, '#b8f07a'); c.restore(); }
      c.shadowBlur = 0;
      if (p.mouth > 0.1) ell(c, fx, R * 0.45 + fy, R * 0.12, R * 0.04 + p.mouth * R * 0.08, 'rgba(129,182,76,.45)');
      break;
    }
    case 'smiley': {
      A.eyeY = -R * 0.22; A.gap = R * 0.33; A.er = R * 0.17;
      shoulders(c, R, '#E8B447', lw, breathe);
      ell(c, 0, 0, R, R, '#ffd23f', INK, lw); shade(c, 0, 0, R, R);
      brows(c, fx, -R * 0.5 + fy, R * 0.33, R * 0.26, brow, '#8a5a00', lw);
      for (const s of [-1, 1]) { const bl = s < 0 ? p.blinkL : p.blinkR; ell(c, s * R * 0.33 + fx, -R * 0.22 + fy, R * 0.11, R * 0.2 * Math.max(0.1, 1 - bl), INK); }
      mouth(c, fx, R * 0.3 + fy, R * 0.9, p.mouth * 0.9, 0.6 + p.smile * 0.4, lw * 1.3);
      break;
    }
    case 'owl': {
      A.top = -R * 0.95; A.eyeY = -R * 0.1; A.gap = R * 0.42; A.er = R * 0.3;
      shoulders(c, R, '#6b4423', lw, breathe);
      for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * R * 0.45, -R * 0.75); c.lineTo(sd * R * 0.85, -R * 1.25); c.lineTo(sd * R * 0.9, -R * 0.55); c.closePath(); c.fillStyle = '#7a4f2a'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); }
      ell(c, 0, 0, R, R * 0.95, '#9a6a3a', INK, lw); shade(c, 0, 0, R, R * 0.95);
      c.save(); c.globalAlpha = 0.35; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { c.beginPath(); c.arc(-R * 0.4 + i * R * 0.16, R * 0.45 + j * R * 0.14, R * 0.06, 0, Math.PI); c.lineWidth = lw * 0.7; c.strokeStyle = '#4a2c1a'; c.stroke(); } c.restore();
      ell(c, -R * 0.42 + fx, -R * 0.1 + fy, R * 0.4, R * 0.4, '#f3e2c0', INK, lw); ell(c, R * 0.42 + fx, -R * 0.1 + fy, R * 0.4, R * 0.4, '#f3e2c0', INK, lw);
      eyes(R * 0.42, -R * 0.1, R * 0.27, '#f2a33a');
      brows(c, fx, -R * 0.55 + fy, R * 0.42, R * 0.4, brow, '#4a2c1a', lw);
      {
        const bo = p.mouth * R * 0.18;
        c.beginPath(); c.moveTo(-R * 0.12 + fx, R * 0.2 + fy); c.lineTo(R * 0.12 + fx, R * 0.2 + fy); c.lineTo(fx, R * 0.42 + fy); c.closePath(); c.fillStyle = '#E8B447'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
        if (bo > 1) { c.beginPath(); c.moveTo(-R * 0.09 + fx, R * 0.3 + fy + bo * 0.3); c.lineTo(R * 0.09 + fx, R * 0.3 + fy + bo * 0.3); c.lineTo(fx, R * 0.42 + fy + bo); c.closePath(); c.fillStyle = '#c98a1a'; c.fill(); c.stroke(); }
      }
      break;
    }
    case 'bear': {
      A.top = -R * 0.92; A.eyeY = -R * 0.18; A.gap = R * 0.36; A.er = R * 0.16;
      shoulders(c, R, '#c0303a', lw, breathe);
      for (const sd of [-1, 1]) { ell(c, sd * R * 0.72, -R * 0.72, R * 0.32, R * 0.32, '#8a5a2b', INK, lw); ell(c, sd * R * 0.72, -R * 0.72, R * 0.17, R * 0.17, '#c98a5a'); }
      ell(c, 0, 0, R, R * 0.92, '#8a5a2b', INK, lw); shade(c, 0, 0, R, R * 0.92);
      ell(c, fx, R * 0.35 + fy, R * 0.45, R * 0.36, '#d9a879', INK, lw * 0.8);
      eyes(R * 0.36, -R * 0.18, R * 0.15, '#2a1a10');
      brows(c, fx, -R * 0.45 + fy, R * 0.36, R * 0.24, brow, '#4a2c1a', lw);
      ell(c, fx, R * 0.18 + fy, R * 0.14, R * 0.1, '#1b1b1b'); ell(c, fx - R * 0.04, R * 0.15 + fy, R * 0.04, R * 0.025, 'rgba(255,255,255,.6)');
      mouth(c, fx, R * 0.45 + fy, R * 0.32, p.mouth, p.smile, lw);
      break;
    }
    case 'dragon': {
      A.top = -R * 1.0; A.eyeY = -R * 0.3; A.gap = R * 0.42; A.er = R * 0.18;
      shoulders(c, R, '#2e6b3a', lw, breathe);
      for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * R * 0.35, -R * 0.8); c.quadraticCurveTo(sd * R * 0.75, -R * 1.5, sd * R * 0.95, -R * 1.55); c.quadraticCurveTo(sd * R * 0.7, -R * 1.1, sd * R * 0.65, -R * 0.62); c.closePath(); c.fillStyle = '#f3ead7'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); }
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * R * 0.2 - R * 0.08, -R * 0.85); c.lineTo(i * R * 0.2, -R * 1.1 - (2 - Math.abs(i)) * R * 0.06); c.lineTo(i * R * 0.2 + R * 0.08, -R * 0.85); c.fillStyle = '#E8B447'; c.fill(); c.stroke(); }
      ell(c, 0, -R * 0.1, R * 0.95, R * 0.85, '#4caf50', INK, lw); shade(c, 0, -R * 0.1, R * 0.95, R * 0.85);
      ell(c, fx, R * 0.42 + fy, R * 0.7, R * 0.42, '#6cc36a', INK, lw);
      ell(c, -R * 0.2 + fx, R * 0.28 + fy, R * 0.06, R * 0.04, '#1b3a1b'); ell(c, R * 0.2 + fx, R * 0.28 + fy, R * 0.06, R * 0.04, '#1b3a1b');
      for (const sd of [-1, 1]) {
        const bl = sd < 0 ? p.blinkL : p.blinkR, op = Math.max(0.1, 1 - bl);
        ell(c, sd * R * 0.42 + fx, -R * 0.3 + fy, R * 0.2, R * 0.2 * op, '#ffd23f', INK, lw);
        ell(c, sd * R * 0.42 + fx + look * R * 0.06, -R * 0.3 + fy, R * 0.05, R * 0.16 * op, '#111');
      }
      brows(c, fx, -R * 0.58 + fy, R * 0.42, R * 0.3, brow - 0.3, '#1b3a1b', lw * 1.1);
      mouth(c, fx, R * 0.6 + fy, R * 0.6, p.mouth, p.smile, lw, '#3a0d0d');
      if (p.mouth > 0.1) for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * R * 0.2 + fx, R * 0.6 + fy); c.lineTo(sd * R * 0.15 + fx, R * 0.72 + fy); c.lineTo(sd * R * 0.1 + fx, R * 0.6 + fy); c.fillStyle = '#fff'; c.fill(); }
      if (p.mouth > 0.55) {
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) { const k = (p.t * 3 + i / 6) % 1; ell(c, fx + Math.sin(i * 2 + p.t * 9) * R * 0.1, R * (0.85 + k * 0.9) + fy, R * (0.15 + k * 0.25), R * (0.12 + k * 0.2), `rgba(255,${Math.round(140 - k * 100)},40,${(0.6 * (1 - k)).toFixed(2)})`); }
        c.restore();
      }
      break;
    }
    case 'frog': {
      A.top = -R * 0.95; A.eyeY = -R * 0.68; A.gap = R * 0.48; A.er = R * 0.2;
      shoulders(c, R, '#E8B447', lw, breathe);
      ell(c, -R * 0.48, -R * 0.62, R * 0.32, R * 0.3, '#5cb85c', INK, lw); ell(c, R * 0.48, -R * 0.62, R * 0.32, R * 0.3, '#5cb85c', INK, lw);
      ell(c, 0, 0, R * 1.08, R * 0.8, '#5cb85c', INK, lw); shade(c, 0, 0, R * 1.08, R * 0.8);
      eyes(R * 0.48, -R * 0.66, R * 0.21, '#3a2a10');
      ell(c, -R * 0.62 + fx, R * 0.15 + fy, R * 0.16, R * 0.09, 'rgba(255,120,140,.4)'); ell(c, R * 0.62 + fx, R * 0.15 + fy, R * 0.16, R * 0.09, 'rgba(255,120,140,.4)');
      ell(c, -R * 0.1 + fx, -R * 0.1 + fy, R * 0.035, R * 0.025, '#1b3a1b'); ell(c, R * 0.1 + fx, -R * 0.1 + fy, R * 0.035, R * 0.025, '#1b3a1b');
      mouth(c, fx, R * 0.18 + fy, R * 1.1, p.mouth * 0.8, 0.6 + p.smile * 0.4, lw);
      break;
    }
    case 'penguin': {
      A.top = -R * 1.0; A.eyeY = -R * 0.2; A.gap = R * 0.3; A.er = R * 0.15;
      shoulders(c, R, '#1d1d1d', lw, breathe);
      ell(c, 0, 0, R, R, '#1d232b', INK, lw); shade(c, 0, 0, R, R);
      c.beginPath(); c.moveTo(fx, -R * 0.38); c.bezierCurveTo(-R * 0.25 + fx, -R * 0.75, -R * 0.95, -R * 0.4, -R * 0.65, R * 0.4); c.quadraticCurveTo(fx, R * 1.0, R * 0.65, R * 0.4);
      c.bezierCurveTo(R * 0.95, -R * 0.4, R * 0.25 + fx, -R * 0.75, fx, -R * 0.38); c.fillStyle = '#f7f7f2'; c.fill();
      eyes(R * 0.3, -R * 0.2, R * 0.15, '#1b1b1b');
      brows(c, fx, -R * 0.44 + fy, R * 0.3, R * 0.2, brow, '#1d232b', lw);
      ell(c, -R * 0.5 + fx, R * 0.15 + fy, R * 0.12, R * 0.07, 'rgba(255,120,140,.35)'); ell(c, R * 0.5 + fx, R * 0.15 + fy, R * 0.12, R * 0.07, 'rgba(255,120,140,.35)');
      {
        const bo = p.mouth * R * 0.16;
        c.beginPath(); c.moveTo(-R * 0.16 + fx, R * 0.06 + fy); c.quadraticCurveTo(fx, -R * 0.02 + fy, R * 0.16 + fx, R * 0.06 + fy); c.lineTo(fx, R * 0.22 + fy); c.closePath(); c.fillStyle = '#ff9a3c'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.moveTo(-R * 0.13 + fx, R * 0.12 + fy + bo * 0.3); c.lineTo(R * 0.13 + fx, R * 0.12 + fy + bo * 0.3); c.lineTo(fx, R * 0.26 + fy + bo); c.closePath(); c.fillStyle = '#e8762b'; c.fill(); c.stroke();
      }
      break;
    }
    case 'astronaut': {
      A.top = -R * 1.12; A.hw = R * 1.1; A.eyeY = -R * 0.12; A.gap = R * 0.3; A.er = R * 0.15;
      shoulders(c, R, '#e9edf2', lw, breathe);
      c.fillStyle = '#c0303a'; c.fillRect(-R * 1.0, R * 1.5 + breathe, R * 0.35, R * 0.18);
      ell(c, 0, 0, R * 1.12, R * 1.1, '#f4f6fb', INK, lw); shade(c, 0, 0, R * 1.12, R * 1.1);
      ell(c, -R * 1.12, 0, R * 0.14, R * 0.28, '#81B64C', INK, lw); ell(c, R * 1.12, 0, R * 0.14, R * 0.28, '#81B64C', INK, lw);
      ell(c, fx * 0.6, R * 0.02 + fy * 0.5, R * 0.82, R * 0.72, '#0b1a2a', INK, lw);
      c.save(); c.beginPath(); c.ellipse(fx * 0.6, R * 0.02 + fy * 0.5, R * 0.82, R * 0.72, 0, 0, Math.PI * 2); c.clip();
      c.globalAlpha = 0.55; eyes(R * 0.28, -R * 0.12, R * 0.14, '#5aa8ff'); mouth(c, fx, R * 0.35 + fy, R * 0.3, p.mouth, p.smile, lw); c.globalAlpha = 1;
      {
        const g2 = c.createLinearGradient(-R * 0.8, -R * 0.7, R * 0.4, R * 0.4); g2.addColorStop(0, 'rgba(255,255,255,.55)'); g2.addColorStop(0.35, 'rgba(255,255,255,.05)'); g2.addColorStop(1, 'rgba(129,182,76,.15)');
        c.fillStyle = g2; c.fillRect(-R, -R, R * 2, R * 2);
      }
      c.restore();
      break;
    }
    case 'ninja': {
      A.eyeY = -R * 0.12; A.gap = R * 0.34; A.er = R * 0.17;
      shoulders(c, R, '#1d1d1d', lw, breathe);
      for (const k of [0, 1]) { c.beginPath(); c.moveTo(R * 0.85, -R * 0.4); c.quadraticCurveTo(R * 1.4, -R * 0.5 + k * R * 0.3 + Math.sin(p.t * 6 + k) * R * 0.1, R * 1.8, -R * 0.2 + k * R * 0.45 + Math.sin(p.t * 5 + k) * R * 0.15); c.lineWidth = R * 0.12; c.strokeStyle = '#c0303a'; c.stroke(); }
      ell(c, 0, 0, R * 0.95, R, '#232830', INK, lw); shade(c, 0, 0, R * 0.95, R);
      rrect(c, -R * 0.92, -R * 0.55, R * 1.84, R * 0.2, R * 0.05); c.fillStyle = '#c0303a'; c.fill();
      rrect(c, -R * 0.75 + fx, -R * 0.32 + fy, R * 1.5, R * 0.42, R * 0.2); c.fillStyle = '#e0a986'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      eyes(R * 0.34, -R * 0.12, R * 0.16, '#2a1a10');
      brows(c, fx, -R * 0.3 + fy, R * 0.34, R * 0.22, brow - 0.4, '#141414', lw);
      if (p.mouth > 0.1) { c.save(); c.globalAlpha = 0.5; ell(c, fx, R * 0.45 + fy, R * 0.18, R * 0.04 + p.mouth * R * 0.08, '#111'); c.restore(); }
      break;
    }
    case 'skeleton': {
      A.eyeY = -R * 0.18; A.gap = R * 0.36; A.er = R * 0.2;
      shoulders(c, R, '#1d1d1d', lw, breathe);
      c.save(); c.strokeStyle = '#e9e9e2'; c.lineWidth = R * 0.08; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-R * 0.7, R * 1.55 + i * R * 0.28 + breathe); c.quadraticCurveTo(0, R * 1.35 + i * R * 0.28 + breathe, R * 0.7, R * 1.55 + i * R * 0.28 + breathe); c.stroke(); } c.restore();
      {
        const jaw = p.mouth * R * 0.3;
        rrect(c, -R * 0.5 + fx * 0.5, R * 0.35 + jaw, R * 1.0, R * 0.42, R * 0.18); c.fillStyle = '#ecebe2'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
        ell(c, 0, -R * 0.15, R * 0.92, R * 0.85, '#f4f3ea', INK, lw); shade(c, 0, -R * 0.15, R * 0.92, R * 0.85);
        for (const sd of [-1, 1]) {
          const bl = sd < 0 ? p.blinkL : p.blinkR;
          ell(c, sd * R * 0.36 + fx, -R * 0.18 + fy, R * 0.24, R * 0.26 * Math.max(0.25, 1 - bl * 0.75), '#141414');
          c.save(); c.shadowColor = '#81B64C'; c.shadowBlur = R * 0.2; ell(c, sd * R * 0.36 + fx + look * R * 0.07, -R * 0.15 + fy + lookY * R * 0.05, R * 0.06, R * 0.06, '#b8f07a'); c.restore();
        }
        c.beginPath(); c.moveTo(fx, R * 0.08 + fy); c.lineTo(-R * 0.08 + fx, R * 0.25 + fy); c.lineTo(R * 0.08 + fx, R * 0.25 + fy); c.closePath(); c.fillStyle = '#141414'; c.fill();
        for (let i = -3; i <= 3; i++) {
          c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = lw * 0.5;
          rrect(c, i * R * 0.11 - R * 0.05 + fx * 0.5, R * 0.36, R * 0.1, R * 0.14, R * 0.03); c.fill(); c.stroke();
          rrect(c, i * R * 0.11 - R * 0.05 + fx * 0.5, R * 0.38 + jaw, R * 0.1, R * 0.13, R * 0.03); c.fill(); c.stroke();
        }
      }
      break;
    }
    case 'vampire': {
      A.top = -R * 1.05; A.eyeY = -R * 0.12; A.gap = R * 0.34; A.er = R * 0.16;
      c.beginPath(); c.moveTo(-R * 2.0, R * 2.9); c.lineTo(-R * 1.4, R * 0.4); c.lineTo(-R * 0.5, R * 1.0); c.lineTo(R * 0.5, R * 1.0); c.lineTo(R * 1.4, R * 0.4); c.lineTo(R * 2.0, R * 2.9); c.closePath();
      c.fillStyle = '#7a1f27'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      shoulders(c, R * 0.8, '#141414', lw, breathe);
      ell(c, 0, 0, R * 0.88, R * 1.02, '#e6ecef', INK, lw); shade(c, 0, 0, R * 0.88, R * 1.02);
      c.beginPath(); c.moveTo(-R * 0.92, R * 0.0); c.quadraticCurveTo(-R * 1.0, -R * 1.15, 0, -R * 1.1); c.quadraticCurveTo(R * 1.0, -R * 1.15, R * 0.92, R * 0.0);
      c.quadraticCurveTo(R * 0.7, -R * 0.65, R * 0.25, -R * 0.65); c.lineTo(0, -R * 0.4); c.lineTo(-R * 0.25, -R * 0.65); c.quadraticCurveTo(-R * 0.7, -R * 0.65, -R * 0.92, R * 0.0); c.fillStyle = '#141414'; c.fill();
      brows(c, fx, -R * 0.38 + fy, R * 0.34, R * 0.24, brow - 0.5, '#141414', lw * 1.1);
      eyes(R * 0.34, -R * 0.12, R * 0.15, '#c0303a');
      mouth(c, fx, R * 0.48 + fy, R * 0.4, p.mouth, p.smile, lw, '#3a0d0d');
      for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * R * 0.12 + fx, R * 0.5 + fy); c.lineTo(sd * R * 0.08 + fx, R * 0.66 + fy); c.lineTo(sd * R * 0.04 + fx, R * 0.5 + fy); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.lineWidth = lw * 0.5; c.strokeStyle = INK; c.stroke(); }
      break;
    }
    default: {
      // Illustrated people (presets, or the streamer's own design)
      const L = id === 'me' ? (lookOpts.person ?? DEFAULT_PERSON) : (PEOPLE[id] ?? DEFAULT_PERSON);
      A.top = L.hair === 'afro' ? -R * 1.25 : L.hair === 'bun' ? -R * 1.3 : L.hair === 'spiky' ? -R * 1.32 : L.hair === 'mohawk' ? -R * 1.25 : -R * 1.08;
      A.eyeY = -R * 0.12; A.gap = R * 0.34; A.er = R * 0.15;
      if (lookOpts.style === 'real') drawRealPerson(c, R, L, { fx, fy, lw, brow, breathe, look, lookY, blinkL: p.blinkL, blinkR: p.blinkR, mouthOpen: p.mouth, smile: p.smile, t: p.t });
      else drawPerson(c, R, L, { fx, fy, lw, brow, breathe, eyes, mouthOpen: p.mouth, smile: p.smile, t: p.t });
    }
  }
  finish();
  c.restore();
}
