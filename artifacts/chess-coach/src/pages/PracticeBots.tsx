import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PieceTile } from '@/components/DesignSystem';
import { Chess } from 'chess.js';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { normalizeFen } from '@/lib/utils';
import { BOTS, getBotMove, BotConfig, analyzeMoveQuality, type MoveAnalysisResult } from '@/lib/chess-bot';
import { OPENINGS, type OpeningLine } from '@/lib/openings';
import { AICoachCard, type AICoachTone } from '@/components/AICoachCard';
import { ArrowLeft, RotateCcw, Flag, Clock, Trophy, Swords, Zap, ChevronRight, ChevronDown, ChevronUp, BookOpen, Check, X, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const QUALITY_TO_TONE: Record<string, AICoachTone> = {
  checkmate: 'gold',
  brilliant: 'info',
  excellent: 'positive',
  good: 'positive',
  book: 'neutral',
  inaccuracy: 'warning',
  mistake: 'warning',
  blunder: 'danger',
};

type GameResult = 'playing' | 'win' | 'loss' | 'draw';
type MoveRecord = { san: string; fen: string; fenBefore: string; color: 'w' | 'b'; analysis: MoveAnalysisResult | null };

const TIER_COLORS: Record<string, string> = {
  Beginner: 'from-stone-700 to-stone-900 border-stone-600/50',
  Casual: 'from-emerald-900 to-emerald-950 border-emerald-600/40',
  Improving: 'from-teal-900 to-teal-950 border-teal-600/40',
  'Club Player': 'from-blue-900 to-blue-950 border-blue-600/40',
  Tournament: 'from-indigo-900 to-indigo-950 border-indigo-600/40',
  Advanced: 'from-purple-900 to-purple-950 border-purple-600/40',
  Expert: 'from-pink-900 to-pink-950 border-pink-600/40',
  Master: 'from-amber-900 to-amber-950 border-amber-600/40',
};

const QUALITY_CFG: Record<string, { label: string; icon: string; bg: string; text: string; border: string; dot: string }> = {
  checkmate:  { label: 'Checkmate!', icon: '♚', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-400' },
  brilliant:  { label: 'Brilliant!!', icon: '✦', bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-400' },
  excellent:  { label: 'Excellent!', icon: '!', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  good:       { label: 'Good', icon: '✓', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-400' },
  book:       { label: 'Book Move', icon: '📖', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-400' },
  inaccuracy: { label: 'Inaccuracy', icon: '?!', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', dot: 'bg-yellow-400' },
  mistake:    { label: 'Mistake', icon: '?', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-400' },
  blunder:    { label: 'Blunder', icon: '??', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-400' },
};

function EvalBar({ evalScore }: { evalScore: number }) {
  const clamped = Math.max(-1500, Math.min(1500, evalScore));
  const whitePercent = Math.max(4, Math.min(96, 50 + (clamped / 30)));
  const display = evalScore >= 0 ? `+${(evalScore / 100).toFixed(1)}` : (evalScore / 100).toFixed(1);

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-5 rounded-full overflow-hidden flex border border-white/10">
        <div
          className="h-full bg-[#e8e0d0] transition-all duration-500 ease-out"
          style={{ width: `${whitePercent}%` }}
        />
        <div className="flex-1 bg-[#3a3a3a]" />
      </div>
      <span className="text-[11px] font-mono font-bold tabular-nums text-muted-foreground w-11 text-right">{display}</span>
    </div>
  );
}

function MoveAnalysisPanel({ move, playerColor }: { move: MoveRecord; playerColor: 'w' | 'b' }) {
  if (!move.analysis) return null;
  const { quality, evalBefore, evalAfter, pros, cons, summary, bestMoveSan } = move.analysis;
  const cfg = QUALITY_CFG[quality] ?? QUALITY_CFG.good;
  const who = move.color === playerColor ? 'You' : 'Bot';
  const tone = QUALITY_TO_TONE[quality] ?? 'neutral';

  const titleNode = (
    <span className="flex items-center gap-1.5">
      <span className={`text-base font-black ${cfg.text} leading-none`}>{cfg.icon}</span>
      <span className="font-mono text-foreground/80">{move.san}</span>
      <span className="text-muted-foreground/50">·</span>
      <span className={`font-bold ${cfg.text}`}>{cfg.label}</span>
      <span className="text-muted-foreground/50 hidden sm:inline">·</span>
      <span className="text-[10px] text-muted-foreground hidden sm:inline">{who}</span>
    </span>
  );

  return (
    <AICoachCard tone={tone} name="Coach" badge="Coach" title={titleNode} compact>
      <p className="text-xs text-muted-foreground/80">
        Eval{' '}
        <span className="font-mono font-bold text-foreground/90 tabular-nums">
          {(evalBefore / 100).toFixed(1)} → {(evalAfter / 100).toFixed(1)}
        </span>
      </p>
      <p>{summary}</p>
      {(pros.length > 0 || cons.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {pros.length > 0 && (
            <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-2.5 py-2">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-1">Pros</p>
              <ul className="space-y-1">
                {pros.map((p, i) => (
                  <li key={i} className="text-xs leading-snug flex items-start gap-1.5">
                    <span className="text-emerald-500 shrink-0 mt-0.5">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cons.length > 0 && (
            <div className="rounded-xl bg-red-500/8 border border-red-500/20 px-2.5 py-2">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1">Cons</p>
              <ul className="space-y-1">
                {cons.map((c, i) => (
                  <li key={i} className="text-xs leading-snug flex items-start gap-1.5">
                    <span className="text-red-500 shrink-0 mt-0.5">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {bestMoveSan && (
        <div className="flex items-center gap-2 text-xs pt-1.5 border-t border-white/5">
          <span className="text-primary">★</span>
          <span className="text-muted-foreground">Best was <strong className="text-foreground font-mono">{bestMoveSan}</strong></span>
        </div>
      )}
    </AICoachCard>
  );
}

function BotCard({ bot, onSelect }: { bot: BotConfig; onSelect: (b: BotConfig) => void }) {
  const gradient = TIER_COLORS[bot.personality] ?? 'from-slate-800 to-slate-900 border-white/10';
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(bot)}
      className={cn(
        'relative flex flex-col gap-3 p-5 rounded-xl border bg-gradient-to-br text-left transition-shadow hover:shadow-xl hover:shadow-black/30 group',
        gradient,
      )}
    >
      <div className="flex items-center justify-between">
        <img src={bot.avatar} alt={bot.name} className="w-10 h-10 rounded-full border-2 border-white/20 shadow-md" />
        <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-black/30 border border-white/10 text-white/80">
          {bot.rating} ELO
        </span>
      </div>
      <div>
        <h3 className="text-lg font-black text-white">{bot.name}</h3>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50 mt-0.5">{bot.personality}</p>
      </div>
      <p className="text-xs text-white/60 leading-relaxed">{bot.description}</p>
      <div className="flex items-center gap-1.5 text-xs font-bold text-white/40 group-hover:text-white/70 transition-colors mt-auto pt-2">
        Challenge <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </motion.button>
  );
}

function GameView({ bot, onBack, startFen, startColor }: { bot: BotConfig; onBack: () => void; startFen?: string; startColor?: 'w' | 'b' }) {
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>(() => {
    if (startColor) return startColor;
    if (startFen) {
      const turn = startFen.split(' ')[1];
      return (turn === 'b' ? 'b' : 'w');
    }
    return 'w';
  });
  const [chess] = useState(() => startFen ? new Chess(startFen) : new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [result, setResult] = useState<GameResult>('playing');
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [thinking, setThinking] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameIdRef = useRef(0);
  const moveListRef = useRef<HTMLDivElement>(null);
  const [selectedMoveIdx, setSelectedMoveIdx] = useState<number | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(true);

  const isPlayerTurn = chess.turn() === playerColor;

  const clearBotTimeout = useCallback(() => {
    if (botTimeoutRef.current) { clearTimeout(botTimeoutRef.current); botTimeoutRef.current = null; }
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearBotTimeout();
    };
  }, [clearBotTimeout]);

  const checkGameEnd = useCallback((c: Chess) => {
    if (!c.isGameOver()) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (c.isCheckmate()) {
      setResult(c.turn() === playerColor ? 'loss' : 'win');
    } else {
      setResult('draw');
    }
  }, [playerColor]);

  const deferAnalysis = useCallback((fenBefore: string, san: string, idx: number) => {
    const run = () => {
      const analysis = analyzeMoveQuality(fenBefore, san);
      setMoves(prev => prev.map((m, i) => i === idx ? { ...m, analysis } : m));
    };
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(run, { timeout: 500 });
    } else {
      setTimeout(run, 16);
    }
  }, []);

  const makeBotMove = useCallback(() => {
    if (chess.isGameOver()) return;
    const currentGameId = gameIdRef.current;
    setThinking(true);
    clearBotTimeout();
    botTimeoutRef.current = setTimeout(() => {
      if (gameIdRef.current !== currentGameId) return;
      const fenBefore = chess.fen();
      const move = getBotMove(fenBefore, bot);
      if (move) {
        const r = chess.move(move);
        if (r) {
          const newFen = chess.fen();
          const newMove: MoveRecord = { san: r.san, fen: newFen, fenBefore, color: r.color, analysis: null };
          setMoves(prev => {
            const next = [...prev, newMove];
            setSelectedMoveIdx(next.length - 1);
            deferAnalysis(fenBefore, r.san, next.length - 1);
            return next;
          });
          requestAnimationFrame(() => {
            setFen(newFen);
            setThinking(false);
            checkGameEnd(chess);
          });
          return;
        }
      }
      setFen(chess.fen());
      setThinking(false);
      checkGameEnd(chess);
    }, 400 + Math.random() * 400);
  }, [chess, bot, checkGameEnd, clearBotTimeout, deferAnalysis]);

  useEffect(() => {
    if (moves.length === 0 && result === 'playing' && chess.turn() !== playerColor) {
      makeBotMove();
    }
  }, [playerColor, moves.length, result, makeBotMove, chess]);

  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [moves]);

  const handleMovePlayed = useCallback((san: string, _isCorrect: boolean) => {
    const fenBefore = chess.fen();
    const moveResult = chess.move(san);
    if (!moveResult) return;
    const newFen = chess.fen();
    const newMove: MoveRecord = { san: moveResult.san, fen: newFen, fenBefore, color: moveResult.color, analysis: null };
    setMoves(prev => {
      const next = [...prev, newMove];
      setSelectedMoveIdx(next.length - 1);
      deferAnalysis(fenBefore, moveResult.san, next.length - 1);
      return next;
    });
    setFen(newFen);
    checkGameEnd(chess);

    if (!chess.isGameOver()) {
      clearBotTimeout();
      botTimeoutRef.current = setTimeout(() => makeBotMove(), 250);
    }
  }, [chess, checkGameEnd, makeBotMove, clearBotTimeout, deferAnalysis]);

  const handleResign = () => {
    clearBotTimeout();
    setResult('loss');
    setThinking(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleNewGame = (color: 'w' | 'b') => {
    clearBotTimeout();
    gameIdRef.current++;
    if (startFen) {
      chess.load(startFen);
    } else {
      chess.reset();
    }
    setFen(chess.fen());
    setMoves([]);
    setResult('playing');
    setThinking(false);
    setElapsedSec(0);
    setPlayerColor(color);
    setSelectedMoveIdx(null);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
  };

  const lastMove = useMemo(() => {
    if (moves.length === 0) return null;
    const last = moves[moves.length - 1];
    try {
      const prevFen = last.fenBefore;
      if (!prevFen) return null;
      const temp = new Chess(prevFen);
      const r = temp.move(last.san);
      return r ? { from: r.from, to: r.to } : null;
    } catch { return null; }
  }, [moves]);

  const latestQuality: MoveQuality | null = moves.length > 0 ? (moves[moves.length - 1].analysis?.quality as MoveQuality ?? null) : null;

  const currentEval = useMemo(() => {
    if (moves.length === 0) return 0;
    return moves[moves.length - 1].analysis?.evalAfter ?? 0;
  }, [moves]);

  const movePairs = useMemo(() => {
    const pairs: { num: number; white?: string; black?: string; whiteIdx: number; blackIdx?: number; wq?: string; bq?: string }[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: moves[i]?.san,
        black: moves[i + 1]?.san,
        whiteIdx: i,
        blackIdx: i + 1 < moves.length ? i + 1 : undefined,
        wq: moves[i]?.analysis?.quality,
        bq: moves[i + 1]?.analysis?.quality,
      });
    }
    return pairs;
  }, [moves]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const analysisMove = selectedMoveIdx !== null && moves[selectedMoveIdx] ? moves[selectedMoveIdx] : null;

  return (
    <div className="space-y-3 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <button onClick={onBack}
        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> All Bots
      </button>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-2.5">
          <div className="glass-card rounded-xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={bot.avatar} alt={bot.name} className="w-8 h-8 rounded-full border border-white/20 shadow" />
              <div>
                <p className="font-bold text-sm">{bot.name}</p>
                <p className="text-[10px] text-muted-foreground">{bot.personality} · {bot.rating} ELO</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {formatTime(elapsedSec)}
            </div>
            {thinking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Thinking…
              </div>
            )}
          </div>

          <ChessBoard
            fen={fen}
            flipped={playerColor === 'b'}
            practiceMode={result === 'playing' && isPlayerTurn && !thinking}
            expectedMoveSan={null}
            onMovePlayed={handleMovePlayed}
            lastMove={lastMove}
            moveQuality={latestQuality}
          />

          <div className="glass-card rounded-xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center">
                <span className="text-[10px] font-black text-primary">You</span>
              </div>
              <p className="font-bold text-sm">You ({playerColor === 'w' ? 'White' : 'Black'})</p>
            </div>
            <div className="flex items-center gap-2">
              {result === 'playing' && (
                <button onClick={() => handleNewGame(playerColor === 'w' ? 'b' : 'w')}
                  title="Switch color"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-muted-foreground text-xs font-bold hover:bg-white/10 transition-colors">
                  <RotateCcw className="w-3 h-3" /> Switch
                </button>
              )}
              {result === 'playing' && (
                <button onClick={handleResign}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors">
                  <Flag className="w-3 h-3" /> Resign
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <EvalBar evalScore={currentEval} />

          {analysisMove && (
            <div>
              <button
                onClick={() => setAnalysisOpen(o => !o)}
                className="w-full flex items-center justify-between text-xs font-bold text-muted-foreground mb-1.5 px-1"
              >
                <span>Move Analysis</span>
                {analysisOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <AnimatePresence>
                {analysisOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <MoveAnalysisPanel move={analysisMove} playerColor={playerColor} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/5 text-sm font-bold">Moves</div>
            <div ref={moveListRef} className="max-h-[220px] overflow-y-auto px-2 py-1.5">
              {movePairs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Make your first move…</p>
              ) : (
                <div className="grid grid-cols-[28px_1fr_1fr] gap-0.5 text-sm font-mono">
                  {movePairs.map(p => (
                    <React.Fragment key={p.num}>
                      <div className="text-[11px] text-muted-foreground/50 px-1 py-1 flex items-center">{p.num}.</div>
                      <button
                        onClick={() => setSelectedMoveIdx(p.whiteIdx)}
                        className={cn(
                          "text-[11px] px-1.5 py-1 rounded flex items-center gap-1 transition-colors text-left",
                          selectedMoveIdx === p.whiteIdx ? "bg-white/10" : "hover:bg-white/5"
                        )}
                      >
                        {p.wq && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", QUALITY_CFG[p.wq]?.dot)} />}
                        <span className="text-foreground/80">{p.white}</span>
                      </button>
                      {p.black ? (
                        <button
                          onClick={() => p.blackIdx !== undefined && setSelectedMoveIdx(p.blackIdx)}
                          className={cn(
                            "text-[11px] px-1.5 py-1 rounded flex items-center gap-1 transition-colors text-left",
                            selectedMoveIdx === p.blackIdx ? "bg-white/10" : "hover:bg-white/5"
                          )}
                        >
                          {p.bq && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", QUALITY_CFG[p.bq]?.dot)} />}
                          <span className="text-foreground/80">{p.black}</span>
                        </button>
                      ) : (
                        <div />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>

          <AnimatePresence>
            {result !== 'playing' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'glass-card rounded-xl p-5 text-center space-y-3 border',
                  result === 'win' ? 'border-emerald-500/30 bg-emerald-500/5' :
                  result === 'loss' ? 'border-red-500/30 bg-red-500/5' :
                  'border-slate-500/30 bg-slate-500/5',
                )}
              >
                <div className="text-4xl">
                  {result === 'win' ? '🏆' : result === 'loss' ? '😞' : '🤝'}
                </div>
                <h3 className={cn(
                  'text-xl font-black',
                  result === 'win' ? 'text-emerald-400' :
                  result === 'loss' ? 'text-red-400' : 'text-slate-400',
                )}>
                  {result === 'win' ? 'You Win!' : result === 'loss' ? 'You Lost' : 'Draw'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  vs {bot.name} ({bot.rating}) · {moves.length} moves · {formatTime(elapsedSec)}
                </p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <button onClick={() => handleNewGame('w')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f0d9b5] text-[#2d2d2d] text-xs font-bold hover:opacity-90 transition-opacity">
                    <RotateCcw className="w-3 h-3" /> Play as White
                  </button>
                  <button onClick={() => handleNewGame('b')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2d2d2d] border border-white/20 text-[#f0d9b5] text-xs font-bold hover:opacity-90 transition-opacity">
                    <RotateCcw className="w-3 h-3" /> Play as Black
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function OpeningTrainerView({ opening, onBack }: { opening: OpeningLine; onBack: () => void }) {
  const playerColor = opening.userColor;
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [stepIdx, setStepIdx] = useState(0);
  const [history, setHistory] = useState<{ san: string; expected: string; correct: boolean }[]>([]);
  const [phase, setPhase] = useState<'theory' | 'freeplay' | 'completed'>('theory');
  const [wrongFeedback, setWrongFeedback] = useState<{ played: string; expected: string } | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expectedNow = phase === 'theory' && stepIdx < opening.moves.length ? opening.moves[stepIdx] : null;
  const isPlayerTurn = chess.turn() === playerColor;
  const playerExpected = expectedNow && isPlayerTurn ? expectedNow : null;

  const clearBot = useCallback(() => {
    if (botTimeoutRef.current) { clearTimeout(botTimeoutRef.current); botTimeoutRef.current = null; }
  }, []);

  useEffect(() => () => {
    clearBot();
    if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
  }, [clearBot]);

  const advanceBotMove = useCallback(() => {
    if (phase !== 'theory') return;
    if (stepIdx >= opening.moves.length) {
      setPhase('completed');
      return;
    }
    if (chess.turn() === playerColor) return;
    const expected = opening.moves[stepIdx];
    clearBot();
    botTimeoutRef.current = setTimeout(() => {
      const r = chess.move(expected);
      if (!r) return;
      setFen(chess.fen());
      setStepIdx(i => i + 1);
    }, 550);
  }, [chess, opening.moves, phase, playerColor, stepIdx, clearBot]);

  useEffect(() => {
    if (phase === 'theory' && !isPlayerTurn && stepIdx < opening.moves.length) {
      advanceBotMove();
    }
    if (phase === 'theory' && stepIdx >= opening.moves.length) {
      setPhase('completed');
    }
  }, [phase, isPlayerTurn, stepIdx, opening.moves.length, advanceBotMove]);

  const handleMovePlayed = useCallback((san: string, isCorrect: boolean) => {
    if (phase !== 'theory') return;
    const expected = opening.moves[stepIdx];
    // Apply the move to the parent chess instance (ChessBoard only computes SAN).
    const moveResult = chess.move(san);
    if (!moveResult) return;
    if (san === expected) {
      setHistory(h => [...h, { san, expected, correct: true }]);
      setStreak(s => s + 1);
      setScore(s => ({ correct: s.correct + 1, total: s.total + 1 }));
      setFen(chess.fen());
      setStepIdx(i => i + 1);
      setHintOpen(false);
    } else {
      // Wrong move — undo so the user can retry.
      chess.undo();
      setFen(chess.fen());
      setStreak(0);
      setScore(s => ({ correct: s.correct, total: s.total + 1 }));
      setHistory(h => [...h, { san, expected, correct: false }]);
      setWrongFeedback({ played: san, expected });
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = setTimeout(() => setWrongFeedback(null), 2200);
    }
    void isCorrect;
  }, [chess, opening.moves, phase, stepIdx]);

  const handleReset = () => {
    clearBot();
    chess.reset();
    setFen(chess.fen());
    setStepIdx(0);
    setHistory([]);
    setPhase('theory');
    setWrongFeedback(null);
    setHintOpen(false);
    setStreak(0);
    setScore({ correct: 0, total: 0 });
  };

  const handleShowHint = () => setHintOpen(true);

  const lastMove = useMemo(() => {
    const hist = chess.history({ verbose: true });
    if (hist.length === 0) return null;
    const last = hist[hist.length - 1];
    return { from: last.from, to: last.to };
  }, [fen, chess]);

  const totalSteps = opening.moves.length;
  const progressPct = Math.min(100, Math.round((stepIdx / totalSteps) * 100));
  const accuracy = score.total === 0 ? 100 : Math.round((score.correct / score.total) * 100);

  return (
    <div className="space-y-3 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <button onClick={onBack}
        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> All Openings
      </button>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-2.5">
          <div className="glass-card rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{opening.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {opening.eco} · You play {playerColor === 'w' ? 'White' : 'Black'} · Move {Math.min(stepIdx + 1, totalSteps)}/{totalSteps}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Accuracy</p>
                <p className="text-sm font-mono font-bold text-primary">{accuracy}%</p>
              </div>
              {streak >= 2 && (
                <div className="px-2 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                  🔥 {streak}
                </div>
              )}
            </div>
          </div>

          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary/70 to-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>

          <ChessBoard
            fen={fen}
            flipped={playerColor === 'b'}
            practiceMode={phase === 'theory' && isPlayerTurn}
            expectedMoveSan={playerExpected}
            onMovePlayed={handleMovePlayed}
            lastMove={lastMove}
            moveQuality={null}
          />

          <div className="glass-card rounded-xl p-2.5 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center">
                <span className="text-[10px] font-black text-primary">You</span>
              </div>
              <p className="font-bold text-sm">You ({playerColor === 'w' ? 'White' : 'Black'})</p>
              {phase === 'theory' && isPlayerTurn && (
                <span className="text-[10px] text-muted-foreground">— your move</span>
              )}
              {phase === 'theory' && !isPlayerTurn && stepIdx < totalSteps && (
                <span className="text-[10px] text-muted-foreground">— opening line replies…</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleShowHint}
                disabled={!playerExpected}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Lightbulb className="w-3 h-3" /> {hintOpen && playerExpected ? playerExpected : 'Hint'}
              </button>
              <button onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-muted-foreground text-xs font-bold hover:bg-white/10 transition-colors">
                <RotateCcw className="w-3 h-3" /> Restart
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <AnimatePresence>
            {wrongFeedback && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <AICoachCard tone="warning" name="Coach" badge="OUT OF BOOK" compact>
                  <p>
                    You played <strong className="font-mono text-red-400">{wrongFeedback.played}</strong>. The main line continues with{' '}
                    <strong className="font-mono text-emerald-400">{wrongFeedback.expected}</strong>.
                  </p>
                  <p className="text-[11px] text-muted-foreground">Your move was undone — give it another try.</p>
                </AICoachCard>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="glass-card rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm">Key Ideas</h3>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{opening.description}</p>
            <ul className="space-y-1.5 pt-1">
              {opening.ideas.map((idea, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px]">
                  <span className="text-primary shrink-0 mt-0.5">•</span>
                  <span className="text-foreground/80">{idea}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/5 text-sm font-bold flex items-center justify-between">
              <span>Move History</span>
              <span className="text-[10px] text-muted-foreground font-normal">{score.correct}/{score.total} correct</span>
            </div>
            <div className="max-h-[180px] overflow-y-auto px-2 py-1.5">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {isPlayerTurn ? 'Make your first move…' : 'Bot is preparing…'}
                </p>
              ) : (
                <div className="space-y-1">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] px-1.5 py-1 rounded">
                      {h.correct ? (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <X className="w-3 h-3 text-red-400 shrink-0" />
                      )}
                      <span className={cn('font-mono', h.correct ? 'text-foreground/80' : 'text-red-400 line-through')}>
                        {h.san}
                      </span>
                      {!h.correct && (
                        <span className="font-mono text-emerald-400 text-[10px]">→ {h.expected}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <AnimatePresence>
            {phase === 'completed' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-5 text-center space-y-3 border border-emerald-500/30 bg-emerald-500/5"
              >
                <div className="text-4xl">🎓</div>
                <h3 className="text-xl font-black text-emerald-400">Line Complete!</h3>
                <p className="text-xs text-muted-foreground">
                  {opening.name} · {accuracy}% accuracy · {score.correct}/{score.total} moves
                </p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <button onClick={handleReset}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f0d9b5] text-[#2d2d2d] text-xs font-bold hover:opacity-90 transition-opacity">
                    <RotateCcw className="w-3 h-3" /> Practice Again
                  </button>
                  <button onClick={onBack}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2d2d2d] border border-white/20 text-[#f0d9b5] text-xs font-bold hover:opacity-90 transition-opacity">
                    Pick Another Opening
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function OpeningCard({ opening, onSelect }: { opening: OpeningLine; onSelect: (o: OpeningLine) => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(opening)}
      className="relative flex flex-col gap-3 p-5 rounded-xl border border-white/10 bg-gradient-to-br from-[#2d2c29] to-[#1f1e1c] text-left transition-shadow hover:shadow-xl hover:shadow-black/30 group"
    >
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-black/30 border border-white/10 text-white/80">
          {opening.eco}
        </span>
      </div>
      <div>
        <h3 className="text-base font-black text-white leading-tight">{opening.name}</h3>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50 mt-1">
          Play as {opening.userColor === 'w' ? 'White' : 'Black'} · {Math.ceil(opening.moves.length / 2)} moves deep
        </p>
      </div>
      <p className="text-xs text-white/60 leading-relaxed line-clamp-2">{opening.description}</p>
      <div className="flex items-center gap-1.5 text-xs font-bold text-white/40 group-hover:text-primary transition-colors mt-auto pt-2">
        Train Line <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </motion.button>
  );
}

function findBotAboveRating(rating: number): BotConfig {
  const sorted = [...BOTS].sort((a, b) => a.rating - b.rating);
  for (const bot of sorted) {
    if (bot.rating > rating) return bot;
  }
  return sorted[sorted.length - 1];
}

function getJumpInParams(): { fen: string; rating: number; color?: 'w' | 'b' } | null {
  const params = new URLSearchParams(window.location.search);
  const fen = params.get('fen');
  if (!fen) return null;
  const rating = params.get('rating');
  const color = params.get('color');
  window.history.replaceState({}, '', window.location.pathname);
  return { fen, rating: rating ? parseInt(rating, 10) : 1200, color: color === 'w' || color === 'b' ? color : undefined };
}

export function PracticeBots() {
  const [jumpIn] = useState(getJumpInParams);
  const [selectedBot, setSelectedBot] = useState<BotConfig | null>(() =>
    jumpIn ? findBotAboveRating(jumpIn.rating) : null
  );
  const [selectedOpening, setSelectedOpening] = useState<OpeningLine | null>(null);
  const [tab, setTab] = useState<'bots' | 'openings'>('bots');

  if (selectedBot) {
    return <GameView bot={selectedBot} onBack={() => setSelectedBot(null)} startFen={jumpIn?.fen} startColor={jumpIn?.color} />;
  }

  if (selectedOpening) {
    return <OpeningTrainerView opening={selectedOpening} onBack={() => setSelectedOpening(null)} />;
  }

  return (
    <div className="space-y-6 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <div className="glass-card p-5 sm:p-6 rounded-xl sm:rounded-xl border-primary/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3">
          <PieceTile piece="♞" size={56} />
          <div>
            <h1 className="text-2xl md:text-3xl font-black" style={{ letterSpacing: '-0.02em' }}>Practice</h1>
            <p className="text-muted-foreground mt-2 max-w-lg text-sm">
              Battle bot opponents or drill specific openings move-by-move with instant feedback.
            </p>
          </div>
        </div>
      </div>

      <div className="inline-flex p-1 rounded-xl bg-card/60 border border-white/10 gap-1">
        <button
          onClick={() => setTab('bots')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all',
            tab === 'bots' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Swords className="w-4 h-4" /> Bots
        </button>
        <button
          onClick={() => setTab('openings')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all',
            tab === 'openings' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <BookOpen className="w-4 h-4" /> Opening Trainer
        </button>
      </div>

      {tab === 'bots' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {BOTS.map((bot) => (
              <BotCard key={bot.name} bot={bot} onSelect={setSelectedBot} />
            ))}
          </div>

          <div className="glass-card rounded-xl p-4 sm:p-6 border border-white/8">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Zap className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold">How it works</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <span className="text-lg font-black text-primary shrink-0">1</span>
                <p>Pick a bot that matches your current rating or slightly above for a good challenge.</p>
              </div>
              <div className="flex gap-3">
                <span className="text-lg font-black text-primary shrink-0">2</span>
                <p>Play a full game. The bot thinks using real chess evaluation — no random moves (except at lower levels).</p>
              </div>
              <div className="flex gap-3">
                <span className="text-lg font-black text-primary shrink-0">3</span>
                <p>Win consistently? Move up to the next bot and keep climbing!</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {OPENINGS.map((opening) => (
              <OpeningCard key={opening.id} opening={opening} onSelect={setSelectedOpening} />
            ))}
          </div>

          <div className="glass-card rounded-xl p-4 sm:p-6 border border-white/8">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <BookOpen className="w-5 h-5 text-primary" />
              <h3 className="font-bold">How opening drills work</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <span className="text-lg font-black text-primary shrink-0">1</span>
                <p>Pick an opening. The bot will play the opposite side following the main theory line.</p>
              </div>
              <div className="flex gap-3">
                <span className="text-lg font-black text-primary shrink-0">2</span>
                <p>Play the expected book move. If you deviate, you'll get instant feedback and a chance to retry.</p>
              </div>
              <div className="flex gap-3">
                <span className="text-lg font-black text-primary shrink-0">3</span>
                <p>Stuck? Tap the Hint button to reveal the next move and lock in the pattern.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
