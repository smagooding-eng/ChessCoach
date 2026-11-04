import React, { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { PT, greenBtn } from '@/lib/playTheme';

// Asks for notifications where they matter (home, daily games, waiting for an
// opponent or a friend, after a game, while games are being reviewed). The
// browser's own "Allow" box only opens when the person taps Turn on: browsers
// hide or ignore permission prompts that nobody asked for.
// Hidden once allowed, and when the browser can't do push or it's blocked.
// With an `id`, it can be closed: it stays away for a week, and after three
// closes it's gone for good (the toggle in Profile still works).
const SNOOZE_MS = 7 * 24 * 3600_000;
const read = (id: string): { n: number; at: number } => { try { return JSON.parse(localStorage.getItem(`cs_notify_${id}`) || '{"n":0,"at":0}'); } catch { return { n: 0, at: 0 }; } };

export function NotifyPrompt({ reason, id, className = '' }: { reason: string; id?: string; className?: string }) {
  const { permission, isSubscribed, subscribe, loading, error } = usePushNotifications();
  const [closed, setClosed] = useState(() => { if (!id) return false; const s = read(id); return s.n >= 3 || Date.now() - s.at < SNOOZE_MS; });
  if (closed) return null;
  const close = () => { if (!id) return; const s = read(id); try { localStorage.setItem(`cs_notify_${id}`, JSON.stringify({ n: s.n + 1, at: Date.now() })); } catch { /* ignore */ } setClosed(true); };
  // iPhone / iPad in Safari: notifications only work once ChessScout is on the Home Screen.
  if (permission === 'unsupported') {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
    if (!ios || standalone || !id) return null;
    return (
      <div className={`rounded-2xl px-3.5 py-3 ${className}`} style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
        <div className="flex items-center gap-3">
          <Bell size={18} className="shrink-0" style={{ color: PT.green }} />
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug" style={{ color: PT.text }}>On iPhone, notifications need ChessScout on your Home Screen: tap Share, then <b>Add to Home Screen</b>, and open it from there.</p>
          <button onClick={close} aria-label="Not now" className="shrink-0 rounded-md p-1" style={{ color: PT.muted }}><X size={15} /></button>
        </div>
      </div>
    );
  }
  if (permission === 'denied') return null;
  if (permission === 'granted' && isSubscribed) return null;
  return (
    <div className={`rounded-2xl px-3.5 py-3 ${className}`} style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
      <div className="flex items-center gap-3">
        <Bell size={18} className="shrink-0" style={{ color: PT.green }} />
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug" style={{ color: PT.text }}>{reason}</p>
        <button onClick={() => { void subscribe(); }} disabled={loading} className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-extrabold disabled:opacity-60" style={greenBtn}>
          Turn on
        </button>
        {id && <button onClick={close} aria-label="Not now" className="shrink-0 rounded-md p-1" style={{ color: PT.muted }}><X size={15} /></button>}
      </div>
      {error && <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: PT.muted }}>{error}</p>}
    </div>
  );
}
