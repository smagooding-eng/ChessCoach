import React from 'react';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyCourses } from '@/hooks/use-courses';
import { useMyGames } from '@/hooks/use-games';
import { Link } from 'wouter';
import { Swords, Trophy, Target, AlertTriangle, BookOpen, Clock, GraduationCap, TrendingUp, ChevronRight } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { motion } from 'framer-motion';

const RESULT_BADGE: Record<string, string> = {
  win: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  loss: 'bg-red-500/15 text-red-400 border-red-500/30',
  draw: 'bg-secondary text-muted-foreground border-border',
};

const SEV_BADGE: Record<string, string> = {
  Critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  High: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

export function Dashboard() {
  const { username } = useUser();
  const { data: summary, isLoading: loadingSummary } = useMyAnalysisSummary();
  const { data: weaknesses } = useMyWeaknesses();
  const { data: coursesData } = useMyCourses();
  const { data: gamesData } = useMyGames(5);

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const winRate = summary ? ((summary.winRate || 0) * 100).toFixed(1) : '—';
  const activeCourses = coursesData?.courses?.filter(c => c.completedLessons < c.totalLessons).length || 0;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-7">

      {/* Hero header */}
      <motion.div
        variants={{ hidden: { opacity: 0, y: -12 }, show: { opacity: 1, y: 0 } }}
        className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 via-card to-card border border-primary/15 p-6"
      >
        {/* decorative board pattern */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: 'repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex-1">
            <p className="text-muted-foreground text-sm mb-1">Welcome back,</p>
            <h1 className="text-3xl font-display font-bold text-gradient">{username}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {summary?.totalGames
                ? `${summary.totalGames} games analysed · ${winRate}% win rate`
                : 'Import your games to start coaching'}
            </p>

            {/* W/L/D mini bar */}
            {summary?.totalGames ? (
              <div className="mt-3 max-w-xs">
                <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                  <div className="bg-emerald-500 rounded-l-full" style={{ width: `${(summary.wins / summary.totalGames) * 100}%` }} title={`${summary.wins} wins`} />
                  <div className="bg-slate-500" style={{ width: `${(summary.draws / summary.totalGames) * 100}%` }} title={`${summary.draws} draws`} />
                  <div className="bg-red-500 rounded-r-full" style={{ width: `${(summary.losses / summary.totalGames) * 100}%` }} title={`${summary.losses} losses`} />
                </div>
                <div className="flex gap-4 mt-1.5">
                  <span className="text-xs text-emerald-400">{summary.wins}W</span>
                  <span className="text-xs text-muted-foreground">{summary.draws}D</span>
                  <span className="text-xs text-red-400">{summary.losses}L</span>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex gap-3 shrink-0">
            <Link href="/import">
              <button className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2">
                <ImportIcon /> Import Games
              </button>
            </Link>
            <Link href="/opponents">
              <button className="px-5 py-2.5 rounded-xl bg-secondary border border-border text-foreground font-bold text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2">
                <Swords className="w-4 h-4 text-primary" /> Scout
              </button>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Games', value: summary?.totalGames || 0, icon: <Swords className="w-5 h-5" />, accent: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/8' },
          { label: 'Win Rate', value: `${winRate}%`, icon: <Trophy className="w-5 h-5" />, accent: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/8' },
          { label: 'Avg Rating', value: Math.round(summary?.avgRating || 0) || '—', icon: <TrendingUp className="w-5 h-5" />, accent: 'text-primary', border: 'border-primary/20', bg: 'bg-primary/8' },
          { label: 'Active Courses', value: activeCourses, icon: <BookOpen className="w-5 h-5" />, accent: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-500/8' },
        ].map((s) => (
          <motion.div
            key={s.label}
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
            className={`rounded-2xl border ${s.border} ${s.bg} p-5 backdrop-blur-md`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{s.label}</p>
              <span className={s.accent}>{s.icon}</span>
            </div>
            <div className={`text-3xl font-display font-bold ${s.accent}`}>{s.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Weaknesses + Recent Games */}
        <div className="lg:col-span-2 space-y-6">

          {/* Weaknesses */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" /> Key Weaknesses
              </h2>
              <Link href="/analysis" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
                Full Analysis <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {weaknesses?.weaknesses?.length ? (
              <div className="space-y-3">
                {weaknesses.weaknesses.slice(0, 3).map((w) => (
                  <Link key={w.id} href={`/analysis/${w.id}`}>
                    <div className="group flex items-start gap-3 p-3.5 rounded-xl bg-secondary/40 hover:bg-secondary/80 border border-transparent hover:border-border transition-all cursor-pointer">
                      <span className={`mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${SEV_BADGE[w.severity] ?? SEV_BADGE.Low}`}>
                        {w.severity}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm group-hover:text-primary transition-colors">{w.category}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{w.description}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No weaknesses found yet.</p>
                <Link href="/analysis" className="text-primary hover:underline mt-2 inline-block text-sm">Run AI Analysis →</Link>
              </div>
            )}
          </div>

          {/* Recent Games */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" /> Recent Games
              </h2>
              <Link href="/games" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
                All Games <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-2">
              {gamesData?.games?.slice(0, 5).map(game => (
                <Link key={game.id} href={`/games/${game.id}`} className="block">
                  <div className="group flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-all">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border uppercase ${RESULT_BADGE[game.result] ?? RESULT_BADGE.draw}`}>
                      {game.result === 'win' ? 'W' : game.result === 'loss' ? 'L' : 'D'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {game.whiteUsername} vs {game.blackUsername}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {game.opening || 'Unknown Opening'} · {new Date(game.playedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </Link>
              ))}
              {!gamesData?.games?.length && (
                <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  <Swords className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No games imported yet.</p>
                  <Link href="/import" className="text-primary hover:underline mt-2 inline-block text-sm">Import Games →</Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Courses + Quick Actions */}
        <div className="space-y-6">
          {/* Courses */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-purple-400" /> Courses
              </h2>
              <Link href="/courses" className="text-xs text-primary hover:underline font-medium">All</Link>
            </div>
            {coursesData?.courses?.length ? (
              <div className="space-y-3">
                {coursesData.courses.slice(0, 4).map(course => {
                  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
                  const isDone = progress === 100;
                  return (
                    <Link key={course.id} href={`/courses/${course.id}`} className="block">
                      <div className={`group p-3.5 rounded-xl border transition-all ${isDone ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-secondary/40 border-transparent hover:border-border hover:bg-secondary/70'}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-1">{course.title}</p>
                          {isDone && <span className="text-[10px] text-emerald-400 font-bold shrink-0">DONE</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0">{progress}%</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No courses yet.</p>
                <Link href="/courses" className="text-primary hover:underline mt-2 inline-block text-sm">Generate Courses →</Link>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="glass-card rounded-2xl p-5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
            {[
              { href: '/import', label: 'Import New Games', icon: <ImportIcon /> },
              { href: '/analysis', label: 'Run AI Analysis', icon: <Target className="w-4 h-4" /> },
              { href: '/opponents', label: 'Scout an Opponent', icon: <Swords className="w-4 h-4" /> },
            ].map(action => (
              <Link key={action.href} href={action.href} className="block">
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/10 hover:text-primary transition-colors text-sm font-medium text-muted-foreground group">
                  <span className="group-hover:text-primary transition-colors">{action.icon}</span>
                  {action.label}
                  <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 }}} className={`p-5 rounded-2xl border ${color} backdrop-blur-md`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {icon}
      </div>
      <div className="text-3xl font-display font-bold text-foreground">{value}</div>
    </motion.div>
  );
}

const ImportIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;
