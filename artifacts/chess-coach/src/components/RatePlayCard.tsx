import { useEffect, useState } from 'react';
import { Star, X, Check } from 'lucide-react';
import { isInPlayApp, PLAY_STORE_URL } from '@/lib/playApp';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/context/UserContext';

// A quiet card inside the result of something that just went well (a win, a
// puzzle streak). Never a pop-up, never at signup. It holds two things:
//  - "Where did you find us?": one tap, asked once per account (any device).
//  - "Rate on Google Play": for people using the Android app.
// Each part hides on its own: "Not now" snoozes, an answer or a rating hides it for good.

const RATE_KEY = 'cs_rate_play';
const ASK_KEY = 'cs_heard_from';
const RATE_SNOOZE_MS = 60 * 24 * 60 * 60 * 1000;
const ASK_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

const SOURCES: { id: string; label: string }[] = [
  { id: 'tiktok', label: 'TikTok' }, { id: 'instagram', label: 'Instagram' }, { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' }, { id: 'reddit', label: 'Reddit' }, { id: 'chatgpt', label: 'ChatGPT / AI' },
  { id: 'google', label: 'Google' }, { id: 'friend', label: 'A friend' }, { id: 'club', label: 'Club or tournament' },
  { id: 'other', label: 'Other' },
];

function snoozed(key: string, ms: number, done: string): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === done) return true;
    return !!v && Date.now() - Number(v) < ms;
  } catch { return false; }
}
const save = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* ignore */ } };

export function RatePlayCard({ moment = 'Nice one!' }: { moment?: string }) {
  const { isAuthenticated } = useUser();
  const [rate, setRate] = useState(() => isInPlayApp() && !snoozed(RATE_KEY, RATE_SNOOZE_MS, 'rated'));
  // null = still checking whether this account has answered.
  const [ask, setAsk] = useState<boolean | null>(() => (isAuthenticated && !snoozed(ASK_KEY, ASK_SNOOZE_MS, 'done') ? null : false));
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    if (ask !== null) return;
    let gone = false;
    apiFetch('/api/me/heard-from', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { answered: true }))
      .then((d: { answered?: boolean }) => { if (gone) return; if (d.answered) save(ASK_KEY, 'done'); setAsk(!d.answered); })
      .catch(() => { if (!gone) setAsk(false); });
    return () => { gone = true; };
  }, [ask]);

  const answer = (source: string) => {
    save(ASK_KEY, 'done'); setThanks(true);
    apiFetch('/api/me/heard-from', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) }).catch(() => { /* best effort */ });
    setTimeout(() => setAsk(false), 1400);
  };

  if (!rate && !ask) return null;
  const close = () => {
    if (rate) { save(RATE_KEY, String(Date.now())); setRate(false); }
    if (ask) { save(ASK_KEY, String(Date.now())); setAsk(false); }
  };
  return (
    <div className="relative mx-auto max-w-[360px] space-y-3 rounded-xl p-3 text-left" style={{ background: '#1A2224', border: '1px solid rgba(255,255,255,.10)' }}>
      <button type="button" onClick={close} aria-label="Not now" className="absolute right-2 top-2 p-1" style={{ color: '#87918E' }}><X size={14} /></button>
      {ask && (
        <div>
          <p className="pr-6 text-[13.5px] font-extrabold" style={{ color: '#F5F7F6' }}>{moment} Quick one: where did you find ChessScout?</p>
          {thanks ? (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: '#81B64C' }}><Check size={15} /> Thanks, that really helps.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SOURCES.map((s) => (
                <button key={s.id} type="button" onClick={() => answer(s.id)} className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold"
                  style={{ background: 'rgba(255,255,255,.07)', color: '#F5F7F6', border: '1px solid rgba(255,255,255,.10)' }}>{s.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {rate && (
        <div style={ask ? { borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 10 } : undefined}>
          <p className="pr-6 text-[13.5px] font-extrabold" style={{ color: '#F5F7F6' }}>{ask ? 'Enjoying ChessScout.net?' : `${moment} Enjoying ChessScout.net?`}</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: '#87918E' }}>A quick rating on Google Play helps other players find the app.</p>
          <div className="mt-2 flex items-center gap-3">
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => { save(RATE_KEY, 'rated'); setRate(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-extrabold" style={{ background: '#81B64C', color: '#FFFFFF' }}>
              <Star size={14} fill="currentColor" /> Rate on Google Play
            </a>
            <button type="button" onClick={() => { save(RATE_KEY, String(Date.now())); setRate(false); }} className="text-[12.5px] font-bold" style={{ color: '#87918E' }}>Not now</button>
          </div>
        </div>
      )}
    </div>
  );
}
