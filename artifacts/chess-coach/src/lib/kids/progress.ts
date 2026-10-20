// Chess for Kids -- progress, settings and little sound effects.
//
// While the kids section is an admin preview, progress lives in this
// browser (localStorage). Nothing personal is stored: no names, just which
// buddy was picked and how many stars each level earned.

import { useCallback, useEffect, useState } from 'react';
import { WORLDS, type World } from './levels';
import { apiFetch } from '@/lib/api';

export interface KidsState {
  avatar: string | null;
  stars: Record<string, number>;   // level id -> 1..3
  sound: boolean;
  voice: boolean;
  unlockAll: boolean;
  /** Games won against Benny the Bear (the free-play game). */
  bennyWins?: number;
}

const KEY = 'cs_kids_v1';
const DEFAULT: KidsState = { avatar: null, stars: {}, sound: true, voice: true, unlockAll: false };
const listeners = new Set<() => void>();
const maxMap = (a: Record<string, number> | undefined, b: Record<string, number> | undefined) => {
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};

// Progress is kept per account: signed in, it lives under a key for that
// account (and on the server, see lib/learnSync.ts); signed out, under the
// device key. So two accounts on one device never see each other's progress.
let scope: string | null = null;
const storageKey = () => (scope ? `${KEY}:${scope}` : KEY);
const changeHooks = new Set<() => void>();

function read(): KidsState {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { /* private mode etc. */ }
  return { ...DEFAULT };
}

let current: KidsState = typeof window === 'undefined' ? { ...DEFAULT } : read();

function write(next: KidsState, quiet = false) {
  current = next;
  try { localStorage.setItem(storageKey(), JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
  if (!quiet) changeHooks.forEach((h) => h());
}

/** Switch to another account's progress (null = signed out, this device). */
export function scopeKids(id: string | null) {
  if (id === scope) return;
  scope = id;
  current = read();
  listeners.forEach((l) => l());
}
/** Fold in what the server has for this account (best stars win). */
export function mergeKids(remote: Partial<KidsState> | null | undefined) {
  if (!remote || typeof remote !== 'object') return;
  write({ ...DEFAULT, ...current, ...remote, avatar: remote.avatar ?? current.avatar ?? null, stars: maxMap(remote.stars, current.stars), bennyWins: Math.max(remote.bennyWins ?? 0, current.bennyWins ?? 0) }, true);
}
export function kidsSnapshot() { return current; }
export function onKidsChange(h: () => void) { changeHooks.add(h); return () => { changeHooks.delete(h); }; }

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
  playSfxAlways(kind);
}

/** The same effects without the kids sound setting (other sections gate them themselves). */
export function playSfxAlways(kind: Sfx) {
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
//
// A real, natural voice: the app's speech service, asked to read like a kind
// teacher talking to a young child. Clips are cached, so a line heard once
// plays instantly after. If the service can't be reached, the device's own
// voice is used (the most natural one it has).
//
// Tapping the same thing again never restarts the sentence: a line that is
// already playing just keeps playing.

const KID_VOICE = 'coral';
const clips = new Map<string, Promise<string>>();
let player: HTMLAudioElement | null = null;
let nowText = '';
let gen = 0;

function clip(text: string): Promise<string> {
  const hit = clips.get(text);
  if (hit) return hit;
  const p = apiFetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: KID_VOICE, style: 'kids' }),
  }).then(async (res) => {
    if (!res.ok) throw new Error('tts');
    return URL.createObjectURL(await res.blob());
  });
  clips.set(text, p);
  p.catch(() => clips.delete(text));
  if (clips.size > 80) { const k = clips.keys().next().value as string; clips.get(k)?.then((u) => URL.revokeObjectURL(u)).catch(() => {}); clips.delete(k); }
  return p;
}

function deviceVoice(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.05;
    u.lang = 'en-US';
    const voices = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    const rank = (v: SpeechSynthesisVoice) =>
      (/natural|neural|enhanced|premium/i.test(v.name) ? 4 : 0)
      + (/google us english|samantha|ava|aria|jenny|allison|zoe/i.test(v.name) ? 2 : 0)
      + (/en[-_]us/i.test(v.lang) ? 1 : 0);
    const best = voices.sort((a, b) => rank(b) - rank(a))[0];
    if (best) u.voice = best;
    u.onend = () => { if (nowText === text) nowText = ''; };
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

function isPlaying() {
  return (player && !player.paused && !player.ended) || (typeof window !== 'undefined' && window.speechSynthesis?.speaking);
}

export function speak(text: string, force = false) {
  if (typeof window === 'undefined') return;
  if (!force && !current.voice) return;
  if (text === nowText && isPlaying()) return; // same line, already talking: let it finish
  stopSpeaking();
  nowText = text;
  const my = ++gen;
  clip(text).then((url) => {
    if (my !== gen) return;
    player = new Audio(url);
    player.onended = () => { if (my === gen) nowText = ''; };
    return player.play();
  }).catch(() => { if (my === gen) deviceVoice(text); });
}

export function stopSpeaking() {
  gen++;
  nowText = '';
  try { player?.pause(); } catch { /* ignore */ }
  player = null;
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
