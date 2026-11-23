// The daily streak (any activity): tell the server once a day per kind what the member did.
// Quiet on failure (an older server without /me/activity just doesn't count it).
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type ActivityKind = 'play' | 'puzzle' | 'review' | 'lesson' | 'analysis';
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function recordActivity(kind: ActivityKind) {
  const day = localDay();
  const key = `cs_act_${kind}`;
  try { if (localStorage.getItem(key) === day) return; } catch { /* storage off */ }
  apiFetch('/api/me/activity', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, day }) })
    .then((r) => { if (r.ok) { try { localStorage.setItem(key, day); } catch { /* */ } window.dispatchEvent(new Event('cs:activity')); } })
    .catch(() => {});
}

export type Streak = { streak: number; best: number; doneToday: boolean; week: { day: string; done: boolean }[] };
export function useStreak(enabled = true) {
  const [s, setS] = useState<Streak | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const load = () => apiFetch(`/api/me/streak?day=${localDay()}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setS(d)).catch(() => {});
    void load();
    window.addEventListener('cs:activity', load);
    return () => window.removeEventListener('cs:activity', load);
  }, [enabled]);
  return s;
}
