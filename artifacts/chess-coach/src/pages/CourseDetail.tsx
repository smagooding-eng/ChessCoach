import { RD, REDESIGN_ON } from '@/lib/redesignTheme';
import { LessonQuizScreen, LessonCompleteScreen, LessonIntroScreen, findQuizMoves, type QuizMoves, type IntroBullet } from '@/components/LessonFlow';
import { artFor, ART_BASE } from './CoursesRedesign';
import { useDashboardRedesignFlag } from '@/hooks/use-app-config';
import { CourseOverview } from './CourseOverview';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'wouter';
import { useCourseDetail, useMarkLessonComplete } from '@/hooks/use-courses';
import { LessonBoardPlayer } from '@/components/LessonBoardPlayer';
import { ChessBoard } from '@/components/ChessBoard';
import { MoveNavigationBar } from '@/components/MoveNavigationBar';
import { Chess } from 'chess.js';
import {
  ArrowLeft, CheckCircle2, Target, X, Check,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Award, List,
  Volume2, VolumeX, BookOpen, Loader, Lightbulb,
} from 'lucide-react';

// Mirrors lib/db/src/schema/courses.ts's LessonBeat type -- kept as a
// local copy rather than a new cross-package dependency on
// @workspace/db from the frontend, same reasoning as lib/openingBook.ts
// (it's a small, stable shape; the frontend doesn't otherwise depend on
// the backend's DB package, which also pulls in Node-only runtime code
// it doesn't need just for this one type).
type LessonBeat =
  | { kind: 'concept'; title: string; text: string }
  | { kind: 'example'; text: string; pgn: string; annotation?: string; replayable?: boolean }
  | { kind: 'drill'; text: string; fen: string; expectedMove: string; hint?: string | null; followUpSan?: string[] }
  | { kind: 'summary'; text: string };

const CHESSCOM_GREEN = REDESIGN_ON ? RD.green : '#81b64c';
const BG_DARK = REDESIGN_ON ? RD.bg : '#262421';
const BG_CARD = REDESIGN_ON ? RD.cardSolid : '#302e2b';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { useMyWeaknesses } from '@/hooks/use-analysis';
import { encodeCard } from '@/pages/ShareCard';

