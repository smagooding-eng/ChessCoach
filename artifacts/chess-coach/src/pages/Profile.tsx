import React, { useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMyAnalysisSummary } from '@/hooks/use-analysis';
import { useMyGames } from '@/hooks/use-games';
import { useMyCourses } from '@/hooks/use-courses';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  User, Mail, Crown, LogOut, ChevronRight, Trophy, Swords, Target,
  GraduationCap, Settings, Shield, Edit3, Check, X
} from 'lucide-react';

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
              {isPremium && (
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
                {isPremium
                  ? `Pro — ${subscription.status === 'trialing' ? 'Free Trial' : 'Active'}`
                  : 'Free Plan'}
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
