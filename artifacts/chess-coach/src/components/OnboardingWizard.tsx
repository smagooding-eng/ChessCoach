import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { useLocation } from 'wouter';
import {
  ChevronRight, Search, Loader2, CheckCircle2,
  Crown, Sparkles, Shield, Zap, BrainCircuit, Swords,
  GraduationCap, X, Trophy, Target, TrendingUp,
  AlertTriangle, Eye, Edit3, Check, User,
} from 'lucide-react';

const ONBOARDING_KEY = 'chessscout_onboarding_v1';
const GRANDMASTERS = [
  { name: 'MagnusCarlsen', label: 'Magnus Carlsen', title: 'GM' },
  { name: 'Hikaru', label: 'Hikaru Nakamura', title: 'GM' },
  { name: 'GothamChess', label: 'Levy Rozman', title: 'IM' },
  { name: 'DanielNaroditsky', label: 'Daniel Naroditsky', title: 'GM' },
  { name: 'FabianoCaruana', label: 'Fabiano Caruana', title: 'GM' },
  { name: 'nihalsarin', label: 'Nihal Sarin', title: 'GM' },
  { name: 'AnishGiri', label: 'Anish Giri', title: 'GM' },
  { name: 'LevonAronian', label: 'Levon Aronian', title: 'GM' },
  { name: 'ChessNetwork', label: 'Jerry', title: 'NM' },
  { name: 'GukeshDommaraju', label: 'Gukesh D', title: 'GM' },
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

const CHESS_DID_YOU_KNOW = [
  "The number of possible chess games exceeds the number of atoms in the observable universe.",
  "The longest official chess game lasted 269 moves and ended in a draw.",
  "The word 'checkmate' comes from the Persian phrase 'Shah Mat' — the king is helpless.",
  "A knight can visit every square on the board exactly once — it's called the Knight's Tour.",
  "The shortest possible checkmate is just two moves — Scholar's Mate isn't even the fastest!",
  "Magnus Carlsen's peak rating of 2882 is the highest in chess history.",
  "There are 400 different possible positions after each player makes one move.",
  "The record for most simultaneous games is 604, set by Ehsan Ghaem-Maghami.",
  "Garry Kasparov was the youngest undisputed World Champion at age 22.",
  "A pawn that reaches the 8th rank can become any piece — even a second queen.",
  "The longest chess game theoretically possible is 5,949 moves.",
  "In speed chess, the average game lasts about 75 moves total.",
];

const SCOUT_STAGES = [
  { icon: '📡', label: 'Fetching game history', duration: 4000 },
  { icon: '📊', label: 'Analyzing opening repertoire', duration: 6000 },
  { icon: '🔍', label: 'Scanning for patterns', duration: 5000 },
  { icon: '⚔️', label: 'Identifying weaknesses', duration: 5000 },
  { icon: '📝', label: 'Compiling scouting report', duration: 4000 },
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
        <motion.div key={i} className="absolute text-white/[0.03] select-none"
          style={{ fontSize: `${30 + Math.random() * 40}px`, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
          animate={{ y: [0, -20, 0], rotate: [0, 10, -10, 0], opacity: [0.03, 0.06, 0.03] }}
          transition={{ duration: 5 + Math.random() * 5, repeat: Infinity, delay: Math.random() * 3, ease: 'easeInOut' }}
        >{p}</motion.div>
      ))}
    </div>
  );
}

function RotatingTip({ tips }: { tips: string[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { const t = setInterval(() => setIdx(i => (i + 1) % tips.length), 4000); return () => clearInterval(t); }, [tips]);
  return (
    <AnimatePresence mode="wait">
      <motion.p key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}
        className="text-white/40 text-xs text-center italic min-h-[2rem]"
      >{tips[idx]}</motion.p>
    </AnimatePresence>
  );
}

