import React, { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useCourseDetail, useMarkLessonComplete } from '@/hooks/use-courses';
import { ChessBoard } from '@/components/ChessBoard';
import { ArrowLeft, CheckCircle2, Circle, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export function CourseDetail() {
  const { id } = useParams();
  const courseId = parseInt(id || '0');
  const { data: course, isLoading } = useCourseDetail(courseId);
  const { markComplete, isUpdating } = useMarkLessonComplete();
  
  const [expandedLesson, setExpandedLesson] = useState<number | null>(null);

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  if (!course) return <div className="text-center py-20">Course not found.</div>;

  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;

  const handleToggleComplete = async (lessonId: number, currentStatus: boolean, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent accordion toggle
    await markComplete(courseId, lessonId, !currentStatus);
  };

  return (
    <div className="space-y-8 pb-20 max-w-4xl mx-auto">
      <Link href="/courses" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Courses
      </Link>

      <div className="glass-card rounded-3xl p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/20 text-primary border border-primary/20">{course.category}</span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-secondary border border-border">{course.difficulty}</span>
          </div>
          
          <h1 className="text-3xl md:text-5xl font-display font-bold mb-4 leading-tight">{course.title}</h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl">{course.description}</p>

          <div className="bg-secondary/50 rounded-2xl p-5 border border-white/5">
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold">Course Progress</span>
              <span className="text-primary font-bold">{progress}%</span>
            </div>
            <div className="h-3 w-full bg-background rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-amber-400 transition-all duration-1000" 
                style={{ width: `${progress}%` }} 
              />
            </div>
            <div className="text-sm text-muted-foreground mt-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {course.completedLessons} of {course.totalLessons} lessons completed
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold pl-2">Syllabus</h2>
        
        {course.lessons?.sort((a, b) => a.orderIndex - b.orderIndex).map((lesson, idx) => {
          const isExpanded = expandedLesson === lesson.id;
          
          return (
            <div key={lesson.id} className="glass-card rounded-2xl overflow-hidden transition-all duration-300 border-white/5">
              <button 
                onClick={() => setExpandedLesson(isExpanded ? null : lesson.id)}
                className="w-full flex items-center gap-4 p-5 md:p-6 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div 
                  onClick={(e) => handleToggleComplete(lesson.id, lesson.completed, e)}
                  className="shrink-0 p-1 cursor-pointer transition-transform hover:scale-110"
                >
                  {lesson.completed ? (
                    <CheckCircle2 className="w-7 h-7 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  ) : (
                    <Circle className="w-7 h-7 text-muted-foreground hover:text-primary transition-colors" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="text-sm text-primary font-bold mb-1">Lesson {idx + 1}</div>
                  <h3 className={cn("text-lg font-bold transition-colors", lesson.completed ? "text-muted-foreground" : "text-foreground")}>
                    {lesson.title}
                  </h3>
                </div>

                <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform duration-300", isExpanded && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-6 pt-0 border-t border-white/5">
                      <div className="prose prose-invert prose-primary max-w-none mt-6">
                        <div dangerouslySetInnerHTML={{ __html: lesson.content.replace(/\n/g, '<br/>') }} />
                      </div>
                      
                      {lesson.examplePgn && (
                        <div className="mt-8 pt-8 border-t border-white/5">
                          <h4 className="font-bold mb-6 text-lg flex items-center gap-2">Interactive Example</h4>
                          <ChessBoard fen={lesson.examplePgn} />
                        </div>
                      )}
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
