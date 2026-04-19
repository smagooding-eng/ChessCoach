import React, { useMemo } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Play, TrendingUp, TrendingDown, Minus, Swords, Zap, Clock } from 'lucide-react';
import { PageHero } from '@/components/DesignSystem';
import { useLiveHistory, type LiveHistoryGame } from '@/hooks/use-live-history';
import { useLiveRatings } from '@/hooks/use-live-ratings';
import { cn } from '@/lib/utils';

const CHESSCOM_GREEN = '#81b64c';
const RED = '#dc4343';
const TEXT_MUTED = '#9e9b98';

const TC_META: Record<LiveHistoryGame['timeControl'], { label: string; sub: string; icon: React.ComponentType<{ className?: string }> }> = {
  blitz_5_0:  { label: '5 min',  sub: 'Blitz', icon: Zap },
  blitz_5_3:  { label: '5 | 3',  sub: 'Blitz', icon: Zap },
  rapid_10_0: { label: '10 min', sub: 'Rapid', icon: Clock },
};

const TC_ORDER: LiveHistoryGame['timeControl'][] = ['blitz_5_0', 'blitz_5_3', 'rapid_10_0'];

function RatingChart({ points, width = 320, height = 120 }: { points: { rating: number; finishedAt: string }[]; width?: number; height?: number }) {
  if (points.length < 1) return null;
  const padX = 12;
  const padY = 14;
  const ratings = points.map(p => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = Math.max(40, max - min);
  const minR = Math.floor((min + max) / 2 - range / 2);
  const maxR = Math.ceil((min + max) / 2 + range / 2);
  const span = maxR - minR || 1;

  const xFor = (i: number) => points.length === 1
    ? width / 2
    : padX + (i / (points.length - 1)) * (width - padX * 2);
  const yFor = (r: number) => padY + (1 - (r - minR) / span) * (height - padY * 2);

  const polyPoints = points.map((p, i) => `${xFor(i)},${yFor(p.rating)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const trendUp = last.rating >= first.rating;
  const color = trendUp ? CHESSCOM_GREEN : RED;
  const gradId = `liveFill-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* baseline grid */}
      <line x1={padX} x2={width - padX} y1={yFor(minR)} y2={yFor(minR)} stroke="rgba(255,255,255,0.06)" />
      <line x1={padX} x2={width - padX} y1={yFor(maxR)} y2={yFor(maxR)} stroke="rgba(255,255,255,0.06)" />
      <text x={width - padX} y={yFor(maxR) - 2} textAnchor="end" fontSize="9" fill={TEXT_MUTED}>{maxR}</text>
      <text x={width - padX} y={yFor(minR) + 9} textAnchor="end" fontSize="9" fill={TEXT_MUTED}>{minR}</text>
      {points.length >= 2 && (
        <polygon
          points={`${padX},${height - padY} ${polyPoints} ${width - padX},${height - padY}`}
          fill={`url(#${gradId})`}
        />
      )}
      {points.length >= 2 && (
        <polyline
          points={polyPoints}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={xFor(i)}
          cy={yFor(p.rating)}
          r={points.length <= 30 ? 2.5 : 1.5}
          fill={color}
        />
      ))}
    </svg>
  );
}

function TerminationLabel({ termination, result }: { termination: string; result: 'win' | 'loss' | 'draw' }) {
  const map: Record<string, string> = {
    checkmate: 'Checkmate',
    resignation: 'Resignation',
    timeout: 'Timeout',
    stalemate: 'Stalemate',
    draw_repetition: 'Repetition',
    draw_50: '50-move rule',
    draw_insufficient: 'Insufficient material',
    draw_agreement: 'Draw agreed',
    abandoned: 'Abandoned',
  };
  return <span className="text-muted-foreground/70">{map[termination] ?? termination} · {result}</span>;
}

