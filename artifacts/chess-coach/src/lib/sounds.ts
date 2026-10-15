// Gameplay sound packs, synthesized with Web Audio (no audio files to download or
// cache). Each pack voices the same set of events; "classic" is the original
// sine beep so existing users hear exactly what they had before.

import { Chess, type Move } from 'chess.js';

export type SoundPack = 'classic' | 'wood' | 'marble' | 'soft' | 'arcade'
  // natural: modelled pieces on real materials (see "Natural packs" below)
  | 'staunton' | 'club' | 'stone' | 'glass' | 'blitz';
export type SoundEvent = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'gameEnd' | 'illegal';

export type SoundGroup = 'natural' | 'electronic';
export const SOUND_GROUPS: { id: SoundGroup; label: string; blurb: string }[] = [
  { id: 'natural', label: 'Natural', blurb: 'Real pieces on real boards: felt-bottomed wood, plastic, stone and glass, in a quiet room.' },
  { id: 'electronic', label: 'Electronic', blurb: 'Simple tones and effects.' },
];
export const SOUND_PACKS: Record<SoundPack, { label: string; blurb: string; group: SoundGroup }> = {
  staunton: { label: 'Tournament Wood', blurb: 'Weighted Staunton pieces, felt bases, wooden board', group: 'natural' },
  club: { label: 'Club Set', blurb: 'Plastic pieces on a roll-up board, club-night clack', group: 'natural' },
  stone: { label: 'Marble & Stone', blurb: 'Heavy stone pieces on a marble board', group: 'natural' },
  glass: { label: 'Glass', blurb: 'Glass pieces on a glass board, a bright little ring', group: 'natural' },
  blitz: { label: 'Blitz Clock', blurb: 'Wooden pieces, and you hit the clock after every move', group: 'natural' },
  classic: { label: 'Classic', blurb: 'The original simple tone', group: 'electronic' },
  wood: { label: 'Wood Tone', blurb: 'A simple wooden tap', group: 'electronic' },
  marble: { label: 'Marble Tone', blurb: 'Simple crisp clicks', group: 'electronic' },
  soft: { label: 'Soft', blurb: 'Quiet, muted taps', group: 'electronic' },
  arcade: { label: 'Arcade', blurb: 'Playful 8-bit blips', group: 'electronic' },
};

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 0.25);
  const b = ac.createBuffer(1, len, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

/** Filtered noise burst: the "click" of a piece landing. */
function click(ac: AudioContext, t: number, freq: number, q: number, decay: number, vol: number) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(bp); bp.connect(g); g.connect(ac.destination);
  src.start(t); src.stop(t + decay + 0.02);
}

/** Short pitched body under the click (board resonance / tone). */
function tone(ac: AudioContext, t: number, freq: number, decay: number, vol: number, type: OscillatorType = 'sine', glideTo?: number) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + decay);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + decay + 0.02);
}

type Voice = (ac: AudioContext, t: number) => void;

// ── Natural packs ──────────────────────────────────────────────────────────
// Modal synthesis: a piece hitting a board is a very short excitation (how
// hard / how soft the contact is) ringing a handful of resonant modes of the
// piece and the board (each with its own pitch and decay), plus the low
// "thump" of the table, played into a small room. Every hit varies a little
// in force and pitch, the way real moves do.
interface Material {
  modes: [number, number, number][];        // [Hz, decay seconds, gain]
  thump: [number, number, number];          // low body: [Hz, decay, gain]
  hardness: number;                         // lowpass on the contact noise (Hz): felt is soft, glass is hard
  contact: number;                          // contact noise length (s)
  contactGain: number;
  room: number;                             // reverb send 0..1
  roomSize: number;                         // seconds
}
const MATERIALS: Record<'staunton' | 'club' | 'stone' | 'glass', Material> = {
  staunton: { modes: [[610, 0.055, 0.5], [1240, 0.04, 0.3], [2050, 0.028, 0.16], [3150, 0.018, 0.07]], thump: [150, 0.07, 0.55], hardness: 2600, contact: 0.012, contactGain: 0.32, room: 0.16, roomSize: 0.45 },
  club: { modes: [[1450, 0.03, 0.42], [2650, 0.022, 0.28], [3900, 0.016, 0.16], [5400, 0.01, 0.07]], thump: [118, 0.05, 0.32], hardness: 5200, contact: 0.008, contactGain: 0.42, room: 0.1, roomSize: 0.35 },
  stone: { modes: [[1850, 0.09, 0.32], [3020, 0.07, 0.24], [4480, 0.055, 0.15], [6900, 0.035, 0.07]], thump: [210, 0.06, 0.4], hardness: 7000, contact: 0.006, contactGain: 0.4, room: 0.24, roomSize: 0.8 },
  glass: { modes: [[2780, 0.26, 0.22], [4630, 0.19, 0.15], [6870, 0.13, 0.09], [8950, 0.08, 0.05]], thump: [240, 0.04, 0.22], hardness: 9000, contact: 0.004, contactGain: 0.3, room: 0.26, roomSize: 0.9 },
};

