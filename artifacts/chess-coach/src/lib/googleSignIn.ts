// Google sign-in, shared by every "Continue with Google" button.
//
// When the server has in-page sign-in switched on (GOOGLE_ONE_TAP=1), Google's
// one-tap sheet signs the person in right here on chessscout.net. Nothing leaves
// the page, which matters in the Android app: the usual redirect out to Google can
// finish in a separate browser tab, and people coming back to the app found it
// still signed out. If one tap can't show (or isn't switched on), it falls back
// to the usual redirect.
import { apiFetch, apiUrl } from '@/lib/api';
import { appSigninParam } from '@/lib/funnelTracking';

interface OneTapNote { isSkippedMoment?: () => boolean; getSkippedReason?: () => string; isNotDisplayed?: () => boolean; isDismissedMoment?: () => boolean; getDismissedReason?: () => string }
interface GoogleId {
  initialize: (o: Record<string, unknown>) => void;
  prompt: (cb?: (n: OneTapNote) => void) => void;
  cancel: () => void;
}
declare global { interface Window { google?: { accounts?: { id?: GoogleId } } } }

let status: Promise<string | null> | null = null;
const oneTapClientId = () => (status ??= apiFetch('/api/auth/google/status', { credentials: 'include' })
  .then((r) => (r.ok ? r.json() : null)).then((d) => (d?.oneTapClientId as string | null) ?? null).catch(() => null));

let script: Promise<GoogleId | null> | null = null;
const loadGsi = () => (script ??= new Promise<GoogleId | null>((resolve) => {
  if (window.google?.accounts?.id) { resolve(window.google.accounts.id); return; }
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => resolve(window.google?.accounts?.id ?? null);
  s.onerror = () => { script = null; resolve(null); };
  document.head.appendChild(s);
}));

function redirectSignIn(ref: string) {
  window.location.href = apiUrl(`/api/auth/google?${[ref ? `ref=${encodeURIComponent(ref)}` : '', appSigninParam(), `h=${newHandoff()}`].filter(Boolean).join('&')}`);
}

/** Start Google sign-in (the caller already logged the click). */
export async function startGoogleSignIn(refCode?: string): Promise<void> {
  let ref = refCode ?? '';
  if (!ref) { try { ref = localStorage.getItem('chessscout_ref') || ''; } catch { /* ignore */ } }
  const clientId = await oneTapClientId();
  const gid = clientId ? await loadGsi() : null;
  if (!clientId || !gid) { redirectSignIn(ref); return; }
  let settled = false;
  const fallback = () => { if (settled) return; settled = true; try { gid.cancel(); } catch { /* ignore */ } redirectSignIn(ref); };
  gid.initialize({
    client_id: clientId,
    use_fedcm_for_prompt: true,
    cancel_on_tap_outside: false,
    context: 'signin',
    callback: async ({ credential }: { credential?: string }) => {
      settled = true;
      try {
        const r = await apiFetch('/api/auth/google/idtoken', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential, ref }) });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.token) { redirectSignIn(ref); return; }
        // Same hand-off as the redirect sign-in, so tracking and set-up run exactly as before.
        window.location.replace(`/#token=${encodeURIComponent(d.token)}${d.newSignup ? '&newSignup=google' : '&login=google'}${appSigninParam() ? '&app=1' : ''}`);
      } catch { redirectSignIn(ref); }
    },
  });
  gid.prompt((n) => {
    // The person closed the sheet themselves: leave them where they are.
    if (n.isDismissedMoment?.() && n.getDismissedReason?.() === 'credential_returned') return;
    if (n.isSkippedMoment?.() && n.getSkippedReason?.() === 'user_cancel') { settled = true; return; }
    // Couldn't show here (not set up for this site, no Google account on the device...): redirect.
    if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) fallback();
  });
}

// Sign-in hand-off (see the server's lib/authHandoff.ts): a one-time code made before
// leaving for Google or Lichess, so the app can collect the sign-in when it's back,
// wherever the sign-in actually finished.
const HANDOFF_KEY = 'cs_auth_handoff';
function newHandoff(): string {
  const code = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(HANDOFF_KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* ignore */ }
  return code;
}
/** A hand-off code still waiting (made in the last 10 minutes). */
export function pendingHandoff(): string | null {
  try { const h = JSON.parse(localStorage.getItem(HANDOFF_KEY) || 'null') as { code?: string; at?: number } | null; return h?.code && h.at && Date.now() - h.at < 10 * 60_000 ? h.code : null; } catch { return null; }
}
export function clearHandoff(): void { try { localStorage.removeItem(HANDOFF_KEY); } catch { /* ignore */ } }

/** Sign in (or up) with Lichess: Lichess's own sign-in page, then straight back. */
export function startLichessSignIn(refCode?: string): void {
  let ref = refCode ?? '';
  if (!ref) { try { ref = localStorage.getItem('chessscout_ref') || ''; } catch { /* ignore */ } }
  window.location.href = apiUrl(`/api/auth/lichess?${[ref ? `ref=${encodeURIComponent(ref)}` : '', appSigninParam(), `h=${newHandoff()}`].filter(Boolean).join('&')}`);
}
