import React, { useRef, useState, useEffect, useCallback } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { ProUpsell } from '@/components/ProUpsell';
import { trackBackgroundJob } from '@/components/BackgroundJobsWatcher';
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
import { cn } from '@/lib/utils';
import { useDashboardRedesignFlag, useSiteImg } from '@/hooks/use-app-config';
import { RD } from '@/lib/redesignTheme';
import { PhotoHero, scene } from '@/components/PhotoHero';
import { ART_BASE, distinctArtImgs } from './CoursesRedesign';

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
    desc: 'Analyzed endgame errors from your actual games with corrections.',
    apiType: 'personal_endgames',
  },
];

const API_TYPE_TO_TAB: Record<string, EndgameTab> = {
  checkmate_patterns: 'checkmate',
  essential_endgames: 'essential',
  personal_endgames: 'personal',
};

export function Endgames() {
  const { username, authUser, isPremium, isSubscriptionLoaded } = useUser();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useMyCourses();
  const { enabled: redesign } = useDashboardRedesignFlag();
  const siteImg = useSiteImg();

  const [activeTab, setActiveTab] = useState<EndgameTab>('checkmate');
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback((jobId: string, apiType: string) => {
    trackBackgroundJob('endgames', jobId);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setGeneratingType(apiType);
    setGenError(null);

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
  }, [queryClient, refetch]);

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        const res = await apiFetch('/api/courses/endgame/active-job', { cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json() as { jobs: { jobId: string; endgameType: string; status: string }[] };
        if (body.jobs.length > 0 && mountedRef.current) {
          const activeJob = body.jobs[0];
          const tab = API_TYPE_TO_TAB[activeJob.endgameType];
          if (tab) setActiveTab(tab);
          startPolling(activeJob.jobId, activeJob.endgameType);
        }
      } catch {}
    })();

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startPolling]);

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
    const genUsername = username ?? authUser?.lichessUsername ?? null;
    if (!genUsername || generatingType) return;
    setGeneratingType(apiType);
    setGenError(null);

    let jobId: string;
    try {
      const res = await apiFetch('/api/courses/endgame/generate-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: genUsername, type: apiType }),
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

    startPolling(jobId, apiType);
  }

  const currentTab = TABS.find(t => t.id === activeTab)!;
  const tabCourses = coursesForTab(activeTab);

  // Endgame courses are written by the AI, so they're Pro.
  if (authUser && isSubscriptionLoaded && !isPremium) {
    if (redesign) return (
      <div className="mx-auto max-w-[640px] space-y-4 px-3 pt-3 pb-24 md:px-0 md:pt-0">
        <PhotoHero img={scene('hero-endgames')} icon={<Crown size={20} />} title="Endgames" subtitle="Courses built from the endgames in your own games." />
        <ProUpsell
          title="Master the endgames you actually reach"
          text="Pro finds the endgames from your own games and turns them into lessons and drills, from basic checkmates to rook endings."
          perks={['Checkmate patterns, pawn and rook endings', 'Positions taken from your own games', 'Plus the AI coach on every game you review']}
        />
      </div>
    );
    return (
      <div className="mx-auto max-w-[640px] space-y-4 px-4 pt-4 pb-20 md:px-0 md:pt-0">
        <PageHero piece="♚" title="Endgames" subtitle="Courses built from the endgames in your own games." />
        <ProUpsell
          title="Master the endgames you actually reach"
          text="Pro finds the endgames from your own games and turns them into lessons and drills, from basic checkmates to rook endings."
          perks={['Checkmate patterns, pawn and rook endings', 'Positions taken from your own games', 'Plus the AI coach on every game you review']}
        />
      </div>
    );
  }

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (redesign) {
    const imgs = distinctArtImgs(tabCourses);
    const generating = generatingType === currentTab.apiType;
    const genLabel = activeTab === 'personal' ? 'Generate From My Games' : 'Generate Course';
    return (
      <div className="mx-auto max-w-[760px] space-y-4 px-3 pt-3 pb-24 md:px-0 md:pt-0">
        <PhotoHero img={scene('hero-endgames')} icon={<Crown size={20} />} title="Endgame Training" subtitle="Master the endgame — the most important phase of chess." />

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {TABS.map((tab) => {
            const on = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-[13.5px] font-extrabold transition-colors"
                style={on ? { background: RD.green, color: '#05100A' } : { background: RD.cardSolid, color: RD.muted, border: `1px solid ${RD.border}` }}
              >
                <tab.icon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>

        <section className="rounded-[20px] p-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]" style={{ background: 'rgba(139,234,69,.14)', color: RD.green, border: '1px solid rgba(139,234,69,.25)' }}>
              <currentTab.icon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-extrabold" style={{ color: RD.text }}>{currentTab.label}</h2>
              <p className="mt-0.5 text-[13px] leading-snug" style={{ color: RD.muted }}>{currentTab.desc}</p>
            </div>
          </div>
          <button
            onClick={() => handleGenerate(currentTab.apiType)}
            disabled={!!generatingType}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[12px] py-3 text-[14px] font-extrabold transition-transform active:scale-[.98] disabled:opacity-50"
            style={{ background: RD.green, color: '#05100A' }}
          >
            {generating ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#05100A] border-t-transparent" /> Generating…</>) : (<><Sparkles size={16} /> {genLabel}</>)}
          </button>
          {generating && <p className="mt-2 text-center text-[12px] animate-pulse" style={{ color: RD.muted }}>Building your endgame course — this takes 1–2 minutes…</p>}
          {genError && <p className="mt-2 flex items-center gap-1.5 text-[13px]" style={{ color: RD.red }}><AlertCircle size={15} className="shrink-0" /> {genError}</p>}
        </section>

        {tabCourses.length > 0 ? (
          <div className="grid gap-2.5 md:grid-cols-2">
            {tabCourses.map((course, i) => {
              const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
              const done = progress === 100;
              return (
                <Link key={course.id} href={`/courses/${course.id}`} className="flex items-stretch overflow-hidden rounded-[18px] transition-transform active:scale-[.99]" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                  <span className="relative w-[96px] shrink-0 overflow-hidden">
                    <img src={siteImg(`${ART_BASE}${imgs[i]}.webp`)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1 px-3.5 py-3">
                    <b className="block truncate text-[15.5px] font-extrabold" style={{ color: RD.text }}>{course.title}</b>
                    <span className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: done ? RD.green : RD.muted }}>
                      {done && <CheckCircle2 size={12} />} {course.completedLessons}/{course.totalLessons} lessons · {course.difficulty}
                    </span>
                    <span className="mt-2.5 flex items-center gap-2.5">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.10)' }}>
                        <span className="block h-full rounded-full" style={{ width: `${progress}%`, background: RD.green }} />
                      </span>
                      <b className="text-[12.5px]" style={{ color: RD.text }}>{progress}%</b>
                    </span>
                  </span>
                  <ChevronRight size={17} className="mr-3 shrink-0 self-center" style={{ color: RD.muted }} />
                </Link>
              );
            })}
          </div>
        ) : (
          <section className="rounded-[20px] px-6 py-10 text-center" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
            <BookOpen size={36} className="mx-auto mb-3" style={{ color: RD.muted, opacity: .6 }} />
            <h3 className="text-[17px] font-extrabold" style={{ color: RD.text }}>No {currentTab.label} yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-[13px]" style={{ color: RD.muted }}>
              {activeTab === 'personal'
                ? 'Generate a personalized endgame course based on mistakes from your actual games.'
                : `Generate a structured ${currentTab.label.toLowerCase()} training course.`}
            </p>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <PageHero piece="♚" title="Endgame Training" subtitle="Master the endgame — the most important phase of chess." />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all whitespace-nowrap shrink-0',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground border-primary/30'
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
          <div className="glass-card rounded-xl p-5 md:p-6 mb-6 border border-white/5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                  <currentTab.icon className="w-5 h-5 text-primary-foreground" />
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
                    className="glass-card rounded-xl p-5 flex flex-col h-full group border-white/5 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground border border-primary/20">
                        {course.category}
                      </span>
                      <span className={cn(
                        'px-2.5 py-0.5 rounded-full text-[10px] font-bold border',
                        course.difficulty === 'Beginner' ? 'bg-emerald-500 text-white' :
                        course.difficulty === 'Intermediate' ? 'bg-amber-500 text-white' :
                        'bg-red-500 text-white'
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
                          : 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
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
            <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
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
  );
}
