import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import {
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  MessageSquare, Swords, CheckCircle2, Lightbulb, Eye, RotateCcw,
  Trophy, Repeat2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface Step {
  fen: string;
  san: string | null;
  comment: string;
  moveNum: number;
  fullMoveNumber: number;
  color: 'w' | 'b' | null;
  isMistake?: boolean;
  from?: string;
  to?: string;
}

function parsePgnSteps(pgn: string): Step[] | null {
  if (!pgn || pgn.trim() === '') return null;

  const looksLikeFen = /^[rnbqkpRNBQKP1-8\/]+ [wb] [KQkq-]+ [a-h\d-]+/.test(pgn.trim());
  if (looksLikeFen) {
    return [{ fen: pgn.trim(), san: null, comment: 'Study this position.', moveNum: 0, fullMoveNumber: 1, color: null }];
  }

  const fenHeaderMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/i);

  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });

    if (history.length === 0 && fenHeaderMatch) {
      try {
        const fen = fenHeaderMatch[1];
        new Chess(fen);
        return [{ fen, san: null, comment: 'Study this position.', moveNum: 0, fullMoveNumber: parseInt(fen.split(' ')[5]) || 1, color: null }];
      } catch {}
    }

    if (history.length === 0) return null;

    const comments: string[] = new Array(history.length + 1).fill('');
    for (let i = history.length; i >= 0; i--) {
      comments[i] = chess.getComment() || '';
      if (i > 0) chess.undo();
    }

    const fenHeader = chess.header()?.FEN;
    const startFen = fenHeader || START_FEN;

    const startFullMove = fenHeader
      ? (parseInt(startFen.split(' ')[5]) || 1)
      : 1;
    const startColor = startFen.split(' ')[1] === 'b' ? 1 : 0;

    const player = new Chess(startFen);
    const steps: Step[] = [
      { fen: startFen, san: null, comment: comments[0], moveNum: 0, fullMoveNumber: startFullMove, color: null },
    ];

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      player.move(move.san);
      const rawComment = comments[i + 1];
      const isMistake = /^\s*\[mistake\]\s*/i.test(rawComment);
      const cleanComment = isMistake ? rawComment.replace(/^\s*\[mistake\]\s*/i, '') : rawComment;

      const globalIdx = startColor + i;
      const fullMoveNumber = startFullMove + Math.floor(globalIdx / 2);
      const color: 'w' | 'b' = globalIdx % 2 === 0 ? 'w' : 'b';

      steps.push({
        fen: player.fen(),
        san: move.san,
        comment: cleanComment,
        moveNum: i + 1,
        fullMoveNumber,
        color,
        isMistake,
        from: move.from,
        to: move.to,
      });
    }

    return steps;
  } catch {
    if (fenHeaderMatch) {
      try {
        const fen = fenHeaderMatch[1];
        new Chess(fen);
        return [{ fen, san: null, comment: 'Study this position.', moveNum: 0, fullMoveNumber: parseInt(fen.split(' ')[5]) || 1, color: null }];
      } catch {}
    }
    return null;
  }
}

type DrillState = 'idle' | 'correct' | 'wrong' | 'revealed';
type Tab = 'lesson' | 'drill' | 'repeat';

interface LessonBoardPlayerProps {
  pgn: string;
  title?: string;
  drillFen?: string | null;
  drillExpectedMove?: string | null;
  drillHint?: string | null;
}

