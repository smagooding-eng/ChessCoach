import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PieceTile } from '@/components/DesignSystem';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMyAnalysisSummary } from '@/hooks/use-analysis';
import { useLiveRatings } from '@/hooks/use-live-ratings';
import { useMyGames } from '@/hooks/use-games';
import { useMyCourses } from '@/hooks/use-courses';
import { Link, useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Mail, Crown, LogOut, ChevronRight, Trophy, Swords, Target,
  GraduationCap, Settings, Shield, Edit3, Check, X, Eye, Users, CreditCard,
  Activity, Send, AlertCircle, CheckCircle2, Bold, Italic, Heading1, Heading2,
  Link as LinkIcon, Image, Type, Palette, List, ListOrdered, Minus, Undo2, Redo2, FileText, Sparkles,
  Trash2, Loader2, Zap, Gift, Copy, UserPlus, Megaphone, ChevronDown
} from 'lucide-react';

interface AdminStats {
  pageViews: { total: number; today: number };
  uniqueVisitors: { total: number; today: number };
  users: { total: number; today: number };
  subscriptions: { active: number; trialing: number; canceled: number; pastDue: number; total: number };
}

interface AdminUser {
  id: string;
  email: string | null;
  chesscomUsername: string | null;
  firstName: string | null;
  createdAt: string;
  tier: 'admin' | 'pro' | 'free';
  tierDetail: number | null;
  planInterval: string | null;
  daysSinceLogin: number | null;
}

type UserFilter = 'all' | 'admin' | 'pro' | 'free';

