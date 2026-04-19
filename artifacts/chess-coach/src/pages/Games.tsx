import React, { useState, useMemo } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { useMyGames } from '@/hooks/use-games';
import { useUser } from '@/hooks/use-user';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Search, Play, Filter, BookOpen, Sparkles, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { GameThumb } from '@/components/GameThumb';

export function Games() {
  const [pageSize, setPageSize] = useState(500);
  const { data, isLoading, isError, error } = useMyGames(pageSize);
  const { username } = useUser();
  const [filter, setFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'chesscom' | 'lichess' | 'chessscout'>('all');
  const [search, setSearch] = useState('');
  const [h2hMode, setH2hMode] = useState(false);
  const [h2hOpponent, setH2hOpponent] = useState('');

  const games = data?.games || [];
  const total = data?.total ?? 0;
  const hasMore = games.length < total;

  const filteredGames = useMemo(() => {
    return games.filter(game => {
      const matchesResult = filter === 'all' || game.result.toLowerCase() === filter.toLowerCase();
      const matchesPlatform = platformFilter === 'all' || (game.platform || 'chesscom') === platformFilter;

      if (h2hMode && h2hOpponent.trim()) {
        const opp = h2hOpponent.trim().toLowerCase();
        const isH2h =
          (game.whiteUsername.toLowerCase() === opp || game.blackUsername.toLowerCase() === opp);
        if (!isH2h) return false;
      }

      const q = search.toLowerCase();
      const matchesSearch = !q || [
        game.whiteUsername, game.blackUsername, game.opening ?? '',
      ].some(s => s.toLowerCase().includes(q));
      return matchesResult && matchesSearch && matchesPlatform;
    });
  }, [games, filter, platformFilter, search, h2hMode, h2hOpponent]);

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
        <Link href="/import" className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors">
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
      <PageHero piece="♜" title="My Games" subtitle="View and replay your imported chess games." />

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
        <button
          onClick={() => { setH2hMode(!h2hMode); setH2hOpponent(''); }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors shrink-0',
            h2hMode ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <Users className="w-4 h-4" />
          H2H
        </button>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value as 'all' | 'chesscom' | 'lichess' | 'chessscout')}
          className="px-4 py-2.5 bg-secondary/50 border border-border rounded-xl outline-none focus:border-primary appearance-none cursor-pointer text-sm"
        >
          <option value="all">All Platforms</option>
          <option value="chesscom">Chess.com</option>
          <option value="lichess">Lichess</option>
          <option value="chessscout">ChessScout Live</option>
        </select>
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

      {h2hMode && (
        <div className="glass-card rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Users className="w-4 h-4 text-primary shrink-0 hidden sm:block" />
          <span className="text-xs text-muted-foreground shrink-0">Head-to-Head vs:</span>
          <input
            type="text"
            value={h2hOpponent}
            onChange={e => setH2hOpponent(e.target.value)}
            placeholder="Opponent username…"
            className="flex-1 px-3 py-2 bg-secondary/70 border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
          />
          {h2hOpponent.trim() && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-400 font-bold">
                W: {filteredGames.filter(g => g.result === 'win').length}
              </span>
              <span className="text-muted-foreground font-bold">
                D: {filteredGames.filter(g => g.result === 'draw').length}
              </span>
              <span className="text-red-400 font-bold">
                L: {filteredGames.filter(g => g.result === 'loss').length}
              </span>
            </div>
          )}
        </div>
      )}

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
        <>
        <div className="text-xs text-muted-foreground text-right">
          Showing {games.length} of {total} games
        </div>
        <div className="space-y-2">
          {filteredGames.map((game, i) => {
            const color = getPlayerColor(game);
            const opponent = getOpponent(game);
            const userRating = getUserRating(game);
            const opponentRating = getOpponentRating(game);
            const reviewed = game.reviewed;

            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                key={game.id}
              >
                <Link href={`/games/${game.id}`}>
                  <div className="glass-card rounded-xl p-3.5 border border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <GameThumb pgn={game.pgn} userColor={color} size={56} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm truncate">vs {opponent}</span>
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
                          {(() => {
                            const plat = (game.platform || 'chesscom') as 'lichess' | 'chesscom' | 'chessscout';
                            const cls =
                              plat === 'lichess' ? 'bg-white/10 text-white/70'
                              : plat === 'chessscout' ? 'bg-primary/15 text-primary'
                              : 'bg-emerald-500/10 text-emerald-400/70';
                            const label = plat === 'lichess' ? 'LC' : plat === 'chessscout' ? 'CS' : 'CC';
                            return (
                              <span className={cn(
                                'inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider',
                                cls,
                              )} title={plat === 'chessscout' ? 'ChessScout Live' : plat === 'lichess' ? 'Lichess' : 'Chess.com'}>
                                {label}
                              </span>
                            );
                          })()}
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
                        <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
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
        {hasMore && (
          <button
            onClick={() => setPageSize(p => p + 500)}
            className="w-full py-3 text-sm font-medium text-primary hover:text-primary/80 bg-secondary/50 hover:bg-secondary/70 rounded-xl border border-border transition-colors"
          >
            Load more games ({total - games.length} remaining)
          </button>
        )}
        </>
      )}
    </div>
  );
}