const buses = new Map<string, { dry: GainNode; wet: GainNode }>();
function bus(ac: AudioContext, roomSize: number, room: number): { dry: GainNode; wet: GainNode } {
  const key = `${roomSize}:${room}`;
  const hit = buses.get(key);
  if (hit && hit.dry.context === ac) return hit;
  const dry = ac.createGain(); dry.gain.value = 1; dry.connect(ac.destination);
  const wet = ac.createGain(); wet.gain.value = room;
  const conv = ac.createConvolver();
  // Small room: decaying stereo noise with a soft high cut.
  const len = Math.floor(ac.sampleRate * roomSize);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      lp += (x - lp) * 0.35;
      d[i] = lp;
    }
  }
  conv.buffer = ir;
  wet.connect(conv); conv.connect(ac.destination);
  const b = { dry, wet };
  buses.set(key, b);
  return b;
}

function route(ac: AudioContext, node: AudioNode, m: { room: number; roomSize: number }) {
  const b = bus(ac, m.roomSize, m.room);
  node.connect(b.dry); node.connect(b.wet);
}

function mode(ac: AudioContext, t: number, freq: number, decay: number, vol: number, dest: AudioNode) {
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.985, t + decay); // tiny pitch sag as it rings out
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + decay + 0.03);
}

/** One piece landing. force ~0.4 (gentle) .. 1.2 (firm). */
function impact(ac: AudioContext, t: number, m: Material, force = 1, pitch = 1) {
  const f = force * (0.88 + Math.random() * 0.24);
  const p = pitch * (0.97 + Math.random() * 0.06);
  const out = ac.createGain();
  out.gain.value = 0.55;
  route(ac, out, m);
  // contact noise: the hardness of the collision
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = m.hardness * (0.75 + 0.35 * f); lp.Q.value = 0.7;
  const cg = ac.createGain();
  cg.gain.setValueAtTime(0.0001, t);
  cg.gain.exponentialRampToValueAtTime(m.contactGain * f, t + 0.0008);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + m.contact);
  src.connect(lp); lp.connect(cg); cg.connect(out);
  src.start(t); src.stop(t + m.contact + 0.02);
  // resonant modes of piece + board; harder hits bring out the upper modes
  m.modes.forEach(([hz, decay, gain], i) => {
    const bright = i === 0 ? 1 : Math.pow(f, 1 + i * 0.4);
    mode(ac, t, hz * p * (1 + (Math.random() - 0.5) * 0.012), decay * (0.9 + f * 0.15), gain * f * bright * 0.5, out);
  });
  // table / board body
  const [th, td, tg] = m.thump;
  mode(ac, t, th * p, td, tg * f * 0.6, out);
}

/** A piece sliding a short way across the board (castling). */
function slide(ac: AudioContext, t: number, m: Material, dur = 0.09, vol = 0.1) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(Math.min(m.hardness * 0.35, 2400), t);
  bp.frequency.linearRampToValueAtTime(Math.min(m.hardness * 0.5, 3200), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g);
  route(ac, g, m);
  src.start(t); src.stop(t + dur + 0.02);
}

/** Pressing a mechanical chess clock: plastic button click + the lever clunk. */
function clockPress(ac: AudioContext, t: number, vol = 1) {
  const m = { room: 0.12, roomSize: 0.4 };
  const out = ac.createGain(); out.gain.value = 0.5 * vol; route(ac, out, m);
  const src = ac.createBufferSource(); src.buffer = noise(ac);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 1.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.0006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
  src.connect(bp); bp.connect(g); g.connect(out); src.start(t); src.stop(t + 0.03);
  mode(ac, t + 0.004, 860 * (0.98 + Math.random() * 0.04), 0.035, 0.32, out);
  mode(ac, t + 0.004, 1720, 0.02, 0.12, out);
  mode(ac, t + 0.006, 95, 0.05, 0.3, out);
}

