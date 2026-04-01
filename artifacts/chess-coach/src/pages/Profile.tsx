import React, { useState, useEffect } from 'react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMyAnalysisSummary } from '@/hooks/use-analysis';
import { useMyGames } from '@/hooks/use-games';
import { useMyCourses } from '@/hooks/use-courses';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Mail, Crown, LogOut, ChevronRight, Trophy, Swords, Target,
  GraduationCap, Settings, Shield, Edit3, Check, X, Eye, Users, CreditCard,
  Activity
} from 'lucide-react';

interface AdminStats {
  pageViews: { total: number; today: number };
  users: { total: number; today: number };
  subscriptions: { active: number };
}

interface AdminUser {
  id: string;
  email: string | null;
  chesscomUsername: string | null;
  firstName: string | null;
  createdAt: string;
}

function UserListPanel({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.users) setUsers(d.users); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border-t border-amber-500/15 overflow-hidden"
    >
      <div className="px-4 py-3 flex items-center justify-between bg-amber-500/5">
        <span className="text-xs font-bold text-amber-400">Registered Users</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
        ) : users.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No users found</p>
        ) : (
          <div className="divide-y divide-border/20">
            {users.map(u => (
              <div key={u.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {u.email || (u.chesscomUsername ? `♟ ${u.chesscomUsername}` : u.firstName || 'Unknown')}
                  </p>
                  {u.email && u.chesscomUsername && (
                    <p className="text-[11px] text-muted-foreground/60 truncate">♟ {u.chesscomUsername}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap shrink-0">
                  {new Date(u.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AdminTicker() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [showUsers, setShowUsers] = useState(false);

  useEffect(() => {
    const fetchStats = () => {
      fetch('/api/admin/stats', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setStats(d); })
        .catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
      className="bg-card border border-amber-500/20 rounded-2xl overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-amber-500/15 bg-amber-500/5">
        <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Admin Dashboard
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">auto-refreshes every 30s</span>
        </h2>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border/30">
        <div className="p-4 text-center">
          <div className="w-8 h-8 bg-blue-400/10 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Eye className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xl font-black text-foreground">{stats.pageViews.total.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground font-medium">Page Views</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{stats.pageViews.today} today</p>
        </div>
        <button
          onClick={() => setShowUsers(v => !v)}
          className="p-4 text-center hover:bg-emerald-400/5 transition-colors cursor-pointer"
        >
          <div className="w-8 h-8 bg-emerald-400/10 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-black text-foreground">{stats.users.total.toLocaleString()}</p>
          <p className="text-xs text-emerald-400 font-medium underline decoration-dotted underline-offset-2">Users</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{stats.users.today} today</p>
        </button>
        <div className="p-4 text-center">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-2">
            <CreditCard className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xl font-black text-foreground">{stats.subscriptions.active.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground font-medium">Subscriptions</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">active</p>
        </div>
      </div>
      <AnimatePresence>
        {showUsers && <UserListPanel onClose={() => setShowUsers(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

export function Profile() {
  const { username, authUser, isPremium, subscription, authLogout, login, logout } = useUser();
  const { player } = useChessPlayer(username ?? undefined);
  const { data: summary } = useMyAnalysisSummary();
  const { data: gamesData } = useMyGames();
  const { data: coursesData } = useMyCourses();
  const [, setLocation] = useLocation();

  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(username ?? '');
  const [saving, setSaving] = useState(false);

  const totalGames = gamesData?.games?.length ?? 0;
  const winRate = summary ? ((summary.winRate || 0) * 100).toFixed(1) : null;
  const activeCourses = coursesData?.courses?.filter(c => c.completedLessons < c.totalLessons).length || 0;
  const completedCourses = coursesData?.courses?.filter(c => c.completedLessons >= c.totalLessons).length || 0;

  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed || trimmed === username) {
      setEditingUsername(false);
      return;
    }
    setSaving(true);
    try {
      login(trimmed);
      if (authUser) {
        await fetch('/api/auth/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chesscomUsername: trimmed }),
        });
      }
      setEditingUsername(false);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    if (authUser) {
      authLogout();
    } else {
      logout();
    }
  };

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 p-4 md:p-0">

      <motion.div variants={item} className="relative overflow-hidden bg-gradient-to-br from-[hsl(89,44%,18%)] via-card to-card border border-primary/10 rounded-2xl p-5 md:p-6">
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{ backgroundImage: 'repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)', backgroundSize: '36px 36px' }}
        />
        <div className="relative flex items-center gap-4">
          <div className="shrink-0">
            {player?.avatar
              ? <img src={player.avatar} alt={username ?? ''} className="w-20 h-20 rounded-2xl object-cover border-2 border-primary/40 shadow-lg shadow-primary/20" />
              : <div className="w-20 h-20 rounded-2xl bg-primary/20 border-2 border-primary/30 flex items-center justify-center">
                  <User className="w-10 h-10 text-primary" />
                </div>
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {player?.title && (
                <span className="text-xs font-bold text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded">{player.title}</span>
              )}
              {authUser?.isAdmin && (
                <span className="text-xs font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Shield className="w-3 h-3" /> ADMIN
                </span>
              )}
              {isPremium && !authUser?.isAdmin && (
                <span className="text-xs font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Crown className="w-3 h-3" /> PRO
                </span>
              )}
            </div>
            {editingUsername ? (
              <div className="flex items-center gap-2">
                <input
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="bg-background/60 border border-border rounded-lg px-2 py-1 text-sm font-bold text-foreground w-full max-w-[200px]"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
                />
                <button onClick={handleSaveUsername} disabled={saving} className="p-1 text-primary hover:bg-primary/10 rounded">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => { setEditingUsername(false); setNewUsername(username ?? ''); }} className="p-1 text-muted-foreground hover:bg-secondary rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-foreground truncate">{player?.name || username}</h1>
                <button onClick={() => setEditingUsername(true)} className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {username && <p className="text-sm text-muted-foreground">@{username}</p>}
            {authUser?.email && (
              <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3" /> {authUser.email}
              </p>
            )}
            {player?.rating && (
              <p className="text-sm font-bold text-primary mt-1">{player.rating} ELO</p>
            )}
          </div>
        </div>
      </motion.div>

      {authUser?.isAdmin && <AdminTicker />}

      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Games', value: totalGames, icon: Swords, color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { label: 'Win Rate', value: winRate ? `${winRate}%` : '—', icon: Trophy, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
          { label: 'Rating', value: player?.rating ?? '—', icon: Target, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Courses', value: `${completedCourses}/${(completedCourses + activeCourses) || 0}`, icon: GraduationCap, color: 'text-amber-400', bg: 'bg-amber-400/10' },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border/50 rounded-xl p-4 text-center">
            <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center mx-auto mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-lg font-black text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </motion.div>

      <motion.div variants={item} className="bg-card border border-border/50 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" /> Account
          </h2>
        </div>

        <Link href="/subscription" className="flex items-center justify-between px-4 py-3.5 hover:bg-secondary/40 transition-colors border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Crown className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Subscription</p>
              <p className="text-xs text-muted-foreground">
                {subscription.status === 'free_trial'
                  ? `Free Trial — ${subscription.trialDaysLeft} day${subscription.trialDaysLeft === 1 ? '' : 's'} left`
                  : isPremium
                    ? `Pro — ${subscription.status === 'trialing' ? 'Stripe Trial' : 'Active'}`
                    : 'Free Plan — Trial ended'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>

        <Link href="/analysis" className="flex items-center justify-between px-4 py-3.5 hover:bg-secondary/40 transition-colors border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-400/10 rounded-lg flex items-center justify-center">
              <Target className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Analysis</p>
              <p className="text-xs text-muted-foreground">View your game analysis</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>

        <Link href="/courses" className="flex items-center justify-between px-4 py-3.5 hover:bg-secondary/40 transition-colors border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-400/10 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Courses</p>
              <p className="text-xs text-muted-foreground">{activeCourses} active, {completedCourses} completed</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-500/5 transition-colors text-left"
        >
          <div className="w-8 h-8 bg-red-400/10 rounded-lg flex items-center justify-center">
            <LogOut className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-sm font-semibold text-red-400">Sign Out</p>
        </button>
      </motion.div>

    </motion.div>
  );
}
