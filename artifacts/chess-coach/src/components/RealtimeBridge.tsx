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

interface Incoming { id: string | null; title: string; body: string; url: string | null; kind: string; open?: boolean }

// A game that just started for you (your challenge was accepted): jump to it if the app is
// on screen, or as soon as you come back to it (within 15 minutes). Not while you're in a
// live game or on an admin screen (e.g. recording a clip) -- those get the banner instead.
const OPEN_WINDOW_MS = 15 * 60_000;
const opened = new Set<string>();
const busyHere = (path: string, url: string) => (path.startsWith('/live') && !url.startsWith('/live')) || path.startsWith('/admin');

export function RealtimeBridge() {
  const { isAuthenticated, authUser } = useUser();
  const [location, navigate] = useLocation();
  const [banner, setBanner] = useState<Incoming | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOpen = useRef<{ url: string; at: number } | null>(null);
  const navRef = useRef(navigate); navRef.current = navigate;
  // Came back to the app after a game started: open it.
  useEffect(() => {
    const go = (url: string, key: string) => {
      if (opened.has(key) || window.location.pathname + window.location.search === url || busyHere(window.location.pathname, url)) return;
      opened.add(key);
      navRef.current(url);
    };
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const p = pendingOpen.current;
      pendingOpen.current = null;
      if (p) { if (Date.now() - p.at < OPEN_WINDOW_MS) go(p.url, p.url + p.at); return; }
      // The live connection sleeps while the app is in the background, so the alert may
      // never have arrived: look for a challenge accepted in the last 15 minutes.
      if (!getAuthToken()) return;
      apiFetch('/api/notifications').then((r) => (r.ok ? r.json() : null)).then((d: { notifications?: { id: string; title: string; url: string | null; kind: string; read: boolean; createdAt: string }[] } | null) => {
        const hit = (d?.notifications ?? []).find((x) => !x.read && x.kind === 'challenge' && /^Challenge accepted/.test(x.title)
          && !!x.url && /^\/(daily\/|live)/.test(x.url) && Date.now() - new Date(x.createdAt).getTime() < OPEN_WINDOW_MS);
        if (hit?.url) go(hit.url, hit.id);
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
  }, []);

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
      // Your challenge was accepted: straight to the game.
      if (n.open && n.url && !busyHere(window.location.pathname, n.url)) {
        if (document.visibilityState === 'visible') { setBanner(null); navRef.current(n.url); return; }
        pendingOpen.current = { url: n.url, at: Date.now() };
      }
      // New challenges get their own card at the bottom (ChallengeToast).
      if (n.kind === 'challenge' && n.url?.startsWith('/challenge/')) return;
      setBanner(n);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setBanner(null), 7000);
    });
    // Friends & messages: the chat screen and badges listen for these.
    for (const [evt, name] of [['dm', 'cs:dm'], ['dm_read', 'cs:dm-read'], ['friends_update', 'cs:friends-update']] as const) {
      es.addEventListener(evt, (e) => {
        try { window.dispatchEvent(new CustomEvent(name, { detail: JSON.parse((e as MessageEvent).data) })); } catch { /* ignore */ }
      });
    }
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
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: '#81B64C', color: '#FFFFFF' }}><Bell size={18} /></span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>{banner.title}</b>
          <span className="block truncate text-[12.5px]" style={{ color: PT.muted }}>{banner.body}</span>
        </span>
        <span onClick={(e) => { e.stopPropagation(); setBanner(null); }} className="shrink-0 p-1" style={{ color: PT.muted }} aria-label="Dismiss"><X size={16} /></span>
      </button>
    </div>
  );
}
