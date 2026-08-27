import React, { useEffect, useRef, useState } from 'react';
import { PageHero, PRIMARY_BTN_STYLE, StatReadout, t } from '@/components/DesignSystem';
import { UpgradeNudge } from '@/components/UpgradeNudge';
import { trackBackgroundJob } from '@/components/BackgroundJobsWatcher';
import { useLocation } from 'wouter';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useUser } from '@/hooks/use-user';
import { useQueryClient } from '@tanstack/react-query';
import { Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BrainCircuit, AlertTriangle, Activity, ChevronRight, ChevronDown, Loader2, TrendingUp, CheckCircle2, ArrowUpRight, BookOpen, Trophy, Target, Brain, Clock, Shield, Zap, Eye, LineChart } from 'lucide-react';
import { motion } from 'framer-motion';
import { Chessboard } from 'react-chessboard';
import { getTierForRating, ELO_TIERS } from '@/lib/elo-tips';
import { apiFetch } from '@/lib/api';

const CHESSCOM_GREEN = '#81b64c';
const BG_CARD = 'linear-gradient(180deg, #383532 0%, #2a2825 100%)';
const BG_CARD_FLAT = '#302e2b';
const BG_CARD_HOVER = '#3a3733';
const BG_DARK = '#262421';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const CARD_SHADOW = '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)';
const CARD_BORDER = '1px solid rgba(129,182,76,0.08)';
const PIE_COLORS = [CHESSCOM_GREEN, '#dc4343', '#6b6966'];

