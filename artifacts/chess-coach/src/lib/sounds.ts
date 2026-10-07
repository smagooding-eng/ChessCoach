// Gameplay sound packs, synthesized with Web Audio (no audio files to download or
// cache). Each pack voices the same set of events; "classic" is the original
// sine beep so existing users hear exactly what they had before.

import { Chess, type Move } from 'chess.js';

export type SoundPack = 'classic' | 'wood' | 'marble' | 'soft' | 'arcade';
export type SoundEvent = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'gameEnd' | 'illegal';

export const SOUND_PACKS: Record<SoundPack, { label: string; blurb: string }> = {
  classic: { label: 'Classic', blurb: 'The original simple tone' },
  wood: { label: 'Wooden', blurb: 'Weighted pieces on a wood board' },
  marble: { label: 'Marble', blurb: 'Crisp stone-on-stone clicks' },
  soft: { label: 'Soft', blurb: 'Quiet, muted taps' },
  arcade: { label: 'Arcade', blurb: 'Playful 8-bit blips' },
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

const PACKS: Record<SoundPack, Record<SoundEvent, Voice>> = {
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
