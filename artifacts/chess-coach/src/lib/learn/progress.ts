// Beginner path -- progress and settings, kept on this device while the
// section is an admin preview.

import { useCallback, useEffect, useState } from 'react';
import { UNITS, type Unit, type Lesson } from './beginner';

export interface LearnState {
  /** lesson id -> best stars (1..3) */
  lessons: Record<string, number>;
  sound: boolean;
  unlockAll: boolean;
}

const KEY = 'cs_beginner_v1';
const DEFAULT: LearnState = { lessons: {}, sound: true, unlockAll: false };
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

function read(): LearnState {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { /* private mode etc. */ }
  return { ...DEFAULT };
}

let current: LearnState = typeof window === 'undefined' ? { ...DEFAULT } : read();

function write(next: LearnState, quiet = false) {
  current = next;
  try { localStorage.setItem(storageKey(), JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
  if (!quiet) changeHooks.forEach((h) => h());
}

/** Switch to another account's progress (null = signed out, this device). */
export function scopeLearn(id: string | null) {
  if (id === scope) return;
  scope = id;
  current = read();
  listeners.forEach((l) => l());
}
/** Fold in what the server has for this account (best stars win). */
export function mergeLearn(remote: Partial<LearnState> | null | undefined) {
  if (!remote || typeof remote !== 'object') return;
  write({ ...DEFAULT, ...current, ...remote, lessons: maxMap(remote.lessons, current.lessons) }, true);
}
export function learnSnapshot() { return current; }
export function onLearnChange(h: () => void) { changeHooks.add(h); return () => { changeHooks.delete(h); }; }

export function learnState() { return current; }

export function useLearn() {
  const [state, setState] = useState(current);
  useEffect(() => {
    const l = () => setState(current);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const update = useCallback((patch: Partial<LearnState>) => write({ ...current, ...patch }), []);
  const award = useCallback((lessonId: string, stars: number) => {
    if (stars > (current.lessons[lessonId] ?? 0)) write({ ...current, lessons: { ...current.lessons, [lessonId]: stars } });
  }, []);
  const reset = useCallback(() => write({ ...DEFAULT, sound: current.sound }), []);
  return { state, update, award, reset };
}

const flat: { unit: Unit; lesson: Lesson }[] = UNITS.flatMap((u) => u.lessons.map((lesson) => ({ unit: u, lesson })));

export function lessonUnlocked(s: LearnState, lessonId: string) {
  if (s.unlockAll) return true;
  const i = flat.findIndex((x) => x.lesson.id === lessonId);
  return i <= 0 || (s.lessons[flat[i - 1].lesson.id] ?? 0) > 0;
}
export function nextLesson(s: LearnState) {
  return flat.find((x) => lessonUnlocked(s, x.lesson.id) && !(s.lessons[x.lesson.id] > 0)) ?? null;
}
export function lessonAfter(lessonId: string) {
  const i = flat.findIndex((x) => x.lesson.id === lessonId);
  return i >= 0 && i < flat.length - 1 ? flat[i + 1] : null;
}
export function unitProgress(s: LearnState, u: Unit) {
  const done = u.lessons.filter((l) => (s.lessons[l.id] ?? 0) > 0).length;
  return { done, total: u.lessons.length };
}
export function totalLessons() { return flat.length; }
