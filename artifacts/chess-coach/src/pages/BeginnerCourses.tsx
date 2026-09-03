import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { GraduationCap, ChevronRight, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const BG = '#141413';
const CARD = '#1c1b19';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const ACCENT = '#4a9eda'; // blue -- distinct from both the app's green and the amber used for traps

interface CourseSummary {
  id: number;
  title: string;
  description: string;
  iconEmoji: string;
}

export default function BeginnerCoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/beginner-courses', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setCourses(d?.courses ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${ACCENT}25`, color: ACCENT }}>
            Admin preview
          </span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-xl p-2.5" style={{ background: `${ACCENT}18`, color: ACCENT }}>
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-black" style={{ letterSpacing: '-0.02em' }}>Beginner Courses</h1>
        </div>
        <p className="text-sm mb-8" style={{ color: MUTED }}>
          Start from the basics, one lesson at a time.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: ACCENT }} />
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm" style={{ color: MUTED }}>No courses added yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {courses.map((course) => (
              <Link key={course.id} href={`/admin/beginner-courses/${course.id}`}>
                <div
                  className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-transform hover:scale-[1.01]"
                  style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="rounded-xl p-2.5 shrink-0 text-2xl flex items-center justify-center w-11 h-11" style={{ background: `${ACCENT}18` }}>
                    {course.iconEmoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{course.title}</p>
                    <p className="text-xs truncate" style={{ color: MUTED }}>{course.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
