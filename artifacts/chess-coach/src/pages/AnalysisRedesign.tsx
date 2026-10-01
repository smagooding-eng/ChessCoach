import React from 'react';
import { Link } from 'wouter';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyOpenings } from '@/hooks/use-openings';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { BookOpen, Brain, Trophy, Target, ChevronRight } from 'lucide-react';

// Same scoped visual system as DashboardRedesign.tsx / GamesRedesign.tsx.
const RG_BG = '#070906';
const RG_CARD = 'linear-gradient(180deg,#1b2215,#141a10)';
const RG_LINE = 'rgba(255,255,255,.12)';
const RG_TEXT = '#f2f6eb';
const RG_MUTED = '#a3ad98';
const RG_GREEN = '#7fd14f';
const RG_RED = '#ff6a4a';
const RG_GOLD = '#f2d04a';

const SEV_STYLE: Record<string, { bg: string; text: string }> = {
  Critical: { bg: 'rgba(255,106,74,.22)', text: '#ffb3a0' },
  High: { bg: 'rgba(255,138,61,.2)', text: '#ffb37a' },
  Medium: { bg: 'rgba(242,208,74,.2)', text: RG_GOLD },
  Low: { bg: 'rgba(127,209,79,.2)', text: RG_GREEN },
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ background: RG_CARD, border: `1px solid ${RG_LINE}`, borderRadius: 18, padding: '1.25rem', ...style }}>
      {children}
    </section>
  );
}

