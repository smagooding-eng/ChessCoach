import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { useMyCourses } from '@/hooks/use-courses';
import { useUser } from '@/hooks/use-user';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { BookOpen, GraduationCap, CheckCircle2, PlayCircle, AlertCircle, Filter, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PremiumGate } from '@/components/PremiumGate';
import { trackBackgroundJob } from '@/components/BackgroundJobsWatcher';
import { cn } from '@/lib/utils';

export function Courses() {
  const { username, authUser } = useUser();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useMyCourses();

  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [showBeta, setShowBeta] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/courses/quality')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!cancelled && d) {
          const recent = typeof d.passRateRecent === 'number' ? d.passRateRecent : d.passRate;
          const window = typeof d.window === 'number' ? d.window : 0;
          setShowBeta(!(recent >= 0.95 && window >= 30));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback((jobId: string) => {
    trackBackgroundJob('courses', jobId);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsGenerating(true);
    setGenError(null);

    intervalRef.current = setInterval(async () => {
      if (!mountedRef.current) {
        clearInterval(intervalRef.current!);
        return;
      }
      try {
        const pollRes = await apiFetch(`/api/courses/generate-status/${jobId}`, { cache: 'no-store' });
        if (pollRes.status === 304) return;
        if (!pollRes.ok) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setGenError('Generation job expired or failed');
          setIsGenerating(false);
          return;
        }
        const pollBody = await pollRes.json() as { status: string; error?: string };

        if (!mountedRef.current) return;

        if (pollBody.status === 'done') {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setIsGenerating(false);
          queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
          refetch();
        } else if (pollBody.status === 'error') {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setGenError(pollBody.error ?? 'Course generation failed');
          setIsGenerating(false);
        }
      } catch {}
    }, 3000);
  }, [queryClient, refetch]);

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        const res = await apiFetch('/api/courses/active-job', { cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json() as { job: { jobId: string; status: string } | null };
        if (body.job && mountedRef.current) {
          startPolling(body.job.jobId);
        }
      } catch {}
    })();

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startPolling]);

  async function handleGenerate() {
    const genUsername = username ?? authUser?.lichessUsername ?? null;
    if (!genUsername || isGenerating) return;
    setIsGenerating(true);
    setGenError(null);

    let jobId: string;
    try {
      const res = await apiFetch('/api/courses/generate-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: genUsername }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to start generation');
      }
      const body = await res.json() as { jobId: string };
      jobId = body.jobId;
    } catch (err) {
      if (mountedRef.current) {
        setGenError(err instanceof Error ? err.message : 'Failed to start generation');
        setIsGenerating(false);
      }
      return;
    }

    startPolling(jobId);
  }

  const courses = data?.courses || [];

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const categories = useMemo(() => {
    const cats = new Set(courses.map(c => c.category));
    return Array.from(cats).sort();
  }, [courses]);

  const difficulties = useMemo(() => {
    const diffs = new Set(courses.map(c => c.difficulty));
    return Array.from(diffs).sort();
  }, [courses]);

  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      if (filterCategory !== 'all' && c.category !== filterCategory) return false;
      if (filterDifficulty !== 'all' && c.difficulty !== filterDifficulty) return false;
      if (filterStatus === 'completed' && Math.round((c.completedLessons / c.totalLessons) * 100) !== 100) return false;
      if (filterStatus === 'in-progress') {
        const p = Math.round((c.completedLessons / c.totalLessons) * 100);
        if (p === 0 || p === 100) return false;
      }
      if (filterStatus === 'not-started' && c.completedLessons > 0) return false;
      return true;
    });
  }, [courses, filterCategory, filterDifficulty, filterStatus]);

  const hasActiveFilters = filterCategory !== 'all' || filterDifficulty !== 'all' || filterStatus !== 'all';

  const clearFilters = () => {
    setFilterCategory('all');
    setFilterDifficulty('all');
    setFilterStatus('all');
  };

  const archiveCourse = async (courseId: number) => {
    try {
      const res = await apiFetch(`/api/courses/${courseId}/archive`, { method: 'PATCH' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
        refetch();
      }
    } catch { /* course stays visible, user can retry */ }
  };

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <PremiumGate feature="Personalized Courses">
    <div className="space-y-8 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-stretch gap-4">
        <div className="flex-1 min-w-0">
          <PageHero piece="♝" title={showBeta ? "My Courses (Beta)" : "My Courses"} subtitle="Personalized lesson plans based on your deep analysis." />
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                Building Courses…
              </>
            ) : (
              <>
                <GraduationCap className="w-5 h-5" />
                Generate New Courses
              </>
            )}
          </button>
          {isGenerating && (
            <p className="text-xs text-muted-foreground animate-pulse">
              Generating up to 4 personalized courses — this takes 1–2 minutes…
            </p>
          )}
          {genError && (
            <div className="flex items-center gap-1.5 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {genError}
            </div>
          )}
        </div>
      </div>

      {courses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-sm bg-secondary text-foreground border border-border cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select
            value={filterDifficulty}
            onChange={e => setFilterDifficulty(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-sm bg-secondary text-foreground border border-border cursor-pointer"
          >
            <option value="all">All Levels</option>
            {difficulties.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-sm bg-secondary text-foreground border border-border cursor-pointer"
          >
            <option value="all">All Progress</option>
            <option value="not-started">Not Started</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          {hasActiveFilters && (
            <span className="text-xs text-muted-foreground ml-auto">
              {filteredCourses.length} of {courses.length} courses
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCourses.map((course, i) => {
          const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
          const isComplete = progress === 100;

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              key={course.id}
              className="glass-card rounded-xl p-6 flex flex-col h-full group border-white/5 hover:border-primary/30"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-secondary text-secondary-foreground">
                  {course.category}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border
                  ${course.difficulty === 'Beginner' ? 'border-emerald-500/30 text-emerald-400' :
                    course.difficulty === 'Intermediate' ? 'border-amber-500/30 text-amber-400' :
                    'border-red-500/30 text-red-400'}`}>
                  {course.difficulty}
                </span>
              </div>

              <h2 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors">{course.title}</h2>
              <p className="text-sm text-muted-foreground mb-8 flex-1">{course.description}</p>

              <div className="mt-auto space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-medium mb-2">
                    <span className={isComplete ? 'text-emerald-400 flex items-center gap-1' : 'text-muted-foreground'}>
                      {isComplete && <CheckCircle2 className="w-3 h-3" />}
                      {course.completedLessons} / {course.totalLessons} Lessons
                    </span>
                    <span className="text-primary">{progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${isComplete ? 'bg-emerald-500' : 'bg-primary'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link href={`/courses/${course.id}`} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all
                    ${isComplete ? 'bg-secondary text-foreground hover:bg-secondary/80' : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'}`}>
                    {isComplete ? 'Review Course' : <><PlayCircle className="w-5 h-5" /> Continue Learning</>}
                  </Link>
                  <button
                    onClick={() => archiveCourse(course.id)}
                    title="Clear this course"
                    className="px-3 rounded-xl border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {filteredCourses.length === 0 && courses.length > 0 && !isGenerating && (
          <div className="col-span-full text-center py-16 border-2 border-dashed border-border rounded-xl">
            <Filter className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-bold mb-2">No Matching Courses</h3>
            <p className="text-muted-foreground mb-4">Try adjusting your filters to find courses.</p>
            <button
              onClick={clearFilters}
              className="px-5 py-2.5 rounded-xl bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-all"
            >
              Clear Filters
            </button>
          </div>
        )}

        {courses.length === 0 && !isGenerating && (
          <div className="col-span-full text-center py-20 border-2 border-dashed border-border rounded-xl">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-bold mb-2">No Courses Yet</h3>
            <p className="text-muted-foreground mb-6">Run a deep analysis and generate courses tailored to your weak spots.</p>
            <button
              onClick={handleGenerate}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 transition-all"
            >
              Generate Now
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="col-span-full text-center py-20 border-2 border-dashed border-primary/20 rounded-xl">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Generating Your Courses…</h3>
            <p className="text-muted-foreground">Analysing your weaknesses and building personalised lessons.</p>
            <p className="text-xs text-muted-foreground mt-2 opacity-60">This usually takes 1–2 minutes</p>
          </div>
        )}
      </div>
    </div>
    </PremiumGate>
  );
}