function TierBadge({ user }: { user: AdminUser }) {
  const interval = user.planInterval === 'year' ? '/yr' : user.planInterval === 'month' ? '/mo' : '';

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
  checkmate: 'https://images.unsplash.com/photo-1708627535997-a6e7fae7b43b?w=600&h=300&fit=crop&q=80',
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
    subject: 'Welcome to ChessScout.net — Your Chess Edge Starts Now',
    html: `<img src="${CHESS_IMAGES.board}" alt="Chess board" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Welcome to ChessScout.net! ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">The smartest way to prepare for your opponents</p>
<p>You've just joined the chess tool that serious players use to gain an edge before every game. ChessScout.net analyzes your opponents so you don't have to.</p>
${divider}
<h3 style="color:#81b64c;font-size:16px;margin:0 0 12px;">Here's what you can do right now:</h3>
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">🔍</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Opponent Scout</strong><br/><span style="color:#9e9b98;font-size:13px;">Deep analysis of any player's openings, weaknesses &amp; tendencies</span></td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">♟️</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Game Lookup</strong><br/><span style="color:#9e9b98;font-size:13px;">Review any Chess.com game with move-by-move replay</span></td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">🧩</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Puzzles</strong><br/><span style="color:#9e9b98;font-size:13px;">5 free puzzles a day, filterable by type — mate in 2, forks, pins &amp; more</span></td></tr>
<tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">🤖</td><td style="padding:8px 0;"><strong style="color:#e8e6e3;">Practice Bots</strong><br/><span style="color:#9e9b98;font-size:13px;">Train against bots calibrated to different rating levels — unlimited, always free</span></td></tr>
</table>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Start Scouting Your Opponents →</a></p>
<p style="text-align:center;margin-top:12px;"><span style="color:#9e9b98;font-size:12px;">Free plan includes 5 puzzles/day, 1 basic opponent scout, and unlimited practice bots — no card required</span></p>`,
  },
  {
    name: '⭐ Upgrade to Pro',
    subject: 'Unlock the Full Power of ChessScout.net Pro',
    html: `<img src="${CHESS_IMAGES.king}" alt="Chess king" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Ready to Level Up? ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">You've been using ChessScout.net's free tier — here's what Pro unlocks</p>
<p>Here's what you'll get with ChessScout.net Pro:</p>
<div style="background:#262421;border-radius:8px;padding:16px;margin:20px 0;">
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;color:#9e9b98;">TTS coach narration on every puzzle &amp; lesson</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;color:#9e9b98;">Unlimited opponent scouting reports</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;color:#9e9b98;">Coach move explanations</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;color:#9e9b98;">Unlimited personalized courses</td></tr>
<tr><td style="padding:6px 0;color:#81b64c;">✓</td><td style="padding:6px 0;color:#9e9b98;">Unlimited game imports</td></tr>
</table>
</div>
<div style="text-align:center;background:linear-gradient(135deg,rgba(129,182,76,0.1),rgba(129,182,76,0.05));border:1px solid rgba(129,182,76,0.2);border-radius:8px;padding:20px;margin-bottom:20px;">
<p style="color:#e8e6e3;font-size:14px;margin:0 0 4px;">Plans start at just</p>
<p style="color:#81b64c;font-size:28px;font-weight:700;margin:0;">$5<span style="font-size:14px;font-weight:400;color:#9e9b98;">/month</span></p>
<p style="color:#9e9b98;font-size:12px;margin:4px 0 0;">Or $55/year. Less than a coffee. Cancel anytime.</p>
</div>
<p style="text-align:center;"><a href="https://chessscout.net/subscription" style="${btnStyle}">Upgrade to Pro →</a></p>`,
  },
  {
    name: '🚀 New Feature',
    subject: 'New on ChessScout.net: [Feature Name]',
    html: `<img src="${CHESS_IMAGES.strategy}" alt="Chess strategy" style="${imgStyle}" />
${badge('NEW')}
<h2 style="color:#81b64c;margin:12px 0 8px;">[Feature Name] is Here ♞</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">[One-line description of what it does and why it matters]</p>
<p>[2-3 sentences explaining the feature, what problem it solves, and how to find it in the app.]</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Try It Now →</a></p>`,
  },
  {
    name: '🧩 Weekly Puzzle Challenge',
    subject: 'Your Weekly Puzzle Challenge Is Ready',
    html: `<img src="${CHESS_IMAGES.checkmate}" alt="Chess puzzle" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">This Week's Puzzle Challenge ♞</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Sharpen your tactics in five minutes a day</p>
<p>A fresh set of puzzles is waiting for you — tuned to your rating and drawn from real games. Keep your streak alive.</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net/puzzles" style="${btnStyle}">Solve Today's Puzzles →</a></p>
<p style="text-align:center;margin-top:12px;"><span style="color:#9e9b98;font-size:12px;">Tip: filter by puzzle type on the Puzzles page — mate in 1, 2, 3 and more</span></p>`,
  },
  {
    name: '📊 Your Weekly Stats',
    subject: 'Your Chess Week in Review',
    html: `<img src="${CHESS_IMAGES.study}" alt="Chess analysis" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Your Weekly Recap ♛</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Here's how your chess week went</p>
<p>Log in to see your accuracy trend, blunder rate, and the openings that gave you the most trouble this week — plus a fresh set of key weaknesses to work on.</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">View Your Stats →</a></p>`,
  },
  {
    name: '🏆 Tournament Prep',
    subject: 'Playing in a Tournament Soon? Prep With ChessScout.net',
    html: `<img src="${CHESS_IMAGES.tournament}" alt="Chess tournament" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Walk In Prepared ♜</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Know your opponent before you sit down</p>
<p>If you know who you're facing next, scout them first. ChessScout.net builds a full report on their openings, tendencies, and weak spots — the same prep top players use.</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net/opponents" style="${btnStyle}">Scout an Opponent →</a></p>`,
  },
  {
    name: '💡 Chess Tips',
    subject: 'A Quick Chess Tip to Level Up Your Game',
    html: `<img src="${CHESS_IMAGES.pieces}" alt="Chess pieces" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Tip of the Week ♝</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">[Short, punchy tip headline]</p>
<p>[2-4 sentences with a concrete, actionable chess tip — an opening idea, a tactical pattern, or an endgame technique.]</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net/analysis" style="${btnStyle}">See This In Your Own Games →</a></p>`,
  },
  {
    name: '📬 Win of the Week',
    subject: 'Your Best Game This Week — Take a Look',
    html: `<img src="${CHESS_IMAGES.checkmate}" alt="Chess victory" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Nice Win! ♚</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">We spotted a strong game in your recent history</p>
<p>One of your recent games stood out — clean tactics, solid technique, a real step up. Take a look at the full breakdown and see exactly what you did right.</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net/games" style="${btnStyle}">Review the Game →</a></p>`,
  },
  {
    name: '🎯 Re-engagement',
    subject: "It's Been a While — Your Chess Progress Is Waiting",
    html: `<img src="${CHESS_IMAGES.opening}" alt="Chess opening" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">We Miss You at the Board ♞</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">Pick up right where you left off</p>
<p>It's been a bit since your last visit. Your stats, puzzles, and weakness reports are all still here — ready whenever you are.</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net" style="${btnStyle}">Jump Back In →</a></p>`,
  },
  {
    name: '📚 Opening Guide',
    subject: 'Master a New Opening This Week',
    html: `<img src="${CHESS_IMAGES.opening}" alt="Chess opening book" style="${imgStyle}" />
<h2 style="color:#81b64c;margin:0 0 8px;">Expand Your Repertoire ♝</h2>
<p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">[Opening name] — a strong choice worth learning</p>
<p>[2-3 sentences introducing the opening — the key idea, a typical plan, and why it suits the reader's style.]</p>
${divider}
<p style="text-align:center;"><a href="https://chessscout.net/openings" style="${btnStyle}">Explore Openings →</a></p>`,
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
    const text = prompt('Button text:', 'Visit ChessScout.net');
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
              className={`text-xs px-2.5 py-1.5 rounded transition-colors flex items-center gap-1 ${showTemplates ? 'bg-amber-500/30 text-amber-300' : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'}`}
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
                      className="text-[10px] px-2 py-1 rounded bg-amber-500/25 text-amber-300 hover:bg-amber-500/35 hover:text-amber-200 transition-colors whitespace-nowrap"
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
            <div className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl ${result.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300' : 'bg-red-500/20 border border-red-500/40 text-red-300'}`}>
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
                className="text-[10px] font-black px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 bg-red-500/25 border border-red-500/50 text-red-300 hover:bg-red-500/35 disabled:opacity-50"
              >
                {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {clearing ? 'Clearing...' : 'Clear Cache'}
              </button>
              {clearResult && (
                <span className="text-[10px] font-medium text-emerald-400">{clearResult}</span>
              )}
              <button
                onClick={openComposer}
                className="text-[10px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 bg-amber-500/25 text-amber-300 hover:bg-amber-500/35 hover:text-amber-200"
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
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-orange-500/25 text-left border border-orange-500/45"
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

const MARKETING_THEMES = ["Free Tier", "Opponent Scouting", "Game Analysis", "New Feature", "General Promo", "ELO Improvement"];

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
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold">
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

interface ReferralData {
  inviteCode: string | null;
  isPaid: boolean;
  totalReferred: number;
  totalConverted: number;
  referrals: { id: string; status: string; createdAt: string; convertedAt: string | null; referredName: string }[];
}

export function ReferralCard({ isPremium, compact = false }: { isPremium: boolean; compact?: boolean }) {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    apiFetch('/api/auth/referrals', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const siteUrl = window.location.origin;
  const referralLink = data?.inviteCode ? `${siteUrl}?ref=${data.inviteCode}` : null;

  const handleCopy = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyCode = () => {
    if (data?.inviteCode) {
      navigator.clipboard.writeText(data.inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  if (compact) {
    return (
      <motion.div
        variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
        className="bg-card border border-border/50 rounded-xl overflow-hidden"
      >
        {!isPremium || !data?.isPaid ? (
          <Link href="/subscription" className="flex items-center gap-3 px-4 py-3 group">
            <Gift className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-xs font-bold text-foreground">Go Pro to unlock referrals</p>
            <ChevronRight className="w-3.5 h-3.5 text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
          </Link>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3">
            <Gift className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-xs font-bold text-foreground truncate">
              {data?.totalReferred ?? 0} referred &middot; {data?.totalConverted ?? 0} went Pro
            </p>
            <button
              onClick={handleCopy}
              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                copied ? 'bg-emerald-500/15 text-emerald-400' : 'bg-primary/10 text-primary hover:bg-primary/20'
              }`}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
      className="bg-card border border-border/50 rounded-xl overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border/30">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Gift className="w-4 h-4 text-primary" /> Refer a Friend
        </h2>
      </div>
      <div className="p-4">
        {!isPremium || !data?.isPaid ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Crown className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-bold text-foreground mb-1">Unlock Referrals</p>
            <p className="text-xs text-muted-foreground mb-3">
              Become a Pro subscriber to get your personal referral link and invite friends to ChessScout.net.
            </p>
            <Link href="/subscription" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
              Upgrade to Pro <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {data?.inviteCode && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Your referral code</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-background/60 border border-primary/30 rounded-xl px-4 py-3 text-center">
                    <span className="text-2xl font-black font-mono tracking-[0.2em] text-foreground">{data.inviteCode}</span>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className={`shrink-0 px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      codeCopied
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}
                  >
                    {codeCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {codeCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Friends enter this at signup, or use your link below.
                </p>
              </div>
            )}

            {referralLink && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Your referral link</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-background/60 border border-border/40 rounded-xl px-3 py-2 text-xs text-foreground font-mono truncate">
                    {referralLink}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      copied
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background/40 border border-border/30 rounded-xl p-3 text-center">
                <div className="w-7 h-7 bg-blue-400/10 rounded-xl flex items-center justify-center mx-auto mb-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <p className="text-lg font-black text-foreground">{data?.totalReferred ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">Signed Up</p>
              </div>
              <div className="bg-background/40 border border-border/30 rounded-xl p-3 text-center">
                <div className="w-7 h-7 bg-emerald-400/10 rounded-xl flex items-center justify-center mx-auto mb-1.5">
                  <Crown className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <p className="text-lg font-black text-foreground">{data?.totalConverted ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">Went Pro</p>
              </div>
            </div>

            {data && data.referrals.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Your referrals</p>
                <div className="space-y-1.5">
                  {data.referrals.map(r => (
                    <div key={r.id} className="flex items-center justify-between bg-background/30 border border-border/20 rounded-xl px-3 py-2">
                      <span className="text-xs text-foreground font-medium">{r.referredName}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        r.status === 'converted'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-blue-500/15 text-blue-400'
                      }`}>
                        {r.status === 'converted' ? 'Pro' : 'Free'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function Profile() {
  const { username, authUser, isPremium, subscription, authLogout, login, logout } = useUser();
  const { player } = useChessPlayer(username ?? undefined);
  const { data: summary } = useMyAnalysisSummary();
  const { data: liveRatings } = useLiveRatings();
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
        await apiFetch('/api/auth/update-profile', {
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

  const G = '#81b64c';
  const CARD = '#302e2b';
  const TEXT = '#e8e6e3';
  const MUTED = '#9e9b98';
  const BORDER = 'rgba(255,255,255,0.05)';
  const CARD_SHADOW = '0 25px 80px rgba(0,0,0,0.5), 0 0 60px rgba(129,182,76,0.06)';

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 p-4 md:p-0">

      <motion.div
        variants={item}
        className="relative overflow-hidden rounded-xl p-5 md:p-7"
        style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW }}
      >
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${G}22 0%, transparent 70%)` }}
        />
        <div className="relative flex items-center gap-4">
          <div className="shrink-0">
            {player?.avatar
              ? <img src={player.avatar} alt={username ?? ''} className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-cover" style={{ border: `2px solid ${G}`, boxShadow: `0 6px 18px -4px rgba(0,0,0,0.6)` }} />
              : <PieceTile piece="♚" size={72} />
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {player?.title && (
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b33' }}>{player.title}</span>
              )}
              {authUser?.isAdmin && (
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b33' }}>
                  <Shield className="w-3 h-3" /> Admin
                </span>
              )}
              {isPremium && !authUser?.isAdmin && (
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ background: `${G}22`, color: G, border: `1px solid ${G}33` }}>
                  <Crown className="w-3 h-3" /> Pro
                </span>
              )}
            </div>
            {editingUsername ? (
              <div className="flex items-center gap-2">
                <input
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="rounded-xl px-2.5 py-1.5 text-sm font-bold w-full max-w-[220px] outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.08)`, color: TEXT }}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
                  onFocus={e => (e.currentTarget.style.borderColor = G)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
                />
                <button onClick={handleSaveUsername} disabled={saving} className="p-1.5 rounded transition-colors" style={{ color: G }} onMouseEnter={e => (e.currentTarget.style.background = `${G}1a`)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => { setEditingUsername(false); setNewUsername(username ?? ''); }} className="p-1.5 rounded transition-colors" style={{ color: MUTED }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black tracking-tight truncate" style={{ color: TEXT }}>{player?.name || username}</h1>
                <button onClick={() => setEditingUsername(true)} className="p-1 rounded transition-colors" style={{ color: MUTED }} onMouseEnter={e => { e.currentTarget.style.color = G; e.currentTarget.style.background = `${G}1a`; }} onMouseLeave={e => { e.currentTarget.style.color = MUTED; e.currentTarget.style.background = 'transparent'; }}>
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {username && <p className="text-sm" style={{ color: MUTED }}>@{username}</p>}
            {authUser?.email && (
              <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: MUTED, opacity: 0.8 }}>
                <Mail className="w-3 h-3" /> {authUser.email}
              </p>
            )}
            {player?.rating && (
              <p className="text-sm font-black mt-1.5" style={{ color: G }}>{player.rating} ELO</p>
            )}
          </div>
        </div>
      </motion.div>

      {authUser?.isAdmin && <AdminTicker />}

      {authUser?.isAdmin && (
        <motion.div variants={item} className="rounded-xl p-4 md:p-5"
          style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 12px 30px rgba(0,0,0,0.35)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4" style={{ color: G }} />
              <h3 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: TEXT }}>ChessScout.net Live ELO</h3>
            </div>
            <Link href="/live"><a className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: G }}>Play Live →</a></Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'blitz_5_0', label: '5 min' },
              { id: 'blitz_5_3', label: '5 | 3' },
              { id: 'rapid_10_0', label: '10 min' },
            ].map(tc => {
              const r = liveRatings?.ratings[tc.id];
              return (
                <div key={tc.id} className="text-center p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: MUTED }}>{tc.label}</div>
                  <div className="text-2xl font-black mt-1" style={{ color: TEXT }}>
                    {r && r.gamesPlayed > 0 ? `${r.rating}${r.isProvisional ? '?' : ''}` : '—'}
                  </div>
                  <div className="text-[10px]" style={{ color: MUTED }}>{r?.gamesPlayed ?? 0} {(r?.gamesPlayed ?? 0) === 1 ? 'game' : 'games'}</div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Games', value: totalGames, icon: Swords, accent: '#3b82f6' },
          { label: 'Win Rate', value: winRate ? `${winRate}%` : '—', icon: Trophy, accent: '#10b981' },
          { label: 'Rating', value: player?.rating ?? '—', icon: Target, accent: G },
          { label: 'Courses', value: `${completedCourses}/${(completedCourses + activeCourses) || 0}`, icon: GraduationCap, accent: '#f59e0b' },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-xl p-4 text-center"
            style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 12px 30px rgba(0,0,0,0.35)' }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2" style={{ background: `${stat.accent}1a`, border: `1px solid ${stat.accent}33` }}>
              <stat.icon className="w-4 h-4" style={{ color: stat.accent }} />
            </div>
            <p className="text-lg font-black tracking-tight" style={{ color: TEXT }}>{stat.value}</p>
            <p className="text-[10px] font-black uppercase tracking-widest mt-0.5" style={{ color: MUTED }}>{stat.label}</p>
          </div>
        ))}
      </motion.div>

      {authUser && <ReferralCard isPremium={isPremium} />}

      <motion.div variants={item} className="rounded-xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 18px 50px rgba(0,0,0,0.4)' }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <h2 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: G }}>
            <Settings className="w-3.5 h-3.5" /> Account
          </h2>
        </div>

        {[
          { href: '/subscription', icon: Crown, accent: G, title: 'Subscription', sub: isPremium ? 'Pro — Active' : 'Free Plan' },
          { href: '/analysis', icon: Target, accent: '#3b82f6', title: 'Analysis', sub: 'View your game analysis' },
          { href: '/courses', icon: GraduationCap, accent: '#f59e0b', title: 'Courses', sub: `${activeCourses} active, ${completedCourses} completed` },
        ].map((row, i, arr) => (
          <Link
            key={row.href}
            href={row.href}
            className="flex items-center justify-between px-4 py-3.5 transition-colors"
            style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : `1px solid ${BORDER}` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${row.accent}1a`, border: `1px solid ${row.accent}33` }}>
                <row.icon className="w-4 h-4" style={{ color: row.accent }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: TEXT }}>{row.title}</p>
                <p className="text-xs" style={{ color: MUTED }}>{row.sub}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />
          </Link>
        ))}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left"
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,67,67,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(220,67,67,0.35)', border: '1px solid rgba(220,67,67,0.6)' }}>
            <LogOut className="w-4 h-4" style={{ color: '#dc4343' }} />
          </div>
          <p className="text-sm font-bold" style={{ color: '#dc4343' }}>Sign Out</p>
        </button>
      </motion.div>

    </motion.div>
  );
}
