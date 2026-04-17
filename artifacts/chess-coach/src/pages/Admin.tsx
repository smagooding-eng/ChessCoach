import { useEffect, useState, useCallback } from 'react';
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
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}1a` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
          {label}
        </p>
      </div>
      <div className="flex items-end gap-4">
        <div>
          <p className="text-2xl font-black leading-none" style={{ color: TEXT_LIGHT }}>
            {fmt(primary)}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: TEXT_MUTED }}>
            {primaryLabel}
          </p>
        </div>
        {secondary != null && secondaryLabel && (
          <div>
            <p className="text-base font-bold leading-none" style={{ color }}>
              {fmt(secondary)}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: TEXT_MUTED }}>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black" style={{ color: TEXT_LIGHT }}>
            Admin Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>
            Combined user and activity stats across the entire app.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
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
          className="rounded-lg p-3 text-sm"
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
    </div>
  );
}
