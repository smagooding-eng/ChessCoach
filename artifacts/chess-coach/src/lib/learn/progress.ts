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

function read(): LearnState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT };
}
let current: LearnState = typeof window === 'undefined' ? { ...DEFAULT } : read();
function write(next: LearnState) {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

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
