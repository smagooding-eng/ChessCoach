import { BoardSetupCard, markSetupSeen } from '@/components/BoardSetupCard';
import { useUser } from '@/hooks/use-user';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { startOnboardingImport } from '@/lib/onboardingImport';
import { trackFunnelEvent } from '@/lib/funnelTracking';
import { Bell, Check, ChevronRight, Puzzle as PuzzleIcon } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { EXTENSION_URL } from '@/lib/extension';
import { RD } from '@/lib/redesignTheme';

const LOGO = `${import.meta.env.BASE_URL}images/logo.svg`;
const BTN: React.CSSProperties = { background: '#81B64C', color: '#FFFFFF' };

const CHESSCOM_GREEN = '#81B64C';
// Current app theme (redesign palette; CSS-variable surfaces follow the
// chosen backdrop).
const BG_CARD = RD.cardSolid;
const TEXT_LIGHT = RD.text;
const TEXT_MUTED = RD.muted;
const BORDER = RD.border;

interface OnboardingStartModalProps {
  username: string | null;
  platform: 'chesscom' | 'lichess';
  onDone: () => void;
}

/**
 * Always shown right after registration, regardless of whether a chess
 * platform username was provided at signup — if not, it asks for one
 * inline before proceeding, so this is a single reliable trigger point
 * rather than depending on a separate step being completed first.
 * Kicks off the game import + background review, then sends the player to
 * their dashboard (the import/review keep running in the background).
 */
