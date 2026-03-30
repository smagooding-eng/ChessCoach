import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/hooks/use-user';
import { useMyOpenings } from '@/hooks/use-openings';
import { ChessBoard } from '@/components/ChessBoard';
import type { MoveQuality } from '@/components/ChessBoard';
import { Chess } from 'chess.js';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  BookOpen, TrendingUp, TrendingDown, Play, Swords, Target, ChevronRight as ChevronRightIcon,
  GraduationCap, RotateCcw, CheckCircle2, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type OpeningMove = {
  san: string;
  fen: string;
  moveNumber: number;
  color: 'white' | 'black';
};

type SampleGame = {
  id: number;
  result: string;
  whiteUsername: string;
  blackUsername: string;
  whiteRating: number;
  blackRating: number;
  playedAt: string;
  opening: string | null;
  eco: string | null;
};

type OpeningDetailData = {
  totalGames: number;
  sampleGames: SampleGame[];
  mainLine: OpeningMove[];
  openingName: string;
  eco: string | null;
};

function WinBar({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  const total = wins + losses + draws;
  if (total === 0) return <div className="h-2 w-full bg-secondary rounded-full" />;
  const wp = (wins / total) * 100;
  const lp = (losses / total) * 100;
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden">
      <div className="bg-emerald-500 transition-all" style={{ width: `${wp}%` }} />
      <div className="bg-secondary/60 flex-1" />
      <div className="bg-red-500 transition-all" style={{ width: `${lp}%` }} />
    </div>
  );
}

