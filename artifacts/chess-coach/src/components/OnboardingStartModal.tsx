import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';

const CHESSCOM_GREEN = '#81b64c';
const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const BORDER = 'rgba(255,255,255,0.08)';

interface OnboardingStartModalProps {
  username: string;
  platform: 'chesscom' | 'lichess';
  onDone: () => void;
}

/**
 * Kicks off the game import + background review, then offers a quick bot
 * game while the user waits — sets their starting Scout ELO in the
 * process. "Skip" doesn't cancel the import/review; it just lets the user
 * head to the dashboard while it keeps running in the background.
 */
export function OnboardingStartModal({ username, platform, onDone }: OnboardingStartModalProps) {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await apiFetch('/api/games/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, platform, months: 3 }),
        });
        await apiFetch('/api/games/review-all', { method: 'POST', credentials: 'include' });
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [username, platform]);

  const playNow = () => {
    onDone();
    navigate('/practice-bots?onboarding=true');
  };

  const skip = () => {
    onDone();
    navigate('/', { replace: true } as never);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 md:p-8 space-y-5 text-center"
        style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 18px 50px rgba(0,0,0,0.45)' }}>
        <div className="text-4xl">♟</div>
        <div>
          <h2 className="text-xl font-black mb-2" style={{ color: TEXT_LIGHT }}>Setting up your account</h2>
          <p className="text-sm leading-relaxed" style={{ color: TEXT_MUTED }}>
            {status === 'error'
              ? "We're pulling your recent games and analyzing them now — this can take a minute. You can head to your dashboard and check back shortly."
              : "We're pulling your last 20 games and running a full analysis in the background — usually takes a minute or two."}
          </p>
        </div>

        <div className="rounded-xl p-4 text-left" style={{ background: 'rgba(129,182,76,0.08)', border: '1px solid rgba(129,182,76,0.2)' }}>
          <p className="text-sm font-bold mb-1" style={{ color: CHESSCOM_GREEN }}>While you wait</p>
          <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
            Play a quick game against Mia (1200 ELO) to set your starting Scout ELO — takes just a few minutes.
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={playNow}
            className="w-full py-3 rounded-xl font-black text-sm"
            style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, color: 'white' }}
          >
            Play Mia Now
          </button>
          <button
            onClick={skip}
            className="w-full text-xs font-bold uppercase tracking-widest"
            style={{ color: TEXT_MUTED }}
          >
            Skip — take me to my dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
