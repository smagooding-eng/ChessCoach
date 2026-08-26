import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PieceTile } from '@/components/DesignSystem';
import { Chess } from 'chess.js';
import { Chessboard, defaultPieces } from 'react-chessboard';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { Crown, RotateCcw, ChevronRight, Trophy, Target, Flame, Zap, Lightbulb, Loader2, Lock, Share2 } from 'lucide-react';
import { useLocation, useSearch, Link } from 'wouter';
import { encodeCard } from '@/pages/ShareCard';
import { UpgradeNudge } from '@/components/UpgradeNudge';
import { AnimatePresence, motion } from 'framer-motion';
import { useSettings, playMoveSound } from '@/context/SettingsContext';
import { EvalBar, MaterialStrip } from '@/components/GameStatusStrip';

const BG_DARK = '#262421';
const BG_CARD = 'linear-gradient(180deg, #383532 0%, #2a2825 100%)';
const CHESSCOM_GREEN = '#81b64c';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const CARD_SHADOW = '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)';
const CARD_BORDER = '1px solid rgba(129,182,76,0.08)';

// Options for the "Puzzle Type" filter row. value='' means no filter (any
// puzzle). Values map to Lichess theme tags, matched via the backend's
// ?puzzleTheme= exact-tag filter.
const PUZZLE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'mateIn1', label: 'Mate in 1' },
  { value: 'mateIn2', label: 'Mate in 2' },
  { value: 'mateIn3', label: 'Mate in 3' },
  { value: 'mateIn4', label: 'Mate in 4+' },
  { value: 'fork', label: 'Fork' },
  { value: 'pin', label: 'Pin' },
  { value: 'skewer', label: 'Skewer' },
  { value: 'sacrifice', label: 'Sacrifice' },
  { value: 'discoveredAttack', label: 'Discovered Attack' },
  { value: 'hangingPiece', label: 'Hanging Piece' },
  { value: 'crushing', label: 'Crushing' },
  { value: 'endgame', label: 'Endgame' },
  { value: 'middlegame', label: 'Middlegame' },
  { value: 'opening', label: 'Opening' },
];

// ELO/rating band filter options. value is "min-max" (max='' means no
// upper bound), parsed when building the fetch request.
const RATING_BAND_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Ratings' },
  { value: '0-800', label: 'Under 800' },
  { value: '800-1200', label: '800-1200' },
  { value: '1200-1600', label: '1200-1600' },
  { value: '1600-2000', label: '1600-2000' },
  { value: '2000-2500', label: '2000-2500' },
  { value: '2500-', label: '2500+' },
];

interface PuzzleData {
  id: number;
  fen: string;
  rating: number;
  themes: string[];
  source: string;
  lichessId?: string;
  explanation?: string | null;
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
  const { boardColors, boardTextureCss, pieceColors, pieceShape, showCoordinates, soundEnabled, boardMaxWidth } = useSettings();
  const [, navigate] = useLocation();
  const search = useSearch();
  const targetTheme = new URLSearchParams(search).get('theme') ?? new URLSearchParams(search).get('weakness');
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
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const startTimeRef = useRef<number>(0);

  // "My Game Puzzles" tab removed -- Daily Puzzles is now the only mode,
  // with an added puzzle-type filter (mate in N, etc) below instead.
  const [puzzleTheme, setPuzzleTheme] = useState<string>('');
  const [sacrificePiece, setSacrificePiece] = useState<string>('');
  const [pieceTypeMismatch, setPieceTypeMismatch] = useState(false);
  const [ratingBand, setRatingBand] = useState<string>('');
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const seenPuzzleIds = useRef<number[]>([]);

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
    setSelectedSquare(null);
    setExplanation(null);
    setLoadingExplanation(false);

