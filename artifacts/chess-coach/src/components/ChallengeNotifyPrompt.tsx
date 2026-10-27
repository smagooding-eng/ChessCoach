import { useEffect, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { CHALLENGE_SENT } from '@/lib/challengeSent';

// Right after you send a challenge: if notifications are off, ask to turn them
// on (or explain how to unblock them), so you hear the moment it's accepted.
// Shown only on that action, and not again for 10 minutes after "Not now".

const SNOOZE_KEY = 'cs_challenge_notify_snooze';

export function ChallengeNotifyPrompt() {
  const push = usePushNotifications();
  const [who, setWho] = useState<string | null | undefined>(undefined);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const on = (e: Event) => {
      if (!push.supported) return;
      if (push.permission === 'granted' && push.isSubscribed) return;
      let snoozed = 0;
      try { snoozed = Number(sessionStorage.getItem(SNOOZE_KEY) || 0); } catch { /* ignore */ }
      if (Date.now() - snoozed < 10 * 60_000) return;
      setDone(false);
      setWho((e as CustomEvent<{ who?: string }>).detail?.who ?? null);
    };
    window.addEventListener(CHALLENGE_SENT, on);
    return () => window.removeEventListener(CHALLENGE_SENT, on);
  }, [push.supported, push.permission, push.isSubscribed]);

  // Turned on: say so briefly, then go.
  useEffect(() => {
    if (who === undefined || !push.isSubscribed || push.permission !== 'granted') return;
    setDone(true);
    const t = setTimeout(() => setWho(undefined), 2200);
    return () => clearTimeout(t);
  }, [who, push.isSubscribed, push.permission]);

  if (who === undefined) return null;
  const close = () => { try { sessionStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* ignore */ } setWho(undefined); };
  const blocked = push.permission === 'denied';
  const them = who || 'your friend';

  return (
    <div className="fixed left-3 right-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:left-auto md:right-5 md:bottom-5 z-[60] md:max-w-sm rounded-[20px] p-4 shadow-2xl"
      style={{ background: 'var(--cs-card-solid, #0D1516)', border: '1px solid rgba(129,182,76,.45)', boxShadow: '0 18px 50px rgba(0,0,0,0.6)', backdropFilter: 'blur(14px)' }}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={{ background: '#81B64C', color: '#FFFFFF' }}>
          {done ? <Check size={20} /> : <Bell size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          {done ? (
            <h3 className="text-sm font-black" style={{ color: '#F5F7F6' }}>Notifications are on. We'll tell you when {them} accepts.</h3>
          ) : (
            <>
              <h3 className="text-sm font-black" style={{ color: '#F5F7F6' }}>Challenge sent! Turn on notifications?</h3>
              <p className="mt-0.5 text-xs leading-snug" style={{ color: '#9AA4A1' }}>
                {blocked
                  ? push.inApp
                    ? `Notifications are off for the ChessScout app, so you won't hear when ${them} accepts. Open Android Settings › Apps › ChessScout › Notifications and turn them on.`
                    : `Notifications are blocked for chessscout.net, so you won't hear when ${them} accepts. Allow them in your browser's site settings (the icon left of the address bar).`
                  : `So you know the moment ${them} accepts, even with the app closed.`}
              </p>
              {push.error && !blocked && <p className="mt-1 text-xs" style={{ color: '#F0605D' }}>{push.error}</p>}
              <div className="mt-3 flex gap-2">
                {!blocked && (
                  <button onClick={() => { void push.subscribe(); }} disabled={push.loading}
                    className="flex-1 rounded-[10px] px-3 py-2 text-xs font-extrabold disabled:opacity-60" style={{ background: '#81B64C', color: '#FFFFFF' }}>
                    {push.loading ? 'Turning on…' : 'Turn on'}
                  </button>
                )}
                <button onClick={close} className="flex-1 rounded-[10px] px-3 py-2 text-xs font-bold"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#F5F7F6', border: '1px solid rgba(255,255,255,.08)' }}>
                  {blocked ? 'Got it' : 'Not now'}
                </button>
              </div>
            </>
          )}
        </div>
        <button onClick={close} aria-label="Close" className="shrink-0 rounded-md p-1" style={{ color: '#87918E' }}><X size={14} /></button>
      </div>
    </div>
  );
}
