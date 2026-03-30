import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
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

  // If it looks like a FEN (contains / and spaces in FEN format, not a PGN)
  const looksLikeFen = /^[rnbqkpRNBQKP1-8\/]+ [wb] [KQkq-]+ [a-h\d-]+/.test(pgn.trim());
  if (looksLikeFen) {
    return [{ fen: pgn.trim(), san: null, comment: 'Study this position.', moveNum: 0, fullMoveNumber: 1, color: null }];
  }

  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    if (history.length === 0) return null;

    // Collect comments by undoing from the end
    const comments: string[] = new Array(history.length + 1).fill('');
    for (let i = history.length; i >= 0; i--) {
      comments[i] = chess.getComment() || '';
      if (i > 0) chess.undo();
    }

    // Now replay from start to collect FENs
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

interface LessonBoardPlayerProps {
  pgn: string;
  title?: string;
}

export function LessonBoardPlayer({ pgn, title }: LessonBoardPlayerProps) {
  const steps = parsePgnSteps(pgn);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [prevFen, setPrevFen] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);

  const step = steps?.[currentStep];
  const totalSteps = steps?.length ?? 1;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  const go = useCallback((idx: number) => {
    setPrevFen(steps?.[currentStep]?.fen ?? null);
    setCurrentStep(Math.max(0, Math.min(idx, totalSteps - 1)));
  }, [currentStep, totalSteps, steps]);

  // Auto-advance
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= totalSteps - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 2200);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, totalSteps]);

  // Scroll active move into view
  useEffect(() => {
    const el = moveListRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentStep]);

  if (!steps) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-center text-sm text-muted-foreground">
        No board position available for this lesson.
      </div>
    );
  }

  // Build move-pair list for display
  const movePairs: { num: number; white: number; black: number | null }[] = [];
  for (let i = 1; i < steps.length; i += 2) {
    movePairs.push({ num: Math.ceil(i / 2), white: i, black: i + 1 < steps.length ? i + 1 : null });
  }

  const hasComment = step && step.comment.trim().length > 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/8 bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white/3 border-b border-white/5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        <span className="text-xs text-muted-foreground ml-2 font-mono">{title ?? 'Interactive Position'}</span>
        <div className="ml-auto text-xs text-muted-foreground font-mono">
          {currentStep > 0 ? `Move ${step?.fullMoveNumber} (${step?.color === 'w' ? '♔' : '♚'})` : 'Start'}
        </div>
      </div>

      <div className="flex flex-col md:flex-row">
        {/* Board */}
        <div className="flex-shrink-0 p-3 md:p-4">
          <div className="relative w-full max-w-[340px] mx-auto">
            <Chessboard
              position={step?.fen}
              allowDragging={false}
              boardWidth={340}
              customBoardStyle={{ borderRadius: '8px', overflow: 'hidden' }}
              customDarkSquareStyle={{ backgroundColor: '#2d4a3e' }}
              customLightSquareStyle={{ backgroundColor: '#6dae7f' }}
            />
            {/* Move flash overlay */}
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

        {/* Right panel: comment + move list */}
        <div className="flex-1 flex flex-col min-h-0 border-t md:border-t-0 md:border-l border-white/5">
          {/* Comment */}
          <div className="px-4 py-4 min-h-[90px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {hasComment ? (
                  <div className="flex items-start gap-2.5">
                    <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground/85 leading-relaxed">{step.comment}</p>
                  </div>
                ) : currentStep === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Press play to walk through the lesson, or click any move below.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {step?.san ? `${step.color === 'w' ? 'White' : 'Black'} plays ${step.san}.` : ''}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Move list */}
          {movePairs.length > 0 && (
            <div
              ref={moveListRef}
              className="flex-1 overflow-y-auto px-3 pb-3 max-h-[160px] md:max-h-[200px]"
            >
              <div className="grid grid-cols-[32px_1fr_1fr] gap-0.5 text-sm font-mono">
                {movePairs.map(({ num, white, black }) => (
                  <React.Fragment key={num}>
                    <div className="flex items-center text-muted-foreground/50 text-xs px-1 py-1">{num}.</div>
                    <button
                      data-active={currentStep === white}
                      onClick={() => go(white)}
                      className={cn(
                        'text-left px-2 py-1 rounded transition-colors text-xs',
                        currentStep === white
                          ? 'bg-primary text-primary-foreground font-bold'
                          : 'text-foreground/70 hover:bg-white/5'
                      )}
                    >
                      {steps[white]?.san}
                    </button>
                    {black != null ? (
                      <button
                        data-active={currentStep === black}
                        onClick={() => go(black)}
                        className={cn(
                          'text-left px-2 py-1 rounded transition-colors text-xs',
                          currentStep === black
                            ? 'bg-primary text-primary-foreground font-bold'
                            : 'text-foreground/70 hover:bg-white/5'
                        )}
                      >
                        {steps[black]?.san}
                      </button>
                    ) : <div />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/5 bg-white/2">
            <button
              onClick={() => { setIsPlaying(false); go(0); }}
              disabled={isFirst}
              className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
              title="Go to start"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={() => go(currentStep - 1)}
              disabled={isFirst}
              className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
              title="Previous move"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsPlaying(p => !p)}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_16px_rgba(202,138,4,0.3)]"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <button
              onClick={() => go(currentStep + 1)}
              disabled={isLast}
              className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
              title="Next move"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => { setIsPlaying(false); go(totalSteps - 1); }}
              disabled={isLast}
              className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
              title="Go to end"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Step progress bar */}
          <div className="h-1 bg-white/5">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${(currentStep / Math.max(totalSteps - 1, 1)) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