function naturalPack(m: Material, clockEveryMove = false): Record<SoundEvent, Voice> {
  const withClock = (v: Voice): Voice => clockEveryMove ? (ac, t) => { v(ac, t); clockPress(ac, t + 0.16 + Math.random() * 0.05, 0.9); } : v;
  return {
    move: withClock((ac, t) => impact(ac, t, m, 0.85)),
    // the captured piece is knocked aside, then yours lands
    capture: withClock((ac, t) => { impact(ac, t, m, 0.5, 1.07); impact(ac, t + 0.075, m, 1.05); }),
    // a firmer placement
    check: withClock((ac, t) => impact(ac, t, m, 1.25, 0.98)),
    // king, slide, rook
    castle: withClock((ac, t) => { impact(ac, t, m, 0.85); slide(ac, t + 0.1, m); impact(ac, t + 0.2, m, 0.7, 1.05); }),
    // pawn lifted (light tick), new piece put down
    promote: withClock((ac, t) => { impact(ac, t, m, 0.4, 1.12); impact(ac, t + 0.15, m, 1.1, 0.95); }),
    // the clock is stopped
    gameEnd: (ac, t) => { impact(ac, t, m, 1); clockPress(ac, t + 0.22, 1.1); },
    // piece put back where it was, gently
    illegal: (ac, t) => impact(ac, t, m, 0.35, 0.9),
  };
}

const PACKS: Record<SoundPack, Record<SoundEvent, Voice>> = {
  staunton: naturalPack(MATERIALS.staunton),
  club: naturalPack(MATERIALS.club),
  stone: naturalPack(MATERIALS.stone),
  glass: naturalPack(MATERIALS.glass),
  blitz: naturalPack(MATERIALS.staunton, true),
  classic: {
    move: (ac, t) => tone(ac, t, 440, 0.12, 0.15),
    capture: (ac, t) => tone(ac, t, 220, 0.12, 0.15),
    check: (ac, t) => { tone(ac, t, 440, 0.1, 0.13); tone(ac, t + 0.09, 660, 0.14, 0.13); },
    castle: (ac, t) => { tone(ac, t, 440, 0.1, 0.14); tone(ac, t + 0.08, 440, 0.1, 0.12); },
    promote: (ac, t) => { tone(ac, t, 523, 0.1, 0.13); tone(ac, t + 0.08, 784, 0.16, 0.13); },
    gameEnd: (ac, t) => { tone(ac, t, 523, 0.18, 0.13); tone(ac, t + 0.14, 659, 0.18, 0.13); tone(ac, t + 0.28, 784, 0.3, 0.13); },
    illegal: (ac, t) => tone(ac, t, 160, 0.14, 0.12, 'triangle'),
  },
  wood: {
    move: (ac, t) => { click(ac, t, 1700, 1.4, 0.06, 0.55); tone(ac, t, 190, 0.07, 0.22, 'sine', 140); },
    capture: (ac, t) => { click(ac, t, 1300, 1.1, 0.09, 0.7); tone(ac, t, 150, 0.1, 0.3, 'sine', 100); click(ac, t + 0.035, 2200, 2, 0.05, 0.25); },
    check: (ac, t) => { click(ac, t, 1700, 1.4, 0.06, 0.5); tone(ac, t + 0.04, 880, 0.18, 0.08, 'triangle'); },
    castle: (ac, t) => { click(ac, t, 1700, 1.4, 0.06, 0.5); tone(ac, t, 190, 0.07, 0.2); click(ac, t + 0.11, 1500, 1.4, 0.06, 0.45); tone(ac, t + 0.11, 170, 0.07, 0.18); },
    promote: (ac, t) => { click(ac, t, 1700, 1.4, 0.06, 0.5); tone(ac, t + 0.05, 660, 0.14, 0.08, 'triangle'); tone(ac, t + 0.15, 990, 0.2, 0.08, 'triangle'); },
    gameEnd: (ac, t) => { tone(ac, t, 392, 0.35, 0.09, 'triangle'); tone(ac, t + 0.12, 523, 0.35, 0.09, 'triangle'); tone(ac, t + 0.24, 659, 0.5, 0.09, 'triangle'); },
    illegal: (ac, t) => { click(ac, t, 500, 1, 0.08, 0.35); tone(ac, t, 110, 0.12, 0.15, 'sine'); },
  },
  marble: {
    move: (ac, t) => { click(ac, t, 3600, 3, 0.045, 0.45); tone(ac, t, 1250, 0.05, 0.05, 'sine'); },
    capture: (ac, t) => { click(ac, t, 3000, 2.5, 0.06, 0.6); click(ac, t + 0.028, 4200, 3, 0.05, 0.35); tone(ac, t, 900, 0.07, 0.07); },
    check: (ac, t) => { click(ac, t, 3600, 3, 0.045, 0.4); tone(ac, t + 0.03, 1568, 0.25, 0.06); },
    castle: (ac, t) => { click(ac, t, 3600, 3, 0.045, 0.42); click(ac, t + 0.1, 3300, 3, 0.045, 0.4); },
    promote: (ac, t) => { click(ac, t, 3600, 3, 0.045, 0.4); tone(ac, t + 0.04, 1319, 0.2, 0.06); tone(ac, t + 0.13, 1976, 0.3, 0.06); },
    gameEnd: (ac, t) => { tone(ac, t, 1047, 0.5, 0.06); tone(ac, t + 0.1, 1319, 0.5, 0.06); tone(ac, t + 0.2, 1568, 0.7, 0.06); },
    illegal: (ac, t) => { click(ac, t, 900, 1.5, 0.07, 0.3); tone(ac, t, 300, 0.1, 0.06, 'triangle'); },
  },
  soft: {
    move: (ac, t) => { click(ac, t, 800, 0.9, 0.05, 0.22); tone(ac, t, 260, 0.06, 0.06); },
    capture: (ac, t) => { click(ac, t, 650, 0.8, 0.07, 0.3); tone(ac, t, 200, 0.08, 0.08); },
    check: (ac, t) => { click(ac, t, 800, 0.9, 0.05, 0.2); tone(ac, t + 0.03, 523, 0.18, 0.05); },
    castle: (ac, t) => { click(ac, t, 800, 0.9, 0.05, 0.2); click(ac, t + 0.1, 760, 0.9, 0.05, 0.2); },
    promote: (ac, t) => { click(ac, t, 800, 0.9, 0.05, 0.2); tone(ac, t + 0.04, 587, 0.18, 0.05); tone(ac, t + 0.13, 784, 0.22, 0.05); },
    gameEnd: (ac, t) => { tone(ac, t, 392, 0.4, 0.06); tone(ac, t + 0.15, 494, 0.4, 0.06); tone(ac, t + 0.3, 587, 0.55, 0.06); },
    illegal: (ac, t) => tone(ac, t, 150, 0.12, 0.07),
  },
  arcade: {
    move: (ac, t) => tone(ac, t, 660, 0.06, 0.07, 'square', 880),
    capture: (ac, t) => { tone(ac, t, 330, 0.09, 0.08, 'square', 165); click(ac, t, 2000, 0.7, 0.05, 0.2); },
    check: (ac, t) => { tone(ac, t, 880, 0.07, 0.07, 'square'); tone(ac, t + 0.08, 1175, 0.1, 0.07, 'square'); },
    castle: (ac, t) => { tone(ac, t, 523, 0.06, 0.07, 'square'); tone(ac, t + 0.07, 784, 0.07, 0.07, 'square'); },
    promote: (ac, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(ac, t + i * 0.06, f, 0.08, 0.07, 'square')); },
    gameEnd: (ac, t) => { [784, 659, 784, 1047].forEach((f, i) => tone(ac, t + i * 0.11, f, 0.14, 0.07, 'square')); },
    illegal: (ac, t) => tone(ac, t, 220, 0.12, 0.07, 'square', 110),
  },
};

