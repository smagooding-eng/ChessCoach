import React, { useState } from 'react';
import { Link } from 'wouter';
import { ChevronRight, ChevronDown, Target, BarChart3, Trophy, BookOpen, Lightbulb, Swords, Crosshair, Gamepad2, GraduationCap, Calendar, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Gauge } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyOpenings } from '@/hooks/use-openings';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useUser } from '@/hooks/use-user';
import { RD } from '@/lib/redesignTheme';
import { RedesignHeader } from '@/components/RedesignHeader';
import type { WeaknessRecord } from '@workspace/api-client-react';

// "My Analytics" (enhanced UI), laid out from the supplied concept. Every
// number on this page is real data:
//  - Weakness stat rows are read from the weakness descriptions our own
//    analysis writes (fixed wording, real counts); no pattern match = no stats.
//  - "vs." figures are the latest month against the month before it.
//  - Key Insight / Trending cards only appear when the real numbers support
//    them (e.g. a phase 5+ points ahead, or both trends moving the same way).

const SEV_STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  Critical: { bg: 'rgba(255,80,88,.22)', fg: '#FF8A8F', border: 'rgba(255,80,88,.45)' },
  High: { bg: 'rgba(255,80,88,.20)', fg: '#FF8A8F', border: 'rgba(255,80,88,.40)' },
  Medium: { bg: 'rgba(232,180,71,.20)', fg: RD.gold, border: 'rgba(232,180,71,.40)' },
  Low: { bg: 'rgba(95,143,54,.16)', fg: '#95C45A', border: 'rgba(95,143,54,.35)' },
};
const SEV_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'openings', label: 'Openings' },
  { id: 'weaknesses', label: 'Weaknesses' },
  { id: 'trends', label: 'Trends' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const CARD_STYLE: React.CSSProperties = {
  background: RD.card,
  border: '1px solid rgba(129,182,76,.14)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.03)',
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[20px] p-4 ${className}`} style={CARD_STYLE}>{children}</section>;
}

const sprite = (p: string) => `${import.meta.env.BASE_URL}pieces/chessnut/${p}.svg`;

function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  if (values.length < 2) return <div className="h-full w-full" />;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.45} /><stop offset="100%" stopColor={color} stopOpacity={0.03} /></linearGradient>
        </defs>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2.2} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (!value) return null;
  const up = value > 0;
  return (
    <span className="text-[13px] font-extrabold" style={{ color: up ? RD.green : RD.red }}>
      {up ? '▲' : '▼'} {Math.abs(value)}{suffix}
    </span>
  );
}

const monthLabel = (ym: string, long = false) => {
  const [y, m] = ym.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-US', long ? { month: 'short', year: 'numeric' } : { month: 'short' });
};

// "Queens Pawn Opening Mikenas Defense" -> ["Queens Pawn Opening", "Mikenas Defense"]
function splitOpening(name: string): [string, string] {
  const m = name.match(/^(.*?\b(?:Opening|Game|Defense|Defence|Gambit|Attack|System))\b\s*(.*)$/);
  if (m && m[2]) return [m[1], m[2]];
  return [name, ''];
}

// ── Weakness stats ──────────────────────────────────────────────────────────
// The weakness descriptions are written by our own analysis with fixed
// wording, so the real numbers can be read back out of them. Nothing here is
// estimated: if a description doesn't match a known pattern, no stats are shown.
type WStat = { value: string; label: string };
function weaknessView(w: WeaknessRecord, openingWinRate: (name: string) => number | null): { icon: React.ReactNode; summary: string; stats: WStat[]; cta: string } {
  const d = w.description;
  // First sentence only (no lookbehind regex -- older iOS Safari can't parse it)
  const cut = d.search(/[.!?]\s+[A-Z]/);
  const firstSentence = (cut >= 0 ? d.slice(0, cut + 1) : d).replace(/\s+(Recent|Examples|For example)\b.*$/, '');
  let m: RegExpMatchArray | null;
  if ((m = d.match(/blundered (\d+) times across (\d+) reviewed games/))) {
    return { icon: <Swords size={22} />, summary: firstSentence.replace(/ — about.*$/, '.'), cta: 'Review',
      stats: [{ value: m[1], label: 'Blunders' }, { value: m[2], label: 'Games' }] };
  }
  if ((m = d.match(/slip away in (\d+) of your last (\d+) reviewed games \((\d+)%\)/))) {
    return { icon: <Crosshair size={22} />, summary: firstSentence.replace(/ — the engine.*$/, '.'), cta: 'Review',
      stats: [{ value: `${m[3]}%`, label: 'Of games' }, { value: m[1], label: 'Missed wins' }] };
  }
  if ((m = d.match(/^In the (.+?) \((\d+) games\), (\d+)% of your moves/))) {
    const wr = openingWinRate(m[1]);
    return { icon: <BookOpen size={22} />, summary: firstSentence.replace(/ — noticeably.*$/, '.'), cta: 'View Games',
      stats: [wr != null ? { value: `${wr}%`, label: 'Win rate' } : { value: `${m[3]}%`, label: 'Inaccurate moves' }, { value: m[2], label: 'Games' }] };
  }
  if ((m = d.match(/Across your (\d+) reviewed games, (\d+)% of your (\w+) moves/))) {
    const endgame = m[3] === 'endgame';
    return { icon: <img src={sprite(endgame ? 'wK' : 'wP')} alt="" className="h-6 w-6" />, summary: firstSentence, cta: 'Review',
      stats: [{ value: `${m[2]}%`, label: 'Inaccuracies' }, { value: m[1], label: 'Games' }] };
  }
  return { icon: <Target size={22} />, summary: firstSentence, cta: 'Review', stats: [] };
}

// ── Trend chart with the latest value called out ────────────────────────────
type TrendPoint = { label: string; long: string; value: number };

function TrendChart({ data, color, id }: { data: TrendPoint[]; color: string; id: string }) {
  const last = data.length - 1;
  const renderDot = (props: any) => {
    const { cx, cy, index } = props;
    if (cx == null || cy == null) return <g key={index} />;
    if (index !== last) return <circle key={index} cx={cx} cy={cy} r={3.5} fill={color} />;
    const p = data[index];
    const w = 64, h = 34;
    const x = Math.max(4, cx - w - 8), y = Math.max(2, cy - h - 10);
    return (
      <g key={index}>
        <circle cx={cx} cy={cy} r={9} fill={color} opacity={0.22} />
        <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />
        <rect x={x} y={y} width={w} height={h} rx={7} fill="#0B1213" stroke={color} strokeWidth={1.2} />
        <text x={x + w / 2} y={y + 15} textAnchor="middle" fill="#F5F7F6" fontSize={13} fontWeight={800}>{p.value}%</text>
        <text x={x + w / 2} y={y + 28} textAnchor="middle" fill="#B9C2BF" fontSize={9.5}>{p.long}</text>
      </g>
    );
  };
  return (
    <div style={{ height: 200, marginLeft: -12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 46, right: 14, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.42} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.07)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: RD.muted, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: RD.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={40} unit="%" />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#${id})`} dot={renderDot} activeDot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RangePicker({ value, options, onChange }: { value: number; options: number[]; onChange: (n: number) => void }) {
  if (options.length < 2) return null;
  return (
    <label className="relative flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-bold" style={{ background: 'rgba(255,255,255,.05)', border: `1px solid ${RD.border}`, color: RD.text }}>
      <Calendar size={13} style={{ color: RD.muted }} />
      {value === 0 ? 'All time' : `${value} Months`}
      <ChevronDown size={13} style={{ color: RD.muted }} />
      <select aria-label="Time range" value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => <option key={o} value={o}>{o === 0 ? 'All time' : `${o} months`}</option>)}
      </select>
    </label>
  );
}

