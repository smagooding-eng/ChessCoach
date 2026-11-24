import React, { useState } from 'react';
import { ScoutIcon } from '@/components/ScoutIcons';
import { Link } from 'wouter';
import { ChevronRight, ChevronDown, Target, BarChart3, Trophy, BookOpen, Lightbulb, Swords, Crosshair, Gamepad2, GraduationCap, Calendar, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Gauge, CheckCircle2 } from 'lucide-react';
import { useMyCourses } from '@/hooks/use-courses';
import { ProUpsell } from '@/components/ProUpsell';
import { MiniBoard } from '@/components/MiniBoard';
import { K, CoachTake, Panel, ActionRow, BigStat, Ring, Medal, firstSentence } from '@/components/analytics/Kit';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyOpenings } from '@/hooks/use-openings';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useUser } from '@/hooks/use-user';
import { RD } from '@/lib/redesignTheme';
import { RedesignHeader } from '@/components/RedesignHeader';
import type { WeaknessRecord } from '@workspace/api-client-react';
import { useSwipeTabs } from '@/lib/swipeNav';
import { NEUTRAL_CHIP } from '@/lib/redesignTheme';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

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
  { id: 'weaknesses', label: 'Weaknesses' },
  { id: 'courses', label: 'Courses' },
  { id: 'openings', label: 'Openings' },
  { id: 'endgames', label: 'Endgames' },
  { id: 'trends', label: 'Trends' },
] as const;
type TabId = (typeof TABS)[number]['id'];
// /analysis?tab=weaknesses etc. opens straight on that tab
const initialTab = (): TabId => {
  try {
    const t = new URLSearchParams(window.location.search).get('tab');
    return (TABS.find((x) => x.id === t)?.id ?? 'overview') as TabId;
  } catch { return 'overview'; }
};

function SectionHead({ title, onMore, more = 'See all' }: { title: string; onMore?: () => void; more?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-[17px] font-extrabold">{title}</h2>
      {onMore && <button onClick={onMore} className="flex items-center gap-0.5 text-[12.5px] font-bold" style={{ color: RD.green }}>{more} <ChevronRight size={14} /></button>}
    </div>
  );
}

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
  if (m && m[2]) return [m[1], m[2].replace(/^[:\s,–—-]+/, '')];
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

/** Rating over time: an area chart with a few gridlines, the start date and today. */
function RatingTrendChart({ values, since }: { values: number[]; since: string | null }) {
  if (values.length < 2) return <div className="grid h-[150px] place-items-center text-[12.5px]" style={{ color: RD.muted }}>Not enough games yet</div>;
  const W = 320, H = 150, L = 34, R = 8, T = 8, B = 20;
  const lo = Math.min(...values), hi = Math.max(...values);
  const step = Math.max(10, Math.ceil((hi - lo) / 4 / 10) * 10 || 50);
  const y0 = Math.floor(lo / step) * step, y1 = Math.max(y0 + step, Math.ceil(hi / step) * step);
  const ticks: number[] = []; for (let v = y0; v <= y1; v += step) ticks.push(v);
  const x = (i: number) => L + (i / (values.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
      <defs><linearGradient id="rtArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={RD.green} stopOpacity=".45" /><stop offset="1" stopColor={RD.green} stopOpacity="0" /></linearGradient></defs>
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.07)" /><text x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill={RD.muted}>{v.toLocaleString()}</text></g>)}
      <path d={`${line} L${x(values.length - 1)} ${H - B} L${L} ${H - B} Z`} fill="url(#rtArea)" />
      <path d={line} fill="none" stroke={RD.green} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="4" fill={RD.green} stroke="#0B1213" strokeWidth="1.5" />
      <text x={L} y={H - 5} fontSize="9" fill={RD.muted}>{since?.replace('Since ', '') ?? ''}</text>
      <text x={W - R} y={H - 5} textAnchor="end" fontSize="9" fill={RD.muted}>Now</text>
    </svg>
  );
}

