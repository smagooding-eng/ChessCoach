import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'wouter';
import { useCourseDetail, useMarkLessonComplete } from '@/hooks/use-courses';
import { LessonBoardPlayer } from '@/components/LessonBoardPlayer';
import {
  ArrowLeft, CheckCircle2, Target, X, Check,
  ChevronLeft, ChevronRight, Award, List,
  Volume2, VolumeX, BookOpen, Loader,
} from 'lucide-react';

const CHESSCOM_GREEN = '#81b64c';
const BG_DARK = '#262421';
const BG_CARD = '#302e2b';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { useMyWeaknesses } from '@/hooks/use-analysis';
import { encodeCard } from '@/pages/ShareCard';

// ── Markdown render helpers ────────────────────────────────────────────────────
const MISTAKE_RED = '#dc4343';

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-bold" style={{ color: '#e8e6e3' }}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

const WEAKNESS_SEVERITY_COLORS: Record<string, string> = {
  Critical: '#dc4343',
  High: '#e88930',
  Medium: '#e8c830',
  Low: '#7a9e5c',
};

function LessonIntroCard({
  conceptTitle,
  conceptText,
  courseCategory,
  onStart,
}: {
  conceptTitle: string | null;
  conceptText: string | null;
  courseCategory: string;
  onStart: () => void;
}) {
  const { data: weaknessData } = useMyWeaknesses();
  const matchedWeakness = weaknessData?.weaknesses?.find(
    (w) => w.category.toLowerCase() === courseCategory.toLowerCase()
  );

  if (!conceptText) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5 md:p-6 mb-3"
      style={{ background: 'linear-gradient(160deg, #302e2b 0%, #262421 100%)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(160deg, ${CHESSCOM_GREEN}, #5f8a3a)` }}>
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-base md:text-lg font-bold text-white">
          {conceptTitle || 'The Idea'}
        </h3>
      </div>

      <p className="text-sm leading-relaxed text-white/75 mb-4">
        {conceptText}
      </p>

      {matchedWeakness && (
        <div className="rounded-xl p-3.5" style={{
          background: `${WEAKNESS_SEVERITY_COLORS[matchedWeakness.severity] ?? CHESSCOM_GREEN}0F`,
          border: `1px solid ${WEAKNESS_SEVERITY_COLORS[matchedWeakness.severity] ?? CHESSCOM_GREEN}30`,
        }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{
                background: `${WEAKNESS_SEVERITY_COLORS[matchedWeakness.severity] ?? CHESSCOM_GREEN}20`,
                color: WEAKNESS_SEVERITY_COLORS[matchedWeakness.severity] ?? CHESSCOM_GREEN,
              }}>
              {matchedWeakness.severity}
            </span>
            <span className="text-xs font-semibold text-white/60">How this shows up in your games</span>
          </div>
          <p className="text-sm leading-relaxed text-white/80">{matchedWeakness.description}</p>
        </div>
      )}

      <button
        onClick={onStart}
        className="w-full mt-4 py-3 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
        style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)` }}
      >
        Start <ChevronRight className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

function renderParagraph(trimmed: string, key: number): React.ReactNode {
  const headingBody = trimmed.match(/^(#{1,3})\s+(.*)/s);
  if (headingBody) {
    const level = headingBody[1].length;
    const rest = headingBody[2];
    const lines = rest.split('\n');
    const heading = lines[0];
    const body = lines.slice(1).join('\n').trim();
    const nodes: React.ReactNode[] = [];

    if (level === 3) {
      nodes.push(<h4 key={`${key}-h`} className="text-sm font-bold uppercase tracking-wider mt-2" style={{ color: '#9e9b98' }}>{renderInline(heading)}</h4>);
    } else if (level === 2) {
      nodes.push(<h4 key={`${key}-h`} className="text-base font-bold mt-1" style={{ color: CHESSCOM_GREEN }}>{renderInline(heading)}</h4>);
    } else {
      nodes.push(<h3 key={`${key}-h`} className="text-lg font-bold mt-2" style={{ color: '#e8e6e3' }}>{renderInline(heading)}</h3>);
    }

    if (body) {
      nodes.push(<p key={`${key}-b`} className="text-[15px] leading-[1.65] mt-1.5" style={{ color: '#d6d3cf' }}>{renderInline(body)}</p>);
    }
    return <React.Fragment key={key}>{nodes}</React.Fragment>;
  }

  const lines = trimmed.split('\n');
  const isList = lines.every(l => /^[-*•]\s/.test(l.trim()) || l.trim() === '');
  if (isList && lines.some(l => /^[-*•]\s/.test(l.trim()))) {
    return (
      <ul key={key} className="space-y-2.5">
        {lines.filter(l => l.trim()).map((item, j) => (
          <li key={j} className="flex items-start gap-2.5 text-[15px] leading-[1.65]" style={{ color: '#d6d3cf' }}>
            <span className="mt-1 shrink-0" style={{ color: CHESSCOM_GREEN }}>▸</span>
            <span>{renderInline(item.replace(/^[-*•]\s*/, ''))}</span>
          </li>
        ))}
      </ul>
    );
  }

  return <p key={key} className="text-[15px] leading-[1.65]" style={{ color: '#d6d3cf' }}>{renderInline(trimmed)}</p>;
}

function renderStep(text: string): React.ReactNode {
  const isMistake = /^##?\s*The Mistake/im.test(text);
  const isFix = /^##?\s*The Fix/im.test(text);

  if (isMistake) {
    const body = text.replace(/^#{1,3}\s*The Mistake\s*/im, '').trim();
    const paragraphs = body.split(/\n\n+/).filter(Boolean);
    return (
      <div className="rounded-2xl p-4 md:p-5" style={{ background: 'rgba(220,67,67,0.07)', border: '1px solid rgba(220,67,67,0.2)' }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(220,67,67,0.18)' }}>
            <X className="w-4 h-4" style={{ color: MISTAKE_RED }} />
          </div>
          <h4 className="text-base font-bold" style={{ color: MISTAKE_RED }}>What went wrong</h4>
        </div>
        <div className="space-y-3">
          {paragraphs.map((p, i) => renderParagraph(p.trim(), 100 + i))}
        </div>
      </div>
    );
  }

  if (isFix) {
    const body = text.replace(/^#{1,3}\s*The Fix\s*/im, '').trim();
    const paragraphs = body.split(/\n\n+/).filter(Boolean);
    return (
      <div className="rounded-2xl p-4 md:p-5" style={{ background: 'rgba(129,182,76,0.07)', border: `1px solid rgba(129,182,76,0.2)` }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(129,182,76,0.18)' }}>
            <Check className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
          </div>
          <h4 className="text-base font-bold" style={{ color: CHESSCOM_GREEN }}>The better move</h4>
        </div>
        <div className="space-y-3">
          {paragraphs.map((p, i) => renderParagraph(p.trim(), 200 + i))}
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

/** Splits content into {heading, body} sections at each markdown heading. */
function splitIntoSections(content: string): { heading: string | null; body: string }[] {
  const parts = content.split(/\n(?=#{1,3}\s)/);
  return parts.map((part) => {
    const headingMatch = part.match(/^#{1,3}\s*(.+?)\s*\n([\s\S]*)$/);
    if (headingMatch) {
      return { heading: headingMatch[1].trim(), body: headingMatch[2].trim() };
    }
    return { heading: null, body: part.trim() };
  }).filter((s) => s.body.length > 0 || s.heading);
}

/** Split lesson content into logical step groups, excluding the Concept
 * section (that's shown separately as an intro, not as a numbered step). */
function splitIntoSteps(content: string): string[] {
  const sections = splitIntoSections(content).filter((s) => !/^The Concept$/i.test(s.heading ?? ''));
  const withoutConcept = sections.map((s) => (s.heading ? `## ${s.heading}\n${s.body}` : s.body)).join('\n\n');
  const raw = withoutConcept.split(/\n\n+/).filter(s => s.trim().length > 0);
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

/** Extracts just the Concept section's body text, if present. */
function extractConceptText(content: string): string | null {
  const section = splitIntoSections(content).find((s) => /^The Concept$/i.test(s.heading ?? ''));
  return section?.body || null;
}

// ── Step-by-step lesson content component with TTS ────────────────────────────
function LessonContentStepper({ content, lessonId, courseCategory, conceptTitle, onStepChange }: { content: string; lessonId: number; courseCategory: string; conceptTitle?: string | null; onStepChange?: (stepText: string) => void }) {
  const steps = useMemo(() => splitIntoSteps(content), [content]);
  const conceptText = useMemo(() => extractConceptText(content), [content]);
  const [step, setStep] = useState(0);
  const [showingIntro, setShowingIntro] = useState(!!conceptText);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  useEffect(() => {
    setStep(0);
    setShowingIntro(!!conceptText);
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

  if (showingIntro && conceptText) {
    return (
      <LessonIntroCard
        conceptTitle={conceptTitle ?? null}
        conceptText={conceptText}
        courseCategory={courseCategory}
        onStart={() => setShowingIntro(false)}
      />
    );
  }

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
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
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

      {/* Step navigation */}
      {steps.length > 1 && (
        <div className="flex items-center justify-between gap-3 pt-3 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => goTo(step - 1)}
            disabled={isFirst}
            className="flex items-center gap-1 pl-1.5 pr-3 py-1.5 text-xs font-semibold rounded-full transition-all disabled:opacity-0 text-white/60 hover:text-white hover:bg-white/10"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  'rounded-full transition-all',
                  i === step ? 'w-6 h-2' : 'w-2 h-2 bg-white/15 hover:bg-white/30'
                )}
                style={i === step ? { backgroundColor: CHESSCOM_GREEN } : undefined}
                title={`Step ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={() => goTo(step + 1)}
            disabled={isLast}
            className="flex items-center gap-1 pr-1.5 pl-3 py-1.5 text-xs font-semibold rounded-full transition-all disabled:opacity-0"
            style={{ color: isLast ? undefined : CHESSCOM_GREEN }}
          >
            Next <ChevronRight className="w-4 h-4" />
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
  const [showCompletionShare, setShowCompletionShare] = useState(false);
  const { username } = useUser();

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
    } else if (completed && isLast) {
      setShowCompletionShare(true);
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
        <Link href="/courses" className="px-5 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-bold transition-colors border border-primary/20">
          View all courses
        </Link>
      </div>
    </div>
  );

  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;

  return (
    <div className="pb-20 max-w-4xl mx-auto space-y-2 md:space-y-4 px-3 md:px-0">
      {/* Compact back + course info header */}
      <div className="flex items-center gap-2 md:gap-3">
        <Link href="/courses" className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white">
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
            <div className="py-1 max-h-[70vh] overflow-y-auto overscroll-contain">
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
                  className="absolute right-0 top-0 h-full w-72 overflow-y-auto overscroll-contain"
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
          <div className="flex-1 min-w-0 space-y-2 md:space-y-3">
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
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-0.5" style={{ color: CHESSCOM_GREEN }}>
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
                    extraChallenges={lesson.extraChallenges ?? null}
                    conceptTitle={lesson.conceptTitle ?? null}
                  />
                )}

                {/* Step-by-step lesson text with TTS */}
                {lesson && lesson.content && (
                  <div className="rounded-xl p-3 md:p-4 mt-2 md:mt-3" style={{ backgroundColor: BG_DARK }}>
                    <LessonContentStepper
                      key={lesson.id}
                      content={lesson.content}
                      lessonId={lesson.id}
                      courseCategory={course?.category ?? ''}
                      conceptTitle={lesson.conceptTitle}
                      onStepChange={(stepText) => setShowFixLine(/##\s*The Fix/i.test(stepText))}
                    />
                  </div>
                )}

                {/* Navigation footer */}
                <div className="mt-5 pt-4 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <button
                    onClick={() => handleMarkComplete(!lesson?.completed)}
                    disabled={isUpdating}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black transition-all',
                      lesson?.completed
                        ? 'bg-white/10 text-white/60 hover:text-white hover:bg-white/15'
                        : 'text-white hover:brightness-110 shadow-lg'
                    )}
                    style={!lesson?.completed ? { background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)` } : undefined}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {lesson?.completed ? 'Mark Incomplete' : (isLast ? 'Complete Course' : 'Complete & Next')}
                  </button>

                  <div className="flex items-center justify-between">
                    <button
                      disabled={isFirst}
                      onClick={() => setCurrentIdx(i => i - 1)}
                      className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-semibold rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-0"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous lesson
                    </button>

                    {!isLast && (
                      <button
                        onClick={() => setCurrentIdx(i => i + 1)}
                        className="px-2 py-1.5 text-xs font-medium text-white/35 hover:text-white/60 transition-all"
                      >
                        Skip without completing →
                      </button>
                    )}
                  </div>
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

      <AnimatePresence>
        {showCompletionShare && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowCompletionShare(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 text-center"
              style={{ background: '#302e2b', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="text-4xl mb-3">🏆</div>
              <h3 className="text-lg font-bold text-white mb-1">Course complete!</h3>
              <p className="text-sm text-white/60 mb-5">
                You just fixed a real weakness in your game. Worth sharing.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/share/${encodeCard({
                      type: 'course',
                      username: username ?? 'A ChessScout user',
                      courseName: course?.title ?? 'a personalized course',
                      weaknessFixed: course?.category ?? 'a real weakness',
                      lessonsCompleted: course?.totalLessons ?? sortedLessons.length,
                    })}`;
                    const shareData = { title: 'I just completed a ChessScout course', url };
                    if (navigator.share) {
                      try { await navigator.share(shareData); return; } catch { /* fall through to clipboard */ }
                    }
                    try { await navigator.clipboard.writeText(url); } catch { /* nothing more we can do */ }
                  }}
                  className="w-full py-3 rounded-xl font-bold text-black transition-all hover:scale-[1.02]"
                  style={{ background: CHESSCOM_GREEN }}
                >
                  Share this win
                </button>
                <button
                  onClick={() => setShowCompletionShare(false)}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/50"
                >
                  Maybe later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
