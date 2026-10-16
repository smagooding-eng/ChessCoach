import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { startOnboardingImport } from '@/lib/onboardingImport';
import { trackFunnelEvent } from '@/lib/funnelTracking';
import { Check } from 'lucide-react';
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
      onError: fail,
    }).catch((err) => fail(err instanceof Error ? err.message : 'Something went wrong importing your games.'));
  }, [status, username, platform]);

  const finish = () => {
    trackFunnelEvent('onboarding_finished');
    onDone();
    navigate('/', { replace: true } as never);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-[22px] p-6 md:p-8 space-y-5 text-center"
        style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
        {status === 'ready' ? (
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-[16px]" style={{ background: '#81B64C', color: '#FFFFFF' }}><Check size={30} strokeWidth={3} /></div>
        ) : (
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-[16px]" style={{ background: '#81B64C' }}>
            <div className="h-7 w-7 rounded-full border-[3px] animate-spin" style={{ borderColor: '#FFFFFF transparent #FFFFFF #FFFFFF' }} />
          </div>
        )}
        <div>
          <h2 className="text-xl font-black mb-2" style={{ color: TEXT_LIGHT }}>
            {status === 'ready' ? "You're all set!" : 'Setting up your account'}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: TEXT_MUTED }}>
            {status === 'ready'
              ? "Your games are imported and we're reviewing them now — check your dashboard in a couple minutes for your first weaknesses."
              : "We're pulling your last 20 games and running a full analysis in the background — usually takes a minute or two."}
          </p>
        </div>

        <button
          onClick={finish}
          className="w-full py-3.5 rounded-[14px] font-extrabold text-[15px]"
          style={BTN}
        >
          Go to my dashboard
        </button>
        <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Your games keep importing in the background.</p>
      </div>
    </div>
  );
}
