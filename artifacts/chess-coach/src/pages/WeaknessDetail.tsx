import React, { useEffect, useState } from 'react';
import { PieceTile } from '@/components/DesignSystem';
import { useParams, Link } from 'wouter';
import { useUser } from '@/hooks/use-user';
import {
  ArrowLeft, AlertTriangle, BookOpen, Swords, Trophy, Minus,
  ChevronRight, TrendingDown, Lightbulb, GraduationCap, Play,
  Target, Zap, Shield, Brain, Eye, Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Chessboard } from 'react-chessboard';
import { apiFetch } from '@/lib/api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';

type Weakness = {
  id: number;
  username: string;
  category: string;
  severity: string;
  description: string;
  frequency: number;
  examples: string[];
  previewFen?: string | null;
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
  midGameFen: string | null;
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

type ExampleWithLinks = {
  text: string;
  gameIds: number[];
};

type WeaknessDetailData = {
  weakness: Weakness;
  examplesWithLinks: ExampleWithLinks[];
  relatedGames: RelatedGame[];
  relatedCourses: RelatedCourse[];
};

const SEV_CFG: Record<string, {
  color: string; bg: string; border: string; label: string;
  ring: string; glow: string; icon: React.ElementType;
}> = {
  Critical: { color: 'text-rose-400',   bg: 'bg-rose-500/15',   border: 'border-rose-500/40',   label: 'Critical', ring: '#f43f5e', glow: 'shadow-rose-500/30',   icon: Zap    },
  High:     { color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/40',  label: 'High',     ring: '#f59e0b', glow: 'shadow-amber-500/30',  icon: AlertTriangle },
  Medium:   { color: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/40',   label: 'Medium',   ring: '#60a5fa', glow: 'shadow-blue-500/30',   icon: Shield },
  Low:      { color: 'text-slate-400',  bg: 'bg-slate-500/15',  border: 'border-slate-500/40',  label: 'Low',      ring: '#94a3b8', glow: 'shadow-slate-500/30',  icon: Eye    },
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Endgame':       Trophy,
  'Opening':       BookOpen,
  'Tactics':       Target,
  'Positional':    Brain,
  'Time Management': Clock,
  'Defense':       Shield,
};

function ImpactRing({ pct, color }: { pct: number; color: string }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
      <motion.circle
        cx="70" cy="70" r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={0}
        transform="rotate(-90 70 70)"
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${dash} ${circ}` }}
        transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
        style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
      />
    </svg>
  );
}

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
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    apiFetch(`/api/analysis/weaknesses/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(() => setError('Could not load weakness details.'))
      .finally(() => setLoading(false));
  }, [id, retryCount]);

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="space-y-8 pb-16 max-w-4xl mx-auto">
      <Link href="/analysis" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Analysis
      </Link>
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-muted-foreground">{error ?? 'Weakness not found.'}</p>
        <button onClick={() => setRetryCount(c => c + 1)} className="btn-outline-primary btn-sm">Try again</button>
      </div>
    </div>
  );

  const { weakness, examplesWithLinks, relatedGames, relatedCourses } = data;
  const sev = SEV_CFG[weakness.severity] ?? SEV_CFG.Medium;
  const pct = Math.round(weakness.frequency * 100);
  const isWhite = (g: RelatedGame) => {
    const u = ((g as any).username || username || '').toLowerCase();
    return g.whiteUsername.toLowerCase() === u;
  };
  const CategoryIcon = CATEGORY_ICONS[weakness.category] ?? AlertTriangle;
  const SevIcon = sev.icon;

  const diffColor = (d: string) =>
    d === 'Beginner' ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' :
    d === 'Intermediate' ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' :
    'text-rose-400 bg-rose-500/15 border-rose-500/30';

  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto px-4 pt-4 md:px-0 md:pt-0">
      {/* Back */}
      <Link href="/analysis" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
        <ArrowLeft className="w-4 h-4" /> Back to Analysis
      </Link>

      {/* ── Hero card ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-xl border ${sev.border} bg-card/80`}
        style={{ boxShadow: `0 0 60px -10px ${sev.ring}33` }}
      >
        {/* Background glow */}
        <div className={`absolute inset-0 opacity-[0.07] pointer-events-none ${sev.bg}`} />
        <div className="absolute top-0 left-0 w-2 h-full rounded-l-3xl" style={{ backgroundColor: sev.ring }} />

        <div className="relative z-10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-8 items-start">

            {/* Left — text info */}
            <div className="flex-1 min-w-0">
              {/* Category header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-xl ${sev.bg} border ${sev.border} shadow-lg`}>
                  <CategoryIcon className={`w-6 h-6 ${sev.color}`} />
                </div>
                <div>
                  <p className={`text-xs font-black uppercase tracking-[0.15em] ${sev.color} flex items-center gap-1.5`}>
                    <SevIcon className="w-3.5 h-3.5" />
                    {sev.label} Priority
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <PieceTile piece="♚" size={48} />
                    <h1 className="text-2xl md:text-3xl font-black leading-tight" style={{ letterSpacing: '-0.02em' }}>
                      {weakness.category}
                    </h1>
                  </div>
                </div>
              </div>

              <p className="text-base text-foreground/80 leading-relaxed mb-6">{weakness.description}</p>

              {/* Quick stats row */}
              <div className="flex flex-wrap gap-3">
                <div className={`px-4 py-2 rounded-xl border ${sev.border} ${sev.bg} flex items-center gap-2`}>
                  <span className={`text-2xl font-black ${sev.color}`}>{pct}%</span>
                  <span className="text-xs text-muted-foreground leading-tight">of games<br/>affected</span>
                </div>
                <div className="px-4 py-2 rounded-xl border border-white/8 bg-white/4 flex items-center gap-2">
                  <span className="text-2xl font-black text-foreground">{relatedGames.length}</span>
                  <span className="text-xs text-muted-foreground leading-tight">example<br/>games</span>
                </div>
                {relatedCourses.length > 0 && (
                  <div className="px-4 py-2 rounded-xl border border-primary/20 bg-primary flex items-center gap-2">
                    <span className="text-2xl font-black text-primary">{relatedCourses.length}</span>
                    <span className="text-xs text-muted-foreground leading-tight">courses<br/>available</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right — impact ring + sample position */}
            <div className="flex flex-col items-center gap-3 shrink-0 mx-auto md:mx-0">
              <div className="relative">
                <ImpactRing pct={pct} color={sev.ring} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-4xl font-black ${sev.color}`}>{pct}%</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Impact</span>
                </div>
              </div>
              {(weakness.previewFen || relatedGames[0]?.midGameFen) && (
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-[180px] h-[180px] rounded-xl overflow-hidden pointer-events-none"
                    style={{ border: `2px solid ${sev.ring}66`, boxShadow: `0 6px 24px -8px ${sev.ring}55` }}
                  >
                    <Chessboard
                      options={{
                        position: weakness.previewFen ?? relatedGames[0]?.midGameFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                        allowDragging: false,
                        boardStyle: { borderRadius: 0 },
                        darkSquareStyle: { backgroundColor: '#b58863' },
                        lightSquareStyle: { backgroundColor: '#f0d9b5' },
                        showNotation: false,
                        animationDurationInMs: 0,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sample position</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Occurrence trend ── */}
      {relatedGames.length > 0 && (() => {
        // Bucket related games by month using playedAt
        const buckets = new Map<string, number>();
        relatedGames.forEach(g => {
          if (!g.playedAt) return;
          const d = new Date(g.playedAt);
          if (isNaN(d.getTime())) return;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        });
        if (buckets.size < 2) return null;
        // Fill last 6 months
        const now = new Date();
        const months: { key: string; label: string; count: number }[] = [];
        for (let i = 5; i >= 0; i--) {
          const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          months.push({
            key,
            label: dt.toLocaleString('en-US', { month: 'short' }),
            count: buckets.get(key) ?? 0,
          });
        }
        return (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-black flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
                  <TrendingDown className={`w-5 h-5 ${sev.color}`} />
                </div>
                Occurrences over time
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Last 6 months</span>
            </div>
            <div className="h-36 -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#9e9b98', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#9e9b98', fontSize: 11 }} axisLine={false} tickLine={false} width={26} />
                  <RechartsTooltip
                    contentStyle={{ background: '#262421', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#e8e6e3', fontSize: 12 }}
                    labelStyle={{ color: '#9e9b98', fontWeight: 700 }}
                    formatter={(value: number) => [`${value} game${value === 1 ? '' : 's'}`, 'Showed up in']}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Bar dataKey="count" fill={sev.ring} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        );
      })()}

      {/* ── Identified Patterns ── */}
      {(examplesWithLinks?.length > 0 || weakness.examples?.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-6"
        >
          <h2 className="text-xl font-black mb-5 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            Identified Patterns
          </h2>
          <div className="space-y-3">
            {(examplesWithLinks ?? weakness.examples.map(text => ({ text, gameIds: [] }))).map((ex, i) => (
              <div key={i} className="rounded-xl bg-secondary/40 border border-white/6 overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <span className="w-7 h-7 rounded-xl bg-amber-500/20 border bg-amber-500 text-white text-sm font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-sm text-foreground/85 leading-relaxed">{ex.text}</p>
                </div>
                {ex.gameIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-4 pb-3 ml-10">
                    {ex.gameIds.map((gameId, gi) => (
                      <Link key={gameId} href={`/games/${gameId}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary border border-primary/25 hover:border-primary text-primary hover:text-primary-foreground text-xs font-bold transition-all">
                        <Play className="w-3 h-3" />
                        View Game {gi + 1}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Courses for this weakness ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass-card rounded-xl p-6"
      >
        <h2 className="text-xl font-black mb-5 flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary border border-primary/30">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          Courses for This Weakness
        </h2>

        {relatedCourses.length > 0 ? (
          <div className="space-y-3">
            {relatedCourses.map(course => {
              const pct2 = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
              return (
                <Link key={course.id} href={`/courses/${course.id}`}>
                  <div className="flex items-center gap-4 rounded-xl border border-white/6 bg-secondary/30 px-4 py-4 hover:border-primary/40 hover:bg-primary transition-all group cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base truncate group-hover:text-primary transition-colors">{course.title}</div>
                      <div className="flex items-center gap-2.5 mt-1.5">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${diffColor(course.difficulty)}`}>
                          {course.difficulty.toUpperCase()}
                        </span>
                        <span className="text-xs text-muted-foreground">{course.totalLessons} lessons</span>
                        {pct2 > 0 && <span className="text-xs text-primary font-bold">{pct2}% complete</span>}
                      </div>
                      <div className="mt-2.5 h-1.5 rounded-full bg-white/6 overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct2}%` }} />
                      </div>
                    </div>
                    <span className="btn-primary btn-sm shrink-0">
                      <Play className="w-3.5 h-3.5" />
                      {pct2 === 0 ? 'Start' : pct2 === 100 ? 'Review' : 'Continue'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-xl border-2 border-dashed border-white/10 p-6 flex-col text-center">
            <GraduationCap className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">No courses generated for this weakness yet.</p>
            <Link href="/courses">
              <span className="btn-outline-primary btn-sm">
                <BookOpen className="w-4 h-4" /> Generate Courses
              </span>
            </Link>
          </div>
        )}
      </motion.div>

      {/* ── Related games ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card rounded-xl p-6"
      >
        <h2 className="text-xl font-black mb-2 flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-secondary border border-white/8">
            <Swords className="w-5 h-5 text-muted-foreground" />
          </div>
          Referenced Games
        </h2>
        <p className="text-xs text-muted-foreground mb-5 ml-11">
          Step through these games to see exactly where this weakness appeared.
        </p>

        {relatedGames.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">No games linked to this weakness yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {relatedGames.map((game, i) => {
              const white = isWhite(game);
              const opponent = white ? game.blackUsername : game.whiteUsername;
              const oppRating = white ? game.blackRating : game.whiteRating;
              return (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.06 }}
                >
                  <Link href={`/games/${game.id}`}>
                    <div className="flex gap-3 rounded-xl bg-secondary/40 border border-white/6 p-3 hover:border-primary/40 hover:bg-primary transition-all group cursor-pointer">
                      {/* Mini board */}
                      <div className="shrink-0 w-[100px] h-[100px] rounded-xl overflow-hidden border-2 border-white/8 group-hover:border-primary/40 transition-colors pointer-events-none">
                        <Chessboard
                          options={{
                            position: game.midGameFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                            allowDragging: false,
                            boardStyle: { borderRadius: 0 },
                            darkSquareStyle: { backgroundColor: '#b58863' },
                            lightSquareStyle: { backgroundColor: '#f0d9b5' },
                            showNotation: false,
                            animationDurationInMs: 0,
                          }}
                        />
                      </div>
                      {/* Game info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <div className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                            vs {opponent}
                            <span className="text-muted-foreground font-normal text-xs ml-1">({oppRating})</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                            {game.opening ?? 'Unknown opening'}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                            <span>{game.timeControl}</span>
                            {game.playedAt && <><span>·</span><span>{timeAgo(game.playedAt)}</span></>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <ResultIcon result={game.result} isWhite={white} />
                          <span className="flex items-center gap-1 text-xs text-primary font-bold group-hover:underline">
                            Review <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
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
