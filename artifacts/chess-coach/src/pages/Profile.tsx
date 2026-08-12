import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PieceTile } from '@/components/DesignSystem';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMyAnalysisSummary } from '@/hooks/use-analysis';
import { useLiveRatings } from '@/hooks/use-live-ratings';
import { useMyCourses } from '@/hooks/use-courses';
import { Link, useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import GrowthEngine from '@/components/GrowthEngine';
import {
  User, Mail, Crown, LogOut, ChevronRight, Trophy, Swords, Target,
  GraduationCap, Settings, Shield, Edit3, Check, X, Eye, Users, CreditCard,
  Activity, Send, AlertCircle, CheckCircle2, Bold, Italic, Heading1, Heading2,
  Link as LinkIcon, Image, Type, Palette, List, ListOrdered, Minus, Undo2, Redo2, FileText, Sparkles,
  Trash2, Loader2, Zap, Gift, Copy, UserPlus, Megaphone, ChevronDown
} from 'lucide-react';


interface ReferralData {
  inviteCode: string | null;
  isPaid: boolean;
  totalReferred: number;
  totalConverted: number;
  referrals: { id: string; status: string; createdAt: string; convertedAt: string | null; referredName: string }[];
}

function ReferralCard({ isPremium }: { isPremium: boolean }) {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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
              Become a Pro subscriber to get your personal referral link and invite friends to ChessScout.
            </p>
            <Link href="/subscription" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
              Upgrade to Pro <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
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
  const { data: coursesData } = useMyCourses();
  const [, setLocation] = useLocation();

  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(username ?? '');
  const [saving, setSaving] = useState(false);

  const totalGames = summary?.totalGames ?? 0;
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

      {authUser?.isAdmin && (
        <Link href="/admin"
          className="flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <span className="flex items-center gap-2 text-sm font-bold" style={{ color: TEXT }}>
            <Shield className="w-4 h-4" style={{ color: G }} />
            Admin Dashboard
          </span>
          <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />
        </Link>
      )}

      {authUser?.isAdmin && (
        <motion.div variants={item} className="rounded-xl p-4 md:p-5"
          style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 12px 30px rgba(0,0,0,0.35)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4" style={{ color: G }} />
              <h3 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: TEXT }}>ChessScout Live ELO</h3>
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
          { href: '/subscription', icon: Crown, accent: G, title: 'Subscription', sub: subscription.status === 'free_trial'
              ? `Free Trial — ${subscription.trialDaysLeft} day${subscription.trialDaysLeft === 1 ? '' : 's'} left`
              : isPremium
                ? `Pro — ${subscription.status === 'trialing' ? 'Stripe Trial' : 'Active'}`
                : 'Free Plan — Trial ended' },
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
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(220,67,67,0.12)', border: '1px solid rgba(220,67,67,0.25)' }}>
            <LogOut className="w-4 h-4" style={{ color: '#dc4343' }} />
          </div>
          <p className="text-sm font-bold" style={{ color: '#dc4343' }}>Sign Out</p>
        </button>
      </motion.div>

    </motion.div>
  );
}
