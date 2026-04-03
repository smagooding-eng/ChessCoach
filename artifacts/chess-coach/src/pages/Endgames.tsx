import React, { useRef, useState, useEffect } from 'react';
import { useMyCourses } from '@/hooks/use-courses';
import { useUser } from '@/hooks/use-user';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown, Shield, Swords, CheckCircle2, PlayCircle, AlertCircle,
  BookOpen, Target, Sparkles, ChevronRight,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PremiumGate } from '@/components/PremiumGate';
import { cn } from '@/lib/utils';

type EndgameTab = 'checkmate' | 'essential' | 'personal';

const TABS: { id: EndgameTab; label: string; icon: React.ElementType; desc: string; apiType: string }[] = [
  {
    id: 'checkmate',
    label: 'Checkmate Patterns',
    icon: Crown,
    desc: 'Master back rank mates, smothered mates, and other deadly patterns.',
    apiType: 'checkmate_patterns',
  },
  {
    id: 'essential',
    label: 'Essential Endgames',
    icon: Shield,
    desc: 'King+Pawn, King+Rook, Lucena, Philidor — the positions every player must know.',
    apiType: 'essential_endgames',
  },
  {
    id: 'personal',
    label: 'Your Endgame Mistakes',
    icon: Target,
    desc: 'AI-analyzed endgame errors from your actual games with corrections.',
    apiType: 'personal_endgames',
  },
];

export function Endgames() {
  const { username } = useUser();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useMyCourses();

  const [activeTab, setActiveTab] = useState<EndgameTab>('checkmate');
  const [generatingType, setGeneratingType] = useState<string | null>(null);
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

  const allCourses = data?.courses || [];
  const endgameCourses = allCourses.filter(c =>
    c.category === 'Endgame Technique' ||
    c.title.toLowerCase().includes('endgame') ||
    c.title.toLowerCase().includes('checkmate')
  );

  const checkmatePatternCourses = endgameCourses.filter(c =>
    c.title.toLowerCase().includes('checkmate') ||
    c.title.toLowerCase().includes('mate pattern')
  );
  const essentialEndgameCourses = endgameCourses.filter(c =>
    c.title.toLowerCase().includes('essential') ||
    c.title.toLowerCase().includes('king +') ||
    c.title.toLowerCase().includes('k+') ||
    c.title.toLowerCase().includes('rook endgame') ||
    c.title.toLowerCase().includes('pawn endgame') ||
    (c.category === 'Endgame Technique' && !checkmatePatternCourses.includes(c))
  );

  const coursesForTab = (tab: EndgameTab) => {
    if (tab === 'checkmate') return checkmatePatternCourses.length > 0 ? checkmatePatternCourses : endgameCourses.filter(c => c.title.toLowerCase().includes('checkmate'));
    if (tab === 'essential') return essentialEndgameCourses;
    return endgameCourses;
  };

  async function handleGenerate(apiType: string) {
    if (!username || generatingType) return;
    setGeneratingType(apiType);
    setGenError(null);

    let jobId: string;
    try {
      const res = await apiFetch('/api/courses/endgame/generate-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, type: apiType }),
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
        setGeneratingType(null);
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      if (!mountedRef.current) {
        clearInterval(intervalRef.current!);
        return;
      }
      try {
        const pollRes = await apiFetch(`/api/courses/endgame/generate-status/${jobId}`, { cache: 'no-store' });
        if (pollRes.status === 304) return;
        if (!pollRes.ok) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setGenError('Generation job expired or failed');
          setGeneratingType(null);
          return;
        }
        const pollBody = await pollRes.json() as { status: string; error?: string };

        if (!mountedRef.current) return;

        if (pollBody.status === 'done') {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setGeneratingType(null);
          queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
          refetch();
        } else if (pollBody.status === 'error') {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setGenError(pollBody.error ?? 'Generation failed');
          setGeneratingType(null);
        }
      } catch {}
    }, 3000);
  }

  const currentTab = TABS.find(t => t.id === activeTab)!;
  const tabCourses = coursesForTab(activeTab);

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <PremiumGate feature="Endgame Training">
    <div className="space-y-6 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <div>
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <Crown className="w-8 h-8 text-primary" />
          Endgame Training
        </h1>
        <p className="text-muted-foreground mt-1">Master the endgame — the most important phase of chess.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all whitespace-nowrap shrink-0',
              activeTab === tab.id
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-secondary/50 text-muted-foreground border-border hover:text-foreground hover:bg-secondary'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          <div className="glass-card rounded-2xl p-5 md:p-6 mb-6 border border-white/5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <currentTab.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">{currentTab.label}</h2>
                  <p className="text-sm text-muted-foreground">{currentTab.desc}</p>
                </div>
              </div>

              <button
                onClick={() => handleGenerate(currentTab.apiType)}
                disabled={!!generatingType}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shrink-0"
              >
                {generatingType === currentTab.apiType ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate {activeTab === 'personal' ? 'From My Games' : 'Course'}
                  </>
                )}
              </button>
            </div>

            {generatingType === currentTab.apiType && (
              <p className="text-xs text-muted-foreground animate-pulse mt-3">
                Building your endgame course — this takes 1–2 minutes…
              </p>
            )}
            {genError && (
              <div className="flex items-center gap-1.5 text-sm text-red-400 mt-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {genError}
              </div>
            )}
          </div>

          {tabCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {tabCourses.map((course, i) => {
                const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
                const isComplete = progress === 100;

                return (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.08 }}
                    key={course.id}
                    className="glass-card rounded-2xl p-5 flex flex-col h-full group border-white/5 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                        {course.category}
                      </span>
                      <span className={cn(
                        'px-2.5 py-0.5 rounded-full text-[10px] font-bold border',
                        course.difficulty === 'Beginner' ? 'border-emerald-500/30 text-emerald-400' :
                        course.difficulty === 'Intermediate' ? 'border-amber-500/30 text-amber-400' :
                        'border-red-500/30 text-red-400'
                      )}>
                        {course.difficulty}
                      </span>
                    </div>

                    <h3 className="font-bold text-base mb-2 group-hover:text-primary transition-colors leading-snug">{course.title}</h3>
                    <p className="text-xs text-muted-foreground mb-5 flex-1 line-clamp-3">{course.description}</p>

                    <div className="mt-auto space-y-3">
                      <div>
                        <div className="flex justify-between text-[10px] font-medium mb-1.5">
                          <span className={isComplete ? 'text-emerald-400 flex items-center gap-1' : 'text-muted-foreground'}>
                            {isComplete && <CheckCircle2 className="w-2.5 h-2.5" />}
                            {course.completedLessons}/{course.totalLessons} Lessons
                          </span>
                          <span className="text-primary font-bold">{progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn('h-full transition-all duration-1000', isComplete ? 'bg-emerald-500' : 'bg-primary')}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <Link href={`/courses/${course.id}`} className={cn(
                        'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all',
                        isComplete
                          ? 'bg-secondary text-foreground hover:bg-secondary/80'
                          : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'
                      )}>
                        {isComplete ? 'Review' : <><PlayCircle className="w-4 h-4" /> Continue</>}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
              <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-bold mb-1.5">No {currentTab.label} Yet</h3>
              <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
                {activeTab === 'personal'
                  ? 'Generate a personalized endgame course based on mistakes from your actual games.'
                  : `Generate a structured ${currentTab.label.toLowerCase()} training course.`}
              </p>
              <button
                onClick={() => handleGenerate(currentTab.apiType)}
                disabled={!!generatingType}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 transition-all disabled:opacity-50"
              >
                Generate Now
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
    </PremiumGate>
  );
}