export function playSound(event: SoundEvent, pack: SoundPack = 'classic') {
  const ac = audio();
  if (!ac) return;
  try { (PACKS[pack] ?? PACKS.classic)[event](ac, ac.currentTime + 0.005); } catch {}
}

/** Which event a played move should sound like (most important wins). */
export function eventForMove(move: Move, after?: Chess): SoundEvent {
  if (after?.isGameOver()) return 'gameEnd';
  if (after?.inCheck() || /[+#]$/.test(move.san)) return 'check';
  if (move.promotion) return 'promote';
  if (move.flags.includes('k') || move.flags.includes('q')) return 'castle';
  if (move.captured) return 'capture';
  return 'move';
}

const placement = (fen: string) => fen.split(' ')[0];

/**
 * If `nextFen` is exactly one legal move after `prevFen`, return that move and the
 * resulting position -- used to voice moves the board receives from outside
 * (bot/opponent replies, stepping through a game) without sounding on jumps.
 */
export function detectSingleMove(prevFen: string, nextFen: string): { move: Move; after: Chess } | null {
  if (!prevFen || !nextFen || placement(prevFen) === placement(nextFen)) return null;
  try {
    const c = new Chess(prevFen);
    const target = placement(nextFen);
    for (const m of c.moves({ verbose: true })) {
      c.move(m);
      if (placement(c.fen()) === target) {
        const after = new Chess(c.fen());
        return { move: m, after };
      }
      c.undo();
    }
  } catch {}
  return null;
}
