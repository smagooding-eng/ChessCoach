// Beginner path -- one lesson: short explanation, then the exercises.

import { useState, useRef, type ReactNode } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Lightbulb, RotateCcw, ChevronRight, Check, X } from 'lucide-react';
import { L } from '@/components/learn/theme';
import { LearnBoard, fenItems } from '@/components/learn/LearnBoard';
import { StarRow } from '@/components/kids/KidsArt';
import { findLesson, type Lesson, type Unit } from '@/lib/learn/beginner';
import { useLearn, lessonUnlocked, lessonAfter } from '@/lib/learn/progress';
import { useExercise } from '@/lib/learn/useExercise';
import { starsFor, playSfxAlways } from '@/lib/kids/progress';
import type { Level, Occupant } from '@/lib/kids/levels';
import { moveArrows, type Arrow, type ArrowColor } from '@/lib/learn/explain';

export default function BeginnerLessonPlay() {
  const { unit: uid, lesson: lid } = useParams<{ unit: string; lesson: string }>();
  const { unit, lesson } = findLesson(uid ?? '', lid ?? '');
  const { state } = useLearn();

  if (!unit || !lesson || !lessonUnlocked(state, lesson.id)) {
    return (
      <Shell back="/admin/beginner">
        <p className="text-center mt-16 font-bold">This lesson is locked. Finish the one before it first.</p>
      </Shell>
    );
  }
  return <LessonFlow key={lesson.id} unit={unit} lesson={lesson} />;
}

function Shell({ children, back, title }: { children: ReactNode; back: string; title?: string }) {
  return (
    <div className="min-h-screen" style={{ background: L.bg, color: L.text }}>
      <div className="max-w-xl mx-auto px-4 pb-12" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3 py-2">
          <Link href={back} aria-label="Back" className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: L.card }}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {title && <p className="text-sm font-bold truncate" style={{ color: L.muted }}>{title}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

type Stage = { kind: 'intro' } | { kind: 'ex'; i: number } | { kind: 'done' };

function LessonFlow({ unit, lesson }: { unit: Unit; lesson: Lesson }) {
  const [stage, setStage] = useState<Stage>({ kind: 'intro' });
  const [round, setRound] = useState(0);
  const results = useRef<number[]>([]);
  const { award } = useLearn();
  const [, navigate] = useLocation();
  const n = lesson.exercises.length;
  const title = `${unit.title} · ${lesson.title}`;

  const finishExercise = (i: number, mistakes: number) => {
    results.current[i] = starsFor(mistakes);
  };
  const advance = (i: number) => {
    if (i + 1 < n) { setStage({ kind: 'ex', i: i + 1 }); setRound((r) => r + 1); }
    else {
      const avg = results.current.reduce((a, b) => a + b, 0) / Math.max(1, results.current.length);
      award(lesson.id, Math.max(1, Math.round(avg)));
      playSfxAlways('win');
      setStage({ kind: 'done' });
    }
  };

  const bar = (
    <div className="flex gap-1 mb-4" aria-label="Lesson progress">
      {[-1, ...lesson.exercises.map((_, i) => i)].map((i) => {
        const cur = stage.kind === 'intro' ? -1 : stage.kind === 'ex' ? stage.i : n;
        return <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < cur ? L.accent : i === cur ? `${L.accent}99` : 'rgba(255,255,255,0.08)' }} />;
      })}
    </div>
  );

  if (stage.kind === 'intro') {
    return (
      <Shell back="/admin/beginner" title={unit.title}>
        {bar}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-[28px] font-black leading-tight mb-3" style={{ letterSpacing: '-0.02em' }}>{lesson.title}</h1>
          <div className="space-y-3 mb-5">
            {lesson.intro.map((p, i) => <p key={i} className="text-[15px] leading-relaxed" style={{ color: '#cfccc8' }}>{p}</p>)}
          </div>
          {lesson.diagram && <Diagram {...lesson.diagram} />}
          <button type="button" onClick={() => setStage({ kind: 'ex', i: 0 })}
            className="mt-6 w-full rounded-xl py-3.5 font-black text-white flex items-center justify-center gap-2" style={{ background: L.accent }}>
            Start practice ({n} exercises) <ChevronRight className="w-5 h-5" />
          </button>
        </motion.div>
      </Shell>
    );
  }

  if (stage.kind === 'done') {
    const avg = results.current.reduce((a, b) => a + b, 0) / Math.max(1, results.current.length);
    const stars = Math.max(1, Math.round(avg));
    const next = lessonAfter(lesson.id);
    return (
      <Shell back="/admin/beginner" title={unit.title}>
        {bar}
        <motion.div className="rounded-2xl p-6 text-center mt-6" style={{ background: L.card, border: `1px solid ${L.line}` }}
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: L.muted }}>Lesson complete</p>
          <h2 className="text-2xl font-black mb-3">{lesson.title}</h2>
          <div className="flex justify-center mb-3"><StarRow n={stars} size={40} gap={6} /></div>
          <p className="text-sm mb-6" style={{ color: L.muted }}>
            {stars === 3 ? 'Clean run: no mistakes.' : stars === 2 ? 'Solid. A couple of slips along the way.' : 'Done. Run it again to lock it in.'}
          </p>
          <div className="flex flex-col gap-2">
            {next ? (
              <button type="button" onClick={() => navigate(`/admin/beginner/${next.unit.id}/${next.lesson.id}`)}
                className="rounded-xl py-3 font-black text-white" style={{ background: L.accent }}>
                Next: {next.lesson.title}
              </button>
            ) : (
              <button type="button" onClick={() => navigate('/admin/beginner')} className="rounded-xl py-3 font-black text-white" style={{ background: L.good }}>
                Path complete: back to the map
              </button>
            )}
            <button type="button" onClick={() => { results.current = []; setStage({ kind: 'intro' }); }}
              className="rounded-xl py-3 font-bold" style={{ background: L.card2 }}>Review this lesson</button>
            <Link href="/admin/beginner" className="rounded-xl py-3 font-bold" style={{ color: L.muted }}>Back to the path</Link>
          </div>
        </motion.div>
      </Shell>
    );
  }

  const ex = lesson.exercises[stage.i];
  return (
    <Shell back="/admin/beginner" title={title}>
      {bar}
      <Exercise key={`${ex.id}-${round}`} level={ex} index={stage.i} total={n}
        onSolved={(m) => finishExercise(stage.i, m)} onNext={() => advance(stage.i)} onRestart={() => setRound((r) => r + 1)} />
    </Shell>
  );
}

