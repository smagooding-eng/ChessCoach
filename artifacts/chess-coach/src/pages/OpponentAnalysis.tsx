import React, { useState, useRef, useEffect } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { UpgradeNudge } from '@/components/UpgradeNudge';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Search, Target, AlertTriangle, TrendingUp, ChevronDown, ChevronUp, ChevronRight, Loader2, User, Users, Zap, Clock, Star, BookOpen, CheckCircle2, GraduationCap, History, RefreshCw, Send } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { WaitTipCarousel } from '@/components/WaitTipCarousel';
import { trackBackgroundJob } from '@/components/BackgroundJobsWatcher';
import { encodeReport } from '@/pages/ScoutShare';
import { useEloProgress } from '@/hooks/use-elo-progress';

interface Profile {
  username: string;
  name?: string;
  title?: string;
  avatar?: string;
  country?: string;
  followers?: number;
  joined?: number;
  lastOnline?: number;
  url?: string;
  ratings?: { bullet?: number; blitz?: number; rapid?: number };
}

interface HeadToHead {
  wins: number;
  losses: number;
  draws: number;
  total: number;
}

interface OpponentResult {
  username: string;
  profile?: Profile | null;
  gamesAnalyzed: number;
  wins: number;
  losses: number;
  draws: number;
  headToHead?: HeadToHead | null;
  weaknesses: Array<{
    category: string;
    severity: string;
    description: string;
    frequency: number;
    examples: string[];
  }>;
  topOpenings: Array<{
    opening: string;
    games: number;
    winRate: number;
  }>;
}

const SEV_STYLES: Record<string, string> = {
  Critical: 'bg-red-500 text-white',
  High:     'bg-orange-500 text-white',
  Medium:   'bg-amber-500 text-white',
  Low:      'bg-emerald-500 text-white',
};

const TITLE_COLORS: Record<string, string> = {
  GM: 'bg-yellow-500 text-black',
  IM: 'bg-orange-500 text-white',
  FM: 'bg-blue-500 text-white',
  CM: 'bg-green-500 text-white',
  NM: 'bg-purple-500 text-white',
  WGM: 'bg-yellow-500 text-black',
  WIM: 'bg-orange-500 text-white',
};

type CourseGenState = 'idle' | 'generating' | 'done' | 'error';

const SCOUTING_PHASES = [
  'Fetching recent games…',
  'Analyzing opening repertoire…',
  'Studying middlegame patterns…',
  'Identifying tactical tendencies…',
  'Detecting weaknesses…',
  'Compiling scouting report…',
];

