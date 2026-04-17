import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/use-user';
import { invalidateEloCache } from '@/hooks/use-elo-progress';
import { apiFetch } from '@/lib/api';
import {
  AlertTriangle, Loader2, Sparkles, ArrowRight, X,
} from 'lucide-react';

const ONBOARDING_KEY = 'chessscout_onboarding_v2';

const G = '#81b64c';
const BG = '#1a1816';
const CARD = '#262421';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';

const LOADING_MESSAGES = [
  "Analyzing your last games...",
  "Detecting patterns in your losses...",
  "Finding your biggest weakness...",
  "Building your personal report...",
];

type Step = 'import' | 'loading' | 'aha';
type Platform = 'chesscom' | 'lichess';

interface Insight {
  headline: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  metric?: string;
}

interface InsightsResponse {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  insights: Insight[];
}

const SEV_BG: Record<string, string> = {
  high: 'linear-gradient(135deg, rgba(220,67,67,0.18) 0%, rgba(220,67,67,0.04) 100%)',
  medium: 'linear-gradient(135deg, rgba(234,151,51,0.18) 0%, rgba(234,151,51,0.04) 100%)',
  low: 'linear-gradient(135deg, rgba(129,182,76,0.18) 0%, rgba(129,182,76,0.04) 100%)',
};
const SEV_BORDER: Record<string, string> = {
  high: 'rgba(220,67,67,0.35)',
  medium: 'rgba(234,151,51,0.35)',
  low: 'rgba(129,182,76,0.35)',
};
const SEV_ACCENT: Record<string, string> = {
  high: '#dc4343',
  medium: '#ea9733',
  low: G,
};

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { authUser, login, refreshAuth } = useUser();
  const [step, setStep] = useState<Step>('import');
  const [platform, setPlatform] = useState<Platform>('chesscom');
  const [importUsername, setImportUsername] = useState(authUser?.chesscomUsername ?? authUser?.lichessUsername ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => () => { cancelledRef.current = true; }, []);

  // Loading message rotation + fake progress
  useEffect(() => {
    if (step !== 'loading') return;
    setLoadingMsgIdx(0);
    setProgress(0);
    const msgIv = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1500);
    const progIv = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.random() * 6 : p));
    }, 400);
    return () => { clearInterval(msgIv); clearInterval(progIv); };
  }, [step]);

  const startImport = useCallback(async () => {
    const name = importUsername.trim();
    if (!name) { setError('Please enter a username'); return; }
    setError(null);
    setStep('loading');

    try {
      const importRes = await apiFetch('/api/games/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: name,
          months: 3,
          platform,
          ownerUsername: name,
        }),
      });
      if (!importRes.ok) {
        const j = await importRes.json().catch(() => ({}));
        throw new Error(j.error || `Import failed (${importRes.status})`);
      }

      // Save username locally so the rest of the app uses it
      login(name);

      // Refresh auth so chesscomUsername / lichessUsername are picked up
      try { await refreshAuth(); } catch {}
      invalidateEloCache();

      // Fetch insights
      const insightsRes = await apiFetch(
        `/api/onboarding/insights?username=${encodeURIComponent(name)}&platform=${platform}`,
        { credentials: 'include' },
      );
      if (!insightsRes.ok) throw new Error('Failed to compute insights');
      const data = (await insightsRes.json()) as InsightsResponse;

      if (cancelledRef.current) return;
      setProgress(100);
      setInsights(data);
      // Brief pause so the progress bar visually completes
      setTimeout(() => {
        if (!cancelledRef.current) setStep('aha');
      }, 500);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setStep('import');
    }
  }, [importUsername, platform, login, refreshAuth]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: BG }}
    >
      <div className="w-full max-w-xl">
        <AnimatePresence mode="wait">
          {step === 'import' && (
            <motion.div
              key="import"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
                style={{ background: `${G}1a`, border: `1px solid ${G}33` }}>
                <Sparkles className="w-7 h-7" style={{ color: G }} />
              </div>
              <h1 className="text-3xl md:text-4xl font-black mb-3 leading-tight" style={{ color: TEXT }}>
                Find your biggest mistakes in 30 seconds
              </h1>
              <p className="text-base md:text-lg mb-8" style={{ color: MUTED }}>
                We'll analyze your recent games and show you exactly where you're losing.
              </p>

              <div className="rounded-2xl p-6 md:p-7 mb-4" style={{ background: CARD, border: `1px solid rgba(255,255,255,0.06)` }}>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setPlatform('chesscom')}
                    className="flex-1 py-2.5 rounded-lg font-bold text-sm transition-all"
                    style={{
                      background: platform === 'chesscom' ? `${G}1f` : 'rgba(255,255,255,0.04)',
                      color: platform === 'chesscom' ? G : MUTED,
                      border: `1px solid ${platform === 'chesscom' ? `${G}55` : 'transparent'}`,
                    }}
                  >
                    Chess.com
                  </button>
                  <button
                    onClick={() => setPlatform('lichess')}
                    className="flex-1 py-2.5 rounded-lg font-bold text-sm transition-all"
                    style={{
                      background: platform === 'lichess' ? `${G}1f` : 'rgba(255,255,255,0.04)',
                      color: platform === 'lichess' ? G : MUTED,
                      border: `1px solid ${platform === 'lichess' ? `${G}55` : 'transparent'}`,
                    }}
                  >
                    Lichess
                  </button>
                </div>

                <input
                  type="text"
                  value={importUsername}
                  onChange={(e) => setImportUsername(e.target.value)}
                  placeholder={`Your ${platform === 'chesscom' ? 'Chess.com' : 'Lichess'} username`}
                  className="w-full px-4 py-3.5 rounded-xl text-base outline-none transition-all mb-3 text-center font-semibold"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '2px solid rgba(255,255,255,0.08)',
                    color: TEXT,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = G)}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                  onKeyDown={(e) => { if (e.key === 'Enter') startImport(); }}
                  autoFocus
                />

                {error && (
                  <div className="mb-3 p-2.5 rounded-lg text-sm" style={{ background: 'rgba(220,67,67,0.1)', border: '1px solid rgba(220,67,67,0.25)', color: '#ef6b6b' }}>
                    {error}
                  </div>
                )}

                <button
                  onClick={startImport}
                  disabled={!importUsername.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-base transition-all disabled:opacity-50"
                  style={{ background: G, color: '#fff' }}
                  onMouseEnter={(e) => { if (importUsername.trim()) e.currentTarget.style.background = '#6fa23e'; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = G)}
                >
                  Import from {platform === 'chesscom' ? 'Chess.com' : 'Lichess'}
                  <ArrowRight className="w-5 h-5" />
                </button>

                <p className="text-xs mt-3" style={{ color: MUTED }}>
                  No login required. Takes ~10 seconds.
                </p>
              </div>
            </motion.div>
          )}

          {step === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
                style={{ background: `${G}1a`, border: `1px solid ${G}33` }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: G }} />
              </div>

              <AnimatePresence mode="wait">
                <motion.h2
                  key={loadingMsgIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="text-xl md:text-2xl font-bold mb-8"
                  style={{ color: TEXT }}
                >
                  {LOADING_MESSAGES[loadingMsgIdx]}
                </motion.h2>
              </AnimatePresence>

              <div className="max-w-sm mx-auto">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: G, width: `${progress}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-xs mt-3 font-mono" style={{ color: MUTED }}>
                  {Math.round(progress)}%
                </p>
              </div>
            </motion.div>
          )}

          {step === 'aha' && insights && (
            <motion.div
              key="aha"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="text-center mb-6">
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: G }}>
                  Analysis Complete
                </p>
                <h1 className="text-3xl md:text-4xl font-black leading-tight" style={{ color: TEXT }}>
                  Here's what's holding you back
                </h1>
                <p className="text-sm mt-2" style={{ color: MUTED }}>
                  Based on {insights.totalGames} recent {insights.totalGames === 1 ? 'game' : 'games'}.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                {insights.insights.map((ins, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.12, duration: 0.3 }}
                    className="rounded-2xl p-5 md:p-6"
                    style={{
                      background: SEV_BG[ins.severity],
                      border: `1px solid ${SEV_BORDER[ins.severity]}`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ background: `${SEV_ACCENT[ins.severity]}22` }}
                      >
                        <AlertTriangle className="w-5 h-5" style={{ color: SEV_ACCENT[ins.severity] }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg md:text-xl font-black leading-tight mb-1.5" style={{ color: TEXT }}>
                          {ins.headline}
                        </p>
                        <p className="text-sm" style={{ color: MUTED }}>
                          {ins.detail}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + insights.insights.length * 0.12 }}
                onClick={onComplete}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base transition-all"
                style={{ background: G, color: '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#6fa23e')}
                onMouseLeave={(e) => (e.currentTarget.style.background = G)}
              >
                See how to fix this
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Custom event name so multiple useOnboardingCheck() consumers stay in sync
const ONBOARDING_EVENT = 'chessscout:onboarding-changed';

export function useOnboardingCheck() {
  const { isAuthenticated, isAuthLoading, authUser } = useUser();
  const userKey = authUser?.id ? `${ONBOARDING_KEY}_${authUser.id}` : null;

  const computeShow = useCallback(() => {
    if (isAuthLoading || !isAuthenticated || !userKey) return false;
    return !localStorage.getItem(userKey);
  }, [isAuthenticated, isAuthLoading, userKey]);

  const [show, setShow] = useState(computeShow);

  useEffect(() => {
    setShow(computeShow());
    const handler = () => setShow(computeShow());
    window.addEventListener(ONBOARDING_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(ONBOARDING_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, [computeShow]);

  const dismissOnboarding = useCallback(() => {
    if (userKey) localStorage.setItem(userKey, 'done');
    setShow(false);
    window.dispatchEvent(new Event(ONBOARDING_EVENT));
  }, [userKey]);

  return { showOnboarding: show, dismissOnboarding };
}
