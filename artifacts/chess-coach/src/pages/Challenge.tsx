import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { Loader2, Swords, CalendarDays, Zap } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { ShareLink } from '@/components/play/ShareLink';

export const PENDING_CHALLENGE_KEY = 'cs_pending_challenge';

interface ChallengeInfo {
  code: string;
  kind: 'live' | 'daily';
  timeControl: string;
  timeControlLabel: string | null;
  mode: 'casual' | 'ranked';
  color: 'random' | 'white' | 'black';
  status: 'open' | 'accepted' | 'cancelled' | 'expired';
  creatorUsername: string;
  gameId: string | null;
}

// Opened from a shared challenge link. Works signed-out (shows who's
// challenging and asks you to sign in; you come straight back here after).
export function Challenge() {
  const { code } = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, isAuthLoading } = useUser();
  const [ch, setCh] = useState<ChallengeInfo | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/api/challenges/${code}`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) { setMissing(true); return; }
        const d = await r.json();
        setCh(d.challenge); setIsCreator(!!d.isCreator);
      })
      .catch(() => setMissing(true));
  }, [code, isAuthenticated]);

  const accept = async () => {
    if (!ch) return;
    if (!isAuthenticated) {
      try { localStorage.setItem(PENDING_CHALLENGE_KEY, ch.code); } catch { /* ignore */ }
      navigate('/setup');
      return;
    }
    if (ch.kind === 'live') { navigate(`/live?challenge=${ch.code}`); return; }
    setBusy(true); setError('');
    try {
      const r = await apiFetch(`/api/challenges/${ch.code}/accept`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not accept');
      navigate(`/daily/${d.gameId}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not accept'); }
    finally { setBusy(false); }
  };

  const colorLine = (c: ChallengeInfo) =>
    c.color === 'random' ? 'Colours chosen at random' : `${c.creatorUsername} plays ${c.color}, you play ${c.color === 'white' ? 'black' : 'white'}`;

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: PT.bg }}>
      <div className="mx-auto max-w-[480px] space-y-4">
        <Link href="/" className="block text-center text-[20px] font-extrabold" style={{ color: PT.text }}>
          Chess<span style={{ color: PT.green }}>Scout</span>.net
        </Link>

        {missing ? (
          <div className="p-6 text-center" style={cardStyle}>
            <p className="text-[16px] font-extrabold" style={{ color: PT.text }}>Challenge not found</p>
            <p className="mt-1 text-[13px]" style={{ color: PT.muted }}>The link may be mistyped or the challenge was removed.</p>
            <Link href="/" className="mt-4 inline-block rounded-xl px-4 py-2.5 text-[13px] font-extrabold" style={greenBtn}>Go to ChessScout</Link>
          </div>
        ) : !ch || isAuthLoading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto animate-spin" style={{ color: PT.green }} /></div>
        ) : (
          <div className="space-y-4 p-6" style={cardStyle}>
            <div className="text-center">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: PT.greenSoft, color: PT.green }}>
                {ch.kind === 'live' ? <Swords size={26} /> : <CalendarDays size={26} />}
              </span>
              <p className="text-[20px] font-black" style={{ color: PT.text }}>
                {isCreator ? 'Your challenge' : `${ch.creatorUsername} challenges you`}
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: PT.green }}>
                {ch.kind === 'live' ? <Zap size={14} /> : <CalendarDays size={14} />}
                {ch.kind === 'live' ? `Live · ${ch.timeControlLabel}` : `Daily · ${ch.timeControlLabel} per move`} · {ch.mode === 'ranked' ? 'Ranked' : 'Casual'}
              </p>
              <p className="mt-1 text-[12.5px]" style={{ color: PT.muted }}>{colorLine(ch)}</p>
            </div>

            {ch.status !== 'open' ? (
              <p className="text-center text-[13.5px]" style={{ color: PT.muted }}>
                {ch.status === 'expired' ? 'This challenge has expired.' : ch.status === 'cancelled' ? 'This challenge was cancelled.' : 'This challenge has already been accepted.'}
              </p>
            ) : isCreator ? (
              <>
                <p className="text-center text-[13px]" style={{ color: PT.muted }}>Send this link to a friend. {ch.kind === 'live' ? 'Keep Live play open; the game starts when they accept.' : "The game starts when they accept; we'll notify you."}</p>
                <ShareLink url={`${window.location.origin}/challenge/${ch.code}`} text="Play me on ChessScout" />
                {ch.kind === 'live' && <Link href="/live" className="block rounded-xl py-2.5 text-center text-[13px] font-bold" style={ghostBtn}>Open Live play</Link>}
              </>
            ) : (
              <>
                <button onClick={accept} disabled={busy} className="w-full rounded-xl py-3.5 text-[15px] font-extrabold disabled:opacity-60" style={greenBtn}>
                  {isAuthenticated ? (busy ? 'Starting…' : 'Accept challenge') : 'Sign in to accept'}
                </button>
                {!isAuthenticated && <p className="text-center text-[12px]" style={{ color: PT.muted }}>Free account. You'll come straight back to this challenge.</p>}
              </>
            )}
            {error && <p className="text-center text-[13px]" style={{ color: PT.red }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
