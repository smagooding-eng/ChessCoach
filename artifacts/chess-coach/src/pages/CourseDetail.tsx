import React, { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useCourseDetail, useMarkLessonComplete } from '@/hooks/use-courses';
import { ChessBoard } from '@/components/ChessBoard';
import { ArrowLeft, CheckCircle2, Circle, ChevronDown, BookOpen, Target } from 'lucide-react';
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
            <ul key={i} className="space-y-2">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-foreground/80 text-sm leading-relaxed">
                  <span className="text-primary mt-0.5 shrink-0 text-xs">▸</span>
                  <span>{item.replace(/^[-•]\s*/, '')}</span>
                </li>
              ))}
            </ul>
          );
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
  const [expandedLesson, setExpandedLesson] = useState<number>(0);

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!course) return <div className="text-center py-20 text-muted-foreground">Course not found.</div>;

  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
  const sortedLessons = [...(course.lessons ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);

  const handleToggleComplete = async (lessonId: number, currentStatus: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    await markComplete(courseId, lessonId, !currentStatus);
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto">
      <Link href="/courses" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Courses
      </Link>

      {/* Header */}
      <div className="glass-card rounded-3xl p-7 md:p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
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

          <h1 className="text-2xl md:text-4xl font-display font-bold mb-3 leading-tight">{course.title}</h1>
          <p className="text-muted-foreground mb-7 max-w-2xl leading-relaxed">{course.description}</p>

          <div className="bg-secondary/40 rounded-2xl p-5 border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-sm">Your Progress</span>
              <span className="text-primary font-bold">{progress}%</span>
            </div>
            <div className="h-2.5 w-full bg-background rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-amber-400 transition-all duration-700 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              {course.completedLessons} of {course.totalLessons} lessons completed
            </p>
          </div>
        </div>
      </div>

      {/* Lessons */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Lessons</h2>
        </div>

        {sortedLessons.length === 0 && (
          <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground">
            No lessons available.
          </div>
        )}

        {sortedLessons.map((lesson, idx) => {
          const isExpanded = expandedLesson === idx;

          return (
            <div key={lesson.id} className="glass-card rounded-2xl overflow-hidden border border-white/5">
              <button
                onClick={() => setExpandedLesson(isExpanded ? -1 : idx)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div
                  onClick={(e) => handleToggleComplete(lesson.id, lesson.completed, e)}
                  className="shrink-0 p-1 cursor-pointer transition-transform hover:scale-110"
                >
                  {lesson.completed ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  ) : (
                    <Circle className="w-6 h-6 text-muted-foreground hover:text-primary transition-colors" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs text-primary font-bold mb-0.5 uppercase tracking-wide">Lesson {idx + 1}</div>
                  <h3 className={cn('font-bold leading-snug', lesson.completed ? 'text-muted-foreground' : 'text-foreground')}>
                    {lesson.title}
                  </h3>
                </div>

                <ChevronDown className={cn('w-5 h-5 text-muted-foreground transition-transform duration-200 shrink-0', isExpanded && 'rotate-180')} />
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-7 pt-4 border-t border-white/5">
                      <LessonContent content={lesson.content} />

                      {lesson.examplePgn && (
                        <div className="mt-8 pt-6 border-t border-white/5">
                          <h4 className="font-bold mb-4 flex items-center gap-2 text-sm text-primary">
                            <Target className="w-4 h-4" /> Practice Position
                          </h4>
                          <ChessBoard fen={lesson.examplePgn} />
                        </div>
                      )}

                      <div className="mt-6 pt-4 border-t border-white/5 flex justify-end">
                        <button
                          onClick={(e) => handleToggleComplete(lesson.id, lesson.completed, e)}
                          disabled={isUpdating}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border
                            ${lesson.completed
                              ? 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white hover:-translate-y-0.5'}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {lesson.completed ? 'Mark Incomplete' : 'Mark as Complete'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
