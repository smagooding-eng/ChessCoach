import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { ChessBoard } from '@/components/ChessBoard';
import { Chess } from 'chess.js';
import { apiFetch } from '@/lib/api';
import { normalizeFen } from '@/lib/utils';
import {
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Play, Pause, ArrowLeft, FlipVertical2, Swords, Clock,
  BookOpen, Lightbulb, Target, AlertTriangle, Trophy, TrendingDown, TrendingUp, X
} from 'lucide-react';

const BG_DARK = '#262421';
const BG_CARD = 'linear-gradient(180deg, #383532 0%, #2a2825 100%)';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const CHESSCOM_GREEN = '#81b64c';
const MISTAKE_RED = '#dc4343';
const CARD_SHADOW = '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)';
const CARD_BORDER = '1px solid rgba(129,182,76,0.08)';

type Classification = 'checkmate' | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder' | 'missed_win';

type GameMove = {
  san: string;
  fen: string;
  fenBefore?: string;
  moveNumber: number;
  color: 'white' | 'black';
};

type H2HGame = {
  id: string;
  whiteUsername: string;
  blackUsername: string;
  whiteRating: number;
  blackRating: number;
  whiteResult: string;
  blackResult: string;
  timeControl: string;
  playedAt: string;
  opening: string;
  eco: string;
  pgn: string;
  moves: GameMove[];
};

type MoveAnalysis = {
  moveIndex: number;
  san: string;
  color: 'white' | 'black';
  classification: Classification;
  evalBefore: number;
  evalAfter: number;
  cpLoss: number;
  bestMoveSan: string | null;
  summary: string;
};

type TurningPoint = {
  moveIndex: number;
  san: string;
  color: 'white' | 'black';
  evalSwing: number;
  description: string;
};

const CLASS_CFG: Record<Classification, { badge: string; color: string; full: string }> = {
  checkmate:   { badge: '♚#', color: 'text-black bg-gradient-to-br from-yellow-300 to-amber-500 border-yellow-200 shadow-[0_0_12px_rgba(250,204,21,0.5)]', full: 'Checkmate — Game Won' },
  brilliant:   { badge: '!!', color: 'text-white bg-cyan-500 border-cyan-300',       full: 'Brilliant Move' },
  great:       { badge: '!',  color: 'text-white bg-sky-500 border-sky-300',        full: 'Great Move' },
  best:        { badge: '!',  color: 'text-white bg-emerald-500 border-emerald-300', full: 'Best Move' },
  excellent:   { badge: '!',  color: 'text-white bg-teal-500 border-teal-300',      full: 'Excellent Move' },
  good:        { badge: '!',  color: 'text-white bg-green-500 border-green-300',    full: 'Good Move' },
  book:        { badge: '📖', color: 'text-white bg-blue-500 border-blue-300',      full: 'Book Move' },
  inaccuracy:  { badge: '?!', color: 'text-black bg-yellow-400 border-yellow-200',  full: 'Inaccuracy' },
  mistake:     { badge: '?',  color: 'text-white bg-orange-500 border-orange-300',  full: 'Mistake' },
  blunder:     { badge: '??', color: 'text-white bg-rose-500 border-rose-300',      full: 'Blunder' },
  missed_win:  { badge: '✗',  color: 'text-white bg-red-500 border-red-300',        full: 'Missed Win' },
};

function formatTimeControl(tc: string): string {
  const parts = tc.split('/');
  const base = parseInt(parts[parts.length - 1]);
  if (isNaN(base)) return tc;
  const mins = Math.floor(base / 60);
  if (mins >= 30) return `${mins} min (Classical)`;
  if (mins >= 10) return `${mins} min (Rapid)`;
  if (mins >= 3) return `${mins} min (Blitz)`;
  return `${mins} min (Bullet)`;
}

function resultLabel(r: string): string {
  if (r === 'win') return 'Won';
  if (r === 'checkmated' || r === 'resigned' || r === 'timeout' || r === 'abandoned') return 'Lost';
  return 'Draw';
}

function resultColor(r: string): string {
  if (r === 'win') return CHESSCOM_GREEN;
  if (r === 'checkmated' || r === 'resigned' || r === 'timeout' || r === 'abandoned') return MISTAKE_RED;
  return TEXT_MUTED;
}

