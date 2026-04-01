import React, { useRef, useState, useEffect } from 'react';
import { useMyCourses } from '@/hooks/use-courses';
import { useUser } from '@/hooks/use-user';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { BookOpen, GraduationCap, CheckCircle2, PlayCircle, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PremiumGate } from '@/components/PremiumGate';

export function Courses() {
  const { username } = useUser();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useMyCourses();

  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleGenerate() {
    if (!username || isGenerating) return;
    setIsGenerating(true);
    setGenError(null);

    let jobId: string;
    try {
      const res = await apiFetch('/api/courses/generate-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
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

    intervalRef.current = setInterval(async () => {
      if (!mountedRef.current) {
        clearInterval(intervalRef.current!);
        return;
      }
      try {
        const pollRes = await apiFetch(`/api/courses/generate-status/${jobId}`, { cache: 'no-store' });
        if (pollRes.status === 304 || !pollRes.ok) return;
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
      } catch {
      }
    }, 3000);
  }

  const courses = data?.courses || [];

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <PremiumGate feature="Personalized Courses">
    <div className="space-y-8 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">My Courses</h1>
          <p className="text-muted-foreground">Personalized lesson plans based on your AI analysis.</p>
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
              Generating up to 4 AI courses — this takes 1–2 minutes…
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course, i) => {
          const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
          const isComplete = progress === 100;

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              key={course.id}
              className="glass-card rounded-3xl p-6 flex flex-col h-full group border-white/5 hover:border-primary/30"
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

                <Link href={`/courses/${course.id}`} className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all
                  ${isComplete ? 'bg-secondary text-foreground hover:bg-secondary/80' : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'}`}>
                  {isComplete ? 'Review Course' : <><PlayCircle className="w-5 h-5" /> Continue Learning</>}
                </Link>
              </div>
            </motion.div>
          );
        })}

        {courses.length === 0 && !isGenerating && (
          <div className="col-span-full text-center py-20 border-2 border-dashed border-border rounded-3xl">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-bold mb-2">No Courses Yet</h3>
            <p className="text-muted-foreground mb-6">Run an AI analysis and generate courses tailored to your weak spots.</p>
            <button
              onClick={handleGenerate}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 transition-all"
            >
              Generate Now
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="col-span-full text-center py-20 border-2 border-dashed border-primary/20 rounded-3xl">
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
