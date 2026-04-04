import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'wouter';
import { useCourseDetail, useMarkLessonComplete } from '@/hooks/use-courses';
import { LessonBoardPlayer } from '@/components/LessonBoardPlayer';
import {
  ArrowLeft, CheckCircle2, Target,
  ChevronLeft, ChevronRight, Award, List,
  Volume2, VolumeX, BookOpen, Loader,
} from 'lucide-react';

const CHESSCOM_GREEN = '#81b64c';
const BG_DARK = '#262421';
const BG_CARD = '#302e2b';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

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

function renderParagraph(trimmed: string, key: number): React.ReactNode {
  if (trimmed.startsWith('### ')) return <h4 key={key} className="text-sm font-bold text-muted-foreground uppercase tracking-wider mt-2">{trimmed.slice(4)}</h4>;
  if (trimmed.startsWith('## ')) return <h4 key={key} className="text-base font-bold text-primary mt-1">{trimmed.slice(3)}</h4>;
  if (trimmed.startsWith('# ')) return <h3 key={key} className="text-lg font-bold mt-2">{trimmed.slice(2)}</h3>;

  const lines = trimmed.split('\n');
  const isList = lines.every(l => /^[-*•]\s/.test(l.trim()) || l.trim() === '');
  if (isList && lines.some(l => /^[-*•]\s/.test(l.trim()))) {
    return (
      <ul key={key} className="space-y-2">
        {lines.filter(l => l.trim()).map((item, j) => (
          <li key={j} className="flex items-start gap-2.5 text-foreground/80 text-sm leading-relaxed">
            <span className="text-primary mt-1 shrink-0">▸</span>
            <span>{renderInline(item.replace(/^[-*•]\s*/, ''))}</span>
          </li>
        ))}
      </ul>
    );
  }

  return <p key={key} className="text-foreground/80 text-sm leading-relaxed">{renderInline(trimmed)}</p>;
}

