import { useEffect, useState } from 'react';
import { useParams, Link } from 'wouter';
import { ArrowLeft, ChevronRight, Loader2, CheckCircle2, Circle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const BG = '#141413';
const CARD = '#1c1b19';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const ACCENT = '#4a9eda';
const GREEN = '#81b64c';

interface Course {
  id: number;
  title: string;
  description: string;
  iconEmoji: string;
}

interface LessonSummary {
  id: number;
  title: string;
  summary: string;
  orderIndex: number;
}

export default function BeginnerCourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/beginner-courses/${id}/lessons`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.course) setCourse(d.course);
        setLessons(d?.lessons ?? []);
        setCompletedIds(d?.completedIds ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: BG, color: TEXT }}>
        <p className="text-sm" style={{ color: MUTED }}>Course not found.</p>
        <Link href="/admin/beginner-courses" className="text-sm font-bold" style={{ color: ACCENT }}>Back to Courses</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
        <Link href="/admin/beginner-courses" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: MUTED }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{course.iconEmoji}</span>
          <h1 className="text-2xl sm:text-3xl font-black" style={{ letterSpacing: '-0.02em' }}>{course.title}</h1>
        </div>
        <p className="text-sm mb-8" style={{ color: MUTED }}>{course.description}</p>

        {lessons.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm" style={{ color: MUTED }}>No lessons added yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lessons.map((lesson, i) => {
              const done = completedIds.includes(lesson.id);
              return (
                <Link key={lesson.id} href={`/admin/beginner-lessons/${lesson.id}`}>
                  <div
                    className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-transform hover:scale-[1.01]"
                    style={{ background: CARD, border: `1px solid ${done ? GREEN : 'rgba(255,255,255,0.06)'}` }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black" style={{ background: done ? `${GREEN}20` : 'rgba(255,255,255,0.06)', color: done ? GREEN : MUTED }}>
                      {done ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{lesson.title}</p>
                      <p className="text-xs truncate" style={{ color: MUTED }}>{lesson.summary}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
