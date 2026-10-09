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

// One id per open tab/app window, so the server can tell which page each of
// your open apps is showing (used to skip alerts about the game on screen).
const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

function reportView(keepalive = false, leaving = false) {
  const visible = !leaving && document.visibilityState === 'visible';
  apiFetch('/api/events/view', {
    method: 'POST', keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tab: TAB_ID, path: window.location.pathname, visible }),
  }).then(async (r) => {
    if (r.ok && visible && ((await r.json().catch(() => null))?.cleared ?? 0) > 0) void refreshUnread();
  }).catch(() => { /* ignore */ });
}

interface Incoming { id: string | null; title: string; body: string; url: string | null; kind: string }

export function RealtimeBridge() {
  const { isAuthenticated, authUser } = useUser();
  const [location, navigate] = useLocation();
  const [banner, setBanner] = useState<Incoming | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !authUser?.id) return;
    void refreshUnread();
    const token = getAuthToken();
    const qs = new URLSearchParams({ tab: TAB_ID, path: window.location.pathname, visible: document.visibilityState === 'visible' ? '1' : '0' });
    if (token) qs.set('token', token);
    const url = `${getApiBase()}/api/events?${qs.toString()}`;
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

  // Tell the server what's on screen: on every page change, when the app is
  // hidden/shown (phone locked, tab switched), and every 30s while visible.
  useEffect(() => {
    if (!isAuthenticated || !authUser?.id) return;
    reportView();
  }, [isAuthenticated, authUser?.id, location]);

  useEffect(() => {
    if (!isAuthenticated || !authUser?.id) return;
    const onVis = () => reportView(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', onVis);
    const onHide = () => reportView(true, true);
    window.addEventListener('pagehide', onHide);
    const t = setInterval(() => { if (document.visibilityState === 'visible') reportView(); }, 30_000);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); clearInterval(t); };
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
