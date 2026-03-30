import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import {
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  MessageSquare, Swords, CheckCircle2, Lightbulb, Eye, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Step {
  fen: string;
  san: string | null;
  comment: string;
  moveNum: number;
  fullMoveNumber: number;
  color: 'w' | 'b' | null;
}

function parsePgnSteps(pgn: string): Step[] | null {
  if (!pgn || pgn.trim() === '') return null;

  const looksLikeFen = /^[rnbqkpRNBQKP1-8\/]+ [wb] [KQkq-]+ [a-h\d-]+/.test(pgn.trim());
  if (looksLikeFen) {
    return [{ fen: pgn.trim(), san: null, comment: 'Study this position.', moveNum: 0, fullMoveNumber: 1, color: null }];
  }

  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    if (history.length === 0) return null;

    const comments: string[] = new Array(history.length + 1).fill('');
    for (let i = history.length; i >= 0; i--) {
      comments[i] = chess.getComment() || '';
      if (i > 0) chess.undo();
    }

    const player = new Chess();
    const steps: Step[] = [
      { fen: player.fen(), san: null, comment: comments[0], moveNum: 0, fullMoveNumber: 1, color: null },
    ];

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      player.move(move.san);
      steps.push({
        fen: player.fen(),
        san: move.san,
        comment: comments[i + 1],
        moveNum: i + 1,
        fullMoveNumber: Math.floor(i / 2) + 1,
        color: i % 2 === 0 ? 'w' : 'b',
      });
    }

    return steps;
  } catch {
    return null;
  }
}

type DrillState = 'idle' | 'correct' | 'wrong' | 'revealed';

interface LessonBoardPlayerProps {
  pgn: string;
  title?: string;
  drillFen?: string | null;
  drillExpectedMove?: string | null;
  drillHint?: string | null;
}

