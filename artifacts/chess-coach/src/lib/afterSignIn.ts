// Where to go once sign-in finishes, for pages that send a signed-out visitor to sign in
// (e.g. the Chess.com extension's review link). Kept for 30 minutes; cleared on arrival.
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';

const KEY = 'cs_after_signin';

export function rememberAfterSignIn(path: string): void {
  try { localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() })); } catch { /* storage off */ }
}

export function peekAfterSignIn(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    if (!path || !path.startsWith('/') || path.startsWith('//') || !at || Date.now() - at > 30 * 60_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return path;
  } catch { return null; }
}

export function clearAfterSignIn(): void {
  try { localStorage.removeItem(KEY); } catch { /* storage off */ }
}

/** Mounted once in the app: signed in with somewhere to go back to → go there. */
export function AfterSignInRedirect(): null {
  const { isAuthenticated } = useUser();
  const [loc, navigate] = useLocation();
  useEffect(() => {
    if (!isAuthenticated) return;
    const path = peekAfterSignIn();
    if (!path) return;
    if (path.split('?')[0] === loc) { clearAfterSignIn(); return; }
    navigate(path, { replace: true });
  }, [isAuthenticated, loc, navigate]);
  return null;
}
