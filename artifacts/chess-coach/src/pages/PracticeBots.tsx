import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { BOTS, getBotMove, BotConfig, analyzeMoveQuality, type MoveAnalysisResult } from '@/lib/chess-bot';
import { ArrowLeft, RotateCcw, Flag, Clock, Trophy, Swords, Zap, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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
  brilliant:  { label: 'Brilliant!!', icon: '✦', bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-400' },
  excellent:  { label: 'Excellent!', icon: '!', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  good:       { label: 'Good', icon: '✓', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-400' },
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

  return (
    <motion.div
      key={`${move.fenBefore}-${move.san}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl overflow-hidden border ${cfg.border} bg-card/60`}
    >
      <div className={`px-3 py-2.5 ${cfg.bg} flex items-center justify-between`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-base font-black ${cfg.text}`}>{cfg.icon}</span>
          <div className="min-w-0">
            <p className={`text-sm font-bold ${cfg.text} truncate`}>{move.san} — {cfg.label}</p>
            <p className="text-[10px] text-muted-foreground">{who} · {move.color === 'w' ? 'White' : 'Black'}</p>
          </div>
        </div>
        <div className="text-right shrink-0 ml-2">
          <p className="text-[10px] text-muted-foreground">Eval</p>
          <p className="text-xs font-mono font-bold tabular-nums">
            {(evalBefore / 100).toFixed(1)} → {(evalAfter / 100).toFixed(1)}
          </p>
        </div>
      </div>
      <div className="px-3 py-2.5 space-y-1.5">
        {pros.map((p, i) => (
          <div key={`p${i}`} className="flex items-start gap-2 text-xs">
            <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
            <span className="text-foreground/80">{p}</span>
          </div>
        ))}
        {cons.map((c, i) => (
          <div key={`c${i}`} className="flex items-start gap-2 text-xs">
            <span className="text-red-400 shrink-0 mt-0.5">✗</span>
            <span className="text-foreground/80">{c}</span>
          </div>
        ))}
        {bestMoveSan && (
          <div className="flex items-start gap-2 text-xs pt-1 border-t border-white/5">
            <span className="text-primary shrink-0 mt-0.5">★</span>
            <span className="text-muted-foreground">Best was <strong className="text-foreground">{bestMoveSan}</strong></span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground/70 pt-1">{summary}</p>
      </div>
    </motion.div>
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
        'relative flex flex-col gap-3 p-5 rounded-2xl border bg-gradient-to-br text-left transition-shadow hover:shadow-xl hover:shadow-black/30 group',
        gradient,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-3xl">{bot.avatar}</span>
        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-black/30 border border-white/10 text-white/80">
          {bot.rating} ELO
        </span>
      </div>
      <div>
        <h3 className="text-lg font-black text-white">{bot.name}</h3>
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/50 mt-0.5">{bot.personality}</p>
      </div>
      <p className="text-xs text-white/60 leading-relaxed">{bot.description}</p>
      <div className="flex items-center gap-1.5 text-xs font-bold text-white/40 group-hover:text-white/70 transition-colors mt-auto pt-2">
        Challenge <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </motion.button>
  );
}

function GameView({ bot, onBack }: { bot: BotConfig; onBack: () => void }) {
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [chess] = useState(() => new Chess());
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
          const newMove: MoveRecord = { san: r.san, fen: chess.fen(), fenBefore, color: r.color, analysis: null };
          setMoves(prev => {
            const next = [...prev, newMove];
            setSelectedMoveIdx(next.length - 1);
            deferAnalysis(fenBefore, r.san, next.length - 1);
            return next;
          });
        }
      }
      setFen(chess.fen());
      setThinking(false);
      checkGameEnd(chess);
    }, 300 + Math.random() * 500);
  }, [chess, bot, checkGameEnd, clearBotTimeout, deferAnalysis]);

  useEffect(() => {
    if (playerColor === 'b' && moves.length === 0 && result === 'playing') {
      makeBotMove();
    }
  }, [playerColor, moves.length, result, makeBotMove]);

  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [moves]);

  const handleMovePlayed = useCallback((san: string, _isCorrect: boolean) => {
    const fenBefore = chess.fen();
    const moveResult = chess.move(san);
    if (!moveResult) return;
    const newMove: MoveRecord = { san: moveResult.san, fen: chess.fen(), fenBefore, color: moveResult.color, analysis: null };
    setMoves(prev => {
      const next = [...prev, newMove];
      setSelectedMoveIdx(next.length - 1);
      deferAnalysis(fenBefore, moveResult.san, next.length - 1);
      return next;
    });
    setFen(chess.fen());
    checkGameEnd(chess);

    if (!chess.isGameOver()) {
      clearBotTimeout();
      botTimeoutRef.current = setTimeout(() => makeBotMove(), 200);
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
    chess.reset();
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
      const prevFen = moves.length === 1 ? undefined : moves[moves.length - 2]?.fen;
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

      <div className="glass-card rounded-2xl px-4 py-2.5 flex items-center gap-3 border border-primary/20 bg-primary/5">
        <span className="text-2xl">{bot.avatar}</span>
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-base sm:text-lg leading-tight">{bot.name}</h2>
          <p className="text-[11px] text-muted-foreground">{bot.personality} · {bot.rating} ELO</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Clock className="w-3.5 h-3.5" />
          {formatTime(elapsedSec)}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-2.5">
          <div className="glass-card rounded-xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{bot.avatar}</span>
              <div>
                <p className="font-bold text-sm">{bot.name}</p>
                <p className="text-[10px] text-muted-foreground">{bot.rating} ELO</p>
              </div>
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
            {result === 'playing' && (
              <button onClick={handleResign}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors">
                <Flag className="w-3 h-3" /> Resign
              </button>
            )}
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

export function PracticeBots() {
  const [selectedBot, setSelectedBot] = useState<BotConfig | null>(null);

  if (selectedBot) {
    return <GameView bot={selectedBot} onBack={() => setSelectedBot(null)} />;
  }

  return (
    <div className="space-y-6 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <div className="glass-card p-5 sm:p-6 rounded-2xl sm:rounded-3xl border-primary/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-3">
            <Swords className="w-7 h-7 sm:w-8 sm:h-8 text-primary" /> Practice Bots
          </h1>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Challenge AI opponents at your skill level. Beat a bot and move up to the next!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {BOTS.map((bot) => (
          <BotCard key={bot.name} bot={bot} onSelect={setSelectedBot} />
        ))}
      </div>

      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-white/8">
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
    </div>
  );
}