export function OpeningDetail() {
  const { eco } = useParams<{ eco: string }>();
  const { username } = useUser();
  const { data: openingsData } = useMyOpenings();

  // URL params: eco is URL-encoded opening name OR eco code
  const decodedParam = decodeURIComponent(eco ?? '');

  // Find this opening's stats from the list
  const openingStat = useMemo(() => {
    if (!openingsData?.openings) return null;
    return openingsData.openings.find(o =>
      o.eco === decodedParam || o.opening === decodedParam
    ) ?? null;
  }, [openingsData, decodedParam]);

  // Fetch opening detail (main line moves + sample games)
  const { data, isLoading, error } = useQuery<OpeningDetailData>({
    queryKey: ['/api/games/openings/detail', username, decodedParam],
    queryFn: async () => {
      const isEco = /^[A-E]\d{2}$/.test(decodedParam);
      const params = new URLSearchParams({ username: username ?? '' });
      if (isEco) params.set('eco', decodedParam);
      else params.set('opening', decodedParam);
      const res = await fetch(`/api/games/openings/detail?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!username && !!decodedParam,
  });

  // Board step state
  const [step, setStep] = useState(0);
  const mainLine = data?.mainLine ?? [];
  const maxStep = mainLine.length;

  const currentFen = step === 0 ? null : mainLine[step - 1]?.fen ?? null;

  // Compute lastMove highlight
  const lastMove = useMemo(() => {
    if (step === 0) return null;
    const move = mainLine[step - 1];
    if (!move?.san) return null;
    const prevFen = step === 1 ? undefined : mainLine[step - 2]?.fen;
    try {
      const chess = new Chess(prevFen);
      const result = chess.move(move.san);
      return result ? { from: result.from, to: result.to } : null;
    } catch { return null; }
  }, [step, mainLine]);

  // ── Practice Mode ────────────────────────────────────────────────────────────
  const [practicing, setPracticing] = useState(false);
  const [practiceStep, setPracticeStep] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [moveQuality, setMoveQuality] = useState<MoveQuality | null>(null);
  const [practiceComplete, setPracticeComplete] = useState(false);

  const practiceFen = practiceStep === 0 ? null : mainLine[practiceStep - 1]?.fen ?? null;
  const expectedMove = mainLine[practiceStep]?.san ?? null;

  const practiceLastMove = useMemo(() => {
    if (practiceStep === 0) return null;
    const move = mainLine[practiceStep - 1];
    if (!move?.san) return null;
    const prevFen = practiceStep === 1 ? undefined : mainLine[practiceStep - 2]?.fen;
    try {
      const chess = new Chess(prevFen);
      const result = chess.move(move.san);
      return result ? { from: result.from, to: result.to } : null;
    } catch { return null; }
  }, [practiceStep, mainLine]);

  const handlePracticeMove = useCallback((san: string, isCorrect: boolean) => {
    if (isCorrect) {
      setFeedback('correct');
      setMoveQuality('excellent');
      setTimeout(() => {
        setFeedback(null);
        setMoveQuality(null);
        const nextStep = practiceStep + 1;
        if (nextStep >= mainLine.length) {
          setPracticeComplete(true);
        } else {
          setPracticeStep(nextStep);
        }
      }, 900);
    } else {
      setFeedback('wrong');
      setMoveQuality('blunder');
      setTimeout(() => {
        setFeedback(null);
        setMoveQuality(null);
      }, 1200);
    }
  }, [practiceStep, mainLine.length]);

  function startPractice() {
    setPracticing(true);
    setPracticeStep(0);
    setFeedback(null);
    setMoveQuality(null);
    setPracticeComplete(false);
  }

  function resetPractice() {
    setPracticeStep(0);
    setFeedback(null);
    setMoveQuality(null);
    setPracticeComplete(false);
  }

  // Auto-play computer's moves (when it's not the user's expected move in practice mode)
  useEffect(() => {
    if (!practicing || practiceComplete || mainLine.length === 0) return;
    // Determine whose turn it is: even step = white to move, odd = black to move
    // The practice assumes user plays both sides following the main line
    // No auto-play needed — user plays each move in sequence
  }, [practicing, practiceStep, practiceComplete, mainLine]);

  // Other openings for sidebar (top 8 others)
  const otherOpenings = useMemo(() => {
    if (!openingsData?.openings) return [];
    return openingsData.openings
      .filter(o => o.eco !== (openingStat?.eco ?? decodedParam) && o.opening !== decodedParam)
      .slice(0, 8);
  }, [openingsData, openingStat, decodedParam]);

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-sm">Loading opening…</p>
    </div>
  );

  if (error || !data) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <BookOpen className="w-10 h-10 text-muted-foreground opacity-40" />
      <p className="text-lg font-bold">Opening not found</p>
      <Link href="/openings" className="text-primary text-sm hover:underline">← Back to Openings</Link>
    </div>
  );

  const stat = openingStat;
  const winRate = stat?.winRate ?? 0;
  const wins = stat?.wins ?? 0;
  const losses = stat?.losses ?? 0;
  const draws = stat?.draws ?? 0;
  const totalGames = stat?.totalGames ?? data.totalGames;
  const currentMoveData = step > 0 ? mainLine[step - 1] : null;

  return (
    <div className="space-y-6 pb-20">
      {/* Back */}
      <Link href="/openings" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Openings
      </Link>

      {/* Header */}
      <div className="glass-card rounded-2xl p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          {data.eco && (
            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-primary/15 text-primary border border-primary/20 mb-2">
              {data.eco}
            </span>
          )}
          <h1 className="text-2xl font-display font-bold leading-tight">{data.openingName}</h1>
          <p className="text-muted-foreground text-sm mt-1">{totalGames} games in your history</p>
        </div>

        {/* Win rate summary */}
        <div className="flex gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-400">{winRate}%</p>
            <p className="text-xs text-muted-foreground">Win rate</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-400">{wins}W</p>
            <p className="text-xs text-muted-foreground">Wins</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-400">{losses}L</p>
            <p className="text-xs text-muted-foreground">Losses</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-muted-foreground">{draws}D</p>
            <p className="text-xs text-muted-foreground">Draws</p>
          </div>
        </div>
      </div>

      {/* Win bar */}
      <div className="glass-card rounded-xl px-5 py-3 space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span className="text-emerald-400 font-medium">{wins} Wins</span>
          <span>{draws} Draws</span>
          <span className="text-red-400 font-medium">{losses} Losses</span>
        </div>
        <WinBar wins={wins} losses={losses} draws={draws} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">

        {/* ── Left: Board walkthrough + games ── */}
        <div className="space-y-5">

          {/* Section title + Practice toggle */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold">Opening {practicing ? 'Practice' : 'Walkthrough'}</h2>
              {!practicing && <span className="text-xs text-muted-foreground">— your most-played line</span>}
            </div>
            {mainLine.length > 0 && (
              <div className="flex gap-2">
                {practicing ? (
                  <>
                    <button onClick={resetPractice}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" /> Restart
                    </button>
                    <button onClick={() => setPracticing(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
                      <Target className="w-3.5 h-3.5" /> Walkthrough
                    </button>
                  </>
                ) : (
                  <button onClick={startPractice}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow shadow-primary/30 hover:bg-primary/90 transition-colors">
                    <GraduationCap className="w-3.5 h-3.5" /> Practice
                  </button>
                )}
              </div>
            )}
          </div>

          {mainLine.length === 0 ? (
            <div className="glass-card rounded-2xl py-16 text-center text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No game data available for this opening.</p>
            </div>
          ) : practicing ? (
            /* ── Practice Mode ─────────────────────────────────────── */
            <>
              {practiceComplete ? (
                <div className="glass-card rounded-2xl py-16 text-center space-y-4">
                  <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
                  <h3 className="text-2xl font-bold text-emerald-400">Line Complete!</h3>
                  <p className="text-muted-foreground">You played all {mainLine.length} moves correctly.</p>
                  <button onClick={resetPractice}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors">
                    <RotateCcw className="w-4 h-4" /> Practice Again
                  </button>
                </div>
              ) : (
                <>
                  <ChessBoard
                    fen={practiceFen}
                    flipped={false}
                    practiceMode={true}
                    expectedMoveSan={expectedMove}
                    onMovePlayed={handlePracticeMove}
                    lastMove={practiceLastMove}
                    moveQuality={moveQuality}
                  />

                  {/* Feedback banner */}
                  <AnimatePresence>
                    {feedback && (
                      <motion.div
                        key={feedback}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm
                          ${feedback === 'correct' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/15 border border-red-500/30 text-red-400'}`}
                      >
                        {feedback === 'correct'
                          ? <><CheckCircle2 className="w-4 h-4 shrink-0" /> Correct! Move {practiceStep} of {mainLine.length}</>
                          : <><XCircle className="w-4 h-4 shrink-0" /> Not quite — the correct move is <span className="font-mono font-bold ml-1">{expectedMove}</span>. Try again!</>
                        }
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Practice info */}
                  <div className="glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold
                        ${mainLine[practiceStep]?.color === 'white' ? 'bg-[#f0d9b5] text-black' : 'bg-[#2d2d2d] border border-white/20 text-white'}`}>
                        {mainLine[practiceStep]?.moveNumber}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Play move {practiceStep + 1} of {mainLine.length}</p>
                        <p className="text-xs text-muted-foreground">
                          {mainLine[practiceStep]?.color === 'white' ? 'White' : 'Black'} to move
                        </p>
                      </div>
                    </div>
                    {/* Progress */}
                    <div className="flex-1 max-w-[140px]">
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(practiceStep / mainLine.length) * 100}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground text-right mt-0.5">{practiceStep}/{mainLine.length}</p>
                    </div>
                  </div>

                  {/* Move list (shows played moves) */}
                  <div className="flex flex-wrap gap-1">
                    {mainLine.map((m, i) => (
                      <span key={i}
                        className={`px-2 py-0.5 rounded-lg font-mono text-xs
                          ${i < practiceStep ? 'bg-emerald-500/20 text-emerald-400' :
                            i === practiceStep ? 'bg-primary/20 text-primary ring-1 ring-primary/40 font-bold' :
                            'bg-secondary/50 text-muted-foreground/40'}`}
                      >
                        {m.color === 'white' ? `${m.moveNumber}.` : ''}{i < practiceStep ? m.san : '?'}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            /* ── Walkthrough Mode ──────────────────────────────────── */
            <>
              {/* Chess board */}
              <ChessBoard
                fen={currentFen}
                flipped={false}
                practiceMode={false}
                expectedMoveSan={null}
                onMovePlayed={() => {}}
                lastMove={lastMove}
                moveQuality={null}
              />

              {/* Move annotation */}
              <div className="glass-card rounded-xl px-4 py-3 min-h-[56px] flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                  ${currentMoveData?.color === 'white' ? 'bg-[#f0d9b5] border border-black/20' : 'bg-[#2d2d2d] border border-white/20'}`} />
                {currentMoveData ? (
                  <div>
                    <span className="font-mono font-bold text-lg text-foreground">{currentMoveData.moveNumber}{currentMoveData.color === 'white' ? '.' : '…'} {currentMoveData.san}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {currentMoveData.color === 'white' ? 'White' : 'Black'} · Move {step} of {maxStep}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Starting position — step through to see the opening</p>
                )}
              </div>

              {/* Controls */}
              <div className="glass-card rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <button onClick={() => setStep(0)} disabled={step === 0}
                    className="p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary disabled:opacity-40 transition-colors">
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                    className="p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary disabled:opacity-40 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setStep(s => Math.min(maxStep, s + 1))} disabled={step >= maxStep}
                    className="p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary disabled:opacity-40 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setStep(maxStep)} disabled={step >= maxStep}
                    className="p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary disabled:opacity-40 transition-colors">
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-xs text-muted-foreground font-mono">{step}/{maxStep} moves</div>

                {/* Move list inline */}
                <div className="flex flex-wrap gap-1 flex-1 justify-end">
                  {mainLine.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => setStep(i + 1)}
                      className={`px-2 py-0.5 rounded-lg font-mono text-xs transition-colors
                        ${step === i + 1 ? 'bg-primary text-primary-foreground font-bold' : 'bg-secondary hover:bg-white/10'}`}
                    >
                      {m.color === 'white' ? `${m.moveNumber}.` : ''}{m.san}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Your games with this opening */}
          {data.sampleGames.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Swords className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">Your Games</h2>
                <span className="text-xs text-muted-foreground">with this opening</span>
              </div>

              <div className="glass-card rounded-2xl divide-y divide-border/50 overflow-hidden">
                {data.sampleGames.map((game, i) => {
                  const isWhite = game.whiteUsername.toLowerCase() === username?.toLowerCase();
                  return (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.025] transition-colors"
                    >
                      <span className={`shrink-0 w-14 text-center py-1 rounded-lg text-xs font-bold uppercase tracking-wide
                        ${game.result === 'win'  ? 'bg-emerald-500/15 text-emerald-400' :
                          game.result === 'loss' ? 'bg-red-500/15 text-red-400' :
                                                   'bg-slate-500/15 text-slate-400'}`}>
                        {game.result === 'win' ? '✓ Win' : game.result === 'loss' ? '✗ Loss' : '½ Draw'}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isWhite ? 'bg-[#f0d9b5] border border-black/20' : 'bg-[#2d2d2d] border border-white/20'}`} />
                          <span className="font-medium truncate">
                            {isWhite ? `${game.whiteUsername} (${game.whiteRating}) vs ${game.blackUsername} (${game.blackRating})`
                                     : `${game.blackUsername} (${game.blackRating}) vs ${game.whiteUsername} (${game.whiteRating})`}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {game.playedAt ? new Date(game.playedAt).toLocaleDateString() : ''}
                        </p>
                      </div>

                      <Link href={`/games/${game.id}`}
                        className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-secondary text-primary hover:bg-primary hover:text-primary-foreground transition-all">
                        <Play className="w-4 h-4 ml-0.5" />
                      </Link>
                    </motion.div>
                  );
                })}
              </div>

              {totalGames > data.sampleGames.length && (
                <p className="text-xs text-muted-foreground text-center">
                  Showing {data.sampleGames.length} of {totalGames} games
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Other openings ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Other Openings</h2>
          </div>

          <div className="glass-card rounded-2xl divide-y divide-border/50 overflow-hidden">
            {otherOpenings.map((o, i) => {
              const linkParam = encodeURIComponent(o.eco ?? o.opening);
              const wr = o.winRate;
              const wrColor = wr >= 60 ? 'text-emerald-400' : wr >= 50 ? 'text-amber-400' : wr >= 40 ? 'text-orange-400' : 'text-red-400';
              return (
                <motion.div
                  key={o.opening}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={`/openings/${linkParam}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.025] transition-colors group"
                  >
                    {o.eco && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/15">
                        {o.eco}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{o.opening}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-muted-foreground">{o.totalGames}g</span>
                        <span className={`text-[10px] font-bold ${wrColor}`}>{wr}%</span>
                      </div>
                    </div>
                    <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 group-hover:text-primary transition-colors" />
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {/* As white / as black */}
          {stat && (
            <div className="glass-card rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">By Color</h3>

              {stat.white.games > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-[#f0d9b5] border border-black/20" />
                      <span className="font-medium">As White</span>
                      <span className="text-muted-foreground">{stat.white.games}g</span>
                    </div>
                    <span className={stat.white.winRate >= 50 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                      {stat.white.winRate}%
                    </span>
                  </div>
                  <WinBar wins={stat.white.wins} losses={stat.white.losses} draws={stat.white.draws} />
                </div>
              )}

              {stat.black.games > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-[#b58863]" />
                      <span className="font-medium">As Black</span>
                      <span className="text-muted-foreground">{stat.black.games}g</span>
                    </div>
                    <span className={stat.black.winRate >= 50 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                      {stat.black.winRate}%
                    </span>
                  </div>
                  <WinBar wins={stat.black.wins} losses={stat.black.losses} draws={stat.black.draws} />
                </div>
              )}
            </div>
          )}

          {/* Best/worst summary */}
          {openingsData && (() => {
            const all = openingsData.openings.filter(o => o.totalGames >= 3);
            const best = [...all].sort((a, b) => b.winRate - a.winRate)[0];
            const worst = [...all].sort((a, b) => a.winRate - b.winRate)[0];
            return (
              <div className="space-y-2">
                {best && (
                  <Link href={`/openings/${encodeURIComponent(best.eco ?? best.opening)}`}
                    className="glass-card rounded-xl p-3 flex items-center gap-3 hover:border-emerald-500/30 transition-colors group">
                    <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best opening</p>
                      <p className="text-xs font-bold line-clamp-1 group-hover:text-emerald-400 transition-colors">{best.opening}</p>
                    </div>
                    <span className="text-emerald-400 font-bold text-sm shrink-0">{best.winRate}%</span>
                  </Link>
                )}
                {worst && worst.opening !== best?.opening && (
                  <Link href={`/openings/${encodeURIComponent(worst.eco ?? worst.opening)}`}
                    className="glass-card rounded-xl p-3 flex items-center gap-3 hover:border-red-500/30 transition-colors group">
                    <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Needs work</p>
                      <p className="text-xs font-bold line-clamp-1 group-hover:text-red-400 transition-colors">{worst.opening}</p>
                    </div>
                    <span className="text-red-400 font-bold text-sm shrink-0">{worst.winRate}%</span>
                  </Link>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
