import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { useLocation } from 'wouter';
import {
  ChevronRight, Search, Loader2, CheckCircle2,
  Crown, Sparkles, Shield, Zap, BrainCircuit, Swords,
  GraduationCap, X, Trophy, Target, TrendingUp,
  AlertTriangle, Eye,
} from 'lucide-react';

const ONBOARDING_KEY = 'chessscout_onboarding_v1';
const GRANDMASTERS = [
  { name: 'MagnusCarlsen', label: 'Magnus Carlsen', title: 'GM', rating: 2831 },
  { name: 'Hikaru', label: 'Hikaru Nakamura', title: 'GM', rating: 2736 },
  { name: 'GothamChess', label: 'Levy Rozman', title: 'IM', rating: 2058 },
  { name: 'DanielNaroditsky', label: 'Daniel Naroditsky', title: 'GM', rating: 2619 },
  { name: 'FabianoCaruana', label: 'Fabiano Caruana', title: 'GM', rating: 2786 },
  { name: 'nihalsarin', label: 'Nihal Sarin', title: 'GM', rating: 2694 },
  { name: 'AnishGiri', label: 'Anish Giri', title: 'GM', rating: 2750 },
  { name: 'LevonAronian', label: 'Levon Aronian', title: 'GM', rating: 2745 },
  { name: 'ChessNetwork', label: 'Jerry', title: 'NM', rating: 2150 },
  { name: 'GukeshDommaraju', label: 'Gukesh D', title: 'GM', rating: 2758 },
];

const CHESS_TIPS = [
  "In the opening, develop your knights before your bishops.",
  "Control the center — it gives your pieces maximum mobility.",
  "Castle early to protect your king and connect your rooks.",
  "Don't move the same piece twice in the opening without good reason.",
  "A knight on the rim is grim — keep knights centralized.",
  "When ahead in material, trade pieces. When behind, trade pawns.",
  "Always ask: what is my opponent threatening?",
  "Rooks belong on open files and the 7th rank.",
  "Passed pawns must be pushed!",
  "The threat is stronger than the execution.",
];

const ANALYSIS_FACTS = [
  "Running Stockfish at depth 15 for maximum accuracy...",
  "GPT-4o is writing personalized explanations for each move...",
  "Identifying brilliant moves, mistakes, and blunders...",
  "Calculating win probability after every position...",
  "Comparing your moves to the engine's top choices...",
  "Building your accuracy rating move by move...",
];

const SCOUT_FACTS = [
  "Downloading recent games from Chess.com...",
  "Mapping opening repertoire and win rates...",
  "Identifying tactical patterns and tendencies...",
  "Analyzing endgame technique and accuracy...",
  "Finding exploitable weaknesses in their play...",
  "Building a complete scouting report...",
];

type Step = 'welcome' | 'import' | 'review' | 'scout' | 'upgrade';

const CLASS_COLORS: Record<string, string> = {
  brilliant: '#26c2a3', excellent: '#96bc4b', good: '#96bc4b',
  book: '#a88b68', inaccuracy: '#f7c631', mistake: '#e58f2a', blunder: '#ca3431',
};

const CLASS_ICONS: Record<string, string> = {
  brilliant: '💎', excellent: '✦', good: '✓', book: '📖',
  inaccuracy: '?!', mistake: '?', blunder: '??',
};

interface Props { onComplete: () => void; }

function FloatingPieces() {
  const pieces = useMemo(() => ['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟'], []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((p, i) => (
        <motion.div
          key={i}
          className="absolute text-white/[0.03] select-none"
          style={{ fontSize: `${30 + Math.random() * 40}px`, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
          animate={{ y: [0, -20, 0], rotate: [0, 10, -10, 0], opacity: [0.03, 0.06, 0.03] }}
          transition={{ duration: 5 + Math.random() * 5, repeat: Infinity, delay: Math.random() * 3, ease: 'easeInOut' }}
        >
          {p}
        </motion.div>
      ))}
    </div>
  );
}

function RotatingTip({ tips }: { tips: string[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { const t = setInterval(() => setIdx(i => (i + 1) % tips.length), 4000); return () => clearInterval(t); }, [tips]);
  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={idx}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4 }}
        className="text-white/40 text-xs text-center italic min-h-[2rem]"
      >
        {tips[idx]}
      </motion.p>
    </AnimatePresence>
  );
}

