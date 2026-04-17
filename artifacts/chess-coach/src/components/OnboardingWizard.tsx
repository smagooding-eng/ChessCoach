import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/use-user';
import { invalidateEloCache } from '@/hooks/use-elo-progress';
import { apiFetch } from '@/lib/api';
import {
  AlertTriangle, Loader2, Sparkles, ArrowRight, Camera, Brain, Bot,
  Target, Trophy, Swords, Compass, Check, ChevronRight,
} from 'lucide-react';

const ONBOARDING_KEY = 'chessscout_onboarding_v2';

const G = '#81b64c';
const BG = '#1a1816';
const CARD = '#262421';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';

const LOADING_MESSAGES = [
  "Pulling your last games...",
  "Detecting patterns in your losses...",
  "Finding your biggest weakness...",
  "Building your personal report...",
];

type Step = 'goal' | 'import' | 'loading' | 'aha' | 'tour' | 'commit';
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

const GOALS = [
  { id: 'fix',       icon: Target,  title: 'Stop losing the same way',  blurb: 'Find the patterns costing you games.' },
  { id: 'climb',     icon: Trophy,  title: 'Climb to my next level',    blurb: 'Targeted fixes to break your rating ceiling.' },
  { id: 'tourney',   icon: Swords,  title: 'Prep for an opponent',      blurb: 'Scout their weaknesses before you play.' },
  { id: 'explore',   icon: Compass, title: "I'm just exploring",        blurb: "Show me what's possible." },
] as const;

const TOUR = [
  {
    id: 'scan',
    icon: Camera,
    badge: 'NEW',
    title: 'Scan any position',
    sub: 'Snap a board mid-game and get the AI verdict in seconds.',
    bullet1: 'Works on books, screens, real boards',
    bullet2: 'Best move + threats + plan',
    bullet3: 'No more guessing in postgame review',
    demo: 'scan',
  },
  {
    id: 'analysis',
    icon: Brain,
    badge: 'CORE',
    title: 'AI Game Coach',
    sub: 'Every game gets a personalized breakdown of your blunders and fixes.',
    bullet1: 'Plain-English mistake explanations',
    bullet2: 'Pattern detection across all your games',
    bullet3: 'Custom drills for your weak spots',
    demo: 'analysis',
  },
  {
    id: 'practice',
    icon: Bot,
    badge: 'TRAIN',
    title: 'Practice Bots',
    sub: 'Drill the exact positions you keep losing — over and over until they click.',
    bullet1: 'Bots that punish your weaknesses',
    bullet2: 'Replay your worst openings',
    bullet3: 'Endgame mastery rooms',
    demo: 'practice',
  },
] as const;

function ProgressDots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex justify-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1 rounded-full transition-all duration-300"
          style={{
            width: i === index ? 24 : 6,
            background: i <= index ? G : 'rgba(255,255,255,0.12)',
          }}
        />
      ))}
    </div>
  );
}

