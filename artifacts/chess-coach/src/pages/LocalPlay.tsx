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
  // For timed games, the clock doesn't run at all until White explicitly
  // taps it once to start -- matching a real physical chess clock, where
  // someone presses the button before the first move is even made.
  // Untimed games have no clock to start, so this is irrelevant there.
  const [clockStarted, setClockStarted] = useState(false);
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
    setClockStarted(false);
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
    setClockStarted(false);
    setFullscreen(true);
  };

  // Timer only runs for clockActive's side, only once White has started
  // it, and only when not paused waiting for the mover to tap their clock.
  useEffect(() => {
    if (!gameStarted || result !== 'playing' || !timeControl || timeControl.seconds === null) return;
    if (!clockStarted || awaitingSubmit) return;

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
  }, [gameStarted, result, timeControl, clockActive, awaitingSubmit, clockStarted]);

  // Mobile browsers tint the system status bar/URL bar to match
  // <meta name="theme-color">, which is normally the app's brand green
  // (#81b64c) -- that shows as a persistent green bar above a fullscreen
  // game. Swap it to match the dark game background while fullscreen,
  // restore the real value on exit or unmount.
  useEffect(() => {
    if (!fullscreen || !gameStarted) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    const original = meta?.getAttribute('content') ?? '#81b64c';
    meta?.setAttribute('content', '#141413');
    return () => { meta?.setAttribute('content', original); };
  }, [fullscreen, gameStarted]);

  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [moves]);

  const hasTimer = !!timeControl && timeControl.seconds !== null;

  const handleMove = useCallback((san: string) => {
    if (awaitingSubmit) return;
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

    // Local Play always requires an explicit tap to pass the turn --
    // timed or not -- since this is a shared-device pass-and-play mode
    // where the app has no other way to know when someone's done moving
    // and handing the device to the other player. This replaces the
    // generic Confirm Moves setting entirely for this mode (that
    // setting's own overlay is always suppressed here -- see
    // suppressConfirmMoves below).
    setClockActive(moverColor);
    setAwaitingSubmit(true);
  }, [chess, awaitingSubmit]);

  // Reverts the move currently awaiting clock confirmation. Only
  // meaningful while awaitingSubmit is true -- the turn hasn't actually
  // passed yet at that point (that only happens on submitClock), so
  // undoing here just gives the same player another attempt, with no
  // clock/turn implications.
  const undoLastMove = useCallback(() => {
    if (!awaitingSubmit) return;
    const undone = chess.undo();
    if (!undone) return;
    setMoves(prev => prev.slice(0, -1));
    setFen(chess.fen());
    setAwaitingSubmit(false);
  }, [chess, awaitingSubmit]);

  const submitClock = (side: 'w' | 'b') => {
    if (result !== 'playing' || !awaitingSubmit) return;
    if (clockActive !== side) return; // only the side whose clock is running can submit it
    setClockActive(side === 'w' ? 'b' : 'w');
    setAwaitingSubmit(false);
  };

  // White taps their own clock once before the very first move to start
  // it running -- a separate action from submitClock, which only applies
  // mid-game after a move has actually been made.
  const startClock = () => {
    if (result !== 'playing' || clockStarted) return;
    setClockStarted(true);
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

  // A clock/turn paddle renders as an actionable button once it's the
  // side that needs to submit -- tapping it passes the turn. For timed
  // games this also stops/starts the actual countdown; for untimed
  // games it's the same button and the same tap-to-confirm mechanism,
  // just with no time number to show. Styled like the chess-clock
  // paddle buttons used for Confirm Move elsewhere in the app: chunky,
  // physical-feeling, strong drop shadow. Captured material for that
  // side renders as a horizontal strip under the label, inside the same
  // button.
  function ClockButton({ side }: { side: 'w' | 'b' }) {
    const isActive = clockActive === side && result === 'playing';
    const canSubmit = isActive && awaitingSubmit && (!hasTimer || clockStarted);
    // White's clock before a timed game has started ticking -- tapping
    // it here starts the game clock rather than submitting a move.
    // Untimed games have no clock to start, so this never applies there.
    const needsStart = hasTimer && side === 'w' && !clockStarted && result === 'playing';
    const isTappable = canSubmit || needsStart;
    const time = side === 'w' ? whiteTime : blackTime;
    return (
      <button
        onClick={() => (needsStart ? startClock() : submitClock(side))}
        disabled={!isTappable}
        className={cn(
          'flex-1 rounded-2xl font-mono font-black text-left transition-transform',
          fullscreen ? 'px-6 py-5' : 'px-3 py-2.5',
          isTappable && 'active:scale-[0.97] active:translate-y-0.5',
        )}
        style={{
          background: (isActive || needsStart)
            ? 'linear-gradient(180deg, #a8d876 0%, #81b64c 55%, #5f8f36 100%)'
            : 'linear-gradient(180deg, #3a3a3a 0%, #232323 100%)',
          color: (isActive || needsStart) ? '#fff' : 'rgba(255,255,255,0.45)',
          boxShadow: (isActive || needsStart)
            ? '0 4px 0 #4a7028, 0 8px 16px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.3)'
            : '0 4px 0 #141414, 0 8px 16px rgba(0,0,0,0.4)',
          border: '1px solid rgba(0,0,0,0.25)',
        }}
      >
        <span className={cn('font-normal block opacity-80', fullscreen ? 'text-sm mb-0.5' : 'text-[10px]')}>
          {needsStart ? 'Tap to start' : (side === 'w' ? 'White' : 'Black')}
        </span>
        {hasTimer ? (
          <span className={fullscreen ? 'text-4xl' : 'text-lg'}>{formatClock(time)}</span>
        ) : (
          <span className={fullscreen ? 'text-2xl' : 'text-base'}>
            {canSubmit ? 'Tap to pass turn' : 'Waiting…'}
          </span>
        )}
        {isTappable && <Hand className={cn('inline ml-2', fullscreen ? 'w-6 h-6 -mt-3' : 'w-3.5 h-3.5 -mt-1')} />}
        {fullscreen && (
          <div className="mt-1">
            <MaterialStrip fen={fen} color={side} />
          </div>
        )}
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

      <div className={cn(
        'flex flex-col items-center gap-2 mx-auto w-full',
        fullscreen ? 'flex-1 justify-center' : 'max-w-[640px]',
      )}>
        {/* Black's side — rotated 180° so the player across can read it */}
        <div className="w-full rotate-180">
          <div className="flex items-center gap-2 w-full">
            <ClockButton side="b" />
            {result === 'playing' && (
              <button
                onClick={() => resign('b')}
                className={cn(
                  'flex items-center gap-1.5 rounded-2xl font-black transition-transform active:scale-[0.97] shrink-0',
                  fullscreen ? 'px-5 py-5' : 'px-3 py-2.5 text-xs',
                )}
                style={{
                  background: 'linear-gradient(180deg, #e05a5a 0%, #c93535 55%, #a02828 100%)',
                  color: '#fff',
                  boxShadow: '0 4px 0 #7a1f1f, 0 8px 16px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.25)',
                  border: '1px solid rgba(0,0,0,0.25)',
                }}
              >
                <Flag className={fullscreen ? 'w-5 h-5' : 'w-3.5 h-3.5'} /> Resign
              </button>
            )}
          </div>
        </div>

        {hasTimer && !clockStarted && result === 'playing' && (
          <p className="text-[11px] text-primary font-medium -mt-1">
            White: tap your clock to start the game
          </p>
        )}

        {(!hasTimer || clockStarted) && awaitingSubmit && result === 'playing' && (
          <div className="flex items-center justify-center gap-2 -mt-1" style={{ transform: clockActive === 'b' ? 'scaleY(-1)' : undefined }}>
            <p className="text-[11px] text-primary font-medium">
              {clockActive === 'w' ? 'White' : 'Black'}: tap your {hasTimer ? 'clock' : 'button'} to pass the turn
            </p>
            <button
              onClick={undoLastMove}
              className="text-[11px] font-bold px-2 py-0.5 rounded-lg underline"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Undo move
            </button>
          </div>
        )}

        {/* Board, centered and genuinely edge-to-edge in fullscreen --
            escapes the outer wrapper's horizontal padding via negative
            margin, and uses the full viewport width (bounded by height
            too, so it never overflows on short/wide screens) via
            maxWidthOverride, bypassing the user's normal in-app
            board-size preference for this dedicated context. Material
            now renders inside each clock button instead of flanking the
            board, so nothing eats into its width. suppressConfirmMoves
            avoids the generic ChessBoard confirm-move overlay firing on
            top of Local Play's own clock-tap confirmation. */}
        <div className={cn('w-full local-play-board', fullscreen && '-mx-4 w-screen')}>
          <ChessBoard
            fen={fen}
            practiceMode={result === 'playing' && (!hasTimer || clockStarted) && !awaitingSubmit}
            onMovePlayed={handleMove}
            maxWidthOverride={fullscreen ? 'min(100vw, 62vh)' : undefined}
            suppressConfirmMoves
          />
        </div>

        {/* White's side — normal orientation */}
        <div className="w-full">
          <div className="flex items-center gap-2 w-full">
            <ClockButton side="w" />
            {result === 'playing' && (
              <button
                onClick={() => resign('w')}
                className={cn(
                  'flex items-center gap-1.5 rounded-2xl font-black transition-transform active:scale-[0.97] shrink-0',
                  fullscreen ? 'px-5 py-5' : 'px-3 py-2.5 text-xs',
                )}
                style={{
                  background: 'linear-gradient(180deg, #e05a5a 0%, #c93535 55%, #a02828 100%)',
                  color: '#fff',
                  boxShadow: '0 4px 0 #7a1f1f, 0 8px 16px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.25)',
                  border: '1px solid rgba(0,0,0,0.25)',
                }}
              >
                <Flag className={fullscreen ? 'w-5 h-5' : 'w-3.5 h-3.5'} /> Resign
              </button>
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
                {chess.isCheckmate() ? 'Checkmate' : chess.isStalemate() ? 'Stalemate' : chess.isThreefoldRepetition() ? 'Threefold Repetition' : chess.isInsufficientMaterial() ? 'Insufficient Material' : hasTimer && whiteTime === 0 ? 'White ran out of time' : hasTimer && blackTime === 0 ? 'Black ran out of time' : 'Resignation'}
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

        {/* Move list -- hidden in fullscreen so the board and clocks
            genuinely dominate the screen instead of competing with it
            for vertical space; still available in normal mode. */}
        {!fullscreen && (
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
        )}
      </div>
    </>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-background px-4"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
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
