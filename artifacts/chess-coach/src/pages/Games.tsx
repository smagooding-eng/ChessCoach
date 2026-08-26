import React, { useState, useMemo, useEffect, useRef } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { useMyGames } from '@/hooks/use-games';
import { useMyAnalysisSummary } from '@/hooks/use-analysis';
import { useUser } from '@/hooks/use-user';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Search, Play, Filter, BookOpen, Sparkles, Users, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { GameThumb } from '@/components/GameThumb';
import { UpgradeNudge } from '@/components/UpgradeNudge';
import { Import } from '@/pages/Import';
import { Analysis } from '@/pages/Analysis';

export function Games() {
  const [tab, setTab] = useState<'games' | 'import' | 'analysis'>('games');
  const [pageSize, setPageSize] = useState(100);
  const [filter, setFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'chesscom' | 'lichess' | 'chessscout'>('all');
  const [search, setSearch] = useState('');
  const [h2hMode, setH2hMode] = useState(false);
  const [h2hOpponent, setH2hOpponent] = useState('');

  // Debounce the H2H opponent text field so we're not firing a request on
  // every keystroke.
  const [debouncedH2hOpponent, setDebouncedH2hOpponent] = useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedH2hOpponent(h2hOpponent.trim()), 350);
    return () => clearTimeout(t);
  }, [h2hOpponent]);

  // Platform and H2H-opponent filtering happen server-side now, across the
  // user's FULL game history — not just whatever page is currently loaded.
  // Previously these only filtered the already-fetched subset, so e.g. an
  // H2H record against someone you'd played 20 times could silently show
  // "3 games" if only 3 of those happened to be within the most recently
  // loaded batch.
  const { data, isLoading, isError, error } = useMyGames(pageSize, {
    platform: platformFilter === 'all' ? undefined : platformFilter,
    opponent: h2hMode && debouncedH2hOpponent ? debouncedH2hOpponent : undefined,
  });
  const { username } = useUser();
  const { data: summary } = useMyAnalysisSummary();
  const queryClient = useQueryClient();

  const games = data?.games || [];
  const total = data?.total ?? 0;
  const hasMore = games.length < total;
  const reviewedCount = summary?.reviewedCount ?? 0;
  const unreviewedCount = Math.max(0, total - reviewedCount);
  // Not yet in the generated API client's types (backend added recently) --
  // safe cast rather than waiting on a codegen regen.
  const isViewLimited = (data as any)?.isViewLimited ?? false;
  const viewLimit = (data as any)?.viewLimit ?? null;

  // Bulk review: trigger + poll. The background auto-review tick works
  // through unreviewed games slowly on its own even without this — this
  // button just lets someone trade some temporary slowness for speed.
  const [bulkJobId, setBulkJobId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ reviewedSoFar: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!bulkJobId) return;
    const poll = async () => {
      try {
        const res = await apiFetch(`/api/games/review-all-status/${bulkJobId}`, { credentials: 'include' });
        if (!res.ok) return;
        const status = await res.json() as { status: string; error?: string; reviewedSoFar?: number; total?: number };
        if (typeof status.reviewedSoFar === 'number' && typeof status.total === 'number') {
          setBulkProgress({ reviewedSoFar: status.reviewedSoFar, total: status.total });
        }
        if (status.status === 'done' || status.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (status.status === 'error') setBulkError(status.error ?? 'Review failed');
          setBulkJobId(null);
          queryClient.invalidateQueries();
        }
      } catch {
        // transient network error — keep polling
      }
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [bulkJobId, queryClient]);

  const startBulkReview = async () => {
    setBulkError(null);
    setBulkProgress(null);
    try {
      const res = await apiFetch('/api/games/review-all', { method: 'POST', credentials: 'include' });
      if (!res.ok) { setBulkError('Failed to start review'); return; }
      const { jobId } = await res.json() as { jobId: string };
      setBulkJobId(jobId);
    } catch {
      setBulkError('Failed to start review');
    }
  };

  // Result and free-text search still filter only the currently-loaded page
  // — a full-text search across the entire history would need a dedicated
  // server-side search endpoint, which is a separate task.
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

  if (tab === 'games' && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground text-sm">Loading your games…</p>
      </div>
    );
  }

  if (tab === 'games' && isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/20 border border-destructive/30 flex items-center justify-center">
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

  const getMyHandle = (game: typeof games[0]) =>
    (game.username || username || '').toLowerCase();

  const getPlayerColor = (game: typeof games[0]) => {
    const u = getMyHandle(game);
    if (!u) return null;
    if (game.whiteUsername.toLowerCase() === u) return 'white';
    if (game.blackUsername.toLowerCase() === u) return 'black';
    return null;
  };

  const getOpponent = (game: typeof games[0]) => {
    const u = getMyHandle(game);
    if (game.whiteUsername.toLowerCase() === u) return game.blackUsername;
    if (game.blackUsername.toLowerCase() === u) return game.whiteUsername;
    return game.blackUsername;
  };

  const getUserRating = (game: typeof games[0]) => {
    const u = getMyHandle(game);
    if (game.whiteUsername.toLowerCase() === u) return game.whiteRating;
    if (game.blackUsername.toLowerCase() === u) return game.blackRating;
    return game.whiteRating;
  };

  const getOpponentRating = (game: typeof games[0]) => {
    const u = getMyHandle(game);
    if (game.whiteUsername.toLowerCase() === u) return game.blackRating;
    if (game.blackUsername.toLowerCase() === u) return game.whiteRating;
    return game.blackRating;
  };

  return (
    <div className="space-y-5 px-4 pt-4 md:px-0 md:pt-0 pb-10">
      <PageHero piece="♜" title="My Games" subtitle="Import, review, and analyze your chess games — all in one place." />

      <div className="inline-flex p-1 rounded-xl bg-secondary/50 border border-border/40 gap-1">
        {([
          { key: 'games', label: 'Games' },
          { key: 'import', label: 'Import' },
          { key: 'analysis', label: 'Analysis' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-bold transition-all',
              tab === t.key ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'import' && <Import />}
      {tab === 'analysis' && <Analysis hideHeader />}

      {tab === 'games' && (
      <>
      {unreviewedCount > 0 && (
        <div className="glass-card rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-3 border border-primary/20">
          <Sparkles className="w-4 h-4 text-primary shrink-0 hidden sm:block" />
          <div className="flex-1 min-w-0 text-sm">
            {bulkJobId && bulkProgress ? (
              <span className="text-muted-foreground">
                Reviewing your games… <span className="font-bold text-foreground">{bulkProgress.reviewedSoFar}</span> of <span className="font-bold text-foreground">{bulkProgress.total}</span> done this pass.
              </span>
            ) : bulkJobId ? (
              <span className="text-muted-foreground">Starting review…</span>
            ) : (
              <span className="text-muted-foreground">
                <span className="font-bold text-foreground">{unreviewedCount}</span> of your {total} games {unreviewedCount === 1 ? "hasn't" : "haven't"} been reviewed yet. Reviewed games power weakness detection and personalized courses — a few are reviewed automatically in the background, or review a batch right now.
              </span>
            )}
            {bulkError && <p className="text-destructive text-xs mt-1">{bulkError}</p>}
          </div>
          <button
            onClick={startBulkReview}
            disabled={!!bulkJobId}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold shrink-0 transition-colors',
              bulkJobId ? 'bg-secondary/50 text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', bulkJobId && 'animate-spin')} />
            {bulkJobId ? 'Reviewing…' : 'Review All'}
          </button>
        </div>
      )}

      {isViewLimited && (
        <UpgradeNudge
          headline={`Want to load all ${total.toLocaleString()} of your games?`}
          subtext={`Free plan shows your ${viewLimit} most recent games. Upgrade to Pro now to see your full history.`}
          compact
        />
      )}

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
          <option value="chessscout">ChessScout.net Live</option>
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
                              : 'bg-emerald-500/20 text-emerald-300';
                            const label = plat === 'lichess' ? 'LC' : plat === 'chessscout' ? 'CS' : 'CC';
                            return (
                              <span className={cn(
                                'inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider',
                                cls,
                              )} title={plat === 'chessscout' ? 'ChessScout.net Live' : plat === 'lichess' ? 'Lichess' : 'Chess.com'}>
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
        {hasMore && isViewLimited && games.length >= (viewLimit ?? 20) ? (
          <UpgradeNudge
            headline={`Want to load the other ${total - games.length} games?`}
            subtext={`Free plan shows your ${viewLimit ?? 20} most recent games. Upgrade to Pro now to see your full history.`}
            compact
          />
        ) : hasMore && (
          <button
            onClick={() => setPageSize(p => p + 500)}
            className="w-full py-3 text-sm font-medium text-primary hover:text-primary/80 bg-secondary/50 hover:bg-secondary/70 rounded-xl border border-border transition-colors"
          >
            Load more games ({total - games.length} remaining)
          </button>
        )}
        </>
      )}
      </>
      )}
    </div>
  );
}