function TourDemo({ kind }: { kind: 'scan' | 'analysis' | 'practice' }) {
  if (kind === 'scan') {
    return (
      <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid rgba(255,255,255,0.05)` }}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-lg flex items-center justify-center text-xl shrink-0" style={{ background: '#769656', color: '#fff' }}>
            <span style={{ fontSize: 28 }}>♛</span>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[10px] font-black uppercase tracking-wider mb-0.5" style={{ color: G }}>Best move</p>
            <p className="text-sm font-bold font-mono" style={{ color: TEXT }}>Qxf7+ → mate in 3</p>
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'analysis') {
    return (
      <div className="rounded-xl p-3 mb-4 text-left" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid rgba(255,255,255,0.05)` }}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#dc4343' }} />
          <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#ef6b6b' }}>Move 14 — Blunder</p>
        </div>
        <p className="text-sm font-bold mb-1" style={{ color: TEXT }}>You played Nf3, hanging the e-pawn.</p>
        <p className="text-xs" style={{ color: MUTED }}>Better: Bxh7+ winning material immediately.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl p-3 mb-4 flex items-center gap-3" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid rgba(255,255,255,0.05)` }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${G}22`, border: `1px solid ${G}44` }}>
        <Bot className="w-5 h-5" style={{ color: G }} />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-bold leading-tight" style={{ color: TEXT }}>Anti-Caro Bot</p>
        <p className="text-[11px]" style={{ color: MUTED }}>Trained on your Caro losses · 1450 ELO</p>
      </div>
      <div className="px-2 py-1 rounded text-[10px] font-black" style={{ background: `${G}1f`, color: G }}>READY</div>
    </div>
  );
}

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { authUser, login, refreshAuth } = useUser();
  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>('chesscom');
  const [importUsername, setImportUsername] = useState(authUser?.chesscomUsername ?? authUser?.lichessUsername ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [tourIdx, setTourIdx] = useState(0);
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

      login(name);
      try { await refreshAuth(); } catch {}
      invalidateEloCache();

      const insightsRes = await apiFetch(
        `/api/onboarding/insights?username=${encodeURIComponent(name)}&platform=${platform}`,
        { credentials: 'include' },
      );
      if (!insightsRes.ok) throw new Error('Failed to compute insights');
      const data = (await insightsRes.json()) as InsightsResponse;

      if (cancelledRef.current) return;
      setProgress(100);
      setInsights(data);
      setTimeout(() => {
        if (!cancelledRef.current) setStep('aha');
      }, 500);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setStep('import');
    }
  }, [importUsername, platform, login, refreshAuth]);

  // Step index for progress dots (goal=0, import=1, loading=1, aha=2, tour=3, commit=4)
  const progressIndex =
    step === 'goal' ? 0 :
    step === 'import' || step === 'loading' ? 1 :
    step === 'aha' ? 2 :
    step === 'tour' ? 3 : 4;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-4 pt-8 md:pt-4 overflow-y-auto"
      style={{ background: BG }}
    >
      <div className="w-full max-w-xl">
        <ProgressDots index={progressIndex} total={5} />

        <AnimatePresence mode="wait">
          {/* STEP 1 — GOAL */}
          {step === 'goal' && (
            <motion.div
              key="goal"
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
              <h1 className="text-2xl md:text-4xl font-black mb-2 leading-tight" style={{ color: TEXT }}>
                What brings you here?
              </h1>
              <p className="text-sm md:text-base mb-6" style={{ color: MUTED }}>
                Pick one — we'll tailor everything around it.
              </p>

              <div className="space-y-2.5">
                {GOALS.map((g) => {
                  const Icon = g.icon;
                  const selected = goal === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setGoal(g.id)}
                      className="w-full text-left rounded-xl p-4 flex items-center gap-3 transition-all"
                      style={{
                        background: selected ? `${G}14` : CARD,
                        border: `1.5px solid ${selected ? `${G}80` : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: selected ? `${G}26` : 'rgba(255,255,255,0.04)' }}>
                        <Icon className="w-5 h-5" style={{ color: selected ? G : MUTED }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-sm md:text-base leading-tight" style={{ color: TEXT }}>
                          {g.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>{g.blurb}</p>
                      </div>
                      {selected && (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: G }}>
                          <Check className="w-3.5 h-3.5" style={{ color: '#fff' }} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setStep('import')}
                disabled={!goal}
                className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-base transition-all disabled:opacity-40"
                style={{ background: G, color: '#fff' }}
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* STEP 2 — IMPORT */}
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
              <h1 className="text-2xl md:text-4xl font-black mb-2 leading-tight" style={{ color: TEXT }}>
                Let's pull your real games
              </h1>
              <p className="text-sm md:text-base mb-6" style={{ color: MUTED }}>
                30 seconds. No password needed — just your handle.
              </p>

              <div className="rounded-2xl p-5 md:p-6" style={{ background: CARD, border: `1px solid rgba(255,255,255,0.06)` }}>
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
                >
                  Analyze My Games
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3 — LOADING */}
          {step === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-6"
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

          {/* STEP 4 — AHA / INSIGHTS */}
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
                <h1 className="text-2xl md:text-4xl font-black leading-tight" style={{ color: TEXT }}>
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
                    className="rounded-2xl p-5"
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
                        <p className="text-base md:text-lg font-black leading-tight mb-1.5" style={{ color: TEXT }}>
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
                onClick={() => { setTourIdx(0); setStep('tour'); }}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base transition-all"
                style={{ background: G, color: '#fff' }}
              >
                Show me how to fix this
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </motion.div>
          )}

          {/* STEP 5 — TOUR */}
          {step === 'tour' && (
            <motion.div
              key={`tour-${tourIdx}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <div className="flex justify-center gap-1.5 mb-4">
                {TOUR.map((_, i) => (
                  <div key={i}
                    className="h-1 rounded-full transition-all"
                    style={{ width: i === tourIdx ? 20 : 5, background: i <= tourIdx ? G : 'rgba(255,255,255,0.12)' }}
                  />
                ))}
              </div>

              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: G }}>
                Your toolkit · {tourIdx + 1} of {TOUR.length}
              </p>

              {(() => {
                const t = TOUR[tourIdx];
                const Icon = t.icon;
                return (
                  <div className="rounded-2xl p-5 md:p-6" style={{ background: CARD, border: `1px solid rgba(255,255,255,0.06)` }}>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: `${G}1a`, border: `1px solid ${G}33` }}>
                        <Icon className="w-6 h-6" style={{ color: G }} />
                      </div>
                      <span className="px-2 py-1 rounded text-[10px] font-black tracking-wider"
                        style={{ background: 'rgba(234,166,49,0.15)', color: '#eaa631' }}>
                        {t.badge}
                      </span>
                    </div>

                    <h2 className="text-2xl md:text-3xl font-black mb-2 leading-tight" style={{ color: TEXT }}>
                      {t.title}
                    </h2>
                    <p className="text-sm md:text-base mb-5" style={{ color: MUTED }}>
                      {t.sub}
                    </p>

                    <TourDemo kind={t.demo as any} />

                    <div className="space-y-2 text-left mb-5">
                      {[t.bullet1, t.bullet2, t.bullet3].map((b, i) => (
                        <motion.div
                          key={`${tourIdx}-${i}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.08 }}
                          className="flex items-start gap-2"
                        >
                          <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                            style={{ background: `${G}26` }}>
                            <Check className="w-2.5 h-2.5" style={{ color: G }} strokeWidth={3} />
                          </div>
                          <p className="text-sm" style={{ color: TEXT }}>{b}</p>
                        </motion.div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        if (tourIdx < TOUR.length - 1) setTourIdx(tourIdx + 1);
                        else setStep('commit');
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-base transition-all"
                      style={{ background: G, color: '#fff' }}
                    >
                      {tourIdx < TOUR.length - 1 ? 'Next weapon' : "I'm ready"}
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                );
              })()}

              <button
                onClick={() => setStep('commit')}
                className="text-xs mt-4 underline-offset-2 hover:underline"
                style={{ color: MUTED }}
              >
                Skip tour
              </button>
            </motion.div>
          )}

          {/* STEP 6 — COMMIT */}
          {step === 'commit' && (
            <motion.div
              key="commit"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
                style={{ background: `${G}1a`, border: `2px solid ${G}55` }}
              >
                <Check className="w-10 h-10" style={{ color: G }} strokeWidth={3} />
              </motion.div>

              <h1 className="text-3xl md:text-4xl font-black mb-3 leading-tight" style={{ color: TEXT }}>
                Your game plan is ready
              </h1>
              <p className="text-base mb-7 max-w-md mx-auto" style={{ color: MUTED }}>
                {insights && insights.totalGames > 0
                  ? `${insights.totalGames} games analyzed. Your dashboard is loaded with personalized fixes.`
                  : 'Your dashboard is set up. Import more games anytime to sharpen your plan.'}
              </p>

              <div className="rounded-2xl p-4 mb-6 text-left"
                style={{ background: CARD, border: `1px solid rgba(255,255,255,0.06)` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: G }}>
                  Next 3 days are free
                </p>
                <p className="text-sm" style={{ color: TEXT }}>
                  Full access to AI analysis, scan position, practice bots, and personalized courses. No card required.
                </p>
              </div>

              <button
                onClick={onComplete}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base transition-all"
                style={{ background: G, color: '#fff' }}
              >
                Start improving
                <ArrowRight className="w-5 h-5" />
              </button>
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
