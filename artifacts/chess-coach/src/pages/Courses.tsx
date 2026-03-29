import React from 'react';
import { useMyCourses, useCreateCourses } from '@/hooks/use-courses';
import { useUser } from '@/hooks/use-user';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { BookOpen, GraduationCap, CheckCircle2, ChevronRight, PlayCircle } from 'lucide-react';

export function Courses() {
  const { username } = useUser();
  const { data, isLoading } = useMyCourses();
  const { generate, isGenerating } = useCreateCourses();

  const handleGenerate = () => {
    if (username) generate(username);
  };

  const courses = data?.courses || [];

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">My Courses</h1>
          <p className="text-muted-foreground">Personalized lesson plans based on your AI analysis.</p>
        </div>
        
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div> Building Syllabus...</>
          ) : (
            <><GraduationCap className="w-5 h-5" /> Generate New Courses</>
          )}
        </button>
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
                  {isComplete ? 'Review Course' : <><PlayCircle className="w-5 h-5"/> Continue Learning</>}
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
            <button onClick={handleGenerate} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 transition-all">
              Generate Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
