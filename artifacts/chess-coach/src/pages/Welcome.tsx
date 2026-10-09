import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Swords } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { OnboardingStartModal } from '@/components/OnboardingStartModal';
import { startOnboardingImport } from '@/lib/onboardingImport';

const PENDING_CHALLENGE_KEY = 'cs_pending_challenge';

function readPendingChallenge(): string | null {
  try { return localStorage.getItem(PENDING_CHALLENGE_KEY); } catch { return null; }
}

const CHESSCOM_GREEN = '#81b64c';
const BG_DARK = '#262421';
const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const BORDER = 'rgba(255,255,255,0.08)';

export function Welcome() {
  const { authUser, refreshAuth, login } = useUser();
  const [chesscom, setChesscom] = useState('');
  const [lichess, setLichess] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<{ username: string; platform: 'chesscom' | 'lichess' } | null>(null);
  const [, navigate] = useLocation();
  // Signed up from someone's challenge link: show it here, then go straight
  // back to it (no tour). It's also saved to their home/Play screens.
  const [pendingCode] = useState<string | null>(() => readPendingChallenge());
  const [challenger, setChallenger] = useState<{ name: string; what: string } | null>(null);
  useEffect(() => {
    if (!pendingCode) return;
    apiFetch(`/api/challenges/${pendingCode}`).then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      const c = d.challenge;
      if (c) setChallenger({ name: c.creatorUsername, what: c.kind === 'live' ? `${c.timeControlLabel} live game` : `daily game (${c.timeControlLabel} per move)` });
    }).catch(() => {});
    apiFetch(`/api/challenges/${pendingCode}/seen`, { method: 'POST' }).catch(() => {});
  }, [pendingCode]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cc = chesscom.trim();
    const lc = lichess.trim();
    if (!cc && !lc) {
      setError('Enter at least one username so we can pull your games.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (cc) body.chesscomUsername = cc;
      if (lc) body.lichessUsername = lc;
      const res = await apiFetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      if (cc) login(cc);
      if (pendingCode) {
        // Import in the background and go straight to the challenge.
        await startOnboardingImport(cc || lc, cc ? 'chesscom' : 'lichess');
        await refreshAuth();
        try { localStorage.removeItem(PENDING_CHALLENGE_KEY); } catch { /* ignore */ }
        navigate(`/challenge/${pendingCode}`, { replace: true } as never);
        return;
      }
      await refreshAuth();
      setOnboarding({ username: cc || lc, platform: cc ? 'chesscom' : 'lichess' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: BG_DARK }}>
      <div className="w-full max-w-md rounded-2xl p-6 md:p-8 space-y-5"
        style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 18px 50px rgba(0,0,0,0.45)' }}>
        <div className="space-y-2 text-center">
          <div className="text-4xl">♚</div>
          <h1 className="text-xl font-black" style={{ color: TEXT_LIGHT }}>
            Welcome{authUser?.firstName ? `, ${authUser.firstName}` : ''}!
          </h1>
          <p className="text-sm" style={{ color: TEXT_MUTED }}>
            Tell us where you play. We'll import your games so we can analyze your style and coach you.
          </p>
        </div>

        {pendingCode && (
          <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'rgba(129,182,76,0.1)', border: '1px solid rgba(129,182,76,0.35)' }}>
            <Swords className="h-5 w-5 shrink-0" style={{ color: CHESSCOM_GREEN }} />
            <p className="text-[13px]" style={{ color: TEXT_LIGHT }}>
              {challenger ? <><b>{challenger.name}</b> challenged you to a {challenger.what}.</> : 'You have a challenge waiting.'} Enter your username and we'll take you straight to it.
            </p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest" style={{ color: TEXT_MUTED }}>
              Chess.com username
            </label>
            <input
              type="text"
              value={chesscom}
              onChange={(e) => setChesscom(e.target.value)}
              placeholder="e.g. Hikaru"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm font-bold outline-none"
              style={{ background: 'rgba(0,0,0,0.3)', color: TEXT_LIGHT, border: `1px solid ${BORDER}` }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest" style={{ color: TEXT_MUTED }}>
              Lichess username
            </label>
            <input
              type="text"
              value={lichess}
              onChange={(e) => setLichess(e.target.value)}
              placeholder="e.g. DrNykterstein"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-bold outline-none"
              style={{ background: 'rgba(0,0,0,0.3)', color: TEXT_LIGHT, border: `1px solid ${BORDER}` }}
            />
          </div>

          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
            You only need one. You can change or add the other later from Profile.
          </p>

          {error && (
            <div className="rounded-lg p-2.5 text-xs" style={{ background: 'rgba(220,67,67,0.35)', color: '#ffffff', border: '1px solid rgba(220,67,67,0.6)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl font-black text-sm disabled:opacity-50"
            style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, color: 'white' }}
          >
            {saving ? 'Saving…' : pendingCode ? 'Continue to the challenge' : 'Continue'}
          </button>
        </form>
      </div>

      {onboarding && (
        <OnboardingStartModal
          username={onboarding.username}
          platform={onboarding.platform}
          onDone={() => setOnboarding(null)}
        />
      )}
    </div>
  );
}
