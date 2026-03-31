import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/ChessBoard';
import { BOTS, getBotMove, BotConfig } from '@/lib/chess-bot';
import { ArrowLeft, RotateCcw, Flag, Clock, Trophy, Swords, Zap, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type GameResult = 'playing' | 'win' | 'loss' | 'draw';
type MoveRecord = { san: string; fen: string; color: 'w' | 'b' };

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

  const makeBotMove = useCallback(() => {
    if (chess.isGameOver()) return;
    const currentGameId = gameIdRef.current;
    setThinking(true);
    clearBotTimeout();
    botTimeoutRef.current = setTimeout(() => {
      if (gameIdRef.current !== currentGameId) return;
      const move = getBotMove(chess.fen(), bot);
      if (move) {
        const r = chess.move(move);
        if (r) {
          setMoves(prev => [...prev, { san: r.san, fen: chess.fen(), color: r.color }]);
        }
      }
      setFen(chess.fen());
      setThinking(false);
      checkGameEnd(chess);
    }, 300 + Math.random() * 500);
  }, [chess, bot, checkGameEnd, clearBotTimeout]);

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
    const moveResult = chess.move(san);
    if (!moveResult) return;
    setMoves(prev => [...prev, { san: moveResult.san, fen: chess.fen(), color: moveResult.color }]);
    setFen(chess.fen());
    checkGameEnd(chess);

    if (!chess.isGameOver()) {
      clearBotTimeout();
      botTimeoutRef.current = setTimeout(() => makeBotMove(), 200);
    }
  }, [chess, checkGameEnd, makeBotMove, clearBotTimeout]);

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

  const movePairs = useMemo(() => {
    const pairs: { num: number; white?: string; black?: string }[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: moves[i]?.san,
        black: moves[i + 1]?.san,
      });
    }
    return pairs;
  }, [moves]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="space-y-4 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <button onClick={onBack}
        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> All Bots
      </button>

      <div className="glass-card rounded-2xl px-5 py-3 flex items-center gap-3 border border-primary/20 bg-primary/5">
        <span className="text-2xl">{bot.avatar}</span>
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-lg">{bot.name}</h2>
          <p className="text-xs text-muted-foreground">{bot.personality} · {bot.rating} ELO</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          {formatTime(elapsedSec)}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{bot.avatar}</span>
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
          />

          <div className="glass-card rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center">
                <span className="text-xs font-black text-primary">You</span>
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

        <div className="space-y-4">
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 text-sm font-bold">Moves</div>
            <div ref={moveListRef} className="max-h-[300px] overflow-y-auto px-3 py-2">
              {movePairs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Make your first move…</p>
              ) : (
                <div className="grid grid-cols-[32px_1fr_1fr] gap-0.5 text-sm font-mono">
                  {movePairs.map(p => (
                    <React.Fragment key={p.num}>
                      <div className="text-xs text-muted-foreground/50 px-1 py-1">{p.num}.</div>
                      <div className="text-xs px-2 py-1 text-foreground/70">{p.white}</div>
                      <div className="text-xs px-2 py-1 text-foreground/70">{p.black ?? ''}</div>
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
                  'glass-card rounded-2xl p-6 text-center space-y-4 border',
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
    <div className="space-y-8 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <div className="glass-card p-6 rounded-3xl border-primary/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Swords className="w-8 h-8 text-primary" /> Practice Bots
          </h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Challenge AI opponents at your skill level. Beat a bot and move up to the next!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {BOTS.map((bot, i) => (
          <BotCard key={bot.name} bot={bot} onSelect={setSelectedBot} />
        ))}
      </div>

      <div className="glass-card rounded-2xl p-6 border border-white/8">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-amber-400" />
          <h3 className="font-bold">How it works</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground">
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
