// Kid Mode: a grown-up can lock this device into Chess for Kids.
//
// It's saved on the device AND (when signed in) on the account: the device
// copy survives closing the app and signing out; the account copy means the
// child's account opens locked on any device it signs in to. While it's on, every other
// page sends the child back to /kids, and turning it off needs the grown-up
// question in ParentGate.

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

const KEY = 'cs_kid_mode';
const listeners = new Set<() => void>();

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

let on = typeof window === 'undefined' ? false : read();

export function kidModeOn() { return on; }

/**
 * Turn Kid Mode on or off for this device -- and, when someone is signed in,
 * for their account too, so that account opens locked on any device.
 */
export function setKidMode(next: boolean, opts: { sync?: boolean } = {}) {
  on = next;
  try { if (next) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l());
  if (opts.sync !== false) {
    apiFetch('/api/learn/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kidMode: next }),
    }).catch(() => { /* signed out or offline: the device setting still applies */ });
  }
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
