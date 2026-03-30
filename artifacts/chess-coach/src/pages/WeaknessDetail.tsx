import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'wouter';
import { useUser } from '@/hooks/use-user';
import {
  ArrowLeft, AlertTriangle, BookOpen, Swords, Trophy, Minus,
  ChevronRight, TrendingDown, Lightbulb, GraduationCap, Play
} from 'lucide-react';
import { motion } from 'framer-motion';

type Weakness = {
  id: number;
  username: string;
  category: string;
  severity: string;
  description: string;
  frequency: number;
  examples: string[];
  createdAt: string;
};

type RelatedGame = {
  id: number;
  whiteUsername: string;
  blackUsername: string;
  result: string;
  opening: string | null;
  timeControl: string;
  playedAt: string | null;
  whiteRating: number;
  blackRating: number;
};

type RelatedCourse = {
  id: number;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  totalLessons: number;
  completedLessons: number;
};

type WeaknessDetailData = {
  weakness: Weakness;
  relatedGames: RelatedGame[];
  relatedCourses: RelatedCourse[];
};

const SEV_CFG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  Critical: { color: 'text-rose-400',   bg: 'bg-rose-500/15',   border: 'border-rose-500/40',   label: 'Critical' },
  High:     { color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/40',  label: 'High'     },
  Medium:   { color: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/40',   label: 'Medium'   },
  Low:      { color: 'text-slate-400',  bg: 'bg-slate-500/15',  border: 'border-slate-500/40',  label: 'Low'      },
};

function ResultIcon({ result, isWhite }: { result: string; isWhite: boolean }) {
  const win  = (result === 'win'  && isWhite) || (result === 'loss' && !isWhite);
  const loss = (result === 'loss' && isWhite) || (result === 'win'  && !isWhite);
  if (win)  return <span className="flex items-center gap-1 text-emerald-400 font-bold text-xs"><Trophy className="w-3.5 h-3.5" />Win</span>;
  if (loss) return <span className="flex items-center gap-1 text-rose-400 font-bold text-xs"><TrendingDown className="w-3.5 h-3.5" />Loss</span>;
  return <span className="flex items-center gap-1 text-slate-400 font-bold text-xs"><Minus className="w-3.5 h-3.5" />Draw</span>;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  const m = Math.floor(d / 30);
  return `${m} month${m > 1 ? 's' : ''} ago`;
}

export function WeaknessDetail() {
  const { id } = useParams();
  const { username } = useUser();
  const [data, setData] = useState<WeaknessDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetch(`/api/analysis/weaknesses/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(() => setError('Could not load weakness details.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-24 text-muted-foreground">{error ?? 'Not found.'}</div>
  );

  const { weakness, relatedGames, relatedCourses } = data;
  const sev = SEV_CFG[weakness.severity] ?? SEV_CFG.Medium;
  const isWhite = (g: RelatedGame) => g.whiteUsername.toLowerCase() === username?.toLowerCase();

  const diffColor = (d: string) =>
    d === 'Beginner' ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' :
    d === 'Intermediate' ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' :
    'text-rose-400 bg-rose-500/15 border-rose-500/30';

  return (
    <div className="space-y-8 pb-16 max-w-4xl mx-auto">
      {/* Back */}
      <Link href="/analysis" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Analysis
      </Link>

      {/* Hero card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-3xl p-8 relative overflow-hidden"
        style={{ borderLeft: `4px solid` }}
      >
        <div className={`absolute inset-0 opacity-5 pointer-events-none ${sev.bg}`} />
        <div className={`absolute top-0 left-0 w-1.5 h-full rounded-l-3xl ${sev.bg.replace('/15', '/60')}`} />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${sev.bg} ${sev.border} border`}>
                <AlertTriangle className={`w-5 h-5 ${sev.color}`} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-display font-bold leading-tight">{weakness.category}</h1>
                <span className={`text-xs font-bold uppercase tracking-widest ${sev.color}`}>{sev.label} Priority</span>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-2xl ${sev.bg} ${sev.border} border text-center`}>
              <div className={`text-3xl font-display font-black ${sev.color}`}>{Math.round(weakness.frequency * 100)}%</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-0.5">Impact</div>
            </div>
          </div>

          <p className="text-foreground/80 leading-relaxed text-base mb-6">{weakness.description}</p>

          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${weakness.frequency * 100}%` }}
              transition={{ delay: 0.3, duration: 0.7, ease: 'easeOut' }}
              className={`h-full rounded-full ${sev.bg.replace('bg-', 'bg-').replace('/15', '/80')}`}
            />
          </div>
        </div>
      </motion.div>

      {/* Examples from AI */}
      {weakness.examples?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-2xl p-6"
        >
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            AI-Identified Patterns
          </h2>
          <div className="space-y-3">
            {weakness.examples.map((ex, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-white/3 border border-white/5 px-4 py-3">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-foreground/80 leading-relaxed">{ex}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Courses to fix this */}
      {relatedCourses.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card rounded-2xl p-6"
        >
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            Courses for This Weakness
          </h2>
          <div className="space-y-3">
            {relatedCourses.map(course => {
              const pct = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
              return (
                <Link key={course.id} href={`/courses/${course.id}`}>
                  <div className="flex items-center gap-4 rounded-xl bg-white/3 border border-white/5 px-4 py-4 hover:bg-white/6 hover:border-primary/30 transition-all group cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate group-hover:text-primary transition-colors">{course.title}</div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${diffColor(course.difficulty)}`}>
                          {course.difficulty}
                        </span>
                        <span className="text-xs text-muted-foreground">{course.totalLessons} lessons</span>
                        {pct > 0 && <span className="text-xs text-primary font-bold">{pct}% done</span>}
                      </div>
                      <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                        <Play className="w-3 h-3" />
                        {pct === 0 ? 'Start' : pct === 100 ? 'Review' : 'Continue'}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card rounded-2xl p-6"
        >
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            Courses for This Weakness
          </h2>
          <div className="flex items-center gap-4 rounded-xl border-2 border-dashed border-white/10 p-6 text-center flex-col">
            <p className="text-muted-foreground text-sm">No courses generated for this weakness yet.</p>
            <Link href="/courses">
              <span className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
                <BookOpen className="w-4 h-4" /> Generate courses on the Courses page
              </span>
            </Link>
          </div>
        </motion.div>
      )}

      {/* Related games */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl p-6"
      >
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Swords className="w-5 h-5 text-muted-foreground" />
          Recent Games — Practice & Review
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Step through these games move by move to spot where this weakness shows up in your play.
        </p>
        {relatedGames.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">No games imported yet.</p>
        ) : (
          <div className="space-y-2">
            {relatedGames.map((game, i) => {
              const white = isWhite(game);
              const opponent = white ? game.blackUsername : game.whiteUsername;
              const myRating = white ? game.whiteRating : game.blackRating;
              const oppRating = white ? game.blackRating : game.whiteRating;
              return (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                >
                  <Link href={`/games/${game.id}`}>
                    <div className="flex items-center gap-4 rounded-xl bg-white/3 border border-white/5 px-4 py-3.5 hover:bg-white/6 hover:border-primary/25 transition-all group cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                          vs {opponent}
                          <span className="text-muted-foreground font-normal ml-2 text-xs">({oppRating})</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span>{game.opening ?? 'Unknown opening'}</span>
                          <span>·</span>
                          <span>{game.timeControl}</span>
                          {game.playedAt && <><span>·</span><span>{timeAgo(game.playedAt)}</span></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <ResultIcon result={game.result} isWhite={white} />
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
