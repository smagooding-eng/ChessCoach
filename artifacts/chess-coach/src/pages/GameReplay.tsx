import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'wouter';
import { useGameViewer } from '@/hooks/use-games';
import { ChessBoard } from '@/components/ChessBoard';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, Pause, ArrowLeft, BrainCircuit } from 'lucide-react';

export function GameReplay() {
  const { id } = useParams();
  const { data: game, isLoading, error } = useGameViewer(parseInt(id || '0'));
  
  const [currentMove, setCurrentMove] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const moves = game?.moves || [];
  const maxMoves = moves.length;

  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentMove(prev => {
          if (prev >= maxMoves) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, maxMoves]);

  const currentFen = currentMove === 0 ? null : moves[currentMove - 1]?.fen;

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  if (error || !game) return <div className="text-center py-20 text-destructive">Failed to load game.</div>;

  return (
    <div className="space-y-6 pb-20">
      <Link href="/games" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Games
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col - Board & Controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Info */}
          <div className="glass-card p-4 rounded-2xl flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-bold text-lg">{game.whiteUsername}</div>
                <div className="text-sm text-muted-foreground">{game.whiteRating}</div>
              </div>
              <div className="text-2xl font-bold px-4 text-muted-foreground">vs</div>
              <div>
                <div className="font-bold text-lg">{game.blackUsername}</div>
                <div className="text-sm text-muted-foreground">{game.blackRating}</div>
              </div>
            </div>
            <div className={`px-4 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wider
                ${game.result === 'win' ? 'bg-emerald-500/20 text-emerald-400' : 
                  game.result === 'loss' ? 'bg-destructive/20 text-red-400' : 
                  'bg-slate-500/20 text-slate-400'}`}>
                {game.result}
            </div>
          </div>

          {/* The Board */}
          <ChessBoard fen={currentFen} />

          {/* Controls */}
          <div className="glass-card p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex gap-2">
              <button onClick={() => setCurrentMove(0)} disabled={currentMove === 0} className="p-3 bg-secondary rounded-xl hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50 disabled:hover:bg-secondary disabled:hover:text-foreground">
                <ChevronsLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setCurrentMove(p => Math.max(0, p - 1))} disabled={currentMove === 0} className="p-3 bg-secondary rounded-xl hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50 disabled:hover:bg-secondary disabled:hover:text-foreground">
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <button onClick={() => setIsPlaying(!isPlaying)} className="p-3 px-6 bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all font-bold w-32 flex justify-center items-center gap-2">
                {isPlaying ? <><Pause className="w-5 h-5"/> Pause</> : <><Play className="w-5 h-5 fill-current"/> Play</>}
              </button>

              <button onClick={() => setCurrentMove(p => Math.min(maxMoves, p + 1))} disabled={currentMove === maxMoves} className="p-3 bg-secondary rounded-xl hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50 disabled:hover:bg-secondary disabled:hover:text-foreground">
                <ChevronRight className="w-5 h-5" />
              </button>
              <button onClick={() => setCurrentMove(maxMoves)} disabled={currentMove === maxMoves} className="p-3 bg-secondary rounded-xl hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50 disabled:hover:bg-secondary disabled:hover:text-foreground">
                <ChevronsRight className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm font-medium font-mono bg-secondary px-4 py-2 rounded-lg">
              Move {Math.floor((currentMove + 1) / 2)} / {Math.ceil(maxMoves / 2)}
            </div>
          </div>
        </div>

        {/* Right Col - Move List & Analysis */}
        <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
          <div className="glass-card rounded-2xl p-6 flex-1 flex flex-col min-h-0">
            <h3 className="font-bold mb-4 flex justify-between items-center">
              <span>Moves</span>
              <span className="text-xs font-normal text-muted-foreground px-2 py-1 bg-secondary rounded-md">{game.opening}</span>
            </h3>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-1 hide-scrollbar">
              {Array.from({ length: Math.ceil(maxMoves / 2) }).map((_, i) => {
                const moveNum = i + 1;
                const whiteIdx = i * 2;
                const blackIdx = i * 2 + 1;
                
                return (
                  <div key={i} className="flex text-sm">
                    <div className="w-10 py-1.5 text-muted-foreground font-mono">{moveNum}.</div>
                    <button 
                      onClick={() => setCurrentMove(whiteIdx + 1)}
                      className={`flex-1 py-1.5 px-2 rounded font-mono text-left transition-colors ${currentMove === whiteIdx + 1 ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-secondary'}`}
                    >
                      {moves[whiteIdx]?.san}
                    </button>
                    <button 
                      onClick={() => setCurrentMove(blackIdx + 1)}
                      disabled={!moves[blackIdx]}
                      className={`flex-1 py-1.5 px-2 rounded font-mono text-left transition-colors ${!moves[blackIdx] ? 'opacity-0' : currentMove === blackIdx + 1 ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-secondary'}`}
                    >
                      {moves[blackIdx]?.san}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Analysis Note box */}
          {(moves[currentMove - 1]?.comment || game.analysisNotes) && (
            <div className="glass-card rounded-2xl p-5 border-l-4 border-l-primary bg-primary/5">
              <div className="flex items-center gap-2 mb-2 text-primary font-bold">
                <BrainCircuit className="w-5 h-5" /> Coach Analysis
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                {moves[currentMove - 1]?.comment || game.analysisNotes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