// Every section here, including "Top openings win rate," is backed by
// real data -- the latter comes from useMyOpenings() (the same hook the
// classic Openings.tsx page uses), not useMyAnalysisSummary(). An
// earlier version of this file incorrectly omitted that section as
// "no real data exists" -- that was a research gap (this hook wasn't
// checked), not actually true, and has been corrected.
export function AnalysisRedesign() {
  const { data: summary } = useMyAnalysisSummary();
  const { data: weaknessesData } = useMyWeaknesses();
  const { data: openingsData } = useMyOpenings();

  if (!summary) {
    return (
      <div style={{ background: RG_BG, color: RG_TEXT, minHeight: '100vh' }} className="-m-4 p-4 md:-m-6 md:p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: RG_GREEN, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const totalDecided = summary.wins + summary.losses + summary.draws;
  const winPct = totalDecided > 0 ? Math.round((summary.wins / totalDecided) * 100) : 0;
  const donutStops = totalDecided > 0
    ? `${RG_GREEN} 0 ${winPct}%, #8b8f84 ${winPct}% ${winPct + Math.round((summary.draws / totalDecided) * 100)}%, ${RG_RED} ${winPct + Math.round((summary.draws / totalDecided) * 100)}% 100%`
    : `${RG_MUTED} 0 100%`;

  const monthlyTrend = (summary.monthlyTrend ?? []).filter(p => p.games > 0).map(p => {
    const [y, m] = p.month.split('-');
    return { ...p, label: new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-US', { month: 'short' }), winPct: Math.round((p.winRate || 0) * 100) };
  });
  const accuracyTrend = (summary.accuracyTrend ?? []).map(p => {
    const [y, m] = p.month.split('-');
    return { ...p, label: new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-US', { month: 'short' }) };
  });

  const phases: Array<{ key: 'opening' | 'middlegame' | 'endgame'; label: string; icon: typeof BookOpen }> = [
    { key: 'opening', label: 'Opening', icon: BookOpen },
    { key: 'middlegame', label: 'Middlegame', icon: Brain },
    { key: 'endgame', label: 'Endgame', icon: Trophy },
  ];

  return (
    <div style={{ background: RG_BG, color: RG_TEXT, minHeight: '100vh', fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif' }} className="-m-4 p-4 md:-m-6 md:p-6">
      <div className="max-w-[1000px] mx-auto grid gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Deep Analysis</h1>
          <p style={{ color: RG_MUTED }} className="text-sm mt-1">Patterns, accuracy, and trends across your {summary.totalGames.toLocaleString()} games.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Performance breakdown */}
          <Card>
            <h2 className="text-base font-extrabold mb-3">Performance breakdown</h2>
            <div className="flex items-center gap-5">
              <div className="w-[110px] h-[110px] rounded-full flex items-center justify-center shrink-0" style={{ background: `conic-gradient(${donutStops})` }}>
                <div className="w-20 h-20 rounded-full flex flex-col items-center justify-center text-center" style={{ background: '#161c11' }}>
                  <b className="text-xl font-extrabold">{winPct}%</b>
                  <small style={{ color: RG_MUTED }} className="text-[10px]">win</small>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 flex-1">
                {[
                  { label: 'Wins', value: summary.wins },
                  { label: 'Losses', value: summary.losses },
                  { label: 'Draws', value: summary.draws },
                  { label: 'Avg Rating', value: summary.avgRating || '—' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg p-2.5" style={{ background: 'rgba(0,0,0,.22)' }}>
                    <b className="text-lg font-extrabold block">{s.value}</b>
                    <small style={{ color: RG_MUTED }} className="text-xs">{s.label}</small>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Identified weaknesses */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-extrabold">Identified weaknesses</h2>
              {!!weaknessesData?.weaknesses?.length && (
                <span style={{ color: RG_MUTED }} className="text-xs">{weaknessesData.weaknesses.length} found</span>
              )}
            </div>
            {weaknessesData?.weaknesses?.length ? (
              <div className="grid gap-1.5">
                {weaknessesData.weaknesses.slice(0, 4).map((w) => {
                  const sev = SEV_STYLE[w.severity] ?? SEV_STYLE.Low;
                  return (
                    <Link key={w.id} href={`/analysis/${w.id}`} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 transition-colors">
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0" style={{ background: sev.bg, color: sev.text }}>{w.severity}</span>
                      <div className="flex-1 min-w-0">
                        <b className="text-sm block truncate">{w.category}</b>
                        <small style={{ color: RG_MUTED }} className="block text-xs truncate">{w.description}</small>
                      </div>
                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: RG_MUTED }} />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6" style={{ color: RG_MUTED }}>
                <Target className="w-7 h-7 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No weaknesses found yet.</p>
                <p className="text-xs mt-0.5">Run Deep Analysis to discover your patterns.</p>
              </div>
            )}
          </Card>
        </div>

        {/* Top openings win rate -- real data via useMyOpenings(), same
            hook the classic Openings.tsx page uses. Filtered to openings
            with at least 3 games, matching that page's own convention,
            since a single game is either 0% or 100% and isn't a
            meaningful "win rate" yet. */}
        {!!openingsData?.openings?.length && (() => {
          const ranked = [...openingsData.openings].filter(o => o.totalGames >= 3).sort((a, b) => b.winRate - a.winRate).slice(0, 5);
          if (ranked.length === 0) return null;
          return (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-extrabold">Top openings win rate</h2>
                <Link href="/openings" className="text-xs font-extrabold uppercase tracking-wide" style={{ color: RG_GREEN }}>All openings →</Link>
              </div>
              <div className="grid gap-2">
                {ranked.map((o) => (
                  <div key={o.opening} className="grid grid-cols-[minmax(0,1fr)_1fr_44px] items-center gap-3 text-sm">
                    <span style={{ color: RG_MUTED }} className="truncate">{o.opening}</span>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.1)' }}>
                      <div style={{ width: `${Math.max(o.winRate, 2)}%`, height: '100%', background: o.winRate >= 50 ? RG_GREEN : RG_RED }} />
                    </div>
                    <b className="text-right">{o.winRate}%</b>
                  </div>
                ))}
              </div>
              <p style={{ color: RG_MUTED }} className="text-xs mt-3">Openings played fewer than 3 times aren't shown — their win rate isn't reliable yet.</p>
            </Card>
          );
        })()}

        {/* Accuracy by phase */}
        {summary.phaseAccuracy && summary.phaseAccuracy.gamesAnalyzed > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-extrabold">Accuracy by game phase</h2>
              <span style={{ color: RG_MUTED }} className="text-xs">From {summary.phaseAccuracy.gamesAnalyzed} reviewed game{summary.phaseAccuracy.gamesAnalyzed === 1 ? '' : 's'}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {phases.map((p) => {
                const stat = summary.phaseAccuracy![p.key];
                return (
                  <div key={p.key} className="rounded-xl p-3.5" style={{ background: 'rgba(0,0,0,.22)' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <p.icon className="w-4 h-4" style={{ color: RG_GREEN }} />
                      <span style={{ color: RG_MUTED }} className="text-xs font-bold uppercase tracking-wide">{p.label} · {stat.moves} moves</span>
                    </div>
                    <b className="text-2xl font-extrabold">{stat.moves > 0 ? `${stat.accuracy}%` : '—'}</b>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Trend charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {monthlyTrend.length > 0 && (
            <Card>
              <h2 className="text-base font-extrabold mb-3">Win rate, last 6 months</h2>
              <div style={{ height: 176, marginLeft: -12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="rgWinGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={RG_GREEN} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={RG_GREEN} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: RG_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: RG_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={32} unit="%" />
                    <RechartsTooltip contentStyle={{ background: '#141a10', border: `1px solid ${RG_LINE}`, borderRadius: 8, color: RG_TEXT, fontSize: 12 }} />
                    <Area type="monotone" dataKey="winPct" stroke={RG_GREEN} strokeWidth={2.5} fill="url(#rgWinGradient)" dot={{ r: 3, fill: RG_GREEN, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
          {accuracyTrend.length > 0 && (
            <Card>
              <h2 className="text-base font-extrabold mb-3">Accuracy over time</h2>
              <div style={{ height: 176, marginLeft: -12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={accuracyTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="rgAccGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={RG_GOLD} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={RG_GOLD} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: RG_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: RG_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={32} unit="%" />
                    <RechartsTooltip contentStyle={{ background: '#141a10', border: `1px solid ${RG_LINE}`, borderRadius: 8, color: RG_TEXT, fontSize: 12 }} />
                    <Area type="monotone" dataKey="accuracy" stroke={RG_GOLD} strokeWidth={2.5} fill="url(#rgAccGradient)" dot={{ r: 3, fill: RG_GOLD, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