function PulseRing({ color = '#81b64c' }: { color?: string }) {
  return (
    <div className="relative flex items-center justify-center">
      {[0, 1, 2].map(i => (
        <motion.div key={i} className="absolute rounded-full border"
          style={{ borderColor: color, width: 80 + i * 30, height: 80 + i * 30 }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
        />
      ))}
    </div>
  );
}

function ScoutLoadingVisual({ scoutName }: { scoutName: string }) {
  const [stageIdx, setStageIdx] = useState(0);
  const [factIdx, setFactIdx] = useState(() => Math.floor(Math.random() * CHESS_DID_YOU_KNOW.length));
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 100), 100);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cumulative = 0;
    for (let i = 0; i < SCOUT_STAGES.length; i++) {
      cumulative += SCOUT_STAGES[i].duration;
      if (elapsed < cumulative) { setStageIdx(i); return; }
    }
    setStageIdx(SCOUT_STAGES.length - 1);
  }, [elapsed]);

  useEffect(() => {
    const t = setInterval(() => setFactIdx(i => (i + 1) % CHESS_DID_YOU_KNOW.length), 6000);
    return () => clearInterval(t);
  }, []);

  const overallProgress = Math.min(95, (elapsed / (SCOUT_STAGES.reduce((s, st) => s + st.duration, 0))) * 95);

  const miniBoard = useMemo(() => {
    const cells: { light: boolean; piece: string }[] = [];
    const pieces = ['♜','♞','♝','♛','♚','♝','♞','♜'];
    const wPieces = ['♖','♘','♗','♕','♔','♗','♘','♖'];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const light = (r + c) % 2 === 0;
        let piece = '';
        if (r === 0) piece = pieces[c];
        else if (r === 1) piece = '♟';
        else if (r === 6) piece = '♙';
        else if (r === 7) piece = wPieces[c];
        cells.push({ light, piece });
      }
    }
    return cells;
  }, []);

  const scanRow = Math.floor((elapsed % 4000) / 500);

  return (
    <div className="py-2">
      <div className="relative w-[160px] h-[160px] mx-auto mb-5">
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 rounded-xl overflow-hidden border border-white/10 shadow-lg shadow-black/30">
          {miniBoard.map((cell, i) => {
            const row = Math.floor(i / 8);
            const isScanning = row === scanRow;
            return (
              <div key={i} className="relative flex items-center justify-center"
                style={{ background: cell.light ? '#b8c68a' : '#6d8a3a' }}
              >
                {cell.piece && (
                  <motion.span className="text-[14px] leading-none select-none"
                    style={{ opacity: 0.8 }}
                    animate={isScanning ? { scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] } : {}}
                    transition={{ duration: 0.3 }}
                  >{cell.piece}</motion.span>
                )}
                {isScanning && (
                  <motion.div className="absolute inset-0"
                    style={{ background: 'rgba(129,182,76,0.25)' }}
                    initial={{ opacity: 0 }} animate={{ opacity: [0, 0.4, 0] }}
                    transition={{ duration: 0.5 }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <motion.div className="absolute -inset-2 rounded-2xl border-2 border-[#81b64c]/30"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shadow-lg"
          animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
        >
          <Target className="w-3.5 h-3.5 text-white" />
        </motion.div>
      </div>

      <p className="text-white font-semibold text-center mb-4">
        Scouting <span className="text-[#81b64c]">{scoutName}</span>
      </p>

      <div className="space-y-1.5 mb-5">
        {SCOUT_STAGES.map((stage, i) => (
          <motion.div key={i} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg"
            style={{ background: i === stageIdx ? 'rgba(255,255,255,0.05)' : 'transparent' }}
            animate={i === stageIdx ? { backgroundColor: ['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.03)'] } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span className="text-sm w-5 text-center">
              {i < stageIdx ? '✅' : i === stageIdx ? stage.icon : '⬜'}
            </span>
            <span className={`text-xs ${i < stageIdx ? 'text-green-400/70 line-through' : i === stageIdx ? 'text-white/80 font-medium' : 'text-white/20'}`}>
              {stage.label}
            </span>
            {i === stageIdx && (
              <Loader2 className="w-3 h-3 text-[#81b64c] animate-spin ml-auto" />
            )}
          </motion.div>
        ))}
      </div>

      <div className="mb-5 px-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-white/30 text-[10px] uppercase tracking-wider">Progress</span>
          <span className="text-[#81b64c] text-xs font-mono">{Math.round(overallProgress)}%</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #81b64c, #a3d465)' }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      <motion.div className="mx-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
        key={factIdx}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.5 }}
      >
        <p className="text-[#81b64c]/60 text-[9px] uppercase tracking-widest font-bold mb-1">♟ Did you know?</p>
        <p className="text-white/45 text-xs leading-relaxed">{CHESS_DID_YOU_KNOW[factIdx]}</p>
      </motion.div>
    </div>
  );
}

function MiniReviewBanner({ status, progress, result, gameId, onView }: {
  status: string; progress: { done: number; total: number }; result: any; gameId: number | null; onView: () => void;
}) {
  if (status === 'idle') return null;
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className="mb-4 p-3 rounded-xl border border-white/10 bg-white/5"
    >
      {status === 'loading' && (
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-[#81b64c] animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs font-medium">Game review running in background...</p>
            {progress.total > 0 && (
              <div className="h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                <motion.div className="h-full bg-[#81b64c] rounded-full"
                  animate={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </div>
          <span className="text-[#81b64c] text-xs font-mono shrink-0">
            {progress.total > 0 ? `${Math.round((progress.done / progress.total) * 100)}%` : '...'}
          </span>
        </div>
      )}
      {status === 'done' && (
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-green-400 text-xs font-medium flex-1">Review complete!</p>
          <button onClick={onView} className="text-[#81b64c] text-xs font-semibold hover:underline">View</button>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-red-400 text-xs flex-1">Review failed — you can retry from the game page.</p>
        </div>
      )}
    </motion.div>
  );
}

export function OnboardingWizard({ onComplete }: Props) {
  const { username, authUser, login, refreshAuth } = useUser();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>('welcome');

  const [localUsername, setLocalUsername] = useState(username || '');
  const [editingUsername, setEditingUsername] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);

  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [importCount, setImportCount] = useState(0);
  const [games, setGames] = useState<any[]>([]);

  const [reviewGameId, setReviewGameId] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [reviewProgress, setReviewProgress] = useState({ done: 0, total: 0 });
  const [reviewResult, setReviewResult] = useState<any>(null);
  const reviewPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [scoutName, setScoutName] = useState('');
  const [scoutStatus, setScoutStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [scoutResult, setScoutResult] = useState<any>(null);
  const [showFullReport, setShowFullReport] = useState(false);
  const scoutPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);

  const effectiveUsername = username || localUsername;

  useEffect(() => { setLocalUsername(username || ''); }, [username]);

  useEffect(() => {
    apiFetch('/api/stripe/products', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.data) setProducts(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (reviewPollRef.current) clearInterval(reviewPollRef.current);
      if (scoutPollRef.current) clearInterval(scoutPollRef.current);
    };
  }, []);

  const saveUsername = async () => {
    if (!localUsername.trim()) return;
    setSavingUsername(true);
    try {
      const res = await apiFetch('/api/auth/update-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ chesscomUsername: localUsername.trim() }),
      });
      if (res.ok) {
        login(localUsername.trim());
        await refreshAuth();
        setEditingUsername(false);
      }
    } catch {} finally { setSavingUsername(false); }
  };

  const importRef = useRef(false);
  const handleImport = async () => {
    const uname = effectiveUsername;
    if (!uname || importRef.current) return;
    importRef.current = true;
    setImportStatus('loading');
    setStep('review');

    apiFetch('/api/games/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ username: uname, months: 3 }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setImportCount(data.imported ?? 0);
        return apiFetch(`/api/games?username=${encodeURIComponent(uname)}&limit=5`, { credentials: 'include' });
      })
      .then(r => r.json())
      .then(gamesData => {
        setGames(gamesData.games ?? gamesData ?? []);
        setImportStatus('done');
      })
      .catch(() => { setImportStatus('error'); });
  };

  const handleReview = async (gameId: number) => {
    if (reviewPollRef.current) { clearInterval(reviewPollRef.current); reviewPollRef.current = null; }
    setReviewGameId(gameId);
    setReviewStatus('loading');
    setReviewProgress({ done: 0, total: 0 });
    try {
      const res = await apiFetch(`/api/games/${gameId}/review`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review failed');
      const jobId = data.jobId;
      if (!jobId) { setReviewStatus('done'); setStep('scout'); return; }
      reviewPollRef.current = setInterval(async () => {
        try {
          const sr = await apiFetch(`/api/games/review-status/${jobId}`, { credentials: 'include' });
          const sd = await sr.json();
          if (sd.progress) setReviewProgress({ done: sd.progress.progress ?? sd.progress ?? 0, total: sd.progress.total ?? 0 });
          if (sd.status === 'done') {
            if (reviewPollRef.current) { clearInterval(reviewPollRef.current); reviewPollRef.current = null; }
            setReviewResult(sd.reviewData ?? null);
            setReviewStatus('done');
          }
          if (sd.status === 'error') {
            if (reviewPollRef.current) { clearInterval(reviewPollRef.current); reviewPollRef.current = null; }
            setReviewStatus('error');
          }
        } catch {
          if (reviewPollRef.current) { clearInterval(reviewPollRef.current); reviewPollRef.current = null; }
          setReviewStatus('error');
        }
      }, 2500);
      setStep('scout');
    } catch { setReviewStatus('error'); }
  };

  const handleScout = async (name: string) => {
    if (!name.trim()) return;
    if (scoutPollRef.current) { clearInterval(scoutPollRef.current); scoutPollRef.current = null; }
    setScoutName(name.trim());
    setScoutStatus('loading');
    setShowFullReport(false);
    try {
      const res = await apiFetch('/api/opponents/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ username: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scout failed');
      const jobId = data.jobId;
      scoutPollRef.current = setInterval(async () => {
        try {
          const sr = await apiFetch(`/api/opponents/status/${jobId}`, { credentials: 'include' });
          const sd = await sr.json();
          if (sd.status === 'done') {
            if (scoutPollRef.current) { clearInterval(scoutPollRef.current); scoutPollRef.current = null; }
            setScoutResult(sd.result); setScoutStatus('done');
          }
          if (sd.status === 'error') {
            if (scoutPollRef.current) { clearInterval(scoutPollRef.current); scoutPollRef.current = null; }
            setScoutStatus('error');
          }
        } catch {
          if (scoutPollRef.current) { clearInterval(scoutPollRef.current); scoutPollRef.current = null; }
          setScoutStatus('error');
        }
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

  const finish = useCallback((goToScout = false) => {
    if (reviewPollRef.current) { clearInterval(reviewPollRef.current); reviewPollRef.current = null; }
    if (scoutPollRef.current) { clearInterval(scoutPollRef.current); scoutPollRef.current = null; }
    onComplete();
    if (goToScout) navigate('/opponents');
  }, [onComplete, navigate]);

  const product = products[0];
  const weeklyPrice = product?.prices?.find((p: any) => p.recurring?.interval === 'week');
  const monthlyPrice = product?.prices?.find((p: any) => p.recurring?.interval === 'month');

  const reviewStats = useMemo(() => {
    const moves = reviewResult?.moves ?? [];
    if (!moves.length) return null;
    const playerColor = games.find((g: any) => g.id === reviewGameId)?.whiteUsername?.toLowerCase() === effectiveUsername?.toLowerCase() ? 'white' : 'black';
    const playerMoves = moves.filter((m: any) => m.color === playerColor);
    const counts: Record<string, number> = {};
    for (const m of playerMoves) counts[m.classification] = (counts[m.classification] ?? 0) + 1;
    return { counts, total: playerMoves.length };
  }, [reviewResult, games, reviewGameId, effectiveUsername]);

  const steps: Step[] = ['welcome', 'import', 'review', 'scout', 'upgrade'];
  const stepIdx = steps.indexOf(step);

  const showReviewBanner = step !== 'review' && reviewStatus !== 'idle';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
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
          <button onClick={() => finish(!!scoutResult)} className="text-white/30 hover:text-white/60 transition-colors p-1"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto hide-scrollbar flex items-start md:items-center justify-center px-5 pb-5 pt-2">
        <div className="w-full max-w-md">
          {showReviewBanner && (
            <MiniReviewBanner
              status={reviewStatus}
              progress={reviewProgress}
              result={reviewResult}
              gameId={reviewGameId}
              onView={() => { finish(); if (reviewGameId) navigate(`/games/${reviewGameId}`); }}
            />
          )}

          <AnimatePresence mode="wait">
            {step === 'welcome' && (
              <motion.div key="welcome" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.4 }} className="text-center"
              >
                <motion.div
                  className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#81b64c] to-[#5a8a2a] flex items-center justify-center shadow-lg shadow-[#81b64c]/20"
                  animate={{ rotateY: [0, 360] }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
                >
                  <span className="text-5xl">♞</span>
                </motion.div>

                <motion.h1 className="text-3xl md:text-4xl font-bold text-white mb-3"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                >
                  Welcome, {authUser?.firstName || effectiveUsername || 'Player'}!
                </motion.h1>
                <motion.p className="text-white/50 mb-8 text-sm md:text-base leading-relaxed max-w-sm mx-auto"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                >
                  Let's take a quick tour of ChessScout's most powerful features. In the next 2 minutes,
                  you'll see how AI can transform your chess.
                </motion.p>

                <motion.div className="grid grid-cols-3 gap-3 mb-8"
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

                <motion.button onClick={() => setStep('import')}
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
                transition={{ duration: 0.4 }}
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
                <p className="text-white/50 text-sm mb-5 ml-[52px]">
                  We'll pull your last 3 months of games in the background while you continue.
                </p>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-4">
                  {!effectiveUsername || editingUsername ? (
                    <div>
                      <p className="text-white/40 text-xs mb-2">Enter your Chess.com username</p>
                      <div className="flex gap-2">
                        <input
                          value={localUsername}
                          onChange={e => setLocalUsername(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveUsername()}
                          placeholder="e.g. MagnusCarlsen"
                          className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-[#81b64c]/50 text-sm"
                          autoFocus
                        />
                        <motion.button onClick={saveUsername} disabled={!localUsername.trim() || savingUsername}
                          className="px-4 py-2.5 rounded-lg bg-[#81b64c] text-white font-medium text-sm disabled:opacity-40 flex items-center gap-1"
                          whileTap={{ scale: 0.95 }}
                        >
                          {savingUsername ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </motion.button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#81b64c]/20 flex items-center justify-center text-lg">♟</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/40 text-xs">Chess.com</p>
                        <p className="text-white font-semibold truncate">{effectiveUsername}</p>
                      </div>
                      <button onClick={() => setEditingUsername(true)}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                {effectiveUsername && !editingUsername && (
                  <motion.button onClick={handleImport}
                    className="w-full py-3.5 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-all flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  >
                    Import & Continue <ChevronRight className="w-4 h-4" />
                  </motion.button>
                )}
                <button onClick={() => setStep('review')} className="w-full mt-3 py-2 text-white/30 hover:text-white/50 text-xs transition-colors">
                  Skip — I'll import later
                </button>
              </motion.div>
            )}

            {step === 'review' && (
              <motion.div key="review" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.4 }}
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
                <p className="text-white/50 text-sm mb-4 ml-[52px]">
                  Pick a game — we'll start the review and you can continue while it runs.
                </p>

                {importStatus === 'loading' && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5"
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                      <p className="text-blue-400/80 text-xs font-medium flex-1">Importing 3 months of games in the background...</p>
                    </div>
                  </motion.div>
                )}
                {importStatus === 'done' && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 rounded-xl border border-green-500/20 bg-green-500/5"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      <p className="text-green-400/80 text-xs font-medium flex-1">{importCount} games imported!</p>
                    </div>
                  </motion.div>
                )}
                {importStatus === 'error' && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 rounded-xl border border-red-500/20 bg-red-500/5"
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <p className="text-red-400/80 text-xs flex-1">Import failed — check your username on the Import page later.</p>
                    </div>
                  </motion.div>
                )}

                {reviewStatus === 'idle' && (
                  <div>
                    {games.length === 0 ? (
                      <div className="text-center py-6">
                        {importStatus === 'loading' ? (
                          <>
                            <p className="text-white/40 text-sm mb-1">Games are still importing...</p>
                            <p className="text-white/25 text-xs mb-4">You can skip ahead and review games later.</p>
                          </>
                        ) : (
                          <p className="text-white/40 text-sm mb-4">No games found — let's skip to scouting!</p>
                        )}
                        <motion.button onClick={() => setStep('scout')}
                          className="px-8 py-3 rounded-xl bg-[#81b64c] text-white font-semibold flex items-center justify-center gap-2 mx-auto"
                          whileTap={{ scale: 0.98 }}
                        >
                          Scout an Opponent <ChevronRight className="w-4 h-4" />
                        </motion.button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {games.slice(0, 5).map((g: any, i: number) => (
                          <motion.button key={g.id} onClick={() => handleReview(g.id)}
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
                        <p className="text-center text-white/30 text-[10px] mt-2">
                          Tap a game — review starts in background while you continue
                        </p>
                        <button onClick={() => setStep('scout')} className="w-full pt-2 text-white/30 hover:text-white/50 text-xs transition-colors">
                          Skip — I'll review later
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {step === 'scout' && (
              <motion.div key="scout" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.4 }}
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
                      <input value={scoutName} onChange={e => setScoutName(e.target.value)}
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
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
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
                  <ScoutLoadingVisual scoutName={scoutName} />
                )}

                {scoutStatus === 'done' && scoutResult && !showFullReport && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20">
                      <div className="flex items-center gap-3 mb-3">
                        {scoutResult.profile?.avatar ? (
                          <img src={scoutResult.profile.avatar} alt={scoutResult.username}
                            className="w-12 h-12 rounded-full border-2 border-white/10 object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                            <User className="w-6 h-6 text-white/40" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {scoutResult.profile?.title && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                scoutResult.profile.title === 'GM' ? 'bg-amber-500/20 text-amber-400' :
                                scoutResult.profile.title === 'IM' ? 'bg-orange-500/20 text-orange-400' : 'bg-purple-500/20 text-purple-400'
                              }`}>{scoutResult.profile.title}</span>
                            )}
                            <p className="text-white font-bold truncate">{scoutResult.profile?.name || scoutResult.username || scoutName}</p>
                          </div>
                          <p className="text-white/40 text-xs">@{scoutResult.username || scoutName}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {scoutResult.profile?.ratings?.blitz && (
                              <span className="text-[10px] text-white/40 flex items-center gap-0.5">
                                <Zap className="w-2.5 h-2.5 text-[#81b64c]" /> {scoutResult.profile.ratings.blitz}
                              </span>
                            )}
                            {scoutResult.profile?.ratings?.rapid && (
                              <span className="text-[10px] text-white/40 flex items-center gap-0.5">
                                <TrendingUp className="w-2.5 h-2.5 text-blue-400" /> {scoutResult.profile.ratings.rapid}
                              </span>
                            )}
                          </div>
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
                              <motion.div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-black/20"
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
                      <motion.button onClick={() => setShowFullReport(true)}
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

                {scoutStatus === 'done' && scoutResult && showFullReport && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <button onClick={() => setShowFullReport(false)}
                      className="text-white/40 hover:text-white/60 text-xs flex items-center gap-1 mb-2"
                    >
                      ← Back to summary
                    </button>

                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center gap-3 mb-3">
                        {scoutResult.profile?.avatar ? (
                          <img src={scoutResult.profile.avatar} alt={scoutResult.username}
                            className="w-14 h-14 rounded-full border-2 border-white/10 object-cover" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                            <User className="w-7 h-7 text-white/40" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            {scoutResult.profile?.title && (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                scoutResult.profile.title === 'GM' ? 'bg-amber-500/20 text-amber-400' :
                                scoutResult.profile.title === 'IM' ? 'bg-orange-500/20 text-orange-400' : 'bg-purple-500/20 text-purple-400'
                              }`}>{scoutResult.profile.title}</span>
                            )}
                            <p className="text-white font-bold text-lg">{scoutResult.profile?.name || scoutResult.username}</p>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {scoutResult.profile?.ratings?.blitz && <span className="text-xs text-white/40"><Zap className="w-3 h-3 text-[#81b64c] inline mr-0.5" />{scoutResult.profile.ratings.blitz}</span>}
                            {scoutResult.profile?.ratings?.rapid && <span className="text-xs text-white/40"><TrendingUp className="w-3 h-3 text-blue-400 inline mr-0.5" />{scoutResult.profile.ratings.rapid}</span>}
                            {scoutResult.profile?.ratings?.bullet && <span className="text-xs text-white/40">🔫 {scoutResult.profile.ratings.bullet}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {[
                          { label: 'Games', value: scoutResult.gamesAnalyzed ?? 0, color: 'text-white' },
                          { label: 'Wins', value: scoutResult.wins ?? 0, color: 'text-green-400' },
                          { label: 'Losses', value: scoutResult.losses ?? 0, color: 'text-red-400' },
                          { label: 'Draws', value: scoutResult.draws ?? 0, color: 'text-yellow-400' },
                        ].map(s => (
                          <div key={s.label} className="text-center p-2 rounded-lg bg-black/20">
                            <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-white/30 text-[10px] uppercase">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {scoutResult.weaknesses?.length > 0 && (
                      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Weaknesses ({scoutResult.weaknesses.length})
                        </p>
                        <div className="space-y-2">
                          {scoutResult.weaknesses.map((w: any, i: number) => (
                            <motion.div key={i} className="p-2.5 rounded-lg bg-black/20"
                              initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  w.severity === 'Critical' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                                  w.severity === 'High' ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' :
                                  w.severity === 'Medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                                  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                }`}>{w.severity}</span>
                                <span className="text-white text-xs font-medium">{w.category}</span>
                              </div>
                              <p className="text-white/50 text-[11px] leading-relaxed">{w.description}</p>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {scoutResult.topOpenings?.length > 0 && (
                      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">Top Openings</p>
                        <div className="space-y-1.5">
                          {scoutResult.topOpenings.slice(0, 5).map((o: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-white/70 flex-1 truncate">{o.opening}</span>
                              <span className="text-white/30">{o.games}g</span>
                              <span className={`font-medium ${o.winRate >= 60 ? 'text-green-400' : o.winRate <= 40 ? 'text-red-400' : 'text-white/50'}`}>
                                {Math.round(o.winRate)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <motion.button onClick={() => setStep('upgrade')}
                      className="w-full py-3.5 rounded-xl bg-[#81b64c] text-white font-semibold hover:bg-[#6da03e] transition-all flex items-center justify-center gap-2"
                      whileTap={{ scale: 0.98 }}
                    >
                      Continue <ChevronRight className="w-4 h-4" />
                    </motion.button>
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
                transition={{ duration: 0.4 }}
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

                {reviewStatus === 'done' && reviewStats && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 mb-4"
                  >
                    <p className="text-white/60 text-xs font-semibold mb-2 flex items-center gap-1.5">
                      <BrainCircuit className="w-3.5 h-3.5 text-purple-400" /> Your game review finished!
                    </p>
                    <div className="flex justify-center gap-2 flex-wrap">
                      {Object.entries(reviewStats.counts)
                        .sort(([,a],[,b]) => (b as number) - (a as number))
                        .slice(0, 5)
                        .map(([cls, count]) => (
                          <span key={cls} className="px-2 py-1 rounded-lg text-xs font-medium"
                            style={{ backgroundColor: `${CLASS_COLORS[cls] ?? '#888'}22`, color: CLASS_COLORS[cls] ?? '#888' }}
                          >
                            {CLASS_ICONS[cls] ?? '·'} {count} {cls}
                          </span>
                        ))
                      }
                    </div>
                    {reviewResult?.summary?.overview && (
                      <p className="text-white/40 text-[11px] mt-2 leading-relaxed line-clamp-2 text-center italic">
                        "{reviewResult.summary.overview}"
                      </p>
                    )}
                  </motion.div>
                )}

                <div className="grid grid-cols-2 gap-2 mb-5">
                  {[
                    { icon: BrainCircuit, text: 'Unlimited AI reviews', color: 'text-blue-400', bg: 'from-blue-500/10' },
                    { icon: Swords, text: 'Unlimited scouting', color: 'text-red-400', bg: 'from-red-500/10' },
                    { icon: GraduationCap, text: 'Custom courses', color: 'text-emerald-400', bg: 'from-emerald-500/10' },
                    { icon: Sparkles, text: 'Weakness analysis', color: 'text-purple-400', bg: 'from-purple-500/10' },
                  ].map((f, i) => (
                    <motion.div key={f.text}
                      className={`p-3 rounded-xl bg-gradient-to-br ${f.bg} to-transparent border border-white/5 flex items-center gap-2.5`}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
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
                        ) : `Try weekly instead — $${(weeklyPrice.unit_amount / 100).toFixed(0)}/week`}
                      </motion.button>
                    )}
                  </motion.div>
                )}

                <div className="flex items-center justify-center gap-5 text-white/25 text-[10px] mb-4">
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secure checkout</span>
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Cancel anytime</span>
                  <span>🔒 Stripe-powered</span>
                </div>

                <motion.button onClick={() => finish(!!scoutResult)}
                  className="w-full py-3 text-white/30 hover:text-white/50 text-sm transition-colors"
                  whileTap={{ scale: 0.98 }}
                >
                  Maybe later — {scoutResult ? 'see your scout report' : 'continue with free trial'}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export function useOnboardingCheck() {
  const { isAuthenticated, isAuthLoading, authUser } = useUser();
  const [show, setShow] = useState(false);
  const userKey = authUser?.id ? `${ONBOARDING_KEY}_${authUser.id}` : null;

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !userKey) return;
    const done = localStorage.getItem(userKey);
    if (!done) setShow(true);
  }, [isAuthenticated, isAuthLoading, userKey]);

  const dismissOnboarding = useCallback(() => {
    if (userKey) localStorage.setItem(userKey, 'done');
    setShow(false);
  }, [userKey]);

  return { showOnboarding: show, dismissOnboarding };
}