export function LessonBoardPlayer({ pgn, title, drillFen, drillExpectedMove, drillHint }: LessonBoardPlayerProps) {
  const steps = parsePgnSteps(pgn);
  const [tab, setTab] = useState<'lesson' | 'drill'>('lesson');
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [prevFen, setPrevFen] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);

  // Drill state
  const [drillState, setDrillState] = useState<DrillState>('idle');
  const [drillAttempts, setDrillAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [drillPosition, setDrillPosition] = useState<string>(() => drillFen || '');

  const step = steps?.[currentStep];
  const totalSteps = steps?.length ?? 1;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  const go = useCallback((idx: number) => {
    setPrevFen(steps?.[currentStep]?.fen ?? null);
    setCurrentStep(Math.max(0, Math.min(idx, totalSteps - 1)));
  }, [currentStep, totalSteps, steps]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= totalSteps - 1) { setIsPlaying(false); return prev; }
          return prev + 1;
        });
      }, 2200);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, totalSteps]);

  useEffect(() => {
    const el = moveListRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentStep]);

  const hasDrill = !!(drillFen && drillExpectedMove);

  // Drill: handle piece drop
  const handleDrillDrop = useCallback((args: { sourceSquare: string; targetSquare: string | null; piece: unknown }) => {
    if (drillState === 'correct' || drillState === 'revealed') return false;
    if (!drillFen || !drillExpectedMove || !args.targetSquare) return false;

    try {
      const chess = new Chess(drillFen);
      const move = chess.move({ from: args.sourceSquare, to: args.targetSquare, promotion: 'q' });
      if (!move) return false;

      // Normalize comparison: strip trailing +/#, compare SAN
      const normalize = (s: string) => s.replace(/[+#!?]/g, '').trim();
      const isCorrect = normalize(move.san) === normalize(drillExpectedMove) ||
        move.to === drillExpectedMove.slice(-2); // fallback to target square match

      setDrillAttempts(a => a + 1);
      if (isCorrect) {
        setDrillPosition(chess.fen());
        setDrillState('correct');
        return true;
      } else {
        setDrillState('wrong');
        setTimeout(() => setDrillState('idle'), 1200);
        return false;
      }
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillFen, drillExpectedMove, drillState]);

  const resetDrill = () => {
    setDrillState('idle');
    setDrillAttempts(0);
    setShowHint(false);
    setDrillPosition(drillFen || '');
  };

  const revealAnswer = () => {
    if (!drillFen || !drillExpectedMove) return;
    try {
      const chess = new Chess(drillFen);
      chess.move(drillExpectedMove);
      setDrillPosition(chess.fen());
    } catch { /* ignore */ }
    setDrillState('revealed');
  };

  if (!steps) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-center text-sm text-muted-foreground">
        No board position available for this lesson.
      </div>
    );
  }

  const movePairs: { num: number; white: number; black: number | null }[] = [];
  for (let i = 1; i < steps.length; i += 2) {
    movePairs.push({ num: Math.ceil(i / 2), white: i, black: i + 1 < steps.length ? i + 1 : null });
  }

  const hasComment = step && step.comment.trim().length > 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/8 bg-[#0d1117]">
      {/* Header with tabs */}
      <div className="flex items-center px-4 py-0 bg-white/3 border-b border-white/5">
        <div className="flex items-center gap-2 mr-4">
          <div className="w-2 h-2 rounded-full bg-red-500/80" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/80" />
          <div className="w-2 h-2 rounded-full bg-green-500/80" />
        </div>
        <button
          onClick={() => setTab('lesson')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors',
            tab === 'lesson'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Play className="w-3 h-3" /> Lesson
        </button>
        {hasDrill && (
          <button
            onClick={() => { setTab('drill'); resetDrill(); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors',
              tab === 'drill'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Swords className="w-3 h-3" /> Practice Drill
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground font-mono pr-2">
          {tab === 'lesson'
            ? (currentStep > 0 ? `Move ${step?.fullMoveNumber}` : title ?? 'Interactive')
            : 'Find the best move'}
        </span>
      </div>

      {/* LESSON TAB */}
      {tab === 'lesson' && (
        <div className="flex flex-col md:flex-row">
          <div className="flex-shrink-0 p-3 md:p-4">
            <div className="relative w-full max-w-[360px] mx-auto">
              <Chessboard
                options={{
                  position: step?.fen,
                  allowDragging: false,
                  boardStyle: { borderRadius: '8px', overflow: 'hidden' },
                  darkSquareStyle: { backgroundColor: '#2d4a3e' },
                  lightSquareStyle: { backgroundColor: '#6dae7f' },
                  animationDurationInMs: 180,
                }}
              />
              <AnimatePresence>
                {prevFen !== step?.fen && step?.san && (
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0.35 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                    className="absolute inset-0 bg-primary/20 rounded-lg pointer-events-none"
                  />
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 border-t md:border-t-0 md:border-l border-white/5">
            <div className="px-4 py-4 min-h-[90px] flex flex-col justify-center">
              <AnimatePresence mode="wait">
                <motion.div key={currentStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                  {hasComment ? (
                    <div className="flex items-start gap-2.5">
                      <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm text-foreground/85 leading-relaxed">{step.comment}</p>
                    </div>
                  ) : currentStep === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Press play to walk through the lesson, or click any move below.</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">{step?.san ? `${step.color === 'w' ? 'White' : 'Black'} plays ${step.san}.` : ''}</p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {movePairs.length > 0 && (
              <div ref={moveListRef} className="flex-1 overflow-y-auto px-3 pb-3 max-h-[160px] md:max-h-[200px]">
                <div className="grid grid-cols-[32px_1fr_1fr] gap-0.5 text-sm font-mono">
                  {movePairs.map(({ num, white, black }) => (
                    <React.Fragment key={num}>
                      <div className="flex items-center text-muted-foreground/50 text-xs px-1 py-1">{num}.</div>
                      <button data-active={currentStep === white} onClick={() => go(white)}
                        className={cn('text-left px-2 py-1 rounded transition-colors text-xs', currentStep === white ? 'bg-primary text-primary-foreground font-bold' : 'text-foreground/70 hover:bg-white/5')}>
                        {steps[white]?.san}
                      </button>
                      {black != null ? (
                        <button data-active={currentStep === black} onClick={() => go(black)}
                          className={cn('text-left px-2 py-1 rounded transition-colors text-xs', currentStep === black ? 'bg-primary text-primary-foreground font-bold' : 'text-foreground/70 hover:bg-white/5')}>
                          {steps[black]?.san}
                        </button>
                      ) : <div />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/5 bg-white/2">
              <button onClick={() => { setIsPlaying(false); go(0); }} disabled={isFirst} className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" title="Go to start"><SkipBack className="w-4 h-4" /></button>
              <button onClick={() => go(currentStep - 1)} disabled={isFirst} className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setIsPlaying(p => !p)} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_16px_rgba(202,138,4,0.3)]">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button onClick={() => go(currentStep + 1)} disabled={isLast} className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              <button onClick={() => { setIsPlaying(false); go(totalSteps - 1); }} disabled={isLast} className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" title="Go to end"><SkipForward className="w-4 h-4" /></button>
            </div>

            <div className="h-1 bg-white/5">
              <motion.div className="h-full bg-primary" animate={{ width: `${(currentStep / Math.max(totalSteps - 1, 1)) * 100}%` }} transition={{ duration: 0.3 }} />
            </div>

            {/* CTA to drill if available */}
            {hasDrill && isLast && (
              <div className="px-4 py-3 border-t border-white/5 bg-primary/5">
                <button
                  onClick={() => { setTab('drill'); resetDrill(); }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold text-primary hover:bg-primary/10 transition-colors"
                >
                  <Swords className="w-4 h-4" /> Test your knowledge → Practice Drill
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DRILL TAB */}
      {tab === 'drill' && hasDrill && (
        <div className="flex flex-col md:flex-row">
          <div className="flex-shrink-0 p-3 md:p-4">
            <div className="relative w-full max-w-[360px] mx-auto">
              <Chessboard
                options={{
                  position: drillState === 'idle' || drillState === 'wrong' ? drillFen! : drillPosition,
                  allowDragging: drillState !== 'correct' && drillState !== 'revealed',
                  onPieceDrop: drillState === 'correct' || drillState === 'revealed' ? () => false : handleDrillDrop,
                  boardStyle: { borderRadius: '8px', overflow: 'hidden' },
                  darkSquareStyle: { backgroundColor: '#2d4a3e' },
                  lightSquareStyle: { backgroundColor: '#6dae7f' },
                  animationDurationInMs: 180,
                }}
              />
              {/* Overlay feedback */}
              <AnimatePresence>
                {drillState === 'correct' && (
                  <motion.div key="correct" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 rounded-lg flex items-center justify-center bg-emerald-500/20 pointer-events-none">
                    <div className="bg-emerald-500 text-white font-black text-2xl px-6 py-3 rounded-2xl shadow-lg">✓ Correct!</div>
                  </motion.div>
                )}
                {drillState === 'wrong' && (
                  <motion.div key="wrong" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 rounded-lg flex items-center justify-center bg-red-500/20 pointer-events-none">
                    <div className="bg-red-500 text-white font-black text-xl px-6 py-3 rounded-2xl shadow-lg">✗ Try again</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 border-t md:border-t-0 md:border-l border-white/5 p-4 gap-4">
            {/* Drill prompt */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Swords className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground mb-1">Find the best move</p>
                <p className="text-xs text-muted-foreground">
                  {drillState === 'correct'
                    ? `Excellent! ${drillExpectedMove} was the right move.`
                    : drillState === 'revealed'
                    ? `The answer was ${drillExpectedMove}.`
                    : 'Drag a piece on the board to make your move.'}
                </p>
                {drillAttempts > 0 && drillState !== 'correct' && drillState !== 'revealed' && (
                  <p className="text-xs text-amber-400 mt-1">{drillAttempts} attempt{drillAttempts > 1 ? 's' : ''} so far</p>
                )}
              </div>
            </div>

            {/* Feedback card */}
            <AnimatePresence mode="wait">
              {drillState === 'correct' && (
                <motion.div key="correct-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-400">Correct — {drillExpectedMove}!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">You solved it{drillAttempts > 1 ? ` in ${drillAttempts} attempts` : ' on the first try'}.</p>
                  </div>
                </motion.div>
              )}
              {drillState === 'revealed' && (
                <motion.div key="revealed-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <Eye className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-400">Answer: {drillExpectedMove}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Study why this move is best, then try again.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hint */}
            {drillHint && drillState === 'idle' && (
              <div>
                {showHint ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <Lightbulb className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-300">{drillHint}</p>
                  </motion.div>
                ) : (
                  <button onClick={() => setShowHint(true)} className="text-xs text-muted-foreground hover:text-blue-400 flex items-center gap-1.5 transition-colors">
                    <Lightbulb className="w-3.5 h-3.5" /> Show hint
                  </button>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-auto flex items-center gap-2 flex-wrap">
              <button onClick={resetDrill} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 border border-border transition-all">
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
              {drillState === 'idle' && drillAttempts >= 2 && (
                <button onClick={revealAnswer} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-amber-400 hover:bg-amber-500/10 border border-amber-500/30 transition-all">
                  <Eye className="w-3.5 h-3.5" /> Reveal answer
                </button>
              )}
              {(drillState === 'correct' || drillState === 'revealed') && (
                <button onClick={() => setTab('lesson')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all">
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to lesson
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
