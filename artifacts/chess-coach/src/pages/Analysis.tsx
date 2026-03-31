import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useUser } from '@/hooks/use-user';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { BrainCircuit, AlertTriangle, Activity, ChevronRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const PIE_COLORS = ['#10b981', '#ef4444', '#64748b'];

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

  useEffect(() => {
    mountedRef.current = true;
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
      const startRes = await fetch('/api/analysis/start', {
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

      await new Promise<void>((resolve, reject) => {
        intervalRef.current = setInterval(async () => {
          if (!mountedRef.current) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            resolve();
            return;
          }
          try {
            const pollRes = await fetch(`/api/analysis/status/${jobId}`, { cache: 'no-store' });
            // 304 means cached "pending" — treat as still in progress
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
      games: o.games,
      winRate: Math.round((o.wins / o.games) * 100),
    };
  }) || [];

  return (
    <div className="space-y-8 pb-10 px-4 pt-4 md:px-0 md:pt-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glass-card p-6 rounded-3xl border-primary/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10">
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-primary" /> AI Analysis
          </h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Our coach engine processes all your games to detect recurring patterns, blunders, and strategic leaks.
          </p>
        </div>
        
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="relative z-10 shrink-0 btn-primary btn-lg"
        >
          {isAnalyzing ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
          ) : (
            <><Activity className="w-5 h-5" /> Run Deep Analysis</>
          )}
        </button>
      </div>

      {isAnalyzing && statusMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-primary/8 border border-primary/20 text-primary flex items-center gap-3"
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="text-sm">{statusMsg}</span>
        </motion.div>
      )}

      {analyzeError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-red-400 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {analyzeError}
        </motion.div>
      )}

      {(loadingSummary || loadingWeaknesses) && !isAnalyzing ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="glass-card p-6 rounded-2xl space-y-8">
              <h2 className="text-xl font-bold mb-6">Performance Breakdown</h2>
              
              <div className="flex flex-col sm:flex-row items-center justify-around gap-8">
                <div className="w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 w-full sm:w-auto">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"/> Wins</div>
                    <div className="font-bold">{summary.wins}</div>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"/> Losses</div>
                    <div className="font-bold">{summary.losses}</div>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-500"/> Draws</div>
                    <div className="font-bold">{summary.draws}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card p-6 rounded-2xl">
              <h2 className="text-xl font-bold mb-6">Top Openings Win Rate</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={openingData} layout="vertical" margin={{ left: 0, right: 24 }}>
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis dataKey="name" type="category" width={150} tick={{fill: '#94a3b8', fontSize: 11}} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                      formatter={(val) => [`${val}%`, 'Win Rate']}
                    />
                    <Bar dataKey="winRate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-display font-bold mt-12 mb-6 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" /> Identified Weaknesses
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {weaknessesData?.weaknesses?.map((weakness, i) => (
              <motion.div
                key={weakness.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => navigate(`/analysis/${weakness.id}`)}
                className="glass-card p-6 rounded-2xl border-l-4 cursor-pointer hover:scale-[1.02] hover:shadow-lg transition-all group"
                style={{ borderLeftColor: weakness.severity === 'Critical' ? '#ef4444' : weakness.severity === 'High' ? '#f59e0b' : '#3b82f6' }}
              >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold group-hover:text-primary transition-colors">{weakness.category}</h3>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
                        ${weakness.severity === 'Critical' ? 'bg-red-500/20 text-red-400' : 
                          weakness.severity === 'High' ? 'bg-amber-500/20 text-amber-400' : 
                          'bg-blue-500/20 text-blue-400'}`}>
                        {weakness.severity}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  <p className="text-muted-foreground mb-6 line-clamp-3">{weakness.description}</p>

                  <div className="flex items-center gap-4 text-sm font-medium">
                    <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${weakness.frequency * 100}%` }} />
                    </div>
                    <span className="text-primary">{Math.round(weakness.frequency * 100)}% impact</span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                    <span>View examples, games & courses</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
              </motion.div>
            ))}
            
            {!weaknessesData?.weaknesses?.length && (
              <div className="col-span-full text-center py-12 border-2 border-dashed border-border rounded-2xl text-muted-foreground">
                Run an analysis to discover your weaknesses and build a personalized plan.
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