// ── Markdown render helpers ────────────────────────────────────────────────────
const MISTAKE_RED = REDESIGN_ON ? RD.red : '#dc4343';

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
  const { enabled: redesign } = useDashboardRedesignFlag();
  const introArt = artFor({ id: 0, category: courseCategory, title: '' });
  const matchedWeakness = weaknessData?.weaknesses?.find(
    (w) => w.category.toLowerCase() === courseCategory.toLowerCase()
  );

  if (!conceptText) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5 md:p-6 mb-3 overflow-hidden"
      style={redesign
        ? { background: RD.card, border: `1px solid ${RD.border}` }
        : { background: 'linear-gradient(160deg, #302e2b 0%, #262421 100%)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {redesign && (
        <div className="relative -mx-5 -mt-5 mb-4 h-28 md:-mx-6 md:-mt-6">
          <img src={`${ART_BASE}${introArt.img}.webp`} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,10,11,.15) 0%, #0D1516 100%)' }} />
        </div>
      )}
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
        style={redesign
          ? { background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A' }
          : { background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)` }}
      >
        {redesign ? 'Start Lesson' : 'Start'} <ChevronRight className="w-4 h-4" />
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
      <div className="pl-4" style={{ borderLeft: `3px solid ${MISTAKE_RED}` }}>
        <div className="flex items-center gap-2 mb-2.5">
          <X className="w-4 h-4" style={{ color: MISTAKE_RED }} />
          <h4 className="text-sm font-bold" style={{ color: MISTAKE_RED }}>What went wrong</h4>
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
      <div className="pl-4" style={{ borderLeft: `3px solid ${CHESSCOM_GREEN}` }}>
        <div className="flex items-center gap-2 mb-2.5">
          <Check className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
          <h4 className="text-sm font-bold" style={{ color: CHESSCOM_GREEN }}>The better move</h4>
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
function LessonContentStepper({ content, lessonId, courseCategory, conceptTitle, onStepChange, boardMoveText }: { content: string; lessonId: number; courseCategory: string; conceptTitle?: string | null; onStepChange?: (stepText: string) => void; boardMoveText?: string }) {
  const steps = useMemo(() => splitIntoSteps(content), [content]);
  // A ref, not reading boardMoveText directly -- several of the calls
  // below happen inside a setTimeout, whose closure would otherwise
  // capture whatever boardMoveText was at the moment the effect ran
  // (e.g. on lesson mount), not its latest value by the time the
  // timeout actually fires. The ref always reflects the current prop.
  const boardMoveTextRef = useRef(boardMoveText ?? '');
  useEffect(() => { boardMoveTextRef.current = boardMoveText ?? ''; }, [boardMoveText]);
  // Whatever move is currently on screen (from LessonBoardPlayer) takes
  // priority over this panel's own static overview text for Read
  // Aloud/AUTO -- someone looking at a specific move's explanation
  // wants to hear THAT, not an unrelated paragraph from the lesson's
  // general narrative. Falls back to the overview only when nothing
  // board-specific is available (boardMoveTextRef empty, e.g. on Drill).
  const currentReadText = (text: string) => boardMoveTextRef.current.trim() ? boardMoveTextRef.current : text;
  const conceptText = useMemo(() => extractConceptText(content), [content]);
  const [step, setStep] = useState(0);
  const [showingIntro, setShowingIntro] = useState(!!conceptText);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  // Defaults to true -- lessons read themselves aloud by default now,
  // per explicit request, rather than needing AUTO toggled on each time.
  // The toggle itself is unchanged and fully functional for anyone who
  // wants to turn it off.
  const [autoRead, setAutoRead] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Paired with LessonBoardPlayer below it on mobile, where CSS order
  // puts the board first and this panel second -- meaning on a phone,
  // the full text content used to sit below a full screen's worth of
  // board, forcing a scroll just to reach it, and forcing a scroll back
  // up to see the board again. Collapsed by default so the step counter
  // and Read Aloud button are visible without pushing the board (the
  // primary content) off-screen; the actual text expands on request
  // rather than always claiming space whether or not it's being read.
  const [expanded, setExpanded] = useState(false);

  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  useEffect(() => {
    setStep(0);
    setShowingIntro(!!conceptText);
    stopReading();
    onStepChange?.(steps[0] ?? '');
    // This was the actual missing piece for "doesn't start automatically"
    // -- defaulting autoRead to true only changes what goTo does on
    // FUTURE navigation; nothing was ever calling readAloud for the
    // first step a lesson opens on, since that's set here directly
    // rather than through goTo. A small delay so this doesn't race the
    // concept-intro card's own mount, and so it doesn't fire while a
    // lesson switch is still settling.
    if (autoRead && !conceptText) {
      setTimeout(() => readAloud(currentReadText(steps[0] ?? '')), 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setTimeout(() => readAloud(currentReadText(steps[clamped])), 80);
    }
  }, [steps, autoRead, readAloud, onStepChange]);

  if (steps.length === 0) return null;

  if (showingIntro && conceptText) {
    return (
      <LessonIntroCard
        conceptTitle={conceptTitle ?? null}
        conceptText={conceptText}
        courseCategory={courseCategory}
        onStart={() => {
          setShowingIntro(false);
          // Mirrors the mount-time trigger above -- that one was
          // skipped while the intro card was still showing, so this is
          // the actual first moment step 0's content becomes visible
          // for a themed/grouped lesson.
          if (autoRead) setTimeout(() => readAloud(currentReadText(steps[0] ?? '')), 150);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls bar -- the step counter area itself toggles expand, so
          there's one obvious place to tap rather than a separate hidden
          affordance. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 -ml-1 pl-1 pr-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5 shrink-0 text-white/40" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-white/40" />}
          <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: CHESSCOM_GREEN }} />
          <span className="text-xs text-white/50">
            Step <span className="font-bold text-white/80">{step + 1}</span> of {steps.length}
          </span>
          {steps.length > 1 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setAutoRead(a => !a); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setAutoRead(a => !a); } }}
              title={autoRead ? 'Auto-read on (click to disable)' : 'Enable auto-read on step change'}
              className={cn(
                'ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors cursor-pointer',
                autoRead
                  ? 'text-white'
                  : 'text-white/40 hover:text-white/70'
              )}
              style={autoRead ? { backgroundColor: CHESSCOM_GREEN } : { backgroundColor: 'rgba(255,255,255,0.08)' }}
            >
              AUTO
            </span>
          )}
        </button>

        <button
          onClick={() => (speaking || loading) ? stopReading() : readAloud(currentReadText(steps[step]))}
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

      {expanded && (
        <>
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
        </>
      )}
    </div>
  );
}

// ── Unified beat player (courses redesign) ─────────────────────────────────
// Replaces the old LessonContentStepper + LessonBoardPlayer pairing for any
// lesson that has `beats` populated (post-migration). One currentBeat index
// drives both the text panel and the board, instead of four independent
// navigation states -- see courses-redesign-spec.md for the full
// rationale. Falls back to the old system automatically for any
// not-yet-migrated lesson (see the render call site below).
function beatText(beat: LessonBeat | undefined): string {
  if (!beat) return '';
  return beat.text;
}

function LessonBeatPlayer({
  beats, lessonId, onLessonComplete, isLastLesson,
}: {
  beats: LessonBeat[];
  lessonId: number;
  onLessonComplete: () => void;
  isLastLesson: boolean;
}) {
  const [currentBeat, setCurrentBeat] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  // Defaults to true -- same reasoning as LessonContentStepper above.
  const [autoRead, setAutoRead] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [drillResult, setDrillResult] = useState<'correct' | 'wrong' | null>(null);
  const { enabled: redesign } = useDashboardRedesignFlag();
  const [hintOpen, setHintOpen] = useState(false);
  // Example boards auto-play by default; any manual step pauses them (redesign controls)
  const [exampleAuto, setExampleAuto] = useState(true);
  const [showFix, setShowFix] = useState(false);
  const [fixFens, setFixFens] = useState<string[]>([]);
  const [fixPly, setFixPly] = useState(0);

  const [exampleFens, setExampleFens] = useState<string[]>([]);
  const [examplePly, setExamplePly] = useState(0);

  const beat = beats[currentBeat];
  const isFirst = currentBeat === 0;
  const isLastBeat = currentBeat === beats.length - 1;

  function stopReading() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
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

  // Reset to beat 0 whenever the lesson itself changes.
  useEffect(() => {
    setCurrentBeat(0);
    stopReading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // Reset per-beat interactive state whenever the current beat changes.
  useEffect(() => {
    setDrillResult(null);
    setHintOpen(false);
    setShowFix(false);
    setFixPly(0);
    setExamplePly(0);
    setExampleAuto(true);
    stopReading();
    if (autoRead) setTimeout(() => readAloud(beatText(beat)), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBeat, lessonId]);

  useEffect(() => () => { stopReading(); }, []);

  // Build the FEN sequence for an example beat's pgn, once per beat.
  useEffect(() => {
    if (beat?.kind !== 'example' || !beat.pgn) { setExampleFens([]); return; }
    try {
      const chess = new Chess();
      chess.loadPgn(beat.pgn);
      // Bug fix: the PGN's own [FEN "..."] header (when the position
      // doesn't start from the standard setup, which is the normal case
      // here -- these are almost always a specific mid-game position, not
      // a full game from move 1) was being read correctly by loadPgn()
      // above, but then completely discarded -- replaying the extracted
      // moves on a fresh default-position Chess() instead of the PGN's
      // actual starting position. Since the first move usually isn't
      // legal from the standard starting position, that replay call
      // threw, got swallowed by the catch below, and left exampleFens
      // permanently empty -- which is exactly why the board only ever
      // showed the plain starting position and never advanced.
      const startFen = chess.getHeaders().FEN || undefined;
      const moves = chess.history();
      const replay = new Chess(startFen);
      const fens = [replay.fen()];
      for (const m of moves) { replay.move(m); fens.push(replay.fen()); }
      setExampleFens(fens);
    } catch {
      setExampleFens([]);
    }
  }, [beat]);

  // Auto-play example beats, one move at a time.
  useEffect(() => {
    if (beat?.kind !== 'example' || exampleFens.length === 0) return;
    if (!exampleAuto) return;
    if (examplePly >= exampleFens.length - 1) return;
    const t = setTimeout(() => setExamplePly((p) => p + 1), 900);
    return () => clearTimeout(t);
  }, [beat, exampleFens, examplePly, exampleAuto]);

  // Build + auto-play the "show the fix" continuation for a drill.
  useEffect(() => {
    if (!showFix || beat?.kind !== 'drill') return;
    try {
      const chess = new Chess(beat.fen);
      const fens = [chess.fen()];
      for (const san of beat.followUpSan ?? []) {
        const m = chess.move(san);
        if (!m) break;
        fens.push(chess.fen());
      }
      setFixFens(fens);
      setFixPly(0);
    } catch {
      setFixFens([beat.fen]);
    }
  }, [showFix, beat]);

  useEffect(() => {
    if (!showFix || fixFens.length === 0) return;
    if (fixPly >= fixFens.length - 1) return;
    const t = setTimeout(() => setFixPly((p) => p + 1), 900);
    return () => clearTimeout(t);
  }, [showFix, fixFens, fixPly]);

  const goTo = useCallback((idx: number) => {
    setCurrentBeat(Math.max(0, Math.min(idx, beats.length - 1)));
  }, [beats.length]);

  const handleNext = () => {
    if (isLastBeat) onLessonComplete();
    else goTo(currentBeat + 1);
  };

  if (beats.length === 0) return null;

  // Redesign: which kinds of step this lesson has (for the tab strip) and where we are in them
  const KIND_LABEL: Record<string, string> = { concept: 'Explanation', example: 'Example', drill: 'Practice', summary: 'Summary' };
  const kindGroups = (['concept', 'example', 'drill', 'summary'] as const)
    .map((k) => ({ kind: k as string, label: KIND_LABEL[k], first: beats.findIndex((b) => b.kind === k) }))
    .filter((g) => g.first >= 0);
  const kindIndex = beats.slice(0, currentBeat + 1).filter((b) => b.kind === beat.kind).length;
  const kindTotal = beats.filter((b) => b.kind === beat.kind).length;

  const boardFen = beat.kind === 'drill'
    ? (showFix ? fixFens[fixPly] ?? beat.fen : beat.fen)
    : beat.kind === 'example'
      ? exampleFens[examplePly] ?? undefined
      : undefined;

  return (
    <div className="xl:grid xl:grid-cols-[1fr_520px] xl:gap-5 xl:items-start">
      {redesign ? (
        <div className="order-2 xl:order-1 mt-3 space-y-3 xl:mt-0 xl:max-h-[85vh] xl:overflow-y-auto">
          {kindGroups.length > 1 && (
            <div className="grid gap-1 rounded-[16px] p-1" style={{ gridTemplateColumns: `repeat(${kindGroups.length}, minmax(0, 1fr))`, background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
              {kindGroups.map((g) => {
                const active = beat.kind === g.kind;
                return (
                  <button key={g.kind} onClick={() => goTo(g.first)} className="rounded-[12px] py-2.5 text-[13px] font-bold transition-colors"
                    style={active ? { background: 'rgba(139,234,69,.10)', color: RD.text, boxShadow: `inset 0 0 0 1.5px ${RD.green}` } : { background: 'transparent', color: RD.muted }}>
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-[12.5px]" style={{ color: RD.muted }}>Step <b style={{ color: RD.text }}>{currentBeat + 1}</b> of {beats.length}</span>
            <div className="flex items-center gap-2">
              {beats.length > 1 && (
                <button onClick={() => setAutoRead((x) => !x)} aria-pressed={autoRead} className="rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                  style={autoRead ? { background: RD.green, color: '#05100A' } : { background: 'rgba(255,255,255,.08)', color: RD.muted }}>AUTO</button>
              )}
              <button onClick={() => (speaking || loading) ? stopReading() : readAloud(beatText(beat))} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold"
                style={(speaking || loading) ? { background: RD.green, color: '#05100A' } : { background: 'rgba(255,255,255,.08)', color: RD.text }}>
                {loading ? <><Loader className="h-3.5 w-3.5 animate-spin" /> Loading…</> : speaking ? <><VolumeX className="h-3.5 w-3.5" /> Stop</> : <><Volume2 className="h-3.5 w-3.5" /> Listen</>}
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={currentBeat} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-3">
              {beat.kind === 'concept' && (
                <div className="rounded-[20px] p-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                  <h2 className="text-[26px] font-extrabold leading-tight">{beat.title}</h2>
                  <div className="mt-2">{renderStep(beat.text)}</div>
                </div>
              )}

              {beat.kind === 'example' && exampleFens.length > 1 && (
                <MoveNavigationBar
                  variant="redesign"
                  isPlaying={exampleAuto && examplePly < exampleFens.length - 1}
                  onFirst={() => { setExampleAuto(false); setExamplePly(0); }}
                  onPrev={() => { setExampleAuto(false); setExamplePly((x) => Math.max(0, x - 1)); }}
                  onPlayPause={() => {
                    if (exampleAuto && examplePly < exampleFens.length - 1) { setExampleAuto(false); return; }
                    if (examplePly >= exampleFens.length - 1) setExamplePly(0);
                    setExampleAuto(true);
                  }}
                  onNext={() => { setExampleAuto(false); setExamplePly((x) => Math.min(exampleFens.length - 1, x + 1)); }}
                  onLast={() => { setExampleAuto(false); setExamplePly(exampleFens.length - 1); }}
                  canGoBack={examplePly > 0}
                  canGoForward={examplePly < exampleFens.length - 1}
                />
              )}

              {beat.kind === 'example' && (
                <div className="rounded-[20px] p-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[12px] font-extrabold uppercase tracking-[.14em]" style={{ color: RD.green }}>Example {kindIndex} of {kindTotal}</p>
                    {exampleFens.length > 1 && <button onClick={() => setExamplePly(0)} className="text-[12px] font-bold" style={{ color: RD.muted }}>Replay</button>}
                  </div>
                  {renderStep(beat.text)}
                </div>
              )}

              {beat.kind === 'drill' && (
                <>
                  <div className="rounded-[20px] p-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                    <p className="text-[12px] font-extrabold uppercase tracking-[.14em]" style={{ color: RD.green }}>Practice {kindIndex} of {kindTotal}</p>
                    <h2 className="mt-1 text-[22px] font-extrabold leading-tight">Find the best move</h2>
                    <div className="mt-1.5">{renderStep(beat.text)}</div>
                  </div>

                  {drillResult === 'correct' && (
                    <div className="flex items-center gap-3 rounded-[16px] p-3.5" style={{ background: 'rgba(139,234,69,.08)', border: '1px solid rgba(139,234,69,.35)' }}>
                      <Check className="h-5 w-5 shrink-0" style={{ color: RD.green }} />
                      <p className="text-[14.5px] font-extrabold" style={{ color: RD.green }}>Correct! Well done.</p>
                    </div>
                  )}
                  {drillResult === 'wrong' && (
                    <div className="flex items-start gap-3 rounded-[16px] p-3.5" style={{ background: 'rgba(255,80,88,.08)', border: '1px solid rgba(255,80,88,.35)' }}>
                      <X className="mt-0.5 h-5 w-5 shrink-0" style={{ color: RD.red }} />
                      <p className="text-[14px]"><b style={{ color: '#FF8A8F' }}>Not quite.</b>{beat.hint ? ` ${beat.hint}` : ' Try again.'}</p>
                    </div>
                  )}

                  {!drillResult && beat.hint && (
                    <div>
                      <h3 className="mb-2 px-1 text-[16px] font-extrabold">Hints (1)</h3>
                      {hintOpen ? (
                        <div className="flex items-start gap-3 rounded-[16px] p-3.5" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0" style={{ color: '#F2C14E' }} />
                          <p className="text-[13.5px] leading-snug">{beat.hint}</p>
                        </div>
                      ) : (
                        <button onClick={() => setHintOpen(true)} className="flex w-full items-center gap-3 rounded-[16px] p-3.5 text-left" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                          <Lightbulb className="h-5 w-5 shrink-0" style={{ color: '#F2C14E' }} /><span className="text-[14px] font-bold">Show hint</span>
                        </button>
                      )}
                    </div>
                  )}

                  {drillResult && (beat.followUpSan?.length ?? 0) > 0 && (
                    <button onClick={() => setShowFix((v) => !v)} className="w-full rounded-[14px] py-3 text-[14px] font-bold" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}`, color: RD.green }}>
                      {showFix ? 'Hide the line' : 'Show the correct line'}
                    </button>
                  )}
                </>
              )}

              {beat.kind === 'summary' && (
                <div className="rounded-[20px] p-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                  <p className="mb-2 flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[.14em]" style={{ color: RD.gold }}><Award className="h-4 w-4" />Lesson recap</p>
                  {renderStep(beat.text)}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {beats.length > 1 && (
            <div className="sticky bottom-0 z-20 flex items-center gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3" style={{ background: 'linear-gradient(180deg, rgba(5,10,11,0) 0%, #050A0B 24%)' }}>
              <button onClick={() => goTo(currentBeat - 1)} disabled={isFirst} className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold disabled:opacity-30"
                style={{ background: RD.cardSolid, border: `1px solid ${RD.border}`, color: RD.text }}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button onClick={handleNext} disabled={beat.kind === 'drill' && !drillResult} className="flex h-[52px] flex-[1.4] items-center justify-center gap-2 rounded-[14px] text-[15px] font-extrabold transition-opacity disabled:opacity-40"
                style={{ background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A' }}>
                {isLastBeat ? (isLastLesson ? 'Complete Course' : 'Complete & Next') : 'Next'} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Text panel */}
      <div className="rounded-xl p-3 md:p-4 mt-2 md:mt-3 xl:mt-0 order-2 xl:order-1 xl:max-h-[85vh] xl:overflow-y-auto space-y-3" style={{ backgroundColor: BG_DARK }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: CHESSCOM_GREEN }} />
            <span className="text-xs text-white/50">
              Step <span className="font-bold text-white/80">{currentBeat + 1}</span> of {beats.length}
            </span>
            {beats.length > 1 && (
              <button
                onClick={() => setAutoRead((a) => !a)}
                title={autoRead ? 'Auto-read on (click to disable)' : 'Enable auto-read on step change'}
                className={cn('ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors', autoRead ? 'text-white' : 'text-white/40 hover:text-white/70')}
                style={autoRead ? { backgroundColor: CHESSCOM_GREEN } : { backgroundColor: 'rgba(255,255,255,0.08)' }}
              >
                AUTO
              </button>
            )}
          </div>
          <button
            onClick={() => (speaking || loading) ? stopReading() : readAloud(beatText(beat))}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all', (speaking || loading) ? 'text-white' : 'text-white/50 hover:text-white hover:bg-white/10')}
            style={(speaking || loading) ? { backgroundColor: CHESSCOM_GREEN } : undefined}
          >
            {loading ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Loading…</> : speaking ? <><VolumeX className="w-3.5 h-3.5" /> Stop</> : <><Volume2 className="w-3.5 h-3.5" /> Read aloud</>}
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={currentBeat} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }} className="min-h-[60px]">
            {beat.kind === 'concept' && (
              <div>
                <h4 className="text-sm font-bold mb-2" style={{ color: CHESSCOM_GREEN }}>{beat.title}</h4>
                {renderStep(beat.text)}
              </div>
            )}
            {beat.kind !== 'concept' && renderStep(beat.text)}

            {beat.kind === 'drill' && (
              <div className="mt-3">
                {drillResult === 'correct' && (
                  <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: CHESSCOM_GREEN }}><Check className="w-4 h-4" /> Correct!</p>
                )}
                {drillResult === 'wrong' && beat.hint && (
                  <p className="text-sm" style={{ color: MISTAKE_RED }}>Not quite. {beat.hint}</p>
                )}
                {drillResult && (beat.followUpSan?.length ?? 0) > 0 && (
                  <button
                    onClick={() => setShowFix((v) => !v)}
                    className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: CHESSCOM_GREEN }}
                  >
                    {showFix ? 'Hide the line' : 'Show the correct line'}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {beats.length > 1 && (
          <div className="flex items-center justify-between gap-3 pt-3 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => goTo(currentBeat - 1)} disabled={isFirst} className="flex items-center gap-1 pl-1.5 pr-3 py-1.5 text-xs font-semibold rounded-full transition-all disabled:opacity-0 text-white/60 hover:text-white hover:bg-white/10">
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <div className="flex items-center gap-1.5">
              {beats.map((_, i) => (
                <button key={i} onClick={() => goTo(i)} className={cn('rounded-full transition-all', i === currentBeat ? 'w-6 h-2' : 'w-2 h-2 bg-white/15 hover:bg-white/30')} style={i === currentBeat ? { backgroundColor: CHESSCOM_GREEN } : undefined} title={`Step ${i + 1}`} />
              ))}
            </div>
            <button
              onClick={handleNext}
              disabled={beat.kind === 'drill' && !drillResult}
              className="flex items-center gap-1 pr-1.5 pl-3 py-1.5 text-xs font-semibold rounded-full transition-all disabled:opacity-30"
              style={{ color: CHESSCOM_GREEN }}
            >
              {isLastBeat ? (isLastLesson ? 'Complete Course' : 'Complete & Next') : 'Next'} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
        </>
      )}

      {/* Board panel */}
      <div className="order-1 xl:order-2">
        {beat.kind === 'drill' && (
          <ChessBoard
            key={`${lessonId}-${currentBeat}-${showFix}`}
            fen={boardFen ?? beat.fen}
            practiceMode={!drillResult && !showFix}
            expectedMoveSan={!showFix ? beat.expectedMove : undefined}
            onMovePlayed={(_san, isCorrect) => setDrillResult(isCorrect ? 'correct' : 'wrong')}
          />
        )}
        {beat.kind === 'example' && (
          beat.pgn
            ? <ChessBoard key={`${lessonId}-${currentBeat}`} fen={boardFen ?? exampleFens[0]} practiceMode={false} />
            // An empty pgn means this lesson's source content never had a
            // real example position -- showing the default starting
            // position here would look like a real diagram and actively
            // mislead the learner into thinking it relates to the text.
            // Showing nothing is the honest option until this lesson's
            // content gets a real example position.
            : (
              <div className="flex items-center justify-center rounded-xl p-8 text-center text-sm text-white/40" style={{ backgroundColor: BG_DARK, minHeight: 240 }}>
                No diagram available for this step yet.
              </div>
            )
        )}
        {(beat.kind === 'concept' || beat.kind === 'summary') && (
          <div className="flex items-center justify-center rounded-xl p-8 text-center text-sm text-white/40" style={{ backgroundColor: BG_DARK, minHeight: 240 }}>
            {beat.kind === 'summary' ? '🎉 Lesson complete' : 'Read the idea, then continue to see it in action.'}
          </div>
        )}
      </div>
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
  // Redesign only: land on a course overview first; picking a lesson there
  // hands off to the existing lesson player unchanged.
  const { enabled: redesign } = useDashboardRedesignFlag();
  const [showOverview, setShowOverview] = useState(true);
  // Redesign: lessons whose intro screen has been dismissed this visit
  const [introDone, setIntroDone] = useState<number[]>([]);
  // Redesign only: after a lesson is completed, a quick check (when the lesson
  // has a verifiable position) and then a completion screen replace the old
  // silent auto-advance.
  const [post, setPost] = useState<null | { idx: number; step: 'quiz' | 'complete'; quiz: QuizMoves | null }>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(true);
  const [showFixLine, setShowFixLine] = useState(false);
  // Whatever LessonBoardPlayer currently has on screen (Mistake/Fix
  // tabs) -- passed down to LessonContentStepper so its one Read
  // Aloud/AUTO control reads the actual visible move explanation
  // instead of only ever reading the lesson's separate static overview
  // text.
  const [boardMoveText, setBoardMoveText] = useState('');
  const [showCompletionShare, setShowCompletionShare] = useState(false);
  const { username } = useUser();

  const sortedLessons = [...(course?.lessons ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const lesson = sortedLessons[currentIdx];
  // Whether this lesson has been migrated to the courses-redesign beats[]
  // shape -- drives both which player renders and whether the old
  // redundant footer lesson-switcher shows (the new player has its own
  // Prev/Next + Complete&Next, so showing both would just reintroduce the
  // duplicate-navigation problem the redesign exists to fix).
  const usingBeatPlayer = !!(lesson && Array.isArray((lesson as any).beats) && (lesson as any).beats.length > 0);
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
    if (completed && redesign) {
      const quiz = findQuizMoves(lesson.examplePgn, lesson.drillFen, lesson.drillExpectedMove);
      setPost({ idx: currentIdx, step: quiz ? 'quiz' : 'complete', quiz });
      return;
    }
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
        <Link href="/courses" className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/20 text-primary text-sm font-bold transition-colors border border-primary/20">
          View all courses
        </Link>
      </div>
    </div>
  );

  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;

  if (redesign && showOverview) {
    return (
      <CourseOverview
        course={course}
        lessons={sortedLessons}
        onOpen={(idx) => { setCurrentIdx(idx); setShowOverview(false); }}
      />
    );
  }

  return (
    <div className="pb-20 max-w-7xl mx-auto space-y-2 md:space-y-4 px-3 md:px-0">
      {redesign ? (
        // Lesson top bar: back to the overview, "Lesson X of Y", and a green progress bar
        <div className="pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="relative flex items-center justify-center py-2.5">
            <button onClick={() => setShowOverview(true)} aria-label="Back to course overview" className="absolute left-0 grid h-10 w-10 place-items-center rounded-full" style={{ color: RD.text }}>
              <ArrowLeft className="h-[22px] w-[22px]" />
            </button>
            <b className="text-[16px]" style={{ color: RD.text }}>Lesson {currentIdx + 1} of {sortedLessons.length}</b>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.12)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${sortedLessons.length ? ((currentIdx + 1) / sortedLessons.length) * 100 : 0}%`, background: RD.green }} />
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

      {sortedLessons.length === 0 ? (
        <div className="rounded-xl p-12 text-center text-white/50" style={{ backgroundColor: BG_DARK }}>No lessons available.</div>
      ) : (
        <div className="flex gap-4 items-start">
          {/* Sidebar — lesson list, collapsed by default to leave more room for the board and text */}
          {desktopSidebarCollapsed ? (
            <div className="hidden lg:flex flex-col w-11 shrink-0 rounded-xl overflow-hidden items-center py-3 gap-3" style={{ backgroundColor: BG_DARK }}>
              <button
                onClick={() => setDesktopSidebarCollapsed(false)}
                className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                title="Show lesson list"
              >
                <List className="w-4 h-4" />
              </button>
              <div className="w-full h-px" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
              {sortedLessons.map((l, idx) => (
                <button
                  key={l.id}
                  onClick={() => setCurrentIdx(idx)}
                  title={l.title}
                  className="p-1 rounded-full transition-all"
                >
                  {l.completed
                    ? <CheckCircle2 className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                    : <div className={cn(
                        'w-4 h-4 rounded-full border-2',
                        idx === currentIdx ? 'border-white' : 'border-white/20'
                      )} />
                  }
                </button>
              ))}
            </div>
          ) : (
            <div className="hidden lg:flex flex-col w-56 shrink-0 rounded-xl overflow-hidden" style={{ backgroundColor: BG_DARK }}>
              <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ backgroundColor: BG_CARD }}>
                <div className="flex items-center gap-2">
                  <List className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                  <span className="font-bold text-sm text-white/80">Lessons</span>
                </div>
                <button
                  onClick={() => setDesktopSidebarCollapsed(true)}
                  className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  title="Collapse"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
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
          )}

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

                {/* Board (sticky on wide screens) + lesson content side by side */}
                {lesson && usingBeatPlayer ? (
                  // New unified beat player -- lesson has been migrated to
                  // the courses-redesign beats[] shape. Handles its own
                  // two-column layout internally.
                  <LessonBeatPlayer
                    key={lesson.id}
                    beats={(lesson as any).beats as LessonBeat[]}
                    lessonId={lesson.id}
                    isLastLesson={isLast}
                    onLessonComplete={() => handleMarkComplete(true)}
                  />
                ) : (
                  // Old system -- kept as a fallback for any lesson that
                  // hasn't gone through the beats migration yet (see
                  // scripts/migrate-lesson-beats.ts). Once every lesson is
                  // migrated, this branch (and LessonContentStepper /
                  // LessonBoardPlayer's old tab system) can be removed.
                  <div className="xl:grid xl:grid-cols-[1fr_520px] xl:gap-5 xl:items-start">
                    {/* Step-by-step lesson text with TTS — left column, scrolls independently at wide screens so the board never has to move */}
                    {lesson && lesson.content && (
                      <div
                        className="rounded-xl p-3 md:p-4 mt-2 md:mt-3 xl:mt-0 order-2 xl:order-1 xl:max-h-[85vh] xl:overflow-y-auto"
                        style={{ backgroundColor: BG_DARK }}
                      >
                        <LessonContentStepper
                          key={lesson.id}
                          content={lesson.content}
                          lessonId={lesson.id}
                          courseCategory={course?.category ?? ''}
                          conceptTitle={lesson.conceptTitle}
                          onStepChange={(stepText) => setShowFixLine(/##\s*The Fix/i.test(stepText))}
                          boardMoveText={boardMoveText}
                        />
                      </div>
                    )}

                    {/* Interactive board — right column at wide screens, kept at full natural size */}
                    {lesson && (
                      <div className="order-1 xl:order-2">
                        <LessonBoardPlayer
                          pgn={lesson.examplePgn || lesson.drillFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
                          fixPgn={lesson.fixExamplePgn ?? null}
                          showFixLine={showFixLine}
                          title={lesson.title}
                          positionRecap={(lesson as typeof lesson & { positionRecap?: string | null }).positionRecap ?? null}
                          courseCategory={course?.category ?? null}
                          onMoveTextChange={setBoardMoveText}
                          drillFen={lesson.drillFen ?? null}
                          drillExpectedMove={lesson.drillExpectedMove ?? null}
                          drillHint={lesson.drillHint ?? null}
                          content={lesson.content ?? null}
                          extraChallenges={lesson.extraChallenges ?? null}
                          conceptTitle={lesson.conceptTitle ?? null}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Navigation footer -- only for lessons still on the old
                    system; the new beat player has its own equivalent
                    controls built in, and duplicating both here would be
                    exactly the kind of redundant navigation this redesign
                    removes. */}
                {!usingBeatPlayer && (
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
                )}
              </motion.div>
            </AnimatePresence>

          </div>
        </div>
      )}

      <AnimatePresence>
        {redesign && usingBeatPlayer && lesson && !post && !introDone.includes(lesson.id) && (() => {
          // "What you'll learn" is built from the lesson's real parts, never invented
          const parts: IntroBullet[] = [];
          for (const b of ((lesson as any).beats ?? []) as LessonBeat[]) {
            const item: IntroBullet | null =
              b.kind === 'concept' ? { kind: 'concept', text: b.title || 'The core idea' }
              : b.kind === 'example' ? { kind: 'example', text: 'A real position from your own game' }
              : b.kind === 'drill' ? { kind: 'drill', text: 'Find the better move yourself' }
              : null;
            if (item && !parts.some((x) => x.text === item.text)) parts.push(item);
          }
          return (
            <LessonIntroScreen
              index={currentIdx}
              total={sortedLessons.length}
              title={lesson.title}
              subtitle={lesson.conceptTitle ?? course.category}
              artSrc={`${ART_BASE}${artFor({ id: course.id, category: course.category, title: course.title }).img}.webp`}
              bullets={parts}
              onStart={() => setIntroDone((d) => [...d, lesson.id])}
              onBack={() => setShowOverview(true)}
            />
          );
        })()}
        {redesign && post?.step === 'quiz' && post.quiz && (
          <LessonQuizScreen quiz={post.quiz} onContinue={() => setPost({ ...post, step: 'complete' })} />
        )}
        {redesign && post?.step === 'complete' && (
          <LessonCompleteScreen
            lessonTitle={sortedLessons[post.idx]?.title ?? ''}
            lessonsDone={Math.max(sortedLessons.filter(l => l.completed).length, course.completedLessons)}
            lessonsTotal={sortedLessons.length}
            hasNext={post.idx < sortedLessons.length - 1}
            onNext={() => { setCurrentIdx(post.idx + 1); setPost(null); }}
            onViewCourse={() => { setPost(null); setShowOverview(true); }}
            onShare={() => setShowCompletionShare(true)}
          />
        )}

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
                      username: username ?? 'A ChessScout.net user',
                      courseName: course?.title ?? 'a personalized course',
                      weaknessFixed: course?.category ?? 'a real weakness',
                      lessonsCompleted: course?.totalLessons ?? sortedLessons.length,
                    })}`;
                    const shareData = { title: 'I just completed a ChessScout.net course', url };
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
