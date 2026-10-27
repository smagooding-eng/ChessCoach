// One-tap signup for people who arrive on a shared link (a challenge, a
// tournament, an article, a protected page). Google first, email as a
// smaller option. Remembers where they were (cs_return_to) so the app brings
// them straight back after signing up and linking their chess account.

import { useEffect } from 'react';
import { X, Mail } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { trackFunnelEvent, appSigninParam } from '@/lib/funnelTracking';

export const RETURN_TO_KEY = 'cs_return_to';

/** Remember a page to come back to after signup (same-site paths only). */
export function rememberReturnTo(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || path === '/' || path.startsWith('/setup') || path.startsWith('/welcome')) return;
  try { localStorage.setItem(RETURN_TO_KEY, path.slice(0, 300)); } catch { /* ignore */ }
}

export function startGoogleSignup() {
  trackFunnelEvent('google_oauth_clicked');
  let ref = '';
  try { ref = localStorage.getItem('chessscout_ref') || ''; } catch { /* ignore */ }
  window.location.href = apiUrl(`/api/auth/google?${[ref ? `ref=${encodeURIComponent(ref)}` : '', appSigninParam()].filter(Boolean).join('&')}`);
}

export function GoogleMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function QuickSignup({ open, onClose, title, subtitle, returnTo }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Page to come back to after signup (defaults to the current page; null when the caller handles it). */
  returnTo?: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    trackFunnelEvent('signup_clicked');
    if (returnTo !== null) rememberReturnTo(returnTo ?? (window.location.pathname + window.location.search));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, returnTo, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="relative w-full max-w-sm rounded-t-[22px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-[22px]"
        style={{ background: '#0D1516', border: '1px solid rgba(255,255,255,.08)' }} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 p-1" style={{ color: '#87918E' }}><X size={18} /></button>
        <p className="pr-6 text-[19px] font-black leading-tight text-white">{title}</p>
        <p className="mt-1 text-[13px]" style={{ color: '#87918E' }}>{subtitle ?? "Free, no credit card. You'll come straight back here."}</p>
        <button type="button" onClick={startGoogleSignup}
          className="mt-5 flex w-full items-center justify-center gap-3 rounded-[14px] py-3.5 text-[15px] font-extrabold"
          style={{ background: '#FFFFFF', color: '#1F1F1F', boxShadow: '0 10px 26px -12px rgba(0,0,0,.6)' }}>
          <GoogleMark /> Continue with Google
        </button>
        <a href={`${import.meta.env.BASE_URL}setup?signup=email`}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-[13.5px] font-bold"
          style={{ background: 'rgba(255,255,255,.06)', color: '#F5F7F6', border: '1px solid rgba(255,255,255,.10)' }}>
          <Mail size={15} /> Use email instead
        </a>
        <p className="mt-3 text-center text-[12px]" style={{ color: '#87918E' }}>
          Already have an account? <a href={`${import.meta.env.BASE_URL}setup?signup=login`} className="font-bold underline" style={{ color: '#81B64C' }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