    try {
      const params = new URLSearchParams();
      if (seenPuzzleIds.current.length > 0) params.set('exclude', seenPuzzleIds.current.join(','));
      if (targetTheme) params.set('weakness', targetTheme);
      if (puzzleTheme) params.set('puzzleTheme', puzzleTheme);
      if (puzzleTheme === 'sacrifice' || puzzleTheme.startsWith('mateIn')) {
        if (sacrificePiece) params.set('pieceType', sacrificePiece);
      }
      if (ratingBand) {
        const [min, max] = ratingBand.split('-');
        if (min) params.set('minRating', min);
        if (max) params.set('maxRating', max);
      }
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch(`/api/puzzles/next${qs}`);
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
      setPieceTypeMismatch(data.pieceTypeMatched === false);
      setSolutionMoves(data.puzzle.moves ? data.puzzle.moves.split(' ') : []);
      seenPuzzleIds.current.push(data.puzzle.id);

      const chess = new Chess(data.puzzle.fen);
      setGame(chess);
      setState('ready');
      startTimeRef.current = Date.now();
    } catch {
      setState('no_puzzles');
    }
  }, [puzzleTheme, ratingBand, sacrificePiece]);

  useEffect(() => {
    fetchNextPuzzle();
    fetchStats();
  }, [fetchNextPuzzle, fetchStats]);

  const boardOrientation = useMemo(() => {
    if (!puzzle?.fen) return 'white';
    try {
      const chess = new Chess(puzzle.fen);
      return chess.turn() === 'w' ? 'white' : 'black';
    } catch {
      return 'white';
    }
  }, [puzzle?.fen]);

  const tryMoveFromTo = useCallback((from: string, to: string): boolean => {
    if (!game || !puzzle || state !== 'ready') return false;
    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({ from, to, promotion: 'q' });
      if (!move) return false;
      if (soundEnabled) playMoveSound(move.captured ? 'capture' : 'move');

      const uciMove = from + to + (move.flags.includes('p') ? 'q' : '');

      setGame(gameCopy);
      setLastMove({ from, to });
      setSelectedSquare(null);

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
          if (puzzle?.explanation) {
            setExplanation(puzzle.explanation);
          } else if (puzzle) {
            setLoadingExplanation(true);
            apiFetch(`/api/puzzles/${puzzle.id}/explain`, { method: 'POST' })
              .then(async (er) => {
                if (er.ok) {
                  const ed = await er.json();
                  setExplanation(ed.explanation);
                }
              })
              .catch(() => {})
              .finally(() => setLoadingExplanation(false));
          }
        } else if (data.correct) {
          setFeedback('correct');
          if (data.opponentMove) {
            setTimeout(() => {
              try {
                const om = data.opponentMove;
                const omFrom = om.slice(0, 2);
                const omTo = om.slice(2, 4);
                const promo = om.length > 4 ? om[4] : undefined;
                const nextGame = new Chess(gameCopy.fen());
                nextGame.move({ from: omFrom, to: omTo, promotion: promo });
                setGame(nextGame);
                setLastMove({ from: omFrom, to: omTo });
                setCurrentMoveIndex(data.nextMoveIndex);
                setFeedback(null);
              } catch {}
            }, 600);
          } else {
            setCurrentMoveIndex(data.nextMoveIndex);
          }
        } else {
          setFeedback('wrong');
          const resetFen = game.fen();
          setTimeout(() => {
            setGame(new Chess(resetFen));
            setLastMove(null);
            setFeedback(null);
          }, 1200);
        }
      }).catch(() => {});

      return true;
    } catch {
      return false;
    }
  }, [game, puzzle, state, currentMoveIndex, fetchStats, soundEnabled]);

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
    if (!targetSquare) return false;
    setSelectedSquare(null);
    return tryMoveFromTo(sourceSquare, targetSquare);
  }, [tryMoveFromTo]);

  const legalMoveInfo = useMemo(() => {
    if (!selectedSquare || !game || state !== 'ready') return { targets: [] as string[], captures: new Set<string>() };
    try {
      const moves = game.moves({ square: selectedSquare as any, verbose: true });
      const targets = moves.map(m => m.to);
      const captures = new Set(moves.filter(m => m.captured).map(m => m.to));
      return { targets, captures };
    } catch {
      return { targets: [] as string[], captures: new Set<string>() };
    }
  }, [selectedSquare, game, state]);

  const legalTargets = legalMoveInfo.targets;

  // Same fill-based piece tinting used in the shared ChessBoard component --
  // duplicated here since this page renders react-chessboard directly
  // rather than through that shared wrapper.
  const tintedPieces = useMemo(() => {
    if (pieceShape === 'cburnett') {
      const wrapped: typeof defaultPieces = {};
      for (const key of Object.keys(defaultPieces)) {
        wrapped[key] = ({ svgStyle } = {}) => (
          <img src={`/pieces/cburnett/${key}.svg`} alt={key} style={{ width: '100%', height: '100%', ...svgStyle }} />
        );
      }
      return wrapped;
    }
    if (pieceColors.light === '#ffffff' && pieceColors.dark === '#2b2b2b' && Object.keys(pieceColors.finish).length === 0) return undefined;
    const wrapped: typeof defaultPieces = {};
    for (const [key, PieceComponent] of Object.entries(defaultPieces)) {
      const isWhitePiece = key.startsWith('w');
      const fill = isWhitePiece ? pieceColors.light : pieceColors.dark;
      wrapped[key] = (props) => (
        <PieceComponent {...props} fill={fill} svgStyle={{ ...props?.svgStyle, ...pieceColors.finish }} />
      );
    }
    return wrapped;
  }, [pieceColors, pieceShape]);

  const handleSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (state !== 'ready' || !game) return;

    if (selectedSquare) {
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
      if (legalTargets.includes(square)) {
        tryMoveFromTo(selectedSquare, square);
        return;
      }
      if (piece) {
        const turn = game.turn();
        const pieceColor = piece.pieceType[0].toLowerCase();
        if (pieceColor === turn) {
          setSelectedSquare(square);
          return;
        }
      }
      setSelectedSquare(null);
      return;
    }

    if (piece) {
      const turn = game.turn();
      const pieceColor = piece.pieceType[0].toLowerCase();
      if (pieceColor === turn) {
        setSelectedSquare(square);
      }
    }
  }, [state, game, selectedSquare, legalTargets, tryMoveFromTo]);

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
    if (selectedSquare) {
      styles[selectedSquare] = { background: 'rgba(100, 180, 255, 0.55)', borderRadius: '4px' };
    }
    for (const sq of legalTargets) {
      if (legalMoveInfo.captures.has(sq)) {
        styles[sq] = {
          background: 'radial-gradient(circle, transparent 55%, rgba(100,180,255,0.55) 56%)',
          borderRadius: '50%',
          ...(styles[sq] || {}),
        };
      } else {
        styles[sq] = {
          background: 'radial-gradient(circle, rgba(100,180,255,0.55) 28%, transparent 30%)',
          ...(styles[sq] || {}),
        };
      }
    }
    if (showHint && solutionMoves.length > currentMoveIndex && game) {
      const hintMove = solutionMoves[currentMoveIndex];
      const hintFrom = hintMove?.slice(0, 2);
      const hintTo = hintMove?.slice(2, 4);
      if (hintFrom) {
        const piece = game.get(hintFrom as any);
        if (piece && ((piece.color === 'w' && game.turn() === 'w') || (piece.color === 'b' && game.turn() === 'b'))) {
          styles[hintFrom] = { background: 'rgba(129, 182, 76, 0.6)', borderRadius: '50%' };
          if (hintTo) {
            styles[hintTo] = {
              background: 'radial-gradient(circle, rgba(129,182,76,0.5) 28%, transparent 30%)',
              ...(styles[hintTo] || {}),
            };
          }
        }
      }
    }
    return styles;
  }, [lastMove, feedback, selectedSquare, legalTargets, legalMoveInfo, showHint, solutionMoves, currentMoveIndex, game]);

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
          <div className="flex items-center gap-3">
            <PieceTile piece="♛" size={44} />
            <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2" style={{ color: TEXT_LIGHT, letterSpacing: '-0.02em' }}>
              Puzzles
            </h1>
          </div>
          {stats && (
            <div className="flex items-center gap-3 text-xs" style={{ color: TEXT_MUTED }}>
              <span className="flex items-center gap-1"><Flame size={14} style={{ color: '#f59e0b' }} />{stats.streak}</span>
              <span className="flex items-center gap-1"><Target size={14} style={{ color: CHESSCOM_GREEN }} />{stats.accuracy}%</span>
              <span className="flex items-center gap-1"><Trophy size={14} style={{ color: '#f59e0b' }} />{stats.solved}</span>
            </div>
          )}
        </div>

        <Link href="/puzzles/solved" className="inline-flex items-center gap-1.5 mb-4 text-xs font-bold" style={{ color: CHESSCOM_GREEN }}>
          View Solved Puzzles Archive
        </Link>

        {targetTheme && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl mb-4"
            style={{ background: 'rgba(129,182,76,0.1)', border: '1px solid rgba(129,182,76,0.25)' }}>
            <span className="text-sm font-semibold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
              <Target size={15} style={{ color: CHESSCOM_GREEN }} />
              Practicing puzzles for: <span style={{ color: CHESSCOM_GREEN }}>{targetTheme}</span>
            </span>
            <button
              onClick={() => navigate('/puzzles')}
              className="text-xs font-semibold shrink-0"
              style={{ color: TEXT_MUTED }}
            >
              Clear
            </button>
          </div>
        )}

        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {PUZZLE_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setPuzzleTheme(opt.value); if (opt.value !== 'sacrifice' && !opt.value.startsWith('mateIn')) setSacrificePiece(''); }}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: puzzleTheme === opt.value ? CHESSCOM_GREEN : 'rgba(255,255,255,0.04)',
                color: puzzleTheme === opt.value ? '#000' : TEXT_MUTED,
                border: puzzleTheme === opt.value ? 'none' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(puzzleTheme === 'sacrifice' || puzzleTheme.startsWith('mateIn')) && (
          <div className="mb-4">
            {puzzleTheme.startsWith('mateIn') && (
              <p className="text-[11px] font-bold mb-1.5" style={{ color: TEXT_MUTED }}>Mates that are also sacrifices</p>
            )}
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {[
                { value: '', label: 'Any Piece' },
                { value: 'queen', label: 'Queen Sac' },
                { value: 'rook', label: 'Rook Sac' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSacrificePiece(opt.value)}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: sacrificePiece === opt.value ? '#c9a24b' : 'rgba(255,255,255,0.04)',
                    color: sacrificePiece === opt.value ? '#000' : TEXT_MUTED,
                    border: sacrificePiece === opt.value ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {RATING_BAND_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRatingBand(opt.value)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: ratingBand === opt.value ? CHESSCOM_GREEN : 'rgba(255,255,255,0.04)',
                color: ratingBand === opt.value ? '#000' : TEXT_MUTED,
                border: ratingBand === opt.value ? 'none' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(
          <>
            {daily && !daily.premium && daily.limit && state !== 'limit_reached' && (
              <div className="mb-3">
                <UpgradeNudge headline={`${daily.used}/${daily.limit} free puzzles today — upgrade for unlimited`} compact />
              </div>
            )}

            {state === 'loading' && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="animate-spin mb-3" size={32} style={{ color: CHESSCOM_GREEN }} />
                <p className="text-sm" style={{ color: TEXT_MUTED }}>Loading puzzle...</p>
              </div>
            )}

            {state === 'limit_reached' && (
              <UpgradeNudge
                headline="You've used today's free puzzles"
                subtext={`Free plan includes ${daily?.limit ?? 5} puzzles per day. Upgrade to Pro for unlimited puzzles!`}
              />
            )}

            {state === 'no_puzzles' && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm mb-4" style={{ color: TEXT_MUTED }}>No puzzles available right now.</p>
                <button onClick={fetchNextPuzzle}
                  className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                  Try Again
                </button>
              </div>
            )}

            {(state === 'ready' || state === 'correct' || state === 'wrong' || state === 'solving' || state === 'showing_solution') && puzzle && game && (
              <>
                {pieceTypeMismatch && (
                  <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium" style={{ background: 'rgba(234,151,51,0.1)', color: '#ea9733', border: '1px solid rgba(234,151,51,0.25)' }}>
                    Couldn't find an exact {sacrificePiece} sacrifice match right now — showing the closest puzzle instead. Try "Next Puzzle" for another attempt.
                  </div>
                )}
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
                  <span className="text-sm font-bold" style={{ color: boardOrientation === 'white' ? TEXT_LIGHT : TEXT_LIGHT }}>
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

                <div className="relative w-full mx-auto mb-4" style={{ maxWidth: boardMaxWidth }}>
                  <MaterialStrip fen={game?.fen() ?? ''} color={boardOrientation === 'white' ? 'b' : 'w'} className="px-1 mb-1.5" />
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
                      showNotation: showCoordinates,
                      boardStyle: {
                        borderRadius: '10px',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                      },
                      lightSquareStyle: { backgroundColor: boardColors.light, backgroundImage: boardTextureCss.backgroundImage, backgroundSize: boardTextureCss.backgroundSize },
                      darkSquareStyle: { backgroundColor: boardColors.dark, backgroundImage: boardTextureCss.backgroundImage, backgroundSize: boardTextureCss.backgroundSize },
                      pieces: tintedPieces,
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
                  <MaterialStrip fen={game?.fen() ?? ''} color={boardOrientation === 'white' ? 'w' : 'b'} className="px-1 mt-1.5" />
                  <div className="mt-2 px-1">
                    <EvalBar fen={game?.fen() ?? ''} />
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3">
                  {state === 'ready' && (
                    <button
                      onClick={() => setShowHint(!showHint)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                      style={{ background: 'rgba(255,255,255,0.06)', color: showHint ? '#fbbf24' : TEXT_MUTED }}>
                      <Lightbulb size={16} />Hint
                    </button>
                  )}

                  {(state === 'ready' || state === 'solving' || state === 'correct') && puzzle && (
                    <button
                      onClick={() => {
                        setGame(new Chess(puzzle.fen));
                        setCurrentMoveIndex(0);
                        setLastMove(null);
                        setFeedback(null);
                        setState('ready');
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                      style={{ background: 'rgba(255,255,255,0.08)', color: TEXT_MUTED }}>
                      <RotateCcw size={16} />Retry
                    </button>
                  )}

                  {(state === 'correct' || state === 'wrong') && (
                    <button
                      onClick={() => {
                        fetchNextPuzzle();
                      }}
                      className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
                      style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                      <ChevronRight size={16} />Next Puzzle
                    </button>
                  )}

                  {state === 'correct' && puzzle && (
                    <button
                      onClick={async () => {
                        const today = new Date();
                        const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
                        const themesLine = (puzzle.themes ?? []).join(' ') || 'tactics';
                        // Standard PGN tags for a non-starting position:
                        // SetUp + FEN. Result "*" since it's unsolved/
                        // ongoing. The comment carries the watermark and
                        // doubles as the "can you solve it" prompt for
                        // whoever opens this file.
                        const pgn = [
                          '[Event "ChessScout.net Puzzle"]',
                          '[Site "https://chessscout.net"]',
                          `[Date "${dateStr}"]`,
                          '[White "?"]',
                          '[Black "?"]',
                          '[Result "*"]',
                          '[SetUp "1"]',
                          `[FEN "${puzzle.fen}"]`,
                          `[Rating "${puzzle.rating}"]`,
                          `[Themes "${themesLine}"]`,
                          '[Annotator "ChessScout.net"]',
                          '',
                          `{Can you find the winning move? This ${puzzle.rating}-rated puzzle is unsolved -- solve it and thousands more free at https://chessscout.net}`,
                          '*',
                        ].join('\n');

                        const filename = `chessscout-puzzle-${puzzle.id}.pgn`;
                        const file = new File([pgn], filename, { type: 'application/x-chess-pgn' });

                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                          try {
                            await navigator.share({
                              files: [file],
                              title: `ChessScout.net Puzzle (${puzzle.rating})`,
                              text: `Can you solve this ${puzzle.rating}-rated puzzle?`,
                            });
                            return;
                          } catch { /* fall through to download */ }
                        }

                        const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={{ background: 'rgba(255,255,255,0.08)', color: TEXT_MUTED }}>
                      <Share2 size={16} />Share PGN
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
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                      style={{ background: 'rgba(255,255,255,0.08)', color: TEXT_MUTED }}>
                      <Zap size={16} />Show Solution
                    </button>
                  )}

                  {state === 'showing_solution' && (
                    <button
                      onClick={fetchNextPuzzle}
                      className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
                      style={{ background: CHESSCOM_GREEN, color: '#000' }}>
                      <ChevronRight size={16} />Next Puzzle
                    </button>
                  )}
                </div>

                {state === 'correct' && (
                  <div className="mt-4 rounded-xl p-4" style={{ background: BG_CARD, border: '1px solid rgba(129,182,76,0.2)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb size={16} style={{ color: '#fbbf24' }} />
                      <span className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>Why this works</span>
                    </div>
                    {loadingExplanation ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="animate-spin" size={14} style={{ color: TEXT_MUTED }} />
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>Analyzing position...</span>
                      </div>
                    ) : explanation ? (
                      <p className="text-sm leading-relaxed" style={{ color: TEXT_MUTED }}>{explanation}</p>
                    ) : null}
                  </div>
                )}
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
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
                    <div className="flex items-center justify-center gap-1 mb-1" style={{ color: CHESSCOM_GREEN }}>
                      {s.icon}
                    </div>
                    <div className="text-lg font-bold" style={{ color: TEXT_LIGHT }}>{s.value}</div>
                    <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {stats && stats.streak >= 3 && (
              <button
                onClick={async () => {
                  const url = `${window.location.origin}/share/${encodeCard({
                    type: 'streak',
                    username: authUser?.chesscomUsername ?? authUser?.lichessUsername ?? 'A ChessScout.net user',
                    streakDays: stats.streak,
                    accuracy: stats.accuracy,
                  })}`;
                  const shareData = { title: `${stats.streak}-day puzzle streak on ChessScout.net`, url };
                  if (navigator.share) {
                    try { await navigator.share(shareData); return; } catch { /* fall through to clipboard */ }
                  }
                  try { await navigator.clipboard.writeText(url); } catch { /* nothing more we can do */ }
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
              >
                <Flame size={15} /> Share your {stats.streak}-day streak
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