function StatTile({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color?: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] px-2.5 py-2.5" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${RD.border}` }}>
      <span className="shrink-0" style={{ color: color ?? RD.green }}>{icon}</span>
      <span className="min-w-0">
        <b className="block text-[15px] font-extrabold leading-tight" style={{ color: color ?? RD.text }}>{value}</b>
        <span className="block truncate text-[10.5px]" style={{ color: RD.muted }}>{label}</span>
      </span>
    </div>
  );
}

function InsightCard({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className="flex w-full items-center gap-3 rounded-[18px] p-4 text-left"
      style={{ background: 'linear-gradient(135deg, rgba(129,182,76,.10), rgba(129,182,76,.03))', border: '1px solid rgba(129,182,76,.35)' }}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-extrabold" style={{ color: RD.green }}>{title}</b>
        <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: 'rgba(245,247,246,.85)' }}>{text}</span>
      </span>
      {onClick && <ChevronRight size={18} className="shrink-0" style={{ color: RD.green }} />}
    </Tag>
  );
}

export function AnalysisRedesign() {
  const { username } = useUser();
  const { data: summary } = useMyAnalysisSummary();
  const { data: weaknessesData } = useMyWeaknesses();
  const { data: openingsData } = useMyOpenings();
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const [tab, setTab] = useState<TabId>('overview');
  const [winRange, setWinRange] = useState(6);
  const [accRange, setAccRange] = useState(6);

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
  const ratingSince = multiElo?.combined?.firstGameAt
    ? `Since ${new Date(multiElo.combined.firstGameAt).toLocaleString('en-US', { month: 'short', year: 'numeric' })}`
    : null;

  // The server returns the last 6 calendar months; months with no games are skipped.
  const monthlyAll = (summary.monthlyTrend ?? []).filter((p) => p.games > 0).map((p) => ({
    ...p, label: monthLabel(p.month), long: monthLabel(p.month, true), winPct: Math.round((p.winRate || 0) * 100),
  }));
  const accuracyAll = (summary.accuracyTrend ?? []).map((p) => ({ ...p, label: monthLabel(p.month), long: monthLabel(p.month, true) }));

  // Range filter by calendar months back from the current month (0 = everything we have)
  const withinMonths = (ym: string, n: number) => {
    if (!n) return true;
    const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
    const now = new Date();
    const diff = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
    return diff < n;
  };
  const monthly = monthlyAll.filter((p) => withinMonths(p.month, winRange));
  const accuracy = accuracyAll.filter((p) => withinMonths(p.month, accRange));
  // Only offer longer ranges when there is actually older data to show
  const oldestAcc = accuracyAll[0]?.month;
  const accOptions = [3, 6, 12, 0].filter((n) =>
    n === 3 || n === 6 || (oldestAcc ? (n === 12 ? !withinMonths(oldestAcc, 6) : !withinMonths(oldestAcc, 12)) : false));

  // Month-over-month change, in percentage points (latest month vs the one before it)
  const lastTwo = <T,>(a: T[]) => (a.length >= 2 ? [a[a.length - 2], a[a.length - 1]] as const : null);
  const winPair = lastTwo(monthlyAll);
  const winDelta = winPair ? winPair[1].winPct - winPair[0].winPct : 0;
  const accPair = lastTwo(accuracyAll);
  const accDelta = accPair ? accPair[1].accuracy - accPair[0].accuracy : 0;

  const legend = [
    { label: 'Wins', n: summary.wins, color: RD.green },
    { label: 'Draws', n: summary.draws, color: '#8A949B' },
    { label: 'Losses', n: summary.losses, color: RD.red },
  ];
  const donut = `conic-gradient(${RD.green} 0 ${pct(summary.wins)}%, #8A949B ${pct(summary.wins)}% ${pct(summary.wins) + pct(summary.draws)}%, ${RD.red} ${pct(summary.wins) + pct(summary.draws)}% 100%)`;

  const PHASE_ICON: Record<string, React.ReactNode> = {
    Opening: <BookOpen size={24} style={{ color: RD.text }} />,
    Middlegame: <img src={sprite('wN')} alt="" className="h-7 w-7" />,
    Endgame: <img src={sprite('wK')} alt="" className="h-7 w-7" />,
  };
  const phases = summary.phaseAccuracy && summary.phaseAccuracy.gamesAnalyzed > 0
    ? ([['Opening', 'opening'], ['Middlegame', 'middlegame'], ['Endgame', 'endgame']] as const).map(([label, key]) => ({ label, ...summary.phaseAccuracy![key] }))
    : [];

  // Key insight: only when the phase numbers genuinely stand apart (5+ points).
  const measured = phases.filter((p) => p.moves > 0);
  let keyInsight: string | null = null;
  if (measured.length >= 2) {
    const sorted = [...measured].sort((a, b) => b.accuracy - a.accuracy);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    const others = sorted.slice(1).map((p) => p.label.toLowerCase());
    if (best.accuracy - sorted[1].accuracy >= 5) {
      keyInsight = `Your ${best.label.toLowerCase()} accuracy is a major strength at ${best.accuracy}%, clearly higher than your ${others.join(' and ')} accuracy.`;
    } else if (sorted[sorted.length - 2].accuracy - worst.accuracy >= 5) {
      keyInsight = `Your ${worst.label.toLowerCase()} is where you lose the most accuracy (${worst.accuracy}%). Improving it is your quickest gain.`;
    }
  }

  const openingWinRate = (name: string) => {
    const hit = openingsData?.openings?.find((o) => o.opening.toLowerCase() === name.toLowerCase());
    return hit ? hit.winRate : null;
  };
  const openings = openingsData?.openings
    ? [...openingsData.openings].filter((o) => o.totalGames >= 3).sort((a, b) => b.winRate - a.winRate || b.totalGames - a.totalGames).slice(0, 8)
    : [];
  const weaknesses = [...(weaknessesData?.weaknesses ?? [])].sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));

  // Trend insight: from the real month-over-month changes above
  let trend: { title: string; text: string; up: boolean } | null = null;
  if (winPair && accPair) {
    if (winDelta > 0 && accDelta > 0) trend = { title: 'Trending Up', text: 'Your win rate and accuracy have both improved in the last month. Keep it up!', up: true };
    else if (winDelta < 0 && accDelta < 0) trend = { title: 'Trending Down', text: 'Your win rate and accuracy both dipped last month. Your weaknesses are the best place to start.', up: false };
    else if (winDelta !== 0 || accDelta !== 0) trend = winDelta >= accDelta
      ? { title: 'Mixed Month', text: `Your win rate ${winDelta > 0 ? 'rose' : 'held'} while your accuracy ${accDelta < 0 ? 'slipped' : 'held steady'}. Results can outrun accuracy; keep an eye on it.`, up: winDelta > 0 }
      : { title: 'Mixed Month', text: `Your accuracy ${accDelta > 0 ? 'improved' : 'held'} while your win rate ${winDelta < 0 ? 'dipped' : 'held steady'}. Better play usually shows up in results soon after.`, up: accDelta > 0 };
  } else if (winPair && winDelta !== 0) {
    trend = winDelta > 0
      ? { title: 'Trending Up', text: 'Your win rate improved in the last month. Keep it up!', up: true }
      : { title: 'Trending Down', text: 'Your win rate dipped last month. Your weaknesses are the best place to start.', up: false };
  }

  const signed = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

  return (
    <div className="min-h-screen px-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid grid-cols-1 w-full max-w-[760px] gap-3 lg:max-w-[1200px]">
        <RedesignHeader title="My Analytics" icon={<span className="text-[26px] leading-none">♟</span>} />

        <div className="grid grid-cols-4 gap-1 rounded-[16px] p-1 lg:max-w-[640px]" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="rounded-[12px] py-2.5 text-[13px] font-bold transition-colors"
                style={active ? { background: 'rgba(129,182,76,.10)', color: RD.text, boxShadow: `inset 0 0 0 1.5px ${RD.green}` } : { background: 'transparent', color: RD.muted }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'overview' && (
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
            <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:gap-4">
              <Card className="!p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-[13px]" style={{ color: RD.muted }}>Rating</p>
                  <BarChart3 size={18} style={{ color: RD.green }} />
                </div>
                <b className="block text-[30px] font-extrabold leading-tight">{rating ?? '—'}</b>
                <Delta value={ratingDelta} />
                <div className="mt-1 h-[46px]"><Sparkline id="rdRatingSpark" values={ratingSpark} color={RD.green} /></div>
                {ratingSince && <p className="mt-1 text-[11px]" style={{ color: RD.muted }}>{ratingSince}</p>}
              </Card>
              <Card className="!p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-[13px]" style={{ color: RD.muted }}>Win Rate</p>
                  <Trophy size={18} style={{ color: RD.green }} />
                </div>
                <b className="block text-[30px] font-extrabold leading-tight">{decided > 0 ? `${winRate.toFixed(1)}%` : '—'}</b>
                <Delta value={winDelta} suffix="%" />
                <div className="mt-1 h-[46px]"><Sparkline id="rdWinSpark" values={monthlyAll.map((m) => m.winPct)} color={RD.green} /></div>
                <p className="mt-1 text-[11px]" style={{ color: RD.muted }}>Last 6 months</p>
              </Card>
            </div>

            <Card>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[17px] font-extrabold">Results Breakdown</h2>
                <span className="text-[12px]" style={{ color: RD.muted }}>{decided.toLocaleString()} games</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="grid h-[140px] w-[140px] shrink-0 place-items-center rounded-full" style={{ background: decided > 0 ? donut : RD.cardLight }}>
                  <div className="grid h-[92px] w-[92px] place-items-center rounded-full text-center" style={{ background: '#0B1213' }}>
                    <div>
                      <b className="block text-[24px] font-extrabold leading-none">{decided.toLocaleString()}</b>
                      <span className="text-[11px]" style={{ color: RD.muted }}>Total Games</span>
                    </div>
                  </div>
                </div>
                <div className="grid flex-1 gap-3">
                  {legend.map((l) => (
                    <div key={l.label} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: l.color }} />
                      <span className="flex-1 text-[14px]" style={{ color: 'rgba(245,247,246,.9)' }}>{l.label}</span>
                      <span className="text-right">
                        <b className="block text-[15px] leading-tight">{pct(l.n).toFixed(0)}%</b>
                        <span className="text-[11px]" style={{ color: RD.muted }}>{l.n.toLocaleString()}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {phases.length > 0 && (
              <Card>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-[17px] font-extrabold">Accuracy by Phase</h2>
                  <span className="text-[11.5px]" style={{ color: RD.muted }}>{summary.phaseAccuracy!.gamesAnalyzed} reviewed game{summary.phaseAccuracy!.gamesAnalyzed === 1 ? '' : 's'}</span>
                </div>
                <div className="grid gap-3.5">
                  {phases.map((ph) => (
                    <div key={ph.label} className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center">{PHASE_ICON[ph.label]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[14px] font-semibold">{ph.label}</span>
                          <b className="text-[14px]" style={{ color: RD.green }}>{ph.moves > 0 ? `${ph.accuracy}%` : '—'}</b>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
                          <div className="h-full rounded-full" style={{ width: `${ph.moves > 0 ? ph.accuracy : 0}%`, background: `linear-gradient(90deg, ${RD.greenDark}, ${RD.green})` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {keyInsight && (
              <div className="lg:col-span-2"><InsightCard icon={<Lightbulb size={30} style={{ color: RD.gold }} />} title="Key Insight" text={keyInsight} onClick={() => setTab('weaknesses')} /></div>
            )}
          </div>
        )}

        {tab === 'openings' && (
          <>
            <Card className="!p-2.5">
              <div className="flex items-center justify-between px-1.5 pb-2.5 pt-1.5">
                <h2 className="text-[16px] font-extrabold">Top Openings by Win Rate</h2>
                <Link href="/openings" className="flex items-center gap-0.5 text-[12.5px] font-bold" style={{ color: RD.green }}>All Openings <ChevronRight size={14} /></Link>
              </div>
              {openings.length ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {openings.map((o, i) => {
                    const [family, variation] = splitOpening(o.opening);
                    return (
                      <Link key={o.opening} href={`/openings/${encodeURIComponent(o.eco ?? o.opening)}`}
                        className="flex items-center gap-3 rounded-[14px] px-2.5 py-2.5 transition-transform active:scale-[.99]"
                        style={{ background: 'rgba(255,255,255,.025)', border: `1px solid ${RD.border}` }}>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[15px] font-extrabold" style={{ background: 'rgba(129,182,76,.12)', color: RD.green }}>{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-[14px] font-bold">{family}</b>
                          {variation && <span className="block truncate text-[13px]" style={{ color: 'rgba(245,247,246,.85)' }}>{variation}</span>}
                          <span className="block text-[11px]" style={{ color: RD.muted }}>{o.totalGames} games</span>
                          <span className="mt-1.5 flex items-center gap-2.5">
                            <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
                              <span className="block h-full rounded-full" style={{ width: `${Math.max(o.winRate, 3)}%`, background: o.winRate >= 50 ? `linear-gradient(90deg, ${RD.greenDark}, ${RD.green})` : RD.red }} />
                            </span>
                            <b className="w-11 text-right text-[13.5px]">{o.winRate}%</b>
                          </span>
                        </span>
                        <ChevronRight size={16} className="shrink-0" style={{ color: RD.muted }} />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="py-8 text-center text-[13px]" style={{ color: RD.muted }}>Play an opening at least 3 times to see its win rate here.</p>
              )}
            </Card>
            {openings.length > 0 && (
              <Card className="flex items-center gap-3 !py-3.5">
                <BarChart3 size={26} className="shrink-0" style={{ color: RD.muted }} />
                <p className="text-[12.5px] leading-snug" style={{ color: RD.muted }}>Openings played fewer than 3 times aren't shown — their win rate isn't reliable yet.</p>
              </Card>
            )}
          </>
        )}

        {tab === 'weaknesses' && (
          <>
            <div className="flex items-baseline justify-between px-1 pt-1">
              <h2 className="text-[17px] font-extrabold">Identified Weaknesses</h2>
              {weaknesses.length > 0 && <span className="text-[12px]" style={{ color: RD.muted }}>{weaknesses.length} found</span>}
            </div>
            {weaknesses.length ? (
              <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
                {weaknesses.map((w) => {
                  const sev = SEV_STYLE[w.severity] ?? SEV_STYLE.Low;
                  const v = weaknessView(w, openingWinRate);
                  return (
                    <Card key={w.id} className="!p-0 overflow-hidden">
                      <Link href={`/analysis/${w.id}`} className="flex items-start gap-3 p-3.5">
                        <span className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[12px] font-extrabold" style={{ background: sev.bg, color: sev.fg, border: `1px solid ${sev.border}` }}>{w.severity}</span>
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center" style={{ color: RD.text }}>{v.icon}</span>
                        <span className="min-w-0 flex-1">
                          <b className="block text-[15px] font-extrabold">{w.category}</b>
                          <span className="mt-0.5 block text-[12.5px] leading-snug line-clamp-2" style={{ color: 'rgba(245,247,246,.78)' }}>{v.summary}</span>
                        </span>
                        <ChevronRight size={16} className="mt-1 shrink-0" style={{ color: RD.muted }} />
                      </Link>
                      <div className="flex items-center gap-3 px-3.5 pb-3.5 pt-3" style={{ borderTop: `1px solid ${RD.border}` }}>
                        {v.stats.map((st, i) => (
                          <div key={st.label} className="flex min-w-0 items-center gap-2" style={i ? { borderLeft: `1px solid ${RD.border}`, paddingLeft: 12 } : undefined}>
                            {i === 0 ? <Target size={18} className="shrink-0" style={{ color: RD.red }} /> : <Gamepad2 size={18} className="shrink-0" style={{ color: RD.muted }} />}
                            <span className="min-w-0">
                              <b className="block text-[15px] font-extrabold leading-tight">{st.value}</b>
                              <span className="block truncate text-[10.5px]" style={{ color: RD.muted }}>{st.label}</span>
                            </span>
                          </div>
                        ))}
                        <Link href={`/analysis/${w.id}`} className="ml-auto shrink-0 rounded-[11px] px-4 py-2 text-[13px] font-extrabold" style={{ color: RD.green, border: `1.5px solid ${RD.green}` }}>
                          {v.cta}
                        </Link>
                      </div>
                    </Card>
                  );
                })}
                <div className="lg:col-span-2"><InsightCard icon={<GraduationCap size={30} style={{ color: RD.green }} />} title="Where to start" text="Work on your High priority areas first — they show up most often in your games." /></div>
              </div>
            ) : (
              <Card>
                <div className="py-8 text-center" style={{ color: RD.muted }}>
                  <Target size={28} className="mx-auto mb-2 opacity-50" />
                  <p className="text-[13px]">No weaknesses found yet.</p>
                  <p className="mt-0.5 text-[12px]">Run Deep Analysis to discover your patterns.</p>
                </div>
              </Card>
            )}
          </>
        )}

        {tab === 'trends' && (
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
            {monthlyAll.length > 0 && (
              <Card>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 className="text-[16px] font-extrabold">Win Rate, Last {winRange} Months</h2>
                  <RangePicker value={winRange} options={[3, 6]} onChange={setWinRange} />
                </div>
                {monthly.length > 0
                  ? <TrendChart id="rdWin" color={RD.green} data={monthly.map((m) => ({ label: m.label, long: m.long, value: m.winPct }))} />
                  : <p className="py-10 text-center text-[13px]" style={{ color: RD.muted }}>No games in this period.</p>}
                {monthly.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {winPair && <StatTile icon={winDelta >= 0 ? <ArrowUp size={18} /> : <ArrowDown size={18} />} color={winDelta >= 0 ? RD.green : RD.red} value={signed(winDelta)} label={`vs. ${winPair[0].label}`} />}
                    <StatTile icon={<Trophy size={18} />} value={`${monthly[monthly.length - 1].winPct}%`} label="Current win rate" />
                    <StatTile icon={<BarChart3 size={18} />} value={`${Math.max(...monthly.map((m) => m.winPct))}%`} label="Peak win rate" />
                  </div>
                )}
              </Card>
            )}
            {accuracyAll.length > 0 && (
              <Card>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 className="text-[16px] font-extrabold">Accuracy Over Time</h2>
                  <RangePicker value={accRange} options={accOptions} onChange={setAccRange} />
                </div>
                {accuracy.length > 0
                  ? <TrendChart id="rdAcc" color={RD.gold} data={accuracy.map((a) => ({ label: a.label, long: a.long, value: a.accuracy }))} />
                  : <p className="py-10 text-center text-[13px]" style={{ color: RD.muted }}>No reviewed games in this period.</p>}
                {accuracy.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {accPair && <StatTile icon={accDelta >= 0 ? <ArrowUp size={18} /> : <ArrowDown size={18} />} color={accDelta >= 0 ? RD.green : RD.red} value={signed(accDelta)} label={`vs. ${accPair[0].label}`} />}
                    <StatTile icon={<Gauge size={18} />} color={RD.gold} value={`${accuracy[accuracy.length - 1].accuracy}%`} label="Current accuracy" />
                    <StatTile icon={<Target size={18} />} value={`${Math.max(...accuracy.map((a) => a.accuracy))}%`} label="Peak accuracy" />
                  </div>
                )}
              </Card>
            )}
            {trend && (
              <div className="lg:col-span-2"><InsightCard
                icon={trend.up ? <TrendingUp size={30} style={{ color: RD.green }} /> : <TrendingDown size={30} style={{ color: RD.red }} />}
                title={trend.title} text={trend.text} onClick={trend.up ? undefined : () => setTab('weaknesses')} /></div>
            )}
            {monthlyAll.length === 0 && accuracyAll.length === 0 && (
              <div className="lg:col-span-2"><Card><p className="py-8 text-center text-[13px]" style={{ color: RD.muted }}>Trends appear once you have a few months of games.</p></Card></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
