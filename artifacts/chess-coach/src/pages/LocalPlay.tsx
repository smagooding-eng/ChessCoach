import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/ChessBoard';
import { MaterialStrip } from '@/components/GameStatusStrip';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Flag, Clock, Play, ArrowLeft, Trophy, Handshake, Hand } from 'lucide-react';
import { cn } from '@/lib/utils';

type TimeControl = { label: string; seconds: number } | { label: string; seconds: null };

const TIME_OPTIONS: TimeControl[] = [
  { label: 'No Timer', seconds: null },
  { label: '1 min', seconds: 60 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
];

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type GameResult = 'playing' | 'white' | 'black' | 'draw';

interface MoveRecord {
  san: string;
  fen: string;
  color: 'w' | 'b';
}

export function LocalPlay() {
  const [timeControl, setTimeControl] = useState<TimeControl | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [result, setResult] = useState<GameResult>('playing');
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [whiteTime, setWhiteTime] = useState(300);
  const [blackTime, setBlackTime] = useState(300);
  // Whose clock is actively counting down -- distinct from chess.js's own
  // turn tracking. On a real physical clock, moving the piece advances
  // whose *turn* it is immediately, but your own clock keeps running
  // until you press it. clockActive models that: it only changes when a
  // player explicitly taps their own (currently running) clock.
  const [clockActive, setClockActive] = useState<'w' | 'b'>('w');
  // True right after a move is played and before the mover has tapped
  // their clock to submit it -- the board has already updated, but time
  // hasn't switched sides yet.
  const [awaitingSubmit, setAwaitingSubmit] = useState(false);
  // Game view opens fullscreen (covering the app header/nav) the moment
  // a time control is picked. Exit returns to the normal in-app layout
  // without resetting the game -- same component state either way, just
  // rendered with or without the fixed fullscreen wrapper.
  const [fullscreen, setFullscreen] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);

  const startGame = (tc: TimeControl) => {
    setTimeControl(tc);
    chess.reset();
    setFen(chess.fen());
    setResult('playing');
    setMoves([]);
    setWhiteTime(tc.seconds ?? 0);
    setBlackTime(tc.seconds ?? 0);
    setClockActive('w');
    setAwaitingSubmit(false);
    setFullscreen(true);
    setGameStarted(true);
  };

  const resetGame = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGameStarted(false);
    setTimeControl(null);
    chess.reset();
    setFen(chess.fen());
    setResult('playing');
    setMoves([]);
    setClockActive('w');
    setAwaitingSubmit(false);
    setFullscreen(true);
  };

  // Timer only runs for clockActive's side, and only when not paused
  // waiting for the mover to tap their clock.
  useEffect(() => {
    if (!gameStarted || result !== 'playing' || !timeControl || timeControl.seconds === null) return;
    if (awaitingSubmit) return;

    timerRef.current = setInterval(() => {
      if (clockActive === 'w') {
        setWhiteTime(prev => {
          if (prev <= 1) {
            setResult('black');
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime(prev => {
          if (prev <= 1) {
            setResult('white');
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameStarted, result, timeControl, clockActive, awaitingSubmit]);

  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [moves]);

  const hasTimer = timeControl && timeControl.seconds !== null;

  const handleMove = useCallback((san: string) => {
    const moverColor = chess.turn();
    const moveResult = chess.move(san);
    if (!moveResult) return;

    setMoves(prev => [...prev, { san: moveResult.san, fen: chess.fen(), color: moveResult.color }]);
    setFen(chess.fen());

    if (chess.isGameOver()) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (chess.isCheckmate()) {
        setResult(chess.turn() === 'w' ? 'black' : 'white');
      } else {
        setResult('draw');
      }
      return;
    }

    // Timed games: the mover's own clock keeps running (paused from
    // ticking further, but not switched) until they tap it to submit.
    // Untimed games have no clock to submit, so turns just proceed
    // normally with no extra step.
    if (hasTimer) {
      setClockActive(moverColor);
      setAwaitingSubmit(true);
    }
  }, [chess, hasTimer]);

  const submitClock = (side: 'w' | 'b') => {
    if (result !== 'playing' || !awaitingSubmit) return;
    if (clockActive !== side) return; // only the side whose clock is running can submit it
    setClockActive(side === 'w' ? 'b' : 'w');
    setAwaitingSubmit(false);
  };

  const resign = (color: 'w' | 'b') => {
    if (timerRef.current) clearInterval(timerRef.current);
    setResult(color === 'w' ? 'black' : 'white');
  };

  if (!gameStarted) {
    return (
      <div className="space-y-6 px-4 pt-4 md:px-0 md:pt-0 pb-10">
        <PageHero piece="♛" title="Play" subtitle="Play chess locally against a friend on this device." />

        <div className="max-w-md mx-auto space-y-4">
          <h2 className="text-lg font-bold text-center">Choose Time Control</h2>
          <div className="grid grid-cols-2 gap-3">
            {TIME_OPTIONS.map(tc => (
              <motion.button
                key={tc.label}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => startGame(tc)}
                className="glass-card rounded-xl p-4 text-center border border-border hover:border-primary/40 transition-colors"
              >
                <Clock className="w-5 h-5 mx-auto mb-2 text-primary" />
                <span className="font-bold">{tc.label}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const movePairs: { num: number; white: MoveRecord | null; black: MoveRecord | null }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i] ?? null,
      black: moves[i + 1] ?? null,
    });
  }

  // A clock renders as an actionable button once it's the side that
  // needs to submit -- tapping it stops your time and starts theirs.
  function ClockButton({ side }: { side: 'w' | 'b' }) {
    const isActive = clockActive === side && result === 'playing';
    const canSubmit = isActive && awaitingSubmit;
    const time = side === 'w' ? whiteTime : blackTime;
    return (
      <button
        onClick={() => submitClock(side)}
        disabled={!canSubmit}
        className={cn(
          'px-3 py-1.5 rounded-xl font-mono font-bold text-lg flex-1 text-left transition-colors',
          isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground',
          canSubmit && 'ring-2 ring-primary/60 cursor-pointer active:scale-[0.98]',
        )}
      >
        <span className="text-xs font-normal mr-2">{side === 'w' ? 'White' : 'Black'}</span>
        {formatClock(time)}
        {canSubmit && <Hand className="w-3.5 h-3.5 inline ml-2 -mt-1" />}
      </button>
    );
  }

  const gameContent = (
    <>
      <div className="flex items-center justify-between gap-2">
        {fullscreen ? (
          <button onClick={() => setFullscreen(false)}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm font-bold px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
        ) : (
          <>
            <button onClick={resetGame}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" /> New Game
            </button>
            <button onClick={() => setFullscreen(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg text-primary" style={{ background: 'rgba(129,182,76,0.1)' }}>
              Fullscreen
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 max-w-[640px] mx-auto">
        {/* Black's side — rotated 180° so the player across can read it */}
        <div className="w-full rotate-180">
          <div className="flex items-center gap-2 w-full">
            {hasTimer && <ClockButton side="b" />}
            {result === 'playing' && (
              <button
                onClick={() => resign('b')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors shrink-0"
              >
                <Flag className="w-3.5 h-3.5" /> Resign
              </button>
            )}
            {!hasTimer && result === 'playing' && chess.turn() === 'b' && (
              <span className="text-xs text-primary font-medium ml-auto">Your turn</span>
            )}
          </div>
        </div>

        {hasTimer && awaitingSubmit && result === 'playing' && (
          <p className="text-[11px] text-primary font-medium -mt-1" style={{ transform: clockActive === 'b' ? 'scaleY(-1)' : undefined }}>
            {clockActive === 'w' ? 'White' : 'Black'}: tap your clock to pass the turn
          </p>
        )}

        {/* Board, centered, with vertical material columns flanking it */}
        <div className="w-full flex items-stretch justify-center gap-2">
          <MaterialStrip fen={fen} color="b" vertical className="pt-2" />
          <div className="flex-1 min-w-0 local-play-board">
            <ChessBoard
              fen={fen}
              practiceMode={result === 'playing'}
              onMovePlayed={handleMove}
            />
          </div>
          <MaterialStrip fen={fen} color="w" vertical className="pt-2" />
        </div>

        {/* White's side — normal orientation */}
        <div className="w-full">
          <div className="flex items-center gap-2 w-full">
            {hasTimer && <ClockButton side="w" />}
            {result === 'playing' && (
              <button
                onClick={() => resign('w')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors shrink-0"
              >
                <Flag className="w-3.5 h-3.5" /> Resign
              </button>
            )}
            {!hasTimer && result === 'playing' && chess.turn() === 'w' && (
              <span className="text-xs text-primary font-medium ml-auto">Your turn</span>
            )}
          </div>
        </div>

        {/* Game over banner */}
        <AnimatePresence>
          {result !== 'playing' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-xl p-5 text-center space-y-3 w-full"
            >
              <div className="flex items-center justify-center gap-2 text-lg font-bold">
                {result === 'draw' ? (
                  <><Handshake className="w-5 h-5 text-muted-foreground" /> Draw!</>
                ) : (
                  <><Trophy className="w-5 h-5 text-amber-400" /> {result === 'white' ? 'White' : 'Black'} Wins!</>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {chess.isCheckmate() ? 'Checkmate' : chess.isStalemate() ? 'Stalemate' : chess.isThreefoldRepetition() ? 'Threefold Repetition' : chess.isInsufficientMaterial() ? 'Insufficient Material' : whiteTime === 0 ? 'White ran out of time' : blackTime === 0 ? 'Black ran out of time' : 'Resignation'}
              </p>
              <button
                onClick={resetGame}
                className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-sm"
              >
                <RotateCcw className="w-4 h-4 inline mr-1.5" /> New Game
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Move list */}
        <div className="glass-card rounded-xl overflow-hidden w-full">
          <div className="px-3 py-2 border-b border-border/30">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Moves</p>
          </div>
          <div ref={moveListRef} className="max-h-48 overflow-y-auto hide-scrollbar p-2">
            {movePairs.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 text-center py-3">No moves yet</p>
            ) : (
              <div className="space-y-0.5">
                {movePairs.map(pair => (
                  <div key={pair.num} className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground/50 w-6 text-right shrink-0">{pair.num}.</span>
                    <span className="font-medium w-16 text-foreground">{pair.white?.san ?? ''}</span>
                    <span className="font-medium w-16 text-foreground">{pair.black?.san ?? ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[70] overflow-y-auto bg-background space-y-3 pb-10 px-4 pt-4">
        {gameContent}
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      {gameContent}
    </div>
  );
}