function ScoutingWaitContent({ opponentRating }: { opponentRating?: number | null }) {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIdx(prev => Math.min(prev + 1, SCOUTING_PHASES.length - 1));
    }, 8000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-secondary/40 p-5 border border-white/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-primary">Scouting in progress…</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={phaseIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
                className="text-xs text-muted-foreground mt-0.5"
              >
                {SCOUTING_PHASES[phaseIdx]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <div className="flex gap-1">
          {SCOUTING_PHASES.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-700 ${
                i <= phaseIdx ? 'bg-primary/50' : 'bg-white/5'
              }`}
            />
          ))}
        </div>
      </div>

      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
      ))}

      <WaitTipCarousel rating={opponentRating} />
    </div>
  );
}

export function OpponentAnalysis() {
  const [, navigate] = useLocation();
  const { username, authUser } = useUser();
  const { data: eloData } = useEloProgress(username ?? undefined);
  const [inputUsername, setInputUsername] = useState('');
  const [topPlayers, setTopPlayers] = useState<{ username: string; rating: number; rank: number }[]>([]);
  const [showTopPlayers, setShowTopPlayers] = useState(false);

  useEffect(() => {
    apiFetch('/api/opponents/top-players')
      .then(r => r.ok ? r.json() : null)
      .then(d => setTopPlayers(d?.players ?? []))
      .catch(() => {});
  }, []);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [result, setResult] = useState<OpponentResult | null>(null);
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [expandedWeakness, setExpandedWeakness] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Course generation state
  const [courseGenState, setCourseGenState] = useState<CourseGenState>('idle');
  const [coursesCreated, setCoursesCreated] = useState(0);
  const [courseGenError, setCourseGenError] = useState<string | null>(null);
  const courseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scout history
  interface ScoutHistoryItem { id: string; targetUsername: string; createdAt: string; }
  const [scoutHistory, setScoutHistory] = useState<ScoutHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const pollScoutJob = (jobId: string) => {
    trackBackgroundJob('opponentScout', jobId);
    return new Promise<OpponentResult>((resolve, reject) => {
      intervalRef.current = setInterval(async () => {
        if (!mountedRef.current) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          reject(new Error('unmounted'));
          return;
        }
        try {
          const pollRes = await apiFetch(`/api/opponents/status/${jobId}`, { cache: 'no-store' });
          if (pollRes.status === 304) return;
          if (!pollRes.ok) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            reject(new Error(`Poll error (${pollRes.status})`));
            return;
          }
          const job = await pollRes.json() as { status: string; result?: OpponentResult; error?: string };
          if (job.status === 'done') {
            if (intervalRef.current) clearInterval(intervalRef.current);
            resolve(job.result!);
          } else if (job.status === 'error') {
            if (intervalRef.current) clearInterval(intervalRef.current);
            reject(new Error(job.error || 'Analysis failed. Please try again.'));
          }
        } catch (err) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          reject(err);
        }
      }, 3000);
    });
  };

  const resumeScoutPolling = async (jobId: string, targetName?: string) => {
    setLoading(true);
    setError(null);
    setIsLimitReached(false);
    if (targetName) setInputUsername(targetName);
    setStatusMsg('Scout in progress… this may take 30–60 seconds');
    try {
      const scoutResult = await pollScoutJob(jobId);
      if (mountedRef.current) {
        setResult(scoutResult);
        setStatusMsg('');
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      if (msg !== 'unmounted') setError(msg);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setStatusMsg('');
      }
    }
  };

  const fetchHistory = () => {
    apiFetch('/api/opponents/history', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { scouts: [] })
      .then((d: { scouts: ScoutHistoryItem[] }) => {
        if (mountedRef.current) setScoutHistory(d.scouts || []);
      })
      .catch(() => {});
  };

  const loadHistoricScout = async (jobId: string) => {
    setLoadingHistory(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/opponents/history/${jobId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load scout');
      const data = await res.json() as { job: { targetUsername: string; result: OpponentResult } };
      setResult(data.job.result as OpponentResult);
      setInputUsername(data.job.targetUsername || '');
      setCourseGenState('idle');
    } catch {
      setError('Failed to load previous scout results.');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    apiFetch('/api/opponents/active-job', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { job: null })
      .then((data: { job?: { id: string; status: string; targetUsername?: string; result?: OpponentResult; error?: string } | null }) => {
        if (!mountedRef.current || !data.job) return;
        if (data.job.status === 'pending') {
          resumeScoutPolling(data.job.id, data.job.targetUsername);
        } else if (data.job.status === 'done' && data.job.result) {
          setResult(data.job.result as OpponentResult);
          if (data.job.targetUsername) setInputUsername(data.job.targetUsername);
        }
      })
      .catch(() => {});

    fetchHistory();

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (courseIntervalRef.current) clearInterval(courseIntervalRef.current);
    };
  }, []);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = inputUsername.trim();
    if (!target || loading) return;

    setLoading(true);
    setError(null);
    setIsLimitReached(false);
    setResult(null);
    setStatusMsg('Starting analysis…');
    setCourseGenState('idle');
    setCourseGenError(null);
    setCoursesCreated(0);

    try {
      const startRes = await apiFetch('/api/opponents/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-chess-username': username ?? '' },
        body: JSON.stringify({ username: target }),
      });
      if (!startRes.ok) {
        const j = await startRes.json().catch(() => ({})) as Record<string, unknown>;
        setIsLimitReached(j.error === 'usage_limit');
        throw new Error((j.error === 'usage_limit' ? (j.message as string) : (j.error as string)) || `Server error (${startRes.status})`);
      }
      const { jobId } = await startRes.json() as { jobId: string };

      if (!mountedRef.current) return;
      setStatusMsg('Fetching games & running deep analysis… this may take 30–60 seconds');

      const scoutResult = await pollScoutJob(jobId);
      if (mountedRef.current) {
        setResult(scoutResult);
        setStatusMsg('');
        fetchHistory();
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setStatusMsg('');
      }
    }
  };

  const handleGenerateCourses = async () => {
    const requestingUser = username ?? authUser?.lichessUsername ?? null;
    if (!result || !requestingUser || courseGenState === 'generating') return;
    setCourseGenState('generating');
    setCourseGenError(null);

    try {
      const startRes = await apiFetch('/api/opponents/generate-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opponentUsername: result.username,
          weaknesses: result.weaknesses,
        }),
      });
      if (!startRes.ok) {
        const errBody = await startRes.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error || 'Failed to start course generation');
      }
      const { jobId } = await startRes.json() as { jobId: string };
      trackBackgroundJob('opponentCourses', jobId);

      await new Promise<void>((resolve, reject) => {
        courseIntervalRef.current = setInterval(async () => {
          if (!mountedRef.current) { resolve(); return; }
          try {
            const pollRes = await apiFetch(`/api/opponents/courses-job/${jobId}`, { cache: 'no-store' });
            if (pollRes.status === 304) return;
            if (!pollRes.ok) { reject(new Error(`Poll error (${pollRes.status})`)); return; }
            const job = await pollRes.json() as { status: string; coursesCreated?: number; error?: string };
            if (job.status === 'done') {
              if (courseIntervalRef.current) clearInterval(courseIntervalRef.current);
              if (mountedRef.current) { setCourseGenState('done'); setCoursesCreated(job.coursesCreated ?? 0); }
              resolve();
            } else if (job.status === 'error') {
              if (courseIntervalRef.current) clearInterval(courseIntervalRef.current);
              reject(new Error(job.error ?? 'Course generation failed'));
            }
          } catch (err) {
            if (courseIntervalRef.current) clearInterval(courseIntervalRef.current);
            reject(err);
          }
        }, 3000);
      });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setCourseGenState('error');
      setCourseGenError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const totalGames = result ? result.wins + result.losses + result.draws : 0;
  const winPct = totalGames > 0 ? Math.round((result!.wins / totalGames) * 100) : 0;

  return (
    <div className="space-y-8 pb-10 px-4 pt-4 md:px-0 md:pt-0">
      {/* Header */}
      <PageHero piece="♞" title="Opponent Scout" subtitle="Enter any chess.com username to analyze their weaknesses before your next game." />

      {/* Search Form */}
      <form onSubmit={handleAnalyze} className="flex gap-3 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={inputUsername}
            onChange={e => setInputUsername(e.target.value)}
            placeholder="chess.com username…"
            className="w-full pl-10 pr-4 py-3 bg-secondary/70 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !inputUsername.trim()}
          className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
          {loading ? 'Scouting…' : 'Scout'}
        </button>
      </form>

      {topPlayers.length > 0 && (
        <div className="max-w-lg -mt-4">
          <button
            type="button"
            onClick={() => setShowTopPlayers(v => !v)}
            className="text-xs font-bold text-primary flex items-center gap-1"
          >
            {showTopPlayers ? 'Hide' : 'Or pick from the'} top 25 live players
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTopPlayers ? 'rotate-180' : ''}`} />
          </button>
          {showTopPlayers && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border/50 bg-secondary/40 divide-y divide-border/30">
              {topPlayers.map((p) => (
                <button
                  key={p.username}
                  type="button"
                  onClick={() => { setInputUsername(p.username); setShowTopPlayers(false); }}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-sm hover:bg-secondary/70 transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-5">#{p.rank}</span>
                    <span className="font-semibold text-foreground">{p.username}</span>
                  </span>
                  <span className="text-xs font-bold text-primary">{p.rating}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scout History */}
      {scoutHistory.length > 0 && !loading && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Previous Scouts</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {scoutHistory.map(s => (
              <button
                key={s.id}
                onClick={() => loadHistoricScout(s.id)}
                disabled={loadingHistory}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/70 border border-border hover:border-primary/40 hover:text-primary transition-colors text-sm disabled:opacity-50"
              >
                <User className="w-3.5 h-3.5" />
                <span className="font-medium">{s.targetUsername}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status message during long-running analysis */}
      {loading && statusMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-primary border border-primary/20 text-primary-foreground flex items-center gap-3"
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="text-sm">{statusMsg}</span>
        </motion.div>
      )}

      {/* Error */}
      {error && isLimitReached && (
        <UpgradeNudge
          headline="You've used your free basic scout"
          subtext="Free plan includes 1 basic opponent scout. Upgrade to Pro for unlimited scouts with full AI weakness analysis."
        />
      )}

      {error && !isLimitReached && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-red-400 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </motion.div>
      )}

      {/* Loading skeleton with engagement */}
      {loading && <ScoutingWaitContent opponentRating={eloData?.currentRating ?? null} />}

      {/* Results */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Profile + stats header */}
            <div className="glass-card rounded-xl p-6">
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Avatar + identity */}
                <div className="flex items-start gap-4">
                  {result.profile?.avatar ? (
                    <img
                      src={result.profile.avatar}
                      alt={result.username}
                      className="w-16 h-16 rounded-full border-2 border-primary/30 object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center border-2 border-border">
                      <User className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {result.profile?.title && (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${TITLE_COLORS[result.profile.title] ?? TITLE_COLORS.NM}`}>
                          {result.profile.title}
                        </span>
                      )}
                      <h2 className="text-2xl font-display font-bold">
                        {result.profile?.name || result.username}
                      </h2>
                    </div>
                    {result.profile?.name && (
                      <p className="text-sm text-muted-foreground mt-0.5">@{result.username}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {result.profile?.ratings?.blitz && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Zap className="w-3 h-3 text-primary" /> {result.profile.ratings.blitz} Blitz
                        </span>
                      )}
                      {result.profile?.ratings?.rapid && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-400" /> {result.profile.ratings.rapid} Rapid
                        </span>
                      )}
                      {result.profile?.ratings?.bullet && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400" /> {result.profile.ratings.bullet} Bullet
                        </span>
                      )}
                      {result.profile?.followers && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" /> {result.profile.followers.toLocaleString()} followers
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Win/loss stats */}
                <div className="sm:ml-auto flex flex-col items-start sm:items-end justify-center gap-3">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground">{result.username}'s record across {result.gamesAnalyzed} recent games</p>
                    <button
                      onClick={() => { setResult(null); handleAnalyze({ preventDefault: () => {} } as React.FormEvent); }}
                      disabled={loading}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-secondary/70 border border-border hover:border-primary/40 hover:text-primary transition-colors text-xs disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" /> Re-scout
                    </button>
                  </div>
                  <div className="flex gap-4">
                    <Stat label="Their Wins"   value={result.wins}   color="text-emerald-400" />
                    <Stat label="Their Losses" value={result.losses} color="text-red-400" />
                    <Stat label="Draws"  value={result.draws}  color="text-muted-foreground" />
                    <Stat label="Their Win %"  value={`${winPct}%`}  color="text-primary" />
                  </div>
                  {/* W/L/D bar */}
                  <div className="flex w-full sm:w-48 h-2 rounded-full overflow-hidden gap-0.5">
                    <div className="bg-emerald-500 rounded-l-full" style={{ width: `${(result.wins / totalGames) * 100}%` }} />
                    <div className="bg-secondary" style={{ width: `${(result.draws / totalGames) * 100}%` }} />
                    <div className="bg-red-500 rounded-r-full" style={{ width: `${(result.losses / totalGames) * 100}%` }} />
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-border/50 flex flex-wrap gap-2">
                <a
                  href={`https://www.chess.com/play/online/new?opponent=${result.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#81b64c] hover:bg-[#6fa03e] text-white font-bold rounded-xl transition-colors text-sm shadow-lg"
                >
                  <Swords className="w-4 h-4" />
                  Challenge {result.username} on Chess.com
                </a>
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/scout/${encodeReport({
                      user: {
                        username: result.username,
                        gamesChecked: result.gamesAnalyzed,
                        weaknesses: result.weaknesses.slice(0, 3).map((w) => ({
                          category: w.category, severity: w.severity, description: w.description, frequency: w.frequency,
                        })),
                      },
                      opponent: null,
                    })}`;
                    const shareData = { title: `A breakdown of ${result.username}'s chess patterns`, url };
                    if (navigator.share) {
                      try { await navigator.share(shareData); return; } catch { /* fall through to clipboard */ }
                    }
                    try {
                      await navigator.clipboard.writeText(url);
                      setChallengeCopied(true);
                      setTimeout(() => setChallengeCopied(false), 2500);
                    } catch { /* nothing more we can do */ }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl transition-transform active:scale-95 text-sm font-black"
                  style={{ background: 'linear-gradient(180deg, #a8d876 0%, #81b64c 55%, #5f8f36 100%)', color: '#fff', boxShadow: '0 3px 0 #4a7028, 0 6px 12px rgba(0,0,0,0.3)' }}
                >
                  <Send className="w-4 h-4" />
                  {challengeCopied ? 'Link copied!' : `Send ${result.username} their own report`}
                </button>
              </div>

              {/* Head-to-head section */}
              {result.headToHead && result.headToHead.total > 0 && (
                <div className="mt-5 pt-5 border-t border-border/50">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Swords className="w-3.5 h-3.5 text-primary" /> Your Head-to-Head Record
                  </p>
                  <div className="flex items-center gap-6">
                    <div className="flex gap-4">
                      <div className="text-center">
                        <div className="text-xl font-bold text-emerald-400">{result.headToHead.wins}</div>
                        <div className="text-xs text-muted-foreground">Your Wins</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-muted-foreground">{result.headToHead.draws}</div>
                        <div className="text-xs text-muted-foreground">Draws</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-red-400">{result.headToHead.losses}</div>
                        <div className="text-xs text-muted-foreground">Your Losses</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {result.headToHead.total} game{result.headToHead.total !== 1 ? 's' : ''} played
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Weaknesses */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Identified Weaknesses
                  <span className="text-xs text-muted-foreground font-normal ml-1">— exploit these</span>
                </h3>
                {result.weaknesses.length === 0 ? (
                  <UpgradeNudge
                    headline="Upgrade to Pro to see weaknesses"
                    subtext={`This basic scout shows ${result.username}'s record and openings. Pro unlocks a full AI-written weakness breakdown, ready to exploit.`}
                  />
                ) : (
                  result.weaknesses.map((w, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="glass-card rounded-xl overflow-hidden cursor-pointer"
                    onClick={() => setExpandedWeakness(expandedWeakness === i ? null : i)}
                  >
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${SEV_STYLES[w.severity] ?? SEV_STYLES.Low}`}>
                            {w.severity}
                          </span>
                          <h4 className="font-bold">{w.category}</h4>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-20 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full"
                                style={{ width: `${Math.round(w.frequency * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{Math.round(w.frequency * 100)}%</span>
                          </div>
                          {expandedWeakness === i
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          }
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{w.description}</p>
                    </div>
                    <AnimatePresence>
                      {expandedWeakness === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-0 border-t border-border/50">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-3">
                              Examples from their games
                            </p>
                            <ul className="space-y-1.5">
                              {w.examples.map((ex, j) => (
                                <li key={j} className="text-sm text-muted-foreground flex gap-2">
                                  <span className="text-primary mt-0.5">•</span>
                                  {ex}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))
                )}
              </div>

              {/* Right column: Top Openings + Scout Tip */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-accent" />
                    Favourite Openings
                  </h3>
                  <div className="space-y-3">
                    {result.topOpenings.map((o, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.07 }}
                        onClick={() => o.opening && navigate(`/openings/${encodeURIComponent(o.opening)}`)}
                        className="glass-card rounded-xl p-4 cursor-pointer hover:bg-white/[0.04] hover:border-primary/30 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{o.opening || 'Unknown'}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs text-muted-foreground">{o.games}g</span>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${o.winRate >= 60 ? 'bg-emerald-500' : o.winRate >= 45 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${o.winRate}%` }}
                            />
                          </div>
                          <span className={`text-xs font-bold ${o.winRate >= 60 ? 'text-emerald-400' : o.winRate >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                            {o.winRate}%
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Scout tip box */}
                <div className="p-4 rounded-xl bg-primary border border-primary/20">
                  <div className="flex gap-2">
                    <Target className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-primary mb-1">Preparation Tip</p>
                      <p className="text-xs text-muted-foreground">
                        Target their highest-severity weaknesses early. Steer towards openings where they score poorly — that's your edge.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Generate Exploit Courses ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card rounded-xl overflow-hidden border border-primary/20"
            >
              <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-sm">Generate Exploit Courses</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      We build {Math.min(result.weaknesses.length, 3)} courses teaching you how to punish{' '}
                      <span className="text-foreground font-bold">{result.username}</span>'s top weaknesses
                    </p>
                  </div>
                </div>

                {courseGenState === 'idle' && (
                  <button
                    onClick={handleGenerateCourses}
                    className="shrink-0 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-sm hover:bg-primary/90 transition-colors flex items-center gap-2"
                  >
                    <BookOpen className="w-4 h-4" />
                    Build Courses
                  </button>
                )}

                {courseGenState === 'generating' && (
                  <div className="shrink-0 flex items-center gap-2 text-primary text-sm font-bold">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating… this takes 2–3 min
                  </div>
                )}

                {courseGenState === 'done' && (
                  <Link href="/courses">
                    <div className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-black text-sm hover:bg-emerald-500/25 transition-colors cursor-pointer">
                      <CheckCircle2 className="w-4 h-4" />
                      {coursesCreated} course{coursesCreated !== 1 ? 's' : ''} ready → View
                    </div>
                  </Link>
                )}

                {courseGenState === 'error' && courseGenError === 'Premium subscription required' && (
                  <div className="shrink-0 w-full sm:w-auto">
                    <UpgradeNudge headline="Upgrade to Pro to generate exploit courses" compact />
                  </div>
                )}

                {courseGenState === 'error' && courseGenError !== 'Premium subscription required' && (
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <p className="text-xs text-red-400">{courseGenError}</p>
                    <button
                      onClick={handleGenerateCourses}
                      className="px-4 py-2 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 font-bold text-xs hover:bg-red-500/25 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {courseGenState === 'generating' && (
                <div className="px-5 pb-4">
                  <div className="h-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Crafting personalised lessons to exploit each weakness…
                  </p>
                </div>
              )}

              {courseGenState === 'done' && (
                <div className="px-5 pb-4 pt-0">
                  <div className="flex flex-wrap gap-2">
                    {result.weaknesses.slice(0, 3).map((w, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-xl bg-primary text-primary-foreground text-xs font-bold">
                        vs {result.username}: Exploit {w.category}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="text-center py-20 text-muted-foreground">
          <Swords className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium opacity-60">Enter a username above to scout an opponent</p>
          <p className="text-sm mt-2 opacity-40">Works with any chess.com account</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
