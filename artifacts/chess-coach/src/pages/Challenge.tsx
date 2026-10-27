import React, { useEffect, useState } from 'react';
import { announceChallengeSent } from '@/lib/challengeSent';
import { Link, useLocation, useParams } from 'wouter';
import { Loader2, Swords, CalendarDays, Zap } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { ShareLink } from '@/components/play/ShareLink';
import { QuickSignup } from '@/components/QuickSignup';

export const PENDING_CHALLENGE_KEY = 'cs_pending_challenge';

interface ChallengeInfo {
  code: string;
  kind: 'live' | 'daily';
  timeControl: string;
  timeControlLabel: string | null;
  mode: 'casual' | 'ranked';
  color: 'random' | 'white' | 'black';
  status: 'open' | 'accepted' | 'cancelled' | 'expired' | 'requested' | 'approved' | 'declined';
  creatorUsername: string;
  gameId: string | null;
  open?: boolean;
  isRequest?: boolean;
  requesterUsername?: string | null;
}

// Opened from a shared challenge link. Works signed-out (shows who's
// challenging and asks you to sign in; you come straight back here after).
export function Challenge() {
  const { code } = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, isAuthLoading } = useUser();
  const [ch, setCh] = useState<ChallengeInfo | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isRequester, setIsRequester] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signupOpen, setSignupOpen] = useState(false);

  const load = React.useCallback(() => {
    apiFetch(`/api/challenges/${code}`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) { setMissing(true); return; }
        const d = await r.json();
        let sentHere = false;
        try { sentHere = sessionStorage.getItem(`cs_sent_request_${d.challenge?.code}`) === '1'; } catch { /* ignore */ }
        setCh(d.challenge); setIsCreator(!!d.isCreator); setIsRequester(!!d.isRequester || (sentHere && !d.isCreator));
      })
      .catch(() => setMissing(true));
  }, [code]);
  // Signed in and it's someone else's challenge: keep it on your home and
  // Play screens until you answer or dismiss it.
  useEffect(() => {
    if (!isAuthenticated || !ch || isCreator || ch.isRequest) return;
    apiFetch(`/api/challenges/${ch.code}/seen`, { method: 'POST' }).catch(() => {});
  }, [isAuthenticated, ch?.code, isCreator]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    // a request's status changes when the other side answers
    const on = () => load();
    window.addEventListener('cs:notification', on);
    return () => window.removeEventListener('cs:notification', on);
  }, [load, isAuthenticated]);

  const post = async (path: string): Promise<any> => {
    setBusy(true); setError('');
    try {
      const r = await apiFetch(`/api/challenges/${code}/${path}`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Something went wrong');
      return d;
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); return null; }
    finally { setBusy(false); }
  };

  // Open link: ask the owner for a game.
  const sendRequest = async () => {
    if (!ch) return;
    if (!isAuthenticated) {
      try { localStorage.setItem(PENDING_CHALLENGE_KEY, ch.code); } catch { /* ignore */ }
      setSignupOpen(true);
      return;
    }
    const d = await post('request');
    if (!d?.request) return;
    announceChallengeSent(ch.creatorUsername);
    try { sessionStorage.setItem(`cs_sent_request_${d.request.code}`, '1'); } catch { /* ignore */ }
    if (d.request.kind === 'live') navigate(`/live?challenge=${d.request.code}`);
    else navigate(`/challenge/${d.request.code}`);
  };
  // Owner answering a request.
  const approve = async () => {
    if (!ch) return;
    if (ch.kind === 'live') { navigate(`/live?approve=${ch.code}`); return; }
    const d = await post('approve');
    if (d?.gameId) navigate(`/daily/${d.gameId}`);
  };
  const decline = async () => { if (await post('decline')) load(); };
  const withdraw = async () => { if (await post('withdraw')) load(); };

  const accept = async () => {
    if (!ch) return;
    if (!isAuthenticated) {
      try { localStorage.setItem(PENDING_CHALLENGE_KEY, ch.code); } catch { /* ignore */ }
      setSignupOpen(true);
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

  // Turn it down: gone from your dashboard, and the sender is told.
  const declineInvite = async () => {
    if (!ch) return;
    setBusy(true);
    await apiFetch(`/api/challenges/${ch.code}/decline-invite`, { method: 'POST', credentials: 'include' }).catch(() => {});
    setBusy(false);
    navigate('/');
  };

  // Tapped Accept on the phone notification: accept straight away.
  const autoAccepted = React.useRef(false);
  useEffect(() => {
    if (autoAccepted.current || !ch || !isAuthenticated || isCreator || ch.open || ch.isRequest || ch.status !== 'open') return;
    if (new URLSearchParams(window.location.search).get('accept') !== '1') return;
    autoAccepted.current = true;
    void accept();
  }, [ch, isAuthenticated, isCreator]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Just signed up from this page: finish what they tapped (accept, challenge through an open
  // link, or ask the creator for a new game when the link had expired).
  const resumed = React.useRef(false);
  useEffect(() => {
    if (resumed.current || !ch || !isAuthenticated || isCreator || ch.isRequest) return;
    if (new URLSearchParams(window.location.search).get('resume') !== '1') return;
    resumed.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    if (ch.status === 'open' && !ch.open) void accept(); else void sendRequest();
  }, [ch, isAuthenticated, isCreator]);  // eslint-disable-line react-hooks/exhaustive-deps

  const colorLine = (c: ChallengeInfo) =>
    c.color === 'random' ? 'Colours chosen at random'
      : isCreator ? `You play ${c.color}`
      : `${c.creatorUsername} plays ${c.color}, you play ${c.color === 'white' ? 'black' : 'white'}`;

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
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: '#81B64C', color: '#FFFFFF' }}>
                {ch.kind === 'live' ? <Swords size={26} /> : <CalendarDays size={26} />}
              </span>
              <p className="text-[20px] font-black" style={{ color: PT.text }}>
                {ch.isRequest
                  ? (isCreator ? `${ch.requesterUsername ?? 'Someone'} wants to play you` : isRequester ? `Your challenge to ${ch.creatorUsername}` : 'Challenge request')
                  : ch.open
                    ? (isCreator ? 'Your open challenge link' : `Challenge ${ch.creatorUsername}`)
                    : isCreator ? 'Your challenge' : `${ch.creatorUsername} challenges you`}
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: PT.green }}>
                {ch.kind === 'live' ? <Zap size={14} /> : <CalendarDays size={14} />}
                {ch.kind === 'live' ? `Live · ${ch.timeControlLabel}` : `Daily · ${ch.timeControlLabel} per move`} · {ch.mode === 'ranked' ? 'Ranked' : 'Casual'}
              </p>
              <p className="mt-1 text-[12.5px]" style={{ color: PT.muted }}>{colorLine(ch)}</p>
            </div>

            {ch.isRequest ? (
              <RequestView ch={ch} isCreator={isCreator} isRequester={isRequester} busy={busy} signedIn={isAuthenticated}
                onSignIn={() => { try { localStorage.setItem(PENDING_CHALLENGE_KEY, ch.code); } catch { /* ignore */ } setSignupOpen(true); }}
                onApprove={approve} onDecline={decline} onWithdraw={withdraw}
                onGoLive={() => navigate(`/live?challenge=${ch.code}`)}
                onOpenGame={() => ch.gameId && navigate(`/daily/${ch.gameId}`)} />
            ) : ch.open && ch.status === 'open' ? (
              isCreator ? (
                <>
                  <p className="text-center text-[13px]" style={{ color: PT.muted }}>Your open link. Post it anywhere. Anyone who opens it can challenge you, and you choose who to play.</p>
                  <ShareLink url={`${window.location.origin}/challenge/${ch.code}`} text="Challenge me on ChessScout" />
                  <Link href={ch.kind === 'live' ? '/live' : '/daily'} className="block rounded-xl py-2.5 text-center text-[13px] font-bold" style={ghostBtn}>See challenge requests</Link>
                </>
              ) : (
                <>
                  <button onClick={sendRequest} disabled={busy} className="w-full rounded-xl py-3.5 text-[15px] font-extrabold disabled:opacity-60" style={greenBtn}>
                    {isAuthenticated ? (busy ? 'Sending…' : `Challenge ${ch.creatorUsername}`) : 'Sign in to challenge'}
                  </button>
                  <p className="text-center text-[12px]" style={{ color: PT.muted }}>
                    {ch.creatorUsername} gets your request and accepts to start the game.{ch.kind === 'live' ? ' Stay on the waiting screen until they do.' : " We'll notify you."}
                  </p>
                </>
              )
            ) : ch.status !== 'open' ? (
              <>
                <p className="text-center text-[13.5px]" style={{ color: PT.muted }}>
                  {ch.status === 'expired' ? 'This challenge has expired.' : ch.status === 'cancelled' ? 'This challenge was cancelled.' : ch.status === 'declined' ? 'This challenge was declined.' : 'This challenge has already been accepted.'}
                </p>
                {/* Still came to play: ask the creator for a new game, or play someone now. */}
                {!isCreator && (
                  <>
                    <button onClick={sendRequest} disabled={busy} className="w-full rounded-xl py-3.5 text-[15px] font-extrabold disabled:opacity-60" style={greenBtn}>
                      {isAuthenticated ? (busy ? 'Sending…' : `Ask ${ch.creatorUsername} for a new game`) : `Sign up free and play ${ch.creatorUsername}`}
                    </button>
                    <p className="text-center text-[12px]" style={{ color: PT.muted }}>
                      {isAuthenticated ? `${ch.creatorUsername} gets a notification and accepts to start.` : `Free, no credit card. ${ch.creatorUsername} gets your challenge as soon as you're in.`}
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Link href="/live" className="rounded-xl py-2.5 text-center text-[13px] font-bold" style={ghostBtn}>Play someone live</Link>
                      <Link href="/practice" className="rounded-xl py-2.5 text-center text-[13px] font-bold" style={ghostBtn}>Play a bot</Link>
                    </div>
                  </>
                )}
              </>
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
                {isAuthenticated && (
                  <button onClick={declineInvite} disabled={busy} className="w-full rounded-xl py-2.5 text-[13.5px] font-bold disabled:opacity-60" style={ghostBtn}>
                    Decline
                  </button>
                )}
              </>
            )}
            {error && <p className="text-center text-[13px]" style={{ color: PT.red }}>{error}</p>}
          </div>
        )}
        {!isAuthenticated && !isAuthLoading && ch && !isCreator && (
          <div className="px-2 text-center text-[12.5px] leading-relaxed" style={{ color: PT.muted }}>
            ChessScout.net is free: play live and daily games with friends, get every game reviewed, and solve unlimited puzzles.
          </div>
        )}
        {/* Always a way out of this page */}
        <div className="flex justify-center gap-2">
          <Link href="/" className="rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}>Home</Link>
          {isAuthenticated && ch && (
            <Link href={ch.kind === 'live' ? '/live' : '/daily'} className="rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}>
              {ch.kind === 'live' ? 'Live play' : 'Daily games'}
            </Link>
          )}
        </div>
      </div>
      <QuickSignup open={signupOpen} onClose={() => setSignupOpen(false)} returnTo={null}
        title={ch?.creatorUsername ? `Play ${ch.creatorUsername} on ChessScout.net` : 'Answer this challenge'}
        subtitle="Free, no credit card. Sign up and you'll go straight to this challenge." />
    </div>
  );
}

