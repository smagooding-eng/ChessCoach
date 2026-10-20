// Chess for Kids -- progress, settings and little sound effects.
//
// While the kids section is an admin preview, progress lives in this
// browser (localStorage). Nothing personal is stored: no names, just which
// buddy was picked and how many stars each level earned.

import { useCallback, useEffect, useState } from 'react';
import { WORLDS, type World } from './levels';

export interface KidsState {
  avatar: string | null;
  stars: Record<string, number>;   // level id -> 1..3
  sound: boolean;
  voice: boolean;
  unlockAll: boolean;
}

const KEY = 'cs_kids_v1';
const DEFAULT: KidsState = { avatar: null, stars: {}, sound: true, voice: true, unlockAll: false };
const listeners = new Set<() => void>();

function read(): KidsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { /* private mode etc. */ }
  return { ...DEFAULT };
}

let current: KidsState = typeof window === 'undefined' ? { ...DEFAULT } : read();

function write(next: KidsState) {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useKids() {
  const [state, setState] = useState(current);
  useEffect(() => {
    const l = () => setState(current);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const update = useCallback((patch: Partial<KidsState>) => write({ ...current, ...patch }), []);
  const award = useCallback((levelId: string, stars: number) => {
    const prev = current.stars[levelId] ?? 0;
    if (stars > prev) write({ ...current, stars: { ...current.stars, [levelId]: stars } });
  }, []);
  const reset = useCallback(() => write({ ...DEFAULT, avatar: current.avatar }), []);
  return { state, update, award, reset };
}

export function totalStars(s: KidsState) {
  return Object.values(s.stars).reduce((a, b) => a + b, 0);
}
export function worldDone(s: KidsState, w: World) {
  return w.levels.every((l) => (s.stars[l.id] ?? 0) > 0);
}
export function worldStars(s: KidsState, w: World) {
  return w.levels.reduce((a, l) => a + (s.stars[l.id] ?? 0), 0);
}
export function worldUnlocked(s: KidsState, index: number) {
  return s.unlockAll || index === 0 || worldDone(s, WORLDS[index - 1]);
}
export function levelUnlocked(s: KidsState, w: World, index: number) {
  return s.unlockAll || index === 0 || (s.stars[w.levels[index - 1].id] ?? 0) > 0;
}
export function starsFor(mistakes: number) {
  return mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
}

// ------------------------------------------------------------- sound

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export type Sfx = 'tap' | 'move' | 'pop' | 'oops' | 'win' | 'check';

export function playSfx(kind: Sfx) {
  if (!current.sound) return;
  switch (kind) {
    case 'tap': tone(520, 0, 0.08, 'triangle', 0.08); break;
    case 'move': tone(330, 0, 0.12, 'triangle', 0.14, 440); break;
    case 'pop': tone(660, 0, 0.1, 'sine', 0.2, 990); tone(1320, 0.07, 0.12, 'sine', 0.1); break;
    case 'oops': tone(300, 0, 0.18, 'sine', 0.14, 200); break;
    case 'check': tone(880, 0, 0.12, 'square', 0.06); tone(660, 0.12, 0.16, 'square', 0.06); break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle', 0.16));
      tone(1319, 0.48, 0.4, 'sine', 0.12);
      break;
  }
}

// ------------------------------------------------------------- voice

export function speak(text: string, force = false) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!force && !current.voice) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.pitch = 1.15;
    u.lang = 'en-US';
    const voices = window.speechSynthesis.getVoices();
    const nice = voices.find((v) => /en[-_]/i.test(v.lang) && /(female|samantha|google us english|aria|jenny|zira)/i.test(v.name))
      ?? voices.find((v) => /^en/i.test(v.lang));
    if (nice) u.voice = nice;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
