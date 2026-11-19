// Members with notifications off get a short reminder every 2-3 days: our own card (never
// the browser's permission box on its own), with Turn on / Not now. Blocked in settings:
// the same card says where to switch them back on.
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Bell, X, Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { STUDIO_FRAME } from '@/lib/studioFrame';
import { PROMO_OPEN_KEY } from '@/components/TrialPromo';

const KEY = (uid: string) => `cs_notify_nudge:${uid}`;
const EVERY_MS = 60 * 60 * 60_000; // 2.5 days
const SKIP = /^\/(setup|login|signup|subscription|pricing|review|instagram|admin|kids|embed|notifications|welcome)(\/|$)/;

export function NotifyNudge() {
  const { authUser } = useUser();
  const [path] = useLocation();
  const push = usePushNotifications();
  const [open, setOpen] = useState(false);
  const off = push.supported && !(push.permission === 'granted' && push.isSubscribed);

  useEffect(() => {
    if (!authUser || !off || open || STUDIO_FRAME || window.self !== window.top || SKIP.test(path)) return;
    let last = 0;
    try { last = Number(localStorage.getItem(KEY(authUser.id)) || 0); } catch { /* storage off */ }
    if (last && Date.now() - last < EVERY_MS) return;
    // After they've had a moment on the page, and not on top of the Pro offer.
    const t = setTimeout(() => {
      try { if (Date.now() - Number(localStorage.getItem(PROMO_OPEN_KEY) || 0) < 3 * 60_000) return; } catch { /* ignore */ }
      if (document.visibilityState !== 'visible') return;
      try { localStorage.setItem(KEY(authUser.id), String(Date.now())); } catch { /* storage off */ }
      setOpen(true);
    }, 20_000);
    return () => clearTimeout(t);
  }, [authUser, off, open, path]);

  useEffect(() => { if (open && !off) setOpen(false); }, [open, off]);
  if (!open) return null;
  const blocked = push.permission === 'denied';

  return (
    <div className="fixed inset-x-0 bottom-0 z-[110] flex justify-center p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:bottom-4" role="dialog" aria-label="Turn on notifications">
      <div className="relative w-full max-w-sm rounded-[18px] p-4" style={{ background: '#0D1516', border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 18px 40px -12px rgba(0,0,0,.8)' }}>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 p-1" style={{ color: '#87918E' }}><X size={16} /></button>
        <div className="flex items-start gap-3 pr-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: '#81B64C', color: '#06110A' }}><Bell size={20} /></span>
          <div className="min-w-0">
            <p className="text-[15px] font-black leading-tight text-white">Know when it's your move</p>
            <p className="mt-1 text-[12.5px] leading-snug" style={{ color: '#87918E' }}>
              {blocked ? push.blockedHelp
                : 'Get a heads-up when it’s your turn, when a game review is ready, and when someone challenges you.'}
            </p>
          </div>
        </div>
        {push.error && !blocked && <p className="mt-2 text-[12px]" style={{ color: '#FF7A80' }}>{push.error}</p>}
        <div className="mt-3 flex gap-2">
          {!blocked && (
            <button type="button" disabled={push.loading} onClick={() => void push.subscribe()} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-extrabold disabled:opacity-60" style={{ background: '#81B64C', color: '#06110A' }}>
              {push.loading && <Loader2 className="h-4 w-4 animate-spin" />} Turn on
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className={`${blocked ? 'flex-1' : ''} rounded-xl px-4 py-2.5 text-[13.5px] font-bold`} style={{ background: 'rgba(255,255,255,.06)', color: '#F5F7F6', border: '1px solid rgba(255,255,255,.10)' }}>
            {blocked ? 'Got it' : 'Not now'}
          </button>
        </div>
      </div>
    </div>
  );
}
