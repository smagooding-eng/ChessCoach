import React from 'react';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyCourses } from '@/hooks/use-courses';
import { useMyGames } from '@/hooks/use-games';
import { Link } from 'wouter';
import { ArrowRight, Swords, Trophy, Target, AlertTriangle, BookOpen, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

export function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useMyAnalysisSummary();
  const { data: weaknesses, isLoading: loadingWeaknesses } = useMyWeaknesses();
  const { data: coursesData } = useMyCourses();
  const { data: gamesData } = useMyGames(5);

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your chess performance and improvement plan.</p>
        </div>
        <Link href="/import" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary/10 text-primary font-semibold hover:bg-primary hover:text-primary-foreground transition-colors border border-primary/20">
          <ImportIcon /> Import New Games
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Games" 
          value={summary?.totalGames || 0} 
          icon={<Swords className="w-5 h-5 text-blue-400" />} 
          color="bg-blue-500/10 border-blue-500/20"
        />
        <StatCard 
          title="Win Rate" 
          value={`${((summary?.winRate || 0) * 100).toFixed(1)}%`} 
          icon={<Trophy className="w-5 h-5 text-emerald-400" />} 
          color="bg-emerald-500/10 border-emerald-500/20"
        />
        <StatCard 
          title="Avg Rating" 
          value={Math.round(summary?.avgRating || 0)} 
          icon={<Target className="w-5 h-5 text-primary" />} 
          color="bg-primary/10 border-primary/20"
        />
        <StatCard 
          title="Active Courses" 
          value={coursesData?.courses?.filter(c => c.completedLessons < c.totalLessons).length || 0} 
          icon={<BookOpen className="w-5 h-5 text-purple-400" />} 
          color="bg-purple-500/10 border-purple-500/20"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Weaknesses & Recent Games */}
        <div className="lg:col-span-2 space-y-8">
          {/* Top Weaknesses */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Critical Weaknesses
              </h2>
              <Link href="/analysis" className="text-sm text-primary hover:underline flex items-center gap-1">
                Full Analysis <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            {weaknesses?.weaknesses?.length ? (
              <div className="space-y-4">
                {weaknesses.weaknesses.slice(0, 3).map((w) => (
                  <div key={w.id} className="p-4 rounded-xl bg-secondary/50 border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{w.category}</h3>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-destructive/20 text-destructive-foreground border border-destructive/30">
                        {w.severity}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{w.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <p>No weaknesses identified yet.</p>
                <Link href="/analysis" className="text-primary hover:underline mt-2 inline-block">Run Analysis</Link>
              </div>
            )}
          </div>

          {/* Recent Games */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" /> Recent Games
              </h2>
              <Link href="/games" className="text-sm text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="space-y-3">
              {gamesData?.games?.slice(0, 4).map(game => (
                <Link key={game.id} href={`/games/${game.id}`} className="block">
                  <div className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/80 border border-transparent hover:border-border transition-all flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-10 rounded-full ${
                        game.result === 'win' ? 'bg-emerald-500' : 
                        game.result === 'loss' ? 'bg-destructive' : 'bg-slate-500'
                      }`} />
                      <div>
                        <div className="font-medium text-sm flex gap-2">
                          <span className="text-white">{game.whiteUsername}</span> vs <span>{game.blackUsername}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(game.playedAt).toLocaleDateString()} • {game.opening || 'Unknown Opening'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold uppercase tracking-wider">{game.result}</div>
                    </div>
                  </div>
                </Link>
              ))}
              {!gamesData?.games?.length && (
                <p className="text-muted-foreground text-center py-4">No recent games. Import some!</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Active Courses */}
        <div className="space-y-8">
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-purple-400" /> Recommended Courses
              </h2>
            </div>
            
            {coursesData?.courses?.length ? (
              <div className="space-y-4">
                {coursesData.courses.slice(0, 3).map(course => {
                  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
                  return (
                    <Link key={course.id} href={`/courses/${course.id}`} className="block">
                      <div className="p-4 rounded-xl bg-secondary/50 hover:bg-secondary border border-white/5 hover:border-primary/30 transition-all group">
                        <h3 className="font-bold text-sm mb-1 group-hover:text-primary transition-colors line-clamp-1">{course.title}</h3>
                        <div className="text-xs text-muted-foreground mb-3">{course.category}</div>
                        <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="text-right text-xs mt-1 text-muted-foreground">{progress}%</div>
                      </div>
                    </Link>
                  );
                })}
                <Link href="/courses" className="block text-center text-sm text-primary hover:underline mt-4">
                  View All Courses
                </Link>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <p>No courses generated yet.</p>
                <Link href="/courses" className="text-primary hover:underline mt-2 inline-block">Generate Courses</Link>
              </div>
            )}
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
