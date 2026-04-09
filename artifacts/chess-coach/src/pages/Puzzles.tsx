import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { Crown, RotateCcw, ChevronRight, Trophy, Target, Flame, Zap, Lightbulb, Loader2, Lock } from 'lucide-react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';

const BG_DARK = '#262421';
const BG_CARD = '#302e2b';
const CHESSCOM_GREEN = '#81b64c';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';

interface PuzzleData {
  id: number;
  fen: string;
  rating: number;
  themes: string[];
  source: string;
  lichessId?: string;
}

interface DailyInfo {
  used: number;
  limit: number | null;
  premium: boolean;
}

interface PuzzleStats {
  total: number;
  solved: number;
  failed: number;
  accuracy: number;
  streak: number;
  todayCount: number;
  dailyLimit: number | null;
  premium: boolean;
}

type PuzzleState = 'loading' | 'ready' | 'solving' | 'correct' | 'wrong' | 'showing_solution' | 'limit_reached' | 'no_puzzles';

export function Puzzles() {
  const { authUser } = useUser();
  const [, navigate] = useLocation();
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [daily, setDaily] = useState<DailyInfo | null>(null);
  const [stats, setStats] = useState<PuzzleStats | null>(null);
  const [state, setState] = useState<PuzzleState>('loading');
  const [game, setGame] = useState<Chess | null>(null);
  const [solutionMoves, setSolutionMoves] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [showHint, setShowHint] = useState(false);
  const startTimeRef = useRef<number>(0);
  const [tab, setTab] = useState<'daily' | 'games'>('daily');
  const [gamePuzzles, setGamePuzzles] = useState<any[]>([]);
  const [generatingFromGames, setGeneratingFromGames] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/puzzles/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {}
  }, []);

  const fetchNextPuzzle = useCallback(async () => {
    setState('loading');
    setFeedback(null);
    setShowHint(false);
    setLastMove(null);
    setSolutionMoves([]);
    setCurrentMoveIndex(0);

    try {
      const res = await apiFetch('/api/puzzles/next');
      if (res.status === 403) {
        const data = await res.json();
        if (data.error === 'daily_limit') {
          setDaily({ used: data.used, limit: data.limit, premium: false });
          setState('limit_reached');
          return;
        }
      }
      if (!res.ok) {
        setState('no_puzzles');
        return;
      }
      const data = await res.json();
      setPuzzle(data.puzzle);
      setDaily(data.daily);
      setSolutionMoves(data.puzzle.moves ? data.puzzle.moves.split(' ') : []);

      const chess = new Chess(data.puzzle.fen);
      setGame(chess);
      setState('ready');
      startTimeRef.current = Date.now();
    } catch {
      setState('no_puzzles');
    }
  }, []);

  const loadPuzzleById = useCallback(async (puzzleId: number) => {
    setState('loading');
    setFeedback(null);
    setShowHint(false);
    setLastMove(null);
    setSolutionMoves([]);
    setCurrentMoveIndex(0);

    try {
      const res = await apiFetch(`/api/puzzles/${puzzleId}`);
      if (!res.ok) {
        setState('no_puzzles');
        return;
      }
      const data = await res.json();
      setPuzzle({
        id: data.id,
        fen: data.fen ?? '',
        rating: data.rating,
        themes: data.themes,
        source: data.source ?? 'game',
      });
      setSolutionMoves(data.moves ? data.moves.split(' ') : []);

      const chess = new Chess(data.fen);
      setGame(chess);
      setState('ready');
      startTimeRef.current = Date.now();
    } catch {
      setState('no_puzzles');
    }
  }, []);

  useEffect(() => {
    fetchNextPuzzle();
    fetchStats();
  }, [fetchNextPuzzle, fetchStats]);

  const fetchGamePuzzles = useCallback(async () => {
    try {
      const res = await apiFetch('/api/puzzles/my-puzzles');
      if (res.ok) {
        const data = await res.json();
        setGamePuzzles(data.puzzles);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (tab === 'games') fetchGamePuzzles();
  }, [tab, fetchGamePuzzles]);

  const generateFromGames = useCallback(async () => {
    setGeneratingFromGames(true);
    try {
      const res = await apiFetch('/api/puzzles/generate-from-games', { method: 'POST' });
      if (res.ok) {
        await fetchGamePuzzles();
      }
    } catch {}
    setGeneratingFromGames(false);
  }, [fetchGamePuzzles]);

  const boardOrientation = useMemo(() => {
    if (!puzzle?.fen) return 'white';
    try {
      const chess = new Chess(puzzle.fen);
      return chess.turn() === 'w' ? 'white' : 'black';
    } catch {
      return 'white';
    }
  }, [puzzle?.fen]);

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
    if (!game || !puzzle || state !== 'ready' || !targetSquare) return false;

    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (!move) return false;

      const uciMove = sourceSquare + targetSquare + (move.flags.includes('p') ? 'q' : '');

      setGame(gameCopy);
      setLastMove({ from: sourceSquare, to: targetSquare });

      apiFetch(`/api/puzzles/${puzzle.id}/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ move: uciMove, moveIndex: currentMoveIndex, timeMs: Date.now() - startTimeRef.current }),
      }).then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();

        if (data.solution) setSolutionMoves(data.solution);

        if (data.solved) {
          setFeedback('correct');
          setState('correct');
          fetchStats();
        } else if (data.correct) {
          setFeedback('correct');
          if (data.opponentMove) {
            setTimeout(() => {
              try {
                const om = data.opponentMove;
                const from = om.slice(0, 2);
                const to = om.slice(2, 4);
                const promo = om.length > 4 ? om[4] : undefined;
                const nextGame = new Chess(gameCopy.fen());
                nextGame.move({ from, to, promotion: promo });
                setGame(nextGame);
                setLastMove({ from, to });
                setCurrentMoveIndex(data.nextMoveIndex);
                setFeedback(null);
              } catch {}
            }, 600);
          } else {
            setCurrentMoveIndex(data.nextMoveIndex);
          }
        } else {
          setFeedback('wrong');
          setState('wrong');
          fetchStats();
        }
      }).catch(() => {});

      return true;
    } catch {
      return false;
    }
  }, [game, puzzle, state, currentMoveIndex, fetchStats]);

  const handleSquareClick = useCallback((_args: { square: string; piece: { pieceType: string } | null }) => {
  }, []);

  const canDragPiece = useCallback(({ piece }: { piece: { pieceType: string } | null }) => {
    if (state !== 'ready' || !game || !piece) return false;
    const turn = game.turn();
    const pieceColor = piece.pieceType[0].toLowerCase();
    return pieceColor === turn;
  }, [state, game]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { background: 'rgba(255, 240, 80, 0.30)' };
      styles[lastMove.to] = { background: feedback === 'correct' ? 'rgba(80, 220, 100, 0.55)' : feedback === 'wrong' ? 'rgba(220, 80, 80, 0.55)' : 'rgba(255, 240, 80, 0.55)' };
    }
    if (showHint && solutionMoves.length > currentMoveIndex) {
      const hintMove = solutionMoves[currentMoveIndex];
      const hintFrom = hintMove?.slice(0, 2);
      if (hintFrom) {
        styles[hintFrom] = { background: 'rgba(129, 182, 76, 0.6)', borderRadius: '50%' };
      }
    }
    return styles;
  }, [lastMove, feedback, showHint, solutionMoves, currentMoveIndex]);

  const themeLabels: Record<string, string> = {
    'fork': 'Fork',
    'pin': 'Pin',
    'skewer': 'Skewer',
    'discoveredAttack': 'Discovered Attack',
    'doubleCheck': 'Double Check',
    'sacrifice': 'Sacrifice',
    'mateIn1': 'Mate in 1',
    'mateIn2': 'Mate in 2',
    'mateIn3': 'Mate in 3',
    'endgame': 'Endgame',
    'middlegame': 'Middlegame',
    'opening': 'Opening',
    'tactical': 'Tactical',
    'blunder': 'From Blunder',
    'mistake': 'From Mistake',
    'hangingPiece': 'Hanging Piece',
    'trappedPiece': 'Trapped Piece',
    'defensiveMove': 'Defensive',
    'crushing': 'Crushing',
    'advantage': 'Advantage',
    'equality': 'Equality',
    'backRankMate': 'Back Rank Mate',
    'castling': 'Castling',
    'kingsideAttack': 'Kingside Attack',
    'queensideAttack': 'Queenside Attack',
    'promotion': 'Promotion',
    'deflection': 'Deflection',
    'interference': 'Interference',
    'clearance': 'Clearance',
    'quietMove': 'Quiet Move',
    'xRayAttack': 'X-Ray Attack',
    'zugzwang': 'Zugzwang',
    'attraction': 'Attraction',
    'exposedKing': 'Exposed King',
    'short': 'Short',
    'long': 'Long',
    'veryLong': 'Very Long',
    'master': 'Master Game',
    'masterVsMaster': 'Master vs Master',
    'superGM': 'Super GM',
    'oneMove': 'One Move',
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: BG_DARK }}>
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold" style={{ color: TEXT_LIGHT }}>
            <span className="mr-2">♟</span>Puzzles
          </h1>
          {stats && (
            <div className="flex items-center gap-3 text-xs" style={{ color: TEXT_MUTED }}>
              <span className="flex items-center gap-1"><Flame size={14} style={{ color: '#f59e0b' }} />{stats.streak}</span>
              <span className="flex items-center gap-1"><Target size={14} style={{ color: CHESSCOM_GREEN }} />{stats.accuracy}%</span>
              <span className="flex items-center gap-1"><Trophy size={14} style={{ color: '#f59e0b' }} />{stats.solved}</span>
            </div>
          )}
        </div>

        <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {(['daily', 'games'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: tab === t ? CHESSCOM_GREEN : 'transparent',
                color: tab === t ? '#000' : TEXT_MUTED,
              }}
            >
              {t === 'daily' ? 'Daily Puzzles' : 'My Game Puzzles'}
            </button>
          ))}
        </div>

        {tab === 'daily' && (
          <>
            {daily && !daily.premium && daily.limit && state !== 'limit_reached' && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg mb-3"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <span className="text-xs font-medium" style={{ color: '#fbbf24' }}>
                  {daily.used}/{daily.limit} free puzzles today
                </span>
                <button onClick={() => navigate('/subscription')} className="text-xs font-bold px-2 py-1 rounded"
                  style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                  Go Pro
                </button>
              </div>
            )}

            {state === 'loading' && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="animate-spin mb-3" size={32} style={{ color: CHESSCOM_GREEN }} />
                <p className="text-sm" style={{ color: TEXT_MUTED }}>Loading puzzle...</p>
              </div>
            )}

            {state === 'limit_reached' && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <Lock size={28} style={{ color: '#f59e0b' }} />
                </div>
                <h2 className="text-lg font-bold mb-2" style={{ color: TEXT_LIGHT }}>Daily Limit Reached</h2>
                <p className="text-sm mb-6 max-w-xs" style={{ color: TEXT_MUTED }}>
                  Free users get {daily?.limit ?? 5} puzzles per day. Upgrade to ChessScout Pro for unlimited puzzles!
                </p>
                <button onClick={() => navigate('/subscription')}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all hover:scale-105"
                  style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                  <Crown size={18} />Upgrade to Pro
                </button>
              </div>
            )}

            {state === 'no_puzzles' && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm mb-4" style={{ color: TEXT_MUTED }}>No puzzles available right now.</p>
                <button onClick={fetchNextPuzzle}
                  className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                  Try Again
                </button>
              </div>
            )}

            {(state === 'ready' || state === 'correct' || state === 'wrong' || state === 'solving' || state === 'showing_solution') && puzzle && game && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded"
                      style={{ background: 'rgba(129,182,76,0.15)', color: CHESSCOM_GREEN }}>
                      Rating: {puzzle.rating}
                    </span>
                    {puzzle.themes.slice(0, 3).map(theme => (
                      <span key={theme} className="text-xs px-2 py-0.5 rounded"
                        style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_MUTED }}>
                        {themeLabels[theme] || theme}
                      </span>
                    ))}
                  </div>
                  {puzzle.lichessId && (
                    <a href={`https://lichess.org/training/${puzzle.lichessId}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs underline" style={{ color: TEXT_MUTED }}>
                      Lichess
                    </a>
                  )}
                </div>

                <div className="mb-3 text-center">
                  <span className="text-sm font-semibold" style={{ color: boardOrientation === 'white' ? TEXT_LIGHT : TEXT_LIGHT }}>
                    {state === 'ready' ? (
                      <span style={{ color: CHESSCOM_GREEN }}>
                        {game.turn() === 'w' ? '⬜ White' : '⬛ Black'} to move — find the best move!
                      </span>
                    ) : state === 'correct' ? (
                      <span style={{ color: '#4ade80' }}>✓ Correct! Well done!</span>
                    ) : state === 'wrong' ? (
                      <span style={{ color: '#f87171' }}>✗ Incorrect</span>
                    ) : null}
                  </span>
                </div>

                <div className="relative w-full max-w-[500px] mx-auto mb-4">
                  <Chessboard
                    options={{
                      position: game.fen(),
                      boardOrientation: boardOrientation,
                      allowDragging: true,
                      dragActivationDistance: 8,
                      canDragPiece: canDragPiece,
                      onPieceDrop: handlePieceDrop,
                      onSquareClick: handleSquareClick,
                      squareStyles,
                      boardStyle: {
                        borderRadius: '10px',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                      },
                      lightSquareStyle: { backgroundColor: '#f0d9b5' },
                      darkSquareStyle: { backgroundColor: '#b58863' },
                      animationDurationInMs: 150,
                    }}
                  />

                  <AnimatePresence>
                    {feedback && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        className={`absolute inset-0 rounded-[10px] pointer-events-none flex items-center justify-center
                          ${feedback === 'correct' ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}
                      >
                        <span className={`text-6xl font-black drop-shadow-lg ${feedback === 'correct' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {feedback === 'correct' ? '✓' : '✗'}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center justify-center gap-3">
                  {state === 'ready' && (
                    <button
                      onClick={() => setShowHint(!showHint)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={{ background: 'rgba(255,255,255,0.06)', color: showHint ? '#fbbf24' : TEXT_MUTED }}>
                      <Lightbulb size={16} />Hint
                    </button>
                  )}

                  {(state === 'correct' || state === 'wrong') && (
                    <button
                      onClick={() => {
                        fetchNextPuzzle();
                      }}
                      className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105"
                      style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                      <ChevronRight size={16} />Next Puzzle
                    </button>
                  )}

                  {state === 'wrong' && solutionMoves.length > 0 && (
                    <button
                      onClick={() => {
                        setState('showing_solution');
                        const chess = new Chess(puzzle.fen);
                        let i = 0;
                        const playSolution = () => {
                          if (i >= solutionMoves.length) return;
                          const m = solutionMoves[i];
                          const from = m.slice(0, 2);
                          const to = m.slice(2, 4);
                          const promo = m.length > 4 ? m[4] : undefined;
                          try {
                            chess.move({ from, to, promotion: promo });
                            setGame(new Chess(chess.fen()));
                            setLastMove({ from, to });
                          } catch {}
                          i++;
                          if (i < solutionMoves.length) {
                            setTimeout(playSolution, 800);
                          }
                        };
                        setGame(new Chess(puzzle.fen));
                        setTimeout(playSolution, 400);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={{ background: 'rgba(255,255,255,0.08)', color: TEXT_MUTED }}>
                      <Zap size={16} />Show Solution
                    </button>
                  )}

                  {state === 'showing_solution' && (
                    <button
                      onClick={fetchNextPuzzle}
                      className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105"
                      style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                      <ChevronRight size={16} />Next Puzzle
                    </button>
                  )}
                </div>
              </>
            )}

            {stats && (
              <div className="mt-6 grid grid-cols-4 gap-2">
                {[
                  { label: 'Solved', value: stats.solved, icon: <Trophy size={14} /> },
                  { label: 'Accuracy', value: `${stats.accuracy}%`, icon: <Target size={14} /> },
                  { label: 'Streak', value: stats.streak, icon: <Flame size={14} /> },
                  { label: 'Today', value: stats.todayCount, icon: <Zap size={14} /> },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: BG_CARD }}>
                    <div className="flex items-center justify-center gap-1 mb-1" style={{ color: CHESSCOM_GREEN }}>
                      {s.icon}
                    </div>
                    <div className="text-lg font-bold" style={{ color: TEXT_LIGHT }}>{s.value}</div>
                    <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'games' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm" style={{ color: TEXT_MUTED }}>
                Puzzles generated from your analyzed games
              </p>
              <button
                onClick={generateFromGames}
                disabled={generatingFromGames}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                {generatingFromGames ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Generate
              </button>
            </div>

            {gamePuzzles.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'rgba(129,182,76,0.1)' }}>
                  <Target size={24} style={{ color: CHESSCOM_GREEN }} />
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: TEXT_LIGHT }}>No game puzzles yet</p>
                <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>
                  Analyze your games first, then generate puzzles from your mistakes
                </p>
                <button
                  onClick={generateFromGames}
                  disabled={generatingFromGames}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                  Generate Puzzles
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {gamePuzzles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setTab('daily');
                      loadPuzzleById(p.id);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
                    style={{ background: BG_CARD }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                        style={{ background: p.solved ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)' }}>
                        {p.solved ? '✓' : '♟'}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold" style={{ color: TEXT_LIGHT }}>
                          Rating {p.rating}
                        </div>
                        <div className="text-xs" style={{ color: TEXT_MUTED }}>
                          {p.themes.map((t: string) => themeLabels[t] || t).join(', ')}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: TEXT_MUTED }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