export function LiveHistory() {
  const { data, isLoading, isError } = useLiveHistory(500);
  const { data: ratingsData } = useLiveRatings();
  const games: LiveHistoryGame[] = data?.games ?? [];

  // Build chronological rating progression per time control (rankedonly + ratingAfter present)
  const seriesByTc = useMemo(() => {
    const out: Record<string, { rating: number; finishedAt: string }[]> = {
      blitz_5_0: [], blitz_5_3: [], rapid_10_0: [],
    };
    // games come back DESC by finishedAt; reverse to get chronological order
    for (const g of [...games].reverse()) {
      if (g.ratingAfter == null) continue;
      out[g.timeControl]?.push({ rating: g.ratingAfter, finishedAt: g.finishedAt });
    }
    return out;
  }, [games]);

  const summary = useMemo(() => {
    const out: Record<string, { w: number; l: number; d: number }> = {
      blitz_5_0: { w: 0, l: 0, d: 0 },
      blitz_5_3: { w: 0, l: 0, d: 0 },
      rapid_10_0: { w: 0, l: 0, d: 0 },
    };
    for (const g of games) {
      const s = out[g.timeControl];
      if (!s) continue;
      if (g.result === 'win') s.w++;
      else if (g.result === 'loss') s.l++;
      else s.d++;
    }
    return out;
  }, [games]);

  return (
    <div className="space-y-5 px-4 pt-4 md:px-0 md:pt-0 pb-10">
      <PageHero piece="♞" title="ChessScout Live" subtitle="Your live match history and rating progression by time control." />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/live" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 transition-colors">
          <Swords className="w-3.5 h-3.5" /> Play Live
        </Link>
        <Link href="/games" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-secondary/60 text-muted-foreground hover:text-foreground border border-border transition-colors">
          All games
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TC_ORDER.map(tcId => {
          const meta = TC_META[tcId];
          const Icon = meta.icon;
          const series = seriesByTc[tcId];
          const live = ratingsData?.ratings?.[tcId];
          const sum = summary[tcId];
          const first = series[0]?.rating ?? null;
          const last = series[series.length - 1]?.rating ?? null;
          const delta = first != null && last != null ? last - first : 0;
          const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
          const trendColor = delta > 0 ? CHESSCOM_GREEN : delta < 0 ? RED : TEXT_MUTED;

          return (
            <div key={tcId} className="glass-card rounded-xl p-3.5 border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold leading-tight">{meta.label}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{meta.sub}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black tabular-nums leading-tight">
                    {live ? live.rating : (last ?? '—')}
                    {live?.isProvisional && <span className="text-[9px] font-bold text-muted-foreground ml-0.5">?</span>}
                  </div>
                  {series.length >= 2 && (
                    <div className="flex items-center justify-end gap-0.5 text-[10px] font-bold tabular-nums" style={{ color: trendColor }}>
                      <TrendIcon className="w-3 h-3" />
                      {delta > 0 ? '+' : ''}{delta}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-[120px] -mx-1">
                {series.length >= 1 ? (
                  <RatingChart points={series} />
                ) : (
                  <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
                    No ranked games yet
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] font-bold tabular-nums">
                <span className="text-muted-foreground">{sum.w + sum.l + sum.d} games</span>
                <span className="flex items-center gap-2">
                  <span className="text-emerald-400">W {sum.w}</span>
                  <span className="text-muted-foreground">D {sum.d}</span>
                  <span className="text-red-400">L {sum.l}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-9 h-9 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-sm">Loading live games…</p>
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Failed to load live games. Please try again.</div>
      ) : games.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground mb-3">No live games yet.</div>
          <Link href="/live" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors">
            <Swords className="w-4 h-4" /> Play your first match
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((g, i) => {
            const meta = TC_META[g.timeControl];
            const ratingDelta = g.ratingBefore != null && g.ratingAfter != null ? g.ratingAfter - g.ratingBefore : null;
            const deltaColor = ratingDelta == null ? TEXT_MUTED : ratingDelta > 0 ? CHESSCOM_GREEN : ratingDelta < 0 ? RED : TEXT_MUTED;
            const row = (
              <div className="glass-card rounded-xl p-3.5 border border-white/5 hover:bg-white/[0.03] transition-colors group">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black uppercase shrink-0',
                    g.result === 'win' ? 'bg-emerald-500/15 text-emerald-400'
                    : g.result === 'loss' ? 'bg-red-500/15 text-red-400'
                    : 'bg-slate-500/15 text-slate-400'
                  )}>
                    {g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : 'D'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm truncate">vs {g.opponentUsername}</span>
                      {g.opponentRating != null && (
                        <span className="text-xs text-muted-foreground">({g.opponentRating})</span>
                      )}
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-primary/15 text-primary">
                        {meta.label}
                      </span>
                      <span className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
                        g.mode === 'ranked' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/5 text-muted-foreground'
                      )}>
                        {g.mode}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{format(new Date(g.finishedAt), 'MMM d, yyyy · HH:mm')}</span>
                      <span className="text-border">·</span>
                      <span className="capitalize">{g.color}</span>
                      <span className="text-border">·</span>
                      <TerminationLabel termination={g.termination} result={g.result} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {g.ratingAfter != null ? (
                      <div className="text-sm font-black tabular-nums">{g.ratingAfter}</div>
                    ) : (
                      <div className="text-sm text-muted-foreground">—</div>
                    )}
                    {ratingDelta != null && g.mode === 'ranked' && (
                      <div className="text-[10px] font-bold tabular-nums" style={{ color: deltaColor }}>
                        {ratingDelta > 0 ? '+' : ''}{ratingDelta}
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
            );
            return (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.25) }}
              >
                {g.gamesId != null ? (
                  <Link href={`/games/${g.gamesId}`} className="block cursor-pointer">{row}</Link>
                ) : (
                  <div className="opacity-90">{row}</div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
