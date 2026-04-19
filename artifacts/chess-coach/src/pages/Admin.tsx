import { useEffect, useState, useCallback } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { RefreshCw, Users, Eye, UserCheck, CreditCard, Gamepad2, Brain, Swords, Camera } from 'lucide-react';

interface AdminStats {
  pageViews: { total: number; today: number };
  uniqueVisitors: { total: number; today: number };
  users: { total: number; today: number };
  subscriptions: { active: number; trialing: number; canceled: number; pastDue: number; total: number };
  games: { total: number; today: number; analyzed: number };
  activity: { opponentsScoutedTotal: number; uniqueOpponentsScouted: number; positionScans: number };
  topPages: { path: string; views: number; uniqueVisitors: number }[];
}

const PATH_LABELS: Record<string, string> = {
  '/': 'Home / Dashboard',
  '/import': 'Import Games',
  '/games': 'Games List',
  '/analysis': 'Analysis',
  '/courses': 'Courses',
  '/endgames': 'Endgames',
  '/openings': 'Openings',
  '/opponents': 'Opponent Scout',
  '/practice': 'Practice Bots',
  '/play': 'Play Local',
  '/lookup': 'Game Lookup',
  '/puzzles': 'Puzzles',
  '/scan': 'Scan Position',
  '/subscription': 'Subscription',
  '/profile': 'Profile',
  '/setup': 'Login / Signup',
  '/admin': 'Admin Dashboard',
};

function labelForPath(path: string): string {
  if (PATH_LABELS[path]) return PATH_LABELS[path];
  if (path.startsWith('/games/')) return 'Game Replay';
  if (path.startsWith('/analysis/')) return 'Weakness Detail';
  if (path.startsWith('/courses/')) return 'Course Detail';
  if (path.startsWith('/openings/')) return 'Opening Detail';
  return path;
}

const CHESSCOM_GREEN = '#81b64c';
const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';

function fmt(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function StatCard({
  icon: Icon,
  label,
  primary,
  primaryLabel,
  secondary,
  secondaryLabel,
  accent,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  primary: number | undefined;
  primaryLabel: string;
  secondary?: number | undefined;
  secondaryLabel?: string;
  accent?: string;
}) {
  const color = accent ?? CHESSCOM_GREEN;
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: BG_CARD, border: `1px solid rgba(255,255,255,0.05)` }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}1a` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: TEXT_MUTED }}>
          {label}
        </p>
      </div>
      <div className="flex items-end gap-4">
        <div>
          <p className="text-2xl font-black leading-none" style={{ color: TEXT_LIGHT }}>
            {fmt(primary)}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wide mt-1" style={{ color: TEXT_MUTED }}>
            {primaryLabel}
          </p>
        </div>
        {secondary != null && secondaryLabel && (
          <div>
            <p className="text-base font-bold leading-none" style={{ color }}>
              {fmt(secondary)}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wide mt-1" style={{ color: TEXT_MUTED }}>
              {secondaryLabel}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function Admin() {
  const { authUser, isAuthLoading } = useUser();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthLoading && !authUser?.isAdmin) {
      navigate('/', { replace: true } as never);
    }
  }, [isAuthLoading, authUser, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/stats', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AdminStats;
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser?.isAdmin) load();
  }, [authUser, load]);

  if (isAuthLoading || !authUser?.isAdmin) {
    return null;
  }

  return (
    <div className="px-3 md:px-0 pt-4 md:pt-0 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <PageHero piece="♚" title="Admin Dashboard" subtitle="Combined user and activity stats across the entire app." />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
          style={{
            background: `${CHESSCOM_GREEN}1a`,
            color: CHESSCOM_GREEN,
            border: `1px solid ${CHESSCOM_GREEN}33`,
          }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          className="rounded-xl p-3 text-sm"
          style={{ background: 'rgba(220,67,67,0.1)', border: '1px solid rgba(220,67,67,0.3)', color: '#dc4343' }}
        >
          {error}
        </div>
      )}

      {loading && !stats && (
        <div className="flex items-center justify-center py-16" style={{ color: TEXT_MUTED }}>
          Loading…
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            icon={Users}
            label="Users"
            primary={stats.users.total}
            primaryLabel="Total"
            secondary={stats.users.today}
            secondaryLabel="Today"
          />
          <StatCard
            icon={Eye}
            label="Page Views"
            primary={stats.pageViews.total}
            primaryLabel="Total"
            secondary={stats.pageViews.today}
            secondaryLabel="Today"
          />
          <StatCard
            icon={UserCheck}
            label="Unique Visitors"
            primary={stats.uniqueVisitors.total}
            primaryLabel="Total"
            secondary={stats.uniqueVisitors.today}
            secondaryLabel="Today"
          />
          <StatCard
            icon={CreditCard}
            label="Subscriptions"
            primary={stats.subscriptions.total}
            primaryLabel="Total Paying"
            secondary={stats.subscriptions.active}
            secondaryLabel="Active"
            accent="#eaa631"
          />
          <StatCard
            icon={CreditCard}
            label="Past Due"
            primary={stats.subscriptions.pastDue}
            primaryLabel="Past Due"
            accent="#dc4343"
          />
          <StatCard
            icon={Gamepad2}
            label="Games Imported"
            primary={stats.games.total}
            primaryLabel="Total"
            secondary={stats.games.today}
            secondaryLabel="Today"
          />
          <StatCard
            icon={Brain}
            label="Games Analyzed"
            primary={stats.games.analyzed}
            primaryLabel="Analyzed"
          />
          <StatCard
            icon={Swords}
            label="Opponent Scout Jobs"
            primary={stats.activity.opponentsScoutedTotal}
            primaryLabel="All Jobs"
            secondary={stats.activity.uniqueOpponentsScouted}
            secondaryLabel="Unique Targets"
          />
          <StatCard
            icon={Camera}
            label="Scan Page Visits"
            primary={stats.activity.positionScans}
            primaryLabel="Visits"
          />
        </div>
      )}

      {stats && stats.topPages && stats.topPages.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: BG_CARD, border: `1px solid rgba(255,255,255,0.05)` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-black" style={{ color: TEXT_LIGHT }}>
              Most Used Features
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
              By page views (all time)
            </p>
          </div>
          <div className="space-y-1.5">
            {(() => {
              const max = Math.max(...stats.topPages.map((p) => p.views), 1);
              return stats.topPages.map((p) => {
                const pct = (p.views / max) * 100;
                return (
                  <div key={p.path} className="flex items-center gap-3 text-sm">
                    <div className="w-40 shrink-0 truncate font-bold" style={{ color: TEXT_LIGHT }}>
                      {labelForPath(p.path)}
                    </div>
                    <div className="flex-1 h-5 rounded relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <div
                        className="absolute inset-y-0 left-0 rounded"
                        style={{ width: `${pct}%`, background: `${CHESSCOM_GREEN}33` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-2 text-[11px]">
                        <span className="font-mono truncate" style={{ color: TEXT_MUTED }}>
                          {p.path}
                        </span>
                        <span className="font-bold shrink-0 ml-2" style={{ color: CHESSCOM_GREEN }}>
                          {fmt(p.views)}
                        </span>
                      </div>
                    </div>
                    <div className="w-20 shrink-0 text-right text-[11px] font-bold" style={{ color: TEXT_MUTED }}>
                      {fmt(p.uniqueVisitors)} <span className="opacity-70">unique</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