export function Analysis({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const [, navigate] = useLocation();
  const { username, authUser, isPremium } = useUser();
  const queryClient = useQueryClient();
  const { data: summary, isLoading: loadingSummary } = useMyAnalysisSummary();
  const { data: weaknessesData, isLoading: loadingWeaknesses } = useMyWeaknesses();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [tipsExpanded, setTipsExpanded] = useState(false);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollJob = (jobId: string) => {
    trackBackgroundJob('analysis', jobId);
    return new Promise<void>((resolve, reject) => {
      intervalRef.current = setInterval(async () => {
        if (!mountedRef.current) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          resolve();
          return;
        }
        try {
          const pollRes = await apiFetch(`/api/analysis/status/${jobId}`, { cache: 'no-store' });
          if (pollRes.status === 304) return;
          if (!pollRes.ok) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            reject(new Error(`Poll error (${pollRes.status})`));
            return;
          }
          const job = await pollRes.json() as { status: string; error?: string };
          if (job.status === 'done') {
            if (intervalRef.current) clearInterval(intervalRef.current);
            resolve();
          } else if (job.status === 'error') {
            if (intervalRef.current) clearInterval(intervalRef.current);
            reject(new Error(job.error || 'Analysis failed. Please try again.'));
          }
        } catch (err) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          reject(err);
        }
      }, 3000);
    });
  };

  const resumePolling = async (jobId: string) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setStatusMsg('Analysis in progress… this may take 30–60 seconds');
    try {
      await pollJob(jobId);
      if (!mountedRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ['/api/analysis/weaknesses'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/analysis/summary'] });
      setStatusMsg('');
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setAnalyzeError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      if (mountedRef.current) {
        setIsAnalyzing(false);
        setStatusMsg('');
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    apiFetch('/api/analysis/active-job', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { job: null })
      .then((data: { job?: { id: string; status: string; error?: string } | null }) => {
        if (!mountedRef.current || !data.job) return;
        if (data.job.status === 'pending') {
          resumePolling(data.job.id);
        } else if (data.job.status === 'done') {
          queryClient.invalidateQueries({ queryKey: ['/api/analysis/weaknesses'] });
          queryClient.invalidateQueries({ queryKey: ['/api/analysis/summary'] });
        }
      })
      .catch(() => {});

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleAnalyze = async () => {
    const analysisUsername = username ?? authUser?.lichessUsername ?? null;
    if (!analysisUsername || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalyzeError(null);
    setStatusMsg('Starting deep analysis…');

    try {
      const startRes = await apiFetch('/api/analysis/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: analysisUsername }),
      });
      if (!startRes.ok) {
        const j = await startRes.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((j.error as string) || `Server error (${startRes.status})`);
      }
      const { jobId } = await startRes.json() as { jobId: string };

      if (!mountedRef.current) return;
      setStatusMsg('Analyzing your games… this may take 30–60 seconds');

      await pollJob(jobId);

      if (!mountedRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ['/api/analysis/weaknesses'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/analysis/summary'] });
      setStatusMsg('');
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setAnalyzeError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      if (mountedRef.current) {
        setIsAnalyzing(false);
        setStatusMsg('');
      }
    }
  };

  const pieData = summary ? [
    { name: 'Wins', value: summary.wins },
    { name: 'Losses', value: summary.losses },
    { name: 'Draws', value: summary.draws },
  ] : [];

  const openingData = summary?.openingStats?.slice(0, 5).map(o => {
    const words = o.opening.split(' ');
    const short = words.length > 4 ? words.slice(0, 4).join(' ') + '…' : o.opening;
    return {
      name: short,
      fullName: o.opening,
      games: o.games,
      winRate: Math.round((o.wins / o.games) * 100),
    };
  }) || [];

  return (
    <div className="space-y-5 pb-10 px-3 pt-3 md:px-0 md:pt-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-stretch gap-4">
        <div className="flex-1 min-w-0">
          {!hideHeader && (
            <PageHero piece="♚" title="Deep Analysis" subtitle="Our coach engine processes all your games to detect recurring patterns, blunders, and strategic leaks." />
          )}
        </div>
        <div className="flex items-center">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="shrink-0 px-5 py-2.5 rounded-xl font-semibold text-sm text-white flex items-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
            style={PRIMARY_BTN_STYLE}
          >
            {isAnalyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
            ) : (
              <><Activity className="w-4 h-4" /> Run Deep Analysis</>
            )}
          </button>
        </div>
      </div>

      {!isPremium && (
        <UpgradeNudge headline="Upgrade to Pro to run deep analysis" compact />
      )}

      {isAnalyzing && statusMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl flex items-center gap-3 text-sm"
          style={{ background: 'rgba(129,182,76,0.08)', border: '1px solid rgba(129,182,76,0.2)', color: CHESSCOM_GREEN }}
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{statusMsg}</span>
        </motion.div>
      )}

      {analyzeError && analyzeError.includes('Not enough reviewed games') && (
        <UpgradeNudge
          headline="Review a few more games to unlock your weakness report"
          subtext="Free plan shows patterns from games you've already reviewed. Upgrade to Pro for full AI analysis anytime, no review requirement."
        />
      )}

      {analyzeError && !analyzeError.includes('Not enough reviewed games') && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl flex items-center gap-2 text-sm"
          style={{ background: 'rgba(220,67,67,0.35)', border: '1px solid rgba(220,67,67,0.6)', color: '#ffffff' }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {analyzeError}
        </motion.div>
      )}

      {(loadingSummary || loadingWeaknesses) && !isAnalyzing ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: CHESSCOM_GREEN, borderTopColor: 'transparent' }} />
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl p-4" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold" style={{ color: TEXT_LIGHT }}>Performance Breakdown</h2>
                <span className="text-[11px] font-bold" style={{ color: TEXT_MUTED }}>
                  <span style={{ color: TEXT_LIGHT }}>{summary.totalGames.toLocaleString()}</span> games
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative w-28 h-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={54}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: BG_DARK, border: 'none', borderRadius: '8px', color: TEXT_LIGHT }}
                        itemStyle={{ color: TEXT_LIGHT }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-semibold leading-none" style={{ color: CHESSCOM_GREEN, letterSpacing: '-0.02em' }}>
                      {Math.round((summary.wins / Math.max(summary.totalGames, 1)) * 100)}%
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] mt-0.5" style={{ color: TEXT_MUTED }}>Win</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Wins', value: summary.wins, color: CHESSCOM_GREEN },
                    { label: 'Losses', value: summary.losses, color: '#dc4343' },
                    { label: 'Draws', value: summary.draws, color: '#6b6966' },
                    {
                      label: 'W : L',
                      value: summary.losses > 0
                        ? (summary.wins / summary.losses).toFixed(2)
                        : summary.wins > 0 ? '∞' : '—',
                      color: TEXT_LIGHT,
                    },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: TEXT_MUTED }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>
                        {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
              <h2 className="text-lg font-bold mb-4" style={{ color: TEXT_LIGHT }}>Top Openings Win Rate</h2>
              <div className="space-y-2">
                {openingData.map((o, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => navigate(`/openings/${encodeURIComponent(o.fullName)}`)}
                    className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer group transition-colors"
                    style={{ background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="text-xs w-[110px] sm:w-[140px] shrink-0 truncate font-medium" style={{ color: TEXT_MUTED }}>
                      {o.name}
                    </span>
                    <div className="flex-1 h-4 rounded overflow-hidden relative" style={{ background: BG_DARK }}>
                      <div
                        className="h-full rounded transition-all"
                        style={{ width: `${o.winRate}%`, background: CHESSCOM_GREEN, opacity: 0.8 }}
                      />
                    </div>
                    <span className="text-xs font-bold w-10 text-right shrink-0" style={{ color: o.winRate >= 60 ? CHESSCOM_GREEN : o.winRate >= 45 ? '#eac133' : '#dc4343' }}>
                      {o.winRate}%
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: TEXT_MUTED }} />
                  </motion.div>
                ))}
                {openingData.length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: TEXT_MUTED }}>No opening data yet</p>
                )}
              </div>
            </div>
          </div>

          {summary.totalGames > 0 && (() => {
            const totalDecided = summary.wins + summary.losses + summary.draws;
            const winPct = totalDecided > 0 ? Math.round((summary.wins / totalDecided) * 100) : 0;
            const topWeakness = weaknessesData?.weaknesses?.length
              ? [...weaknessesData.weaknesses].sort((a, b) => {
                  const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
                  return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
                })[0]
              : null;
            return (
              <div className="rounded-xl overflow-hidden" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
                <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                  <div>
                    <p className={t.eyebrow} style={{ color: TEXT_MUTED }}>Scouting report</p>
                    <h2 className="font-display text-lg font-semibold mt-0.5" style={{ color: TEXT_LIGHT }}>
                      {username ?? 'Your'} — {summary.totalGames} games analyzed
                    </h2>
                    {topWeakness && (
                      <p className="text-sm mt-1.5" style={{ color: TEXT_MUTED }}>
                        Your biggest opportunity right now:{' '}
                        <span className="font-semibold" style={{ color: TEXT_LIGHT }}>{topWeakness.category}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                    <div className="flex gap-4">
                      <StatReadout value={summary.wins} label="Wins" tone="positive" />
                      <StatReadout value={summary.losses} label="Losses" tone="negative" />
                      <StatReadout value={summary.draws} label="Draws" />
                      <StatReadout value={summary.avgRating || '—'} label="Avg Rating" />
                    </div>
                  </div>
                </div>
                {totalDecided > 0 && (
                  <div className="px-5 pb-4">
                    <div className="flex w-full h-2 rounded-full overflow-hidden gap-0.5" style={{ background: BG_DARK }}>
                      <div className="rounded-l-full" style={{ width: `${(summary.wins / totalDecided) * 100}%`, background: CHESSCOM_GREEN }} />
                      <div style={{ width: `${(summary.draws / totalDecided) * 100}%`, background: 'rgba(255,255,255,0.15)' }} />
                      <div className="rounded-r-full" style={{ width: `${(summary.losses / totalDecided) * 100}%`, background: '#c1493d' }} />
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: TEXT_MUTED }}>{winPct}% win rate</p>
                  </div>
                )}
              </div>
            );
          })()}

          {weaknessesData?.weaknesses && weaknessesData.weaknesses.length > 0 && (() => {
            const sevCounts = {
              Critical: weaknessesData.weaknesses.filter(w => w.severity === 'Critical').length,
              High:     weaknessesData.weaknesses.filter(w => w.severity === 'High').length,
              Medium:   weaknessesData.weaknesses.filter(w => w.severity === 'Medium').length,
              Low:      weaknessesData.weaknesses.filter(w => w.severity === 'Low').length,
            };
            const total = weaknessesData.weaknesses.length;
            const sevRows: Array<{ key: keyof typeof sevCounts; color: string; bg: string; icon: typeof Zap }> = [
              { key: 'Critical', color: '#dc4343', bg: 'rgba(220,67,67,0.15)',   icon: Zap            },
              { key: 'High',     color: '#ea9733', bg: 'rgba(234,151,51,0.15)',  icon: AlertTriangle  },
              { key: 'Medium',   color: '#6da5d8', bg: 'rgba(109,165,216,0.15)', icon: Shield         },
              { key: 'Low',      color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', icon: Eye            },
            ];
            const catMap = new Map<string, number>();
            weaknessesData.weaknesses.forEach(w => catMap.set(w.category, (catMap.get(w.category) ?? 0) + 1));
            const topCats = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
            const topCount = topCats[0]?.[1] ?? 1;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                <div className="rounded-xl p-5" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
                      <Brain className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                      Severity Breakdown
                    </h2>
                    <span className="text-[11px] font-bold" style={{ color: TEXT_MUTED }}>
                      <span style={{ color: TEXT_LIGHT }}>{total}</span> issues
                    </span>
                  </div>
                  {/* Stacked composite bar */}
                  <div className="flex w-full h-3 rounded-full overflow-hidden mb-3" style={{ background: BG_DARK }}>
                    {sevRows.map(r => sevCounts[r.key] > 0 && (
                      <div
                        key={r.key}
                        title={`${r.key}: ${sevCounts[r.key]}`}
                        style={{ width: `${(sevCounts[r.key] / total) * 100}%`, background: r.color }}
                      />
                    ))}
                  </div>
                  <div className="space-y-2">
                    {sevRows.map(r => {
                      const c = sevCounts[r.key];
                      const Icon = r.icon;
                      const pct = total > 0 ? Math.round((c / total) * 100) : 0;
                      return (
                        <div key={r.key} className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1.5 w-24 shrink-0 text-xs font-bold" style={{ color: r.color }}>
                            <Icon className="w-3.5 h-3.5" />
                            {r.key}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: BG_DARK }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: r.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.7, ease: 'easeOut' }}
                            />
                          </div>
                          <span className="text-xs font-bold tabular-nums w-10 text-right" style={{ color: TEXT_LIGHT }}>{c}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl p-5" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
                      <Target className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                      Top Weakness Areas
                    </h2>
                    <span className="text-[11px] font-bold" style={{ color: TEXT_MUTED }}>By count</span>
                  </div>
                  <div className="space-y-2.5">
                    {topCats.map(([cat, n], idx) => {
                      const Icon = cat.includes('Endgame') ? Trophy
                        : cat.includes('Opening') ? BookOpen
                        : cat.includes('Tactic') ? Target
                        : cat.includes('Time') ? Clock
                        : cat.includes('Defense') ? Shield
                        : Brain;
                      return (
                        <motion.div
                          key={cat}
                          initial={{ opacity: 0, x: 6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="flex items-center gap-3"
                        >
                          <div className="flex items-center gap-2 w-[140px] shrink-0 min-w-0">
                            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: CHESSCOM_GREEN }} />
                            <span className="text-xs font-medium truncate" style={{ color: TEXT_LIGHT }}>{cat}</span>
                          </div>
                          <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: BG_DARK }}>
                            <motion.div
                              className="h-full rounded"
                              style={{ background: CHESSCOM_GREEN, opacity: 0.8 }}
                              initial={{ width: 0 }}
                              animate={{ width: `${(n / topCount) * 100}%` }}
                              transition={{ duration: 0.7, delay: idx * 0.05, ease: 'easeOut' }}
                            />
                          </div>
                          <span className="text-xs font-bold tabular-nums w-6 text-right" style={{ color: TEXT_LIGHT }}>{n}</span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {summary?.phaseAccuracy && summary.phaseAccuracy.gamesAnalyzed > 0 && (() => {
            const pa = summary.phaseAccuracy;
            const phases: Array<{ key: 'opening' | 'middlegame' | 'endgame'; label: string; icon: typeof BookOpen }> = [
              { key: 'opening',    label: 'Opening',    icon: BookOpen },
              { key: 'middlegame', label: 'Middlegame', icon: Brain },
              { key: 'endgame',    label: 'Endgame',    icon: Trophy },
            ];
            const accColor = (acc: number) =>
              acc >= 85 ? '#10b981' :
              acc >= 70 ? CHESSCOM_GREEN :
              acc >= 55 ? '#ea9733' :
              acc >= 40 ? '#f97316' : '#dc4343';
            return (
              <div className="rounded-xl p-5 mt-4" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
                    <LineChart className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                    Accuracy by Game Phase
                  </h2>
                  <span className="text-[11px] font-bold" style={{ color: TEXT_MUTED }}>
                    From <span style={{ color: TEXT_LIGHT }}>{pa.gamesAnalyzed}</span> reviewed game{pa.gamesAnalyzed === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {phases.map((p, idx) => {
                    const stat = pa[p.key];
                    const Icon = p.icon;
                    const color = stat.moves > 0 ? accColor(stat.accuracy) : TEXT_MUTED;
                    return (
                      <motion.div
                        key={p.key}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        className="rounded-lg p-4"
                        style={{ background: BG_CARD_FLAT, border: CARD_BORDER }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: TEXT_LIGHT }}>{p.label}</span>
                          </div>
                          <span className="text-[10px] font-bold tabular-nums" style={{ color: TEXT_MUTED }}>
                            {stat.moves} move{stat.moves === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5 mb-2">
                          <span className="text-3xl font-semibold tabular-nums" style={{ color }}>
                            {stat.moves > 0 ? stat.accuracy : '—'}
                          </span>
                          {stat.moves > 0 && (
                            <span className="text-sm font-bold" style={{ color }}>%</span>
                          )}
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: BG_DARK }}>
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${stat.moves > 0 ? stat.accuracy : 0}%` }}
                            transition={{ duration: 0.7, delay: idx * 0.06, ease: 'easeOut' }}
                          />
                        </div>
                        <div className="flex justify-between gap-1.5 text-[10px] font-bold tabular-nums">
                          {stat.bestOrBetter > 0 && <span className="text-cyan-400">+{stat.bestOrBetter}</span>}
                          {stat.inaccuracies > 0 && <span className="text-yellow-400">{stat.inaccuracies}?!</span>}
                          {stat.mistakes > 0 && <span className="text-orange-400">{stat.mistakes}?</span>}
                          {stat.blunders > 0 && <span className="text-rose-400">{stat.blunders}??</span>}
                          {stat.moves === 0 && <span style={{ color: TEXT_MUTED }}>No moves yet</span>}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
            <AlertTriangle className="w-5 h-5" style={{ color: '#ea9733' }} /> Identified Weaknesses
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {weaknessesData?.weaknesses?.map((weakness, i) => {
              const sevColor = weakness.severity === 'Critical' ? '#dc4343'
                : weakness.severity === 'High' ? '#ea9733'
                : weakness.severity === 'Medium' ? '#6da5d8'
                : '#94a3b8';
              const sevBg = weakness.severity === 'Critical' ? 'rgba(220,67,67,0.15)'
                : weakness.severity === 'High' ? 'rgba(234,151,51,0.15)'
                : weakness.severity === 'Medium' ? 'rgba(109,165,216,0.15)'
                : 'rgba(148,163,184,0.15)';
              const SevIcon = weakness.severity === 'Critical' ? Zap
                : weakness.severity === 'High' ? AlertTriangle
                : weakness.severity === 'Medium' ? Shield
                : Eye;
              const CategoryIcon = weakness.category.includes('Endgame') ? Trophy
                : weakness.category.includes('Opening') ? BookOpen
                : weakness.category.includes('Tactic') ? Target
                : weakness.category.includes('Time') ? Clock
                : weakness.category.includes('Defense') ? Shield
                : Brain;
              const pct = Math.round(weakness.frequency * 100);
              return (
                <motion.div
                  key={weakness.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => navigate(`/analysis/${weakness.id}`)}
                  className="rounded-xl p-5 cursor-pointer group transition-all relative overflow-hidden"
                  style={{
                    background: BG_CARD,
                    borderLeft: `3px solid ${sevColor}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                  onMouseLeave={e => (e.currentTarget.style.background = BG_CARD)}
                >
                  {/* Decorative severity glow */}
                  <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.07] pointer-events-none" style={{ background: sevColor }} />

                  <div className="flex justify-between items-start mb-3 relative">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl shrink-0" style={{ background: sevBg, border: `1px solid ${sevColor}40` }}>
                        <CategoryIcon className="w-4 h-4" style={{ color: sevColor }} />
                      </div>
                      <h3 className="text-base font-bold transition-colors truncate" style={{ color: TEXT_LIGHT }}>{weakness.category}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{ background: sevColor, color: '#ffffff' }}>
                        <SevIcon className="w-3 h-3" />
                        {weakness.severity}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: TEXT_MUTED }} />
                    </div>
                  </div>

                  <div className="flex gap-3 mb-4">
                    {weakness.previewFen && (
                      <div className="shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden border pointer-events-none" style={{ borderColor: `${sevColor}40` }}>
                        <Chessboard
                          options={{
                            position: weakness.previewFen,
                            allowDragging: false,
                            boardStyle: { borderRadius: 0 },
                            darkSquareStyle: { backgroundColor: '#b58863' },
                            lightSquareStyle: { backgroundColor: '#f0d9b5' },
                            showNotation: false,
                            animationDurationInMs: 0,
                          }}
                        />
                      </div>
                    )}
                    <p className="text-sm line-clamp-3 flex-1 min-w-0" style={{ color: TEXT_MUTED }}>{weakness.description}</p>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: BG_DARK }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: sevColor }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.2 + i * 0.05, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums" style={{ color: sevColor }}>{pct}%</span>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/puzzles?weakness=${encodeURIComponent(weakness.category)}`); }}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors relative"
                    style={{ background: CHESSCOM_GREEN, color: '#000', border: 'none' }}
                  >
                    <Target className="w-3.5 h-3.5" />
                    Practice puzzles for this
                  </button>

                  <div className="mt-3 pt-3 flex items-center justify-between text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: CHESSCOM_GREEN }}>View examples & courses</span>
                    <ChevronRight className="w-3 h-3" style={{ color: CHESSCOM_GREEN }} />
                  </div>
                </motion.div>
              );
            })}

            {!weaknessesData?.weaknesses?.length && (
              <div className="col-span-full text-center py-10 rounded-xl text-sm" style={{ border: '1px dashed rgba(255,255,255,0.1)', color: TEXT_MUTED }}>
                Run an analysis to discover your weaknesses and build a personalized plan.
              </div>
            )}
          </div>
          {summary.avgRating > 0 && (() => {
            const tier = getTierForRating(summary.avgRating);
            const tierIdx = ELO_TIERS.indexOf(tier);
            const nextTier = ELO_TIERS[tierIdx + 1];
            const progress = nextTier
              ? Math.min(100, Math.round(((summary.avgRating - tier.min) / (tier.max - tier.min)) * 100))
              : 100;
            return (
              <div className="rounded-xl overflow-hidden" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
                <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center gap-2.5">
                    <TrendingUp className="w-5 h-5" style={{ color: CHESSCOM_GREEN }} />
                    <div>
                      <h2 className="text-lg font-bold" style={{ color: TEXT_LIGHT }}>Level Up Tips</h2>
                      <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                        Based on your average rating of <span className="font-bold" style={{ color: TEXT_LIGHT }}>{summary.avgRating}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className={`px-2.5 py-1 rounded-xl text-xs font-bold ${tier.bgColor} ${tier.color} border ${tier.borderColor}`}>
                      {tier.icon} {tier.label}
                    </div>
                    {nextTier && (
                      <>
                        <ArrowUpRight className="w-3.5 h-3.5" style={{ color: TEXT_MUTED }} />
                        <div className={`px-2.5 py-1 rounded-xl text-xs font-bold ${nextTier.bgColor} ${nextTier.color} border ${nextTier.borderColor} opacity-60`}>
                          {nextTier.icon} {nextTier.label}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setTipsExpanded(v => !v)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-white/5 shrink-0"
                    aria-label={tipsExpanded ? "Collapse tips" : "Expand tips"}
                  >
                    <ChevronDown className="w-4 h-4 transition-transform" style={{ color: TEXT_MUTED, transform: tipsExpanded ? 'rotate(180deg)' : 'none' }} />
                  </button>
                </div>

                {tipsExpanded && (
                  <>
                {nextTier && (
                  <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
                    <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: TEXT_MUTED }}>
                      <span>{tier.range}</span>
                      <span>{nextTier.range}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: BG_DARK }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: CHESSCOM_GREEN }}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: TEXT_MUTED }}>
                      <span className="font-bold" style={{ color: CHESSCOM_GREEN }}>{tier.max - summary.avgRating}</span> rating points to {nextTier.label}
                    </p>
                  </div>
                )}

                <div className="px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(158,155,152,0.5)' }}>
                    Tips to reach {tier.nextTier}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {tier.tips.map((tip, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="flex gap-2.5 p-3 rounded-xl transition-colors"
                        style={{ background: 'rgba(255,255,255,0.03)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: CHESSCOM_GREEN }} />
                        <p className="text-sm leading-relaxed" style={{ color: 'rgba(232,230,227,0.8)' }}>{tip}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
                  </>
                )}
              </div>
            );
          })()}

          {summary.monthlyTrend && summary.monthlyTrend.length > 0 && summary.monthlyTrend.some(p => p.games > 0) && (() => {
            const trendData = summary.monthlyTrend!.map(p => {
              const [y, m] = p.month.split('-');
              const monthName = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-US', { month: 'short' });
              return { ...p, label: monthName, winPct: Math.round((p.winRate || 0) * 100) };
            });
            return (
              <div className="rounded-xl p-5" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
                    <LineChart className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                    Last 6 Months
                  </h2>
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: TEXT_MUTED }}>Win rate trend</span>
                </div>
                <div className="h-44 -ml-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="winGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHESSCOM_GREEN} stopOpacity={0.55} />
                          <stop offset="100%" stopColor={CHESSCOM_GREEN} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: TEXT_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: TEXT_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={32} unit="%" />
                      <RechartsTooltip
                        contentStyle={{ background: BG_DARK, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: TEXT_LIGHT, fontSize: 12 }}
                        labelStyle={{ color: TEXT_MUTED, fontWeight: 700 }}
                        formatter={(value: number, _key, item: any) => {
                          const p = item?.payload;
                          if (!p) return [`${value}%`, 'Win rate'];
                          return [`${value}% (${p.wins}W / ${p.losses}L / ${p.draws}D · ${p.games} games)`, 'Win rate'];
                        }}
                      />
                      <Area type="monotone" dataKey="winPct" stroke={CHESSCOM_GREEN} strokeWidth={2.5} fill="url(#winGradient)" dot={{ r: 3, fill: CHESSCOM_GREEN, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          {summary.accuracyTrend && summary.accuracyTrend.length > 0 && (() => {
            const accData = summary.accuracyTrend!.map(p => {
              const [y, m] = p.month.split('-');
              const monthName = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-US', { month: 'short' });
              return { ...p, label: monthName };
            });
            const first = accData[0]?.accuracy ?? 0;
            const last = accData[accData.length - 1]?.accuracy ?? 0;
            const delta = last - first;
            return (
              <div className="rounded-xl p-5" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
                    <TrendingUp className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                    Accuracy Over Time
                  </h2>
                  {accData.length >= 2 && (
                    <span
                      className="text-[11px] font-bold uppercase tracking-widest"
                      style={{ color: delta >= 0 ? CHESSCOM_GREEN : '#dc4343' }}
                    >
                      {delta >= 0 ? '+' : ''}{delta.toFixed(1)} pts since {accData[0].label}
                    </span>
                  )}
                </div>
                <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
                  Real engine-verified accuracy per month, from your reviewed games — not just win/loss counts.
                </p>
                <div className="h-44 -ml-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={accData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="accGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHESSCOM_GREEN} stopOpacity={0.55} />
                          <stop offset="100%" stopColor={CHESSCOM_GREEN} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: TEXT_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: TEXT_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={32} unit="%" />
                      <RechartsTooltip
                        contentStyle={{ background: BG_DARK, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: TEXT_LIGHT, fontSize: 12 }}
                        labelStyle={{ color: TEXT_MUTED, fontWeight: 700 }}
                        formatter={(value: number, _key, item: any) => {
                          const p = item?.payload;
                          if (!p) return [`${value}%`, 'Accuracy'];
                          return [`${value}% accuracy · ${p.blunderRate}% blunder rate (${p.moves} moves)`, 'Accuracy'];
                        }}
                      />
                      <Area type="monotone" dataKey="accuracy" stroke={CHESSCOM_GREEN} strokeWidth={2.5} fill="url(#accGradient)" dot={{ r: 3, fill: CHESSCOM_GREEN, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
        </>
      ) : null}
    </div>
  );
}
