import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Bell, X } from 'lucide-react';
import { getApiBase, getAuthToken, apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { PT } from '@/lib/playTheme';

// One real-time connection for the whole signed-in app (Server-Sent Events
// from /api/events):
//   - "notification": shows an in-app banner, bumps the bell's unread count
//   - "daily_update": a daily game changed -> pages listening for
//     'cs:daily-update' refresh their board/list immediately
// EventSource reconnects by itself if the connection drops.

// ── tiny shared store for the unread count (used by the bell) ──
let unread = 0;
const listeners = new Set<(n: number) => void>();
export function setUnread(n: number) { unread = Math.max(0, n); listeners.forEach((l) => l(unread)); }
export function useUnreadCount(): number {
  const [n, setN] = useState(unread);
  useEffect(() => { listeners.add(setN); setN(unread); return () => { listeners.delete(setN); }; }, []);
  return n;
}
export async function refreshUnread() {
  try {
    const r = await apiFetch('/api/notifications');
    if (r.ok) setUnread((await r.json()).unread ?? 0);
  } catch { /* ignore */ }
}

interface Incoming { id: string | null; title: string; body: string; url: string | null; kind: string }

export function RealtimeBridge() {
  const { isAuthenticated, authUser } = useUser();
  const [, navigate] = useLocation();
  const [banner, setBanner] = useState<Incoming | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !authUser?.id) return;
    void refreshUnread();
    const token = getAuthToken();
    const url = `${getApiBase()}/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    let es: EventSource | null = null;
    try { es = new EventSource(url, { withCredentials: true }); } catch { return; }

    es.addEventListener('notification', (e) => {
      let n: Incoming;
      try { n = JSON.parse((e as MessageEvent).data); } catch { return; }
      setUnread(unread + 1);
      window.dispatchEvent(new CustomEvent('cs:notification', { detail: n }));
      // Don't pop a banner for something about the game you're already looking at.
      if (n.url && window.location.pathname === n.url) return;
      setBanner(n);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setBanner(null), 7000);
    });
    es.addEventListener('daily_update', (e) => {
      try { window.dispatchEvent(new CustomEvent('cs:daily-update', { detail: JSON.parse((e as MessageEvent).data) })); } catch { /* ignore */ }
    });
    return () => { es?.close(); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [isAuthenticated, authUser?.id]);

  if (!banner) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none">
      <button
        onClick={() => { setBanner(null); if (banner.url) navigate(banner.url); }}
        className="pointer-events-auto flex w-full max-w-[480px] items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-2xl"
        style={{ background: PT.cardSolid, border: `1px solid ${PT.greenLine}`, boxShadow: '0 18px 40px -12px rgba(0,0,0,.7)' }}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: PT.greenSoft, color: PT.green }}><Bell size={18} /></span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>{banner.title}</b>
          <span className="block truncate text-[12.5px]" style={{ color: PT.muted }}>{banner.body}</span>
        </span>
        <span onClick={(e) => { e.stopPropagation(); setBanner(null); }} className="shrink-0 p-1" style={{ color: PT.muted }} aria-label="Dismiss"><X size={16} /></span>
      </button>
    </div>
  );
}
