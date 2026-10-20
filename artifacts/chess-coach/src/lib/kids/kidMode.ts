// Kid Mode: a grown-up can lock this device into Chess for Kids.
//
// It's saved on the device (not in the account), so it survives closing the
// app, reloading, and signing out and back in. While it's on, every other
// page sends the child back to /kids, and turning it off needs the grown-up
// question in ParentGate.

import { useEffect, useState } from 'react';

const KEY = 'cs_kid_mode';
const listeners = new Set<() => void>();

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

let on = typeof window === 'undefined' ? false : read();

export function kidModeOn() { return on; }

export function setKidMode(next: boolean) {
  on = next;
  try { if (next) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useKidMode() {
  const [v, setV] = useState(on);
  useEffect(() => {
    const l = () => setV(on);
    listeners.add(l);
    // another tab changed it
    const s = (e: StorageEvent) => { if (e.key === KEY) { on = read(); l(); } };
    window.addEventListener('storage', s);
    return () => { listeners.delete(l); window.removeEventListener('storage', s); };
  }, []);
  return v;
}

/** Kid pages live under /kids. */
export const isKidsPath = (path: string) => path === '/kids' || path.startsWith('/kids/');