function PulseRing({ color = '#81b64c' }: { color?: string }) {
  return (
    <div className="relative flex items-center justify-center">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{ borderColor: color, width: 80 + i * 30, height: 80 + i * 30 }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
        />
      ))}
    </div>
  );
}

function AccuracyRing({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 36, c = 2 * Math.PI * r, offset = c - (value / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="white" strokeOpacity={0.1} strokeWidth={5} />
          <motion.circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
            strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: 'easeOut' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span className="text-lg font-bold text-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            {value}%
          </motion.span>
        </div>
      </div>
      <span className="text-[10px] text-white/50 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export function OnboardingWizard({ onComplete }: Props) {
  const { username, authUser, isPremium } = useUser();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>('welcome');

  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [importCount, setImportCount] = useState(0);
  const [games, setGames] = useState<any[]>([]);

  const [reviewGameId, setReviewGameId] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [reviewProgress, setReviewProgress] = useState({ done: 0, total: 0 });
  const [reviewResult, setReviewResult] = useState<any>(null);

  const [scoutName, setScoutName] = useState('');
  const [scoutStatus, setScoutStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [scoutResult, setScoutResult] = useState<any>(null);

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/stripe/products', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.data) setProducts(d.data); })
      .catch(() => {});
  }, []);

  const handleImport = async () => {
    if (!username) return;
    setImportStatus('loading');
    try {
      const res = await apiFetch('/api/games/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ username, months: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportCount(data.imported ?? 0);
      const gamesRes = await apiFetch(`/api/games?username=${encodeURIComponent(username)}&limit=5`, { credentials: 'include' });
      const gamesData = await gamesRes.json();
      setGames(gamesData.games ?? gamesData ?? []);
      setImportStatus('done');
    } catch {
      setImportStatus('error');
    }
  };

  const handleReview = async (gameId: number) => {
    setReviewGameId(gameId);
    setReviewStatus('loading');
    setReviewProgress({ done: 0, total: 0 });
    try {
      const res = await apiFetch(`/api/games/${gameId}/review`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review failed');
      const jobId = data.jobId;
      if (!jobId) { setReviewStatus('done'); return; }
      const poll = setInterval(async () => {
        try {
          const sr = await apiFetch(`/api/games/review-status/${jobId}`, { credentials: 'include' });
          const sd = await sr.json();
          if (sd.progress) setReviewProgress({ done: sd.progress.progress ?? sd.progress ?? 0, total: sd.progress.total ?? 0 });
          if (sd.status === 'done') {
            clearInterval(poll);
            setReviewResult(sd.reviewData ?? null);
            setReviewStatus('done');
          }
          if (sd.status === 'error') { clearInterval(poll); setReviewStatus('error'); }
        } catch { clearInterval(poll); setReviewStatus('error'); }
      }, 2500);
    } catch { setReviewStatus('error'); }
  };

  const handleScout = async (name: string) => {
    if (!name.trim()) return;
    setScoutName(name.trim());
    setScoutStatus('loading');
    try {
      const res = await apiFetch('/api/opponents/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ username: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scout failed');
      const jobId = data.jobId;
      const poll = setInterval(async () => {
        try {
          const sr = await apiFetch(`/api/opponents/status/${jobId}`, { credentials: 'include' });
          const sd = await sr.json();
          if (sd.status === 'done') { clearInterval(poll); setScoutResult(sd.result); setScoutStatus('done'); }
          if (sd.status === 'error') { clearInterval(poll); setScoutStatus('error'); }
        } catch { clearInterval(poll); setScoutStatus('error'); }
      }, 3000);
    } catch { setScoutStatus('error'); }
  };

  const handleCheckout = async (priceId: string) => {
    setCheckoutLoading(priceId);
    try {
      const res = await apiFetch('/api/stripe/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {} finally { setCheckoutLoading(null); }
  };

  const finish = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'done');
    onComplete();
  }, [onComplete]);

  const product = products[0];
  const weeklyPrice = product?.prices?.find((p: any) => p.recurring?.interval === 'week');
  const monthlyPrice = product?.prices?.find((p: any) => p.recurring?.interval === 'month');

  const reviewMoves = reviewResult?.moves ?? [];
  const reviewSummary = reviewResult?.gameSummary ?? null;
  const reviewStats = useMemo(() => {
    if (!reviewMoves.length) return null;
    const playerColor = games.find((g: any) => g.id === reviewGameId)?.whiteUsername?.toLowerCase() === username?.toLowerCase() ? 'white' : 'black';
    const playerMoves = reviewMoves.filter((m: any) => m.color === playerColor);
    const counts: Record<string, number> = {};
    for (const m of playerMoves) counts[m.classification] = (counts[m.classification] ?? 0) + 1;
    return { counts, total: playerMoves.length, playerColor };
  }, [reviewMoves, games, reviewGameId, username]);

  const steps: Step[] = ['welcome', 'import', 'review', 'scout', 'upgrade'];
  const stepIdx = steps.indexOf(step);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: 'linear-gradient(145deg, #1a1916 0%, #262421 40%, #1e2a1a 100%)' }}
    >
      <FloatingPieces />

      <div className="relative z-10 flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">♟</span>
          <span className="font-bold text-white/80 text-sm tracking-wide">Chess<span className="text-[#81b64c]">Scout</span></span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <motion.div key={i} className="h-1 rounded-full" animate={{
                width: stepIdx >= i ? 28 : 12,
                backgroundColor: stepIdx >= i ? '#81b64c' : 'rgba(255,255,255,0.1)',
              }} transition={{ duration: 0.3 }} />
            ))}
          </div>
          <button onClick={finish} className="text-white/30 hover:text-white/60 transition-colors p-1"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto hide-scrollbar flex items-center justify-center px-5 pb-5">
        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div key="welcome" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }} className="w-full max-w-md text-center"
            >
              <motion.div
                className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#81b64c] to-[#5a8a2a] flex items-center justify-center shadow-lg shadow-[#81b64c]/20"
                animate={{ rotateY: [0, 360] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
              >
                <span className="text-5xl">♞</span>
              </motion.div>

              <motion.h1
                className="text-3xl md:text-4xl font-bold text-white mb-3"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              >
                Welcome, {authUser?.firstName || username}!
              </motion.h1>
              <motion.p
                className="text-white/50 mb-8 text-sm md:text-base leading-relaxed max-w-sm mx-auto"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              >
                Let's take a quick tour of ChessScout's most powerful features. In the next 2 minutes, you'll see how AI can transform your chess.
              </motion.p>

              <motion.div
                className="grid grid-cols-3 gap-3 mb-8"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              >
                {[
                  { icon: BrainCircuit, label: 'AI Game Review', desc: 'Every move analyzed', color: 'from-blue-500/20 to-blue-600/10', iconColor: 'text-blue-400' },
                  { icon: Swords, label: 'Opponent Scout', desc: 'Find weaknesses', color: 'from-red-500/20 to-red-600/10', iconColor: 'text-red-400' },
                  { icon: GraduationCap, label: 'Smart Courses', desc: 'Personalized lessons', color: 'from-emerald-500/20 to-emerald-600/10', iconColor: 'text-emerald-400' },
                ].map((f, i) => (
                  <motion.div key={f.label}
                    className={`p-3 rounded-xl bg-gradient-to-b ${f.color} border border-white/5`}
                    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7 + i * 0.1 }}
                  >
                    <f.icon className={`w-6 h-6 ${f.iconColor} mx-auto mb-1.5`} />
                    <p className="text-white text-xs font-semibold">{f.label}</p>
                    <p className="text-white/30 text-[10px]">{f.desc}</p>
                  </motion.div>
                ))}
              </motion.div>

              <motion.button
                onClick={() => setStep('import')}
                className="w-full py-4 rounded-2xl bg-[#81b64c] text-white font-bold text-lg hover:bg-[#6da03e] transition-all shadow-lg shadow-[#81b64c]/20 flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
              >
                Let's Go <ChevronRight className="w-5 h-5" />
              </motion.button>
            </motion.div>
          )}

          {step === 'import' && (
            <motion.div key="import" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }} className="w-full max-w-md"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Import Your Games</h2>
                  <p className="text-white/40 text-xs">Step 1 of 4</p>
                </div>
              </div>
              <p className="text-white/50 text-sm mb-5 ml-[52px]">Pull your recent games so we can analyze them.</p>

              {importStatus === 'idle' && (
                <div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#81b64c]/20 flex items-center justify-center text-lg">♟</div>
                    <div>
                      <p className="text-white/40 text-xs">Chess.com</p>
                      <p className="text-white font-semibold">{username || 'Not set'}</p>
                    </div>
                  </div>
                  <motion.button onClick={handleImport} disabled={!username}
                    className="w-full py-3.5 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-all disabled:opacity-40"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  >
                    Import Last Month's Games
                  </motion.button>
                </div>
              )}

              {importStatus === 'loading' && (
                <div className="text-center py-10">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <PulseRing color="#3b82f6" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.span className="text-3xl" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>♟</motion.span>
                    </div>
                  </div>
                  <p className="text-white/70 font-medium mb-1">Importing from Chess.com...</p>
                  <RotatingTip tips={CHESS_TIPS} />
                </div>
              )}

              {importStatus === 'done' && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                  <div className="p-5 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 mb-4 text-center">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10 }}>
                      <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
                    </motion.div>
                    <p className="text-green-400 font-bold text-lg">{importCount} games imported!</p>
                    <p className="text-green-400/50 text-xs mt-1">Ready for AI analysis</p>
                  </div>
                  <motion.button onClick={() => setStep('review')}
                    className="w-full py-3.5 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-all flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  >
                    Now Let's Review a Game <ChevronRight className="w-4 h-4" />
                  </motion.button>
                </motion.div>
              )}

              {importStatus === 'error' && (
                <div>
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 mb-4 text-red-400 text-sm text-center">
                    Import failed — make sure your Chess.com username is correct.
                  </div>
                  <button onClick={() => setImportStatus('idle')} className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors">
                    Try Again
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {step === 'review' && (
            <motion.div key="review" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }} className="w-full max-w-md"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <BrainCircuit className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">AI Game Review</h2>
                  <p className="text-white/40 text-xs">Step 2 of 4</p>
                </div>
              </div>
              <p className="text-white/50 text-sm mb-5 ml-[52px]">
                Pick a game — Stockfish + GPT will analyze every move.
              </p>

              {reviewStatus === 'idle' && (
                <div>
                  {games.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-white/40 text-sm mb-3">No games found — let's skip to scouting!</p>
                      <motion.button onClick={() => setStep('scout')}
                        className="px-8 py-3 rounded-xl bg-[#81b64c] text-white font-semibold"
                        whileTap={{ scale: 0.98 }}
                      >
                        Scout an Opponent
                      </motion.button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {games.slice(0, 5).map((g: any, i: number) => (
                        <motion.button key={g.id}
                          onClick={() => handleReview(g.id)}
                          className="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-left flex items-center gap-3"
                          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                          whileHover={{ x: 4 }}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                            g.result === '1-0' ? 'bg-green-500/20 text-green-400' :
                            g.result === '0-1' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {g.result === '1-0' ? 'W' : g.result === '0-1' ? 'L' : '½'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{g.whiteUsername} vs {g.blackUsername}</p>
                            <p className="text-white/30 text-xs">{g.opening || g.timeControl}</p>
                          </div>
                          <div className="text-white/20"><Eye className="w-4 h-4" /></div>
                        </motion.button>
                      ))}
                      <button onClick={() => setStep('scout')} className="w-full pt-2 text-white/30 hover:text-white/50 text-xs transition-colors">
                        Skip — I'll review later
                      </button>
                    </div>
                  )}
                </div>
              )}

              {reviewStatus === 'loading' && (
                <div className="text-center py-6">
                  <div className="relative w-28 h-28 mx-auto mb-5">
                    <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                      <circle cx="60" cy="60" r="50" fill="none" stroke="white" strokeOpacity={0.05} strokeWidth={6} />
                      <motion.circle cx="60" cy="60" r="50" fill="none" stroke="#81b64c" strokeWidth={6} strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 50}
                        animate={{ strokeDashoffset: reviewProgress.total > 0
                          ? (2 * Math.PI * 50) - (reviewProgress.done / reviewProgress.total) * (2 * Math.PI * 50)
                          : 2 * Math.PI * 50 * 0.75 }}
                        transition={{ duration: 0.5 }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      {reviewProgress.total > 0 ? (
                        <>
                          <span className="text-2xl font-bold text-white">{Math.round((reviewProgress.done / reviewProgress.total) * 100)}%</span>
                          <span className="text-[10px] text-white/40">{reviewProgress.done}/{reviewProgress.total}</span>
                        </>
                      ) : (
                        <Loader2 className="w-6 h-6 text-[#81b64c] animate-spin" />
                      )}
                    </div>
                  </div>
                  <p className="text-white font-semibold mb-2">Analyzing your game...</p>
                  <RotatingTip tips={ANALYSIS_FACTS} />
                  <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/5">
                    <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Did you know?</p>
                    <RotatingTip tips={CHESS_TIPS} />
                  </div>
                </div>
              )}

              {reviewStatus === 'done' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="p-5 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 text-center">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10 }}>
                      <Sparkles className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                    </motion.div>
                    <p className="text-white font-bold text-lg mb-1">Review Complete!</p>

                    {reviewStats && (
                      <div className="flex justify-center gap-2 mt-3 flex-wrap">
                        {Object.entries(reviewStats.counts)
                          .sort(([,a],[,b]) => (b as number) - (a as number))
                          .slice(0, 5)
                          .map(([cls, count], i) => (
                            <motion.div key={cls}
                              className="px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                              style={{ backgroundColor: `${CLASS_COLORS[cls] ?? '#888'}22` }}
                              initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.3 + i * 0.1, type: 'spring' }}
                            >
                              <span className="text-xs">{CLASS_ICONS[cls] ?? '·'}</span>
                              <span className="text-xs font-medium" style={{ color: CLASS_COLORS[cls] ?? '#888' }}>
                                {count} {cls}
                              </span>
                            </motion.div>
                          ))
                        }
                      </div>
                    )}

                    {reviewSummary?.overview && (
                      <motion.p className="text-white/50 text-xs mt-3 leading-relaxed max-w-xs mx-auto line-clamp-3"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                      >
                        "{reviewSummary.overview}"
                      </motion.p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {reviewGameId && (
                      <motion.button onClick={() => { finish(); navigate(`/games/${reviewGameId}`); }}
                        className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-all text-sm"
                        whileTap={{ scale: 0.98 }}
                      >
                        View Full Review
                      </motion.button>
                    )}
                    <motion.button onClick={() => setStep('scout')}
                      className="flex-1 py-3 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-all flex items-center justify-center gap-2 text-sm"
                      whileTap={{ scale: 0.98 }}
                    >
                      Scout Opponent <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {reviewStatus === 'error' && (
                <div>
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 mb-4 text-red-400 text-sm text-center">
                    Review ran into an issue. You can review from the game page later.
                  </div>
                  <motion.button onClick={() => setStep('scout')}
                    className="w-full py-3 rounded-xl bg-[#81b64c] text-white font-semibold flex items-center justify-center gap-2"
                    whileTap={{ scale: 0.98 }}
                  >
                    Continue to Scout <ChevronRight className="w-4 h-4" />
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}

          {step === 'scout' && (
            <motion.div key="scout" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }} className="w-full max-w-md"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <Target className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Scout an Opponent</h2>
                  <p className="text-white/40 text-xs">Step 3 of 4</p>
                </div>
              </div>
              <p className="text-white/50 text-sm mb-5 ml-[52px]">
                Find any player's weaknesses, openings, and tendencies.
              </p>

              {scoutStatus === 'idle' && (
                <div>
                  <div className="relative mb-4">
                    <Search className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      value={scoutName}
                      onChange={e => setScoutName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleScout(scoutName)}
                      placeholder="Enter any Chess.com username"
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-[#81b64c]/50 focus:bg-white/[0.07] text-sm transition-all"
                    />
                  </div>
                  <motion.button onClick={() => handleScout(scoutName)} disabled={!scoutName.trim()}
                    className="w-full py-3.5 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-all disabled:opacity-40 mb-5"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  >
                    Scout This Player
                  </motion.button>

                  <div className="relative">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <p className="text-white/30 text-[10px] uppercase tracking-widest mb-3 pt-4 text-center">Or scout a top player</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {GRANDMASTERS.map((gm, i) => (
                        <motion.button key={gm.name}
                          onClick={() => { setScoutName(gm.name); handleScout(gm.name); }}
                          className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/15 transition-all text-left flex items-center gap-2"
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          whileHover={{ x: 3 }}
                        >
                          <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                            gm.title === 'GM' ? 'bg-amber-500/20 text-amber-400' :
                            gm.title === 'IM' ? 'bg-orange-500/20 text-orange-400' : 'bg-purple-500/20 text-purple-400'
                          }`}>{gm.title}</span>
                          <span className="text-white/70 text-xs truncate flex-1">{gm.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => setStep('upgrade')} className="w-full mt-4 py-2 text-white/30 hover:text-white/50 text-xs transition-colors">
                    Skip — I'll scout later
                  </button>
                </div>
              )}

              {scoutStatus === 'loading' && (
                <div className="text-center py-6">
                  <div className="relative w-28 h-28 mx-auto mb-5">
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-dashed border-red-500/30"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.div
                      className="absolute inset-3 rounded-full border-2 border-dashed border-orange-500/20"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.div
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <Target className="w-8 h-8 text-red-400" />
                      </motion.div>
                    </div>
                  </div>
                  <p className="text-white font-semibold mb-1">Scouting <span className="text-[#81b64c]">{scoutName}</span>...</p>
                  <RotatingTip tips={SCOUT_FACTS} />
                  <div className="mt-4 flex justify-center gap-1">
                    {[0,1,2,3,4].map(i => (
                      <motion.div key={i} className="w-2 h-2 rounded-full bg-red-400"
                        animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {scoutStatus === 'done' && scoutResult && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20">
                    <div className="flex items-center gap-3 mb-3">
                      <Trophy className="w-6 h-6 text-amber-400" />
                      <div>
                        <p className="text-white font-bold">{scoutResult.username ?? scoutName}</p>
                        <p className="text-white/40 text-xs">{scoutResult.gamesAnalyzed ?? 0} games analyzed</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { label: 'Wins', value: scoutResult.wins ?? 0, color: 'text-green-400' },
                        { label: 'Losses', value: scoutResult.losses ?? 0, color: 'text-red-400' },
                        { label: 'Draws', value: scoutResult.draws ?? 0, color: 'text-yellow-400' },
                      ].map(s => (
                        <div key={s.label} className="text-center p-2 rounded-lg bg-black/20">
                          <motion.p className={`text-lg font-bold ${s.color}`}
                            initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', damping: 10, delay: 0.2 }}
                          >{s.value}</motion.p>
                          <p className="text-white/30 text-[10px] uppercase">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {scoutResult.weaknesses?.length > 0 && (
                      <div>
                        <p className="text-white/50 text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Exploitable Weaknesses
                        </p>
                        <div className="space-y-1">
                          {scoutResult.weaknesses.slice(0, 3).map((w: any, i: number) => (
                            <motion.div key={i}
                              className="flex items-center gap-2 p-2 rounded-lg bg-black/20"
                              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.4 + i * 0.15 }}
                            >
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                w.severity === 'Critical' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                                w.severity === 'High' ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' :
                                'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              }`}>{w.severity}</span>
                              <span className="text-white/70 text-xs truncate flex-1">{w.category}</span>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <motion.button onClick={() => { finish(); navigate('/opponents'); }}
                      className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-all text-sm"
                      whileTap={{ scale: 0.98 }}
                    >
                      Full Report
                    </motion.button>
                    <motion.button onClick={() => setStep('upgrade')}
                      className="flex-1 py-3 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-all flex items-center justify-center gap-2 text-sm"
                      whileTap={{ scale: 0.98 }}
                    >
                      Continue <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {scoutStatus === 'error' && (
                <div>
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 mb-4 text-red-400 text-sm text-center">
                    Scouting failed — the username may not exist on Chess.com.
                  </div>
                  <button onClick={() => setScoutStatus('idle')} className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors">
                    Try Another Player
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {step === 'upgrade' && (
            <motion.div key="upgrade" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }} className="w-full max-w-md"
            >
              <div className="text-center mb-6">
                <motion.div
                  className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500/30 to-yellow-500/20 flex items-center justify-center"
                  animate={{ boxShadow: ['0 0 0 0 rgba(251,191,36,0)', '0 0 30px 10px rgba(251,191,36,0.15)', '0 0 0 0 rgba(251,191,36,0)'] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                >
                  <Crown className="w-8 h-8 text-amber-400" />
                </motion.div>
                <h2 className="text-2xl font-bold text-white mb-2">You've Seen the Power</h2>
                <p className="text-white/50 text-sm leading-relaxed max-w-xs mx-auto">
                  Start your <span className="text-[#81b64c] font-semibold">3-day free trial</span> now.
                  No charge today — cancel anytime before it ends.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-5">
                {[
                  { icon: BrainCircuit, text: 'Unlimited AI reviews', color: 'text-blue-400', bg: 'from-blue-500/10' },
                  { icon: Swords, text: 'Unlimited scouting', color: 'text-red-400', bg: 'from-red-500/10' },
                  { icon: GraduationCap, text: 'Custom courses', color: 'text-emerald-400', bg: 'from-emerald-500/10' },
                  { icon: Sparkles, text: 'Weakness analysis', color: 'text-purple-400', bg: 'from-purple-500/10' },
                ].map((f, i) => (
                  <motion.div key={f.text}
                    className={`p-3 rounded-xl bg-gradient-to-br ${f.bg} to-transparent border border-white/5 flex items-center gap-2.5`}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                  >
                    <f.icon className={`w-4 h-4 ${f.color} shrink-0`} />
                    <span className="text-white/70 text-xs">{f.text}</span>
                  </motion.div>
                ))}
              </div>

              {monthlyPrice && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                  className="space-y-2 mb-4"
                >
                  <motion.button onClick={() => handleCheckout(monthlyPrice.id)} disabled={!!checkoutLoading}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#81b64c] to-[#6da03e] text-white font-bold text-base transition-all disabled:opacity-70 shadow-lg shadow-[#81b64c]/20"
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  >
                    {checkoutLoading === monthlyPrice.id ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Crown className="w-5 h-5" />
                        Start Free Trial — ${(monthlyPrice.unit_amount / 100).toFixed(0)}/mo after
                      </span>
                    )}
                  </motion.button>

                  {weeklyPrice && (
                    <motion.button onClick={() => handleCheckout(weeklyPrice.id)} disabled={!!checkoutLoading}
                      className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 font-medium hover:bg-white/10 transition-all text-sm disabled:opacity-70"
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    >
                      {checkoutLoading === weeklyPrice.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      ) : (
                        `Try weekly instead — $${(weeklyPrice.unit_amount / 100).toFixed(0)}/week`
                      )}
                    </motion.button>
                  )}
                </motion.div>
              )}

              <div className="flex items-center justify-center gap-5 text-white/25 text-[10px] mb-4">
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secure checkout</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Cancel anytime</span>
                <span className="flex items-center gap-1">🔒 Stripe-powered</span>
              </div>

              <motion.button onClick={finish}
                className="w-full py-3 text-white/30 hover:text-white/50 text-sm transition-colors"
                whileTap={{ scale: 0.98 }}
              >
                Maybe later — continue with free trial
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function useOnboardingCheck() {
  const { isAuthenticated, isAuthLoading, username } = useUser();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !username) return;
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (!done) setShow(true);
  }, [isAuthenticated, isAuthLoading, username]);

  return { showOnboarding: show, dismissOnboarding: () => setShow(false) };
}