function EvalBar({ evalCp, flipped }: { evalCp: number; flipped: boolean }) {
  const whitePercent = Math.max(5, Math.min(95, 50 + (evalCp / 20)));
  const wp = flipped ? (100 - whitePercent) : whitePercent;
  return (
    <div className="w-4 rounded-sm overflow-hidden flex flex-col" style={{ height: '100%', background: '#1a1917' }}>
      <div style={{ height: `${100 - wp}%`, background: '#444' }} className="transition-all duration-300" />
      <div style={{ height: `${wp}%`, background: '#f0f0f0' }} className="transition-all duration-300" />
    </div>
  );
}

function AnalysisSummaryPanel({
  analysis,
  turningPoints,
  game,
  serverAccuracy,
}: {
  analysis: MoveAnalysis[];
  turningPoints: TurningPoint[];
  game: H2HGame;
  /** Backend-computed accuracy (analyzeGamePgn), using the single shared
   *  formula — preferred over the local calculation below, which is kept
   *  only as a fallback and is a fifth independent copy of this same
   *  formula found during review. */
  serverAccuracy?: { white: number; black: number } | null;
}) {
  // Win-pct-loss fallback table for moves whose engine eval wasn't captured
  // in this older analysis snapshot. Numbers chosen to roughly mirror the
  // chess.com bucket midpoints.
  const WIN_PCT_LOSS_BY_CLASS: Record<Classification, number> = {
    checkmate: 0, brilliant: 0, great: 0, best: 0, excellent: 1, book: 1, good: 3,
    inaccuracy: 9, mistake: 18, blunder: 35, missed_win: 25,
  };

  const byColor = (c: 'white' | 'black') => analysis.filter(m => m.color === c);

  // Chess.com-aligned accuracy: 103.1668 * exp(-0.075 * avgWinPctLoss) - 3.1668
  const calcAccuracy = (moves: MoveAnalysis[]) => {
    if (moves.length === 0) return 0;
    const totalLoss = moves.reduce((s, m) => {
      const loss = m.cpLoss != null && m.cpLoss >= 0
        ? m.cpLoss
        : WIN_PCT_LOSS_BY_CLASS[m.classification];
      return s + loss;
    }, 0);
    const avgLoss = totalLoss / moves.length;
    return Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.075 * avgLoss) - 3.1668));
  };

  // Keep "book" as its own bucket so well-known opening moves are surfaced
  // distinctly (it's a learning signal users explicitly want to see).
  const counts = (moves: MoveAnalysis[]) => ({
    checkmate: moves.filter(m => m.classification === 'checkmate').length,
    brilliant: moves.filter(m => m.classification === 'brilliant').length,
    great: moves.filter(m => m.classification === 'great').length,
    best: moves.filter(m => m.classification === 'best').length,
    excellent: moves.filter(m => m.classification === 'excellent').length,
    good: moves.filter(m => m.classification === 'good').length,
    book: moves.filter(m => m.classification === 'book').length,
    inaccuracy: moves.filter(m => m.classification === 'inaccuracy').length,
    mistake: moves.filter(m => m.classification === 'mistake').length,
    blunder: moves.filter(m => m.classification === 'blunder').length,
    missed_win: moves.filter(m => m.classification === 'missed_win').length,
  });

  const wMoves = byColor('white');
  const bMoves = byColor('black');
  const wAcc = serverAccuracy?.white ?? calcAccuracy(wMoves);
  const bAcc = serverAccuracy?.black ?? calcAccuracy(bMoves);
  const wCounts = counts(wMoves);
  const bCounts = counts(bMoves);

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 border" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
          <Target size={14} style={{ color: CHESSCOM_GREEN }} /> Accuracy
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { name: game.whiteUsername, acc: wAcc, c: wCounts, rating: game.whiteRating },
            { name: game.blackUsername, acc: bAcc, c: bCounts, rating: game.blackRating },
          ].map((p, i) => (
            <div key={i} className="text-center">
              <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>{p.name} ({p.rating})</div>
              <div className="text-2xl font-bold" style={{ color: CHESSCOM_GREEN }}>{p.acc.toFixed(1)}%</div>
              <div className="flex flex-wrap gap-1 justify-center mt-2">
                {(['brilliant','great','best','excellent','good','book','inaccuracy','mistake','blunder','missed_win'] as Classification[]).map(cls => {
                  const cnt = p.c[cls];
                  if (cnt === 0) return null;
                  const cfg = CLASS_CFG[cls];
                  return (
                    <span key={cls} className={`text-[10px] px-1.5 py-0.5 rounded border ${cfg.color}`}>
                      {cfg.badge} {cnt}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {turningPoints.length > 0 && (
        <div className="rounded-xl p-4 border" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
            <AlertTriangle size={14} style={{ color: '#f59e0b' }} /> Turning Points
          </h3>
          <div className="space-y-2">
            {turningPoints.map((tp, i) => (
              <div key={i} className="rounded p-2 text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold" style={{ color: tp.evalSwing > 0 ? CHESSCOM_GREEN : MISTAKE_RED }}>
                    {tp.evalSwing > 0 ? <TrendingUp size={12} className="inline" /> : <TrendingDown size={12} className="inline" />}
                    {' '}{tp.evalSwing > 0 ? '+' : ''}{(tp.evalSwing / 100).toFixed(1)}
                  </span>
                  <span style={{ color: TEXT_MUTED }}>Move {Math.ceil((tp.moveIndex + 1) / 2)}</span>
                  <span className="font-mono font-bold" style={{ color: TEXT_LIGHT }}>{tp.san}</span>
                  <span className="capitalize" style={{ color: TEXT_MUTED }}>({tp.color})</span>
                </div>
                <div style={{ color: TEXT_MUTED }}>{tp.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type SearchHistoryItem = {
  player1: string;
  player2: string;
  searchedAt: string;
};

const SEARCH_HISTORY_KEY = 'chessscout_game_lookup_history';
const MAX_HISTORY = 10;

function getSearchHistory(): SearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchHistoryItem[];
  } catch { return []; }
}

function saveSearchToHistory(p1: string, p2: string) {
  const history = getSearchHistory();
  const key = [p1.toLowerCase(), p2.toLowerCase()].sort().join('|');
  const filtered = history.filter(h => {
    const hKey = [h.player1.toLowerCase(), h.player2.toLowerCase()].sort().join('|');
    return hKey !== key;
  });
  filtered.unshift({ player1: p1, player2: p2, searchedAt: new Date().toISOString() });
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
}

export function GameLookup() {
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [games, setGames] = useState<H2HGame[]>([]);
  const [totalGames, setTotalGames] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>(() => getSearchHistory());

  const [selectedGame, setSelectedGame] = useState<H2HGame | null>(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef(false);

  const [analysis, setAnalysis] = useState<MoveAnalysis[]>([]);
  const [turningPoints, setTurningPoints] = useState<TurningPoint[]>([]);
  const [gameAccuracy, setGameAccuracy] = useState<{ white: number; black: number } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const doSearch = useCallback(async (p1: string, p2: string) => {
    if (!p1.trim() || !p2.trim()) return;
    setLoading(true);
    setError('');
    setHasSearched(true);
    setSelectedGame(null);
    setAnalysis([]);
    setTurningPoints([]);
    try {
      const res = await apiFetch(`/api/games/h2h-lookup?player1=${encodeURIComponent(p1.trim())}&player2=${encodeURIComponent(p2.trim())}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setGames(data.games);
      setTotalGames(data.totalGames);
      if (data.games?.length > 0) {
        saveSearchToHistory(p1.trim(), p2.trim());
        setSearchHistory(getSearchHistory());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch games');
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    doSearch(player1, player2);
  }, [player1, player2, doSearch]);

  const moves = selectedGame?.moves ?? [];
  const totalMoves = moves.length;

  const startFen = useMemo(() => {
    if (!selectedGame || !moves.length) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    return moves[0]?.fenBefore ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  }, [selectedGame, moves]);

  const currentFen = useMemo(() => {
    if (!selectedGame || moveIndex === 0) return startFen;
    return moves[moveIndex - 1]?.fen ?? startFen;
  }, [selectedGame, moveIndex, moves, startFen]);

  const lastMovePair = useMemo(() => {
    if (moveIndex === 0 || !selectedGame) return undefined;
    const m = moves[moveIndex - 1];
    if (!m) return undefined;
    try {
      const prevFen = moveIndex >= 2 ? moves[moveIndex - 2].fen : startFen;
      const chess = new Chess(normalizeFen(prevFen));
      const result = chess.move(m.san);
      if (result) return { from: result.from, to: result.to };
    } catch {}
    return undefined;
  }, [moveIndex, moves, selectedGame, startFen]);

  const currentMoveAnalysis = useMemo(() => {
    if (moveIndex === 0 || analysis.length === 0) return null;
    return analysis.find(a => a.moveIndex === moveIndex - 1) ?? null;
  }, [moveIndex, analysis]);

  const currentEval = useMemo(() => {
    if (moveIndex === 0 || analysis.length === 0) return 0;
    const ma = analysis.find(a => a.moveIndex === moveIndex - 1);
    return ma ? ma.evalAfter : 0;
  }, [moveIndex, analysis]);

  const moveQuality = useMemo(() => {
    if (!currentMoveAnalysis) return undefined;
    return currentMoveAnalysis.classification;
  }, [currentMoveAnalysis]);

  const goFirst = useCallback(() => { setMoveIndex(0); setIsPlaying(false); playRef.current = false; }, []);
  const goLast = useCallback(() => { setMoveIndex(totalMoves); setIsPlaying(false); playRef.current = false; }, [totalMoves]);
  const goNext = useCallback(() => setMoveIndex(i => Math.min(i + 1, totalMoves)), [totalMoves]);
  const goPrev = useCallback(() => setMoveIndex(i => Math.max(i - 1, 0)), []);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      const next = !prev;
      playRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      if (!playRef.current) return;
      setMoveIndex(i => {
        if (i >= totalMoves) {
          setIsPlaying(false);
          playRef.current = false;
          return i;
        }
        return i + 1;
      });
    }, 800);
    return () => clearInterval(id);
  }, [isPlaying, totalMoves]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedGame) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'Home') { e.preventDefault(); goFirst(); }
      if (e.key === 'End') { e.preventDefault(); goLast(); }
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedGame, goNext, goPrev, goFirst, goLast, togglePlay]);

  const analysisJobRef = useRef<string | null>(null);
  const analysisPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const processAnalysisResult = useCallback((data: {
    moves: Array<{
      moveIndex: number;
      san: string;
      color: 'white' | 'black';
      classification: Classification;
      cpLoss: number;
      bestMove: string | null;
      evalBefore: number;
      evalAfter: number;
    }>;
    whiteAccuracy: number;
    blackAccuracy: number;
  }) => {
    const results: MoveAnalysis[] = data.moves.map(m => ({
      moveIndex: m.moveIndex,
      san: m.san,
      color: m.color,
      classification: m.classification,
      evalBefore: m.evalBefore,
      evalAfter: m.evalAfter,
      cpLoss: m.cpLoss,
      bestMoveSan: m.bestMove,
      summary: '',
    }));

    const tps: TurningPoint[] = [];
    for (let i = 1; i < results.length; i++) {
      const swing = results[i].evalAfter - results[i].evalBefore;
      const absSwing = Math.abs(swing);
      if (absSwing >= 150) {
        const color = results[i].color;
        const isGoodForMover = (color === 'white' && swing > 0) || (color === 'black' && swing < 0);
        tps.push({
          moveIndex: results[i].moveIndex,
          san: results[i].san,
          color,
          evalSwing: swing,
          description: isGoodForMover
            ? `Strong move that shifted the position significantly`
            : `Weak move that gave away a ${absSwing >= 300 ? 'major' : 'significant'} advantage`,
        });
      }
    }
    tps.sort((a, b) => Math.abs(b.evalSwing) - Math.abs(a.evalSwing));
    setTurningPoints(tps.slice(0, 6));
    setGameAccuracy({ white: data.whiteAccuracy, black: data.blackAccuracy });
    setAnalysisProgress(100);
    setAnalysis(results);
    setIsAnalyzing(false);
  }, []);

  const stopPolling = useCallback(() => {
    if (analysisPollRef.current) {
      clearInterval(analysisPollRef.current);
      analysisPollRef.current = null;
    }
    analysisJobRef.current = null;
  }, []);

  const selectGame = useCallback((game: H2HGame) => {
    stopPolling();
    setSelectedGame(game);
    setMoveIndex(0);
    setFlipped(false);
    setAnalysis([]);
    setTurningPoints([]);
    setGameAccuracy(null);
    setIsAnalyzing(false);
    setIsPlaying(false);
    playRef.current = false;
  }, [stopPolling]);

  const startPolling = useCallback((jobId: string) => {
    analysisJobRef.current = jobId;
    if (analysisPollRef.current) clearInterval(analysisPollRef.current);

    analysisPollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/games/analyze-pgn-status/${jobId}`);
        if (!res.ok) {
          stopPolling();
          setIsAnalyzing(false);
          return;
        }
        const data = await res.json() as Record<string, unknown>;

        if (data.status === 'done' && data.result) {
          stopPolling();
          processAnalysisResult(data.result as Parameters<typeof processAnalysisResult>[0]);
          return;
        }

        if (data.status === 'error') {
          stopPolling();
          setIsAnalyzing(false);
          console.error('Analysis job failed:', data.error);
          return;
        }

        if (typeof data.progress === 'number' && typeof data.total === 'number' && (data.total as number) > 0) {
          setAnalysisProgress(Math.round(((data.progress as number) / (data.total as number)) * 90) + 5);
        }
      } catch {
        stopPolling();
        setIsAnalyzing(false);
      }
    }, 2000);
  }, [stopPolling, processAnalysisResult]);

  useEffect(() => {
    return () => { stopPolling(); };
  }, [stopPolling]);

  const runAnalysis = useCallback(async () => {
    if (!selectedGame || !selectedGame.pgn) return;
    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysis([]);
    setTurningPoints([]);

    try {
      const res = await apiFetch('/api/games/analyze-pgn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: selectedGame.pgn }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as Record<string, string>).error || `Analysis failed (${res.status})`);
      }

      const data = await res.json() as Record<string, unknown>;

      if (data.status === 'done' && data.result) {
        processAnalysisResult(data.result as Parameters<typeof processAnalysisResult>[0]);
        return;
      }

      if (data.jobId) {
        startPolling(data.jobId as string);
        return;
      }

      throw new Error('Unexpected response from analysis');
    } catch (err: unknown) {
      console.error('Analysis failed:', err);
      setIsAnalyzing(false);
    }
  }, [selectedGame, processAnalysisResult, startPolling]);

  const movePairs = useMemo(() => {
    if (!selectedGame) return [];
    const pairs: { number: number; white?: { san: string; index: number }; black?: { san: string; index: number } }[] = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m.color === 'white') {
        pairs.push({ number: m.moveNumber, white: { san: m.san, index: i } });
      } else {
        if (pairs.length === 0 || pairs[pairs.length - 1].black) {
          pairs.push({ number: m.moveNumber, black: { san: m.san, index: i } });
        } else {
          pairs[pairs.length - 1].black = { san: m.san, index: i };
        }
      }
    }
    return pairs;
  }, [selectedGame, moves]);

  const moveListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (moveListRef.current) {
      const active = moveListRef.current.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [moveIndex]);

  const getAnalysisForIndex = (idx: number) => analysis.find(a => a.moveIndex === idx);

  if (selectedGame) {
    return (
      <div className="min-h-screen p-3 md:p-6" style={{ background: BG_DARK }}>
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => { stopPolling(); setSelectedGame(null); setAnalysis([]); setTurningPoints([]); setIsAnalyzing(false); }}
            className="flex items-center gap-2 mb-4 text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ color: CHESSCOM_GREEN }}
          >
            <ArrowLeft size={16} /> Back to Games
          </button>

          <div className="rounded-xl border overflow-hidden" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
            <div className="p-4 border-b flex flex-wrap items-center gap-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>{selectedGame.whiteUsername}</div>
                  <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{selectedGame.whiteRating} · ♔</div>
                  <div className="text-xs font-bold" style={{ color: resultColor(selectedGame.whiteResult) }}>{resultLabel(selectedGame.whiteResult)}</div>
                </div>
                <Swords size={18} style={{ color: TEXT_MUTED }} />
                <div className="text-center">
                  <div className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>{selectedGame.blackUsername}</div>
                  <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{selectedGame.blackRating} · ♚</div>
                  <div className="text-xs font-bold" style={{ color: resultColor(selectedGame.blackResult) }}>{resultLabel(selectedGame.blackResult)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: TEXT_MUTED }}>
                <span className="flex items-center gap-1"><Clock size={12} />{formatTimeControl(selectedGame.timeControl)}</span>
                <span className="flex items-center gap-1"><BookOpen size={12} />{selectedGame.opening || selectedGame.eco || 'Unknown'}</span>
                <span>{new Date(selectedGame.playedAt).toLocaleDateString()}</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {!isAnalyzing && analysis.length === 0 && (
                  <button
                    onClick={runAnalysis}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:opacity-90"
                    style={{ background: CHESSCOM_GREEN, color: '#fff' }}
                  >
                    <Lightbulb size={13} /> Analyze Game
                  </button>
                )}
                {isAnalyzing && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: CHESSCOM_GREEN }}>
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(129,182,76,0.2)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${analysisProgress}%`, background: CHESSCOM_GREEN }} />
                    </div>
                    Analyzing... {analysisProgress}%
                  </div>
                )}
                <button
                  onClick={() => setFlipped(!flipped)}
                  className="p-1.5 rounded hover:bg-white/10 transition-colors"
                  style={{ color: TEXT_MUTED }}
                  title="Flip board"
                >
                  <FlipVertical2 size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_1fr] gap-0">
              <div className="flex items-stretch p-4">
                <div className="flex gap-2">
                  {analysis.length > 0 && (
                    <EvalBar evalCp={currentEval} flipped={flipped} />
                  )}
                  <div style={{ width: 'min(calc(100vw - 80px), 440px)', aspectRatio: '1' }}>
                    <ChessBoard
                      fen={currentFen}
                      flipped={flipped}
                      lastMove={lastMovePair}
                      moveQuality={moveQuality}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col border-l" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-center gap-1 md:gap-2 p-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <button onClick={goFirst} className="p-3 md:p-2 rounded-xl hover:bg-white/10 active:scale-90 transition-transform" style={{ color: TEXT_MUTED }}><ChevronsLeft className="w-5 h-5 md:w-[18px] md:h-[18px]" /></button>
                  <button onClick={goPrev} className="p-3 md:p-2 rounded-xl hover:bg-white/10 active:scale-90 transition-transform" style={{ color: TEXT_MUTED }}><ChevronLeft className="w-5 h-5 md:w-[18px] md:h-[18px]" /></button>
                  <button onClick={togglePlay} className="p-3 md:p-2 rounded-xl hover:bg-white/10 active:scale-90 transition-transform" style={{ color: CHESSCOM_GREEN }}>
                    {isPlaying ? <Pause className="w-5 h-5 md:w-[18px] md:h-[18px]" /> : <Play className="w-5 h-5 md:w-[18px] md:h-[18px]" />}
                  </button>
                  <button onClick={goNext} className="p-3 md:p-2 rounded-xl hover:bg-white/10 active:scale-90 transition-transform" style={{ color: TEXT_MUTED }}><ChevronRight className="w-5 h-5 md:w-[18px] md:h-[18px]" /></button>
                  <button onClick={goLast} className="p-3 md:p-2 rounded-xl hover:bg-white/10 active:scale-90 transition-transform" style={{ color: TEXT_MUTED }}><ChevronsRight className="w-5 h-5 md:w-[18px] md:h-[18px]" /></button>
                  <span className="text-[10px] ml-2" style={{ color: TEXT_MUTED }}>
                    {moveIndex}/{totalMoves}
                  </span>
                </div>

                <div ref={moveListRef} className="flex-1 overflow-y-auto hide-scrollbar p-2" style={{ maxHeight: 340 }}>
                  {movePairs.map(pair => (
                    <div key={pair.number} className="flex items-center gap-0.5 text-xs mb-0.5">
                      <span className="w-7 text-right font-mono shrink-0" style={{ color: TEXT_MUTED, fontSize: 10 }}>{pair.number}.</span>
                      {pair.white && (
                        <button
                          data-active={moveIndex === pair.white.index + 1}
                          onClick={() => setMoveIndex(pair.white!.index + 1)}
                          className="flex-1 py-0.5 px-1.5 rounded text-left font-mono transition-colors hover:bg-white/10"
                          style={{
                            color: moveIndex === pair.white.index + 1 ? '#fff' : TEXT_LIGHT,
                            background: moveIndex === pair.white.index + 1 ? 'rgba(129,182,76,0.25)' : 'transparent',
                          }}
                        >
                          {pair.white.san}
                          {(() => {
                            const a = getAnalysisForIndex(pair.white!.index);
                            if (!a) return null;
                            const cfg = CLASS_CFG[a.classification];
                            return <span className={`ml-1 text-[9px] ${cfg.color} px-1 rounded`}>{cfg.badge}</span>;
                          })()}
                        </button>
                      )}
                      {pair.black && (
                        <button
                          data-active={moveIndex === pair.black.index + 1}
                          onClick={() => setMoveIndex(pair.black!.index + 1)}
                          className="flex-1 py-0.5 px-1.5 rounded text-left font-mono transition-colors hover:bg-white/10"
                          style={{
                            color: moveIndex === pair.black.index + 1 ? '#fff' : TEXT_LIGHT,
                            background: moveIndex === pair.black.index + 1 ? 'rgba(129,182,76,0.25)' : 'transparent',
                          }}
                        >
                          {pair.black.san}
                          {(() => {
                            const a = getAnalysisForIndex(pair.black!.index);
                            if (!a) return null;
                            const cfg = CLASS_CFG[a.classification];
                            return <span className={`ml-1 text-[9px] ${cfg.color} px-1 rounded`}>{cfg.badge}</span>;
                          })()}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {currentMoveAnalysis && (
                  <div className="border-t p-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-bold ${CLASS_CFG[currentMoveAnalysis.classification].color}`}>
                        {CLASS_CFG[currentMoveAnalysis.classification].badge} {CLASS_CFG[currentMoveAnalysis.classification].full}
                      </span>
                      <span className="font-mono text-sm font-bold" style={{ color: TEXT_LIGHT }}>{currentMoveAnalysis.san}</span>
                    </div>
                    {currentMoveAnalysis.cpLoss > 0 && (
                      <div className="text-[10px] mb-1" style={{ color: TEXT_MUTED }}>
                        CP loss: {currentMoveAnalysis.cpLoss} · Eval: {(currentMoveAnalysis.evalAfter / 100).toFixed(1)}
                      </div>
                    )}
                    {currentMoveAnalysis.bestMoveSan && currentMoveAnalysis.bestMoveSan !== currentMoveAnalysis.san && (
                      <div className="text-[10px]" style={{ color: CHESSCOM_GREEN }}>
                        Best: {currentMoveAnalysis.bestMoveSan}
                      </div>
                    )}
                    {currentMoveAnalysis.summary && (
                      <div className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>{currentMoveAnalysis.summary}</div>
                    )}
                  </div>
                )}
              </div>

              {analysis.length > 0 && (
                <div className="border-l p-4 overflow-y-auto hide-scrollbar" style={{ borderColor: 'rgba(255,255,255,0.06)', maxHeight: 500 }}>
                  <AnalysisSummaryPanel analysis={analysis} turningPoints={turningPoints} game={selectedGame} serverAccuracy={gameAccuracy} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 md:p-6" style={{ background: BG_DARK }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHero piece="♜" title="Game Lookup" subtitle="Find and analyze games between any two Chess.com players" />

        <div className="rounded-xl border p-5" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED }}>Player 1</label>
              <input
                type="text"
                value={player1}
                onChange={e => setPlayer1(e.target.value)}
                placeholder="Chess.com username"
                className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none focus:ring-1 transition-all"
                style={{
                  background: BG_DARK,
                  borderColor: 'rgba(255,255,255,0.1)',
                  color: TEXT_LIGHT,
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              />
            </div>
            <div className="flex items-center justify-center" style={{ color: TEXT_MUTED }}>
              <Swords size={20} />
            </div>
            <div className="flex-1 w-full">
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED }}>Player 2</label>
              <input
                type="text"
                value={player2}
                onChange={e => setPlayer2(e.target.value)}
                placeholder="Chess.com username"
                className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none focus:ring-1 transition-all"
                style={{
                  background: BG_DARK,
                  borderColor: 'rgba(255,255,255,0.1)',
                  color: TEXT_LIGHT,
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !player1.trim() || !player2.trim()}
              className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40 shrink-0"
              style={{ background: CHESSCOM_GREEN, color: '#fff' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Searching...
                </span>
              ) : (
                <span className="flex items-center gap-2"><Search size={15} /> Search</span>
              )}
            </button>
          </div>
        </div>

        {searchHistory.length > 0 && !loading && games.length === 0 && (
          <div className="rounded-xl border p-4" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} style={{ color: TEXT_MUTED }} />
              <h3 className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: TEXT_MUTED }}>Previous Searches</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setPlayer1(h.player1);
                    setPlayer2(h.player2);
                    doSearch(h.player1, h.player2);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all hover:opacity-80"
                  style={{ background: 'rgba(129,182,76,0.08)', border: '1px solid rgba(129,182,76,0.15)', color: TEXT_LIGHT }}
                >
                  <Swords size={12} style={{ color: CHESSCOM_GREEN }} />
                  <span className="font-medium">{h.player1}</span>
                  <span style={{ color: TEXT_MUTED }}>vs</span>
                  <span className="font-medium">{h.player2}</span>
                  <span className="text-[10px]" style={{ color: TEXT_MUTED }}>
                    {new Date(h.searchedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl p-3 text-sm border" style={{ background: 'rgba(220,67,67,0.35)', borderColor: 'rgba(220,67,67,0.6)', color: '#ffffff' }}>
            {error}
          </div>
        )}

        {hasSearched && !loading && games.length === 0 && !error && (
          <div className="text-center py-12 rounded-xl border" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
            <Swords size={40} className="mx-auto mb-3" style={{ color: TEXT_MUTED, opacity: 0.4 }} />
            <p className="text-sm font-medium" style={{ color: TEXT_MUTED }}>No games found between these players</p>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED, opacity: 0.7 }}>Games from the last 6 months are searched</p>
          </div>
        )}

        {games.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>
                {totalGames} game{totalGames !== 1 ? 's' : ''} found
              </h2>
              <span className="text-xs" style={{ color: TEXT_MUTED }}>(last 6 months)</span>
            </div>
            <div className="space-y-2">
              {games.map(game => {
                const wWon = game.whiteResult === 'win';
                const bWon = game.blackResult === 'win';
                const draw = !wWon && !bWon;
                return (
                  <button
                    key={game.id}
                    onClick={() => selectGame(game)}
                    className="w-full text-left rounded-xl border p-3 transition-all hover:border-[rgba(129,182,76,0.4)] group"
                    style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-bold truncate" style={{ color: wWon ? CHESSCOM_GREEN : TEXT_LIGHT }}>
                            ♔ {game.whiteUsername}
                          </span>
                          <span className="text-xs" style={{ color: TEXT_MUTED }}>({game.whiteRating})</span>
                          {wWon && <Trophy size={12} style={{ color: CHESSCOM_GREEN }} />}
                        </div>
                        <div className="flex items-center gap-2 text-sm mt-0.5">
                          <span className="font-bold truncate" style={{ color: bWon ? CHESSCOM_GREEN : TEXT_LIGHT }}>
                            ♚ {game.blackUsername}
                          </span>
                          <span className="text-xs" style={{ color: TEXT_MUTED }}>({game.blackRating})</span>
                          {bWon && <Trophy size={12} style={{ color: CHESSCOM_GREEN }} />}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-medium" style={{ color: draw ? TEXT_MUTED : (wWon ? CHESSCOM_GREEN : MISTAKE_RED) }}>
                          {draw ? '½-½' : wWon ? '1-0' : '0-1'}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>
                          {formatTimeControl(game.timeControl)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px]" style={{ color: TEXT_MUTED }}>
                          {new Date(game.playedAt).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] mt-0.5 truncate max-w-[120px]" style={{ color: TEXT_MUTED }}>
                          {game.opening || game.eco}
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: CHESSCOM_GREEN }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
