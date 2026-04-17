import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/use-user';
import { invalidateEloCache } from '@/hooks/use-elo-progress';
import { apiFetch } from '@/lib/api';
import {
  AlertTriangle, Loader2, Sparkles, ArrowRight, Camera, Brain, Bot,
  Target, Trophy, Swords, Compass, Check, ChevronRight, Database, Zap,
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

type Step = 'goal' | 'import' | 'loading' | 'aha' | 'tour' | 'deepImport' | 'commit';
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
  { id: 'fix',       icon: Target,  title: 'Stop losing the same way',  blurb: 'Find the patterns costing you games.',           commit: "We've already spotted the patterns dragging your rating down. Let's go fix them." },
  { id: 'climb',     icon: Trophy,  title: 'Climb to my next level',    blurb: 'Targeted fixes to break your rating ceiling.',   commit: "Your roadmap to the next rating tier is loaded. Time to climb." },
  { id: 'tourney',   icon: Swords,  title: 'Prep for an opponent',      blurb: 'Scout their weaknesses before you play.',        commit: "You're ready to scout. Drop an opponent's username and we'll do the rest." },
  { id: 'explore',   icon: Compass, title: "I'm just exploring",        blurb: "Show me what's possible.",                       commit: "Have a poke around — your dashboard is wired up with everything we found." },
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
  const [gameCounter, setGameCounter] = useState(0);
  const [deepImporting, setDeepImporting] = useState(false);
  const [deepImported, setDeepImported] = useState<number | null>(null);
  const [deepError, setDeepError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => () => { cancelledRef.current = true; }, []);

  // Loading message rotation + fake progress + ticking games counter
  useEffect(() => {
    if (step !== 'loading') return;
    setLoadingMsgIdx(0);
    setProgress(0);
    setGameCounter(0);
    const msgIv = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1500);
    const progIv = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.random() * 6 : p));
    }, 400);
    const counterIv = setInterval(() => {
      setGameCounter((c) => c + Math.floor(Math.random() * 4 + 1));
    }, 180);
    return () => { clearInterval(msgIv); clearInterval(progIv); clearInterval(counterIv); };
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
          months: 12,
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

  const runDeepImport = useCallback(async () => {
    const name = importUsername.trim();
    if (!name) { setStep('commit'); return; }
    setDeepError(null);
    setDeepImporting(true);
    try {
      const res = await apiFetch('/api/games/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: name,
          months: 24,
          platform,
          ownerUsername: name,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Import failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({} as any));
      if (cancelledRef.current) return;
      const total = typeof data.total === 'number' ? data.total : null;
      const imported = typeof data.imported === 'number' ? data.imported : null;
      setDeepImported(total ?? imported ?? 0);
      invalidateEloCache();
      setTimeout(() => {
        if (!cancelledRef.current) { setDeepImporting(false); setStep('commit'); }
      }, 700);
    } catch (e) {
      if (cancelledRef.current) return;
      setDeepImporting(false);
      setDeepError(e instanceof Error ? e.message : 'Could not import more games');
    }
  }, [importUsername, platform]);

  // Step index for progress dots
  const progressIndex =
    step === 'goal' ? 0 :
    step === 'import' || step === 'loading' ? 1 :
    step === 'aha' ? 2 :
    step === 'tour' ? 3 :
    step === 'deepImport' ? 4 : 5;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-4 pt-8 md:pt-4 overflow-y-auto"
      style={{ background: BG }}
    >
      <div className="w-full max-w-xl">
        <ProgressDots index={progressIndex} total={6} />

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
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
                style={{ background: `${G}14`, border: `1px solid ${G}40` }}>
                <div className="flex -space-x-1.5">
                  {['#dc4343','#ea9733','#81b64c'].map((c, i) => (
                    <div key={i} className="w-4 h-4 rounded-full border" style={{ background: c, borderColor: BG }} />
                  ))}
                </div>
                <span className="text-[11px] font-black tracking-wide" style={{ color: G }}>
                  12,847 PLAYERS · AVG <span style={{ color: TEXT }}>+147 RATING</span> IN 30 DAYS
                </span>
              </div>
              <h1 className="text-3xl md:text-5xl font-black mb-3 leading-[1.05] tracking-tight" style={{ color: TEXT }}>
                What's your <span style={{ color: G }}>#1 goal</span>?
              </h1>
              <p className="text-sm md:text-base mb-6" style={{ color: MUTED }}>
                Pick one — we'll tune the entire app around it.
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
              <h1 className="text-3xl md:text-5xl font-black mb-3 leading-[1.05] tracking-tight" style={{ color: TEXT }}>
                Let's find your <span style={{ color: '#dc4343' }}>biggest leaks</span>
              </h1>
              <p className="text-sm md:text-base mb-6 max-w-md mx-auto" style={{ color: MUTED }}>
                Drop your handle. <span style={{ color: TEXT }}>30 seconds</span> · no password · we'll do the rest.
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

                <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Database className="w-3.5 h-3.5" style={{ color: G }} />
                  <span className="text-xs font-mono font-bold" style={{ color: TEXT }}>
                    {gameCounter} games processed
                  </span>
                </div>
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
              {(() => {
                const highCount = insights.insights.filter(i => i.severity === 'high').length;
                const medCount  = insights.insights.filter(i => i.severity === 'medium').length;
                const leak = Math.max(40, highCount * 65 + medCount * 35 + Math.min(insights.losses, 30) * 2);
                return (
                  <div className="text-center mb-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: G }}>
                      ✓ Analysis Complete · {insights.totalGames} games scanned
                    </p>
                    <h1 className="text-3xl md:text-5xl font-black leading-[1.05] tracking-tight mb-4" style={{ color: TEXT }}>
                      You're leaking
                    </h1>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.15, type: 'spring', stiffness: 180 }}
                      className="inline-block mb-4 relative"
                    >
                      {/* sparkle particles around the number */}
                      {[...Array(6)].map((_, i) => {
                        const angle = (i / 6) * Math.PI * 2;
                        const r = 70;
                        return (
                          <motion.div
                            key={i}
                            className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
                            style={{ background: '#ef6b6b' }}
                            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                            animate={{
                              x: Math.cos(angle) * r,
                              y: Math.sin(angle) * r,
                              opacity: [0, 1, 0],
                              scale: [0, 1.2, 0],
                            }}
                            transition={{ delay: 0.4 + i * 0.04, duration: 0.9, ease: 'easeOut' }}
                          />
                        );
                      })}
                      <motion.div
                        className="px-5 py-2 rounded-2xl relative"
                        animate={{
                          boxShadow: [
                            '0 0 0 rgba(220,67,67,0)',
                            '0 0 40px rgba(220,67,67,0.45)',
                            '0 0 0 rgba(220,67,67,0)',
                          ],
                        }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                          background: 'linear-gradient(135deg, rgba(220,67,67,0.18) 0%, rgba(220,67,67,0.04) 100%)',
                          border: '1.5px solid rgba(220,67,67,0.35)',
                        }}
                      >
                        <span className="text-5xl md:text-6xl font-black tracking-tight" style={{ color: '#ef6b6b' }}>
                          ~{leak}
                        </span>
                        <span className="text-xl md:text-2xl font-black ml-1" style={{ color: '#ef6b6b' }}>pts</span>
                      </motion.div>
                    </motion.div>
                    <p className="text-sm md:text-base font-semibold" style={{ color: TEXT }}>
                      every month you don't fix these.
                    </p>
                  </div>
                );
              })()}

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
                        else setStep('deepImport');
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
                onClick={() => setStep('deepImport')}
                className="text-xs mt-4 underline-offset-2 hover:underline"
                style={{ color: MUTED }}
              >
                Skip tour
              </button>
            </motion.div>
          )}

          {/* STEP 6 — DEEP IMPORT */}
          {step === 'deepImport' && (
            <motion.div
              key="deepImport"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <motion.div
                animate={deepImporting ? { scale: [1, 1.06, 1] } : {}}
                transition={deepImporting ? { repeat: Infinity, duration: 1.4 } : {}}
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
                style={{ background: `${G}1a`, border: `1px solid ${G}33` }}
              >
                {deepImporting
                  ? <Loader2 className="w-7 h-7 animate-spin" style={{ color: G }} />
                  : <Database className="w-7 h-7" style={{ color: G }} />}
              </motion.div>

              <h1 className="text-3xl md:text-5xl font-black mb-3 leading-[1.05] tracking-tight" style={{ color: TEXT }}>
                {deepImporting
                  ? 'Pulling your full library…'
                  : <>Unlock <span style={{ color: G }}>5× more patterns</span></>}
              </h1>
              <p className="text-sm md:text-base mb-6 max-w-md mx-auto" style={{ color: MUTED }}>
                {deepImporting
                  ? "Hang tight — this can take a moment for active players."
                  : <>You've seen <span style={{ color: TEXT }}>1 year</span> so far. Pull the rest and every long-running pattern surfaces.</>}
              </p>

              <div className="grid grid-cols-2 gap-2.5 mb-5">
                <div className="rounded-xl p-4 text-left" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: MUTED }}>1 YEAR</p>
                  <p className="text-2xl font-black mb-1" style={{ color: TEXT }}>{insights?.totalGames ?? 0}</p>
                  <p className="text-xs" style={{ color: MUTED }}>games · ~{insights?.insights?.length ?? 3} patterns</p>
                </div>
                <motion.div className="rounded-xl p-4 text-left relative overflow-hidden"
                  animate={{
                    boxShadow: [
                      `0 0 0 ${G}00`,
                      `0 0 30px ${G}55`,
                      `0 0 0 ${G}00`,
                    ],
                  }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: 'linear-gradient(135deg, rgba(129,182,76,0.18) 0%, rgba(129,182,76,0.04) 100%)',
                    border: `1.5px solid ${G}66`,
                  }}>
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider" style={{ background: G, color: '#fff' }}>
                    RECOMMENDED
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: G }}>FULL HISTORY</p>
                  <p className="text-2xl font-black mb-1" style={{ color: TEXT }}>{Math.max(8, Math.round((insights?.totalGames ?? 0) * 2.5))}+</p>
                  <p className="text-xs" style={{ color: TEXT }}>games · <span style={{ color: G }}>~{Math.max(8, (insights?.insights?.length ?? 3) * 3)} patterns</span></p>
                </motion.div>
              </div>

              {deepError && (
                <div className="mb-3 p-2.5 rounded-lg text-sm" style={{ background: 'rgba(220,67,67,0.1)', border: '1px solid rgba(220,67,67,0.25)', color: '#ef6b6b' }}>
                  {deepError}
                </div>
              )}

              <button
                onClick={runDeepImport}
                disabled={deepImporting}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base transition-all disabled:opacity-70"
                style={{ background: G, color: '#fff' }}
              >
                {deepImporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    Yes, import my full library
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              {!deepImporting && (
                <button
                  onClick={() => setStep('commit')}
                  className="text-xs mt-4 underline-offset-2 hover:underline"
                  style={{ color: MUTED }}
                >
                  Maybe later
                </button>
              )}
            </motion.div>
          )}

          {/* STEP 7 — COMMIT */}
          {step === 'commit' && (
            <motion.div
              key="commit"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center relative"
            >
              {/* CONFETTI BURST */}
              <div className="absolute inset-x-0 top-0 h-40 pointer-events-none overflow-visible">
                {Array.from({ length: 28 }).map((_, i) => {
                  const colors = [G, '#ffc34d', '#dc4343', '#5ab9ff', '#b8e070', '#ea9733'];
                  const color = colors[i % colors.length];
                  const startX = (Math.random() - 0.5) * 100;
                  const endX = startX + (Math.random() - 0.5) * 240;
                  const endY = 200 + Math.random() * 180;
                  const rot = Math.random() * 720;
                  const size = 5 + Math.random() * 6;
                  const isCircle = i % 3 === 0;
                  return (
                    <motion.div
                      key={i}
                      initial={{ x: `${startX}%`, y: 10, opacity: 1, rotate: 0, scale: 0.6 }}
                      animate={{ x: `${endX}%`, y: endY, opacity: [1, 1, 0], rotate: rot, scale: 1 }}
                      transition={{ duration: 1.6 + Math.random() * 0.8, ease: 'easeOut', delay: Math.random() * 0.15 }}
                      className="absolute left-1/2 top-0"
                      style={{
                        width: size,
                        height: isCircle ? size : size * 0.5,
                        background: color,
                        borderRadius: isCircle ? '50%' : 1,
                      }}
                    />
                  );
                })}
              </div>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 relative"
                style={{ background: `${G}1a`, border: `2px solid ${G}55`, boxShadow: `0 0 40px ${G}55` }}
              >
                <Check className="w-10 h-10" style={{ color: G }} strokeWidth={3} />
              </motion.div>

              <h1 className="text-4xl md:text-5xl font-black mb-3 leading-[1.05] tracking-tight" style={{ color: TEXT }}>
                You're <span style={{ color: G }}>locked in</span>.
              </h1>
              {(() => {
                const total = deepImported ?? insights?.totalGames ?? 0;
                const goalCommit = GOALS.find(g => g.id === goal)?.commit
                  ?? "Your dashboard is loaded and ready.";
                return (
                  <p className="text-base mb-6 max-w-md mx-auto" style={{ color: MUTED }}>
                    {total > 0 ? <><span style={{ color: TEXT, fontWeight: 800 }}>{total} games</span> analyzed. </> : ''}{goalCommit}
                  </p>
                );
              })()}

              {/* Projected rating gain visual */}
              <div className="rounded-2xl p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(129,182,76,0.16) 0%, rgba(129,182,76,0.02) 100%)',
                  border: `1.5px solid ${G}55`,
                }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: G }}>30-DAY PROJECTION</span>
                  <span className="text-2xl md:text-3xl font-black" style={{ color: G }}>+147</span>
                </div>
                <div className="flex items-end gap-1 h-12">
                  {[28, 35, 42, 48, 58, 70, 85, 100].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ delay: 0.3 + i * 0.05, duration: 0.4, ease: 'easeOut' }}
                      className="flex-1 rounded-sm"
                      style={{
                        background: i >= 5
                          ? G
                          : 'rgba(255,255,255,0.18)',
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>TODAY</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: G }}>+30 DAYS</span>
                </div>
              </div>

              <div className="rounded-xl p-3 mb-6 flex items-center gap-2.5"
                style={{ background: CARD, border: `1px solid rgba(255,255,255,0.06)` }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${G}22` }}>
                  <Zap className="w-4 h-4" style={{ color: G }} />
                </div>
                <div className="text-left flex-1">
                  <p className="text-xs font-black" style={{ color: TEXT }}>3 days of premium · free</p>
                  <p className="text-[11px]" style={{ color: MUTED }}>No card. Cancel anytime.</p>
                </div>
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
