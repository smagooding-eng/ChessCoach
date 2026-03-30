import React, { useState, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { BookOpen, Search, TrendingUp, TrendingDown, ArrowUpDown, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import { useMyOpenings, type OpeningStat } from '@/hooks/use-openings';

type SortKey = 'totalGames' | 'winRate' | 'opening' | 'whiteWinRate' | 'blackWinRate';
type ColorFilter = 'all' | 'white' | 'black';

function WinBar({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  const total = wins + losses + draws;
  if (total === 0) return <div className="h-2 w-full bg-secondary rounded-full" />;
  const wp = (wins / total) * 100;
  const lp = (losses / total) * 100;
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden gap-px">
      <div className="bg-emerald-500 rounded-l-full transition-all" style={{ width: `${wp}%` }} />
      <div className="bg-secondary flex-1" style={{ width: `${100 - wp - lp}%` }} />
      <div className="bg-red-500 rounded-r-full transition-all" style={{ width: `${lp}%` }} />
    </div>
  );
}

function WinRateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 60 ? 'text-emerald-400' :
    rate >= 50 ? 'text-amber-400' :
    rate >= 40 ? 'text-orange-400' :
    'text-red-400';
  return <span className={`font-bold text-sm ${color}`}>{rate}%</span>;
}

function ColorCell({ stat }: { stat: { games: number; wins: number; losses: number; draws: number; winRate: number } }) {
  if (stat.games === 0) return <span className="text-muted-foreground/40 text-xs">—</span>;
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{stat.games}g</span>
        <WinRateBadge rate={stat.winRate} />
      </div>
      <WinBar wins={stat.wins} losses={stat.losses} draws={stat.draws} />
      <div className="flex gap-1.5 text-[10px] text-muted-foreground">
        <span className="text-emerald-400/80">{stat.wins}W</span>
        <span className="text-red-400/80">{stat.losses}L</span>
        <span>{stat.draws}D</span>
      </div>
    </div>
  );
}