export function LessonBoardPlayer({ pgn, title, drillFen, drillExpectedMove, drillHint }: LessonBoardPlayerProps) {
  const steps = parsePgnSteps(pgn);
  const [tab, setTab] = useState<Tab>('lesson');
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [prevFen, setPrevFen] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);

  // ── Drill state ──────────────────────────────────────────────────────────────
  const [drillState, setDrillState] = useState<DrillState>('idle');
  const [drillAttempts, setDrillAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [drillPosition, setDrillPosition] = useState<string>(() => drillFen || '');

  // ── Repeat drill state ───────────────────────────────────────────────────────
  const totalRepeatMoves = Math.max((steps?.length ?? 1) - 1, 0);
  const [repeatStep, setRepeatStep] = useState(0);
  const [repeatPosition, setRepeatPosition] = useState(() => steps?.[0]?.fen ?? START_FEN);
  const [repeatFeedback, setRepeatFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [repeatFirstTry, setRepeatFirstTry] = useState<boolean[]>(() => new Array(totalRepeatMoves).fill(true));
  const [repeatAttempts, setRepeatAttempts] = useState(0);
  const [repeatComplete, setRepeatComplete] = useState(false);

  const repeatFirstTryScore = repeatFirstTry.filter(Boolean).length;

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

  // Scroll move list — container-only, never the page
  useEffect(() => {
    const container = moveListRef.current;
    const active = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !active) return;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const btnTop = active.offsetTop;
    const btnBottom = btnTop + active.offsetHeight;
    if (btnTop < containerTop) container.scrollTop = btnTop - 8;
    else if (btnBottom > containerBottom) container.scrollTop = btnBottom - container.clientHeight + 8;
  }, [currentStep]);

  const hasDrill = !!(drillFen && drillExpectedMove);
  const hasRepeat = (steps?.length ?? 0) > 1;

  const [drillSelectedSq, setDrillSelectedSq] = useState<string | null>(null);
  const [repeatSelectedSq, setRepeatSelectedSq] = useState<string | null>(null);

  const getDrillLegalTargets = useCallback((sq: string | null): string[] => {
    if (!sq || !drillFen) return [];
    try {
      const chess = new Chess(drillFen);
      return chess.moves({ square: sq as any, verbose: true }).map(m => m.to);
    } catch { return []; }
  }, [drillFen]);

  const getRepeatLegalTargets = useCallback((sq: string | null): string[] => {
    if (!sq || !steps) return [];
    try {
      const chess = new Chess(steps[repeatStep]?.fen ?? START_FEN);
      return chess.moves({ square: sq as any, verbose: true }).map(m => m.to);
    } catch { return []; }
  }, [steps, repeatStep]);

  const drillLegalTargets = useMemo(() => getDrillLegalTargets(drillSelectedSq), [drillSelectedSq, getDrillLegalTargets]);
  const repeatLegalTargets = useMemo(() => getRepeatLegalTargets(repeatSelectedSq), [repeatSelectedSq, getRepeatLegalTargets]);

  const drillSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (drillSelectedSq) styles[drillSelectedSq] = { background: 'rgba(100, 180, 255, 0.55)', borderRadius: '4px' };
    for (const sq of drillLegalTargets) styles[sq] = { background: 'radial-gradient(circle, rgba(100,180,255,0.55) 28%, transparent 30%)' };
    return styles;
  }, [drillSelectedSq, drillLegalTargets]);

  const repeatSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (repeatSelectedSq) styles[repeatSelectedSq] = { background: 'rgba(100, 180, 255, 0.55)', borderRadius: '4px' };
    for (const sq of repeatLegalTargets) styles[sq] = { background: 'radial-gradient(circle, rgba(100,180,255,0.55) 28%, transparent 30%)' };
    return styles;
  }, [repeatSelectedSq, repeatLegalTargets]);

  // ── Drill handlers ───────────────────────────────────────────────────────────
  const handleDrillDrop = useCallback((args: { sourceSquare: string; targetSquare: string | null; piece: unknown }) => {
    if (drillState === 'correct' || drillState === 'revealed') return false;
    if (!drillFen || !drillExpectedMove || !args.targetSquare) return false;

    try {
      const chess = new Chess(drillFen);
      const move = chess.move({ from: args.sourceSquare, to: args.targetSquare, promotion: 'q' });
      if (!move) return false;

      const normalize = (s: string) => s.replace(/[+#!?]/g, '').trim();
      const isCorrect = normalize(move.san) === normalize(drillExpectedMove) ||
        move.to === drillExpectedMove.slice(-2);

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
  }, [drillFen, drillExpectedMove, drillState]);

  const handleDrillSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (drillState === 'correct' || drillState === 'revealed' || !drillFen) return;
    if (drillSelectedSq) {
      if (square === drillSelectedSq) { setDrillSelectedSq(null); return; }
      if (drillLegalTargets.includes(square)) {
        handleDrillDrop({ sourceSquare: drillSelectedSq, targetSquare: square, piece: null });
        setDrillSelectedSq(null);
        return;
      }
      if (piece) { setDrillSelectedSq(square); } else { setDrillSelectedSq(null); }
      return;
    }
    if (piece) {
      try {
        const chess = new Chess(drillFen);
        if (piece.pieceType[0].toLowerCase() === chess.turn()) setDrillSelectedSq(square);
      } catch { setDrillSelectedSq(square); }
    }
  }, [drillState, drillFen, drillSelectedSq, drillLegalTargets, handleDrillDrop]);

  const resetDrill = () => {
    setDrillState('idle');
    setDrillAttempts(0);
    setShowHint(false);
    setDrillPosition(drillFen || '');
    setDrillSelectedSq(null);
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

  // ── Repeat drill handlers ────────────────────────────────────────────────────
  const repeatUserColor = steps?.[1]?.color ?? 'w';

  const handleRepeatDrop = useCallback((args: { sourceSquare: string; targetSquare: string | null; piece: unknown }) => {
    if (repeatComplete || !args.targetSquare || !steps) return false;
    const expected = steps[repeatStep + 1]?.san;
    if (!expected) return false;

    try {
      const chess = new Chess(steps[repeatStep].fen);
      const move = chess.move({ from: args.sourceSquare, to: args.targetSquare, promotion: 'q' });
      if (!move) return false;

      const normalize = (s: string) => s.replace(/[+#!?]/g, '').trim();
      const isCorrect = normalize(move.san) === normalize(expected) ||
        move.to === expected.slice(-2);

      const wasFirstTry = repeatAttempts === 0;

      if (isCorrect) {
        if (!wasFirstTry) {
          setRepeatFirstTry(prev => { const n = [...prev]; n[repeatStep] = false; return n; });
        }
        setRepeatPosition(chess.fen());
        setRepeatFeedback('correct');
        setRepeatAttempts(0);

        setTimeout(() => {
          setRepeatFeedback(null);
          const next = repeatStep + 1;
          if (next >= (steps.length - 1)) {
            setRepeatComplete(true);
          } else {
            setRepeatStep(next);
          }
        }, 700);
        return true;
      } else {
        setRepeatFirstTry(prev => { const n = [...prev]; n[repeatStep] = false; return n; });
        setRepeatAttempts(a => a + 1);
        setRepeatFeedback('wrong');
        setTimeout(() => setRepeatFeedback(null), 700);
        return false;
      }
    } catch {
      return false;
    }
  }, [repeatStep, repeatComplete, steps, repeatAttempts]);

  const handleRepeatSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (repeatComplete || !steps) return;
    const nextMove = steps[repeatStep + 1];
    if (!nextMove || nextMove.color !== repeatUserColor) return;
    if (repeatSelectedSq) {
      if (square === repeatSelectedSq) { setRepeatSelectedSq(null); return; }
      if (repeatLegalTargets.includes(square)) {
        handleRepeatDrop({ sourceSquare: repeatSelectedSq, targetSquare: square, piece: null });
        setRepeatSelectedSq(null);
        return;
      }
      if (piece) { setRepeatSelectedSq(square); } else { setRepeatSelectedSq(null); }
      return;
    }
    if (piece) {
      try {
        const chess = new Chess(steps[repeatStep]?.fen ?? START_FEN);
        if (piece.pieceType[0].toLowerCase() === chess.turn()) setRepeatSelectedSq(square);
      } catch { setRepeatSelectedSq(square); }
    }
  }, [repeatComplete, steps, repeatStep, repeatUserColor, repeatSelectedSq, repeatLegalTargets, handleRepeatDrop]);

  useEffect(() => {
    if (tab !== 'repeat' || repeatComplete || !steps) return;
    const nextMove = steps[repeatStep + 1];
    if (!nextMove || !nextMove.color) return;
    if (nextMove.color === repeatUserColor) return;

    const timer = setTimeout(() => {
      try {
        const chess = new Chess(steps[repeatStep].fen);
        chess.move(nextMove.san!);
        setRepeatPosition(chess.fen());
        const next = repeatStep + 1;
        if (next >= steps.length - 1) {
          setRepeatComplete(true);
        } else {
          setRepeatStep(next);
        }
      } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, [tab, repeatStep, repeatComplete, steps, repeatUserColor]);

  const canRepeatDrag = useCallback(({ piece }: { piece: { pieceType: string } | null }) => {
    if (repeatComplete || !piece || !steps) return false;
    const nextMove = steps[repeatStep + 1];
    if (!nextMove || nextMove.color !== repeatUserColor) return false;
    try {
      const chess = new Chess(steps[repeatStep]?.fen ?? START_FEN);
      return piece.pieceType[0].toLowerCase() === chess.turn();
    } catch { return false; }
  }, [repeatStep, repeatComplete, steps, repeatUserColor]);

  const resetRepeat = () => {
    setRepeatStep(0);
    setRepeatPosition(steps?.[0]?.fen ?? START_FEN);
    setRepeatFeedback(null);
    setRepeatFirstTry(new Array(totalRepeatMoves).fill(true));
    setRepeatAttempts(0);
    setRepeatComplete(false);
    setRepeatSelectedSq(null);
  };

  if (!steps) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-center text-sm text-muted-foreground">
        No board position available for this lesson.
      </div>
    );
  }

  const movePairs: { num: number; white: number; black: number | null }[] = [];
  const firstMoveColor = steps[1]?.color;
  if (firstMoveColor === 'b') {
    movePairs.push({ num: steps[1].fullMoveNumber, white: -1, black: 1 });
    for (let i = 2; i < steps.length; i += 2) {
      movePairs.push({ num: steps[i].fullMoveNumber, white: i, black: i + 1 < steps.length ? i + 1 : null });
    }
  } else {
    for (let i = 1; i < steps.length; i += 2) {
      movePairs.push({ num: steps[i].fullMoveNumber, white: i, black: i + 1 < steps.length ? i + 1 : null });
    }
  }

  const hasComment = step && step.comment.trim().length > 0;

  // Repeat progress display
  const repeatExpectedSan = steps[repeatStep + 1]?.san ?? null;
  const repeatColor = steps[repeatStep + 1]?.color ?? null;
  const repeatFullMove = steps[repeatStep + 1]?.fullMoveNumber ?? null;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/8 bg-[#0d1117]">
      {/* ── Tab header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center px-4 py-0 bg-white/3 border-b border-white/5 overflow-x-auto">
        <div className="flex items-center gap-2 mr-4 shrink-0">
          <div className="w-2 h-2 rounded-full bg-red-500/80" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/80" />
          <div className="w-2 h-2 rounded-full bg-green-500/80" />
        </div>

        <button
          onClick={() => { setIsPlaying(false); setTab('lesson'); }}
          className={cn(
            'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
            tab === 'lesson' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Play className="w-3 h-3" /> Lesson
        </button>

        {hasRepeat && (
          <button
            onClick={() => { setIsPlaying(false); setTab('repeat'); resetRepeat(); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
              tab === 'repeat' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Repeat2 className="w-3 h-3" /> Repeat Drill
          </button>
        )}

        {hasDrill && (
          <button
            onClick={() => { setIsPlaying(false); setTab('drill'); resetDrill(); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
              tab === 'drill' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Swords className="w-3 h-3" /> Practice Drill
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground font-mono pr-2 shrink-0">
          {tab === 'lesson'
            ? (currentStep > 0 ? `Move ${step?.fullMoveNumber}` : title ?? 'Interactive')
            : tab === 'repeat'
            ? (repeatComplete ? 'Complete!' : `${repeatStep}/${totalRepeatMoves} moves`)
            : 'Find the best move'}
        </span>
      </div>

      {/* ── LESSON TAB ──────────────────────────────────────────────────────── */}
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
                  squareStyles: (() => {
                    const styles: Record<string, React.CSSProperties> = {};
                    if (step?.isMistake && step.from && step.to) {
                      styles[step.from] = { background: 'rgba(220, 50, 50, 0.35)' };
                      styles[step.to] = { background: 'rgba(220, 50, 50, 0.55)' };
                    } else if (step?.from && step?.to && currentStep > 0) {
                      styles[step.from] = { background: 'rgba(255, 240, 80, 0.25)' };
                      styles[step.to] = { background: 'rgba(255, 240, 80, 0.45)' };
                    }
                    return styles;
                  })(),
                }}
              />
              {step?.isMistake && (
                <div className="absolute top-2 right-2 pointer-events-none z-10">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg backdrop-blur-sm border bg-red-950/90 text-red-300 border-red-400/40">
                    <span>?</span>
                    <span>Mistake</span>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {prevFen !== step?.fen && step?.san && (
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0.35 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                    className={`absolute inset-0 ${step?.isMistake ? 'bg-red-500/20' : 'bg-primary/20'} rounded-lg pointer-events-none`}
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
                      {step.isMistake ? (
                        <div className="w-4 h-4 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-red-400 text-[10px] font-bold">!</span>
                        </div>
                      ) : (
                        <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      )}
                      <p className={cn('text-sm leading-relaxed', step.isMistake ? 'text-red-300/90' : 'text-foreground/85')}>{step.comment}</p>
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
                  {movePairs.map(({ num, white, black }) => {
                    const wStep = white >= 0 ? steps[white] : null;
                    const bStep = black != null ? steps[black] : null;
                    return (
                    <React.Fragment key={`${num}-${white}`}>
                      <div className="flex items-center text-muted-foreground/50 text-xs px-1 py-1">{num}.</div>
                      {wStep ? (
                        <button data-active={currentStep === white} onClick={() => go(white)}
                          className={cn(
                            'text-left px-2 py-1 rounded transition-colors text-xs',
                            currentStep === white
                              ? (wStep.isMistake ? 'bg-red-500 text-white font-bold' : 'bg-primary text-primary-foreground font-bold')
                              : wStep.isMistake
                                ? 'text-red-400 bg-red-500/10 border border-red-500/20 font-semibold hover:bg-red-500/20'
                                : 'text-foreground/70 hover:bg-white/5'
                          )}>
                          {wStep.isMistake && <span className="mr-0.5">?</span>}{wStep.san}
                        </button>
                      ) : <div className="px-2 py-1 text-xs text-muted-foreground/30">...</div>}
                      {bStep ? (
                        <button data-active={currentStep === black} onClick={() => go(black!)}
                          className={cn(
                            'text-left px-2 py-1 rounded transition-colors text-xs',
                            currentStep === black
                              ? (bStep.isMistake ? 'bg-red-500 text-white font-bold' : 'bg-primary text-primary-foreground font-bold')
                              : bStep.isMistake
                                ? 'text-red-400 bg-red-500/10 border border-red-500/20 font-semibold hover:bg-red-500/20'
                                : 'text-foreground/70 hover:bg-white/5'
                          )}>
                          {bStep.isMistake && <span className="mr-0.5">?</span>}{bStep.san}
                        </button>
                      ) : <div />}
                    </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/5 bg-white/2">
              <button onClick={() => { setIsPlaying(false); go(0); }} disabled={isFirst} className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" title="Go to start"><SkipBack className="w-4 h-4" /></button>
              <button onClick={() => go(currentStep - 1)} disabled={isFirst} className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setIsPlaying(p => !p)} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_16px_hsl(89_44%_50%_/_0.3)]">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button onClick={() => go(currentStep + 1)} disabled={isLast} className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              <button onClick={() => { setIsPlaying(false); go(totalSteps - 1); }} disabled={isLast} className="p-2 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" title="Go to end"><SkipForward className="w-4 h-4" /></button>
            </div>

            <div className="h-1 bg-white/5">
              <motion.div className="h-full bg-primary" animate={{ width: `${(currentStep / Math.max(totalSteps - 1, 1)) * 100}%` }} transition={{ duration: 0.3 }} />
            </div>

            {hasRepeat && isLast && (
              <div className="px-4 py-3 border-t border-white/5 bg-emerald-500/5">
                <button
                  onClick={() => { setTab('repeat'); resetRepeat(); }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                >
                  <Repeat2 className="w-4 h-4" /> Practice this sequence from move 1 →
                </button>
              </div>
            )}

            {!hasRepeat && hasDrill && isLast && (
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

      {/* ── REPEAT DRILL TAB ────────────────────────────────────────────────── */}
      {tab === 'repeat' && hasRepeat && (
        <div className="flex flex-col md:flex-row">
          {/* Board */}
          <div className="flex-shrink-0 p-3 md:p-4">
            <div className="relative w-full max-w-[360px] mx-auto">
              {repeatComplete ? (
                <div className="aspect-square rounded-lg bg-gradient-to-br from-emerald-950/80 to-slate-900 border border-emerald-500/30 flex flex-col items-center justify-center gap-4 p-6">
                  <Trophy className="w-14 h-14 text-amber-400 drop-shadow-lg" />
                  <div className="text-center">
                    <p className="text-lg font-black text-white mb-1">Sequence Complete!</p>
                    <p className="text-sm text-muted-foreground">
                      {repeatFirstTryScore} of {totalRepeatMoves} moves correct on first try
                    </p>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full transition-all duration-700"
                      style={{ width: `${(repeatFirstTryScore / totalRepeatMoves) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap justify-center">
                    {repeatFirstTry.map((ok, i) => (
                      <div
                        key={i}
                        title={`Move ${i + 1}: ${steps[i + 1]?.san}`}
                        className={cn('w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center',
                          ok ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                             : 'bg-red-500/20 text-red-400 border border-red-500/40')}
                      >
                        {ok ? '✓' : '✗'}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <Chessboard
                    options={{
                      position: repeatPosition,
                      allowDragging: !repeatComplete,
                      canDragPiece: canRepeatDrag,
                      onPieceDrop: handleRepeatDrop,
                      onSquareClick: handleRepeatSquareClick,
                      squareStyles: repeatSquareStyles,
                      boardStyle: { borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' },
                      darkSquareStyle: { backgroundColor: '#2d4a3e' },
                      lightSquareStyle: { backgroundColor: '#6dae7f' },
                      animationDurationInMs: 180,
                    }}
                  />
                  <AnimatePresence>
                    {repeatFeedback === 'correct' && (
                      <motion.div key="rc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 rounded-lg flex items-center justify-center bg-emerald-500/20 pointer-events-none">
                        <div className="bg-emerald-500 text-white font-black text-2xl px-6 py-3 rounded-2xl shadow-lg">✓ Correct!</div>
                      </motion.div>
                    )}
                    {repeatFeedback === 'wrong' && (
                      <motion.div key="rw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 rounded-lg flex items-center justify-center bg-red-500/20 pointer-events-none">
                        <div className="bg-red-500 text-white font-black text-xl px-6 py-3 rounded-2xl shadow-lg">✗ Try again</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="flex-1 flex flex-col min-h-0 border-t md:border-t-0 md:border-l border-white/5 p-4 gap-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Repeat2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground mb-0.5">
                  {repeatComplete ? 'Round complete!' : 'Play the sequence from the start'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {repeatComplete
                    ? 'Repetition builds muscle memory. Go again to improve your score.'
                    : repeatExpectedSan
                    ? `Move ${repeatStep + 1} of ${totalRepeatMoves} — ${repeatColor === 'w' ? 'White' : 'Black'} to move${repeatFullMove ? ` (move ${repeatFullMove})` : ''}`
                    : 'Drag a piece to make the correct move.'}
                </p>
                {repeatAttempts > 0 && !repeatComplete && (
                  <p className="text-xs text-amber-400 mt-1">{repeatAttempts} wrong attempt{repeatAttempts !== 1 ? 's' : ''} on this move</p>
                )}
              </div>
            </div>

            {/* Progress bar + move dots */}
            {!repeatComplete && (
              <div className="space-y-2">
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-emerald-500"
                    animate={{ width: `${(repeatStep / totalRepeatMoves) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {repeatFirstTry.map((ok, i) => (
                    <div
                      key={i}
                      className={cn('h-1.5 flex-1 min-w-[8px] max-w-[20px] rounded-full transition-colors',
                        i < repeatStep
                          ? ok ? 'bg-emerald-500' : 'bg-red-400'
                          : i === repeatStep
                          ? 'bg-primary animate-pulse'
                          : 'bg-white/10'
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Score card after complete */}
            {repeatComplete && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-400">
                    {repeatFirstTryScore}/{totalRepeatMoves} first-try correct
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {repeatFirstTryScore === totalRepeatMoves
                      ? 'Perfect round! Keep repeating to build memory.'
                      : 'Try again — aim to get them all on the first try.'}
                  </p>
                </div>
              </div>
            )}

            {/* PGN move reference */}
            {!repeatComplete && (
              <div className="text-xs text-muted-foreground/60 font-mono space-y-0.5 max-h-24 overflow-y-auto">
                {movePairs.map(({ num, white, black }) => (
                  <div key={num} className="flex gap-1">
                    <span className="w-6 shrink-0 text-right text-muted-foreground/40">{num}.</span>
                    <span className={cn('px-1 rounded', repeatStep >= white - 0 && 'text-foreground/80')}>{steps[white]?.san}</span>
                    {black != null && <span className={cn('px-1 rounded', repeatStep >= black - 0 && 'text-foreground/80')}>{steps[black]?.san}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="mt-auto flex items-center gap-2 flex-wrap">
              <button
                onClick={resetRepeat}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 border border-border transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" /> {repeatComplete ? 'Go Again' : 'Reset'}
              </button>
              {repeatComplete && hasDrill && (
                <button
                  onClick={() => { setTab('drill'); resetDrill(); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all"
                >
                  <Swords className="w-3.5 h-3.5" /> Practice Drill
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DRILL TAB ───────────────────────────────────────────────────────── */}
      {tab === 'drill' && hasDrill && (
        <div className="flex flex-col md:flex-row">
          <div className="flex-shrink-0 p-3 md:p-4">
            <div className="relative w-full max-w-[360px] mx-auto">
              <Chessboard
                options={{
                  position: drillState === 'idle' || drillState === 'wrong' ? drillFen! : drillPosition,
                  allowDragging: drillState !== 'correct' && drillState !== 'revealed',
                  onPieceDrop: drillState === 'correct' || drillState === 'revealed' ? () => false : handleDrillDrop,
                  onSquareClick: handleDrillSquareClick,
                  squareStyles: drillSquareStyles,
                  boardStyle: { borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' },
                  darkSquareStyle: { backgroundColor: '#2d4a3e' },
                  lightSquareStyle: { backgroundColor: '#6dae7f' },
                  animationDurationInMs: 180,
                }}
              />
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
