import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { useCourseDetail, useMarkLessonComplete } from '@/hooks/use-courses';
import { ChessBoard } from '@/components/ChessBoard';
import {
  ArrowLeft, CheckCircle2, Circle, BookOpen, Target,
  ChevronLeft, ChevronRight, Award, List, LayoutTemplate
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

function LessonContent({ content }: { content: string }) {
  const paragraphs = content.split(/\n\n+/).filter(Boolean);
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => {
        const trimmed = p.trim();
        if (trimmed.startsWith('- ') || trimmed.includes('\n- ')) {
          const items = trimmed.split('\n').filter(l => l.trim());
          return (
            <ul key={i} className="space-y-2.5">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-2.5 text-foreground/80 text-sm leading-relaxed">
                  <span className="text-primary mt-1 shrink-0">▸</span>
                  <span>{item.replace(/^[-•]\s*/, '')}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (trimmed.startsWith('# ')) {
          return <h3 key={i} className="text-lg font-bold mt-2">{trimmed.slice(2)}</h3>;
        }
        if (trimmed.startsWith('## ')) {
          return <h4 key={i} className="text-base font-bold text-primary mt-1">{trimmed.slice(3)}</h4>;
        }
        return (
          <p key={i} className="text-foreground/80 text-sm leading-relaxed">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

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

  // Start on the first incomplete lesson
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
  if (!course) return <div className="text-center py-20 text-muted-foreground">Course not found.</div>;

  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;

  return (
    <div className="pb-20 max-w-5xl mx-auto space-y-6">
      {/* Back + Header */}
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

                {/* Lesson content */}
                <div className="px-6 py-6">
                  {lesson && <LessonContent content={lesson.content} />}

                  {/* Practice board */}
                  {lesson?.examplePgn && (
                    <div className="mt-8 pt-6 border-t border-white/5">
                      <h4 className="font-bold mb-4 flex items-center gap-2 text-sm text-primary">
                        <Target className="w-4 h-4" /> Practice Position
                      </h4>
                      <div className="max-w-sm mx-auto">
                        <ChessBoard fen={lesson.examplePgn} />
                      </div>
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
