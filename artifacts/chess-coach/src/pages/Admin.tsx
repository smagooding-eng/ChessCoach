import { useEffect, useState, useCallback, useRef } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, Bold, Brain, Camera, Check, CheckCircle2, ChevronDown, ChevronRight,
  Copy, CreditCard, Crown, Edit3, Eye, FileText, Gamepad2, Gift, GraduationCap, Heading1, Heading2,
  History, Image, Italic, Link as LinkIcon, List, ListOrdered, Loader2, LogOut, Mail, Megaphone,
  Minus, Palette, Play, Redo2, RefreshCw, Search, Send, Settings, Shield, Sparkles, Swords, Target, Trash2,
  Trophy, Type, Undo2, User, UserCheck, UserPlus, Users, X, Zap,
} from 'lucide-react';

interface AdminStats {
  pageViews: { total: number; today: number };
  uniqueVisitors: { total: number; today: number; totalByIp: number; todayByIp: number };
  users: { total: number; today: number };
  subscriptions: { active: number; trialing: number; canceled: number; pastDue: number; total: number };
  games: { total: number; today: number; analyzed: number };
  activity: { opponentsScoutedTotal: number; uniqueOpponentsScouted: number; positionScans: number };
  topPages: { path: string; views: number; uniqueVisitors: number; uniqueByIp: number }[];
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
  footnote,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  primary: number | undefined;
  primaryLabel: string;
  secondary?: number | undefined;
  secondaryLabel?: string;
  accent?: string;
  footnote?: string;
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
      {footnote && (
        <p className="text-[10px] pt-1" style={{ color: TEXT_MUTED, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {footnote}
        </p>
      )}
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

      <div
        className="rounded-xl p-4"
        style={{ background: BG_CARD, border: `1px solid rgba(255,255,255,0.05)` }}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-black" style={{ color: TEXT_LIGHT }}>Live Play (admin only)</h2>
            <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>Hidden from regular users for now. Use these links to test.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/live">
            <a className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm"
              style={{ background: `${CHESSCOM_GREEN}1a`, color: CHESSCOM_GREEN, border: `1px solid ${CHESSCOM_GREEN}33` }}>
              <Play className="w-4 h-4" /> Play Live
            </a>
          </Link>
          <Link href="/live/history">
            <a className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm"
              style={{ background: 'rgba(255,255,255,0.04)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.08)' }}>
              <History className="w-4 h-4" /> Live History
            </a>
          </Link>
        </div>
      </div>

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
            footnote={`By IP address: ${fmt(stats.uniqueVisitors.totalByIp)} total, ${fmt(stats.uniqueVisitors.todayByIp)} today — often more accurate, since the number above double-counts anyone using multiple browsers or the installed app.`}
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
                    <div className="w-28 shrink-0 text-right text-[11px] font-bold" style={{ color: TEXT_MUTED }}>
                      {fmt(p.uniqueVisitors)} <span className="opacity-70">unique</span>
                      <br />
                      <span className="opacity-60">{fmt(p.uniqueByIp)} by IP</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      <AdminTicker />
    </div>
  );
}

interface AdminUser {
  id: string;
  email: string | null;
  chesscomUsername: string | null;
  firstName: string | null;
  createdAt: string;
  tier: 'admin' | 'pro' | 'trial' | 'free';
  tierDetail: number | null;
  planInterval: string | null;
  daysSinceLogin: number | null;
}

type UserFilter = 'all' | 'admin' | 'pro' | 'trial' | 'free';

function TierBadge({ user }: { user: AdminUser }) {
  const interval = user.planInterval === 'week' ? '/wk' : user.planInterval === 'month' ? '/mo' : '';

  if (user.tier === 'admin') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
        Admin
      </span>
    );
  }

  if (user.tier === 'pro') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
        Pro{interval ? ` ${interval}` : ''} {user.tierDetail !== null ? `${user.tierDetail}d` : ''}
      </span>
    );
  }

  if (user.tier === 'trial') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
        Trial {user.tierDetail !== null ? `${user.tierDetail}d left` : ''}
      </span>
    );
  }

  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-500/20 text-neutral-400">
      Free {user.tierDetail !== null ? `${user.tierDetail}d` : ''}
    </span>
  );
}

const FILTER_TABS: { key: UserFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: 'text-amber-400' },
  { key: 'admin', label: 'Admin', color: 'text-amber-400' },
  { key: 'pro', label: 'Pro', color: 'text-emerald-400' },
  { key: 'trial', label: 'Trial', color: 'text-blue-400' },
  { key: 'free', label: 'Free', color: 'text-neutral-400' },
];

interface UserUsage {
  user: { id: string; email: string | null; firstName: string | null; chesscomUsername: string | null; inviteCode: string | null; referredByUserId: string | null; createdAt: string; lastLoginAt: string | null };
  usage: { gamesImported: number; gamesReviewed: number; opponentsScouted: number; puzzlesSolved: number; puzzlesFailed: number; coursesGenerated: number; lessonsCompleted: number; pageViews: number };
  recentPages: { path: string; createdAt: string }[];
  referrals: { id: string; referredEmail: string | null; referredName: string | null; status: string; createdAt: string; convertedAt: string | null }[];
}

