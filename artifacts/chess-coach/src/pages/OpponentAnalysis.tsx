import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Search, Target, AlertTriangle, TrendingUp, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';

interface OpponentResult {
  username: string;
  gamesAnalyzed: number;
  wins: number;
  losses: number;
  draws: number;
  weaknesses: Array<{
    category: string;
    severity: string;
    description: string;
    frequency: number;
    examples: string[];
  }>;
  topOpenings: Array<{
    opening: string;
    games: number;
    winRate: number;
  }>;
}

const SEV_STYLES: Record<string, string> = {
  Critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  High: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

export function OpponentAnalysis() {
  const { username } = useUser();
  const [inputUsername, setInputUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpponentResult | null>(null);
  const [expandedWeakness, setExpandedWeakness] = useState<number | null>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = inputUsername.trim();
    if (!target) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/opponents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-chess-username': username ?? '' },
        body: JSON.stringify({ username: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data as OpponentResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const totalGames = result ? result.wins + result.losses + result.draws : 0;
  const winPct = totalGames > 0 ? Math.round((result!.wins / totalGames) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Swords className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-display font-bold">Opponent Scout</h1>
        </div>
        <p className="text-muted-foreground ml-10">
          Enter any chess.com username to analyze their weaknesses before your next game.
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleAnalyze} className="flex gap-3 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={inputUsername}
            onChange={e => setInputUsername(e.target.value)}
            placeholder="chess.com username..."
            className="w-full pl-10 pr-4 py-3 bg-secondary/70 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !inputUsername.trim()}
          className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
          {loading ? 'Scouting…' : 'Scout'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-red-400 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </motion.div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-2xl bg-secondary/40 animate-pulse" />
          ))}
          <p className="text-center text-muted-foreground text-sm animate-pulse">
            Fetching games and running AI analysis…
          </p>
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Player header */}
            <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-display font-bold flex items-center gap-2">
                  <span className="text-primary">♟</span>
                  {result.username}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Analysis based on {result.gamesAnalyzed} recent games
                </p>
              </div>
              <div className="flex gap-6">
                <Stat label="Wins" value={result.wins} color="text-emerald-400" />
                <Stat label="Losses" value={result.losses} color="text-red-400" />
                <Stat label="Draws" value={result.draws} color="text-muted-foreground" />
                <Stat label="Win %" value={`${winPct}%`} color="text-primary" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Weaknesses */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Identified Weaknesses
                  <span className="text-xs text-muted-foreground font-normal ml-1">— exploit these</span>
                </h3>
                {result.weaknesses.map((w, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="glass-card rounded-xl overflow-hidden cursor-pointer"
                    onClick={() => setExpandedWeakness(expandedWeakness === i ? null : i)}
                  >
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${SEV_STYLES[w.severity] ?? SEV_STYLES.Low}`}>
                            {w.severity}
                          </span>
                          <h4 className="font-semibold">{w.category}</h4>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-20 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full"
                                style={{ width: `${Math.round(w.frequency * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{Math.round(w.frequency * 100)}%</span>
                          </div>
                          {expandedWeakness === i
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          }
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{w.description}</p>
                    </div>
                    <AnimatePresence>
                      {expandedWeakness === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-0 border-t border-border/50">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-3">
                              Examples from their games
                            </p>
                            <ul className="space-y-1.5">
                              {w.examples.map((ex, j) => (
                                <li key={j} className="text-sm text-muted-foreground flex gap-2">
                                  <span className="text-primary mt-0.5">•</span>
                                  {ex}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>

              {/* Top Openings */}
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-accent" />
                  Favourite Openings
                </h3>
                <div className="space-y-3">
                  {result.topOpenings.map((o, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07 }}
                      className="glass-card rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-sm font-medium leading-snug line-clamp-2">{o.opening || 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{o.games}g</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${o.winRate >= 60 ? 'bg-emerald-500' : o.winRate >= 45 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${o.winRate}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${o.winRate >= 60 ? 'text-emerald-400' : o.winRate >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                          {o.winRate}%
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Scout tip box */}
                <div className="mt-6 p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="flex gap-2">
                    <Target className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-primary mb-1">Scout Tip</p>
                      <p className="text-xs text-muted-foreground">
                        Target their highest-severity weaknesses early. Check their opening win rates and steer towards lines where they score poorly.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="text-center py-20 text-muted-foreground">
          <Swords className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium opacity-60">Enter a username above to scout an opponent</p>
          <p className="text-sm mt-2 opacity-40">Works with any chess.com account</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
