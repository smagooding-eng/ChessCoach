import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Search, Target, AlertTriangle, TrendingUp, ChevronDown, ChevronUp, Loader2, User, Users, Zap, Clock, Star, BookOpen, CheckCircle2, GraduationCap } from 'lucide-react';
import { Link } from 'wouter';
import { useUser } from '@/hooks/use-user';

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
  Critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  High:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Medium:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Low:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const TITLE_COLORS: Record<string, string> = {
  GM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  IM: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  FM: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  CM: 'bg-green-500/20 text-green-400 border-green-500/40',
  NM: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  WGM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  WIM: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
};

type CourseGenState = 'idle' | 'generating' | 'done' | 'error';

export function OpponentAnalysis() {
  const { username } = useUser();
  const [inputUsername, setInputUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpponentResult | null>(null);
  const [expandedWeakness, setExpandedWeakness] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Course generation state
  const [courseGenState, setCourseGenState] = useState<CourseGenState>('idle');
  const [coursesCreated, setCoursesCreated] = useState(0);
  const [courseGenError, setCourseGenError] = useState<string | null>(null);
  const courseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
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
    setResult(null);
    setStatusMsg('Starting analysis…');
    setCourseGenState('idle');
    setCourseGenError(null);
    setCoursesCreated(0);

    try {
      const startRes = await fetch('/api/opponents/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-chess-username': username ?? '' },
        body: JSON.stringify({ username: target }),
      });
      if (!startRes.ok) {
        const j = await startRes.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((j.error as string) || `Server error (${startRes.status})`);
      }
      const { jobId } = await startRes.json() as { jobId: string };

      if (!mountedRef.current) return;
      setStatusMsg('Fetching games & running AI analysis… this may take 30–60 seconds');

      await new Promise<void>((resolve, reject) => {
        intervalRef.current = setInterval(async () => {
          if (!mountedRef.current) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            resolve();
            return;
          }
          try {
            const pollRes = await fetch(`/api/opponents/status/${jobId}`, { cache: 'no-store' });
            // 304 means cached "pending" — treat as still in progress
            if (pollRes.status === 304) return;
            if (!pollRes.ok) {
              if (intervalRef.current) clearInterval(intervalRef.current);
              reject(new Error(`Poll error (${pollRes.status})`));
              return;
            }
            const job = await pollRes.json() as { status: string; result?: OpponentResult; error?: string };
            if (job.status === 'done') {
              if (intervalRef.current) clearInterval(intervalRef.current);
              if (mountedRef.current) { setResult(job.result!); setStatusMsg(''); }
              resolve();
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
    if (!result || !username || courseGenState === 'generating') return;
    setCourseGenState('generating');
    setCourseGenError(null);

    try {
      const startRes = await fetch('/api/opponents/generate-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opponentUsername: result.username,
          weaknesses: result.weaknesses,
          requestingUser: username,
        }),
      });
      if (!startRes.ok) throw new Error('Failed to start course generation');
      const { jobId } = await startRes.json() as { jobId: string };

      await new Promise<void>((resolve, reject) => {
        courseIntervalRef.current = setInterval(async () => {
          if (!mountedRef.current) { resolve(); return; }
          try {
            const pollRes = await fetch(`/api/opponents/courses-job/${jobId}`, { cache: 'no-store' });
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
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Swords className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-display font-bold">Opponent Scout</h1>
        </div>
        <p className="text-muted-foreground ml-10">
          Enter any chess.com username to analyze their weaknesses before your next game.
        </p>
      </div>

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

      {/* Status message during long-running analysis */}
      {loading && statusMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-primary/8 border border-primary/20 text-primary flex items-center gap-3"
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="text-sm">{statusMsg}</span>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-red-400 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </motion.div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-secondary/40 animate-pulse" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
          ))}
          <p className="text-center text-muted-foreground text-sm animate-pulse">
            Fetching games and running AI analysis…
          </p>
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Profile + stats header */}
            <div className="glass-card rounded-2xl p-6">
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
                  <p className="text-xs text-muted-foreground">Based on {result.gamesAnalyzed} recent games</p>
                  <div className="flex gap-4">
                    <Stat label="Wins"   value={result.wins}   color="text-emerald-400" />
                    <Stat label="Losses" value={result.losses} color="text-red-400" />
                    <Stat label="Draws"  value={result.draws}  color="text-muted-foreground" />
                    <Stat label="Win %"  value={`${winPct}%`}  color="text-primary" />
                  </div>
                  {/* W/L/D bar */}
                  <div className="flex w-full sm:w-48 h-2 rounded-full overflow-hidden gap-0.5">
                    <div className="bg-emerald-500 rounded-l-full" style={{ width: `${(result.wins / totalGames) * 100}%` }} />
                    <div className="bg-secondary" style={{ width: `${(result.draws / totalGames) * 100}%` }} />
                    <div className="bg-red-500 rounded-r-full" style={{ width: `${(result.losses / totalGames) * 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Head-to-head section */}
              {result.headToHead && result.headToHead.total > 0 && (
                <div className="mt-5 pt-5 border-t border-border/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
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
                {result.weaknesses.map((w, i) => (
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
                          <h4 className="font-semibold">{w.category}</h4>
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
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-3">
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
                ))}
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
                        className="glass-card rounded-xl p-4"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-sm font-medium leading-snug line-clamp-2">{o.opening || 'Unknown'}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{o.games}g</span>
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
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
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
              className="glass-card rounded-2xl overflow-hidden border border-primary/20"
            >
              <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-sm">Generate Exploit Courses</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      AI builds {Math.min(result.weaknesses.length, 3)} courses teaching you how to punish{' '}
                      <span className="text-foreground font-semibold">{result.username}</span>'s top weaknesses
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
                  <div className="shrink-0 flex items-center gap-2 text-primary text-sm font-semibold">
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

                {courseGenState === 'error' && (
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
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
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
