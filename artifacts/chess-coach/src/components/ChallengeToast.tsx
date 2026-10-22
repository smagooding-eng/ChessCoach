import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Swords, CalendarDays, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import type { ChallengeRow } from '@/components/play/OpenChallenges';

// A card at the bottom of the screen (like the "games are ready" one) when
// someone challenges you: the moment it arrives if the app is open, or the
// next time you open the app if you weren't on. Each challenge pops up once;
// it stays on the dashboard's "You've been challenged" card either way.

const SHOWN_KEY = 'cs_challenge_toasts_shown';
const shown = (): string[] => { try { return JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]'); } catch { return []; } };
const markShown = (code: string) => { try { localStorage.setItem(SHOWN_KEY, JSON.stringify([code, ...shown().filter((c) => c !== code)].slice(0, 50))); } catch { /* ignore */ } };

export function ChallengeToast() {
  const { isAuthenticated } = useUser();
  const [location, navigate] = useLocation();
  const [ch, setCh] = useState<ChallengeRow | null>(null);

  const check = useCallback(async () => {
    const d = await apiFetch('/api/challenges/invites').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const list = ((d?.invites ?? []) as ChallengeRow[]).filter((c) => c.status === 'open' && !c.open);
    const seen = shown();
    const next = list.find((c) => !seen.includes(c.code));
    if (next) setCh((cur) => cur ?? next);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void check();
    const on = (e: Event) => {
      const n = (e as CustomEvent<{ kind?: string; url?: string | null }>).detail;
      if (n?.kind === 'challenge' && n.url?.startsWith('/challenge/')) void check();
    };
    window.addEventListener('cs:notification', on);
    return () => window.removeEventListener('cs:notification', on);
  }, [isAuthenticated, check]);

  // Already on that challenge (or in a game): no need for the card.
  useEffect(() => { if (ch && location === `/challenge/${ch.code}`) { markShown(ch.code); setCh(null); } }, [ch, location]);
  if (!ch || /^\/(live|daily|correspondence|challenge)\b/.test(location)) return null;

  const close = () => { markShown(ch.code); setCh(null); };
  const tc = ch.kind === 'live' ? ch.timeControlLabel : `${ch.timeControlLabel} per move`;
  return (
    <div className="fixed left-3 right-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:left-auto md:right-5 md:bottom-5 z-50 md:max-w-sm rounded-[20px] p-4 shadow-2xl"
      style={{ background: 'var(--cs-card-solid, #0D1516)', border: '1px solid rgba(129,182,76,.45)', boxShadow: '0 18px 50px rgba(0,0,0,0.6)', backdropFilter: 'blur(14px)' }}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={{ background: '#81B64C', color: '#FFFFFF' }}>
          {ch.kind === 'live' ? <Swords size={20} /> : <CalendarDays size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black" style={{ color: '#F5F7F6' }}>{ch.creatorUsername} challenged you!</h3>
          <p className="mt-0.5 text-xs" style={{ color: '#87918E' }}>
            {ch.kind === 'live' ? 'Live' : 'Daily'} game · {tc} · {ch.mode === 'ranked' ? 'Ranked' : 'Casual'}
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { close(); navigate(`/challenge/${ch.code}`); }}
              className="flex-1 rounded-[10px] px-3 py-2 text-xs font-extrabold" style={{ background: '#81B64C', color: '#FFFFFF' }}>
              Play
            </button>
            <button onClick={close} className="flex-1 rounded-[10px] px-3 py-2 text-xs font-bold"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#F5F7F6', border: '1px solid rgba(255,255,255,.08)' }}>
              Later
            </button>
          </div>
        </div>
        <button onClick={close} aria-label="Close" className="shrink-0 rounded-md p-1" style={{ color: '#87918E' }}><X size={14} /></button>
      </div>
    </div>
  );
}
