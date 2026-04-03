import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { useGameViewer } from '@/hooks/use-games';
import { ChessBoard } from '@/components/ChessBoard';
import { Chess } from 'chess.js';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Play, Pause, ArrowLeft, BrainCircuit, FlipVertical2,
  Swords, Clock, Zap, BookOpen, Cpu, Lightbulb, Sparkles, Trophy, Target
} from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { apiFetch } from '@/lib/api';

type Classification = 'brilliant' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder';

type ReviewMove = {
  moveIndex: number;
  san: string;
  color: 'white' | 'black';
  classification: Classification;
  explanation: string;
  betterMove: string | null;
  pros: string[];
  cons: string[];
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
  brilliant:  { badge: '!!',  color: 'text-cyan-400 bg-cyan-400/15 border-cyan-400/30',          full: 'Brilliant' },
  excellent:  { badge: '!',   color: 'text-emerald-400 bg-emerald-400/15 border-emerald-400/30', full: 'Excellent' },
  good:       { badge: '✓',   color: 'text-green-400 bg-green-400/15 border-green-400/30',       full: 'Good' },
  book:       { badge: '📖',  color: 'text-blue-400 bg-blue-400/15 border-blue-400/30',          full: 'Book Move' },
  inaccuracy: { badge: '?!',  color: 'text-yellow-400 bg-yellow-400/15 border-yellow-400/30',    full: 'Inaccuracy' },
  mistake:    { badge: '?',   color: 'text-orange-400 bg-orange-400/15 border-orange-400/30',    full: 'Mistake' },
  blunder:    { badge: '??',  color: 'text-rose-400 bg-rose-400/15 border-rose-400/30',          full: 'Blunder' },
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
  const WEIGHTS: Record<Classification, number> = {
    brilliant: 100, excellent: 98, book: 90, good: 85,
    inaccuracy: 55, mistake: 25, blunder: 0,
  };

  const byColor = (c: 'white' | 'black') => reviewMoves.filter(m => m.color === c);

  const calcAccuracy = (moves: ReviewMove[]) => {
    if (moves.length === 0) return 0;
    return moves.reduce((s, m) => s + WEIGHTS[m.classification], 0) / moves.length;
  };

  const toGameRating = (acc: number) => Math.max(0, Math.round((acc - 52.5) * 40));

  const counts = (moves: ReviewMove[]) => ({
    brilliant: moves.filter(m => m.classification === 'brilliant').length,
    excellent: moves.filter(m => m.classification === 'excellent').length,
    good: moves.filter(m => m.classification === 'good' || m.classification === 'book').length,
    inaccuracy: moves.filter(m => m.classification === 'inaccuracy').length,
    mistake: moves.filter(m => m.classification === 'mistake').length,
    blunder: moves.filter(m => m.classification === 'blunder').length,
  });

  const phaseGrade = (moves: ReviewMove[], from: number, to: number) => {
    const ph = moves.filter(m => m.moveIndex >= from && m.moveIndex < to);
    if (ph.length === 0) return null;
    if (ph.some(m => m.classification === 'blunder'))    return 'blunder';
    if (ph.some(m => m.classification === 'mistake'))    return 'mistake';
    if (ph.some(m => m.classification === 'inaccuracy')) return 'inaccuracy';
    if (ph.some(m => m.classification === 'brilliant'))  return 'brilliant';
    return 'good';
  };

  const PhaseIcon = ({ grade }: { grade: string | null }) => {
    if (!grade) return <span className="text-muted-foreground">—</span>;
    const map: Record<string, { bg: string; label: string }> = {
      brilliant:  { bg: 'bg-cyan-500',    label: '!!' },
      good:       { bg: 'bg-emerald-500', label: '✓'  },
      inaccuracy: { bg: 'bg-yellow-500',  label: '?!' },
      mistake:    { bg: 'bg-orange-500',  label: '?'  },
      blunder:    { bg: 'bg-rose-500',    label: '??' },
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
    { label: 'Brilliant',  key: 'brilliant',  iconBg: 'bg-cyan-500',    icon: '!!', textColor: 'text-cyan-400'    },
    { label: 'Excellent',  key: 'excellent',  iconBg: 'bg-emerald-500', icon: '!',  textColor: 'text-emerald-400' },
    { label: 'Good',       key: 'good',       iconBg: 'bg-green-600',   icon: '✓',  textColor: 'text-green-400'   },
    { label: 'Inaccuracy', key: 'inaccuracy', iconBg: 'bg-yellow-500',  icon: '?!', textColor: 'text-yellow-400'  },
    { label: 'Mistake',    key: 'mistake',    iconBg: 'bg-orange-500',  icon: '?',  textColor: 'text-orange-400'  },
    { label: 'Blunder',    key: 'blunder',    iconBg: 'bg-rose-500',    icon: '??', textColor: 'text-rose-400'    },
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
    <div className="glass-card rounded-2xl overflow-hidden border border-white/8">
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

export function GameReplay() {
  const { id } = useParams();
  const { username } = useUser();
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

  useEffect(() => {
    if (!game) { setLoadingSavedReview(false); return; }
    apiFetch(`/api/games/${game.id}/review`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { reviewData?: ReviewMove[] | { moves: ReviewMove[]; gameSummary?: GameSummary } } | null) => {
        if (!d?.reviewData) return;
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

  // ── Review Game — SSE stream that classifies every move ─────────────────────
  const handleReview = useCallback(async () => {
    if (!game || reviewing || reviewMoves.length > 0) return;
    setReviewing(true);
    setReviewError(null);

    try {
      const res = await apiFetch(`/api/games/${game.id}/review`, { method: 'POST' });
      if (!res.ok || !res.body) throw new Error('Connection failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE events (separated by double newlines)
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          let eventName = '';
          let dataStr = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
          }
          if (!dataStr || dataStr === '') continue;

          try {
            const payload = JSON.parse(dataStr) as Record<string, unknown>;
            if (eventName === 'result') {
              const moves = (payload.moves as ReviewMove[]) ?? [];
              if (moves.length === 0) {
                setReviewError('Review returned no data. Please try again.');
              } else {
                setReviewMoves(moves);
              }
              if (payload.gameSummary) {
                setGameSummary(payload.gameSummary as GameSummary);
              }
            } else if (eventName === 'error') {
              setReviewError((payload.message as string) ?? 'Review failed. Please try again.');
            } else if (eventName === 'done') {
              setReviewing(false);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setReviewError('Review failed. Please try again.');
    } finally {
      setReviewing(false);
    }
  }, [game, reviewing, reviewMoves.length]);

  // Current FEN & lastMove
  const currentFen = currentMove === 0 ? null : moves[currentMove - 1]?.fen;

  const lastMove = useMemo(() => {
    if (currentMove === 0) return null;
    const move = moves[currentMove - 1];
    if (!move?.san) return null;
    const prevFen = currentMove === 1 ? undefined : (moves[currentMove - 2]?.fen ?? undefined);
    try {
      const chess = new Chess(prevFen);
      const result = chess.move(move.san);
      return result ? { from: result.from, to: result.to } : null;
    } catch { return null; }
  }, [currentMove, moves]);

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
          const chess = new Chess(fen);
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
  const isBad = currentReview && ['inaccuracy', 'mistake', 'blunder'].includes(currentReview.classification);

  return (
    <div className="space-y-4 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <Link href="/games" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Games
      </Link>

      {/* Opening banner */}
      {game.opening && (
        <div className="glass-card rounded-2xl px-5 py-3 flex items-center gap-3 border border-primary/20 bg-primary/5">
          <BookOpen className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-bold text-primary/70">{game.eco}</span>
          <span className="font-semibold text-sm">{game.opening}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">

        {/* ── Left col: board + controls ── */}
        <div className="space-y-4">

          {/* Players banner */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="flex items-stretch">
              {/* White player */}
              <div className="flex-1 flex items-center gap-2.5 px-3 py-3">
                {whitePlayer?.avatar
                  ? <img src={whitePlayer.avatar} alt={game.whiteUsername} className="w-9 h-9 rounded-xl object-cover border border-white/20 shrink-0" />
                  : <div className="w-9 h-9 rounded-xl bg-[#eeeed2] flex items-center justify-center shrink-0"><span className="text-[#2d2d2d] font-black text-sm">{game.whiteUsername[0]?.toUpperCase()}</span></div>
                }
                <div className="min-w-0">
                  <p className="font-black text-sm truncate leading-tight">{game.whiteUsername}</p>
                  <p className="text-primary text-xs font-bold">{game.whiteRating}</p>
                </div>
              </div>
              {/* Result badge center */}
              <div className="flex flex-col items-center justify-center px-3 border-x border-white/5 shrink-0">
                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border
                  ${game.result === 'win'  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                    game.result === 'loss' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                                             'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
                  {game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw'}
                </span>
              </div>
              {/* Black player */}
              <div className="flex-1 flex items-center gap-2.5 px-3 py-3 justify-end">
                <div className="min-w-0 text-right">
                  <p className="font-black text-sm truncate leading-tight">{game.blackUsername}</p>
                  <p className="text-primary text-xs font-bold">{game.blackRating}</p>
                </div>
                {blackPlayer?.avatar
                  ? <img src={blackPlayer.avatar} alt={game.blackUsername} className="w-9 h-9 rounded-xl object-cover border border-white/20 shrink-0" />
                  : <div className="w-9 h-9 rounded-xl bg-[#2d2d2d] border border-white/20 flex items-center justify-center shrink-0"><span className="text-[#eeeed2] font-black text-sm">{game.blackUsername[0]?.toUpperCase()}</span></div>
                }
              </div>
            </div>
          </div>

          {/* Chess board */}
          <ChessBoard
            fen={currentFen}
            flipped={flipped}
            practiceMode={practiceMode}
            expectedMoveSan={practiceMode ? bestMoveSan : null}
            onMovePlayed={handleMovePlayed}
            lastMove={lastMove}
            moveQuality={currentReview?.classification ?? null}
          />

          {/* Playback controls */}
          <div className="glass-card rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button onClick={() => { setCurrentMove(0); setIsPlaying(false); }} disabled={currentMove === 0}
                className="p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-40">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentMove(p => Math.max(0, p - 1))} disabled={currentMove === 0}
                className="p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setIsPlaying(p => !p)}
                className="px-4 py-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button onClick={() => setCurrentMove(p => Math.min(maxMoves, p + 1))} disabled={currentMove >= maxMoves}
                className="p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => { setCurrentMove(maxMoves); setIsPlaying(false); }} disabled={currentMove >= maxMoves}
                className="p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-40">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">{currentMove}/{maxMoves}</span>

              <button onClick={() => setFlipped(f => !f)} title="Flip board"
                className="p-2.5 rounded-xl bg-secondary hover:bg-primary/20 hover:text-primary transition-colors">
                <FlipVertical2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => { setPracticeMode(p => !p); setIsPlaying(false); }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border
                  ${practiceMode
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-secondary border-border hover:border-primary/40 hover:text-primary'}`}>
                <span className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" />
                  {practiceMode ? 'Practice ON' : 'Practice'}
                </span>
              </button>

              {/* Review Game button */}
              <button
                onClick={handleReview}
                disabled={reviewing || reviewMoves.length > 0}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors border
                  ${reviewMoves.length > 0
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-secondary border-border hover:border-primary/40 hover:text-primary disabled:opacity-50'}`}>
                {reviewing
                  ? <><div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> Reviewing…</>
                  : reviewMoves.length > 0
                  ? <><Sparkles className="w-3.5 h-3.5" /> Reviewed</>
                  : <><BrainCircuit className="w-3.5 h-3.5" /> Review Game</>}
              </button>
            </div>
          </div>

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

          {/* Review loading banner */}
          {reviewing && (
            <div className="glass-card rounded-xl px-4 py-4 border border-primary/30 bg-primary/5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-bold text-primary">Reviewing game…</p>
                  <p className="text-xs text-muted-foreground mt-0.5">AI is analyzing all {maxMoves} moves. This takes about 15–30 seconds.</p>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-primary/60 animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}

          {/* Review error */}
          {reviewError && (
            <div className="glass-card rounded-xl px-4 py-3 border border-rose-500/30 bg-rose-500/5 text-sm text-rose-400 flex items-center justify-between gap-3">
              <span>{reviewError}</span>
              <button onClick={() => { setReviewError(null); handleReview(); }}
                className="text-xs font-bold underline underline-offset-2 hover:no-underline">Retry</button>
            </div>
          )}

          {/* Per-move analysis panel */}
          {currentMove > 0 && reviewMoves.length > 0 && (() => {
            const move = moves[currentMove - 1];
            return (
              <div className="glass-card rounded-2xl overflow-hidden border border-white/8">
                {/* Header */}
                <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5 bg-white/3">
                  <BrainCircuit className={`w-4 h-4 shrink-0 ${cfg ? cfg.color.split(' ')[0] : 'text-primary'}`} />
                  <span className={`font-bold text-sm ${cfg ? cfg.color.split(' ')[0] : 'text-primary'}`}>
                    {cfg ? `${cfg.full} — ` : ''}<span className="font-mono">{move?.san}</span>
                  </span>
                  {cfg && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cfg.color}`}>
                      {cfg.badge}
                    </span>
                  )}
                  {!currentReview && (
                    <span className="ml-2 text-xs text-muted-foreground italic">No review data for this move</span>
                  )}
                </div>

                {/* Body */}
                <div className="px-4 py-3 space-y-3">
                  {currentReview ? (
                    <>
                      {/* Explanation */}
                      <p className="text-sm text-foreground/85 leading-relaxed">{currentReview.explanation}</p>

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
                </div>
              </div>
            );
          })()}

          {/* Start position prompt / Review Game CTA */}
          {currentMove === 0 && reviewMoves.length === 0 && !reviewing && (
            <div className="glass-card rounded-xl px-4 py-4 border border-primary/20 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
              <div className="flex items-start gap-3">
                <BrainCircuit className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-foreground">Review this game with AI</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Get instant analysis for every move — classifications, explanations, and better alternatives.</p>
                </div>
              </div>
              <button
                onClick={handleReview}
                className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                <Sparkles className="w-4 h-4" />
                Review Game
              </button>
            </div>
          )}

          {/* Coach notes */}
          {game.analysisNotes && currentMove === 0 && (
            <div className="glass-card rounded-xl p-4 border-l-4 border-l-primary bg-primary/5 text-sm">
              <div className="flex items-center gap-2 text-primary font-bold mb-1.5">
                <BrainCircuit className="w-4 h-4" /> Coach Notes
              </div>
              <p className="text-foreground/80 leading-relaxed">{game.analysisNotes}</p>
            </div>
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
            <div className="glass-card rounded-2xl overflow-hidden border border-white/8">
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2 bg-white/3">
                <BrainCircuit className="w-4 h-4 text-primary" />
                <span className="font-bold text-sm">AI Game Analysis</span>
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
        <div className="glass-card rounded-2xl flex flex-col xl:max-h-[700px]">
          <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
            <h3 className="font-bold text-sm">Move List</h3>
            <div className="flex items-center gap-2">
              {reviewMoves.length > 0 && (
                <span className="text-[10px] text-primary font-bold px-2 py-0.5 bg-primary/10 rounded-full border border-primary/20">
                  {reviewMoves.filter(m => ['blunder', 'mistake', 'inaccuracy'].includes(m.classification)).length} errors
                </span>
              )}
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>

          <div ref={moveListRef} className="flex-1 overflow-y-auto p-2 hide-scrollbar">
            {/* Starting position */}
            <div
              onClick={() => { setCurrentMove(0); setPracticeMode(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors mb-1
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
                    className={`flex-1 flex items-center gap-1 py-1.5 px-2 rounded-lg font-mono text-xs text-left transition-colors
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
                <div key={i} className={`flex items-center gap-0.5 text-sm rounded-lg ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                  <span className="w-7 text-muted-foreground font-mono text-xs shrink-0 text-right pr-1">{i + 1}.</span>
                  <MoveBtn moveIndex={wi} move={wm} cls={wClass} />
                  <MoveBtn moveIndex={bi} move={bm} cls={bClass} />
                </div>
              );
            })}
          </div>

          {/* Review summary — per-player accuracy */}
          {reviewMoves.length > 0 && (() => {
            const WEIGHTS: Record<Classification, number> = {
              brilliant: 100, excellent: 98, good: 85, book: 90,
              inaccuracy: 55, mistake: 25, blunder: 0,
            };

            function calcAccuracy(moves: ReviewMove[]) {
              if (moves.length === 0) return null;
              const total = moves.reduce((sum, m) => sum + WEIGHTS[m.classification], 0);
              return Math.round(total / moves.length);
            }

            function countFor(moves: ReviewMove[]) {
              const c: Record<Classification, number> = {
                brilliant: 0, excellent: 0, good: 0, book: 0,
                inaccuracy: 0, mistake: 0, blunder: 0,
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
              const good = c.brilliant + c.excellent + c.good + c.book;
              const inac = c.inaccuracy;
              const bad  = c.mistake + c.blunder;
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
                      {(counts.brilliant + counts.excellent) > 0 && <span className="text-cyan-400">+{counts.brilliant + counts.excellent}</span>}
                      {counts.good > 0 && <span className="text-green-400">{counts.good}✓</span>}
                      {(counts.inaccuracy) > 0 && <span className="text-yellow-400">{counts.inaccuracy}?!</span>}
                      {(counts.mistake + counts.blunder) > 0 && <span className="text-rose-400">{counts.mistake + counts.blunder}✗</span>}
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Accuracy</p>
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
