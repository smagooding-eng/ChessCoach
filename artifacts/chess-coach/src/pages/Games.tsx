import React, { useState, useMemo } from 'react';
import { useMyGames } from '@/hooks/use-games';
import { useUser } from '@/hooks/use-user';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Search, Play, Filter, BookOpen, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

export function Games() {
  const { data, isLoading, isError, error } = useMyGames();
  const { username } = useUser();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const games = data?.games || [];

  const filteredGames = useMemo(() => {
    return games.filter(game => {
      const matchesResult = filter === 'all' || game.result.toLowerCase() === filter.toLowerCase();
      const q = search.toLowerCase();
      const matchesSearch = !q || [
        game.whiteUsername, game.blackUsername, game.opening ?? '',
      ].some(s => s.toLowerCase().includes(q));
      return matchesResult && matchesSearch;
    });
  }, [games, filter, search]);

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

  const getPlayerColor = (game: typeof games[0]) => {
    if (!username) return null;
    const u = username.toLowerCase();
    if (game.whiteUsername.toLowerCase() === u) return 'white';
    if (game.blackUsername.toLowerCase() === u) return 'black';
    return null;
  };

  const getOpponent = (game: typeof games[0]) => {
    if (!username) return game.blackUsername;
    const u = username.toLowerCase();
    if (game.whiteUsername.toLowerCase() === u) return game.blackUsername;
    return game.whiteUsername;
  };

  const getUserRating = (game: typeof games[0]) => {
    if (!username) return game.whiteRating;
    const u = username.toLowerCase();
    if (game.whiteUsername.toLowerCase() === u) return game.whiteRating;
    return game.blackRating;
  };

  const getOpponentRating = (game: typeof games[0]) => {
    if (!username) return game.blackRating;
    const u = username.toLowerCase();
    if (game.whiteUsername.toLowerCase() === u) return game.blackRating;
    return game.whiteRating;
  };

  return (
    <div className="space-y-5 px-4 pt-4 md:px-0 md:pt-0 pb-10">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold">My Games</h1>
        <p className="text-muted-foreground text-sm">View and replay your imported chess games.</p>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search opponent or opening…"
            className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2.5 bg-secondary/50 border border-border rounded-xl outline-none focus:border-primary appearance-none cursor-pointer text-sm"
        >
          <option value="all">All Results</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
          <option value="draw">Draws</option>
        </select>
      </div>

      {filteredGames.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {games.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <p>No games imported yet.</p>
              <Link href="/import" className="text-primary hover:underline font-medium">
                Import your games →
              </Link>
            </div>
          ) : (
            'No games match the selected filter.'
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGames.map((game, i) => {
            const color = getPlayerColor(game);
            const opponent = getOpponent(game);
            const userRating = getUserRating(game);
            const opponentRating = getOpponentRating(game);
            const reviewed = game.reviewed;

            const borderColor = color === 'white'
              ? 'border-l-white/80'
              : color === 'black'
              ? 'border-l-neutral-500'
              : 'border-l-border';

            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                key={game.id}
              >
                <Link href={`/games/${game.id}`}>
                  <div className={`glass-card rounded-xl p-3.5 border border-white/5 border-l-[3px] ${borderColor} hover:bg-white/[0.03] transition-colors cursor-pointer group`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        color === 'white' ? 'bg-white/90' : 'bg-neutral-700 border border-white/10'
                      }`}>
                        <span className={`text-xs font-bold ${color === 'white' ? 'text-neutral-900' : 'text-white'}`}>
                          {color === 'white' ? 'W' : 'B'}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">vs {opponent}</span>
                          <span className="text-xs text-muted-foreground">({opponentRating})</span>
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                            ${game.result === 'win' ? 'bg-emerald-500/20 text-emerald-400' :
                              game.result === 'loss' ? 'bg-red-500/20 text-red-400' :
                              'bg-slate-500/20 text-slate-400'}`}>
                            {game.result}
                          </span>
                          {reviewed && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-bold">
                              <Sparkles className="w-2.5 h-2.5" /> Reviewed
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{format(new Date(game.playedAt), 'MMM d, yyyy')}</span>
                          <span className="text-border">·</span>
                          <span>{game.timeControl}</span>
                          {game.eco && (
                            <>
                              <span className="text-border">·</span>
                              <span className="text-primary/70 font-medium">{game.eco}</span>
                            </>
                          )}
                          <span className="text-border">·</span>
                          <span>You: {userRating}</span>
                        </div>
                        {game.opening && (
                          <div className="flex items-center gap-1 mt-1">
                            <BookOpen className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                            <span className="text-xs text-muted-foreground/70 truncate">{game.opening}</span>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                          <Play className="w-3.5 h-3.5 ml-0.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