export function OnboardingStartModal({ username: initialUsername, platform: initialPlatform, onDone }: OnboardingStartModalProps) {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<'need-username' | 'starting' | 'ready'>(
    initialUsername ? 'starting' : 'need-username'
  );
  const [usernameInput, setUsernameInput] = useState('');
  const [platform, setPlatform] = useState<'chesscom' | 'lichess'>(initialPlatform);
  const [username, setUsername] = useState<string | null>(initialUsername);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  // The board set-up card no longer comes first: it showed before a new member had seen
  // anything of theirs. They get it later, when they open a game lobby ("Before you play").
  const [setupDone, setSetupDone] = useState(true);
  const { authUser } = useUser();
  // The full review of their games (runs on the server): followed here to show progress.
  const [reviewJob, setReviewJob] = useState<string | null>(null);
  const [review, setReview] = useState<{ done: number; total: number; finished: boolean } | null>(null);
  useEffect(() => {
    if (!reviewJob) return;
    let stop = false;
    const tick = async () => {
      const r = await apiFetch(`/api/games/review-all-status/${reviewJob}`, { credentials: 'include' }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => null) as { status?: string; reviewedSoFar?: number; total?: number } | null : null;
      if (stop) return;
      if (d) setReview({ done: Number(d.reviewedSoFar ?? 0), total: Number(d.total ?? 0), finished: d.status === 'done' || d.status === 'completed' });
      if (!d || (d.status !== 'done' && d.status !== 'completed' && d.status !== 'error')) setTimeout(tick, 3000);
    };
    void tick();
    return () => { stop = true; };
  }, [reviewJob]);
  const push = usePushNotifications();
  const notifyOn = push.permission === 'granted' && push.isSubscribed;
  const canAsk = !notifyOn && push.permission !== 'denied' && push.permission !== 'unsupported';
  const desktop = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches && !/Android|iPhone|iPad/i.test(navigator.userAgent);

  const submitUsername = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      setLinkError('Enter a username so we can pull your games.');
      return;
    }
    setLinking(true);
    setLinkError(null);
    try {
      const body: Record<string, string> = platform === 'chesscom' ? { chesscomUsername: trimmed } : { lichessUsername: trimmed };
      const res = await apiFetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setUsername(trimmed);
      setImportErrorMessage(null);
      setStatus('starting');
    } catch {
      setLinkError('Failed to save — please try again.');
    } finally {
      setLinking(false);
    }
  };

  // Start the import (and the review after it). It carries on in the
  // background if the player leaves this screen; we only follow it here to
  // show "all set" or ask again if the username was wrong.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    if (status !== 'starting' || !username) return;
    const fail = (message: string) => {
      if (!mounted.current) return;
      setImportErrorMessage(message);
      setUsernameInput(username);
      setStatus('need-username');
    };
    startOnboardingImport(username, platform, {
      onReady: () => { if (mounted.current) setStatus('ready'); },
      onReviewJob: (id) => { if (mounted.current) setReviewJob(id); },
      onError: fail,
    }).catch((err) => fail(err instanceof Error ? err.message : 'Something went wrong importing your games.'));
  }, [status, username, platform]);

  // The first day's moment of value: their own latest game, reviewed, straight away (not
  // "check your dashboard in a couple of minutes"). Found once the import is ready.
  const [latest, setLatest] = useState<{ id: number; opp: string } | null>(null);
  useEffect(() => {
    if (status !== 'ready') return;
    void apiFetch('/api/games?limit=1', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const g = d?.games?.[0] as { id: number; whiteUsername?: string; blackUsername?: string } | undefined;
      if (!g || !mounted.current) return;
      const me = (username ?? '').toLowerCase();
      setLatest({ id: g.id, opp: (g.whiteUsername ?? '').toLowerCase() === me ? (g.blackUsername ?? 'your opponent') : (g.whiteUsername ?? 'your opponent') });
    }).catch(() => {});
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = () => {
    trackFunnelEvent('onboarding_finished');
    onDone();
    navigate('/', { replace: true } as never);
  };
  const reviewLatest = () => {
    if (!latest) return finish();
    trackFunnelEvent('onboarding_finished');
    onDone();
    navigate(`/games/${latest.id}?review=1&first=1`, { replace: true } as never);
  };

  if (status === 'need-username') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
        <div className="w-full max-w-md rounded-[22px] p-6 md:p-8 space-y-5 text-center"
          style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
          <img src={LOGO} alt="" className="mx-auto h-14 w-14" />
          <div>
            <h2 className="text-xl font-black mb-2" style={{ color: TEXT_LIGHT }}>
              {importErrorMessage ? "Let's try that again" : 'One quick thing'}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: TEXT_MUTED }}>
              {importErrorMessage
                ? `${importErrorMessage} Double check the username below, or try the other platform.`
                : 'Tell us where you play so we can pull your games and start analyzing them.'}
            </p>
          </div>

          <div className="flex gap-1 p-1 rounded-lg justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
            {(['chesscom', 'lichess'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className="px-4 py-1.5 rounded-md text-xs font-bold transition-colors"
                style={platform === p ? { background: CHESSCOM_GREEN, color: '#FFFFFF' } : { color: TEXT_MUTED }}
              >
                {p === 'chesscom' ? 'Chess.com' : 'Lichess'}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitUsername(); }}
            placeholder={platform === 'chesscom' ? 'e.g. Hikaru' : 'e.g. DrNykterstein'}
            autoFocus
            className="w-full px-3 py-2.5 rounded-lg text-sm font-bold outline-none text-center"
            style={{ background: 'rgba(255,255,255,0.05)', color: TEXT_LIGHT, border: `1px solid ${BORDER}` }}
          />

          {linkError && (
            <p className="text-xs" style={{ color: RD.red }}>{linkError}</p>
          )}

          <button
            onClick={submitUsername}
            disabled={linking}
            className="w-full py-3.5 rounded-[14px] font-extrabold text-[15px] disabled:opacity-50"
            style={BTN}
          >
            {linking ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  // While the games import (and until they've finished it): the board & play set-up.
  if (!setupDone) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto px-3 py-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
        <div className="mx-auto w-full max-w-md">
          <BoardSetupCard mode="first" progress={status === 'ready' ? 'ready' : 'importing'} onDone={() => { markSetupSeen(authUser?.id); setSetupDone(true); }} />
        </div>
      </div>
    );
  }

  // "Your coach is getting to work": what's happening with their games, the one
  // ask that matters (notifications, so the report brings them back), and their
  // last game's deciding move as the first thing to look at.
  const step = (state: 'done' | 'now' | 'wait', title: string, detail: string) => (
    <div className="flex items-start gap-3 text-left">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: state === 'done' ? '#81B64C' : 'rgba(255,255,255,.08)' }}>
        {state === 'done' ? <Check size={14} strokeWidth={3} color="#fff" />
          : state === 'now' ? <span className="h-3.5 w-3.5 rounded-full border-2 animate-spin" style={{ borderColor: '#81B64C transparent #81B64C #81B64C' }} />
          : <span className="h-1.5 w-1.5 rounded-full" style={{ background: TEXT_MUTED }} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-extrabold" style={{ color: state === 'wait' ? TEXT_MUTED : TEXT_LIGHT }}>{title}</span>
        <span className="block text-[12.5px] leading-snug" style={{ color: TEXT_MUTED }}>{detail}</span>
      </span>
    </div>
  );
  const imported = status === 'ready';
  const reviewed = !!review?.finished;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-6" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-[22px] p-6 md:p-7 space-y-5"
        style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
        <div className="text-center">
          <h2 className="text-xl font-black" style={{ color: TEXT_LIGHT }}>Your coach is getting to work</h2>
          <p className="mt-1 text-[13px]" style={{ color: TEXT_MUTED }}>This keeps going if you leave this screen.</p>
        </div>
        <div className="space-y-3.5">
          {step(imported ? 'done' : 'now', imported ? 'Your games are in' : 'Bringing in your games', imported ? `Your recent ${platform === 'chesscom' ? 'Chess.com' : 'Lichess'} games, ready to review.` : 'Usually under a minute.')}
          {step(reviewed ? 'done' : imported ? 'now' : 'wait', 'Reviewing every game',
            review && review.total > 0 ? (reviewed ? `All ${review.total} reviewed.` : `${review.done} of ${review.total} done. Every move checked by the engine.`) : 'Every move checked by the engine.')}
          {step(reviewed ? 'done' : 'wait', 'Building your report', 'Your strengths, your weak spots, and what to train first.')}
        </div>

        {canAsk && (
          <div className="rounded-[16px] p-3.5" style={{ background: 'rgba(129,182,76,.10)', border: '1px solid rgba(129,182,76,.3)' }}>
            <p className="text-[14px] font-extrabold" style={{ color: TEXT_LIGHT }}>Get told when your report is ready</p>
            <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: TEXT_MUTED }}>Reviewing all your games takes a little while. We'll notify you when it's done, and each time a new game of yours is reviewed.</p>
            <button onClick={() => { void push.subscribe(); }} disabled={push.loading} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[12px] py-2.5 text-[14px] font-extrabold disabled:opacity-60" style={BTN}>
              <Bell size={15} /> Turn on notifications
            </button>
          </div>
        )}
        {notifyOn && (
          <p className="flex items-center gap-2 text-[13px] font-bold" style={{ color: '#95C45A' }}><Check size={15} strokeWidth={3} /> We'll let you know when your report is ready.</p>
        )}
        {desktop && platform === 'chesscom' && (
          <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-[14px] px-3.5 py-3" style={{ background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER}` }}>
            <PuzzleIcon size={18} style={{ color: '#81B64C' }} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-extrabold" style={{ color: TEXT_LIGHT }}>Add the Chrome extension</span>
              <span className="block text-[12px] leading-snug" style={{ color: TEXT_MUTED }}>Review each Chess.com game right where you play it.</span>
            </span>
            <ChevronRight size={16} style={{ color: TEXT_MUTED }} />
          </a>
        )}

        <button onClick={reviewLatest} disabled={!imported || !latest} className="w-full py-3.5 rounded-[14px] font-extrabold text-[15px] disabled:opacity-60" style={BTN}>
          {imported && latest ? 'See the move that decided your last game' : 'Getting your last game\u2026'}
        </button>
        <button onClick={finish} className="block w-full text-center text-[13px] font-bold underline" style={{ color: TEXT_MUTED }}>Go to my dashboard instead</button>
      </div>
    </div>
  );
}
