import { useEffect, useState } from 'react';
import { RD } from '@/lib/redesignTheme';
import { useLocation } from 'wouter';
import { Swords } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { OnboardingStartModal } from '@/components/OnboardingStartModal';
import { startOnboardingImport } from '@/lib/onboardingImport';
import { startBackgroundImport } from '@/lib/autoImport';
import { ScoutUsernameInput, saveScoutUsername, type ScoutNameStatus } from '@/components/ScoutUsernameInput';

const PENDING_CHALLENGE_KEY = 'cs_pending_challenge';

function readPendingChallenge(): string | null {
  try { return localStorage.getItem(PENDING_CHALLENGE_KEY); } catch { return null; }
}

const CHESSCOM_GREEN = '#81B64C';
// Current app theme (redesign palette; surfaces follow the chosen backdrop).
const BG_DARK = RD.bg;
const BG_CARD = RD.card;
const TEXT_LIGHT = RD.text;
const TEXT_MUTED = RD.muted;
const BORDER = RD.border;
const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', color: RD.text, border: `1px solid ${RD.border}` };

export function Welcome() {
  const { authUser, refreshAuth, login } = useUser();
  const [chesscom, setChesscom] = useState('');
  const [lichess, setLichess] = useState('');
  const [scoutName, setScoutName] = useState(() => authUser?.scoutUsername ?? '');
  const [scoutStatus, setScoutStatus] = useState<ScoutNameStatus>('empty');
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
    const sn = scoutName.trim();
    if (!cc && !lc && !sn) {
      setError('Link Chess.com or Lichess, or pick a ChessScout.net username.');
      return;
    }
    if (sn && scoutStatus === 'bad') {
      setError('Pick a different ChessScout.net username.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (sn && sn !== authUser?.scoutUsername) {
        const err = await saveScoutUsername(sn);
        if (err) throw new Error(err);
      }
      if (!cc && !lc) {
        // No games to import: straight into the app (or the waiting challenge).
        await refreshAuth();
        if (pendingCode) {
          try { localStorage.removeItem(PENDING_CHALLENGE_KEY); } catch { /* ignore */ }
          navigate(`/challenge/${pendingCode}`, { replace: true } as never);
        } else {
          navigate('/', { replace: true } as never);
        }
        return;
      }
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
      // Both accounts linked: the setup below imports Chess.com, so bring in
      // the Lichess games alongside it.
      if (cc && lc) void startBackgroundImport('lichess', lc, 3);
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
      <div className="w-full max-w-md rounded-[22px] p-6 md:p-8 space-y-5"
        style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div className="space-y-2 text-center">
          <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" className="mx-auto h-14 w-14" />
          <h1 className="text-xl font-black" style={{ color: TEXT_LIGHT }}>
            Welcome{authUser?.firstName ? `, ${authUser.firstName}` : ''}!
          </h1>
          <p className="text-sm" style={{ color: TEXT_MUTED }}>
            Link your Chess.com or Lichess account so your coach can start on your real games. You can also pick a ChessScout.net username.
          </p>
        </div>

        {pendingCode && (
          <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.10)' }}>
            <Swords className="h-5 w-5 shrink-0" style={{ color: CHESSCOM_GREEN }} />
            <p className="text-[13px]" style={{ color: TEXT_LIGHT }}>
              {challenger ? <><b>{challenger.name}</b> challenged you to a {challenger.what}.</> : 'You have a challenge waiting.'} Pick a username and we'll take you straight to it.
            </p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl p-3" style={{ background: 'rgba(129,182,76,0.10)', border: '1px solid rgba(129,182,76,0.35)' }}>
            <p className="text-[13.5px] font-extrabold" style={{ color: TEXT_LIGHT }}>Where do you play?</p>
            <p className="mt-0.5 text-[12px]" style={{ color: TEXT_MUTED }}>Add your Chess.com or Lichess name and we'll import your games and start reviewing them right away.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest" style={{ color: TEXT_MUTED }}>
              Chess.com username
            </label>
            <input
              type="text"
              value={chesscom}
              autoFocus
              onChange={(e) => setChesscom(e.target.value)}
              placeholder="e.g. Hikaru"
              className="w-full px-3 py-2.5 rounded-[10px] text-sm font-bold outline-none"
              style={INPUT}
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
              className="w-full px-3 py-2.5 rounded-[10px] text-sm font-bold outline-none"
              style={INPUT}
            />
          </div>


          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1" style={{ background: BORDER }} />
            <span className="text-[10.5px] font-black uppercase tracking-widest" style={{ color: TEXT_MUTED }}>Your name on ChessScout.net</span>
            <div className="h-px flex-1" style={{ background: BORDER }} />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest" style={{ color: TEXT_MUTED }}>
              ChessScout.net username
            </label>
            <ScoutUsernameInput value={scoutName} onChange={setScoutName} onStatus={setScoutStatus} current={authUser?.scoutUsername} inputStyle={INPUT} textColor={RD.text} mutedColor={RD.muted} />
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
              {chesscom.trim() || lichess.trim()
                ? 'Optional when you link an account. You can set it later from Profile.'
                : 'Required if you skip Chess.com and Lichess. This is your name on ChessScout.net.'}
            </p>
          </div>

          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
            No Chess.com or Lichess? Just pick a username. You can link accounts later from Profile.
          </p>

          {error && (
            <div className="rounded-lg p-2.5 text-xs" style={{ background: 'rgba(255,80,88,0.14)', color: '#FFFFFF', border: '1px solid rgba(255,80,88,0.4)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 rounded-[14px] font-extrabold text-[15px] disabled:opacity-50"
            style={{ background: CHESSCOM_GREEN, color: '#FFFFFF' }}
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