export function Openings() {
  const { data, isLoading } = useMyOpenings();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalGames');
  const [sortAsc, setSortAsc] = useState(false);
  const [colorFilter, setColorFilter] = useState<ColorFilter>('all');

  const openings = data?.openings ?? [];
  const totalGames = data?.totalGames ?? 0;

  const filtered = useMemo(() => {
    let list = openings;

    // Color filter
    if (colorFilter === 'white') list = list.filter(o => o.white.games > 0);
    else if (colorFilter === 'black') list = list.filter(o => o.black.games > 0);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.opening.toLowerCase().includes(q) ||
        (o.eco?.toLowerCase().includes(q) ?? false)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === 'totalGames') { av = a.totalGames; bv = b.totalGames; }
      else if (sortKey === 'winRate') { av = a.winRate; bv = b.winRate; }
      else if (sortKey === 'whiteWinRate') { av = a.white.winRate; bv = b.white.winRate; }
      else if (sortKey === 'blackWinRate') { av = a.black.winRate; bv = b.black.winRate; }
      else if (sortKey === 'opening') return sortAsc ? a.opening.localeCompare(b.opening) : b.opening.localeCompare(a.opening);
      return sortAsc ? av - bv : bv - av;
    });

    return list;
  }, [openings, search, sortKey, sortAsc, colorFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/40" />;
    return sortAsc
      ? <ChevronUp className="w-3.5 h-3.5 text-primary" />
      : <ChevronDown className="w-3.5 h-3.5 text-primary" />;
  }

  // Summary stats
  const bestOpening = [...openings].filter(o => o.totalGames >= 3).sort((a, b) => b.winRate - a.winRate)[0];
  const worstOpening = [...openings].filter(o => o.totalGames >= 3).sort((a, b) => a.winRate - b.winRate)[0];
  const mostPlayed = openings[0];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <BookOpen className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-display font-bold">Opening Repertoire</h1>
        </div>
        <p className="text-muted-foreground ml-10">
          Every opening played across {totalGames} imported games, broken down by colour.
        </p>
      </div>

      {openings.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium opacity-60">No games imported yet</p>
          <p className="text-sm mt-1 opacity-40">Import games to see your opening stats</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
              className="glass-card rounded-2xl p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Most Played</p>
              {mostPlayed ? (
                <>
                  <p className="font-bold line-clamp-1">{mostPlayed.opening}</p>
                  <p className="text-muted-foreground text-sm mt-1">{mostPlayed.totalGames} games · {mostPlayed.percentage}% of total</p>
                </>
              ) : <p className="text-muted-foreground">—</p>}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
              className="glass-card rounded-2xl p-5 border-emerald-500/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Best Win Rate (≥3 games)
              </p>
              {bestOpening ? (
                <>
                  <p className="font-bold line-clamp-1">{bestOpening.opening}</p>
                  <p className="text-emerald-400 font-bold text-lg">{bestOpening.winRate}%</p>
                </>
              ) : <p className="text-muted-foreground">—</p>}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
              className="glass-card rounded-2xl p-5 border-red-500/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-red-400" /> Worst Win Rate (≥3 games)
              </p>
              {worstOpening ? (
                <>
                  <p className="font-bold line-clamp-1">{worstOpening.opening}</p>
                  <p className="text-red-400 font-bold text-lg">{worstOpening.winRate}%</p>
                </>
              ) : <p className="text-muted-foreground">—</p>}
            </motion.div>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or ECO code…"
                className="w-full pl-10 pr-4 py-2.5 bg-secondary/70 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
              />
            </div>
            <div className="flex rounded-xl overflow-hidden border border-border text-sm font-medium">
              {(['all', 'white', 'black'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setColorFilter(f)}
                  className={`px-4 py-2.5 transition-colors capitalize ${colorFilter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:text-foreground'}`}
                >
                  {f === 'all' ? 'All Games' : `As ${f.charAt(0).toUpperCase() + f.slice(1)}`}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <th className="p-4 text-left font-semibold text-muted-foreground">
                      <button onClick={() => toggleSort('opening')} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                        Opening <SortIcon col="opening" />
                      </button>
                    </th>
                    <th className="p-4 text-right font-semibold text-muted-foreground whitespace-nowrap">
                      <button onClick={() => toggleSort('totalGames')} className="flex items-center gap-1.5 hover:text-foreground transition-colors ml-auto">
                        Games <SortIcon col="totalGames" />
                      </button>
                    </th>
                    <th className="p-4 font-semibold text-muted-foreground whitespace-nowrap">
                      <button onClick={() => toggleSort('winRate')} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                        Overall <SortIcon col="winRate" />
                      </button>
                    </th>
                    <th className="p-4 font-semibold text-muted-foreground whitespace-nowrap">
                      <button onClick={() => toggleSort('whiteWinRate')} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                        <span className="w-3 h-3 rounded-sm bg-[#f0d9b5] inline-block" /> As White <SortIcon col="whiteWinRate" />
                      </button>
                    </th>
                    <th className="p-4 font-semibold text-muted-foreground whitespace-nowrap">
                      <button onClick={() => toggleSort('blackWinRate')} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                        <span className="w-3 h-3 rounded-sm bg-[#b58863] inline-block" /> As Black <SortIcon col="blackWinRate" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-muted-foreground">
                        No openings match your search.
                      </td>
                    </tr>
                  ) : filtered.map((o, i) => {
                    const linkParam = encodeURIComponent(o.eco ?? o.opening);
                    return (
                    <motion.tr
                      key={o.opening}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      className="hover:bg-white/[0.025] transition-colors group cursor-pointer"
                      onClick={() => navigate(`/openings/${linkParam}`)}
                    >
                      {/* Opening name */}
                      <td className="p-4">
                        <div className="flex items-start gap-2.5">
                          {o.eco && (
                            <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/20">
                              {o.eco}
                            </span>
                          )}
                          <span className="font-medium leading-snug group-hover:text-primary transition-colors">{o.opening}</span>
                        </div>
                      </td>

                      {/* Total games + % */}
                      <td className="p-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-bold">{o.totalGames}</span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.min(o.percentage * 3, 100)}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{o.percentage}%</span>
                          </div>
                        </div>
                      </td>

                      {/* Overall */}
                      <td className="p-4">
                        <div className="flex flex-col gap-1.5 min-w-[110px]">
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1.5 text-[11px]">
                              <span className="text-emerald-400">{o.wins}W</span>
                              <span className="text-red-400">{o.losses}L</span>
                              <span className="text-muted-foreground">{o.draws}D</span>
                            </div>
                            <WinRateBadge rate={o.winRate} />
                          </div>
                          <WinBar wins={o.wins} losses={o.losses} draws={o.draws} />
                        </div>
                      </td>

                      {/* White */}
                      <td className="p-4"><ColorCell stat={o.white} /></td>

                      {/* Black */}
                      <td className="p-4 pr-2"><ColorCell stat={o.black} /></td>

                      {/* Arrow */}
                      <td className="p-4 pl-0">
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      </td>
                    </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-4 py-3 border-t border-border/50 text-xs text-muted-foreground">
                Showing {filtered.length} of {openings.length} openings · {totalGames} total games
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
