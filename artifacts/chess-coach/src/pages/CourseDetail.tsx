import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'wouter';
import { useCourseDetail, useMarkLessonComplete } from '@/hooks/use-courses';
import { LessonBoardPlayer } from '@/components/LessonBoardPlayer';
import {
  ArrowLeft, CheckCircle2, Circle, Target,
  ChevronLeft, ChevronRight, Award, List, LayoutTemplate,
  Volume2, VolumeX, BookOpen, Loader,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ── Markdown render helpers ────────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : part
  );
}

function renderStep(text: string): React.ReactNode {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => {
        const trimmed = p.trim();
        if (trimmed.startsWith('### ')) return <h4 key={i} className="text-sm font-bold text-muted-foreground uppercase tracking-wider mt-2">{trimmed.slice(4)}</h4>;
        if (trimmed.startsWith('## ')) return <h4 key={i} className="text-base font-bold text-primary mt-1">{trimmed.slice(3)}</h4>;
        if (trimmed.startsWith('# ')) return <h3 key={i} className="text-lg font-bold mt-2">{trimmed.slice(2)}</h3>;

        const lines = trimmed.split('\n');
        const isList = lines.every(l => /^[-*•]\s/.test(l.trim()) || l.trim() === '');
        if (isList && lines.some(l => /^[-*•]\s/.test(l.trim()))) {
          return (
            <ul key={i} className="space-y-2">
              {lines.filter(l => l.trim()).map((item, j) => (
                <li key={j} className="flex items-start gap-2.5 text-foreground/80 text-sm leading-relaxed">
                  <span className="text-primary mt-1 shrink-0">▸</span>
                  <span>{renderInline(item.replace(/^[-*•]\s*/, ''))}</span>
                </li>
              ))}
            </ul>
          );
        }

        return <p key={i} className="text-foreground/80 text-sm leading-relaxed">{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

/** Strip markdown for plain speech */
function toPlainText(md: string): string {
  return md
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[-*•]\s*/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

/** Split lesson content into logical step groups */
function splitIntoSteps(content: string): string[] {
  const raw = content.split(/\n\n+/).filter(s => s.trim().length > 0);
  const grouped: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const trimmed = raw[i].trim();
    // Glue a heading to its immediately following paragraph (keeps them together as one step)
    if (trimmed.startsWith('#') && i + 1 < raw.length && !raw[i + 1].trim().startsWith('#')) {
      grouped.push(trimmed + '\n\n' + raw[i + 1].trim());
      i++;
    } else {
      grouped.push(trimmed);
    }
  }
  return grouped.length > 0 ? grouped : [''];
}

// ── Step-by-step lesson content component with TTS ────────────────────────────
function LessonContentStepper({ content, lessonId }: { content: string; lessonId: number }) {
  const steps = useMemo(() => splitIntoSteps(content), [content]);
  const [step, setStep] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  useEffect(() => {
    setStep(0);
    stopReading();
  }, [lessonId]);

  useEffect(() => {
    return () => { stopReading(); };
  }, []);

  function stopReading() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setSpeaking(false);
    setLoading(false);
  }

  const readAloud = useCallback(async (text: string) => {
    stopReading();
    const plain = toPlainText(text);
    if (!plain) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const res = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plain, voice: 'nova' }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error('TTS failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => { setLoading(false); setSpeaking(true); };
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setSpeaking(false); setLoading(false); URL.revokeObjectURL(url); };

      await audio.play();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setLoading(false);
      setSpeaking(false);
    }
  }, []);

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, steps.length - 1));
    stopReading();
    setStep(clamped);
    if (autoRead) {
      setTimeout(() => readAloud(steps[clamped]), 80);
    }
  }, [steps, autoRead, readAloud]);

  if (steps.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground">
            Step <span className="font-bold text-foreground">{step + 1}</span> of {steps.length}
          </span>
          {steps.length > 1 && (
            <button
              onClick={() => setAutoRead(a => !a)}
              title={autoRead ? 'Auto-read on (click to disable)' : 'Enable auto-read on step change'}
              className={cn(
                'ml-1 text-[10px] font-bold px-2 py-0.5 rounded border transition-colors',
                autoRead
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'text-muted-foreground border-border hover:text-foreground'
              )}
            >
              AUTO
            </button>
          )}
        </div>

        <button
          onClick={() => (speaking || loading) ? stopReading() : readAloud(steps[step])}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
            (speaking || loading)
              ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/20'
              : 'text-muted-foreground border-border hover:text-foreground hover:bg-white/5'
          )}
        >
          {loading
            ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Loading…</>
            : speaking
              ? <><VolumeX className="w-3.5 h-3.5" /> Stop</>
              : <><Volume2 className="w-3.5 h-3.5" /> Read aloud</>}
        </button>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.18 }}
          className="min-h-[80px]"
        >
          {renderStep(steps[step])}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      {steps.length > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/5">
          <button
            onClick={() => goTo(step - 1)}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-1 flex-wrap justify-center">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  'rounded-full transition-all',
                  i === step ? 'w-5 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
                )}
                title={`Step ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={() => goTo(step + 1)}
            disabled={isLast}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main CourseDetail page ─────────────────────────────────────────────────────
export function CourseDetail() {
  const { id } = useParams();
  const courseId = parseInt(id || '0');
  const { data: course, isLoading } = useCourseDetail(courseId);
  const { markComplete, isUpdating } = useMarkLessonComplete();

  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sortedLessons = [...(course?.lessons ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const lesson = sortedLessons[currentIdx];
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === sortedLessons.length - 1;

  useEffect(() => {
    if (!course) return;
    const sorted = [...(course.lessons ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    const firstIncomplete = sorted.findIndex(l => !l.completed);
    setCurrentIdx(firstIncomplete >= 0 ? firstIncomplete : 0);
  }, [!!course]);

  const handleMarkComplete = async (completed: boolean) => {
    if (!lesson) return;
    await markComplete(courseId, lesson.id, completed);
    if (completed && !isLast) {
      setTimeout(() => setCurrentIdx(i => i + 1), 350);
    }
  };

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!course) return (
    <div className="space-y-8 pb-16 max-w-5xl mx-auto">
      <Link href="/courses" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Courses
      </Link>
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Target className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground">This course could not be loaded.</p>
        <Link href="/courses" className="px-5 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors border border-primary/20">
          View all courses
        </Link>
      </div>
    </div>
  );

  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;

  return (
    <div className="pb-20 max-w-5xl mx-auto space-y-6">
      <Link href="/courses" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Courses
      </Link>

      {/* Course banner */}
      <div className="glass-card rounded-3xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/20">
              {course.category}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border
              ${course.difficulty === 'Beginner'     ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                course.difficulty === 'Intermediate' ? 'bg-amber-500/15   text-amber-400  border-amber-500/30'   :
                                                       'bg-rose-500/15    text-rose-400   border-rose-500/30'}`}>
              {course.difficulty}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold mb-2">{course.title}</h1>
          <p className="text-muted-foreground text-sm mb-5 max-w-2xl">{course.description}</p>

          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-sm">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">{course.completedLessons} of {course.totalLessons} lessons</span>
                <span className="text-primary font-bold">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-background rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-amber-400 transition-all duration-700 rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
            {progress === 100 && (
              <div className="flex items-center gap-1.5 text-amber-400 text-sm font-bold">
                <Award className="w-4 h-4" /> Complete!
              </div>
            )}
          </div>
        </div>
      </div>

      {sortedLessons.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground">No lessons available.</div>
      ) : (
        <div className="flex gap-6 items-start">
          {/* Sidebar — lesson list */}
          <div className="hidden lg:flex flex-col w-64 shrink-0 glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <List className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm">Lessons</span>
            </div>
            <div className="py-2 max-h-[70vh] overflow-y-auto">
              {sortedLessons.map((l, idx) => (
                <button
                  key={l.id}
                  onClick={() => setCurrentIdx(idx)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5',
                    idx === currentIdx ? 'bg-primary/10 text-primary border-r-2 border-primary' : 'text-foreground/70'
                  )}
                >
                  {l.completed
                    ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                    : <Circle className={cn('w-4 h-4 shrink-0', idx === currentIdx ? 'text-primary' : 'text-muted-foreground')} />
                  }
                  <span className="line-clamp-2 leading-snug font-medium">{l.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile sidebar toggle */}
          <div className="lg:hidden fixed bottom-24 right-4 z-50">
            <button
              onClick={() => setSidebarOpen(s => !s)}
              className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
            >
              <List className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile sidebar overlay */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="absolute right-0 top-0 h-full w-72 bg-card border-l border-white/10 overflow-y-auto"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-4 py-5 border-b border-white/5 flex items-center gap-2">
                    <List className="w-4 h-4 text-primary" />
                    <span className="font-bold">Lessons</span>
                  </div>
                  {sortedLessons.map((l, idx) => (
                    <button
                      key={l.id}
                      onClick={() => { setCurrentIdx(idx); setSidebarOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3.5 text-left text-sm border-b border-white/5 transition-colors hover:bg-white/5',
                        idx === currentIdx ? 'bg-primary/10 text-primary' : 'text-foreground/70'
                      )}
                    >
                      {l.completed
                        ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                        : <Circle className="w-4 h-4 shrink-0 text-muted-foreground" />
                      }
                      <span className="line-clamp-2 leading-snug">{l.title}</span>
                    </button>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lesson viewer */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={lesson?.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="glass-card rounded-2xl overflow-hidden"
              >
                {/* Lesson header */}
                <div className="px-6 pt-6 pb-5 border-b border-white/5">
                  <div className="text-xs text-primary font-bold uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <LayoutTemplate className="w-3.5 h-3.5" />
                    Lesson {currentIdx + 1} of {sortedLessons.length}
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold leading-snug">{lesson?.title}</h2>
                  {lesson?.completed && (
                    <div className="mt-2 flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                    </div>
                  )}
                </div>

                {/* Lesson body */}
                <div className="px-6 py-6 space-y-6">
                  {/* Interactive board */}
                  {lesson?.examplePgn && (
                    <div>
                      <h4 className="font-bold mb-3 flex items-center gap-2 text-sm text-primary">
                        <Target className="w-4 h-4" />
                        {lesson.drillExpectedMove ? 'Interactive Lesson + Practice' : 'Interactive Lesson'}
                      </h4>
                      <LessonBoardPlayer
                        pgn={lesson.examplePgn}
                        title={lesson.title}
                        drillFen={lesson.drillFen ?? null}
                        drillExpectedMove={lesson.drillExpectedMove ?? null}
                        drillHint={lesson.drillHint ?? null}
                      />
                    </div>
                  )}

                  {/* Step-by-step lesson text with TTS */}
                  {lesson && lesson.content && (
                    <div className="glass-card rounded-xl p-4 border border-white/6 bg-white/2">
                      <LessonContentStepper
                        key={lesson.id}
                        content={lesson.content}
                        lessonId={lesson.id}
                      />
                    </div>
                  )}
                </div>

                {/* Navigation footer */}
                <div className="px-6 pb-6 pt-4 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <button
                    disabled={isFirst}
                    onClick={() => setCurrentIdx(i => i - 1)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleMarkComplete(!lesson?.completed)}
                      disabled={isUpdating}
                      className={cn(
                        'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                        lesson?.completed
                          ? 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white hover:-translate-y-0.5'
                      )}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {lesson?.completed ? 'Mark Incomplete' : (isLast ? 'Complete Course' : 'Complete & Next')}
                    </button>
                  </div>

                  <button
                    disabled={isLast}
                    onClick={() => setCurrentIdx(i => i + 1)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Lesson dots / mini-progress */}
            <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap">
              {sortedLessons.map((l, idx) => (
                <button
                  key={l.id}
                  onClick={() => setCurrentIdx(idx)}
                  className={cn(
                    'rounded-full transition-all',
                    idx === currentIdx
                      ? 'w-6 h-2 bg-primary'
                      : l.completed
                      ? 'w-2 h-2 bg-emerald-500/70'
                      : 'w-2 h-2 bg-white/15 hover:bg-white/30'
                  )}
                  title={`Lesson ${idx + 1}: ${l.title}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