/** A soft area line (win rate by month). */
function AreaLine({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 300, H = 70, lo = Math.min(...values) - 5, hi = Math.max(...values) + 5;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 4 - ((v - lo) / Math.max(1, hi - lo)) * (H - 10)] as const);
  // smooth curve through the points
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const [px, py] = pts[i - 1], [cx, cy] = pts[i], mx = (px + cx) / 2; d += ` C${mx} ${py} ${mx} ${cy} ${cx} ${cy}`; }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[70px] w-full" aria-hidden="true">
      <defs><linearGradient id="wrArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={RD.green} stopOpacity=".4" /><stop offset="1" stopColor={RD.green} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#wrArea)" />
      <path d={d} fill="none" stroke={RD.green} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
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
      style={{ background: '#0D1516', border: '1.5px solid rgba(129,182,76,.55)' }}>
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
  const { username, isPremium, authUser, isSubscriptionLoaded } = useUser();
  const freePlan = isSubscriptionLoaded && !!authUser && !isPremium;
  const { data: coursesData } = useMyCourses();
  const { data: summary } = useMyAnalysisSummary();
  const { data: weaknessesData } = useMyWeaknesses();
  const { data: openingsData, isLoading: openingsLoading, isError: openingsError, refetch: refetchOpenings } = useMyOpenings();
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const [tab, setTabState] = useState<TabId>(initialTab);
  const setTab = (t: TabId) => {
    setTabState(t);
    try { window.history.replaceState(null, '', t === 'overview' ? window.location.pathname : `${window.location.pathname}?tab=${t}`); } catch { /* ignore */ }
  };
  useSwipeTabs(TABS.map((t) => t.id), tab, setTab);
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

  const PHASE_ICON: Record<string, React.ReactNode> = {
    Opening: <ScoutIcon name="openings" size={32} />,
    Middlegame: <ScoutIcon name="recent-games" size={32} />,
    Endgame: <ScoutIcon name="endgames" size={32} />,
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
  const courses = coursesData?.courses ?? [];
  const coursePct = (c: { completedLessons: number; totalLessons: number }) => Math.round((c.completedLessons / Math.max(1, c.totalLessons)) * 100) || 0;

  const courseRow = (c: { id: number; title: string; completedLessons: number; totalLessons: number }) => {
    const p = coursePct(c);
    return (
      <Link key={c.id} href={`/courses/${c.id}`} className="flex items-center gap-3 rounded-[14px] px-3 py-3 transition-transform active:scale-[.99]"
        style={{ background: 'rgba(255,255,255,.025)', border: `1px solid ${RD.border}` }}>
        {p >= 100 ? <ScoutIcon name="badges" size={38} className="shrink-0" /> : <ScoutIcon name="courses" size={38} className="shrink-0" />}
        <span className="min-w-0 flex-1">
          <b className="line-clamp-1 block text-[14px] font-bold">{c.title}</b>
          <span className="mt-1.5 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.10)' }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(p, p > 0 ? 3 : 0)}%`, background: RD.green }} />
            </span>
            <span className="text-[11px]" style={{ color: RD.muted }}>{c.completedLessons}/{c.totalLessons}</span>
          </span>
        </span>
        <b className="w-10 shrink-0 text-right text-[13px]" style={{ color: RD.green }}>{p}%</b>
      </Link>
    );
  };

  return (
    <div className="min-h-screen px-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid grid-cols-1 w-full max-w-[760px] gap-3 lg:max-w-[1200px]">
        <RedesignHeader title="My Analytics" icon={<ScoutIcon name="progress" size={32} />} />
        <p className="-mt-2 px-1 text-[13.5px]" style={{ color: RD.muted }}>Understand your game. Train what matters.</p>

        <div data-swipe-tabs className="flex gap-0.5 overflow-x-auto rounded-[16px] p-1 [scrollbar-width:none] lg:max-w-[820px] [&::-webkit-scrollbar]:hidden" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} ref={active ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined} onClick={() => setTab(t.id)} className="shrink-0 grow whitespace-nowrap rounded-[12px] px-3 py-2.5 text-[12.5px] font-bold transition-colors md:text-[13px]"
                style={active ? { background: '#1E3A1C', color: RD.text, boxShadow: `inset 0 0 0 1.5px ${RD.green}` } : { background: 'transparent', color: RD.muted }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'overview' && (() => {
          const top = weaknesses[0];
          const accNow = accuracyAll.length ? accuracyAll[accuracyAll.length - 1].accuracy : null;
          const weakest = measured.length >= 2 ? [...measured].sort((a, b) => a.accuracy - b.accuracy)[0] : null;
          const PHASE_DRILL: Record<string, { href: string; icon: string }> = { Opening: { href: '/openings', icon: 'openings' }, Middlegame: { href: '/tactics', icon: 'tactics' }, Endgame: { href: '/endgames', icon: 'endgames' } };
          const doing = courses.filter((c) => coursePct(c) < 100).sort((a, b) => coursePct(b) - coursePct(a))[0];
          const worstOpening = openingsData?.openings ? [...openingsData.openings].filter((o) => o.totalGames >= 5 && o.winRate < 50).sort((a, b) => a.winRate - b.winRate)[0] : undefined;
          const steps: { icon: string; title: string; sub: string; action: string; href: string }[] = [];
          if (doing) steps.push({ icon: 'courses', title: doing.title, sub: `${doing.completedLessons} of ${doing.totalLessons} lessons done`, action: 'Continue', href: `/courses/${doing.id}` });
          if (weakest && PHASE_DRILL[weakest.label]) steps.push({ icon: PHASE_DRILL[weakest.label].icon, title: `Sharpen your ${weakest.label.toLowerCase()}`, sub: `Your weakest phase at ${weakest.accuracy}% accuracy`, action: 'Practice', href: PHASE_DRILL[weakest.label].href });
          if (worstOpening) steps.push({ icon: 'openings', title: splitOpening(worstOpening.opening)[0], sub: `You win ${worstOpening.winRate}% of ${worstOpening.totalGames} games with it`, action: 'Drill', href: worstOpening.eco ? `/practice?tab=openings&eco=${encodeURIComponent(worstOpening.eco)}` : '/openings' });
          if (weaknesses[1]) steps.push({ icon: 'opponent-scout', title: weaknesses[1].category, sub: firstSentence(weaknesses[1].description), action: 'Train', href: `/analysis/${weaknesses[1].id}` });
          return (
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <div className="lg:col-span-2">
                {top ? (
                  <CoachTake icon="opponent-scout" headline={`Your biggest leak: ${top.category}`} detail={firstSentence(weaknessView(top, openingWinRate).summary)}
                    action="Train it" href={`/analysis/${top.id}`} board={top.previewFen ? <MiniBoard fen={top.previewFen} size={132} /> : undefined} />
                ) : keyInsight ? (
                  <CoachTake icon="skill-map" headline={keyInsight} action="See your weaknesses" onAction={() => setTab('weaknesses')} />
                ) : (
                  <CoachTake icon="report-card" headline="Review a few of your games and your coach will find your patterns." action="Go to your games" href="/games" />
                )}
              </div>

              <Panel title="At a glance">
                <div className="grid grid-cols-3 gap-2">
                  <BigStat value={rating != null ? String(rating) : '—'} label="Rating" delta={rating != null ? ratingDelta : null} />
                  <BigStat value={decided > 0 ? `${Math.round(winRate)}%` : '—'} label="Win rate" delta={winDelta} suffix="%" />
                  <BigStat value={accNow != null ? `${accNow}%` : '—'} label="Accuracy" delta={accPair ? accDelta : null} suffix="%" />
                </div>
                <p className="mt-3 text-center text-[12px]" style={{ color: K.muted }}>{(summary.totalGames ?? 0).toLocaleString()} games · {(summary.reviewedCount ?? 0).toLocaleString()} reviewed</p>
              </Panel>

              {phases.length > 0 && (
                <Panel title="Accuracy by phase">
                  <div className="grid grid-cols-3 gap-2">
                    {phases.map((ph) => {
                      const isWeak = weakest?.label === ph.label;
                      return (
                        <div key={ph.label} className="flex flex-col items-center gap-1.5 text-center">
                          <Ring pct={ph.moves > 0 ? ph.accuracy : null} size={70} color={isWeak ? K.gold : K.green} />
                          <b className="text-[13.5px]" style={{ color: K.text }}>{ph.label}</b>
                          <span className="text-[11.5px] font-bold" style={{ color: isWeak ? K.gold : K.muted }}>{isWeak ? 'Weakest' : ' '}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-center text-[12px]" style={{ color: K.muted }}>From {summary.phaseAccuracy!.gamesAnalyzed} reviewed game{summary.phaseAccuracy!.gamesAnalyzed === 1 ? '' : 's'}</p>
                </Panel>
              )}

              <Panel title="Rating trend">
                {ratingSince && <p className="-mt-2 mb-2 text-[12px]" style={{ color: K.muted }}>{ratingSince}</p>}
                <RatingTrendChart values={ratingSpark} since={ratingSince} />
              </Panel>

              <Panel title="Your next steps">
                {steps.length ? <div className="grid gap-2.5">{steps.slice(0, 3).map((st) => <ActionRow key={st.title} {...st} />)}</div>
                  : <p className="py-4 text-center text-[13px]" style={{ color: K.muted }}>Your next steps show up once a few games are reviewed.</p>}
              </Panel>
            </div>
          );
        })()}

        {tab === 'courses' && (() => {
          const going = courses.filter((c) => coursePct(c) < 100).sort((a, b) => coursePct(b) - coursePct(a));
          const done = courses.filter((c) => coursePct(c) >= 100);
          const row = (c: (typeof courses)[number]) => (
            <Link key={c.id} href={`/courses/${c.id}`} className="flex items-center gap-3 rounded-[16px] p-3 transition-transform active:scale-[.99]" style={{ background: K.card2, border: `1px solid ${K.line}` }}>
              <Ring pct={coursePct(c)} size={50} stroke={5} />
              <span className="min-w-0 flex-1">
                <b className="line-clamp-2 block text-[14.5px] font-extrabold leading-snug" style={{ color: K.text }}>{c.title}</b>
                <span className="text-[12px]" style={{ color: K.muted }}>{c.completedLessons} of {c.totalLessons} lessons</span>
              </span>
              <ChevronRight size={17} className="shrink-0" style={{ color: K.muted }} />
            </Link>
          );
          return (
            <div className="grid gap-4">
              {going[0] ? (
                <CoachTake icon="courses" headline={`Pick up where you left off: ${going[0].title}`} detail={`${going[0].completedLessons} of ${going[0].totalLessons} lessons done. Each lesson takes a few minutes.`} action="Continue" href={`/courses/${going[0].id}`} board={<Ring pct={coursePct(going[0])} size={96} stroke={8} />} />
              ) : courses.length ? (
                <CoachTake icon="badges" headline="Every course finished. Nice work." detail="Build a new one from a weakness to keep improving." action="See weaknesses" onAction={() => setTab('weaknesses')} />
              ) : !freePlan ? (
                <CoachTake icon="courses" headline="Turn a weakness into a course." detail="Open one of your weaknesses and build short lessons from the positions where you went wrong." action="See weaknesses" onAction={() => setTab('weaknesses')} />
              ) : null}
              {freePlan && <ProUpsell title="Get courses built from your own games" text="Your coach turns the mistakes Stockfish finds in your games into short lessons and drills." perks={['Lessons from your real positions', 'Your coach on every game you review', 'Coach scouting reports on your opponents']} />}
              {going.length > 1 && <Panel title="In progress"><div className="grid gap-2.5 lg:grid-cols-2">{going.slice(1).map(row)}</div></Panel>}
              {done.length > 0 && <Panel title="Completed" more="Course library" href="/courses"><div className="grid gap-2.5 lg:grid-cols-2">{done.map(row)}</div></Panel>}
              {!done.length && <Link href="/courses" className="text-center text-[13.5px] font-bold" style={{ color: K.green }}>Browse the course library</Link>}
            </div>
          );
        })()}

        {tab === 'openings' && (() => {
          const all = openingsData?.openings ? [...openingsData.openings].filter((o) => o.totalGames >= 3) : [];
          const strong = [...all].filter((o) => o.winRate >= 50).sort((a, b) => b.winRate - a.winRate || b.totalGames - a.totalGames).slice(0, 4);
          const weak = [...all].filter((o) => o.winRate < 50).sort((a, b) => a.winRate - b.winRate || b.totalGames - a.totalGames).slice(0, 4);
          const drill = (o: (typeof all)[number]) => (o.eco ? `/practice?tab=openings&eco=${encodeURIComponent(o.eco)}` : '/openings');
          const row = (o: (typeof all)[number], bad: boolean) => {
            const [family, variation] = splitOpening(o.opening);
            return (
              <Link key={o.opening} href={`/openings/${encodeURIComponent(o.eco ?? o.opening)}`} className="flex items-center gap-3 rounded-[16px] p-3 transition-transform active:scale-[.99]" style={{ background: K.card2, border: `1px solid ${K.line}` }}>
                <Ring pct={o.winRate} size={50} stroke={5} color={bad ? K.red : K.green} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px] font-extrabold" style={{ color: K.text }}>{family}</b>
                  {variation && <span className="block truncate text-[12.5px]" style={{ color: 'rgba(245,247,246,.75)' }}>{variation}</span>}
                  <span className="text-[12px]" style={{ color: K.muted }}>{o.totalGames} games · {o.wins}W {o.draws}D {o.losses}L</span>
                </span>
                <ChevronRight size={17} className="shrink-0" style={{ color: K.muted }} />
              </Link>
            );
          };
          if (openingsLoading) return <div className="grid gap-3">{[0, 1, 2].map((k) => <div key={k} className="h-[90px] animate-pulse rounded-[20px]" style={{ background: K.card }} />)}</div>;
          if (openingsError) return <Panel><p className="py-6 text-center text-[13px]" style={{ color: K.muted }}>Couldn’t load your openings. <button onClick={() => void refetchOpenings()} className="font-bold underline" style={{ color: K.green }}>Try again</button></p></Panel>;
          if (!all.length) return <CoachTake icon="openings" headline="Play an opening a few times and your coach will rate it." detail="Openings show up here once you've played one at least 3 times." action="Explore openings" href="/openings" />;
          return (
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <div className="lg:col-span-2">
                {weak[0] ? (
                  <CoachTake icon="openings" headline={`${splitOpening(weak[0].opening)[0]} is costing you games`} detail={`You win ${weak[0].winRate}% of your ${weak[0].totalGames} games with it. A few minutes drilling the main line pays off quickly.`} action="Drill this opening" href={drill(weak[0])} board={<Ring pct={weak[0].winRate} size={96} stroke={8} color={K.red} />} />
                ) : (
                  strong[0] && <CoachTake icon="openings" headline={`Your best weapon: ${splitOpening(strong[0].opening)[0]}`} detail={`You win ${strong[0].winRate}% of your ${strong[0].totalGames} games with it. Keep playing it.`} action="Practise it" href={drill(strong[0])} board={<Ring pct={strong[0].winRate} size={96} stroke={8} />} />
                )}
              </div>
              {strong.length > 0 && <Panel title="Your strongest" more="All openings" href="/openings"><div className="grid gap-2.5">{strong.map((o) => row(o, false))}</div></Panel>}
              {weak.length > 0 && <Panel title="Needs work"><div className="grid gap-2.5">{weak.map((o) => row(o, true))}</div></Panel>}
              <p className="text-center text-[12px] lg:col-span-2" style={{ color: K.muted }}>Openings played fewer than 3 times aren't rated yet.</p>
            </div>
          );
        })()}

        {tab === 'weaknesses' && (
          <div className="grid gap-4">
            {weaknesses.length ? (
              <CoachTake icon="opponent-scout" headline={`Start with ${weaknesses[0].category}.`} detail={`It's your ${weaknesses[0].severity.toLowerCase()} priority and shows up most in your games. Fix one at a time.`} action="Train it" href={`/analysis/${weaknesses[0].id}`} />
            ) : (
              <CoachTake icon="opponent-scout" headline="No weaknesses found yet." detail="Your coach finds your patterns once your games are reviewed." action="Go to your games" href="/games" />
            )}
            {weaknesses.length > 0 && (
              <div className="grid gap-3 lg:grid-cols-2">
                {weaknesses.map((w) => {
                  const sev = SEV_STYLE[w.severity] ?? SEV_STYLE.Low;
                  const v = weaknessView(w, openingWinRate);
                  return (
                    <Link key={w.id} href={`/analysis/${w.id}`} className="flex gap-3.5 rounded-[20px] p-3.5 transition-transform active:scale-[.99]" style={{ background: K.card, border: `1px solid ${K.line}` }}>
                      <div className="shrink-0">{w.previewFen ? <div className="overflow-hidden rounded-[10px]"><MiniBoard fen={w.previewFen} size={96} /></div> : <Medal icon="opponent-scout" size={60} />}</div>
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={{ background: K.card2, color: sev.fg }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: sev.fg }} />{w.severity}</span>
                        <b className="mt-1 block text-[16px] font-extrabold leading-tight" style={{ color: K.text }}>{w.category}</b>
                        <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug" style={{ color: 'rgba(245,247,246,.75)' }}>{v.summary}</span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span className="truncate text-[12px]" style={{ color: K.muted }}>{v.stats.map((st) => `${st.value} ${st.label.toLowerCase()}`).join(' · ')}</span>
                          <span className="shrink-0 rounded-[11px] px-3 py-1.5 text-[12.5px] font-extrabold text-white" style={{ background: K.green }}>{v.cta}</span>
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            {freePlan && weaknesses.length > 0 && <ProUpsell compact title="Turn these into a course" text="Pro builds lessons from the exact positions where you went wrong." />}
          </div>
        )}

        {tab === 'endgames' && <EndgamesTab />}

        {tab === 'trends' && (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Panel title="Results" className="lg:col-span-2">
              <div className="grid gap-3">
                {legend.map((l) => (
                  <div key={l.label} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-[14px]" style={{ color: K.text }}>{l.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(pct(l.n), l.n ? 2 : 0)}%`, background: l.color }} /></div>
                    <b className="w-11 shrink-0 text-right text-[14px]">{pct(l.n).toFixed(0)}%</b>
                    <span className="w-12 shrink-0 text-right text-[12px]" style={{ color: K.muted }}>{l.n.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Panel>
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

type EndgameStats = {
  totalGames: number; endgameGames: number; reachedPct: number;
  overall: { games: number; wins: number; draws: number; losses: number; winRate: number; score: number };
  allScore: number;
  byKind: Array<{ kind: string; label: string; games: number; wins: number; draws: number; losses: number; winRate: number; score: number;
    recent: Array<{ id: number; opponent: string; result: string; playedAt: string }> }>;
  conversion: {
    ahead: { games: number; won: number; pct: number };
    equal: { games: number; wins: number; draws: number; losses: number; score: number };
    behind: { games: number; saved: number; pct: number };
  };
  pending: number;
};

const KIND_ICON: Record<string, string> = { pawn: 'wP', minor: 'wN', rook: 'wR', rook_minor: 'wR', queen: 'wQ' };

function ResultBar({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const n = wins + draws + losses || 1;
  return (
    <span className="flex h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
      <span style={{ width: `${(wins / n) * 100}%`, background: RD.green }} />
      <span style={{ width: `${(draws / n) * 100}%`, background: 'rgba(255,255,255,.35)' }} />
      <span style={{ width: `${(losses / n) * 100}%`, background: RD.red }} />
    </span>
  );
}

function EndgamesTab() {
  const { isAuthenticated } = useUser();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery<EndgameStats>({
    queryKey: ['/api/endgame-stats'],
    queryFn: async () => {
      const res = await apiFetch('/api/endgame-stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    // A first visit works through your games in steps: keep going until all are in.
    refetchInterval: (q) => ((q.state.data as EndgameStats | undefined)?.pending ? 1500 : false),
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1].map((k) => <div key={k} className="h-[220px] animate-pulse rounded-[20px]" style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${RD.border}` }} />)}
      </div>
    );
  }
  if (isError || !data) {
    return <Card><div className="py-8 text-center text-[13px]" style={{ color: RD.muted }}>Couldn’t load your endgame stats. <button onClick={() => void refetch()} className="font-bold underline" style={{ color: RD.green }}>Try again</button></div></Card>;
  }
  if (data.endgameGames === 0) {
    return (
      <Card>
        <p className="py-8 text-center text-[13px]" style={{ color: RD.muted }}>
          {data.pending > 0 ? 'Going through your games…' : 'None of your games have reached an endgame yet. Once one does, your endgame stats show up here.'}
        </p>
      </Card>
    );
  }

  const c = data.conversion;
  const diff = data.overall.score - data.allScore;
  const kinds = data.byKind.filter((k) => k.games >= 3);
  const worstKind = [...kinds].sort((a, b) => a.winRate - b.winRate)[0];
  const take = c.ahead.games >= 3 && c.ahead.pct < 75
    ? { headline: 'You let winning endgames slip.', detail: `When you're up 2 or more pawns, you only win ${c.ahead.pct}% of the time (${c.ahead.games} games). Converting is the fastest rating gain there is.` }
    : worstKind && worstKind.winRate < 45
      ? { headline: `${worstKind.label} endgames are your weak spot.`, detail: `You win ${worstKind.winRate}% of them (${worstKind.games} games). A little technique goes a long way.` }
      : diff >= 0
        ? { headline: 'Endgames are a strength of yours.', detail: `You score ${data.overall.score}% once the board empties, ${diff} points better than your games overall.` }
        : { headline: 'Your results dip in the endgame.', detail: `You score ${data.overall.score}% in endgames, ${Math.abs(diff)} points below your games overall.` };
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="lg:col-span-2"><CoachTake icon="endgames" headline={take.headline} detail={take.detail} action="Practise endgames" href="/endgames" /></div>

      <Panel title="Turning endgames into results">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Won when ahead', pct: c.ahead.pct, games: c.ahead.games },
            { label: 'Saved when behind', pct: c.behind.pct, games: c.behind.games },
            { label: 'Score when equal', pct: c.equal.score, games: c.equal.games },
          ].map((r) => (
            <div key={r.label} className="flex flex-col items-center gap-1.5 text-center">
              <Ring pct={r.games ? r.pct : null} size={70} color={r.pct >= 50 ? K.green : K.gold} />
              <b className="text-[12.5px] leading-tight" style={{ color: K.text }}>{r.label}</b>
              <span className="text-[11.5px]" style={{ color: K.muted }}>{r.games} game{r.games === 1 ? '' : 's'}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[12px]" style={{ color: K.muted }}>{data.endgameGames} endgames · {data.reachedPct}% of your games{data.pending > 0 ? ` · adding ${data.pending} more…` : ''}</p>
      </Panel>

      <Panel title="By endgame type" more="Practise" href="/endgames">
        <div className="grid gap-2.5">
          {data.byKind.map((k) => {
            const isOpen = open === k.kind;
            return (
              <div key={k.kind} className="rounded-[16px]" style={{ background: K.card2, border: `1px solid ${K.line}` }}>
                <button onClick={() => setOpen(isOpen ? null : k.kind)} className="flex w-full items-center gap-3 p-3 text-left">
                  <Ring pct={k.winRate} size={46} stroke={5} color={k.winRate >= 50 ? K.green : K.gold} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] font-extrabold" style={{ color: K.text }}>{k.label}</b>
                    <span className="text-[12px]" style={{ color: K.muted }}>{k.games} games · {k.wins}W {k.draws}D {k.losses}L</span>
                  </span>
                  <ChevronDown size={17} className="shrink-0 transition-transform" style={{ color: K.muted, transform: isOpen ? 'rotate(180deg)' : undefined }} />
                </button>
                {isOpen && (
                  <div className="space-y-1 px-3 pb-3">
                    {k.recent.map((g) => (
                      <Link key={g.id} href={`/games/${g.id}`} className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-[12.5px]" style={{ background: 'rgba(255,255,255,.03)' }}>
                        <span className="min-w-0 truncate">vs {g.opponent}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <b style={{ color: g.result === 'win' ? K.green : g.result === 'loss' ? K.red : K.muted }}>{g.result === 'win' ? 'Won' : g.result === 'loss' ? 'Lost' : 'Draw'}</b>
                          <span style={{ color: K.muted }}>{new Date(g.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                          <ChevronRight size={14} style={{ color: K.muted }} />
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11.5px]" style={{ color: K.muted }}>An endgame starts once each side has a rook and a minor piece or less, besides pawns.</p>
      </Panel>
    </div>
  );
}