// A request made through someone's open link: the owner answers it, the
// person who sent it sees where it stands.
function RequestView({ ch, isCreator, isRequester, busy, signedIn, onSignIn, onApprove, onDecline, onWithdraw, onGoLive, onOpenGame }: {
  ch: ChallengeInfo; isCreator: boolean; isRequester: boolean; busy: boolean; signedIn: boolean; onSignIn: () => void;
  onApprove: () => void; onDecline: () => void; onWithdraw: () => void; onGoLive: () => void; onOpenGame: () => void;
}) {
  const note = (t: string) => <p className="text-center text-[13.5px]" style={{ color: PT.muted }}>{t}</p>;
  const live = ch.kind === 'live';
  if (ch.status === 'expired') return note('This request has expired.');
  if (ch.status === 'cancelled') return note(isCreator ? `${ch.requesterUsername ?? 'They'} withdrew the request.` : 'You withdrew this request.');
  if (ch.status === 'declined') return note(isCreator ? 'You declined this request.' : `${ch.creatorUsername} can't play right now.`);
  if (ch.status === 'accepted') {
    return (
      <>
        {note('This game has started.')}
        {!live && ch.gameId && <button onClick={onOpenGame} className="w-full rounded-xl py-3 text-[14px] font-extrabold" style={greenBtn}>Open the game</button>}
      </>
    );
  }
  if (isCreator) {
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onDecline} disabled={busy} className="rounded-xl py-3.5 text-[15px] font-extrabold disabled:opacity-60" style={ghostBtn}>Decline</button>
          <button onClick={onApprove} disabled={busy} className="rounded-xl py-3.5 text-[15px] font-extrabold disabled:opacity-60" style={greenBtn}>{busy ? 'Starting…' : 'Accept'}</button>
        </div>
        {note(live ? 'Accepting opens Live play; the game starts as soon as you\'re both there.' : 'Accepting starts the daily game now.')}
      </>
    );
  }
  if (isRequester) {
    return (
      <>
        {ch.status === 'approved'
          ? note(`${ch.creatorUsername} accepted! Go to Live play to start.`)
          : note(live ? `Waiting for ${ch.creatorUsername} to accept. Wait on Live play so the game can start straight away.` : `Waiting for ${ch.creatorUsername} to accept. We'll notify you.`)}
        {live && <button onClick={onGoLive} className="w-full rounded-xl py-3 text-[14px] font-extrabold" style={greenBtn}>{ch.status === 'approved' ? 'Play now' : 'Wait on Live play'}</button>}
        <button onClick={onWithdraw} disabled={busy} className="w-full rounded-xl py-2.5 text-[13px] font-bold disabled:opacity-60" style={ghostBtn}>Withdraw request</button>
      </>
    );
  }
  if (!signedIn) {
    return (
      <>
        {note('Sign in to see and answer this challenge request.')}
        <button onClick={onSignIn} className="w-full rounded-xl py-3 text-[14px] font-extrabold" style={greenBtn}>Sign in</button>
      </>
    );
  }
  return note('This request is between other players. If it was sent to you, make sure you are signed in to the right account.');
}
