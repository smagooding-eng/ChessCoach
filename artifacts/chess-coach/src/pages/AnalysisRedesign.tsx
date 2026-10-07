import React, { useState } from 'react';
import { Link } from 'wouter';
import { ChevronRight, Target } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line } from 'recharts';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyOpenings } from '@/hooks/use-openings';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useUser } from '@/hooks/use-user';
import { RD } from '@/lib/redesignTheme';
import { RedesignHeader } from '@/components/RedesignHeader';

// "My Analytics" (redesign). Every number on this page is real data.
//
// Differences from the mockup, on purpose:
//  - Tabs are Overview / Openings / Weaknesses / Trends. The mockup's
//    "Tactics" and "Endgame" tabs have no dedicated data behind them
//    here, so those two would have been empty or misleading.
//  - The mockup's "Key Improvements" (+42% etc.) needs an
//    improvement-over-time metric that doesn't exist. It's replaced by
//    real accuracy-by-phase bars in the same visual style.
//  - The mockup's "Mistakes Breakdown" donut (blunders/inaccuracies/...)
//    would need per-type mistake counts that aren't stored as structured
//    data. The donut shown is the real win/draw/loss breakdown.

const SEV_STYLE: Record<string, { bg: string; fg: string }> = {
  Critical: { bg: 'rgba(255,80,88,.18)', fg: '#FF8A8F' },
  High: { bg: 'rgba(255,138,61,.18)', fg: '#FFB07A' },
  Medium: { bg: 'rgba(232,180,71,.18)', fg: RD.gold },
  Low: { bg: 'rgba(95,213,51,.16)', fg: '#7BE05A' },
};

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'openings', label: 'Openings' },
  { id: 'weaknesses', label: 'Weaknesses' },
  { id: 'trends', label: 'Trends' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[20px] p-4 ${className}`} style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
      {children}
    </section>
  );
}

function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  if (values.length < 2) return <div className="h-full w-full" />;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.45} /><stop offset="100%" stopColor={color} stopOpacity={0.03} /></linearGradient>
        </defs>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2.4} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (!value) return null;
  const up = value > 0;
  return (
    <span className="text-[12px] font-extrabold" style={{ color: up ? RD.green : RD.red }}>
      {up ? '▲' : '▼'} {Math.abs(value)}{suffix}
    </span>
  );
}

const tooltipStyle = { background: RD.cardSolid, border: `1px solid ${RD.border}`, borderRadius: 10, color: RD.text, fontSize: 12 };

export function AnalysisRedesign() {
  const { username } = useUser();
  const { data: summary } = useMyAnalysisSummary();
  const { data: weaknessesData } = useMyWeaknesses();
  const { data: openingsData } = useMyOpenings();
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const [tab, setTab] = useState<TabId>('overview');

  if (!summary) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: RD.bg }}>
        <div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: RD.green, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const decided = summary.wins + summary.losses + summary.draws;
  const pct = (n: number) => (decided > 0 ? (n / decided) * 100 : 0);
  const winRate = pct(summary.wins);

  // Rating: same "average of the platforms" figure the dashboard shows
  const ratings: number[] = [];
  if (multiElo?.chesscom?.hasData) ratings.push(multiElo.chesscom.currentRating);
  if (multiElo?.lichess?.hasData) ratings.push(multiElo.lichess.currentRating);
  const rating = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
  const ratingDelta = multiElo?.combined?.delta ?? 0;
  const ratingSpark = multiElo?.combined?.sparkline ?? [];

  const monthly = (summary.monthlyTrend ?? []).filter((p) => p.games > 0).map((p) => {
    const [y, m] = p.month.split('-');
    return { ...p, label: new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-US', { month: 'short' }), winPct: Math.round((p.winRate || 0) * 100) };
  });
  const accuracy = (summary.accuracyTrend ?? []).map((p) => {
    const [y, m] = p.month.split('-');
    return { ...p, label: new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-US', { month: 'short' }) };
  });
  // Month-over-month change in win rate, in percentage points -- only
  // shown when there are at least two months of data to compare.
  const winDelta = monthly.length >= 2
    ? Math.round((monthly[monthly.length - 1].winRate - monthly[monthly.length - 2].winRate) * 1000) / 10
    : 0;

  const donut = `conic-gradient(${RD.green} 0 ${pct(summary.wins)}%, #8A949B ${pct(summary.wins)}% ${pct(summary.wins) + pct(summary.draws)}%, ${RD.red} ${pct(summary.wins) + pct(summary.draws)}% 100%)`;
  const legend = [
    { label: 'Wins', n: summary.wins, color: RD.green },
    { label: 'Draws', n: summary.draws, color: '#8A949B' },
    { label: 'Losses', n: summary.losses, color: RD.red },
  ];

  const phases = summary.phaseAccuracy && summary.phaseAccuracy.gamesAnalyzed > 0
    ? ([['Opening', 'opening'], ['Middlegame', 'middlegame'], ['Endgame', 'endgame']] as const).map(([label, key]) => ({ label, ...summary.phaseAccuracy![key] }))
    : [];

  const openings = openingsData?.openings
    ? [...openingsData.openings].filter((o) => o.totalGames >= 3).sort((a, b) => b.winRate - a.winRate).slice(0, 8)
    : [];
  const weaknesses = weaknessesData?.weaknesses ?? [];

  return (
    <div className="min-h-screen px-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid grid-cols-1 w-full max-w-[760px] gap-3">
        <RedesignHeader title="My Analytics" icon={<span className="text-[26px] leading-none">♟</span>} />

        <div className="grid grid-cols-4 gap-1 rounded-[16px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="rounded-[12px] py-2.5 text-[13px] font-bold transition-colors"
                style={active ? { background: 'rgba(139,234,69,.10)', color: RD.text, boxShadow: `inset 0 0 0 1.5px ${RD.green}` } : { background: 'transparent', color: RD.muted }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card className="flex items-stretch gap-2 !p-3.5">
                <div className="shrink-0 self-center">
                  <p className="text-[12.5px]" style={{ color: RD.muted }}>Rating</p>
                  <b className="block text-[30px] font-extrabold leading-tight">{rating ?? '—'}</b>
                  <Delta value={ratingDelta} />
                </div>
                <div className="min-h-[62px] min-w-0 flex-1"><Sparkline id="rdRatingSpark" values={ratingSpark} color={RD.green} /></div>
              </Card>
              <Card className="flex items-stretch gap-2 !p-3.5">
                <div className="shrink-0 self-center">
                  <p className="text-[12.5px]" style={{ color: RD.muted }}>Win Rate</p>
                  <b className="block text-[26px] font-extrabold leading-tight">{decided > 0 ? `${winRate.toFixed(1)}%` : '—'}</b>
                  <Delta value={winDelta} suffix="%" />
                </div>
                <div className="min-h-[62px] min-w-0 flex-1"><Sparkline id="rdWinSpark" values={monthly.map((m) => m.winPct)} color={RD.green} /></div>
              </Card>
            </div>

            <section>
              <h2 className="mb-2 px-1 text-[17px] font-extrabold">Results Breakdown</h2>
              <div className="flex items-center gap-4 px-1">
                <div className="grid h-[150px] w-[150px] shrink-0 place-items-center rounded-full" style={{ background: decided > 0 ? donut : RD.cardLight }}>
                  <div className="grid h-[96px] w-[96px] place-items-center rounded-full text-center" style={{ background: RD.bg }}>
                    <div>
                      <b className="block text-[26px] font-extrabold leading-none">{decided.toLocaleString()}</b>
                      <span className="text-[12px]" style={{ color: RD.muted }}>Total</span>
                    </div>
                  </div>
                </div>
                <div className="grid flex-1 gap-2.5">
                  {legend.map((l) => (
                    <div key={l.label} className="flex items-center gap-2.5 text-[13.5px]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} />
                      <span className="flex-1" style={{ color: 'rgba(245,247,246,.85)' }}>{l.label}</span>
                      <b>{pct(l.n).toFixed(0)}%</b>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {phases.length > 0 && (
              <section>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-[17px] font-extrabold">Accuracy by Phase</h2>
                  <span className="text-[11.5px]" style={{ color: RD.muted }}>{summary.phaseAccuracy!.gamesAnalyzed} reviewed game{summary.phaseAccuracy!.gamesAnalyzed === 1 ? '' : 's'}</span>
                </div>
                <div className="grid gap-2.5">
                  {phases.map((ph) => (
                    <div key={ph.label} className="flex items-center gap-3">
                      <div className="relative h-[36px] flex-1 overflow-hidden rounded-[9px]" style={{ background: 'rgba(255,255,255,.06)' }}>
                        <div className="absolute inset-y-0 left-0 rounded-[9px]" style={{ width: `${ph.moves > 0 ? Math.max(ph.accuracy, 10) : 0}%`, background: `linear-gradient(90deg, ${RD.greenDark}, ${RD.green})` }} />
                        <span className="relative z-10 flex h-full items-center px-3 text-[14px] font-bold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,.65)' }}>{ph.label}</span>
                      </div>
                      <b className="w-12 text-right text-[14px]" style={{ color: RD.green }}>{ph.moves > 0 ? `${ph.accuracy}%` : '—'}</b>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'openings' && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-extrabold">Top Openings by Win Rate</h2>
              <Link href="/openings" className="flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-wider" style={{ color: RD.green }}>All openings <ChevronRight size={14} /></Link>
            </div>
            {openings.length ? (
              <div className="grid gap-3">
                {openings.map((o) => (
                  <div key={o.opening}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
                      <span className="truncate">{o.opening}</span>
                      <b>{o.winRate}%</b>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(o.winRate, 3)}%`, background: o.winRate >= 50 ? `linear-gradient(90deg, ${RD.greenDark}, ${RD.green})` : RD.red }} />
                    </div>
                    <span className="text-[11px]" style={{ color: RD.muted }}>{o.totalGames} games</span>
                  </div>
                ))}
                <p className="text-[11.5px]" style={{ color: RD.muted }}>Openings played fewer than 3 times aren't shown — their win rate isn't reliable yet.</p>
              </div>
            ) : (
              <p className="py-8 text-center text-[13px]" style={{ color: RD.muted }}>Play an opening at least 3 times to see its win rate here.</p>
            )}
          </Card>
        )}

        {tab === 'weaknesses' && (
          <Card className="!p-2">
            <div className="flex items-center justify-between px-2 pb-2 pt-2">
              <h2 className="text-[16px] font-extrabold">Identified Weaknesses</h2>
              {weaknesses.length > 0 && <span className="text-[12px]" style={{ color: RD.muted }}>{weaknesses.length} found</span>}
            </div>
            {weaknesses.length ? (
              weaknesses.map((w, i) => {
                const sev = SEV_STYLE[w.severity] ?? SEV_STYLE.Low;
                return (
                  <Link
                    key={w.id}
                    href={`/analysis/${w.id}`}
                    className="flex items-center gap-3 rounded-xl px-2.5 py-3 transition-colors hover:bg-white/[0.03]"
                    style={{ borderTop: i ? `1px solid ${RD.border}` : `1px solid ${RD.border}` }}
                  >
                    <span className="shrink-0 rounded-md px-2 py-1 text-[10.5px] font-extrabold" style={{ background: sev.bg, color: sev.fg }}>{w.severity}</span>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[14px]">{w.category}</b>
                      <span className="block truncate text-[12px]" style={{ color: RD.muted }}>{w.description}</span>
                    </div>
                    <ChevronRight size={15} className="shrink-0" style={{ color: RD.muted }} />
                  </Link>
                );
              })
            ) : (
              <div className="py-10 text-center" style={{ color: RD.muted }}>
                <Target size={28} className="mx-auto mb-2 opacity-50" />
                <p className="text-[13px]">No weaknesses found yet.</p>
                <p className="mt-0.5 text-[12px]">Run Deep Analysis to discover your patterns.</p>
              </div>
            )}
          </Card>
        )}

        {tab === 'trends' && (
          <>
            {monthly.length > 0 ? (
              <Card>
                <h2 className="mb-3 text-[16px] font-extrabold">Win Rate, Last 6 Months</h2>
                <div style={{ height: 190, marginLeft: -12 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="rdWin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={RD.green} stopOpacity={0.45} /><stop offset="100%" stopColor={RD.green} stopOpacity={0.02} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.07)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: RD.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: RD.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={34} unit="%" />
                      <RechartsTooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="winPct" stroke={RD.green} strokeWidth={2.5} fill="url(#rdWin)" dot={{ r: 3, fill: RD.green, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ) : null}
            {accuracy.length > 0 ? (
              <Card>
                <h2 className="mb-3 text-[16px] font-extrabold">Accuracy Over Time</h2>
                <div style={{ height: 190, marginLeft: -12 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={accuracy} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="rdAcc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={RD.gold} stopOpacity={0.45} /><stop offset="100%" stopColor={RD.gold} stopOpacity={0.02} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.07)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: RD.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: RD.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={34} unit="%" />
                      <RechartsTooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="accuracy" stroke={RD.gold} strokeWidth={2.5} fill="url(#rdAcc)" dot={{ r: 3, fill: RD.gold, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ) : null}
            {monthly.length === 0 && accuracy.length === 0 && (
              <Card><p className="py-8 text-center text-[13px]" style={{ color: RD.muted }}>Trends appear once you have a few months of games.</p></Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