function renderStep(text: string): React.ReactNode {
  const mistakeMatch = text.match(/##\s*The Mistake/i);
  const fixMatch = text.match(/##\s*The Fix/i);

  if (mistakeMatch && fixMatch) {
    const mistakeIdx = text.indexOf(mistakeMatch[0]);
    const fixIdx = text.indexOf(fixMatch[0]);
    const mistakeBody = text.slice(mistakeIdx + mistakeMatch[0].length, fixIdx).trim();
    const fixBody = text.slice(fixIdx + fixMatch[0].length).trim();
    const before = text.slice(0, mistakeIdx).trim();

    const mistakeParagraphs = mistakeBody.split(/\n\n+/).filter(Boolean);
    const fixParagraphs = fixBody.split(/\n\n+/).filter(Boolean);
    const beforeParagraphs = before ? before.split(/\n\n+/).filter(Boolean) : [];

    return (
      <div className="space-y-4">
        {beforeParagraphs.map((p, i) => renderParagraph(p.trim(), i))}
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-400 text-lg">✗</span>
            <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">Where You Went Wrong</h4>
          </div>
          {mistakeParagraphs.map((p, i) => renderParagraph(p.trim(), 100 + i))}
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-emerald-400 text-lg">✓</span>
            <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">What You Should Have Done</h4>
          </div>
          {fixParagraphs.map((p, i) => renderParagraph(p.trim(), 200 + i))}
        </div>
      </div>
    );
  }

  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => renderParagraph(p.trim(), i))}
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
function LessonContentStepper({ content, lessonId, onStepChange }: { content: string; lessonId: number; onStepChange?: (stepText: string) => void }) {
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
    onStepChange?.(steps[0] ?? '');
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
      const res = await apiFetch('/api/tts/speak', {
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
    onStepChange?.(steps[clamped] ?? '');
    if (autoRead) {
      setTimeout(() => readAloud(steps[clamped]), 80);
    }
  }, [steps, autoRead, readAloud, onStepChange]);

  if (steps.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: CHESSCOM_GREEN }} />
          <span className="text-xs text-white/50">
            Step <span className="font-bold text-white/80">{step + 1}</span> of {steps.length}
          </span>
          {steps.length > 1 && (
            <button
              onClick={() => setAutoRead(a => !a)}
              title={autoRead ? 'Auto-read on (click to disable)' : 'Enable auto-read on step change'}
              className={cn(
                'ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors',
                autoRead
                  ? 'text-white'
                  : 'text-white/40 hover:text-white/70'
              )}
              style={autoRead ? { backgroundColor: CHESSCOM_GREEN } : { backgroundColor: 'rgba(255,255,255,0.08)' }}
            >
              AUTO
            </button>
          )}
        </div>

        <button
          onClick={() => (speaking || loading) ? stopReading() : readAloud(steps[step])}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
            (speaking || loading)
              ? 'text-white'
              : 'text-white/50 hover:text-white hover:bg-white/10'
          )}
          style={(speaking || loading) ? { backgroundColor: CHESSCOM_GREEN } : undefined}
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
          className="min-h-[60px]"
        >
          {renderStep(steps[step])}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      {steps.length > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            onClick={() => goTo(step - 1)}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg hover:bg-white/10 transition-all disabled:opacity-20 text-white/50 hover:text-white"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-1 flex-wrap justify-center">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  'rounded-full transition-all',
                  i === step ? 'w-5 h-1.5' : 'w-1.5 h-1.5 bg-white/15 hover:bg-white/30'
                )}
                style={i === step ? { backgroundColor: CHESSCOM_GREEN } : undefined}
                title={`Step ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={() => goTo(step + 1)}
            disabled={isLast}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg hover:bg-white/10 transition-all disabled:opacity-20 text-white/50 hover:text-white"
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
  const [showFixLine, setShowFixLine] = useState(false);

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
    <div className="pb-20 max-w-4xl mx-auto space-y-4">
      {/* Compact back + course info header */}
      <div className="flex items-center gap-3">
        <Link href="/courses" className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{course.title}</h1>
          <div className="flex items-center gap-3 text-xs text-white/40">
            <span>{course.category}</span>
            <span>·</span>
            <span>{course.difficulty}</span>
            <span>·</span>
            <span>{course.completedLessons}/{course.totalLessons} lessons</span>
            {progress === 100 && (
              <span className="flex items-center gap-1 text-amber-400 font-bold">
                <Award className="w-3 h-3" /> Complete!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${progress}%`, backgroundColor: CHESSCOM_GREEN }}
        />
      </div>

      {sortedLessons.length === 0 ? (
        <div className="rounded-xl p-12 text-center text-white/50" style={{ backgroundColor: BG_DARK }}>No lessons available.</div>
      ) : (
        <div className="flex gap-4 items-start">
          {/* Sidebar — lesson list */}
          <div className="hidden lg:flex flex-col w-56 shrink-0 rounded-xl overflow-hidden" style={{ backgroundColor: BG_DARK }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: BG_CARD }}>
              <List className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
              <span className="font-bold text-sm text-white/80">Lessons</span>
            </div>
            <div className="py-1 max-h-[70vh] overflow-y-auto">
              {sortedLessons.map((l, idx) => (
                <button
                  key={l.id}
                  onClick={() => setCurrentIdx(idx)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-all',
                    idx === currentIdx ? 'text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                  )}
                  style={idx === currentIdx ? { backgroundColor: 'rgba(129, 182, 76, 0.15)' } : undefined}
                >
                  {l.completed
                    ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: CHESSCOM_GREEN }} />
                    : <div className={cn(
                        'w-4 h-4 shrink-0 rounded-full border-2',
                        idx === currentIdx ? 'border-white/50' : 'border-white/20'
                      )} />
                  }
                  <span className="line-clamp-2 leading-snug text-xs font-medium">{l.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile sidebar toggle */}
          <div className="lg:hidden fixed bottom-24 right-4 z-50">
            <button
              onClick={() => setSidebarOpen(s => !s)}
              className="w-12 h-12 rounded-full text-white shadow-xl flex items-center justify-center"
              style={{ backgroundColor: CHESSCOM_GREEN }}
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
                  className="absolute right-0 top-0 h-full w-72 overflow-y-auto"
                  style={{ backgroundColor: BG_DARK }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-4 py-4 flex items-center gap-2" style={{ backgroundColor: BG_CARD }}>
                    <List className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                    <span className="font-bold text-white/80">Lessons</span>
                  </div>
                  {sortedLessons.map((l, idx) => (
                    <button
                      key={l.id}
                      onClick={() => { setCurrentIdx(idx); setSidebarOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors hover:bg-white/5',
                        idx === currentIdx ? 'text-white' : 'text-white/50'
                      )}
                      style={idx === currentIdx ? { backgroundColor: 'rgba(129, 182, 76, 0.15)' } : undefined}
                    >
                      {l.completed
                        ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: CHESSCOM_GREEN }} />
                        : <div className="w-4 h-4 shrink-0 rounded-full border-2 border-white/20" />
                      }
                      <span className="line-clamp-2 leading-snug">{l.title}</span>
                    </button>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lesson viewer */}
          <div className="flex-1 min-w-0 space-y-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={lesson?.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {/* Lesson header */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5" style={{ color: CHESSCOM_GREEN }}>
                      Lesson {currentIdx + 1} of {sortedLessons.length}
                    </p>
                    <h2 className="text-lg font-bold text-white leading-snug">{lesson?.title}</h2>
                  </div>
                  {lesson?.completed && (
                    <span className="flex items-center gap-1 text-xs font-bold shrink-0" style={{ color: CHESSCOM_GREEN }}>
                      <CheckCircle2 className="w-4 h-4" /> Done
                    </span>
                  )}
                </div>

                {/* Interactive board */}
                {lesson && (
                  <LessonBoardPlayer
                    pgn={lesson.examplePgn || lesson.drillFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
                    fixPgn={lesson.fixExamplePgn ?? null}
                    showFixLine={showFixLine}
                    title={lesson.title}
                    drillFen={lesson.drillFen ?? null}
                    drillExpectedMove={lesson.drillExpectedMove ?? null}
                    drillHint={lesson.drillHint ?? null}
                    content={lesson.content ?? null}
                  />
                )}

                {/* Step-by-step lesson text with TTS */}
                {lesson && lesson.content && (
                  <div className="rounded-xl p-4 mt-3" style={{ backgroundColor: BG_DARK }}>
                    <LessonContentStepper
                      key={lesson.id}
                      content={lesson.content}
                      lessonId={lesson.id}
                      onStepChange={(stepText) => setShowFixLine(/##\s*The Fix/i.test(stepText))}
                    />
                  </div>
                )}

                {/* Navigation footer */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-4">
                  <button
                    disabled={isFirst}
                    onClick={() => setCurrentIdx(i => i - 1)}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>

                  <button
                    onClick={() => handleMarkComplete(!lesson?.completed)}
                    disabled={isUpdating}
                    className={cn(
                      'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all',
                      lesson?.completed
                        ? 'bg-white/10 text-white/60 hover:text-white hover:bg-white/15'
                        : 'text-white hover:brightness-110 shadow-lg'
                    )}
                    style={!lesson?.completed ? { backgroundColor: CHESSCOM_GREEN } : undefined}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {lesson?.completed ? 'Mark Incomplete' : (isLast ? 'Complete Course' : 'Complete & Next')}
                  </button>

                  <button
                    disabled={isLast}
                    onClick={() => setCurrentIdx(i => i + 1)}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Lesson dots / mini-progress */}
            <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
              {sortedLessons.map((l, idx) => (
                <button
                  key={l.id}
                  onClick={() => setCurrentIdx(idx)}
                  className={cn(
                    'rounded-full transition-all',
                    idx === currentIdx
                      ? 'w-6 h-2'
                      : l.completed
                      ? 'w-2 h-2'
                      : 'w-2 h-2 bg-white/15 hover:bg-white/30'
                  )}
                  style={
                    idx === currentIdx
                      ? { backgroundColor: CHESSCOM_GREEN }
                      : l.completed
                      ? { backgroundColor: 'rgba(129, 182, 76, 0.5)' }
                      : undefined
                  }
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