export function Diagram({ fen, highlight, moves, arrows }: { fen: string; highlight?: string[]; moves?: string; arrows?: { from: string; to: string; color?: ArrowColor }[] }) {
  const items = fenItems(fen);
  let all: Arrow[] = (arrows ?? []).map((a) => ({ from: a.from, to: a.to, color: a.color ?? 'info' }));
  if (moves) {
    const p = items.find((i) => i.sq === moves)?.piece;
    if (p) {
      const at = (sq: string): Occupant => {
        const o = items.find((i) => i.sq === sq)?.piece;
        return !o ? 'empty' : o.side === p.side ? 'friend' : 'enemy';
      };
      all = [...all, ...moveArrows(p.type, p.side, moves, at, 'info')];
    }
  }
  return <LearnBoard items={items} highlight={new Set(highlight ?? [])} arrows={all} />;
}

export function Exercise({ level, index, total, onSolved, onNext, onRestart }:
  { level: Level; index: number; total: number; onSolved: (mistakes: number) => void; onNext: () => void; onRestart: () => void }) {
  const ex = useExercise(level, onSolved);
  const toneColor = ex.msg.tone === 'good' ? L.good : ex.msg.tone === 'oops' ? L.warn : L.accent;

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: L.muted }}>Exercise {index + 1} of {total}</p>
      <h2 className="text-xl font-black mb-3">{level.title}</h2>

      <AnimatePresence mode="wait">
        <motion.div key={ex.msg.text} className="rounded-xl px-4 py-3 mb-4 text-[15px] leading-snug font-medium"
          style={{ background: `${toneColor}14`, borderLeft: `4px solid ${toneColor}` }}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {ex.msg.text}
        </motion.div>
      </AnimatePresence>

      {ex.rule && (
        <p className="text-xs font-semibold mb-3 -mt-1 px-1" style={{ color: L.muted }}>{ex.rule}</p>
      )}

      {level.kind === 'quiz' ? (
        <div>
          {level.fen && <div className="mb-4"><Diagram fen={level.fen} /></div>}
          <p className="text-lg font-bold mb-3">{level.question}</p>
          <div className="space-y-2">
            {(level.options ?? []).map((o, i) => {
              const chosen = ex.picked === i;
              const right = ex.solved && i === level.correct;
              const wrong = chosen && i !== level.correct;
              return (
                <motion.button key={i} type="button" onClick={() => ex.answerQuiz(i)} disabled={ex.solved}
                  animate={wrong ? { x: [0, -6, 6, -4, 4, 0] } : {}} transition={{ duration: 0.35 }}
                  className="w-full text-left rounded-xl px-4 py-3 font-semibold flex items-center gap-3"
                  style={{ background: right ? `${L.good}22` : wrong ? `${L.bad}1c` : L.card, border: `1px solid ${right ? L.good : wrong ? L.bad : L.line}` }}>
                  <span className="flex-1">{o}</span>
                  {right && <Check className="w-5 h-5" style={{ color: L.good }} />}
                  {wrong && <X className="w-5 h-5" style={{ color: L.bad }} />}
                </motion.button>
              );
            })}
          </div>
        </div>
      ) : (
        <LearnBoard {...ex.board} />
      )}

      <div className="mt-4 flex items-center gap-2">
        {level.kind === 'tapAll' || level.kind === 'tapLegal' || level.kind === 'tapSquare' ? (
          <div className="flex-1 text-sm font-bold" style={{ color: L.muted }}>{ex.progress.found} of {ex.progress.total} found</div>
        ) : level.kind === 'collect' ? (
          <div className="flex-1 text-sm font-bold" style={{ color: L.muted }}>{ex.progress.left} left · {ex.moves} {ex.moves === 1 ? 'move' : 'moves'}</div>
        ) : <div className="flex-1" />}
        {level.kind !== 'quiz' && level.kind !== 'collect' && level.kind !== 'check' && !ex.solved && (
          <button type="button" onClick={ex.hint} aria-label="Hint" className="h-10 px-3 rounded-xl flex items-center gap-1.5 text-sm font-bold" style={{ background: L.card, color: L.warn }}>
            <Lightbulb className="w-4 h-4" /> Hint
          </button>
        )}
        {level.kind !== 'quiz' && !ex.solved && (
          <button type="button" onClick={onRestart} aria-label="Restart exercise" className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: L.card }}>
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {ex.solved && (
          <motion.button type="button" onClick={onNext}
            className="mt-4 w-full rounded-xl py-3.5 font-black text-white flex items-center justify-center gap-2" style={{ background: L.good }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {index + 1 < total ? 'Continue' : 'Finish lesson'} <ChevronRight className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
