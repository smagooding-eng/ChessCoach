// /cc/<gameId>: a Chess.com game, opened from the ChessScout extension's "Review" button
// (or /cc/latest for your newest game). Brings the game in and opens its review; if
// Chess.com hasn't published the finished game yet, it waits and checks again.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams, Link } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { rememberAfterSignIn } from '@/lib/afterSignIn';

const POLL_MS = 10_000;
const GIVE_UP_MS = 10 * 60_000;

export default function ChesscomGame() {
  const { gameId = '' } = useParams<{ gameId: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoaded } = useUser();
  const [state, setState] = useState<'working' | 'waiting' | 'slow' | 'nolink' | 'error'>('working');
  const started = useRef(Date.now());
  const q = new URLSearchParams(window.location.search);
  const players = q.get('p')?.split(',').filter(Boolean) ?? [];
  const since = Number(q.get('s')) || undefined;

  useEffect(() => {
    if (!isLoaded) return;
    if (!isAuthenticated) {
      rememberAfterSignIn(window.location.pathname + window.location.search);
      navigate('/setup');
      return;
    }
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      try {
        const r = await apiFetch('/api/games/from-chesscom', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, players, since }),
        });
        const d = await r.json().catch(() => ({}));
        if (stop) return;
        if (d.id) { navigate(`/games/${d.id}`, { replace: true }); return; }
        if (d.error === 'no_chesscom') { setState('nolink'); return; }
        if (!r.ok) { setState('error'); return; }
        const slow = Date.now() - started.current > GIVE_UP_MS;
        setState(slow ? 'slow' : 'waiting');
        if (!slow) timer = setTimeout(ask, POLL_MS);
      } catch { if (!stop) { setState('waiting'); timer = setTimeout(ask, POLL_MS); } }
    };
    void ask();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isAuthenticated, gameId]);

  const text: Record<typeof state, { title: string; body: string }> = {
    working: { title: 'Getting your game…', body: 'Bringing it in from Chess.com.' },
    waiting: { title: 'Waiting for Chess.com…', body: 'Chess.com publishes a finished game a little after it ends. This page checks every few seconds and opens your review as soon as it’s there.' },
    slow: { title: 'Chess.com is taking a while', body: 'It hasn’t published this game yet. Your linked Chess.com games are checked regularly, so it will show up in My Games and be reviewed for you.' },
    nolink: { title: 'Link your Chess.com username', body: 'Add your Chess.com username in your profile and your games will come in automatically.' },
    error: { title: 'Couldn’t get that game', body: 'Something went wrong bringing it in. Try again from Chess.com in a moment.' },
  };
  const t = text[state];
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4">
      <div className="w-full rounded-2xl border border-border/40 bg-card p-6 text-center">
        {(state === 'working' || state === 'waiting') && <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />}
        <h1 className="text-lg font-extrabold">{t.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.body}</p>
        {state === 'nolink' && <Link href="/profile" className="mt-4 inline-block rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Open my profile</Link>}
        {(state === 'slow' || state === 'error') && <Link href="/games" className="mt-4 inline-block rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Go to My Games</Link>}
      </div>
    </div>
  );
}
