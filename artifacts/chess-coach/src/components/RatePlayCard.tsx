import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { isInPlayApp, PLAY_STORE_URL } from '@/lib/playApp';

// A quiet "rate us" card for people using the Android app, shown inside the
// result of something that just went well (a win, a puzzle streak). Never a
// pop-up. "Not now" hides it for two months; tapping Rate hides it for good.
// Ratings are the main thing that moves the app up in Google Play search.

const KEY = 'cs_rate_play';
const SNOOZE_MS = 60 * 24 * 60 * 60 * 1000;

function hidden(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'rated') return true;
    return !!v && Date.now() - Number(v) < SNOOZE_MS;
  } catch { return false; }
}

export function RatePlayCard({ moment = 'Nice one!' }: { moment?: string }) {
  const [gone, setGone] = useState(() => !isInPlayApp() || hidden());
  if (gone) return null;
  const set = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } setGone(true); };
  return (
    <div className="relative mx-auto max-w-[340px] rounded-xl p-3 text-left" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)' }}>
      <button type="button" onClick={() => set(String(Date.now()))} aria-label="Not now" className="absolute right-2 top-2 p-1" style={{ color: '#87918E' }}><X size={14} /></button>
      <p className="pr-6 text-[13.5px] font-extrabold" style={{ color: '#F5F7F6' }}>{moment} Enjoying ChessScout.net?</p>
      <p className="mt-0.5 text-[12.5px]" style={{ color: '#87918E' }}>A quick rating on Google Play helps other players find the app.</p>
      <div className="mt-2 flex items-center gap-3">
        <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => set('rated')}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-extrabold" style={{ background: '#81B64C', color: '#FFFFFF' }}>
          <Star size={14} fill="currentColor" /> Rate on Google Play
        </a>
        <button type="button" onClick={() => set(String(Date.now()))} className="text-[12.5px] font-bold" style={{ color: '#87918E' }}>Not now</button>
      </div>
    </div>
  );
}
