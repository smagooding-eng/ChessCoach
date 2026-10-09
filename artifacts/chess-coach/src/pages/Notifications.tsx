import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Bell, Loader2, Send, Settings, X, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { setUnread } from '@/components/RealtimeBridge';

// Also take ChessScout alerts off this device's notification tray.
function closeDeviceNotifications(tag?: string) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.getNotifications(tag ? { tag } : undefined))
    .then((list) => list.forEach((n) => n.close()))
    .catch(() => { /* ignore */ });
}

/** A notification row you can swipe left (or tap ×) to clear. */
function SwipeRow({ onClear, children }: { onClear: () => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = React.useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const clear = () => { setGone(true); setTimeout(onClear, 180); };
  return (
    <div className="relative overflow-hidden" style={{ background: PT.red }}>
      <span className="absolute inset-y-0 right-4 flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wider text-white"><Trash2 size={15} /> Clear</span>
      <div
        onTouchStart={(e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY, horizontal: null }; }}
        onTouchMove={(e) => {
          const st = start.current; if (!st) return;
          const t = e.touches[0]; const mx = t.clientX - st.x; const my = t.clientY - st.y;
          if (st.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) st.horizontal = Math.abs(mx) > Math.abs(my);
          if (st.horizontal) setDx(Math.min(0, mx));
        }}
        onTouchEnd={() => { const swiped = dx < -90; start.current = null; if (swiped) clear(); else setDx(0); }}
        onClickCapture={(e) => { if (dx !== 0) { e.preventDefault(); e.stopPropagation(); } }}
        className="relative"
        style={{
          background: PT.cardSolid,
          transform: `translateX(${gone ? -110 : 0}%) translateX(${gone ? 0 : dx}px)`,
          transition: start.current ? 'none' : 'transform .18s ease-out',
        }}
      >
        {children}
        <button type="button" aria-label="Clear notification"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); clear(); }}
          className="absolute bottom-2 right-2 rounded-full p-1.5" style={{ color: PT.muted }}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

interface Note { id: string; title: string; body: string; url: string | null; kind: string; read: boolean; createdAt: string }

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Notifications() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [pushConfigured, setPushConfigured] = useState<boolean | null>(null);
  const [testMsg, setTestMsg] = useState('');
  const push = usePushNotifications();

  const load = useCallback(async () => {
    const r = await apiFetch('/api/notifications');
    if (!r.ok) { setNotes([]); return; }
    const d = await r.json();
    setNotes(d.notifications ?? []);
    setPushConfigured(!!d.pushConfigured);
    if ((d.unread ?? 0) > 0) {
      await apiFetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
    }
    setUnread(0);
  }, []);

  useEffect(() => {
    void load();
    const on = () => { void load(); };
    window.addEventListener('cs:notification', on);
    return () => window.removeEventListener('cs:notification', on);
  }, [load]);

  const clearOne = async (n: Note) => {
    setNotes((cur) => (cur ?? []).filter((x) => x.id !== n.id));
    if (n.url) closeDeviceNotifications(`cs:${n.url}`);
    await apiFetch(`/api/notifications/${encodeURIComponent(n.id)}`, { method: 'DELETE' }).catch(() => {});
  };
  const clearAll = async () => {
    setNotes([]);
    setUnread(0);
    closeDeviceNotifications();
    await apiFetch('/api/notifications', { method: 'DELETE' }).catch(() => {});
  };

  const test = async () => {
    setTestMsg('Sending…');
    try {
      const r = await apiFetch('/api/notifications/test', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const p = d.push as { configured: boolean; devices: number };
      setTestMsg(
        !p.configured
          ? 'In-app notifications work. Phone/desktop push is OFF on the server (VAPID keys not set on Render).'
          : p.devices === 0
            ? 'In-app notifications work. No device has push turned on for this account yet — tap "Turn on" below on each device.'
            : `Sent to the app and to ${p.devices} device${p.devices === 1 ? '' : 's'} with push turned on.`,
      );
    } catch { setTestMsg('Could not send a test.'); }
  };

  const pushState =
    push.permission === 'unsupported' ? 'This browser can\'t receive push notifications.'
    : push.permission === 'denied' ? 'Notifications are blocked for ChessScout in this browser\'s settings.'
    : push.isSubscribed ? 'Push is on for this device.'
    : 'Push is off for this device.';

  return (
    <div className="mx-auto max-w-[640px] space-y-4 p-4 md:p-0 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black" style={{ color: PT.text }}>Notifications</h1>
        <Link href="/profile" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold" style={ghostBtn}><Settings size={14} /> Settings</Link>
      </div>

      <section className="space-y-2.5 p-4" style={cardStyle}>
        <p className="text-[13px]" style={{ color: PT.text }}>{pushState}</p>
        {pushConfigured === false && (
          <p className="text-[12px]" style={{ color: PT.gold }}>Push isn't set up on the server yet, so alerts only appear while the app is open.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {!push.isSubscribed && push.permission !== 'unsupported' && push.permission !== 'denied' && (
            <button onClick={() => { void push.subscribe(); }} disabled={push.loading} className="rounded-lg px-3.5 py-2 text-[12.5px] font-extrabold" style={greenBtn}>Turn on for this device</button>
          )}
          <button onClick={test} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold" style={ghostBtn}><Send size={14} /> Send a test</button>
        </div>
        {testMsg && <p className="text-[12.5px]" style={{ color: PT.muted }}>{testMsg}</p>}
        {push.error && <p className="text-[12px]" style={{ color: PT.red }}>{push.error}</p>}
      </section>

      {notes === null ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin" style={{ color: PT.green }} /></div>
      ) : notes.length === 0 ? (
        <div className="px-6 py-10 text-center" style={cardStyle}>
          <Bell size={28} className="mx-auto mb-2" style={{ color: PT.muted }} />
          <p className="text-[14px] font-bold" style={{ color: PT.text }}>Nothing yet</p>
          <p className="text-[12.5px]" style={{ color: PT.muted }}>Game invites, your-move alerts and results show up here.</p>
        </div>
      ) : (
        <>
        <div className="flex items-center justify-between px-1">
          <p className="text-[12px]" style={{ color: PT.muted }}>Swipe left or tap × to clear one.</p>
          <button onClick={() => { void clearAll(); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold" style={ghostBtn}>
            <Trash2 size={14} /> Clear all
          </button>
        </div>
        <section className="overflow-hidden" style={cardStyle}>
          {notes.map((n, i) => {
            const inner = (
              <div className="flex items-start gap-3 py-3 pl-4 pr-10" style={{ borderTop: i ? `1px solid ${PT.border}` : undefined }}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: n.read ? 'transparent' : PT.green }} />
                <span className="min-w-0 flex-1">
                  <b className="block text-[14px] font-extrabold" style={{ color: PT.text }}>{n.title}</b>
                  <span className="block text-[12.5px] leading-snug" style={{ color: PT.muted }}>{n.body}</span>
                </span>
                <span className="shrink-0 text-[11px]" style={{ color: PT.muted }}>{ago(n.createdAt)}</span>
              </div>
            );
            return (
              <SwipeRow key={n.id} onClear={() => { void clearOne(n); }}>
                {n.url ? <Link href={n.url}>{inner}</Link> : inner}
              </SwipeRow>
            );
          })}
        </section>
        </>
      )}
    </div>
  );
}
