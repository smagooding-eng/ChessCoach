import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useUser } from '@/hooks/use-user';
import { useQueryClient } from '@tanstack/react-query';
import { Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { BrainCircuit, AlertTriangle, Activity, ChevronRight, Loader2, TrendingUp, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { getTierForRating, ELO_TIERS } from '@/lib/elo-tips';
import { apiFetch } from '@/lib/api';
import { PremiumGate } from '@/components/PremiumGate';

const CHESSCOM_GREEN = '#81b64c';
const BG_CARD = '#302e2b';
const BG_CARD_HOVER = '#3a3733';
const BG_DARK = '#262421';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const PIE_COLORS = [CHESSCOM_GREEN, '#dc4343', '#6b6966'];

export function Analysis() {
  const [, navigate] = useLocation();
  const { username } = useUser();
  const queryClient = useQueryClient();
  const { data: summary, isLoading: loadingSummary } = useMyAnalysisSummary();
  const { data: weaknessesData, isLoading: loadingWeaknesses } = useMyWeaknesses();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollJob = (jobId: string) => {
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
    if (!username || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalyzeError(null);
    setStatusMsg('Starting AI analysis…');

    try {
      const startRes = await apiFetch('/api/analysis/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!startRes.ok) {
        const j = await startRes.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((j.error as string) || `Server error (${startRes.status})`);
      }
      const { jobId } = await startRes.json() as { jobId: string };

      if (!mountedRef.current) return;
      setStatusMsg('Analyzing your games with AI… this may take 30–60 seconds');

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
    <PremiumGate feature="AI Game Analysis">
    <div className="space-y-5 pb-10 px-3 pt-3 md:px-0 md:pt-0">
      <div className="rounded-xl p-5 md:p-6" style={{ background: BG_CARD }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2.5" style={{ color: TEXT_LIGHT }}>
              <BrainCircuit className="w-6 h-6" style={{ color: CHESSCOM_GREEN }} /> AI Analysis
            </h1>
            <p className="mt-1.5 max-w-lg text-sm" style={{ color: TEXT_MUTED }}>
              Our coach engine processes all your games to detect recurring patterns, blunders, and strategic leaks.
            </p>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="shrink-0 px-5 py-2.5 rounded-lg font-bold text-sm text-white flex items-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: CHESSCOM_GREEN }}
          >
            {isAnalyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
            ) : (
              <><Activity className="w-4 h-4" /> Run Deep Analysis</>
            )}
          </button>
        </div>
      </div>

      {isAnalyzing && statusMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-lg flex items-center gap-3 text-sm"
          style={{ background: 'rgba(129,182,76,0.08)', border: '1px solid rgba(129,182,76,0.2)', color: CHESSCOM_GREEN }}
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{statusMsg}</span>
        </motion.div>
      )}

      {analyzeError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-lg flex items-center gap-2 text-sm"
          style={{ background: 'rgba(220,67,67,0.1)', border: '1px solid rgba(220,67,67,0.25)', color: '#dc4343' }}
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
            <div className="rounded-xl p-5 space-y-6" style={{ background: BG_CARD }}>
              <h2 className="text-lg font-bold" style={{ color: TEXT_LIGHT }}>Performance Breakdown</h2>

              <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
                <div className="w-44 h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
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
                </div>
                <div className="space-y-2.5 w-full sm:w-auto">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2 text-sm" style={{ color: TEXT_LIGHT }}><div className="w-3 h-3 rounded-full" style={{ background: CHESSCOM_GREEN }}/> Wins</div>
                    <div className="font-bold text-sm" style={{ color: TEXT_LIGHT }}>{summary.wins}</div>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2 text-sm" style={{ color: TEXT_LIGHT }}><div className="w-3 h-3 rounded-full" style={{ background: '#dc4343' }}/> Losses</div>
                    <div className="font-bold text-sm" style={{ color: TEXT_LIGHT }}>{summary.losses}</div>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2 text-sm" style={{ color: TEXT_LIGHT }}><div className="w-3 h-3 rounded-full" style={{ background: '#6b6966' }}/> Draws</div>
                    <div className="font-bold text-sm" style={{ color: TEXT_LIGHT }}>{summary.draws}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: BG_CARD }}>
              <h2 className="text-lg font-bold mb-4" style={{ color: TEXT_LIGHT }}>Top Openings Win Rate</h2>
              <div className="space-y-2">
                {openingData.map((o, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => navigate(`/openings/${encodeURIComponent(o.fullName)}`)}
                    className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer group transition-colors"
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

          {summary.avgRating > 0 && (() => {
            const tier = getTierForRating(summary.avgRating);
            const tierIdx = ELO_TIERS.indexOf(tier);
            const nextTier = ELO_TIERS[tierIdx + 1];
            const progress = nextTier
              ? Math.min(100, Math.round(((summary.avgRating - tier.min) / (tier.max - tier.min)) * 100))
              : 100;
            return (
              <div className="rounded-xl overflow-hidden" style={{ background: BG_CARD }}>
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
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${tier.bgColor} ${tier.color} border ${tier.borderColor}`}>
                      {tier.icon} {tier.label}
                    </div>
                    {nextTier && (
                      <>
                        <ArrowUpRight className="w-3.5 h-3.5" style={{ color: TEXT_MUTED }} />
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${nextTier.bgColor} ${nextTier.color} border ${nextTier.borderColor} opacity-60`}>
                          {nextTier.icon} {nextTier.label}
                        </div>
                      </>
                    )}
                  </div>
                </div>

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
                        className="flex gap-2.5 p-3 rounded-lg transition-colors"
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
              </div>
            );
          })()}

          <h2 className="text-xl font-black mt-8 mb-4 flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
            <AlertTriangle className="w-5 h-5" style={{ color: '#ea9733' }} /> Identified Weaknesses
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {weaknessesData?.weaknesses?.map((weakness, i) => (
              <motion.div
                key={weakness.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => navigate(`/analysis/${weakness.id}`)}
                className="rounded-xl p-5 cursor-pointer group transition-all"
                style={{
                  background: BG_CARD,
                  borderLeft: `3px solid ${weakness.severity === 'Critical' ? '#dc4343' : weakness.severity === 'High' ? '#ea9733' : '#6da5d8'}`,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                onMouseLeave={e => (e.currentTarget.style.background = BG_CARD)}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-base font-bold transition-colors" style={{ color: TEXT_LIGHT }}>{weakness.category}</h3>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        background: weakness.severity === 'Critical' ? 'rgba(220,67,67,0.15)' : weakness.severity === 'High' ? 'rgba(234,151,51,0.15)' : 'rgba(109,165,216,0.15)',
                        color: weakness.severity === 'Critical' ? '#dc4343' : weakness.severity === 'High' ? '#ea9733' : '#6da5d8',
                      }}>
                      {weakness.severity}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: TEXT_MUTED }} />
                  </div>
                </div>

                <p className="text-sm mb-4 line-clamp-2" style={{ color: TEXT_MUTED }}>{weakness.description}</p>

                <div className="flex items-center gap-3 text-sm">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: BG_DARK }}>
                    <div className="h-full rounded-full" style={{ width: `${weakness.frequency * 100}%`, background: CHESSCOM_GREEN }} />
                  </div>
                  <span className="text-xs font-bold" style={{ color: CHESSCOM_GREEN }}>{Math.round(weakness.frequency * 100)}%</span>
                </div>

                <div className="mt-3 pt-3 flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: CHESSCOM_GREEN }}>
                  <span>View examples & courses</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </motion.div>
            ))}

            {!weaknessesData?.weaknesses?.length && (
              <div className="col-span-full text-center py-10 rounded-xl text-sm" style={{ border: '1px dashed rgba(255,255,255,0.1)', color: TEXT_MUTED }}>
                Run an analysis to discover your weaknesses and build a personalized plan.
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
    </PremiumGate>
  );
}
