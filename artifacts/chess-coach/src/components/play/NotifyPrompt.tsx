import React from 'react';
import { Bell } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { PT, greenBtn } from '@/lib/playTheme';

// Small strip asking for notification permission where it matters (daily
// games, waiting for an opponent or a friend). Hidden once granted, and when
// the browser doesn't support push or the user blocked it.
export function NotifyPrompt({ reason }: { reason: string }) {
  const { permission, isSubscribed, subscribe, loading } = usePushNotifications();
  if (permission === 'unsupported' || permission === 'denied') return null;
  if (permission === 'granted' && isSubscribed) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3.5 py-3" style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
      <Bell size={18} className="shrink-0" style={{ color: PT.green }} />
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug" style={{ color: PT.text }}>{reason}</p>
      <button onClick={() => { void subscribe(); }} disabled={loading} className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-extrabold disabled:opacity-60" style={greenBtn}>
        Turn on
      </button>
    </div>
  );
}