function UserDetailPanel({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [data, setData] = useState<UserUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    apiFetch(`/api/admin/users/${userId}/usage`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then(d => setData(d))
      .catch(() => setError('Failed to load user stats'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="p-6 text-center">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-amber-400" />
        <p className="text-xs text-muted-foreground mt-2">Loading stats...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="text-xs text-amber-400 hover:text-amber-300 mb-3 flex items-center gap-1">
          <ChevronRight className="w-3 h-3 rotate-180" /> Back to users
        </button>
        <p className="text-xs text-red-400 text-center">{error || 'No data'}</p>
      </div>
    );
  }

  const { user, usage, recentPages, referrals } = data;
  const statItems = [
    { label: 'Games Imported', value: usage.gamesImported, color: 'text-blue-400', bg: 'bg-blue-400/10', icon: Swords },
    { label: 'Games Reviewed', value: usage.gamesReviewed, color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: Eye },
    { label: 'Opponents Scouted', value: usage.opponentsScouted, color: 'text-purple-400', bg: 'bg-purple-400/10', icon: Target },
    { label: 'Puzzles Solved', value: usage.puzzlesSolved, color: 'text-primary', bg: 'bg-primary/10', icon: Trophy },
    { label: 'Puzzles Failed', value: usage.puzzlesFailed, color: 'text-red-400', bg: 'bg-red-400/10', icon: X },
    { label: 'Courses Generated', value: usage.coursesGenerated, color: 'text-amber-400', bg: 'bg-amber-400/10', icon: GraduationCap },
    { label: 'Lessons Done', value: usage.lessonsCompleted, color: 'text-cyan-400', bg: 'bg-cyan-400/10', icon: Check },
    { label: 'Page Views', value: usage.pageViews, color: 'text-indigo-400', bg: 'bg-indigo-400/10', icon: Activity },
  ];

  const daysSinceCreated = user.createdAt ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000) : null;

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/15 flex items-center justify-between sticky top-0 z-10">
        <button onClick={onBack} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold">
          <ChevronRight className="w-3 h-3 rotate-180" /> Back
        </button>
        <span className="text-xs font-bold text-foreground truncate ml-2">
          {user.email || user.chesscomUsername || user.firstName || 'Unknown User'}
        </span>
      </div>

      <div className="px-4 py-3 border-b border-border/20 space-y-1">
        {user.email && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="w-3 h-3" /> {user.email}</p>}
        {user.chesscomUsername && <p className="text-xs text-muted-foreground flex items-center gap-1.5">♟ {user.chesscomUsername}</p>}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60 mt-1">
          {user.createdAt && <span>Joined {daysSinceCreated === 0 ? 'today' : `${daysSinceCreated}d ago`}</span>}
          {user.lastLoginAt && <span>Last login {new Date(user.lastLoginAt).toLocaleDateString()}</span>}
        </div>
        {user.inviteCode && <p className="text-[10px] text-amber-400/70 mt-1">Invite code: {user.inviteCode}</p>}
        {user.referredByUserId && <p className="text-[10px] text-emerald-400/70 mt-1">Referred by: {user.referredByUserId.slice(0, 8)}...</p>}
      </div>

      <div className="grid grid-cols-4 gap-px bg-border/10 border-b border-border/20">
        {statItems.map(s => (
          <div key={s.label} className="bg-card p-2.5 text-center">
            <div className={`w-6 h-6 ${s.bg} rounded-xl flex items-center justify-center mx-auto mb-1`}>
              <s.icon className={`w-3 h-3 ${s.color}`} />
            </div>
            <p className="text-sm font-black text-foreground">{s.value}</p>
            <p className="text-[9px] text-muted-foreground leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {recentPages.length > 0 && (
        <div className="px-4 py-3 border-b border-border/20">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Recent Pages</p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {recentPages.slice(0, 10).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-foreground/80 font-mono truncate mr-2">{p.path}</span>
                <span className="text-muted-foreground/50 whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {referrals.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Referrals ({referrals.length})</p>
          <div className="space-y-1.5">
            {referrals.map(r => (
              <div key={r.id} className="flex items-center justify-between text-[11px] bg-background/30 rounded px-2 py-1.5">
                <span className="text-foreground/80">{r.referredEmail || r.referredName || 'Unknown'}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  r.status === 'converted' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'
                }`}>
                  {r.status === 'converted' ? 'Pro' : 'Signed Up'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserListPanel({ onClose, onEmailUsers }: { onClose: () => void; onEmailUsers: (emails: string[]) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<UserFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.users) setUsers(d.users); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? users : users.filter(u => u.tier === filter);
  const counts = users.reduce((acc, u) => {
    acc[u.tier] = (acc[u.tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const emailableUsers = filtered.filter(u => u.email);
  const allSelected = emailableUsers.length > 0 && emailableUsers.every(u => selected.has(u.id));

  const toggleUser = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(emailableUsers.map(u => u.id)));
    }
  };

  const handleEmailSelected = () => {
    const emails = users.filter(u => selected.has(u.id) && u.email).map(u => u.email!);
    if (emails.length > 0) {
      onEmailUsers(emails);
    }
  };

  const handleDeleteSelected = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      const r = await apiFetch('/api/admin/users/delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: ids }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setUsers(prev => prev.filter(u => !selected.has(u.id)));
        setSelected(new Set());
      } else {
        alert(d.error || 'Failed to delete users');
      }
    } catch {
      alert('Failed to delete users');
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border-t border-amber-500/15 overflow-hidden"
    >
      <div className="px-4 py-3 flex items-center justify-between bg-amber-500/5">
        <span className="text-xs font-bold text-amber-400">Registered Users</span>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <button
                onClick={handleEmailSelected}
                className="text-[10px] font-bold px-2.5 py-1 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors flex items-center gap-1"
              >
                <Mail className="w-3 h-3" /> Email {selected.size}
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className={`text-[10px] font-bold px-2.5 py-1 rounded flex items-center gap-1 transition-colors ${deleteConfirm ? 'bg-red-500/30 text-red-300 hover:bg-red-500/40' : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'}`}
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {deleteConfirm ? 'Confirm Delete?' : `Delete ${selected.size}`}
              </button>
              {deleteConfirm && (
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-[10px] font-bold px-1.5 py-1 rounded bg-neutral-500/15 text-neutral-400 hover:bg-neutral-500/25 transition-colors"
                >
                  Cancel
                </button>
              )}
            </>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {!loading && users.length > 0 && (
        <div className="px-3 py-2 flex items-center gap-1 overflow-x-auto border-b border-border/20">
          <button
            onClick={toggleAll}
            className={`text-[11px] font-bold px-2 py-1 rounded transition-colors mr-1 ${allSelected ? 'bg-amber-500/20 text-amber-400' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'}`}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <div className="w-px h-4 bg-border/30 mx-1" />
          {FILTER_TABS.map(tab => {
            const c = tab.key === 'all' ? users.length : (counts[tab.key] || 0);
            if (tab.key !== 'all' && c === 0) return null;
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${active ? 'bg-amber-500/15' : 'hover:bg-secondary/50'}`}
                style={{ color: active ? undefined : 'var(--muted-foreground)' }}
              >
                <span className={active ? tab.color : ''}>{tab.label}</span>
                <span className="ml-1 opacity-60">{c}</span>
              </button>
            );
          })}
        </div>
      )}
      {viewingUserId ? (
        <UserDetailPanel userId={viewingUserId} onBack={() => setViewingUserId(null)} />
      ) : (
        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No users found</p>
          ) : (
            <div className="divide-y divide-border/20">
              {filtered.map(u => {
                const isSelected = selected.has(u.id);
                const hasEmail = !!u.email;
                return (
                  <div
                    key={u.id}
                    className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${isSelected ? 'bg-amber-500/8' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); if (hasEmail) toggleUser(u.id); }}
                        disabled={!hasEmail}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${!hasEmail ? 'opacity-30 cursor-default' : 'cursor-pointer'} ${isSelected ? 'border-amber-400 bg-amber-400' : 'border-border/50 hover:border-amber-400/50'}`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-black" />}
                      </button>
                      <button
                        onClick={() => setViewingUserId(u.id)}
                        className="min-w-0 text-left hover:underline decoration-dotted underline-offset-2"
                      >
                        <p className="text-sm font-medium text-foreground truncate">
                          {u.email || (u.chesscomUsername ? `♟ ${u.chesscomUsername}` : u.firstName || 'Unknown')}
                        </p>
                        {u.email && u.chesscomUsername && (
                          <p className="text-[11px] text-muted-foreground/60 truncate">♟ {u.chesscomUsername}</p>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <TierBadge user={u} />
                      <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap leading-tight text-right">
                        {u.daysSinceLogin !== null ? (
                          u.daysSinceLogin === 0 ? 'today' : `${u.daysSinceLogin}d ago`
                        ) : 'never'}
                      </span>
                      <button
                        onClick={() => setViewingUserId(u.id)}
                        className="p-0.5 text-muted-foreground/40 hover:text-amber-400 transition-colors"
                        title="View stats"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

const CHESS_IMAGES = {
  board: 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=600&h=300&fit=crop&q=80',
  pieces: 'https://images.unsplash.com/photo-1586165368502-1bad197a6461?w=600&h=300&fit=crop&q=80',
  strategy: 'https://images.unsplash.com/photo-1560174038-da43ac74f01b?w=600&h=300&fit=crop&q=80',
  king: 'https://images.unsplash.com/photo-1528819622765-d6bcf132f793?w=600&h=300&fit=crop&q=80',
  opening: 'https://images.unsplash.com/photo-1604948501466-4e9c339b9c24?w=600&h=300&fit=crop&q=80',
  tournament: 'https://images.unsplash.com/photo-1580541832626-2a7131ee809f?w=600&h=300&fit=crop&q=80',
  clock: 'https://images.unsplash.com/photo-1611195974226-a6a9be9dd763?w=600&h=300&fit=crop&q=80',
  checkmate: 'https://images.unsplash.com/photo-1495639015237-e9d0e tried4?w=600&h=300&fit=crop&q=80',
  study: 'https://images.unsplash.com/photo-1523875194681-bedd468c58bf?w=600&h=300&fit=crop&q=80',
  grandmaster: 'https://images.unsplash.com/photo-1538221566857-f4d2be2b69c2?w=600&h=300&fit=crop&q=80',
};

const imgStyle = 'width:100%;height:auto;border-radius:8px;margin-bottom:20px;display:block;';
const btnStyle = 'display:inline-block;background:#81b64c;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;';
const btnAlt = 'display:inline-block;background:transparent;color:#81b64c;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:2px solid #81b64c;';
const divider = '<div style="border-top:1px solid rgba(129,182,76,0.15);margin:24px 0;"></div>';
const badge = (text: string) => `<span style="display:inline-block;background:#81b64c;color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${text}</span>`;

const EMAIL_TEMPLATES = [
  {
    name: '👋 Welcome',
    subject: 'Welcome to ChessScout — Your Chess Edge Starts Now',
    html: `<img src="${CHESS_IMAGES.board}" alt="Chess board" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Welcome to ChessScout! ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">The smartest way to prepare for your opponents</p>
<p>You've just joined the chess tool that top players use to gain an edge before every game. ChessScout analyzes your opponents so you don't have to.</p>
${divider}
<h3 style="color:#81b64c;font-size:16px;margin:0 0 12px;">Here's what you can do right now:</h3>
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">🔍</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Opponent Scout</strong><br/><span style="color:#9e9b98;font-size:13px;">Deep analysis of any player's openings, weaknesses &amp; tendencies</span></td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">♟️</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Game Lookup</strong><br/><span style="color:#9e9b98;font-size:13px;">Review any Chess.com game with deep move analysis</span></td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">🧩</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Daily Puzzles</strong><br/><span style="color:#9e9b98;font-size:13px;">Sharpen your tactics with curated puzzle sets</span></td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">🤖</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Practice Bots</strong><br/><span style="color:#9e9b98;font-size:13px;">Train against bots calibrated to different rating levels</span></td></tr>
</table>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Start Scouting Your Opponents →</a></p>
<p style="text-align:center;margin-top:12px;"><span style="color:#9e9b98;font-size:12px;">Free account includes 5 puzzles/day &amp; full game lookup</span></p>`,
  },
  {
    name: '⭐ Upgrade to Pro',
    subject: 'Unlock the Full Power of ChessScout Pro',
    html: `<img src="${CHESS_IMAGES.king}" alt="Chess king" style="${imgStyle}" />
<div style="text-align:center;margin-bottom:20px;">${badge('PRO')}</div>
<h2 style="color:#81b64c;text-align:center;margin:0 0 8px;">Level Up Your Game</h2>
<p style="text-align:center;color:#9e9b98;margin:0 0 24px;">You've been using ChessScout — here's what you're missing.</p>
<div style="background:#262421;border-radius:8px;padding:20px;margin-bottom:20px;">
<h3 style="color:#e8e6e3;margin:0 0 16px;font-size:15px;">Pro members get:</h3>
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;"><strong>Unlimited puzzles</strong> — No daily cap</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;"><strong>Opponent Scouting</strong> — Deep weakness reports</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;"><strong>Deep Game Analysis</strong> — Move-by-move engine eval</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;"><strong>Personalized Courses</strong> — Built from your games</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;"><strong>Endgame Trainer</strong> — Targeted drills</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;"><strong>Coach Explanations</strong> — Understand every puzzle</td></tr>
</table>
</div>
<div style="text-align:center;background:linear-gradient(135deg,rgba(129,182,76,0.1),rgba(129,182,76,0.05));border:1px solid rgba(129,182,76,0.2);border-radius:8px;padding:20px;margin-bottom:20px;">
<p style="color:#e8e6e3;font-size:22px;font-weight:700;margin:0;">$1<span style="font-size:14px;font-weight:400;color:#9e9b98;">/week</span> &nbsp;or&nbsp; $4<span style="font-size:14px;font-weight:400;color:#9e9b98;">/month</span></p>
<p style="color:#81b64c;font-size:13px;margin:4px 0 0;">Includes 3-day free trial</p>
</div>
<p style="text-align:center;"><a href="https://chessscout.net/subscription" style="${btnStyle}">Analyze My Games Free →</a></p>`,
  },
  {
    name: '🚀 New Feature',
    subject: 'New on ChessScout: [Feature Name]',
    html: `<img src="${CHESS_IMAGES.strategy}" alt="Chess strategy" style="${imgStyle}" />
<div style="margin-bottom:16px;">${badge('NEW')}</div>
<h2 style="color:#81b64c;margin:0 0 8px;">Introducing [Feature Name]</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Just shipped — available now for all ChessScout users</p>
<p>We've been working on something we think will change how you prepare for games:</p>
${divider}
<h3 style="color:#e8e6e3;font-size:16px;margin:0 0 8px;">[Feature Name]</h3>
<p>[Describe the feature — what it does, why it matters, how it helps their chess]</p>
<p>[Optional: Add a screenshot or demo image here using the image button]</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Try [Feature Name] →</a></p>`,
  },
  {
    name: '🧩 Weekly Puzzle Challenge',
    subject: 'This Week\'s Puzzle Challenge — Can You Solve It?',
    html: `<img src="${CHESS_IMAGES.pieces}" alt="Chess pieces" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Weekly Puzzle Challenge ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Test your tactical vision</p>
<div style="background:#262421;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px;">
<p style="font-size:48px;margin:0;line-height:1;">♚♛♜♝♞♟</p>
<p style="color:#e8e6e3;font-size:15px;margin:12px 0 0;">This week's puzzles focus on:<br/><strong style="color:#81b64c;font-size:18px;">[Theme: e.g. Knight Forks, Back Rank Mates]</strong></p>
</div>
<p>We've curated a special set of puzzles this week targeting one of the most common tactical patterns. Whether you're rated 800 or 2000, these puzzles will sharpen your pattern recognition.</p>
${divider}
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#81b64c;">🥉</td><td style="padding:6px 0;"><strong>Beginner</strong> — 5 puzzles (800-1200)</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">🥈</td><td style="padding:6px 0;"><strong>Intermediate</strong> — 5 puzzles (1200-1600)</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">🥇</td><td style="padding:6px 0;"><strong>Advanced</strong> — 5 puzzles (1600+)</td></tr>
</table>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net/puzzles" style="${btnStyle}">Solve Today's Puzzles →</a></p>
<p style="text-align:center;margin-top:8px;color:#9e9b98;font-size:12px;">Free users: 5 puzzles/day &nbsp;|&nbsp; Pro: Unlimited</p>`,
  },
  {
    name: '📊 Your Weekly Stats',
    subject: 'Your ChessScout Week in Review',
    html: `<img src="${CHESS_IMAGES.study}" alt="Chess study" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Your Week in Review ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Here's how you've been improving</p>
<div style="display:flex;gap:12px;margin-bottom:20px;">
<div style="flex:1;background:#262421;border-radius:8px;padding:16px;text-align:center;">
<p style="color:#81b64c;font-size:28px;font-weight:700;margin:0;">[X]</p>
<p style="color:#9e9b98;font-size:11px;margin:4px 0 0;text-transform:uppercase;">Puzzles Solved</p>
</div>
<div style="flex:1;background:#262421;border-radius:8px;padding:16px;text-align:center;">
<p style="color:#81b64c;font-size:28px;font-weight:700;margin:0;">[X]</p>
<p style="color:#9e9b98;font-size:11px;margin:4px 0 0;text-transform:uppercase;">Games Reviewed</p>
</div>
<div style="flex:1;background:#262421;border-radius:8px;padding:16px;text-align:center;">
<p style="color:#81b64c;font-size:28px;font-weight:700;margin:0;">[X]</p>
<p style="color:#9e9b98;font-size:11px;margin:4px 0 0;text-transform:uppercase;">Scouts Run</p>
</div>
</div>
<p>Keep up the momentum! Consistency is the key to chess improvement. Even solving just a few puzzles a day builds pattern recognition that transfers directly to your games.</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Continue Training →</a></p>`,
  },
  {
    name: '🏆 Tournament Prep',
    subject: 'Prepare Like a Pro — Tournament Prep with ChessScout',
    html: `<img src="${CHESS_IMAGES.tournament}" alt="Chess tournament" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Tournament Prep Mode ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Get the edge before your next rated game</p>
<p>Got a tournament coming up? Here's how ChessScout gives you the preparation edge that GMs use:</p>
${divider}
<h3 style="color:#e8e6e3;font-size:15px;margin:0 0 12px;">Your Pre-Game Checklist:</h3>
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:16px;">1.</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Scout Your Opponent</strong><br/><span style="color:#9e9b98;font-size:13px;">Enter their username → get a full opening repertoire breakdown, weaknesses, and tendencies</span></td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:16px;">2.</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Review Their Recent Games</strong><br/><span style="color:#9e9b98;font-size:13px;">Use Game Lookup to see their latest games and how they handle critical positions</span></td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:16px;">3.</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Warm Up with Puzzles</strong><br/><span style="color:#9e9b98;font-size:13px;">Sharpen your tactical vision right before the round</span></td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:16px;">4.</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Review Your Own Games</strong><br/><span style="color:#9e9b98;font-size:13px;">Analyze your recent losses to avoid repeating mistakes</span></td></tr>
</table>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net/scout" style="${btnStyle}">Scout an Opponent Now →</a></p>`,
  },
  {
    name: '💡 Chess Tips',
    subject: 'Chess Tip: [Topic] — Improve Your Game Today',
    html: `<img src="${CHESS_IMAGES.opening}" alt="Chess opening" style="${imgStyle}" />
<div style="margin-bottom:16px;">${badge('CHESS TIP')}</div>
<h2 style="color:#81b64c;margin:0 0 8px;">[Topic Title]</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">A quick lesson to boost your rating</p>
<p>[Write 2-3 paragraphs about the chess concept. Keep it practical and actionable.]</p>
<div style="background:#262421;border-radius:8px;padding:16px;margin:20px 0;border-left:3px solid #81b64c;">
<p style="color:#81b64c;font-size:13px;font-weight:600;margin:0 0 6px;">💡 KEY TAKEAWAY</p>
<p style="color:#e8e6e3;margin:0;font-size:14px;">[One sentence summary of the tip that's easy to remember]</p>
</div>
<p>Want to put this into practice? Head to ChessScout and look for positions where this concept applies in your own games.</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Apply This in Your Games →</a></p>
<p style="text-align:center;margin-top:8px;"><a href="https://chessscout.net/puzzles" style="${btnAlt}">Practice Puzzles →</a></p>`,
  },
  {
    name: '🔥 Trial Ending',
    subject: 'Your Free Trial Ends Soon — Don\'t Lose Access',
    html: `<img src="${CHESS_IMAGES.clock}" alt="Chess clock" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Your Free Trial is Almost Over ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Keep your edge — upgrade before it expires</p>
<p>You've been using ChessScout Pro features during your trial. Here's what you'll lose access to if you don't subscribe:</p>
<div style="background:#262421;border-radius:8px;padding:16px;margin:20px 0;">
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#ff6b6b;">✗</td><td style="padding:6px 0;color:#9e9b98;">Unlimited puzzles → Back to 5/day</td></tr>
<tr><td style="padding:6px 0;color:#ff6b6b;">✗</td><td style="padding:6px 0;color:#9e9b98;">Opponent scouting reports</td></tr>
<tr><td style="padding:6px 0;color:#ff6b6b;">✗</td><td style="padding:6px 0;color:#9e9b98;">Coach move explanations</td></tr>
<tr><td style="padding:6px 0;color:#ff6b6b;">✗</td><td style="padding:6px 0;color:#9e9b98;">Personalized courses</td></tr>
<tr><td style="padding:6px 0;color:#ff6b6b;">✗</td><td style="padding:6px 0;color:#9e9b98;">Endgame training drills</td></tr>
</table>
</div>
<div style="text-align:center;background:linear-gradient(135deg,rgba(129,182,76,0.1),rgba(129,182,76,0.05));border:1px solid rgba(129,182,76,0.2);border-radius:8px;padding:20px;margin-bottom:20px;">
<p style="color:#e8e6e3;font-size:14px;margin:0 0 4px;">Plans start at just</p>
<p style="color:#81b64c;font-size:28px;font-weight:700;margin:0;">$1<span style="font-size:14px;font-weight:400;color:#9e9b98;">/week</span></p>
<p style="color:#9e9b98;font-size:12px;margin:4px 0 0;">Less than a coffee. Cancel anytime.</p>
</div>
<p style="text-align:center;"><a href="https://chessscout.net/subscription" style="${btnStyle}">Keep Pro Access →</a></p>`,
  },
  {
    name: '📬 Win of the Week',
    subject: 'Win of the Week — Brilliant Games from ChessScout Users',
    html: `<img src="${CHESS_IMAGES.grandmaster}" alt="Chess grandmaster" style="${imgStyle}" />
<div style="margin-bottom:16px;">${badge('WIN OF THE WEEK')}</div>
<h2 style="color:#81b64c;margin:0 0 8px;">Community Spotlight ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Brilliant games from ChessScout players</p>
<div style="background:#262421;border-radius:8px;padding:20px;margin-bottom:20px;">
<h3 style="color:#e8e6e3;font-size:15px;margin:0 0 8px;">🏅 [Player Username]</h3>
<p style="color:#9e9b98;font-size:13px;margin:0 0 12px;">[Rating] | [Time Control] | [Result]</p>
<p>[Describe the game — what made it brilliant, key moments, the decisive combination]</p>
<p style="color:#81b64c;font-size:13px;margin:12px 0 0;">Key moment: [Describe the critical position or move]</p>
</div>
<p>Want your game featured? Play your best chess and analyze your games on ChessScout — we pick our favorites each week!</p>
${divider}
<p style="text-align:center;">
<a href="https://chessscout.net/game-lookup" style="${btnStyle}">Review Your Games →</a>
</p>`,
  },
  {
    name: '🎯 Re-engagement',
    subject: 'We Miss You — Your Chess Is Waiting',
    html: `<img src="${CHESS_IMAGES.board}" alt="Chess board" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">It's Been a While ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Your chess improvement doesn't have to stop</p>
<p>We noticed you haven't been on ChessScout recently. Even a few minutes of daily puzzle practice can make a noticeable difference in your games.</p>
<div style="background:#262421;border-radius:8px;padding:20px;margin:20px 0;">
<h3 style="color:#e8e6e3;font-size:15px;margin:0 0 16px;">Quick ways to jump back in:</h3>
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:8px 0;vertical-align:top;width:30px;font-size:16px;">⚡</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">2 minutes</strong> — Solve a daily puzzle</td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;font-size:16px;">🎯</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">5 minutes</strong> — Scout your next opponent</td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;font-size:16px;">📖</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">10 minutes</strong> — Review a recent game with the coach</td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;font-size:16px;">🤖</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">15 minutes</strong> — Play a practice bot match</td></tr>
</table>
</div>
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Get Back to Chess →</a></p>`,
  },
  {
    name: '📚 Opening Guide',
    subject: 'Master This Opening — Free Guide Inside',
    html: `<img src="${CHESS_IMAGES.opening}" alt="Chess opening position" style="${imgStyle}" />
<div style="margin-bottom:16px;">${badge('OPENING GUIDE')}</div>
<h2 style="color:#81b64c;margin:0 0 8px;">[Opening Name]: A Complete Guide</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Learn the key ideas, traps, and plans</p>
<p>[Introduction — why this opening is worth learning, who plays it, what level it's appropriate for]</p>
${divider}
<h3 style="color:#e8e6e3;font-size:15px;margin:0 0 12px;">Key Ideas:</h3>
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#81b64c;">♟</td><td style="padding:6px 0;"><strong>[Idea 1]</strong> — [Brief explanation]</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">♟</td><td style="padding:6px 0;"><strong>[Idea 2]</strong> — [Brief explanation]</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">♟</td><td style="padding:6px 0;"><strong>[Idea 3]</strong> — [Brief explanation]</td></tr>
</table>
<div style="background:#262421;border-radius:8px;padding:16px;margin:20px 0;border-left:3px solid #81b64c;">
<p style="color:#81b64c;font-size:13px;font-weight:600;margin:0 0 6px;">⚠️ COMMON TRAP</p>
<p style="color:#e8e6e3;margin:0;font-size:14px;">[Describe a common trap or mistake in this opening]</p>
</div>
<p>Use ChessScout's Opponent Scout to see if your opponents play this opening — and how well they handle the key positions.</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net/scout" style="${btnStyle}">Scout Opponents Playing This →</a></p>`,
  },
  {
    name: '🎄 Holiday / Seasonal',
    subject: 'Happy Holidays from ChessScout ♜',
    html: `<img src="${CHESS_IMAGES.pieces}" alt="Chess pieces" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Happy Holidays! 🎉♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">From the ChessScout team to you</p>
<p>Wishing you a wonderful holiday season! While you're relaxing, why not squeeze in some chess?</p>
<div style="background:#262421;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
<p style="font-size:36px;margin:0;">♜ 🎁 ♝</p>
<p style="color:#81b64c;font-size:16px;font-weight:600;margin:12px 0 4px;">Holiday Special</p>
<p style="color:#e8e6e3;font-size:14px;margin:0;">[Describe any special offer, discount, or holiday puzzle set]</p>
</div>
<p>From all of us at ChessScout — thank you for being part of our community. Here's to more brilliant moves in the new year!</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Play Some Chess →</a></p>`,
  },
  {
    name: '📢 Announcement',
    subject: '[Announcement Title] — Important Update from ChessScout',
    html: `<div style="text-align:center;margin-bottom:20px;">${badge('ANNOUNCEMENT')}</div>
<h2 style="color:#81b64c;text-align:center;margin:0 0 8px;">[Announcement Title]</h2>
<p style="color:#9e9b98;font-size:13px;text-align:center;margin:0 0 24px;">[Subtitle or date]</p>
${divider}
<p>[Main announcement content. Keep it clear and concise.]</p>
<p>[What this means for users — how it affects them, what they need to do]</p>
<div style="background:#262421;border-radius:8px;padding:16px;margin:20px 0;border-left:3px solid #81b64c;">
<p style="color:#81b64c;font-size:13px;font-weight:600;margin:0 0 6px;">WHAT YOU NEED TO KNOW</p>
<p style="color:#e8e6e3;margin:0;font-size:14px;">[Key takeaway or action item]</p>
</div>
<p>Questions? Just reply to this email — we read every message.</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Visit ChessScout →</a></p>`,
  },
  {
    name: '🧪 Feedback Request',
    subject: 'Quick Question — Help Us Make ChessScout Better',
    html: `<img src="${CHESS_IMAGES.study}" alt="Chess study" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">We'd Love Your Feedback ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Help us build the chess tool you actually want</p>
<p>Hey there! We're always working to make ChessScout better, and your input matters more than you know.</p>
<p>We have a quick question:</p>
<div style="background:#262421;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
<p style="color:#81b64c;font-size:16px;font-weight:600;margin:0 0 8px;">[Your Question Here]</p>
<p style="color:#9e9b98;font-size:13px;margin:0;">Just reply to this email with your answer — it takes 30 seconds!</p>
</div>
<p>Some ideas we're considering:</p>
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#81b64c;">→</td><td style="padding:6px 0;">[Idea 1]</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">→</td><td style="padding:6px 0;">[Idea 2]</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">→</td><td style="padding:6px 0;">[Idea 3]</td></tr>
</table>
${divider}
<p style="color:#9e9b98;font-size:13px;">Your feedback directly shapes what we build next. Thank you!</p>
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnAlt}">Visit ChessScout →</a></p>`,
  },
];

function EmailComposerModal({ onClose, initialRecipients }: { onClose: () => void; initialRecipients?: string[] }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState('');
  const [recipients, setRecipients] = useState<string[]>(initialRecipients || []);
  const [recipientInput, setRecipientInput] = useState('');
  const [mode, setMode] = useState<'compose' | 'preview'>('compose');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [broadcastAll, setBroadcastAll] = useState(false);

  const execCmd = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }, []);

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      execCmd('insertHTML', `<img src="${url}" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;" />`);
    }
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      const text = window.getSelection()?.toString() || url;
      execCmd('insertHTML', `<a href="${url}" style="color:#81b64c;text-decoration:underline;">${text}</a>`);
    }
  };

  const insertButton = () => {
    const url = prompt('Button URL:', 'https://chessscout.net');
    const text = prompt('Button text:', 'Visit ChessScout');
    if (url && text) {
      execCmd('insertHTML', `<p><a href="${url}" style="display:inline-block;background:#81b64c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">${text}</a></p>`);
    }
  };

  const addRecipient = () => {
    const trimmed = recipientInput.trim();
    if (trimmed && !recipients.includes(trimmed)) {
      setRecipients(prev => [...prev, trimmed]);
      setRecipientInput('');
    }
  };

  const removeRecipient = (email: string) => {
    setRecipients(prev => prev.filter(e => e !== email));
  };

  const applyTemplate = (tpl: typeof EMAIL_TEMPLATES[0]) => {
    setSubject(tpl.subject);
    if (editorRef.current) {
      editorRef.current.innerHTML = tpl.html;
    }
    setShowTemplates(false);
  };

  const getEditorHtml = () => {
    return editorRef.current?.innerHTML || '';
  };

  const sanitizeForEmail = (html: string, forPreview = false): string => {
    const div = document.createElement('div');
    div.innerHTML = html;

    div.querySelectorAll('script,style,link,meta').forEach(el => el.remove());

    div.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('data:')) {
        if (forPreview) {
          const notice = document.createElement('div');
          notice.setAttribute('style', 'color:#ff6b6b;font-size:13px;font-style:italic;margin:8px 0;padding:8px 12px;border:1px dashed #ff6b6b;border-radius:6px;background:rgba(255,107,107,0.08);');
          notice.textContent = '\u26a0 This pasted image won\'t appear in the email. Use the image button (\ud83d\uddbc) to insert a hosted URL.';
          img.replaceWith(notice);
        } else {
          img.remove();
        }
        return;
      }
      img.setAttribute('style', 'max-width:100%;height:auto;border-radius:8px;margin:8px 0;display:block;');
      img.removeAttribute('class');
    });

    const inlineStyles: Record<string, string> = {
      'h1': 'color:#81b64c;font-size:24px;font-weight:bold;margin:0 0 12px;line-height:1.3;',
      'h2': 'color:#81b64c;font-size:20px;font-weight:bold;margin:0 0 10px;line-height:1.3;',
      'h3': 'color:#e8e6e3;font-size:17px;font-weight:600;margin:0 0 8px;line-height:1.4;',
      'h4': 'color:#e8e6e3;font-size:15px;font-weight:600;margin:0 0 6px;line-height:1.4;',
      'p': 'color:#e8e6e3;font-size:15px;line-height:1.7;margin:0 0 12px;',
      'ul': 'color:#e8e6e3;font-size:15px;line-height:1.7;margin:0 0 12px;padding-left:20px;',
      'ol': 'color:#e8e6e3;font-size:15px;line-height:1.7;margin:0 0 12px;padding-left:20px;',
      'li': 'color:#e8e6e3;margin-bottom:4px;',
      'strong': 'color:#e8e6e3;font-weight:bold;',
      'b': 'color:#e8e6e3;font-weight:bold;',
      'em': 'color:#e8e6e3;font-style:italic;',
      'i': 'color:#e8e6e3;font-style:italic;',
      'hr': 'border:none;border-top:1px solid #444;margin:16px 0;',
      'blockquote': 'border-left:3px solid #81b64c;padding-left:12px;margin:12px 0;color:#9e9b98;font-style:italic;',
    };

    Object.entries(inlineStyles).forEach(([tag, style]) => {
      div.querySelectorAll(tag).forEach(el => {
        const existing = el.getAttribute('style') || '';
        if (tag === 'a') return;
        el.setAttribute('style', style + existing);
        el.removeAttribute('class');
      });
    });

    div.querySelectorAll('a').forEach(a => {
      const existing = a.getAttribute('style') || '';
      if (existing.includes('background')) {
        a.setAttribute('style', existing);
      } else {
        a.setAttribute('style', 'color:#81b64c;text-decoration:underline;' + existing);
      }
      a.removeAttribute('class');
    });

    div.querySelectorAll('div,span,section,article,header,footer,main,figure,figcaption').forEach(el => {
      if (!el.getAttribute('style')) {
        el.setAttribute('style', 'color:#e8e6e3;');
      }
      el.removeAttribute('class');
    });

    return div.innerHTML;
  };

  const wrapInEmailTemplate = (bodyHtml: string): string => {
    const sanitized = sanitizeForEmail(bodyHtml);
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#262421;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:24px;">
<h1 style="color:#81b64c;font-size:24px;margin:0;">♜ ChessScout.net</h1>
</div>
<div style="background-color:#302e2b;border-radius:12px;padding:32px;color:#e8e6e3;font-size:15px;line-height:1.7;">
${sanitized}
</div>
<p style="color:#666;font-size:12px;text-align:center;margin-top:24px;">ChessScout.net — Know your opponent's weaknesses.</p>
</div>
</body>
</html>`;
  };

  const handleSend = async () => {
    const html = getEditorHtml();
    if (!subject.trim()) {
      setResult({ type: 'error', message: 'Subject is required' });
      return;
    }
    if (!html.trim()) {
      setResult({ type: 'error', message: 'Email body is required' });
      return;
    }
    if (!broadcastAll && recipients.length === 0) {
      setResult({ type: 'error', message: 'Add at least one recipient or select "All Users"' });
      return;
    }

    const hasDataImages = html.includes('src="data:');
    if (hasDataImages) {
      setResult({ type: 'error', message: 'Some images are still uploading. Wait for "Uploading image..." to finish, then try again.' });
      return;
    }

    if (broadcastAll && !confirm('Send this email to ALL users right now? This cannot be undone.')) {
      return;
    }

    setSending(true);
    setResult(null);

    const wrappedHtml = wrapInEmailTemplate(html);

    try {
      let res: Response;
      if (broadcastAll) {
        res = await apiFetch('/api/admin/email/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ subject: subject.trim(), html: wrappedHtml, recipientFilter: 'all' }),
        });
      } else if (recipients.length === 1) {
        res = await apiFetch('/api/admin/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ to: recipients[0], subject: subject.trim(), html: wrappedHtml }),
        });
      } else {
        res = await apiFetch('/api/admin/email/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ subject: subject.trim(), html: wrappedHtml, recipientFilter: 'specific', emails: recipients }),
        });
      }

      if (res.status === 413) {
        setResult({ type: 'error', message: 'Email content is too large. Try removing images or shortening the content.' });
      } else {
        let data: any;
        try { data = await res.json(); } catch { data = {}; }
        if (res.ok) {
          const isBulk = broadcastAll || recipients.length > 1;
          if (isBulk) {
            let msg = `Sent to ${data.sent ?? 0} recipient${(data.sent ?? 0) !== 1 ? 's' : ''}`;
            if (data.failed) {
              msg += `, ${data.failed} failed`;
              if (data.failedEmails?.length) {
                msg += ':\n' + data.failedEmails.join('\n');
              }
            }
            setResult({ type: data.failed ? 'error' : 'success', message: msg });
          } else {
            setResult({ type: 'success', message: 'Email sent successfully!' });
          }
        } else {
          setResult({ type: 'error', message: data.error || `Server error (${res.status})` });
        }
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err?.message || 'Network error — check your connection' });
    } finally {
      setSending(false);
    }
  };

  const handleTestEmail = async () => {
    setSending(true);
    setResult(null);
    const html = getEditorHtml();
    const wrappedHtml = html.trim() ? wrapInEmailTemplate(html) : undefined;
    try {
      const res = await apiFetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: subject.trim() || undefined,
          html: wrappedHtml,
        }),
      });
      if (res.status === 413) {
        setResult({ type: 'error', message: 'Email content is too large. Try removing images or shortening the content.' });
      } else {
        let data: any;
        try { data = await res.json(); } catch { data = {}; }
        if (res.ok) {
          setResult({ type: 'success', message: `Test sent to ${data.sentTo}` });
        } else {
          setResult({ type: 'error', message: data.error || `Server error (${res.status})` });
        }
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err?.message || 'Network error — check your connection' });
    } finally {
      setSending(false);
    }
  };

  const toolbarBtn = (active: boolean = false) =>
    `p-1.5 rounded transition-colors ${active ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-2xl max-h-[90vh] bg-[#302e2b] border border-amber-500/20 rounded-xl flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-amber-500/15 bg-amber-500/5 flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-amber-400 flex items-center gap-2">
            <Mail className="w-5 h-5" /> Compose Email
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(v => !v)}
              className={`text-xs px-2.5 py-1.5 rounded transition-colors flex items-center gap-1 ${showTemplates ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/15'}`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Templates
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showTemplates && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-b border-amber-500/10 overflow-hidden"
            >
              <div className="p-3 flex gap-2 overflow-x-auto">
                {EMAIL_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.name}
                    onClick={() => applyTemplate(tpl)}
                    className="shrink-0 bg-[#262421] border border-border/30 rounded-xl px-4 py-3 text-left hover:border-amber-500/30 transition-colors"
                  >
                    <p className="text-xs font-bold text-amber-400">{tpl.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[140px] truncate">{tpl.subject}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">To</label>
              <div className="bg-[#262421] border border-border/40 rounded-xl p-2 min-h-[40px]">
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {broadcastAll && (
                    <span className="inline-flex items-center gap-1 text-xs bg-amber-500/15 text-amber-400 px-2 py-1 rounded-xl font-medium">
                      All Users
                      <button onClick={() => setBroadcastAll(false)} className="hover:text-amber-200 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {!broadcastAll && recipients.map(email => (
                    <span key={email} className="inline-flex items-center gap-1 text-xs bg-secondary/50 text-foreground px-2 py-1 rounded-xl">
                      {email}
                      <button onClick={() => removeRecipient(email)} className="hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                {!broadcastAll && (
                  <div className="flex gap-2">
                    <input
                      value={recipientInput}
                      onChange={e => setRecipientInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecipient(); } }}
                      placeholder="Type email and press Enter"
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none min-w-[150px]"
                    />
                    <button
                      onClick={() => setBroadcastAll(true)}
                      className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/15 hover:text-amber-400 transition-colors whitespace-nowrap"
                    >
                      All Users
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject line"
                className="w-full bg-[#262421] border border-border/40 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-amber-500/40"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Body</label>
                <div className="flex gap-1 p-0.5 bg-[#262421] rounded-xl">
                  <button
                    onClick={() => setMode('compose')}
                    className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${mode === 'compose' ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground'}`}
                  >
                    Compose
                  </button>
                  <button
                    onClick={() => setMode('preview')}
                    className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${mode === 'preview' ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground'}`}
                  >
                    Preview
                  </button>
                </div>
              </div>

              {mode === 'compose' ? (
                <>
                  <div className="flex flex-wrap gap-0.5 bg-[#262421] border border-border/40 border-b-0 rounded-t-lg px-2 py-1.5">
                    <button onClick={() => execCmd('bold')} className={toolbarBtn()} title="Bold">
                      <Bold className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('italic')} className={toolbarBtn()} title="Italic">
                      <Italic className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border/30 mx-1 self-center" />
                    <button onClick={() => execCmd('formatBlock', 'h2')} className={toolbarBtn()} title="Heading 1">
                      <Heading1 className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('formatBlock', 'h3')} className={toolbarBtn()} title="Heading 2">
                      <Heading2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('formatBlock', 'p')} className={toolbarBtn()} title="Paragraph">
                      <Type className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border/30 mx-1 self-center" />
                    <button onClick={() => execCmd('insertUnorderedList')} className={toolbarBtn()} title="Bullet List">
                      <List className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('insertOrderedList')} className={toolbarBtn()} title="Numbered List">
                      <ListOrdered className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border/30 mx-1 self-center" />
                    <button onClick={insertLink} className={toolbarBtn()} title="Insert Link">
                      <LinkIcon className="w-4 h-4" />
                    </button>
                    <button onClick={insertImage} className={toolbarBtn()} title="Insert Image">
                      <Image className="w-4 h-4" />
                    </button>
                    <button onClick={insertButton} className={toolbarBtn()} title="Insert CTA Button">
                      <FileText className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border/30 mx-1 self-center" />
                    <button onClick={() => execCmd('insertHorizontalRule')} className={toolbarBtn()} title="Horizontal Rule">
                      <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('undo')} className={toolbarBtn()} title="Undo">
                      <Undo2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('redo')} className={toolbarBtn()} title="Redo">
                      <Redo2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div
                    ref={editorRef}
                    contentEditable
                    className="bg-[#262421] border border-border/40 rounded-b-lg px-4 py-3 min-h-[200px] max-h-[350px] overflow-y-auto text-sm text-[#e8e6e3] focus:outline-none focus:border-amber-500/40 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[#81b64c] [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-[#e8e6e3] [&_h3]:mb-1 [&_p]:mb-2 [&_a]:text-[#81b64c] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-1 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:my-2 [&_hr]:border-border/30 [&_hr]:my-3"
                    data-placeholder="Start typing your email..."
                    onPaste={(e) => {
                      const items = e.clipboardData.items;
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.startsWith('image/')) {
                          e.preventDefault();
                          const file = items[i].getAsFile();
                          if (file) {
                            const placeholderId = `img-upload-${Date.now()}`;
                            document.execCommand('insertHTML', false,
                              `<span id="${placeholderId}" style="display:inline-block;background:#302e2b;color:#9e9b98;padding:8px 14px;border-radius:6px;font-size:13px;margin:4px 0;">Uploading image...</span>`);
                            const reader = new FileReader();
                            reader.onload = async (ev) => {
                              const dataUrl = ev.target?.result as string;
                              try {
                                const res = await apiFetch('/api/admin/email/upload-image', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ dataUrl }),
                                });
                                const data = await res.json();
                                const placeholder = document.getElementById(placeholderId);
                                if (data.success && data.url && placeholder) {
                                  const img = document.createElement('img');
                                  img.src = data.url;
                                  img.style.cssText = 'max-width:100%;height:auto;border-radius:8px;margin:8px 0;';
                                  placeholder.replaceWith(img);
                                } else if (placeholder) {
                                  placeholder.textContent = `Image upload failed: ${data.error || 'Unknown error'}`;
                                  placeholder.style.color = '#ff6b6b';
                                }
                              } catch {
                                const placeholder = document.getElementById(placeholderId);
                                if (placeholder) {
                                  placeholder.textContent = 'Image upload failed — check connection';
                                  placeholder.style.color = '#ff6b6b';
                                }
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                          return;
                        }
                      }
                      const clipHtml = e.clipboardData.getData('text/html');
                      if (clipHtml) {
                        e.preventDefault();
                        const tmp = document.createElement('div');
                        tmp.innerHTML = clipHtml;
                        tmp.querySelectorAll('script,style,link,meta,svg').forEach(el => el.remove());
                        tmp.querySelectorAll('img').forEach(img => {
                          const src = img.getAttribute('src') || '';
                          if (src.startsWith('data:')) {
                            const placeholderId = `img-upload-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
                            const span = document.createElement('span');
                            span.id = placeholderId;
                            span.setAttribute('style', 'display:inline-block;background:#302e2b;color:#9e9b98;padding:8px 14px;border-radius:6px;font-size:13px;margin:4px 0;');
                            span.textContent = 'Uploading image...';
                            img.replaceWith(span);
                            (async () => {
                              try {
                                const res = await apiFetch('/api/admin/email/upload-image', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ dataUrl: src }),
                                });
                                const data = await res.json();
                                const el = document.getElementById(placeholderId);
                                if (data.success && data.url && el) {
                                  const newImg = document.createElement('img');
                                  newImg.src = data.url;
                                  newImg.style.cssText = 'max-width:100%;height:auto;border-radius:8px;margin:8px 0;';
                                  el.replaceWith(newImg);
                                } else if (el) {
                                  el.textContent = `Image upload failed`;
                                  el.style.color = '#ff6b6b';
                                }
                              } catch {
                                const el = document.getElementById(placeholderId);
                                if (el) {
                                  el.textContent = 'Image upload failed';
                                  el.style.color = '#ff6b6b';
                                }
                              }
                            })();
                          }
                        });
                        tmp.querySelectorAll('*').forEach(el => el.removeAttribute('class'));
                        document.execCommand('insertHTML', false, tmp.innerHTML);
                      }
                    }}
                    suppressContentEditableWarning
                  />
                </>
              ) : (
                <div className="bg-[#262421] border border-border/40 rounded-xl overflow-hidden">
                  <div className="bg-[#1a1917] px-3 py-2 border-b border-border/20">
                    <p className="text-[10px] text-muted-foreground">Email Preview (as recipient will see it)</p>
                  </div>
                  <div style={{ backgroundColor: '#262421', padding: '20px' }}>
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <h1 style={{ color: '#81b64c', fontSize: '24px', margin: 0 }}>♜ ChessScout.net</h1>
                      </div>
                      <div
                        style={{ backgroundColor: '#302e2b', borderRadius: '12px', padding: '24px', color: '#e8e6e3', fontSize: '15px', lineHeight: '1.7' }}
                        dangerouslySetInnerHTML={{ __html: (() => { const raw = getEditorHtml(); return raw.trim() ? sanitizeForEmail(raw, true) : '<p style="color:#9e9b98;">Your email content will appear here...</p>'; })() }}
                      />
                      <p style={{ color: '#666', fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>
                        ChessScout.net — Know your opponent's weaknesses.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-amber-500/15 bg-amber-500/5 shrink-0 space-y-3">
          {result && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${result.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {result.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              {result.message}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestEmail}
              disabled={sending}
              className="text-xs px-3 py-2.5 rounded-xl bg-[#262421] border border-border/40 text-muted-foreground hover:text-foreground hover:border-amber-500/30 disabled:opacity-50 transition-colors"
            >
              Send Test to Me
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 disabled:opacity-50 text-sm font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending...' : broadcastAll ? 'Send to All Users' : `Send to ${recipients.length} Recipient${recipients.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function AdminTicker() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [showUsers, setShowUsers] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = () => {
      apiFetch('/api/admin/stats', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setStats(d); })
        .catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleEmailUsers = (emails: string[]) => {
    setEmailRecipients(emails);
    setShowUsers(false);
    setShowEmailModal(true);
  };

  const openComposer = () => {
    setEmailRecipients([]);
    setShowEmailModal(true);
  };

  const handleClearCache = async () => {
    if (!confirm('Clear ALL courses, reviews, and weaknesses for every user? Scout reports will be preserved.')) return;
    setClearing(true);
    setClearResult(null);
    try {
      const res = await apiFetch('/api/admin/clear-ai-cache', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok) setClearResult('Cache cleared successfully');
      else setClearResult(data.error || 'Failed');
    } catch { setClearResult('Request failed'); }
    finally { setClearing(false); setTimeout(() => setClearResult(null), 4000); }
  };

  if (!stats) return null;

  return (
    <>
      <motion.div
        variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
        className="bg-card border border-amber-500/20 rounded-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-amber-500/15 bg-amber-500/5">
          <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Admin Dashboard
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={handleClearCache}
                disabled={clearing}
                className="text-[10px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 bg-red-500/10 text-red-400/70 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
              >
                {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {clearing ? 'Clearing...' : 'Clear Cache'}
              </button>
              {clearResult && (
                <span className="text-[10px] font-medium text-emerald-400">{clearResult}</span>
              )}
              <button
                onClick={openComposer}
                className="text-[10px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/15 hover:text-amber-400"
              >
                <Mail className="w-3 h-3" /> Compose
              </button>
              <span className="text-[10px] font-normal text-muted-foreground">auto-refreshes every 30s</span>
            </span>
          </h2>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border/30">
          <div className="p-4 text-center">
            <div className="w-8 h-8 bg-blue-400/10 rounded-xl flex items-center justify-center mx-auto mb-2">
              <Eye className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-xl font-black text-foreground">{(stats.uniqueVisitors?.total ?? stats.pageViews.total).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground font-medium">Unique Visitors</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{(stats.uniqueVisitors?.today ?? stats.pageViews.today)} today</p>
          </div>
          <button
            onClick={() => setShowUsers(v => !v)}
            className="p-4 text-center hover:bg-emerald-400/5 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 bg-emerald-400/10 rounded-xl flex items-center justify-center mx-auto mb-2">
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xl font-black text-foreground">{stats.users.total.toLocaleString()}</p>
            <p className="text-xs text-emerald-400 font-medium underline decoration-dotted underline-offset-2">Users</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{stats.users.today} today</p>
          </button>
          <div className="p-4 text-center">
            <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-2">
              <CreditCard className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xl font-black text-foreground">{stats.subscriptions.total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground font-medium">Subscriptions</p>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5 space-y-0.5">
              {stats.subscriptions.active > 0 && <p className="text-emerald-400">{stats.subscriptions.active} paid</p>}
              {stats.subscriptions.trialing > 0 && <p className="text-blue-400">{stats.subscriptions.trialing} trial</p>}
              {stats.subscriptions.pastDue > 0 && <p className="text-orange-400">{stats.subscriptions.pastDue} past due</p>}
            </div>
          </div>
        </div>
        <AnimatePresence>
          {showUsers && <UserListPanel onClose={() => setShowUsers(false)} onEmailUsers={handleEmailUsers} />}
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/40 bg-card overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-border/30 bg-orange-500/5">
          <h3 className="text-sm font-bold text-orange-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Admin Tools
          </h3>
        </div>
        <div className="p-4 space-y-2">
          <button
            onClick={async () => {
              if (!confirm('This will normalize all Chess960 game FENs in the database and clear their cached reviews. Continue?')) return;
              try {
                const res = await apiFetch('/api/admin/fix-chess960', { method: 'POST' });
                const data = await res.json() as { fixedPgns?: number; totalGames?: number; error?: string };
                if (res.ok) alert(`Fixed ${data.fixedPgns} Chess960 games out of ${data.totalGames} total.`);
                else alert(`Error: ${data.error || 'Unknown error'}`);
              } catch { alert('Failed to run fix'); }
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-orange-500/10 text-left border border-orange-500/20"
          >
            <span className="text-lg">♜</span>
            <div>
              <p className="text-foreground font-bold">Fix Chess960 Games</p>
              <p className="text-xs text-muted-foreground">Normalize FENs for old imported Chess960 games &amp; clear stale reviews</p>
            </div>
          </button>
        </div>
      </motion.div>

      <MarketingPanel />

      <OutreachStudio />

      <SeoArticlesPanel />
      <FacebookAutoPostPanel />

      <AnimatePresence>
        {showEmailModal && (
          <EmailComposerModal
            onClose={() => setShowEmailModal(false)}
            initialRecipients={emailRecipients}
          />
        )}
      </AnimatePresence>
    </>
  );
}

const MARKETING_THEMES = ["Free Trial", "Opponent Scouting", "Game Analysis", "New Feature", "General Promo", "ELO Improvement"];

function MarketingPanel() {
  const [theme, setTheme] = useState(MARKETING_THEMES[0]);
  const [customNote, setCustomNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<Array<{ platform: string; title?: string; content: string }>>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ theme, customNote: customNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Generation failed'); return; }
      if (data.posts && Array.isArray(data.posts)) setPosts(data.posts);
      else setError('Unexpected response format');
    } catch { setError('Network error — could not reach server'); }
    finally { setLoading(false); }
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const platformIcon = (p: string) => {
    if (p.includes('Twitter')) return '𝕏';
    if (p.includes('Reddit')) return '🟠';
    if (p.includes('Facebook')) return '📘';
    if (p.includes('Instagram')) return '📸';
    if (p.includes('Discord')) return '💬';
    return '📝';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/40 bg-card overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-border/30 bg-purple-500/5">
        <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">
          <Megaphone className="w-4 h-4" /> Marketing Copy Generator
        </h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <select
              value={theme}
              onChange={e => setTheme(e.target.value)}
              className="w-full appearance-none bg-background border border-border/40 rounded-xl px-3 py-2 text-sm text-foreground pr-8 focus:outline-none focus:border-purple-500/40"
            >
              {MARKETING_THEMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-400 text-xs font-bold hover:bg-purple-500/25 transition-colors disabled:opacity-50 shrink-0"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {loading ? 'Generating...' : 'Generate Ads'}
          </button>
        </div>
        <input
          type="text"
          value={customNote}
          onChange={e => setCustomNote(e.target.value)}
          placeholder="Optional: custom note or specific angle..."
          className="w-full bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500/30"
        />

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {posts.length > 0 && (
          <div className="space-y-2 mt-2">
            {posts.map((post, i) => {
              const fullText = post.title ? `${post.title}\n\n${post.content}` : post.content;
              return (
                <div key={i} className="rounded-xl border border-border/30 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-background/50 border-b border-border/20">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{platformIcon(post.platform)}</span>
                      <span className="text-xs font-bold text-foreground">{post.platform}</span>
                      <span className="text-[10px] text-muted-foreground/60">{fullText.length} chars</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(fullText, i)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors hover:bg-purple-500/10 text-purple-400"
                    >
                      {copiedIdx === i ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                  <div className="px-3 py-2.5">
                    {post.title && (
                      <p className="text-xs font-bold text-foreground mb-1">{post.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{post.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const OUTREACH_STATUS_COLORS: Record<string, string> = {
  new: '#9e9b98',
  drafted: '#e8c830',
  posted: CHESSCOM_GREEN,
  skipped: '#6b6864',
};

interface OutreachLead {
  id: string;
  platform: string;
  sourceUrl: string | null;
  context: string;
  draftContent: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface RedditCandidate {
  title: string;
  selftext: string;
  permalink: string;
  author: string;
  subreddit: string;
  createdUtc: number;
  numComments: number;
}

function OutreachStudio() {
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlatform, setNewPlatform] = useState('reddit');
  const [newUrl, setNewUrl] = useState('');
  const [newContext, setNewContext] = useState('');
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('why do I keep losing');
  const [searchSubreddit, setSearchSubreddit] = useState('chess');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<RedditCandidate[]>([]);
  const [searchError, setSearchError] = useState('');
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/outreach/leads', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.leads)) setLeads(data.leads);
    } catch { /* leave leads as-is on failure */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const addLead = async () => {
    if (!newContext.trim()) return;
    try {
      const res = await apiFetch('/api/admin/outreach/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ platform: newPlatform, sourceUrl: newUrl.trim() || undefined, context: newContext.trim() }),
      });
      if (res.ok) {
        setNewUrl('');
        setNewContext('');
        setShowAddForm(false);
        loadLeads();
      }
    } catch { /* form stays populated so the admin can retry */ }
  };

  const searchReddit = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResults([]);
    try {
      const params = new URLSearchParams({ query: searchQuery.trim(), subreddit: searchSubreddit.trim() || 'chess' });
      const res = await apiFetch(`/api/admin/outreach/search-reddit?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.candidates)) {
        setSearchResults(data.candidates);
        if (data.candidates.length === 0) setSearchError('No matching posts found — try a different search term or subreddit.');
      } else {
        setSearchError(data.error || 'Search failed');
      }
    } catch {
      setSearchError('Search failed — network error');
    }
    setSearching(false);
  };

  const addCandidateAsLead = async (candidate: RedditCandidate) => {
    try {
      const res = await apiFetch('/api/admin/outreach/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          platform: 'reddit',
          sourceUrl: candidate.permalink,
          context: candidate.selftext ? `${candidate.title}\n\n${candidate.selftext}` : candidate.title,
        }),
      });
      if (res.ok) {
        setAddedUrls((prev) => new Set(prev).add(candidate.permalink));
        loadLeads();
      }
    } catch { /* candidate stays in results, admin can retry */ }
  };

  const generateDraft = async (id: string) => {
    setGeneratingId(id);
    try {
      const res = await apiFetch(`/api/admin/outreach/leads/${id}/generate-draft`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
      }
    } catch { /* leave lead as-is, admin can retry */ }
    setGeneratingId(null);
  };

  const updateStatus = async (id: string, status: string) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await apiFetch(`/api/admin/outreach/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
    } catch { /* optimistic update already applied; a refresh will resync */ }
  };

  const deleteLead = async (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    try {
      await apiFetch(`/api/admin/outreach/leads/${id}`, { method: 'DELETE', credentials: 'include' });
    } catch { /* optimistic removal already applied */ }
  };

  const copyDraft = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  };

  const filteredLeads = filter === 'all' ? leads : leads.filter((l) => l.status === filter);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{ background: BG_CARD, border: `1px solid rgba(255,255,255,0.08)` }}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
          <Send className="w-5 h-5" style={{ color: CHESSCOM_GREEN }} />
          Outreach Studio
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSearch((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {showSearch ? 'Hide search' : '🔍 Search Reddit'}
          </button>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: CHESSCOM_GREEN, color: '#000' }}
          >
            {showAddForm ? 'Cancel' : '+ Add lead'}
          </button>
        </div>
      </div>
      <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>
        Paste a real thread, tweet, or message where someone's asking a question your product actually answers. Generate a tailored reply, review it, copy it, and post it yourself — nothing here posts anything automatically.
      </p>

      {showSearch && (
        <div className="mb-5 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
            Read-only search of Reddit's public posts — nothing gets added to your queue until you click "Add as lead" on a specific result.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') searchReddit(); }}
              placeholder="Search terms, e.g. 'why do I keep losing'"
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(0,0,0,0.25)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <div className="flex gap-2">
              <input
                value={searchSubreddit}
                onChange={(e) => setSearchSubreddit(e.target.value)}
                placeholder="subreddit"
                className="w-32 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(0,0,0,0.25)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button
                onClick={searchReddit}
                disabled={searching || !searchQuery.trim()}
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 disabled:opacity-40 shrink-0"
                style={{ background: CHESSCOM_GREEN, color: '#000' }}
              >
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Search
              </button>
            </div>
          </div>

          {searchError && <p className="text-xs mb-2" style={{ color: '#e88930' }}>{searchError}</p>}

          {searchResults.length > 0 && (
            <div className="space-y-2 mt-3">
              {searchResults.map((c) => {
                const alreadyAdded = addedUrls.has(c.permalink);
                return (
                  <div key={c.permalink} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: TEXT_LIGHT }}>{c.title}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>
                          r/{c.subreddit} · u/{c.author} · {c.numComments} comments
                        </p>
                        {c.selftext && (
                          <p className="text-xs mt-1.5 line-clamp-2" style={{ color: TEXT_MUTED }}>{c.selftext}</p>
                        )}
                      </div>
                      <button
                        onClick={() => addCandidateAsLead(c)}
                        disabled={alreadyAdded}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 disabled:opacity-50"
                        style={{ background: alreadyAdded ? 'rgba(255,255,255,0.06)' : `${CHESSCOM_GREEN}18`, color: alreadyAdded ? TEXT_MUTED : CHESSCOM_GREEN }}
                      >
                        {alreadyAdded ? 'Added ✓' : '+ Add as lead'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="mb-5 p-4 rounded-xl space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <select
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(0,0,0,0.25)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <option value="reddit">Reddit</option>
            <option value="twitter">Twitter/X</option>
            <option value="discord">Discord</option>
            <option value="forum">Forum</option>
            <option value="other">Other</option>
          </select>
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Link to the post (optional)"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(0,0,0,0.25)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <textarea
            value={newContext}
            onChange={(e) => setNewContext(e.target.value)}
            placeholder="Paste what they actually said/asked, verbatim..."
            rows={4}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: 'rgba(0,0,0,0.25)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <button
            onClick={addLead}
            disabled={!newContext.trim()}
            className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40"
            style={{ background: CHESSCOM_GREEN, color: '#000' }}
          >
            Add to queue
          </button>
        </div>
      )}

      <div className="flex gap-1.5 mb-3">
        {['all', 'new', 'drafted', 'posted', 'skipped'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-2.5 py-1 rounded-md text-[11px] font-bold capitalize"
            style={filter === f
              ? { background: CHESSCOM_GREEN, color: '#000' }
              : { background: 'rgba(255,255,255,0.05)', color: TEXT_MUTED }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: TEXT_MUTED }} /></div>
      ) : filteredLeads.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: TEXT_MUTED }}>No leads {filter !== 'all' ? `with status "${filter}"` : 'yet'}.</p>
      ) : (
        <div className="space-y-3">
          {filteredLeads.map((lead) => (
            <div key={lead.id} className="p-3.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_MUTED }}>{lead.platform}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${OUTREACH_STATUS_COLORS[lead.status]}18`, color: OUTREACH_STATUS_COLORS[lead.status] }}>{lead.status}</span>
                  {lead.sourceUrl && (
                    <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] underline" style={{ color: TEXT_MUTED }}>source ↗</a>
                  )}
                </div>
                <button onClick={() => deleteLead(lead.id)} className="p-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>{lead.context}</p>

              {lead.draftContent && (
                <div className="p-3 rounded-lg mb-3" style={{ background: 'rgba(129,182,76,0.06)', border: '1px solid rgba(129,182,76,0.15)' }}>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: TEXT_LIGHT }}>{lead.draftContent}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => generateDraft(lead.id)}
                  disabled={generatingId === lead.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {generatingId === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {lead.draftContent ? 'Regenerate draft' : 'Generate draft'}
                </button>
                {lead.draftContent && (
                  <button
                    onClick={() => copyDraft(lead.id, lead.draftContent!)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <Copy className="w-3 h-3" /> {copiedId === lead.id ? 'Copied!' : 'Copy'}
                  </button>
                )}
                {lead.status !== 'posted' && (
                  <button onClick={() => updateStatus(lead.id, 'posted')} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: `${CHESSCOM_GREEN}18`, color: CHESSCOM_GREEN }}>
                    Mark posted
                  </button>
                )}
                {lead.status !== 'skipped' && (
                  <button onClick={() => updateStatus(lead.id, 'skipped')} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ color: TEXT_MUTED }}>
                    Skip
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

interface SeoArticle {
  id: string;
  slug: string;
  title: string;
  targetKeyword: string;
  metaDescription: string;
  published: boolean;
  createdAt: string;
}

function SeoArticlesPanel() {
  const [articles, setArticles] = useState<SeoArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/seo-articles', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.articles)) setArticles(data.articles);
    } catch { /* leave articles as-is on failure */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadArticles(); }, [loadArticles]);

  const generateNow = async () => {
    setGenerating(true);
    setGenerateMsg('');
    try {
      const res = await apiFetch('/api/admin/seo-articles/generate', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.published) {
        setGenerateMsg(`Published: ${data.slug}`);
        loadArticles();
      } else {
        setGenerateMsg(data.reason || 'Nothing generated');
      }
    } catch {
      setGenerateMsg('Generation failed — network error');
    }
    setGenerating(false);
  };

  const togglePublished = async (id: string, published: boolean) => {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, published } : a)));
    try {
      await apiFetch(`/api/admin/seo-articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ published }),
      });
    } catch { /* optimistic update already applied */ }
  };

  const deleteArticle = async (id: string) => {
    setArticles((prev) => prev.filter((a) => a.id !== id));
    try {
      await apiFetch(`/api/admin/seo-articles/${id}`, { method: 'DELETE', credentials: 'include' });
    } catch { /* optimistic removal already applied */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{ background: BG_CARD, border: `1px solid rgba(255,255,255,0.08)` }}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
          <FileText className="w-5 h-5" style={{ color: CHESSCOM_GREEN }} />
          SEO Articles
        </h2>
        <button
          onClick={generateNow}
          disabled={generating}
          className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: CHESSCOM_GREEN, color: '#000' }}
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Generate now
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>
        Runs automatically once a week from a curated keyword queue. Use "Generate now" to publish the next one immediately instead of waiting.
      </p>
      {generateMsg && (
        <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(129,182,76,0.08)', color: CHESSCOM_GREEN }}>{generateMsg}</p>
      )}

      {loading ? (
        <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: TEXT_MUTED }} /></div>
      ) : articles.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: TEXT_MUTED }}>No articles generated yet.</p>
      ) : (
        <div className="space-y-2">
          {articles.map((a) => (
            <div key={a.id} className="p-3.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                  <p className="text-sm font-semibold truncate" style={{ color: TEXT_LIGHT }}>{a.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>targeting: "{a.targetKeyword}"</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{
                  background: a.published ? `${CHESSCOM_GREEN}18` : 'rgba(255,255,255,0.06)',
                  color: a.published ? CHESSCOM_GREEN : TEXT_MUTED,
                }}>
                  {a.published ? 'Live' : 'Unpublished'}
                </span>
              </div>
              {expandedId === a.id && (
                <p className="text-xs mt-2 pt-2" style={{ color: TEXT_MUTED, borderTop: '1px solid rgba(255,255,255,0.06)' }}>{a.metaDescription}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <a
                  href={`/learn/${a.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  View live ↗
                </a>
                <button
                  onClick={() => togglePublished(a.id, !a.published)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ color: TEXT_MUTED, border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {a.published ? 'Unpublish' : 'Republish'}
                </button>
                <button onClick={() => deleteArticle(a.id)} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: TEXT_MUTED }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function FacebookAutoPostPanel() {
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState('');

  const postNow = async () => {
    setPosting(true);
    setPostMsg('');
    try {
      const res = await apiFetch('/api/admin/facebook/post-now', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.posted) {
        setPostMsg(`Posted a ${data.type}.`);
      } else {
        setPostMsg(data.reason || data.error || 'Nothing posted');
      }
    } catch {
      setPostMsg('Post failed \u2014 network error');
    }
    setPosting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{ background: BG_CARD, border: `1px solid rgba(255,255,255,0.08)` }}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
          <span>\ud83d\udcd8</span> Facebook Auto-Post
        </h2>
        <button
          onClick={postNow}
          disabled={posting}
          className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: CHESSCOM_GREEN, color: '#000' }}
        >
          {posting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Post now
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
        Runs automatically Mon/Wed/Fri at 2pm \u2014 mostly mate-in-2/3 puzzles from the curated set, occasionally promoting a published article. Requires FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN to be set.
      </p>
      {postMsg && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(129,182,76,0.08)', color: CHESSCOM_GREEN }}>{postMsg}</p>
      )}
    </motion.div>
  );
}
