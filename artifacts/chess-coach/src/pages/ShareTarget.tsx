// /share: Android's share menu → ChessScout. In the Chess.com (or Lichess) app a player taps
// Share on a finished game and picks ChessScout; Android opens this page with the shared text
// and link. A Chess.com game goes to /cc/<id> (brought in and reviewed); a Lichess game is
// saved to their games and opened. Anything else: say what we can take.
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { rememberAfterSignIn } from '@/lib/afterSignIn';
import { saveLichessGame } from '@/lib/lastLichessGame';
import { RD } from '@/lib/redesignTheme';

/** The game a shared message points at. */
export function sharedGame(text: string): { site: 'chesscom'; id: string } | { site: 'lichess'; id: string } | null {
  const cc = text.match(/chess\.com\/(?:analysis\/)?(?:game\/(?:live\/|daily\/)?|live\/game\/|daily\/game\/|game\/)(\d{4,15})/i);
  if (cc) return { site: 'chesscom', id: cc[1] };
  const li = text.match(/lichess\.org\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:\/(?:white|black))?(?:[/?#\s]|$)/);
  if (li && !/^(analysis|training|study|tv|games|player|team|tournament|swiss|broadcast|editor)$/i.test(li[1])) return { site: 'lichess', id: li[1] };
  return null;
}

export default function ShareTarget() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoaded } = useUser();
  const [state, setState] = useState<'working' | 'unknown' | 'error'>('working');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isLoaded) return;
    const q = new URLSearchParams(window.location.search);
    const all = [q.get('url'), q.get('text'), q.get('title')].filter(Boolean).join(' ');
    const g = sharedGame(all);
    if (!g) { setState('unknown'); return; }
    if (g.site === 'chesscom') { navigate(`/cc/${g.id}`, { replace: true }); return; }
    if (!isAuthenticated) {
      rememberAfterSignIn(window.location.pathname + window.location.search);
      navigate('/setup', { replace: true });
      return;
    }
    saveLichessGame(g.id)
      .then((id) => navigate(`/games/${id}`, { replace: true }))
      .catch((e) => { setErr(e instanceof Error ? e.message : 'Couldn’t bring that game in.'); setState('error'); });
  }, [isLoaded, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid min-h-[70vh] place-items-center px-6 text-center" style={{ color: RD.text }}>
      {state === 'working' && (
        <div>
          <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: RD.green }} />
          <p className="mt-3 text-[16px] font-extrabold">Opening your game…</p>
          <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>Every move is being checked.</p>
        </div>
      )}
      {state !== 'working' && (
        <div className="max-w-sm rounded-2xl p-5" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
          <p className="text-[16px] font-extrabold">{state === 'error' ? 'That game didn’t come through' : 'That isn’t a game link'}</p>
          <p className="mt-1.5 text-[13px]" style={{ color: RD.muted }}>
            {state === 'error' ? err : 'Share a finished game from the Chess.com or Lichess app (Share → ChessScout) and it opens here, reviewed.'}
          </p>
          <button onClick={() => navigate('/games')} className="mt-4 w-full rounded-xl py-2.5 text-[14px] font-extrabold" style={{ background: RD.green, color: '#06110A' }}>Go to my games</button>
        </div>
      )}
    </div>
  );
}
