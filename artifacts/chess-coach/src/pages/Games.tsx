import React, { useState } from 'react';
import { useMyGames } from '@/hooks/use-games';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Search, ChevronRight, Play, Filter } from 'lucide-react';
import { format } from 'date-fns';

export function Games() {
  const { data, isLoading, isError, error } = useMyGames();
  const [filter, setFilter] = useState('all');

  const games = data?.games || [];
  
  const filteredGames = games.filter(game => {
    if (filter === 'all') return true;
    return game.result.toLowerCase() === filter.toLowerCase();
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground text-sm">Loading your games…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <Filter className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold">Failed to load games</h2>
        <p className="text-muted-foreground text-sm max-w-sm text-center">
          {error instanceof Error ? error.message : 'An error occurred while fetching your games. Please try again.'}
        </p>
        <Link href="/import" className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors">
          Go to Import
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">My Games</h1>
          <p className="text-muted-foreground">View and replay your imported chess games.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search opponent or opening..." 
              className="w-full pl-9 pr-4 py-2 bg-secondary/50 border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 bg-secondary/50 border border-border rounded-xl outline-none focus:border-primary appearance-none cursor-pointer"
          >
            <option value="all">All Results</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="draw">Draws</option>
          </select>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/50 border-b border-white/5">
                <th className="p-4 font-semibold text-muted-foreground text-sm">Date</th>
                <th className="p-4 font-semibold text-muted-foreground text-sm">Players</th>
                <th className="p-4 font-semibold text-muted-foreground text-sm">Opening</th>
                <th className="p-4 font-semibold text-muted-foreground text-sm">Result</th>
                <th className="p-4 font-semibold text-muted-foreground text-sm text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredGames.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    {games.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-4">
                        <p>No games imported yet.</p>
                        <Link href="/import" className="text-primary hover:underline font-medium">
                          Import your games →
                        </Link>
                      </div>
                    ) : (
                      'No games match the selected filter.'
                    )}
                  </td>
                </tr>
              ) : (
                filteredGames.map((game, i) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={game.id} 
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="p-4 text-sm whitespace-nowrap">
                      {format(new Date(game.playedAt), 'MMM d, yyyy')}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded bg-white shadow-sm border border-black/10"></span>
                          <span className="font-medium text-sm">{game.whiteUsername} <span className="text-muted-foreground text-xs font-normal">({game.whiteRating})</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded bg-neutral-800 shadow-sm border border-white/10"></span>
                          <span className="font-medium text-sm">{game.blackUsername} <span className="text-muted-foreground text-xs font-normal">({game.blackRating})</span></span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm max-w-[200px] truncate" title={game.opening || ''}>
                      {game.opening || 'Unknown'}
                      <div className="text-xs text-muted-foreground mt-0.5">{game.timeControl}</div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide
                        ${game.result === 'win' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 
                          game.result === 'loss' ? 'bg-destructive/20 text-red-400 border border-destructive/20' : 
                          'bg-slate-500/20 text-slate-400 border border-slate-500/20'}`}>
                        {game.result}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Link href={`/games/${game.id}`} className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-secondary text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300">
                        <Play className="w-4 h-4 ml-0.5" />
                      </Link>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
