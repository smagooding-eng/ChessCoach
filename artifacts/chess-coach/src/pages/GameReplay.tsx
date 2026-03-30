import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { useGameViewer } from '@/hooks/use-games';
import { ChessBoard } from '@/components/ChessBoard';
import { Chess } from 'chess.js';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Play, Pause, ArrowLeft, BrainCircuit, FlipVertical2,
  Swords, Clock, Zap, BookOpen, Cpu, Lightbulb, AlertTriangle
} from 'lucide-react';
import { useUser } from '@/hooks/use-user';

type Classification = 'brilliant' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder';

type MoveAnnotation = {
  moveIndex: number;
  san: string;
  color: string;
  classification: Classification;
  explanation: string;
};

type MoveAnalysis = {
  classification: Classification;
  pros: string[];
  cons: string[];
  betterMove: string | null;
  cpLoss: number | null;
  engineDepth: number | null;
  engineAvailable: boolean;
};

const CLASS_CFG: Record<Classification, { badge: string; color: string; full: string }> = {
  brilliant:  { badge: '!!',  color: 'text-cyan-400 bg-cyan-400/15 border-cyan-400/30',      full: 'Brilliant' },
  excellent:  { badge: '!',   color: 'text-emerald-400 bg-emerald-400/15 border-emerald-400/30', full: 'Excellent' },
  good:       { badge: '✓',   color: 'text-green-400 bg-green-400/15 border-green-400/30',    full: 'Good' },
  book:       { badge: '📖',  color: 'text-blue-400 bg-blue-400/15 border-blue-400/30',       full: 'Book Move' },
  inaccuracy: { badge: '?!',  color: 'text-yellow-400 bg-yellow-400/15 border-yellow-400/30', full: 'Inaccuracy' },
  mistake:    { badge: '?',   color: 'text-orange-400 bg-orange-400/15 border-orange-400/30', full: 'Mistake' },
  blunder:    { badge: '??',  color: 'text-rose-400 bg-rose-400/15 border-rose-400/30',       full: 'Blunder' },
};

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

  const [currentMove, setCurrentMove] = useState(0);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [flipped, setFlipped]         = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [analysing, setAnalysing]     = useState(false);
  const [annotations, setAnnotations] = useState<MoveAnnotation[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<MoveAnnotation | null>(null);
  const [bestMoveSan, setBestMoveSan] = useState<string | null>(null);
  const [fetchingBest, setFetchingBest] = useState(false);

  // Per-move deep analysis
  const analysisCache = useRef<Map<number, MoveAnalysis>>(new Map());
  const [moveAnalysis, setMoveAnalysis] = useState<MoveAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  // Map of moveIndex → classification for move-list badges
  const [moveClassifications, setMoveClassifications] = useState<Map<number, Classification>>(new Map());

  const playRef = useRef<NodeJS.Timeout | null>(null);
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

  // Scroll move into view
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentMove]);

  // Update active annotation
  useEffect(() => {
    if (currentMove > 0) {
      setActiveAnnotation(annotations.find(a => a.moveIndex === currentMove - 1) ?? null);
    } else {
      setActiveAnnotation(null);
    }
  }, [currentMove, annotations]);

  // Auto-fetch deep move analysis — debounced 350ms, cached, stale-safe
  useEffect(() => {
    if (!game || currentMove === 0) {
      setMoveAnalysis(null);
      setLoadingAnalysis(false);
      return;
    }
    const moveIdx = currentMove - 1;

    // Serve from cache instantly (no loading flash)
    if (analysisCache.current.has(moveIdx)) {
      setMoveAnalysis(analysisCache.current.get(moveIdx)!);
      setLoadingAnalysis(false);
      return;
    }

    // Show loading state immediately, clear stale analysis
    setMoveAnalysis(null);
    setLoadingAnalysis(true);

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;

      // Re-check cache (another tab/move might have populated it)
      if (analysisCache.current.has(moveIdx)) {
        if (!cancelled) {
          setMoveAnalysis(analysisCache.current.get(moveIdx)!);
          setLoadingAnalysis(false);
        }
        return;
      }

      try {
        const res = await fetch(`/api/games/${game.id}/analyze-move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moveIndex: moveIdx }),
        });
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json() as MoveAnalysis;
        analysisCache.current.set(moveIdx, data);
        if (!cancelled) {
          setMoveAnalysis(data);
          setMoveClassifications(prev => {
            const next = new Map(prev);
            next.set(moveIdx, data.classification);
            return next;
          });
        }
      } catch {
        if (!cancelled) setMoveAnalysis(null);
      } finally {
        if (!cancelled) setLoadingAnalysis(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Do NOT set loadingAnalysis(false) here — the incoming effect sets it to true
      // and calling false here could race and win over the new effect's true call.
    };
  }, [game, currentMove]);

  const currentFen = currentMove === 0 ? null : moves[currentMove - 1]?.fen;

  // Derive the lastMove squares from the SAN played at the current step
  const lastMove = React.useMemo(() => {
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

  // Fetch best move from lichess cloud eval when in practice mode
  useEffect(() => {
    if (!practiceMode || currentMove >= maxMoves) {
      setBestMoveSan(null);
      return;
    }
    const fen = currentFen;
    if (!fen) { setBestMoveSan(null); return; }

    let cancelled = false;
    setFetchingBest(true);
    setBestMoveSan(null);

    fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=1`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return;
        const uci = data?.pvs?.[0]?.moves?.split(' ')?.[0]; // e.g. "e2e4"
        if (!uci || uci.length < 4) { setBestMoveSan(null); return; }
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci[4] || undefined;
        try {
          const chess = new Chess(fen);
          const mv = chess.move({ from, to, promotion: promo });
          setBestMoveSan(mv?.san ?? null);
        } catch { setBestMoveSan(null); }
      })
      .catch(() => { if (!cancelled) setBestMoveSan(null); })
      .finally(() => { if (!cancelled) setFetchingBest(false); });

    return () => { cancelled = true; };
  }, [practiceMode, currentFen, currentMove, maxMoves]);

  const expectedMoveSan = practiceMode ? bestMoveSan : null;

  const handleAnalyze = useCallback(async () => {
    if (!game || analysing || annotations.length > 0) return;
    setAnalysing(true);
    try {
      const res = await fetch(`/api/games/${game.id}/analyze-moves`, { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      const data = await res.json() as { classifications: MoveAnnotation[] };
      setAnnotations(data.classifications ?? []);
    } catch { /* silent */ }
    finally { setAnalysing(false); }
  }, [game, analysing, annotations.length]);

  const handleMovePlayed = useCallback((san: string, correct: boolean) => {
    if (correct) setTimeout(() => setCurrentMove(p => Math.min(maxMoves, p + 1)), 450);
  }, [maxMoves]);

  const getAnnotation = (idx: number) => annotations.find(a => a.moveIndex === idx) ?? null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-sm">Loading game…</p>
    </div>
  );
  if (error || !game) return (
    <div className="text-center py-24 text-destructive">Failed to load game.</div>
  );

  return (
    <div className="space-y-4 pb-20">
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

          {/* Players */}
          <div className="glass-card p-4 rounded-2xl flex flex-wrap items-center gap-4 justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#f0d9b5] border border-black/20 shadow-sm" />
                <span className="font-bold">{game.whiteUsername}</span>
                <span className="text-xs text-muted-foreground">({game.whiteRating})</span>
              </div>
              <Swords className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#2d2d2d] border border-white/20 shadow-sm" />
                <span className="font-bold">{game.blackUsername}</span>
                <span className="text-xs text-muted-foreground">({game.blackRating})</span>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border
              ${game.result === 'win'  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                game.result === 'loss' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                                         'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
              {game.result === 'win' ? '✓ Win' : game.result === 'loss' ? '✗ Loss' : '½ Draw'}
            </span>
          </div>

          {/* Chess board */}
          <ChessBoard
            fen={currentFen}
            flipped={flipped}
            practiceMode={practiceMode}
            expectedMoveSan={expectedMoveSan}
            onMovePlayed={handleMovePlayed}
            lastMove={lastMove}
            moveQuality={moveAnalysis?.classification ?? null}
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

              <button onClick={handleAnalyze}
                disabled={analysing || annotations.length > 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary border border-border hover:border-primary/40 hover:text-primary text-xs font-bold transition-colors disabled:opacity-50">
                {analysing
                  ? <><div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> Analyzing…</>
                  : annotations.length > 0
                  ? <><BrainCircuit className="w-3.5 h-3.5 text-primary" /> Analyzed</>
                  : <><BrainCircuit className="w-3.5 h-3.5" /> AI Analyze</>}
              </button>
            </div>
          </div>

          {/* Practice hint */}
          {practiceMode && (
            <div className="glass-card rounded-xl px-4 py-3 border border-emerald-500/30 bg-emerald-500/5 text-sm text-emerald-300 flex items-center gap-2">
              {fetchingBest
                ? <><div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>Finding engine's best move…</span></>
                : bestMoveSan
                ? <><Cpu className="w-4 h-4 shrink-0" />
                    <span><strong>Practice Mode</strong> — click a piece then a square. Engine target: <span className="font-mono font-bold text-white">{bestMoveSan}</span></span></>
                : <><Zap className="w-4 h-4 shrink-0" />
                    <span><strong>Practice Mode</strong> — click a piece then a square to play. Any legal move accepted.</span></>}
            </div>
          )}

          {/* Per-move deep analysis panel */}
          {currentMove > 0 && (() => {
            const move = moves[currentMove - 1];
            const cfg = moveAnalysis ? CLASS_CFG[moveAnalysis.classification] : null;
            const isBad = moveAnalysis && ['inaccuracy', 'mistake', 'blunder'].includes(moveAnalysis.classification);

            return (
              <div className="glass-card rounded-2xl overflow-hidden border border-white/8">
                {/* Header */}
                <div className={`px-4 py-3 flex items-center gap-2 border-b border-white/5
                  ${cfg ? cfg.color.replace('text-', 'bg-').split(' ')[0] + '/8' : 'bg-white/3'}`}>
                  <BrainCircuit className={`w-4 h-4 shrink-0 ${cfg ? cfg.color.split(' ')[0] : 'text-primary'}`} />
                  <span className={`font-bold text-sm ${cfg ? cfg.color.split(' ')[0] : 'text-primary'}`}>
                    {cfg ? `${cfg.full} — ` : ''}<span className="font-mono">{move?.san}</span>
                  </span>
                  {cfg && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cfg.color}`}>
                      {cfg.badge}
                    </span>
                  )}
                  {/* Centipawn loss badge */}
                  {moveAnalysis?.cpLoss != null && (
                    <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded ml-1"
                          title={`Stockfish depth ${moveAnalysis.engineDepth} · ${moveAnalysis.cpLoss} centipawn loss`}>
                      {moveAnalysis.cpLoss === 0 ? '±0' : `-${moveAnalysis.cpLoss}`}cp
                    </span>
                  )}
                  {/* Source badge */}
                  {moveAnalysis && (
                    <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground/60 ml-1"
                          title={moveAnalysis.engineAvailable
                            ? `Stockfish engine at depth ${moveAnalysis.engineDepth}`
                            : 'GPT-4o position analysis'}>
                      <Cpu className="w-2.5 h-2.5" />
                      {moveAnalysis.engineAvailable ? `d${moveAnalysis.engineDepth}` : 'AI'}
                    </span>
                  )}
                  {loadingAnalysis && (
                    <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Analyzing…
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="px-4 py-3 space-y-3">
                  {loadingAnalysis && !moveAnalysis ? (
                    <div className="flex items-center gap-3 py-3">
                      <div className="w-4 h-4 border-2 border-primary/50 border-t-primary rounded-full animate-spin shrink-0" />
                      <span className="text-sm text-muted-foreground">Analyzing this move…</span>
                    </div>
                  ) : moveAnalysis ? (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Pros */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-400 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                          Strengths
                        </div>
                        {moveAnalysis.pros.length > 0 ? moveAnalysis.pros.map((pro, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-foreground/85 leading-relaxed">
                            <span className="text-emerald-400 shrink-0 mt-0.5 font-bold">+</span>
                            <span>{pro}</span>
                          </div>
                        )) : <p className="text-xs text-muted-foreground italic">None noted</p>}
                      </div>

                      {/* Cons */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-rose-400 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                          Weaknesses
                        </div>
                        {moveAnalysis.cons.length > 0 ? moveAnalysis.cons.map((con, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-foreground/85 leading-relaxed">
                            <span className="text-rose-400 shrink-0 mt-0.5 font-bold">−</span>
                            <span>{con}</span>
                          </div>
                        )) : <p className="text-xs text-muted-foreground italic">None noted</p>}
                      </div>

                      {/* Better move — full width */}
                      {isBad && moveAnalysis.betterMove && (
                        <div className="col-span-2 flex items-start gap-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2.5">
                          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <span className="text-amber-400 font-bold text-[11px] uppercase tracking-wide block mb-0.5">Better move</span>
                            <span className="text-foreground/80 leading-relaxed">{moveAnalysis.betterMove}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic py-1">Navigate to a move to see analysis.</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Start position prompt */}
          {currentMove === 0 && (
            <div className="glass-card rounded-xl px-4 py-3 border border-white/8 text-sm text-muted-foreground flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 shrink-0 text-primary/50" />
              <span>Step through the moves to see AI analysis for each one.</span>
            </div>
          )}

          {/* Coach notes (only if no per-move analysis loading) */}
          {game.analysisNotes && currentMove === 0 && (
            <div className="glass-card rounded-xl p-4 border-l-4 border-l-primary bg-primary/5 text-sm">
              <div className="flex items-center gap-2 text-primary font-bold mb-1.5">
                <BrainCircuit className="w-4 h-4" /> Coach Notes
              </div>
              <p className="text-foreground/80 leading-relaxed">{game.analysisNotes}</p>
            </div>
          )}
        </div>

        {/* ── Right col: move list ── */}
        <div className="glass-card rounded-2xl flex flex-col xl:max-h-[700px]">
          <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
            <h3 className="font-bold text-sm">Move List</h3>
            <div className="flex items-center gap-2">
              {annotations.length > 0 && (
                <span className="text-[10px] text-primary font-bold px-2 py-0.5 bg-primary/10 rounded-full border border-primary/20">
                  {annotations.length} annotated
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
              const wa = getAnnotation(wi);
              const ba = getAnnotation(bi);

              // Prefer per-move AI classification over batch annotation
              const wClass: Classification | null =
                moveClassifications.get(wi) ?? wa?.classification ?? null;
              const bClass: Classification | null =
                moveClassifications.get(bi) ?? ba?.classification ?? null;

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
                <div key={i} className="flex items-center gap-0.5 text-sm">
                  <span className="w-7 text-muted-foreground font-mono text-xs shrink-0 text-right pr-1">{i + 1}.</span>
                  <MoveBtn moveIndex={wi} move={wm} cls={wClass} />
                  <MoveBtn moveIndex={bi} move={bm} cls={bClass} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
