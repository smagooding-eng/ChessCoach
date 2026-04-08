import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { useLocation } from 'wouter';
import {
  ChevronRight, ChevronLeft, Search, Loader2, CheckCircle2,
  Crown, Sparkles, Shield, Zap, BrainCircuit, Swords,
  GraduationCap, X, Star, Trophy,
} from 'lucide-react';

const ONBOARDING_KEY = 'chessscout_onboarding_v1';
const GRANDMASTERS = [
  'MagnusCarlsen', 'Hikaru', 'GothamChess', 'DanielNaroditsky',
  'FabianoCaruana', 'nihalsarin', 'AnishGiri', 'LevonAronian',
  'ChessNetwork', 'GukeshDommaraju',
];

type Step = 'welcome' | 'import' | 'review' | 'scout' | 'upgrade';

interface Props {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: Props) {
  const { username, authUser, subscription, isPremium } = useUser();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>('welcome');
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [importCount, setImportCount] = useState(0);
  const [games, setGames] = useState<any[]>([]);
  const [reviewGameId, setReviewGameId] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [reviewProgress, setReviewProgress] = useState({ done: 0, total: 0 });
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      const res = await apiFetch(`/api/games/${gameId}/review`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review failed');
      const jobId = data.jobId;
      if (!jobId) { setReviewStatus('done'); return; }
      const poll = setInterval(async () => {
        try {
          const sr = await apiFetch(`/api/games/review-status/${jobId}`, { credentials: 'include' });
          const sd = await sr.json();
          if (sd.progress) setReviewProgress({ done: sd.progress.progress ?? 0, total: sd.progress.total ?? 0 });
          if (sd.status === 'done') { clearInterval(poll); setReviewStatus('done'); }
          if (sd.status === 'error') { clearInterval(poll); setReviewStatus('error'); }
        } catch { clearInterval(poll); setReviewStatus('error'); }
      }, 2500);
    } catch {
      setReviewStatus('error');
    }
  };

  const handleScout = async (name: string) => {
    if (!name.trim()) return;
    setScoutName(name);
    setScoutStatus('loading');
    try {
      const res = await apiFetch('/api/opponents/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scout failed');
      const jobId = data.jobId;
      const poll = setInterval(async () => {
        try {
          const sr = await apiFetch(`/api/opponents/status/${jobId}`, { credentials: 'include' });
          const sd = await sr.json();
          if (sd.status === 'done') {
            clearInterval(poll);
            setScoutResult(sd.result);
            setScoutStatus('done');
          }
          if (sd.status === 'error') { clearInterval(poll); setScoutStatus('error'); }
        } catch { clearInterval(poll); setScoutStatus('error'); }
      }, 3000);
    } catch {
      setScoutStatus('error');
    }
  };

  const handleCheckout = async (priceId: string) => {
    setCheckoutLoading(priceId);
    try {
      const res = await apiFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {} finally {
      setCheckoutLoading(null);
    }
  };

  const finish = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'done');
    onComplete();
  }, [onComplete]);

  const product = products[0];
  const weeklyPrice = product?.prices?.find((p: any) => p.recurring?.interval === 'week');
  const monthlyPrice = product?.prices?.find((p: any) => p.recurring?.interval === 'month');

  const slideVariants = {
    enter: { opacity: 0, x: 60 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -60 },
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-[#302e2b] rounded-2xl border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex gap-1.5">
            {(['welcome','import','review','scout','upgrade'] as Step[]).map((s, i) => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
                (['welcome','import','review','scout','upgrade'] as Step[]).indexOf(step) >= i
                  ? 'bg-[#81b64c] w-8' : 'bg-white/15 w-5'
              }`} />
            ))}
          </div>
          <button onClick={finish} className="text-white/40 hover:text-white/70 transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 hide-scrollbar">
          <AnimatePresence mode="wait">
            {step === 'welcome' && (
              <motion.div key="welcome" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }} className="pt-4">
                <div className="text-center">
                  <motion.div
                    animate={{ rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                    className="text-6xl mb-4 inline-block"
                  >
                    ♟
                  </motion.div>
                  <h1 className="text-2xl font-bold text-white mb-2">Welcome to ChessScout!</h1>
                  <p className="text-white/60 text-sm mb-6">
                    Let's get you set up in just a couple minutes. We'll import your games,
                    analyze one, and scout an opponent — so you can see exactly how ChessScout
                    helps you improve.
                  </p>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[
                      { icon: BrainCircuit, label: 'AI Review', color: 'text-blue-400' },
                      { icon: Swords, label: 'Scout', color: 'text-red-400' },
                      { icon: GraduationCap, label: 'Courses', color: 'text-green-400' },
                    ].map(f => (
                      <div key={f.label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/5">
                        <f.icon className={`w-6 h-6 ${f.color}`} />
                        <span className="text-xs text-white/70">{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setStep('import')}
                  className="w-full py-3 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-colors flex items-center justify-center gap-2"
                >
                  Let's Go <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {step === 'import' && (
              <motion.div key="import" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }} className="pt-4">
                <h2 className="text-xl font-bold text-white mb-1">Import Your Games</h2>
                <p className="text-white/50 text-sm mb-5">
                  We'll pull your recent games from Chess.com so we can analyze them.
                </p>

                {importStatus === 'idle' && (
                  <div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-4">
                      <p className="text-sm text-white/70 mb-1">Chess.com username</p>
                      <p className="text-lg font-semibold text-white">{username || 'Not set'}</p>
                    </div>
                    <button
                      onClick={handleImport}
                      disabled={!username}
                      className="w-full py-3 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-colors disabled:opacity-50"
                    >
                      Import Last Month's Games
                    </button>
                  </div>
                )}

                {importStatus === 'loading' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 text-[#81b64c] animate-spin mx-auto mb-3" />
                    <p className="text-white/70 text-sm">Importing games from Chess.com...</p>
                    <p className="text-white/40 text-xs mt-1">This may take a moment</p>
                  </div>
                )}

                {importStatus === 'done' && (
                  <div>
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30 mb-4">
                      <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
                      <div>
                        <p className="text-green-400 font-medium">Imported {importCount} games!</p>
                        <p className="text-green-400/60 text-xs">Ready to analyze</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setStep('review')}
                      className="w-full py-3 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-colors flex items-center justify-center gap-2"
                    >
                      Review a Game <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {importStatus === 'error' && (
                  <div>
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 mb-4 text-red-400 text-sm">
                      Import failed. Make sure your Chess.com username is correct.
                    </div>
                    <button onClick={() => setImportStatus('idle')} className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors">
                      Try Again
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'review' && (
              <motion.div key="review" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }} className="pt-4">
                <h2 className="text-xl font-bold text-white mb-1">Review a Game</h2>
                <p className="text-white/50 text-sm mb-4">
                  Pick a recent game and our AI will analyze every move with Stockfish + GPT.
                </p>

                {reviewStatus === 'idle' && (
                  <div className="space-y-2">
                    {games.length === 0 && (
                      <div className="text-center py-6 text-white/40 text-sm">
                        <p>No games found. Let's skip to opponent scouting!</p>
                        <button
                          onClick={() => setStep('scout')}
                          className="mt-3 px-6 py-2.5 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-colors"
                        >
                          Scout an Opponent
                        </button>
                      </div>
                    )}
                    {games.slice(0, 5).map((g: any) => (
                      <button
                        key={g.id}
                        onClick={() => handleReview(g.id)}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-left flex items-center gap-3"
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                          g.result === '1-0' ? 'bg-green-500/20 text-green-400' :
                          g.result === '0-1' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {g.result === '1-0' ? 'W' : g.result === '0-1' ? 'L' : 'D'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {g.whiteUsername} vs {g.blackUsername}
                          </p>
                          <p className="text-white/40 text-xs">{g.opening || g.timeControl}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/30" />
                      </button>
                    ))}
                  </div>
                )}

                {reviewStatus === 'loading' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 text-[#81b64c] animate-spin mx-auto mb-3" />
                    <p className="text-white/70 text-sm font-medium">Reviewing game...</p>
                    {reviewProgress.total > 0 && (
                      <div className="mt-3 max-w-xs mx-auto">
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-[#81b64c] rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round((reviewProgress.done / reviewProgress.total) * 100)}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <p className="text-white/40 text-xs mt-1.5">
                          Position {reviewProgress.done} of {reviewProgress.total}
                        </p>
                      </div>
                    )}
                    <p className="text-white/30 text-xs mt-2">Stockfish + GPT analysis takes ~60-90 seconds</p>
                  </div>
                )}

                {reviewStatus === 'done' && (
                  <div>
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30 mb-4">
                      <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
                      <div>
                        <p className="text-green-400 font-medium">Review complete!</p>
                        <p className="text-green-400/60 text-xs">Your game has been fully analyzed</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {reviewGameId && (
                        <button
                          onClick={() => { finish(); navigate(`/games/${reviewGameId}`); }}
                          className="flex-1 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors text-sm"
                        >
                          View Review
                        </button>
                      )}
                      <button
                        onClick={() => setStep('scout')}
                        className="flex-1 py-3 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-colors flex items-center justify-center gap-2 text-sm"
                      >
                        Scout Opponent <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {reviewStatus === 'error' && (
                  <div>
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 mb-4 text-red-400 text-sm">
                      Review ran into an issue. You can try again later from the game page.
                    </div>
                    <button
                      onClick={() => setStep('scout')}
                      className="w-full py-3 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-colors flex items-center justify-center gap-2"
                    >
                      Continue to Scout <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {reviewStatus === 'idle' && games.length > 0 && (
                  <button
                    onClick={() => setStep('scout')}
                    className="w-full mt-3 py-2 text-white/40 hover:text-white/60 text-xs transition-colors"
                  >
                    Skip — I'll review later
                  </button>
                )}
              </motion.div>
            )}

            {step === 'scout' && (
              <motion.div key="scout" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }} className="pt-4">
                <h2 className="text-xl font-bold text-white mb-1">Scout an Opponent</h2>
                <p className="text-white/50 text-sm mb-4">
                  Enter any Chess.com player's username — or try a grandmaster — and we'll find
                  their weaknesses, favorite openings, and tendencies.
                </p>

                {scoutStatus === 'idle' && (
                  <div>
                    <div className="relative mb-4">
                      <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={scoutName}
                        onChange={e => setScoutName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleScout(scoutName)}
                        placeholder="Enter Chess.com username"
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#81b64c]/50 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => handleScout(scoutName)}
                      disabled={!scoutName.trim()}
                      className="w-full py-3 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-colors disabled:opacity-50 mb-4"
                    >
                      Scout This Player
                    </button>

                    <div>
                      <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Or try a top player</p>
                      <div className="flex flex-wrap gap-1.5">
                        {GRANDMASTERS.map(gm => (
                          <button
                            key={gm}
                            onClick={() => { setScoutName(gm); handleScout(gm); }}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:bg-white/10 hover:text-white transition-colors"
                          >
                            {gm}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {scoutStatus === 'loading' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 text-[#81b64c] animate-spin mx-auto mb-3" />
                    <p className="text-white/70 text-sm font-medium">Scouting {scoutName}...</p>
                    <p className="text-white/40 text-xs mt-1">Analyzing recent games & patterns</p>
                  </div>
                )}

                {scoutStatus === 'done' && (
                  <div>
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30 mb-4">
                      <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
                      <div>
                        <p className="text-green-400 font-medium">Scout complete for {scoutName}!</p>
                        {scoutResult?.weaknesses && (
                          <p className="text-green-400/60 text-xs">
                            Found {scoutResult.weaknesses.length} exploitable weaknesses
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { finish(); navigate('/opponents'); }}
                        className="flex-1 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors text-sm"
                      >
                        View Full Report
                      </button>
                      <button
                        onClick={() => setStep('upgrade')}
                        className="flex-1 py-3 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-colors flex items-center justify-center gap-2 text-sm"
                      >
                        Continue <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {scoutStatus === 'error' && (
                  <div>
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 mb-4 text-red-400 text-sm">
                      Scouting failed. The username may not exist on Chess.com.
                    </div>
                    <button onClick={() => setScoutStatus('idle')} className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors">
                      Try Again
                    </button>
                  </div>
                )}

                {scoutStatus === 'idle' && (
                  <button
                    onClick={() => setStep('upgrade')}
                    className="w-full mt-3 py-2 text-white/40 hover:text-white/60 text-xs transition-colors"
                  >
                    Skip — I'll scout later
                  </button>
                )}
              </motion.div>
            )}

            {step === 'upgrade' && (
              <motion.div key="upgrade" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }} className="pt-4">
                <div className="text-center mb-5">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Crown className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                  </motion.div>
                  <h2 className="text-xl font-bold text-white mb-1">You're All Set!</h2>
                  <p className="text-white/50 text-sm">
                    You've seen what ChessScout can do. Start your <span className="text-[#81b64c] font-semibold">3-day free trial</span> —
                    no charge until the trial ends. Cancel anytime.
                  </p>
                </div>

                <div className="space-y-2 mb-5">
                  {[
                    { icon: BrainCircuit, text: 'Unlimited AI game reviews', color: 'text-blue-400' },
                    { icon: Swords, text: 'Unlimited opponent scouting', color: 'text-red-400' },
                    { icon: GraduationCap, text: 'AI-generated training courses', color: 'text-green-400' },
                    { icon: Sparkles, text: 'Personalized weakness analysis', color: 'text-purple-400' },
                  ].map(f => (
                    <div key={f.text} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5">
                      <f.icon className={`w-4 h-4 ${f.color} shrink-0`} />
                      <span className="text-white/80 text-sm">{f.text}</span>
                    </div>
                  ))}
                </div>

                {monthlyPrice && (
                  <div className="space-y-2 mb-4">
                    <button
                      onClick={() => handleCheckout(monthlyPrice.id)}
                      disabled={!!checkoutLoading}
                      className="w-full py-3.5 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-colors relative overflow-hidden disabled:opacity-70"
                    >
                      {checkoutLoading === monthlyPrice.id ? (
                        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <Crown className="w-4 h-4" />
                          Start Free Trial — ${(monthlyPrice.unit_amount / 100).toFixed(0)}/mo after
                        </span>
                      )}
                    </button>
                    {weeklyPrice && (
                      <button
                        onClick={() => handleCheckout(weeklyPrice.id)}
                        disabled={!!checkoutLoading}
                        className="w-full py-3 rounded-xl bg-white/10 text-white/80 font-medium hover:bg-white/15 transition-colors text-sm disabled:opacity-70"
                      >
                        {checkoutLoading === weeklyPrice.id ? (
                          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                          `Or $${(weeklyPrice.unit_amount / 100).toFixed(0)}/week`
                        )}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-center gap-4 text-white/30 text-xs mb-3">
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secure checkout</span>
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Cancel anytime</span>
                </div>

                <button
                  onClick={finish}
                  className="w-full py-2.5 text-white/40 hover:text-white/60 text-sm transition-colors"
                >
                  Maybe later — continue with free trial
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
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
