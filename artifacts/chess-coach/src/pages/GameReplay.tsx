import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { useGameViewer } from '@/hooks/use-games';
import { ChessBoard } from '@/components/ChessBoard';
import { Chess } from 'chess.js';
import { normalizeFen } from '@/lib/utils';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Play, Pause, ArrowLeft, BrainCircuit, FlipVertical2,
  Swords, Clock, Zap, BookOpen, Cpu, Lightbulb, Sparkles, Trophy, Target, RotateCcw, Bot
} from 'lucide-react';
import { BOTS, getBotMove, type BotConfig } from '@/lib/chess-bot';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { apiFetch } from '@/lib/api';
import { WaitTipCarousel } from '@/components/WaitTipCarousel';
import { AICoachCard, type AICoachTone } from '@/components/AICoachCard';
import { MistakeFixView } from '@/components/MistakeFixView';
import { AnimatePresence, motion } from 'framer-motion';

type Classification = 'checkmate' | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder' | 'missed_win';

function classificationToTone(c?: Classification | null): AICoachTone {
  switch (c) {
    case 'brilliant': return 'info';
    case 'great':
    case 'best':
    case 'excellent':
      return 'positive';
    case 'good':
    case 'book':
      return 'neutral';
    case 'inaccuracy': return 'warning';
    case 'mistake':
    case 'missed_win':
      return 'warning';
    case 'blunder': return 'danger';
    case 'checkmate': return 'gold';
    default: return 'neutral';
  }
}

type ReviewMove = {
  moveIndex: number;
  san: string;
  color: 'white' | 'black';
  classification: Classification;
  explanation: string;
  betterMove: string | null;
  pros: string[];
  cons: string[];
  cpLoss?: number;
  engineAvailable?: boolean;
};

type KeyMistake = {
  moveIndex: number;
  move: string;
  whatWentWrong: string;
  whatYouShouldHaveDone: string;
  tip: string;
};

type GameSummary = {
  overview: string;
  keyMistakes: KeyMistake[];
  strengths: string[];
  improvementAreas: string[];
};

const CLASS_CFG: Record<Classification, { badge: string; color: string; full: string }> = {
  checkmate:   { badge: '♚',  color: 'text-amber-400 bg-amber-400/15 border-amber-400/30',        full: 'Checkmate' },
  brilliant:   { badge: '!!', color: 'text-cyan-400 bg-cyan-400/15 border-cyan-400/30',           full: 'Brilliant Move' },
  great:       { badge: '!',  color: 'text-sky-400 bg-sky-400/15 border-sky-400/30',              full: 'Great Move' },
  best:        { badge: '!',  color: 'text-emerald-400 bg-emerald-400/15 border-emerald-400/30',  full: 'Best Move' },
  excellent:   { badge: '!',  color: 'text-teal-400 bg-teal-400/15 border-teal-400/30',           full: 'Excellent Move' },
  good:        { badge: '!',  color: 'text-green-400 bg-green-400/15 border-green-400/30',        full: 'Good Move' },
  book:        { badge: '📖', color: 'text-blue-400 bg-blue-400/15 border-blue-400/30',           full: 'Book Move' },
  inaccuracy:  { badge: '?!', color: 'text-yellow-400 bg-yellow-400/15 border-yellow-400/30',     full: 'Inaccuracy' },
  mistake:     { badge: '?',  color: 'text-orange-400 bg-orange-400/15 border-orange-400/30',     full: 'Mistake' },
  blunder:     { badge: '??', color: 'text-rose-400 bg-rose-400/15 border-rose-400/30',           full: 'Blunder' },
  missed_win:  { badge: '✗',  color: 'text-red-400 bg-red-400/15 border-red-400/30',             full: 'Missed Win' },
};

