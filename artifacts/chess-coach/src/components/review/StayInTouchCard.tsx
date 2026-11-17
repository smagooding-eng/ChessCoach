// After a member's first finished review: "want this after every game?" Turn on
// notifications (same-day reviews of their new games arrive that way) and put ChessScout
// on their home screen (the Play Store app on Android, Add to Home Screen on iPhone, the
// browser's install elsewhere). Shown once; either part already done is left out, and
// it isn't shown at all when both are.
import { useEffect, useState } from 'react';
import { Bell, Smartphone, X, Check } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { usePwaInstall, isRunningStandalone } from '@/hooks/use-pwa-install';
import { PLAY_STORE_URL, isInPlayApp } from '@/lib/playApp';

const KEY = 'cs_stay_in_touch_v1';

export function StayInTouchCard() {
  const { permission, isSubscribed, subscribe, loading } = usePushNotifications();
  const { install, hasNativePrompt, platform } = usePwaInstall();
  const [gone, setGone] = useState(() => { try { return !!localStorage.getItem(KEY); } catch { return true; } });
  const [iosHelp, setIosHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  const notifyDone = permission === 'granted' && isSubscribed;
  const canNotify = !notifyDone && permission !== 'denied' && permission !== 'unsupported';
  const onHome = installed || isRunningStandalone() || isInPlayApp();
  const homeOption: 'play' | 'ios' | 'install' | null = onHome ? null
    : platform === 'android' ? 'play' : platform === 'ios' ? 'ios' : hasNativePrompt ? 'install' : null;
  const show = !gone && (canNotify || !!homeOption);

  // Counted as seen the first time it's shown: it's a one-time offer.
  useEffect(() => { if (show) { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* storage off */ } } }, [show]);
  if (!show) return null;

  const btn = 'flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-extrabold';
  return (
    <div className="relative mx-3 mt-2 rounded-[16px] p-3.5" style={{ background: '#121B1D', border: '1px solid rgba(255,255,255,.1)' }}>
      <button onClick={() => setGone(true)} aria-label="Close" className="absolute right-2 top-2 rounded-md p-1" style={{ color: '#87918E' }}><X size={16} /></button>
      <p className="pr-6 text-[15px] font-extrabold text-white">Want this after every game?</p>
      <p className="mt-1 text-[12.5px] leading-snug" style={{ color: '#AEB6B3' }}>
        We review your new Chess.com and Lichess games the same day you play them, free.
        {canNotify ? ' Turn on notifications and we’ll tell you the move that decided each one.' : ''}
      </p>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: canNotify && homeOption ? '1fr 1fr' : '1fr' }}>
        {canNotify && (
          <button onClick={() => { void subscribe(); }} disabled={loading} className={`${btn} text-white disabled:opacity-60`} style={{ background: 'linear-gradient(180deg,#81B64C,#5F8F36)' }}>
            <Bell size={15} /> Turn on notifications
          </button>
        )}
        {homeOption === 'play' && (
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className={`${btn} text-white`} style={{ background: 'rgba(255,255,255,.08)' }}>
            <Smartphone size={15} /> Get the app
          </a>
        )}
        {homeOption === 'install' && (
          <button onClick={() => { void install().then((ok) => { if (ok) setInstalled(true); }); }} className={`${btn} text-white`} style={{ background: 'rgba(255,255,255,.08)' }}>
            {installed ? <><Check size={15} /> Installed</> : <><Smartphone size={15} /> Add to home screen</>}
          </button>
        )}
        {homeOption === 'ios' && (
          <button onClick={() => setIosHelp((v) => !v)} className={`${btn} text-white`} style={{ background: 'rgba(255,255,255,.08)' }}>
            <Smartphone size={15} /> Add to Home Screen
          </button>
        )}
      </div>
      {iosHelp && (
        <p className="mt-2 text-[12px] leading-snug" style={{ color: '#AEB6B3' }}>
          In Safari, tap <b className="text-white">Share</b> (the square with the arrow), then <b className="text-white">Add to Home Screen</b>. Open ChessScout from there and you can turn on notifications too.
        </p>
      )}
    </div>
  );
}