function GameRatingPanel({
  reviewMoves,
  game,
  whiteAvatar,
  blackAvatar,
}: {
  reviewMoves: ReviewMove[];
  game: { whiteUsername: string; blackUsername: string; whiteRating?: number; blackRating?: number };
  whiteAvatar?: string;
  blackAvatar?: string;
}) {
  const WIN_PCT_LOSS_BY_CLASS: Record<Classification, number> = {
    checkmate: 0, brilliant: 0, great: 0, best: 0, excellent: 0.5, book: 0.7, good: 2,
    inaccuracy: 8, mistake: 16, blunder: 33, missed_win: 25,
  };

  const byColor = (c: 'white' | 'black') => reviewMoves.filter(m => m.color === c);

  const calcAccuracy = (moves: ReviewMove[]) => {
    if (moves.length === 0) return 0;
    const totalWinPctLoss = moves.reduce((s, m) => {
      if (m.cpLoss != null && m.engineAvailable) return s + m.cpLoss;
      const base = WIN_PCT_LOSS_BY_CLASS[m.classification];
      const unverifiedFloor = 3;
      return s + Math.max(base, ['good', 'book', 'excellent', 'best', 'great'].includes(m.classification) && !m.engineAvailable ? unverifiedFloor : base);
    }, 0);
    const avgWinPctLoss = totalWinPctLoss / moves.length;
    return Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.065 * avgWinPctLoss) - 3.1668));
  };

  const toGameRating = (acc: number) => {
    if (acc <= 10) return 0;
    if (acc >= 99.5) return 3200;
    const anchors = [[20,0],[40,100],[50,250],[55,350],[60,500],[65,700],[70,950],[75,1200],[80,1500],[85,1850],[90,2200],[95,2700],[99,3150]];
    for (let i = 1; i < anchors.length; i++) {
      if (acc <= anchors[i][0]) {
        const [x0,y0] = anchors[i-1];
        const [x1,y1] = anchors[i];
        return Math.round(y0 + (y1 - y0) * (acc - x0) / (x1 - x0));
      }
    }
    return 3200;
  };

  const counts = (moves: ReviewMove[]) => ({
    brilliant: moves.filter(m => m.classification === 'brilliant').length,
    great: moves.filter(m => m.classification === 'great').length,
    best: moves.filter(m => m.classification === 'best').length,
    excellent: moves.filter(m => m.classification === 'excellent').length,
    good: moves.filter(m => m.classification === 'good' || m.classification === 'book').length,
    inaccuracy: moves.filter(m => m.classification === 'inaccuracy').length,
    mistake: moves.filter(m => m.classification === 'mistake').length,
    blunder: moves.filter(m => m.classification === 'blunder').length,
    missed_win: moves.filter(m => m.classification === 'missed_win').length,
  });

  const phaseGrade = (moves: ReviewMove[], from: number, to: number) => {
    const ph = moves.filter(m => m.moveIndex >= from && m.moveIndex < to);
    if (ph.length === 0) return null;
    if (ph.some(m => m.classification === 'blunder'))    return 'blunder';
    if (ph.some(m => m.classification === 'missed_win')) return 'missed_win';
    if (ph.some(m => m.classification === 'mistake'))    return 'mistake';
    if (ph.some(m => m.classification === 'inaccuracy')) return 'inaccuracy';
    if (ph.some(m => m.classification === 'brilliant'))  return 'brilliant';
    if (ph.some(m => m.classification === 'great'))      return 'great';
    return 'good';
  };

  const PhaseIcon = ({ grade }: { grade: string | null }) => {
    if (!grade) return <span className="text-muted-foreground">—</span>;
    const map: Record<string, { bg: string; label: string }> = {
      brilliant:   { bg: 'bg-cyan-500',    label: '!!' },
      great:       { bg: 'bg-sky-500',     label: '!'  },
      good:        { bg: 'bg-emerald-500', label: '✓'  },
      inaccuracy:  { bg: 'bg-yellow-500',  label: '?!' },
      mistake:     { bg: 'bg-orange-500',  label: '?'  },
      blunder:     { bg: 'bg-rose-500',    label: '??' },
      missed_win:  { bg: 'bg-red-500',     label: '✗'  },
    };
    const cfg = map[grade];
    return (
      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${cfg.bg} text-white text-[10px] font-black`}>
        {cfg.label}
      </span>
    );
  };

  const wArr = byColor('white');
  const bArr = byColor('black');
  const wAcc = calcAccuracy(wArr);
  const bAcc = calcAccuracy(bArr);
  const wc   = counts(wArr);
  const bc   = counts(bArr);

  const moveRows: { label: string; key: keyof ReturnType<typeof counts>; iconBg: string; icon: string; textColor: string }[] = [
    { label: 'Brilliant',   key: 'brilliant',   iconBg: 'bg-cyan-500',    icon: '!!', textColor: 'text-cyan-400'    },
    { label: 'Great',       key: 'great',       iconBg: 'bg-sky-500',     icon: '!',  textColor: 'text-sky-400'     },
    { label: 'Best',        key: 'best',        iconBg: 'bg-emerald-500', icon: '!',  textColor: 'text-emerald-400' },
    { label: 'Excellent',   key: 'excellent',   iconBg: 'bg-teal-500',    icon: '!',  textColor: 'text-teal-400'    },
    { label: 'Good',        key: 'good',        iconBg: 'bg-green-600',   icon: '!',  textColor: 'text-green-400'   },
    { label: 'Inaccuracy',  key: 'inaccuracy',  iconBg: 'bg-yellow-500',  icon: '?!', textColor: 'text-yellow-400'  },
    { label: 'Mistake',     key: 'mistake',     iconBg: 'bg-orange-500',  icon: '?',  textColor: 'text-orange-400'  },
    { label: 'Blunder',     key: 'blunder',     iconBg: 'bg-rose-500',    icon: '??', textColor: 'text-rose-400'    },
    { label: 'Missed Win',  key: 'missed_win',  iconBg: 'bg-red-500',     icon: '✗',  textColor: 'text-red-400'     },
  ];

  const phases = [
    { label: 'Opening',    from: 0,   to: 20       },
    { label: 'Middlegame', from: 20,  to: 60       },
    { label: 'Endgame',    from: 60,  to: Infinity },
  ];

  const PlayerAvatar = ({ username, dark, avatar }: { username: string; dark: boolean; avatar?: string }) => {
    if (avatar) {
      return <img src={avatar} alt={username} className="w-12 h-12 rounded-xl object-cover border-2 border-white/20" />;
    }
    return (
      <div className={`w-12 h-12 rounded-xl border-2 border-white/20 flex items-center justify-center font-black text-sm
        ${dark ? 'bg-[#2d2d2d] text-[#f0d9b5]' : 'bg-[#f0d9b5] text-[#2d2d2d]'}`}>
        {username[0]?.toUpperCase()}
      </div>
    );
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-white/8">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2 bg-white/3">
        <Trophy className="w-4 h-4 text-primary" />
        <span className="font-bold text-sm">Game Rating</span>
      </div>

      {/* Player row */}
      <div className="grid grid-cols-[1fr_40px_1fr] items-center border-b border-white/5">
        <div className="flex flex-col items-center gap-1.5 py-4 px-2">
          <PlayerAvatar username={game.whiteUsername} dark={false} avatar={whiteAvatar} />
          <span className="font-black text-xs text-center max-w-[90px] truncate">{game.whiteUsername}</span>
          {game.whiteRating && <span className="text-[10px] text-primary font-bold">{game.whiteRating}</span>}
        </div>
        <div className="text-center text-xs text-muted-foreground font-black">vs</div>
        <div className="flex flex-col items-center gap-1.5 py-4 px-2">
          <PlayerAvatar username={game.blackUsername} dark={true} avatar={blackAvatar} />
          <span className="font-black text-xs text-center max-w-[90px] truncate">{game.blackUsername}</span>
          {game.blackRating && <span className="text-[10px] text-primary font-bold">{game.blackRating}</span>}
        </div>
      </div>

      {/* Accuracy */}
      <div className="grid grid-cols-[1fr_60px_1fr] items-center py-4 border-b border-white/5">
        <div className="text-center">
          <div className="text-2xl font-black">{wAcc.toFixed(1)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">%</div>
        </div>
        <div className="text-center text-[10px] text-muted-foreground uppercase tracking-wide leading-tight font-bold">
          Accu-<br />racy
        </div>
        <div className="text-center">
          <div className="text-2xl font-black">{bAcc.toFixed(1)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">%</div>
        </div>
      </div>

      {/* Move quality rows */}
      {moveRows.map(row => (
        <div key={row.label} className="grid grid-cols-[1fr_60px_1fr] items-center py-2.5 border-b border-white/5 last:border-0">
          <div className={`text-center text-xl font-black ${row.textColor}`}>{wc[row.key]}</div>
          <div className="flex flex-col items-center gap-0.5">
            <div className={`w-7 h-7 rounded-full ${row.iconBg} flex items-center justify-center`}>
              <span className="text-white font-black text-[9px]">{row.icon}</span>
            </div>
            <span className="text-[9px] text-muted-foreground leading-tight text-center">{row.label}</span>
          </div>
          <div className={`text-center text-xl font-black ${row.textColor}`}>{bc[row.key]}</div>
        </div>
      ))}

      {/* Game Rating */}
      <div className="grid grid-cols-[1fr_60px_1fr] items-center py-4 bg-white/3 border-t border-white/8">
        <div className="flex justify-center">
          <div className="px-4 py-2 rounded-xl bg-background border border-white/15 min-w-[60px] text-center">
            <span className="text-xl font-black">{toGameRating(wAcc)}</span>
          </div>
        </div>
        <div className="text-center text-[10px] text-muted-foreground uppercase tracking-wide leading-tight font-bold">
          Game<br />Rating
        </div>
        <div className="flex justify-center">
          <div className="px-4 py-2 rounded-xl bg-background border border-white/15 min-w-[60px] text-center">
            <span className="text-xl font-black">{toGameRating(bAcc)}</span>
          </div>
        </div>
      </div>

      {/* Phase grades */}
      {phases.map(ph => (
        <div key={ph.label} className="grid grid-cols-[1fr_60px_1fr] items-center py-2.5 border-t border-white/5">
          <div className="flex justify-center">
            <PhaseIcon grade={phaseGrade(wArr, ph.from, ph.to)} />
          </div>
          <div className="text-center text-[11px] text-muted-foreground font-medium">{ph.label}</div>
          <div className="flex justify-center">
            <PhaseIcon grade={phaseGrade(bArr, ph.from, ph.to)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatClock(s: number | null | undefined): string {
  if (s == null) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function pickBot(playerRating: number): BotConfig {
  const target = playerRating + 100;
  const sorted = [...BOTS].sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
  return sorted[0];
}

type SandboxResult = 'playing' | 'win' | 'loss' | 'draw';

const PIECE_GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

function fenToBoard(fen: string): (string | null)[][] {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const placement = fen.split(' ')[0];
  const rows = placement.split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) {
        f += parseInt(ch);
      } else {
        if (f < 8) board[r][f] = ch;
        f++;
      }
    }
  }
  return board;
}

function MiniBoard({
  fen,
  flipped,
  active,
  playerColor,
  legalTargets,
  selectedSquare,
  lastMove,
  onSquareClick,
}: {
  fen: string;
  flipped: boolean;
  active: boolean;
  playerColor: 'w' | 'b';
  legalTargets: string[];
  selectedSquare: string | null;
  lastMove: { from: string; to: string } | null;
  onSquareClick: (square: string) => void;
}) {
  const board = fenToBoard(fen);
  // Files left-to-right; if flipped, reverse
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
  const targetSet = new Set(legalTargets);
  return (
    <div
      className="grid grid-cols-8 w-full select-none rounded-[10px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)]"
      style={{ aspectRatio: '1', touchAction: 'manipulation' }}
    >
      {ranks.map((rank) =>
        files.map((file) => {
          const square = `${file}${rank}`;
          // map back to board[row][col] (row 0 = rank 8, col 0 = file a)
          const rowIdx = 8 - rank;
          const colIdx = file.charCodeAt(0) - 97;
          const piece = board[rowIdx][colIdx];
          const isLight = (rowIdx + colIdx) % 2 === 0;
          const isSelected = selectedSquare === square;
          const isTarget = targetSet.has(square);
          const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
          const isWhitePiece = piece && piece === piece.toUpperCase();
          const canInteract = active && piece && ((isWhitePiece && playerColor === 'w') || (!isWhitePiece && playerColor === 'b'));
          let bg = isLight ? '#f0d9b5' : '#b58863';
          if (isLastMove) bg = isLight ? '#f5e57b' : '#cdc169';
          if (isSelected) bg = '#7fb1ff';
          return (
            <button
              key={square}
              type="button"
              onClick={() => active && onSquareClick(square)}
              disabled={!active}
              className="relative flex items-center justify-center text-[clamp(20px,5vw,32px)] leading-none p-0 m-0 border-0"
              style={{
                background: bg,
                cursor: active ? (canInteract || isTarget || isSelected ? 'pointer' : 'default') : 'default',
                aspectRatio: '1',
                fontFamily: '"Segoe UI Symbol", "DejaVu Sans", "Apple Color Emoji", sans-serif',
                color: piece && piece === piece.toUpperCase() ? '#fff' : '#1a1a1a',
                textShadow: piece && piece === piece.toUpperCase() ? '0 1px 2px rgba(0,0,0,0.6)' : 'none',
              }}
              aria-label={`${square}${piece ? ` ${piece}` : ''}`}
            >
              {piece ? PIECE_GLYPH[piece] || piece : ''}
              {isTarget && !piece && (
                <span
                  className="absolute pointer-events-none"
                  style={{ width: '30%', height: '30%', borderRadius: '50%', background: 'rgba(100,180,255,0.6)' }}
                />
              )}
              {isTarget && piece && (
                <span
                  className="absolute inset-0 pointer-events-none"
                  style={{ borderRadius: '4px', boxShadow: 'inset 0 0 0 4px rgba(100,180,255,0.65)' }}
                />
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

const SandboxBoard = React.memo(function SandboxBoard({ playerRating }: { playerRating: number }) {
  const [bot] = useState(() => pickBot(playerRating));
  const [playerColor] = useState<'w' | 'b'>(() => Math.random() < 0.5 ? 'w' : 'b');
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [result, setResult] = useState<SandboxResult>('playing');
  const [thinking, setThinking] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const gameKeyRef = useRef(0);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPlayerTurn = chess.turn() === playerColor;

  const legalTargets = useMemo(() => {
    if (!selectedSquare || result !== 'playing' || chess.turn() !== playerColor) return [] as string[];
    try {
      const moves = chess.moves({ square: selectedSquare as Parameters<typeof chess.moves>[0]['square'], verbose: true });
      return moves.map(m => m.to as string);
    } catch { return []; }
  }, [chess, selectedSquare, fen, result, playerColor]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkGameOver = useCallback((g: Chess): SandboxResult => {
    if (!g.isGameOver()) return 'playing';
    if (g.isCheckmate()) return g.turn() === playerColor ? 'loss' : 'win';
    return 'draw';
  }, [playerColor]);

  const doBotMove = useCallback((gameVersion: number) => {
    if (chess.isGameOver() || chess.turn() === playerColor) return;
    setThinking(true);
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    const delay = 300 + Math.random() * 500;
    botTimerRef.current = setTimeout(() => {
      if (gameKeyRef.current !== gameVersion || chess.isGameOver() || chess.turn() === playerColor) {
        setThinking(false);
        return;
      }
      const san = getBotMove(chess.fen(), bot);
      if (san) {
        try {
          chess.move(san);
          setFen(chess.fen());
          setMoveHistory(prev => [...prev, san]);
          const status = checkGameOver(chess);
          if (status !== 'playing') setResult(status);
        } catch {}
      }
      setThinking(false);
    }, delay);
  }, [chess, bot, playerColor, checkGameOver]);

  useEffect(() => {
    if (playerColor === 'b' && moveHistory.length === 0 && result === 'playing') {
      doBotMove(gameKeyRef.current);
    }
  }, [playerColor, moveHistory.length, result, doBotMove]);

  useEffect(() => {
    return () => { if (botTimerRef.current) clearTimeout(botTimerRef.current); };
  }, []);

  const handleSquareClick = useCallback((square: string) => {
    if (result !== 'playing' || thinking || chess.turn() !== playerColor) return;
    const piece = chess.get(square as Parameters<typeof chess.get>[0]);
    // If a square is already selected, try to move there
    if (selectedSquare) {
      if (square === selectedSquare) { setSelectedSquare(null); return; }
      try {
        const m = chess.move({ from: selectedSquare, to: square, promotion: 'q' });
        if (m) {
          setFen(chess.fen());
          setMoveHistory(prev => [...prev, m.san]);
          setLastMove({ from: m.from, to: m.to });
          setSelectedSquare(null);
          const status = checkGameOver(chess);
          if (status !== 'playing') { setResult(status); return; }
          doBotMove(gameKeyRef.current);
          return;
        }
      } catch {}
      // Invalid move — if clicked square has own piece, select it instead
      if (piece && piece.color === playerColor) { setSelectedSquare(square); return; }
      setSelectedSquare(null);
      return;
    }
    // Nothing selected — select this square if it has the player's piece
    if (piece && piece.color === playerColor) {
      setSelectedSquare(square);
    }
  }, [chess, playerColor, selectedSquare, result, thinking, checkGameOver, doBotMove]);

  const resetGame = useCallback(() => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    chess.reset();
    setFen(chess.fen());
    setMoveHistory([]);
    setResult('playing');
    setThinking(false);
    setSelectedSquare(null);
    setLastMove(null);
    gameKeyRef.current += 1;
  }, [chess]);

  // Track last bot move for highlight
  useEffect(() => {
    if (moveHistory.length === 0) return;
    // After bot moves, try to extract from chess history
    try {
      const hist = chess.history({ verbose: true });
      const lastEntry = hist[hist.length - 1];
      if (lastEntry) setLastMove({ from: lastEntry.from, to: lastEntry.to });
    } catch {}
  }, [moveHistory.length, chess]);

  const resultLabel = result === 'win' ? 'You win!' : result === 'loss' ? `${bot.name} wins` : result === 'draw' ? 'Draw' : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Bot className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-white/80 truncate">{bot.name} <span className="text-white/30">({bot.rating})</span></p>
            <p className="text-[9px] text-white/30">{bot.personality}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {thinking && <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
          <span className="text-[10px] text-white/30">
            {result !== 'playing' ? '' : isPlayerTurn ? 'Your turn' : 'Thinking…'}
          </span>
        </div>
      </div>

      <div className="relative max-w-[300px] mx-auto">
        <MiniBoard
          fen={fen}
          flipped={playerColor === 'b'}
          active={result === 'playing'}
          playerColor={playerColor}
          legalTargets={legalTargets}
          selectedSquare={selectedSquare}
          lastMove={lastMove}
          onSquareClick={handleSquareClick}
        />
        {result !== 'playing' && (
          <div className="absolute inset-0 rounded-[10px] bg-black/60 flex flex-col items-center justify-center gap-2 z-10">
            <p className={`text-lg font-black ${result === 'win' ? 'text-emerald-400' : result === 'loss' ? 'text-rose-400' : 'text-white/70'}`}>
              {result === 'win' ? '🎉' : result === 'loss' ? '💀' : '🤝'} {resultLabel}
            </p>
            <button
              onClick={resetGame}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Play Again
            </button>
          </div>
        )}
      </div>

      {moveHistory.length > 0 && (
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-[10px] text-white/30 truncate flex-1">
            {moveHistory.slice(-8).join(' ')}
            {moveHistory.length > 8 && '…'}
          </p>
          <span className="text-[9px] text-white/20 ml-2 shrink-0">{Math.ceil(moveHistory.length / 2)} moves</span>
        </div>
      )}
    </div>
  );
});

export function GameReplay() {
  const { id } = useParams();
  const { username } = useUser();
  const [, navigate] = useLocation();
  const { data: game, isLoading, error } = useGameViewer(parseInt(id || '0'));
  const { player: whitePlayer } = useChessPlayer(game?.whiteUsername);
  const { player: blackPlayer } = useChessPlayer(game?.blackUsername);

  const [currentMove, setCurrentMove] = useState(0);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [flipped, setFlipped]         = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);

  // Review Game state
  const [reviewing, setReviewing]       = useState(false);
  const [reviewMoves, setReviewMoves]   = useState<ReviewMove[]>([]);
  const [reviewError, setReviewError]   = useState<string | null>(null);
  const [gameSummary, setGameSummary]   = useState<GameSummary | null>(null);
  const [loadingSavedReview, setLoadingSavedReview] = useState(true);
  const [reviewProgress, setReviewProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!game) { setLoadingSavedReview(false); return; }
    apiFetch(`/api/games/${game.id}/review`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { status?: string; jobId?: string; reviewData?: ReviewMove[] | { moves: ReviewMove[]; gameSummary?: GameSummary } } | null) => {
        if (!d) return;
        if (d.status === 'pending' && d.jobId) {
          setReviewing(true);
          reviewJobIdRef.current = d.jobId;
          pollReviewStatus(d.jobId);
          return;
        }
        if (!d.reviewData) return;
        if (Array.isArray(d.reviewData)) {
          if (d.reviewData.length > 0) setReviewMoves(d.reviewData);
        } else if (d.reviewData.moves && Array.isArray(d.reviewData.moves)) {
          setReviewMoves(d.reviewData.moves);
          if (d.reviewData.gameSummary) setGameSummary(d.reviewData.gameSummary);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSavedReview(false));
  }, [game?.id]);

  // Practice mode — Lichess best move
  const [bestMoveSan, setBestMoveSan]   = useState<string | null>(null);
  const [fetchingBest, setFetchingBest] = useState(false);

  const playRef      = useRef<NodeJS.Timeout | null>(null);
  const moveListRef  = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  const moves    = game?.moves || [];
  const maxMoves = moves.length;

  // Auto-flip for player's color
  useEffect(() => {
    if (game && username) {
      setFlipped(game.blackUsername.toLowerCase() === username.toLowerCase());
    }
  }, [game, username]);

  // Auto-play timer
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setCurrentMove(prev => {
          if (prev >= maxMoves) { setIsPlaying(false); return prev; }
          return prev + 1;
        });
      }, 900);
    } else if (playRef.current) clearInterval(playRef.current);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, maxMoves]);

  // Keyboard ← →
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrentMove(p => Math.min(maxMoves, p + 1));
      if (e.key === 'ArrowLeft')  setCurrentMove(p => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [maxMoves]);

  // Scroll active move into view — scroll only the move-list container, never the page
  useEffect(() => {
    const container = moveListRef.current;
    const btn = activeRowRef.current;
    if (!container || !btn) return;

    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const btnTop = btn.offsetTop;
    const btnBottom = btnTop + btn.offsetHeight;

    if (btnTop < containerTop) {
      container.scrollTop = btnTop - 8;
    } else if (btnBottom > containerBottom) {
      container.scrollTop = btnBottom - container.clientHeight + 8;
    }
  }, [currentMove]);

  const reviewJobIdRef = useRef<string | null>(null);
  const reviewPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (reviewPollRef.current) {
      clearInterval(reviewPollRef.current);
      reviewPollRef.current = null;
    }
  }, []);

  const pollReviewStatus = useCallback((jobId: string) => {
    stopPolling();
    reviewPollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/games/review-status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json() as { status: string; reviewData?: { moves: ReviewMove[]; gameSummary?: GameSummary }; error?: string; progress?: number | null; total?: number | null };

        if (data.status === 'done' && data.reviewData) {
          const moves = data.reviewData.moves ?? [];
          if (moves.length > 0) setReviewMoves(moves);
          else setReviewError('Review returned no data. Please try again.');
          if (data.reviewData.gameSummary) setGameSummary(data.reviewData.gameSummary);
          setReviewing(false);
          setReviewProgress(null);
          reviewJobIdRef.current = null;
          stopPolling();
        } else if (data.status === 'error') {
          setReviewError(data.error ?? 'Review failed. Please try again.');
          setReviewing(false);
          setReviewProgress(null);
          reviewJobIdRef.current = null;
          stopPolling();
        } else if (data.progress != null && data.total != null) {
          setReviewProgress({ done: data.progress as number, total: data.total as number });
        }
      } catch { /* retry on next poll */ }
    }, 3000);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleReview = useCallback(async (force = false) => {
    if (!game || reviewing) return;
    if (!force && reviewMoves.length > 0) return;
    setReviewing(true);
    setReviewError(null);
    if (force) {
      setReviewMoves([]);
      setGameSummary(null);
    }

    try {
      const url = force ? `/api/games/${game.id}/review?force=true` : `/api/games/${game.id}/review`;
      const res = await apiFetch(url, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start review');
      const data = await res.json() as { status: string; jobId?: string; reviewData?: { moves: ReviewMove[]; gameSummary?: GameSummary } };

      if (data.status === 'done' && data.reviewData) {
        const moves = data.reviewData.moves ?? [];
        if (moves.length > 0) setReviewMoves(moves);
        else setReviewError('Review returned no data. Please try again.');
        if (data.reviewData.gameSummary) setGameSummary(data.reviewData.gameSummary);
        setReviewing(false);
      } else if (data.status === 'pending' && data.jobId) {
        reviewJobIdRef.current = data.jobId;
        pollReviewStatus(data.jobId);
      } else {
        setReviewError('Failed to start review.');
        setReviewing(false);
      }
    } catch {
      setReviewError('Review failed. Please try again.');
      setReviewing(false);
    }
  }, [game, reviewing, reviewMoves.length, pollReviewStatus]);

  const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const gameStartFen = game?.startFen || DEFAULT_FEN;

  const currentFen = currentMove === 0 ? gameStartFen : (moves[currentMove - 1]?.fen ?? gameStartFen);

  const lastMove = useMemo(() => {
    if (currentMove === 0) return null;
    const move = moves[currentMove - 1];
    if (!move?.san) return null;
    if (move.from && move.to) return { from: move.from, to: move.to };
    const prevFen = move.fenBefore || (currentMove === 1 ? gameStartFen : (moves[currentMove - 2]?.fen ?? gameStartFen));
    try {
      const chess = new Chess(normalizeFen(prevFen));
      const result = chess.move(move.san);
      return result ? { from: result.from, to: result.to } : null;
    } catch { return null; }
  }, [currentMove, moves, gameStartFen]);

  // Current move's review data
  const currentReview: ReviewMove | null = currentMove > 0
    ? (reviewMoves.find(r => r.moveIndex === currentMove - 1) ?? null)
    : null;

  // Fetch best move from Lichess in practice mode
  useEffect(() => {
    if (!practiceMode || currentMove >= maxMoves) { setBestMoveSan(null); return; }
    const fen = currentFen;
    if (!fen) { setBestMoveSan(null); return; }

    let cancelled = false;
    setFetchingBest(true);
    setBestMoveSan(null);

    fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=1`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return;
        const uci = data?.pvs?.[0]?.moves?.split(' ')?.[0];
        if (!uci || uci.length < 4) { setBestMoveSan(null); return; }
        try {
          const chess = new Chess(normalizeFen(fen));
          const mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
          setBestMoveSan(mv?.san ?? null);
        } catch { setBestMoveSan(null); }
      })
      .catch(() => { if (!cancelled) setBestMoveSan(null); })
      .finally(() => { if (!cancelled) setFetchingBest(false); });

    return () => { cancelled = true; };
  }, [practiceMode, currentFen, currentMove, maxMoves]);

  const handleMovePlayed = useCallback((san: string, correct: boolean) => {
    if (correct) setTimeout(() => setCurrentMove(p => Math.min(maxMoves, p + 1)), 450);
  }, [maxMoves]);

  useEffect(() => {
    if (!practiceMode || currentMove >= maxMoves) return;
    const nextMoveIsWhite = currentMove % 2 === 0;
    const userPlaysWhite = !flipped;
    if (nextMoveIsWhite === userPlaysWhite) return;

    const timer = setTimeout(() => {
      setCurrentMove(prev => Math.min(maxMoves, prev + 1));
    }, currentMove === 0 ? 800 : 600);
    return () => clearTimeout(timer);
  }, [practiceMode, currentMove, maxMoves, flipped]);

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-sm">Loading game…</p>
    </div>
  );
  if (error || !game) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
      <p className="text-destructive text-lg font-bold">Failed to load game.</p>
      <Link href="/games" className="text-primary text-sm hover:underline">← Back to Games</Link>
    </div>
  );

  const cfg = currentReview ? CLASS_CFG[currentReview.classification] : null;
  const isBad = currentReview && ['inaccuracy', 'mistake', 'blunder', 'missed_win'].includes(currentReview.classification);

  return (
    <div className="space-y-2 md:space-y-4 pb-20 px-3 pt-3 md:px-0 md:pt-0">
      <Link href="/games" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Games
      </Link>

      {game.opening && (
        <div className="flex glass-card rounded-xl px-4 py-2.5 md:px-5 md:py-3 items-center gap-2 md:gap-3 border border-primary/20 bg-primary/5">
          <BookOpen className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-bold text-primary/70">{game.eco}</span>
          <span className="font-bold text-xs md:text-sm truncate">{game.opening}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">

        {/* ── Left col: board + controls ── */}
        <div className="space-y-2 md:space-y-4">

          {/* Players banner — compact on mobile */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="flex items-stretch">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 md:py-3">
                {whitePlayer?.avatar
                  ? <img src={whitePlayer.avatar} alt={game.whiteUsername} className="w-7 h-7 md:w-9 md:h-9 rounded-xl md:rounded-xl object-cover border border-white/20 shrink-0" />
                  : <div className="w-7 h-7 md:w-9 md:h-9 rounded-xl md:rounded-xl bg-[#eeeed2] flex items-center justify-center shrink-0"><span className="text-[#2d2d2d] font-black text-xs md:text-sm">{game.whiteUsername[0]?.toUpperCase()}</span></div>
                }
                <div className="min-w-0">
                  <p className="font-black text-xs md:text-sm truncate leading-tight">{game.whiteUsername}</p>
                  <p className="text-primary text-[10px] md:text-xs font-bold">{game.whiteRating}</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center px-2 md:px-3 border-x border-white/5 shrink-0">
                <span className={`px-2 py-0.5 md:px-2.5 md:py-1 rounded-xl text-[10px] md:text-[10px] font-black uppercase tracking-[0.18em] border
                  ${game.result === 'win'  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                    game.result === 'loss' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                                             'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
                  {game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw'}
                </span>
              </div>
              <div className="flex-1 flex items-center gap-2 px-3 py-2 md:py-3 justify-end">
                <div className="min-w-0 text-right">
                  <p className="font-black text-xs md:text-sm truncate leading-tight">{game.blackUsername}</p>
                  <p className="text-primary text-[10px] md:text-xs font-bold">{game.blackRating}</p>
                </div>
                {blackPlayer?.avatar
                  ? <img src={blackPlayer.avatar} alt={game.blackUsername} className="w-7 h-7 md:w-9 md:h-9 rounded-xl md:rounded-xl object-cover border border-white/20 shrink-0" />
                  : <div className="w-7 h-7 md:w-9 md:h-9 rounded-xl md:rounded-xl bg-[#2d2d2d] border border-white/20 flex items-center justify-center shrink-0"><span className="text-[#eeeed2] font-black text-xs md:text-sm">{game.blackUsername[0]?.toUpperCase()}</span></div>
                }
              </div>
            </div>
          </div>

          {/* Chess board — split mistake/fix view for bad moves, single board otherwise */}
          {isBad && currentReview && currentMove > 0 && !practiceMode ? (
            (() => {
              const prevFen = currentMove <= 1 ? gameStartFen : (moves[currentMove - 2]?.fen ?? gameStartFen);
              const playedSan = moves[currentMove - 1]?.san ?? null;
              const playedMove = playedSan && lastMove
                ? { san: playedSan, from: lastMove.from, to: lastMove.to }
                : null;
              return (
                <MistakeFixView
                  prevFen={prevFen}
                  playedMove={playedMove}
                  betterMoveText={currentReview.betterMove}
                  classification={currentReview.classification}
                  flipped={flipped}
                />
              );
            })()
          ) : (
            <ChessBoard
              fen={currentFen}
              flipped={flipped}
              practiceMode={practiceMode}
              expectedMoveSan={practiceMode ? bestMoveSan : null}
              onMovePlayed={handleMovePlayed}
              lastMove={lastMove}
              moveQuality={currentReview?.classification ?? null}
            />
          )}

          {/* Playback controls */}
          <div className="glass-card rounded-xl px-1.5 py-1.5 md:p-3 flex items-center justify-between">
            <div className="flex items-center">
              <button onClick={() => { setCurrentMove(0); setIsPlaying(false); }} disabled={currentMove === 0}
                className="p-2.5 md:p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-40 active:scale-90">
                <ChevronsLeft className="w-5 h-5 md:w-4 md:h-4" />
              </button>
              <button onClick={() => setCurrentMove(p => Math.max(0, p - 1))} disabled={currentMove === 0}
                className="p-2.5 md:p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-40 active:scale-90">
                <ChevronLeft className="w-5 h-5 md:w-4 md:h-4" />
              </button>
              <button onClick={() => setIsPlaying(p => !p)}
                className="px-3.5 py-2.5 md:px-4 md:py-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors active:scale-90">
                {isPlaying ? <Pause className="w-5 h-5 md:w-4 md:h-4" /> : <Play className="w-5 h-5 md:w-4 md:h-4" />}
              </button>
              <button onClick={() => setCurrentMove(p => Math.min(maxMoves, p + 1))} disabled={currentMove >= maxMoves}
                className="p-2.5 md:p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-40 active:scale-90">
                <ChevronRight className="w-5 h-5 md:w-4 md:h-4" />
              </button>
              <button onClick={() => { setCurrentMove(maxMoves); setIsPlaying(false); }} disabled={currentMove >= maxMoves}
                className="p-2.5 md:p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-40 active:scale-90">
                <ChevronsRight className="w-5 h-5 md:w-4 md:h-4" />
              </button>
            </div>

            <div className="flex items-center gap-0.5 md:gap-2">
              <span className="text-[10px] md:text-xs text-muted-foreground font-mono">{currentMove}/{maxMoves}</span>

              <button onClick={() => setFlipped(f => !f)} title="Flip board"
                className="p-2.5 md:p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors active:scale-90">
                <FlipVertical2 className="w-5 h-5 md:w-4 md:h-4" />
              </button>

              <button
                onClick={() => { setPracticeMode(p => !p); setIsPlaying(false); }}
                className={`p-2.5 md:px-3 md:py-2 rounded-xl text-xs font-bold transition-colors border active:scale-90
                  ${practiceMode
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-secondary border-border hover:border-primary/40 hover:text-primary'}`}>
                <span className="flex items-center gap-1">
                  <Zap className="w-5 h-5 md:w-3.5 md:h-3.5" />
                  <span className="hidden md:inline">{practiceMode ? 'Practice ON' : 'Practice'}</span>
                </span>
              </button>

              <button
                onClick={() => handleReview(false)}
                disabled={reviewing || reviewMoves.length > 0}
                className={`p-2.5 md:px-3 md:py-2 rounded-xl text-xs font-bold transition-colors border flex items-center gap-1 md:gap-1.5 active:scale-90
                  ${reviewMoves.length > 0
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-secondary border-border hover:border-primary/40 hover:text-primary disabled:opacity-50'}`}>
                {reviewing
                  ? <div className="w-5 h-5 md:w-3.5 md:h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  : reviewMoves.length > 0
                  ? <Sparkles className="w-5 h-5 md:w-3.5 md:h-3.5" />
                  : <BrainCircuit className="w-5 h-5 md:w-3.5 md:h-3.5" />}
                <span className="hidden md:inline">
                  {reviewing ? 'Reviewing…' : reviewMoves.length > 0 ? 'Reviewed' : 'Review Game'}
                </span>
              </button>
              {reviewMoves.length > 0 && !reviewing && (
                <button
                  onClick={() => handleReview(true)}
                  className="p-2.5 rounded-xl text-xs font-bold transition-colors border bg-secondary border-border hover:border-primary/40 hover:text-primary active:scale-90"
                  title="Re-analyze with improved engine">
                  <BrainCircuit className="w-5 h-5 md:w-3.5 md:h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Per-move analysis panel — positioned right below controls for easy follow-along */}
          {currentMove > 0 && reviewMoves.length > 0 && (() => {
            const move = moves[currentMove - 1];
            const tone = classificationToTone(currentReview?.classification as Classification | undefined);
            const titleNode = (
              <span className="flex items-center gap-1.5">
                {cfg && <span className={`font-bold ${cfg.color.split(' ')[0]}`}>{cfg.full}</span>}
                {cfg && <span className="text-muted-foreground/50">·</span>}
                <span className="font-mono text-foreground/80">{move?.san}</span>
                {cfg && (
                  <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.color}`}>
                    {cfg.badge}
                  </span>
                )}
              </span>
            );
            return (
              <AICoachCard tone={tone} name="Coach" badge="Coach" title={titleNode}>
                {currentReview ? (
                  <>
                    <p>{currentReview.explanation}</p>

                      {/* Pros & Cons */}
                      {(currentReview.pros?.length > 0 || currentReview.cons?.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          {currentReview.pros?.length > 0 && (
                            <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-3 py-2.5">
                              <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <span>✓</span> Pros
                              </p>
                              <ul className="space-y-1">
                                {currentReview.pros.map((p, i) => (
                                  <li key={i} className="text-xs text-foreground/80 leading-snug flex items-start gap-1.5">
                                    <span className="text-emerald-500 shrink-0 mt-0.5">•</span>
                                    {p}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {currentReview.cons?.length > 0 && (
                            <div className="rounded-xl bg-rose-500/8 border border-rose-500/20 px-3 py-2.5">
                              <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <span>✗</span> Cons
                              </p>
                              <ul className="space-y-1">
                                {currentReview.cons.map((c, i) => (
                                  <li key={i} className="text-xs text-foreground/80 leading-snug flex items-start gap-1.5">
                                    <span className="text-rose-500 shrink-0 mt-0.5">•</span>
                                    {c}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Better move suggestion */}
                      {isBad && currentReview.betterMove && (
                        <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2.5">
                          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <span className="text-amber-400 font-bold text-[11px] uppercase tracking-wide block mb-0.5">Better move</span>
                            <span className="text-foreground/80 leading-relaxed">{currentReview.betterMove}</span>
                          </div>
                        </div>
                      )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic py-1">This move wasn't included in the review.</p>
                )}

                {currentFen && (
                  <button
                    onClick={() => {
                      const isBlack = game?.blackUsername.toLowerCase() === username?.toLowerCase();
                      const opponentRating = game
                        ? (isBlack ? game.whiteRating : game.blackRating) || 1200
                        : 1200;
                      const playerColor = isBlack ? 'b' : 'w';
                      const prevFen = currentMove <= 1 ? gameStartFen : (moves[currentMove - 2]?.fen ?? currentFen);
                      navigate(`/practice?fen=${encodeURIComponent(prevFen)}&rating=${opponentRating}&color=${playerColor}`);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 border border-primary/30 hover:border-primary/50 mt-1"
                    style={{ background: 'rgba(129,182,76,0.1)', color: '#81b64c' }}
                  >
                    <Swords className="w-4 h-4" />
                    Jump in from here
                  </button>
                )}
              </AICoachCard>
            );
          })()}

          {/* Review loading — enhanced engagement */}
          {reviewing && (() => {
            const totalMoves = moves.length;
            const progressPct = reviewProgress && reviewProgress.total > 0 ? Math.round((reviewProgress.done / reviewProgress.total) * 100) : 0;
            const currentAnalysisMove = reviewProgress ? Math.min(reviewProgress.done, totalMoves - 1) : 0;
            const currentSan = moves[currentAnalysisMove]?.san ?? '';
            const getPhase = (idx: number) => {
              if (totalMoves === 0) return 'Opening';
              const pct = idx / totalMoves;
              if (pct < 0.25) return 'Opening';
              if (pct < 0.7) return 'Middlegame';
              return 'Endgame';
            };
            const phase = reviewProgress ? getPhase(reviewProgress.done) : 'Opening';
            const narrativeMsg = !reviewProgress
              ? 'Starting engine analysis…'
              : phase === 'Opening' && game.opening
                ? `Analyzing ${game.opening}… move ${currentSan}`
                : `${phase} · analyzing move ${reviewProgress.done} of ${reviewProgress.total}${currentSan ? ` (${currentSan})` : ''}`;

            const myHandle = ((game as any).username || username || '').toLowerCase();
            const playerRating = myHandle
              ? (game.whiteUsername.toLowerCase() === myHandle ? game.whiteRating : game.blackRating)
              : game.whiteRating;

            return (
              <div className="space-y-3">
                <div className="glass-card rounded-xl px-4 py-4 border border-primary/30 bg-primary/5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-primary">Reviewing game…</p>
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={narrativeMsg}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="text-xs text-muted-foreground mt-0.5 truncate"
                        >
                          {narrativeMsg}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    {reviewProgress && (
                      <span className="ml-auto text-xs font-mono text-primary/80 shrink-0">
                        {progressPct}%
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all duration-500"
                      style={{ width: reviewProgress && reviewProgress.total > 0 ? `${progressPct}%` : '5%' }}
                    />
                  </div>
                </div>

                {/* Pre-analysis teaser stats */}
                {(() => {
                  const fullMoves = Math.ceil(totalMoves / 2);
                  const estMinutes = Math.round(totalMoves * 0.5);
                  const estDuration = estMinutes < 60 ? `~${estMinutes} min` : `~${Math.floor(estMinutes / 60)}h ${estMinutes % 60}m`;

                  const extractTimeControl = () => {
                    if (!game.pgn) return null;
                    const tcMatch = game.pgn.match(/\[TimeControl\s+"([^"]+)"\]/);
                    if (!tcMatch) return null;
                    const raw = tcMatch[1];
                    if (raw.includes('+')) {
                      const [base, inc] = raw.split('+');
                      const mins = Math.floor(parseInt(base) / 60);
                      return `${mins}+${inc}`;
                    }
                    const secs = parseInt(raw);
                    if (!isNaN(secs)) return `${Math.floor(secs / 60)} min`;
                    return raw;
                  };

                  const getMaterialBalance = () => {
                    const lastFen = totalMoves > 0 ? (moves[totalMoves - 1]?.fen || '') : (game.startFen || '');
                    if (!lastFen) return null;
                    const pieces = lastFen.split(' ')[0] || '';
                    const vals: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
                    let white = 0, black = 0;
                    for (const ch of pieces) {
                      const lower = ch.toLowerCase();
                      if (vals[lower]) {
                        if (ch === ch.toUpperCase()) white += vals[lower];
                        else black += vals[lower];
                      }
                    }
                    const diff = white - black;
                    if (diff === 0) return 'Even';
                    return diff > 0 ? `White +${diff}` : `Black +${Math.abs(diff)}`;
                  };

                  const tc = extractTimeControl();
                  const material = getMaterialBalance();

                  return (
                    <div className="glass-card rounded-xl px-4 py-3 border border-white/10">
                      <p className="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-2">Game at a glance</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-2">
                        <div>
                          <p className="text-[10px] text-white/30">Moves</p>
                          <p className="text-sm font-bold text-white">{fullMoves}</p>
                        </div>
                        {tc && (
                          <div>
                            <p className="text-[10px] text-white/30">Time Control</p>
                            <p className="text-sm font-bold text-white">{tc}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-white/30">Est. Duration</p>
                          <p className="text-sm font-bold text-white">{estDuration}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/30">Result</p>
                          <p className={`text-sm font-bold ${game.result === 'win' ? 'text-emerald-400' : game.result === 'loss' ? 'text-rose-400' : 'text-white/60'}`}>
                            {game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw'}
                          </p>
                        </div>
                        {game.opening && (
                          <div className="col-span-2">
                            <p className="text-[10px] text-white/30">Opening</p>
                            <p className="text-sm font-bold text-white truncate">{game.eco ? `${game.eco} ` : ''}{game.opening}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-white/30">Ratings</p>
                          <p className="text-sm font-bold text-white">
                            {game.whiteRating || '?'} vs {game.blackRating || '?'}
                          </p>
                        </div>
                        {material && (
                          <div>
                            <p className="text-[10px] text-white/30">Final Material</p>
                            <p className="text-sm font-bold text-white">{material}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <WaitTipCarousel rating={playerRating} />

                {/* AI Mini-Game */}
                <div className="glass-card rounded-xl p-3 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Swords className="w-3.5 h-3.5 text-primary/60" />
                    <span className="text-[11px] font-bold text-white/30 uppercase tracking-wider">
                      Play while you wait
                    </span>
                  </div>
                  <SandboxBoard playerRating={playerRating ?? 800} />
                </div>
              </div>
            );
          })()}

          {/* Review error */}
          {reviewError && (
            <div className="glass-card rounded-xl px-4 py-3 border border-rose-500/30 bg-rose-500/5 text-sm text-rose-400 flex items-center justify-between gap-3">
              <span>{reviewError}</span>
              <button onClick={() => { setReviewError(null); handleReview(true); }}
                className="text-xs font-bold underline underline-offset-2 hover:no-underline">Retry</button>
            </div>
          )}

          {/* Practice mode hint */}
          {practiceMode && (
            <div className="glass-card rounded-xl px-4 py-3 border border-emerald-500/30 bg-emerald-500/5 text-sm text-emerald-300 flex items-center gap-2">
              {fetchingBest
                ? <><div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>Finding engine's best move…</span></>
                : bestMoveSan
                ? <><Cpu className="w-4 h-4 shrink-0" />
                    <span><strong>Practice Mode</strong> — Engine target: <span className="font-mono font-bold text-white">{bestMoveSan}</span></span></>
                : <><Zap className="w-4 h-4 shrink-0" />
                    <span><strong>Practice Mode</strong> — Drag or click a piece to try any legal move.</span></>}
            </div>
          )}

          {/* Start position prompt / Review Game CTA */}
          {currentMove === 0 && reviewMoves.length === 0 && !reviewing && (
            <div className="glass-card rounded-xl px-4 py-4 border border-primary/20 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
              <div className="flex items-start gap-3">
                <BrainCircuit className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-foreground">Review this game with the coach</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Get instant analysis for every move — classifications, explanations, and better alternatives.</p>
                </div>
              </div>
              <button
                onClick={() => handleReview(false)}
                className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                <Sparkles className="w-4 h-4" />
                Review Game
              </button>
            </div>
          )}

          {/* Coach notes */}
          {game.analysisNotes && currentMove === 0 && (
            <AICoachCard tone="neutral" name="Coach" badge="NOTES" title="Game overview">
              <p>{game.analysisNotes}</p>
            </AICoachCard>
          )}

          {/* Game Rating Panel — shown after review completes */}
          {reviewMoves.length > 0 && (
            <GameRatingPanel
              reviewMoves={reviewMoves}
              game={game}
              whiteAvatar={whitePlayer?.avatar}
              blackAvatar={blackPlayer?.avatar}
            />
          )}

          {/* AI Game Summary — shown after review completes */}
          {gameSummary && reviewMoves.length > 0 && (
            <div className="glass-card rounded-xl overflow-hidden border border-white/8">
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2 bg-white/3">
                <BrainCircuit className="w-4 h-4 text-primary" />
                <span className="font-bold text-sm">Game Analysis</span>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-foreground/85 leading-relaxed">{gameSummary.overview}</p>

                {gameSummary.keyMistakes.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="text-base">✗</span> Key Mistakes
                    </h4>
                    {gameSummary.keyMistakes.map((km, i) => (
                      <div key={i} className="rounded-xl border border-white/5 overflow-hidden">
                        <button
                          onClick={() => setCurrentMove(km.moveIndex)}
                          className="w-full text-left px-3 py-2 bg-red-500/8 border-b border-red-500/15 hover:bg-red-500/12 transition-colors flex items-center gap-2"
                        >
                          <span className="text-red-400 font-mono text-xs font-bold shrink-0">{km.move}</span>
                          <span className="text-xs text-foreground/70 truncate">{km.whatWentWrong}</span>
                        </button>
                        <div className="px-3 py-2.5 space-y-1.5">
                          <div className="flex items-start gap-2">
                            <span className="text-emerald-400 shrink-0 mt-0.5 text-sm">✓</span>
                            <p className="text-xs text-foreground/80 leading-relaxed">{km.whatYouShouldHaveDone}</p>
                          </div>
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-300/80 leading-relaxed italic">{km.tip}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {gameSummary.strengths.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <span className="text-base">✓</span> What You Did Well
                    </h4>
                    <ul className="space-y-1.5">
                      {gameSummary.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed">
                          <span className="text-emerald-500 shrink-0 mt-0.5">•</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {gameSummary.improvementAreas.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <Target className="w-3.5 h-3.5" /> Areas to Improve
                    </h4>
                    <ul className="space-y-1.5">
                      {gameSummary.improvementAreas.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed">
                          <span className="text-primary shrink-0 mt-0.5">▸</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right col: move list ── */}
        <div className="glass-card rounded-xl flex flex-col xl:max-h-[700px]">
          <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
            <h3 className="font-bold text-sm">Move List</h3>
            <div className="flex items-center gap-2">
              {reviewMoves.length > 0 && (
                <span className="text-[10px] text-primary font-bold px-2 py-0.5 bg-primary/10 rounded-full border border-primary/20">
                  {reviewMoves.filter(m => ['blunder', 'mistake', 'inaccuracy', 'missed_win'].includes(m.classification)).length} errors
                </span>
              )}
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>

          <div ref={moveListRef} className="flex-1 overflow-y-auto p-2 hide-scrollbar">
            {/* Starting position */}
            <div
              onClick={() => { setCurrentMove(0); setPracticeMode(false); }}
              className={`px-3 py-1.5 rounded-xl text-xs cursor-pointer transition-colors mb-1
                ${currentMove === 0 ? 'bg-primary/20 text-primary font-bold' : 'hover:bg-white/5 text-muted-foreground'}`}
            >
              Start
            </div>

            {Array.from({ length: Math.ceil(maxMoves / 2) }).map((_, i) => {
              const wi = i * 2;
              const bi = i * 2 + 1;
              const wm = moves[wi];
              const bm = moves[bi];
              const wClass = reviewMoves.find(r => r.moveIndex === wi)?.classification ?? null;
              const bClass = reviewMoves.find(r => r.moveIndex === bi)?.classification ?? null;

              const MoveBtn = ({
                moveIndex,
                move,
                cls,
              }: {
                moveIndex: number;
                move: typeof wm;
                cls: Classification | null;
              }) => {
                if (!move) return <div className="flex-1" />;
                const isActive = currentMove === moveIndex + 1;
                return (
                  <button
                    ref={isActive ? activeRowRef : null}
                    onClick={() => { setCurrentMove(moveIndex + 1); setPracticeMode(false); }}
                    className={`flex-1 flex items-center gap-1 py-1.5 px-2 rounded-xl font-mono text-xs text-left transition-colors
                      ${isActive ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-white/5'}`}
                  >
                    <span className="truncate">{move.san}</span>
                    {cls ? (
                      <span className={`text-[9px] font-bold shrink-0 px-1 py-0.5 rounded border ${CLASS_CFG[cls].color}`}>
                        {CLASS_CFG[cls].badge}
                      </span>
                    ) : move.clockSeconds != null ? (
                      <span className="text-[9px] text-muted-foreground/50 shrink-0 ml-auto">
                        {formatClock(move.clockSeconds)}
                      </span>
                    ) : null}
                  </button>
                );
              };

              return (
                <div key={i} className={`flex items-center gap-0.5 text-sm rounded-xl ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                  <span className="w-7 text-muted-foreground font-mono text-xs shrink-0 text-right pr-1">{i + 1}.</span>
                  <MoveBtn moveIndex={wi} move={wm} cls={wClass} />
                  <MoveBtn moveIndex={bi} move={bm} cls={bClass} />
                </div>
              );
            })}
          </div>

          {/* Review summary — per-player accuracy */}
          {reviewMoves.length > 0 && (() => {
            const WIN_PCT_MAP: Record<Classification, number> = {
              checkmate: 0, brilliant: 0, great: 0, best: 0, excellent: 0.5, book: 0.7, good: 2,
              inaccuracy: 8, mistake: 16, blunder: 33, missed_win: 25,
            };

            function calcAccuracy(moves: ReviewMove[]) {
              if (moves.length === 0) return null;
              const totalWinPctLoss = moves.reduce((s, m) => {
                if (m.cpLoss != null && m.engineAvailable) return s + m.cpLoss;
                const base = WIN_PCT_MAP[m.classification];
                const unverifiedFloor = 3;
                return s + Math.max(base, ['good', 'book', 'excellent', 'best', 'great'].includes(m.classification) && !m.engineAvailable ? unverifiedFloor : base);
              }, 0);
              const avgWinPctLoss = totalWinPctLoss / moves.length;
              return Math.round(Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.065 * avgWinPctLoss) - 3.1668)));
            }

            function countFor(moves: ReviewMove[]) {
              const c: Record<Classification, number> = {
                checkmate: 0, brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0,
                inaccuracy: 0, mistake: 0, blunder: 0, missed_win: 0,
              };
              moves.forEach(m => c[m.classification]++);
              return c;
            }

            const whiteMoves = reviewMoves.filter(m => m.color === 'white');
            const blackMoves = reviewMoves.filter(m => m.color === 'black');
            const whiteAcc = calcAccuracy(whiteMoves);
            const blackAcc = calcAccuracy(blackMoves);
            const wc = countFor(whiteMoves);
            const bc = countFor(blackMoves);

            const accColor = (acc: number) =>
              acc >= 85 ? 'text-emerald-400' :
              acc >= 70 ? 'text-green-400' :
              acc >= 55 ? 'text-amber-400' :
              acc >= 40 ? 'text-orange-400' : 'text-rose-400';

            const MiniBar = ({ c }: { c: Record<Classification, number> }) => {
              const good = c.brilliant + c.great + c.best + c.excellent + c.good + c.book;
              const inac = c.inaccuracy;
              const bad  = c.mistake + c.blunder + c.missed_win;
              const tot  = good + inac + bad;
              if (tot === 0) return null;
              return (
                <div className="flex h-1 rounded-full overflow-hidden gap-px mt-1.5 w-full">
                  <div className="bg-emerald-500 rounded-l-full" style={{ width: `${(good/tot)*100}%` }} />
                  <div className="bg-yellow-500" style={{ width: `${(inac/tot)*100}%` }} />
                  <div className="bg-rose-500 rounded-r-full" style={{ width: `${(bad/tot)*100}%` }} />
                </div>
              );
            };

            const PlayerRow = ({
              label, bg, acc, counts,
            }: { label: string; bg: string; acc: number | null; counts: Record<Classification, number> }) => (
              <div className="flex items-center gap-2.5">
                <div className={`w-3 h-3 rounded-full shrink-0 ${bg}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{label}</span>
                    <div className="flex gap-1.5 text-[9px] text-muted-foreground shrink-0">
                      {(counts.brilliant + counts.great + counts.best + counts.excellent) > 0 && <span className="text-cyan-400">+{counts.brilliant + counts.great + counts.best + counts.excellent}</span>}
                      {counts.good > 0 && <span className="text-green-400">{counts.good}✓</span>}
                      {(counts.inaccuracy) > 0 && <span className="text-yellow-400">{counts.inaccuracy}?!</span>}
                      {(counts.mistake + counts.blunder + counts.missed_win) > 0 && <span className="text-rose-400">{counts.mistake + counts.blunder + counts.missed_win}✗</span>}
                    </div>
                  </div>
                  <MiniBar c={counts} />
                </div>
                {acc !== null && (
                  <span className={`font-bold text-sm shrink-0 tabular-nums ${accColor(acc)}`}>{acc}%</span>
                )}
              </div>
            );

            return (
              <div className="border-t border-white/5 p-3 space-y-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Accuracy</p>
                <PlayerRow
                  label={game?.whiteUsername ?? 'White'}
                  bg="bg-[#f0d9b5] border border-black/20"
                  acc={whiteAcc}
                  counts={wc}
                />
                <PlayerRow
                  label={game?.blackUsername ?? 'Black'}
                  bg="bg-[#2d2d2d] border border-white/20"
                  acc={blackAcc}
                  counts={bc}
                />
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
