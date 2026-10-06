import React, { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Chess } from 'chess.js';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Swords, Target, Trophy, XCircle } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { RD } from '@/lib/redesignTheme';

// Post-lesson screens for the redesign: a quick check, then a completion
// screen. Both use only real lesson data. There is no XP system in the app,
// so no XP is shown anywhere.

const normSan = (s: string) => s.replace(/[+#!?]/g, '');
const placement = (fen: string) => fen.split(' ').slice(0, 2).join(' ');

export interface QuizMoves { fen: string; played: string; best: string }

// The quick check compares the move the player actually made in their game
// (found by replaying the lesson's example PGN to the drill position) with
// the engine's best move for that same position. Returns null -- and the
// quiz is skipped -- unless both moves are verified legal and different.
export function findQuizMoves(
  examplePgn: string | null | undefined,
  drillFen: string | null | undefined,
  expectedMove: string | null | undefined,
): QuizMoves | null {
  if (!examplePgn || !drillFen || !expectedMove) return null;
  try {
    const replay = new Chess();
    replay.loadPgn(examplePgn, { strict: false });
    const target = placement(drillFen);
    const hit = replay.history({ verbose: true }).find((m) => placement(m.before) === target);
    if (!hit) return null;
    const best = expectedMove.trim();
    if (normSan(hit.san) === normSan(best)) return null;

    // Both must be legal in the drill position, exactly as written
    const t1 = new Chess(drillFen);
    const t2 = new Chess(drillFen);
    const bestMove = t1.move(best);
    const playedMove = t2.move(hit.san);
    if (!bestMove || !playedMove) return null;
    return { fen: drillFen, played: playedMove.san, best: bestMove.san };
  } catch {
    return null;
  }
}

export function LessonQuizScreen({ quiz, onContinue }: { quiz: QuizMoves; onContinue: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const flipped = quiz.fen.split(' ')[1] === 'b';

  // Stable but not always-the-same-side answer order
  const options = useMemo(() => {
    const seed = quiz.fen.split('').reduce((n, ch) => n + ch.charCodeAt(0), 0);
    return seed % 2 ? [quiz.best, quiz.played] : [quiz.played, quiz.best];
  }, [quiz]);

  const arrows = useMemo(() => {
    if (!picked) return undefined;
    const out: Array<{ from: string; to: string; color?: string }> = [];
    try {
      const b = new Chess(quiz.fen).move(quiz.best);
      if (b) out.push({ from: b.from, to: b.to, color: '#8BEA45' });
      const p = new Chess(quiz.fen).move(quiz.played);
      if (p) out.push({ from: p.from, to: p.to, color: '#FF5058' });
    } catch { /* arrows are optional */ }
    return out;
  }, [picked, quiz]);

  const correct = picked === quiz.best;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="relative flex items-center justify-center py-2.5">
          <button onClick={onContinue} aria-label="Skip the quick check" className="absolute left-0 grid h-10 w-10 place-items-center rounded-full" style={{ color: RD.text }}><ArrowLeft size={22} /></button>
          <b className="text-[16px]">Quick Check</b>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.12)' }}><div className="h-full rounded-full" style={{ width: picked ? '100%' : '85%', background: RD.green }} /></div>
        <p className="text-[11px] font-extrabold uppercase tracking-[.16em]" style={{ color: RD.green }}>Your turn</p>
        <h2 className="mt-1 text-[24px] font-extrabold leading-tight">Which move is better here?</h2>
        <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>
          One of these is the move from your game. The other is the engine&apos;s choice for this position.
        </p>

        <div className="mt-4 overflow-hidden rounded-[18px]" style={{ border: `1px solid ${RD.border}` }}>
          <ChessBoard fen={quiz.fen} flipped={flipped} practiceMode={false} arrows={arrows} />
        </div>

        <div className="mt-4 grid gap-2.5">
          {options.map((san, i) => {
            const isBest = san === quiz.best;
            const state = !picked ? 'idle' : isBest ? 'right' : picked === san ? 'wrong' : 'dim';
            return (
              <button
                key={san}
                onClick={() => !picked && setPicked(san)}
                disabled={!!picked}
                className="flex w-full items-center gap-3.5 rounded-[14px] px-4 py-3.5 text-left transition-colors"
                style={{
                  background: state === 'right' ? 'rgba(139,234,69,.10)' : state === 'wrong' ? 'rgba(255,80,88,.10)' : RD.cardSolid,
                  border: `1.5px solid ${state === 'right' ? RD.green : state === 'wrong' ? RD.red : RD.border}`,
                  opacity: state === 'dim' ? 0.5 : 1,
                }}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-extrabold" style={{ background: 'rgba(255,255,255,.07)', color: state === 'right' ? RD.green : RD.text }}>{String.fromCharCode(65 + i)}</span>
                <b className="flex-1 text-[18px] font-extrabold">{san}</b>
                {state === 'right' && <CheckCircle2 size={20} style={{ color: RD.green }} aria-label="Correct" />}
                {state === 'wrong' && <XCircle size={20} style={{ color: RD.red }} aria-label="Incorrect" />}
              </button>
            );
          })}
        </div>

        {picked && (
          <div className="mt-4 rounded-[16px] p-4 text-[13.5px] leading-relaxed" style={{ background: correct ? 'rgba(139,234,69,.07)' : 'rgba(255,80,88,.07)', border: `1px solid ${correct ? 'rgba(139,234,69,.3)' : 'rgba(255,80,88,.3)'}` }}>
            <b style={{ color: correct ? RD.green : '#FF8A8F' }}>{correct ? 'Correct!' : 'Not quite.'}</b>{' '}
            {correct
              ? <>{quiz.best} is the stronger move. In your game you played {quiz.played}.</>
              : <>{quiz.best} was the stronger move. {quiz.played} is what you played in your game.</>}
            <span className="mt-1 block text-[12px]" style={{ color: RD.muted }}>Green arrow: engine move. Red arrow: the move from your game.</span>
          </div>
        )}

        <button
          onClick={onContinue}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-extrabold"
          style={picked
            ? { background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A' }
            : { background: 'transparent', color: RD.muted, border: `1px solid ${RD.border}` }}
        >
          {picked ? 'Continue' : 'Skip'} <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}

export function LessonCompleteScreen({
  lessonTitle, lessonsDone, lessonsTotal, hasNext, onNext, onViewCourse, onShare,
}: {
  lessonTitle: string;
  lessonsDone: number;
  lessonsTotal: number;
  hasNext: boolean;
  onNext: () => void;
  onViewCourse: () => void;
  onShare?: () => void;
}) {
  const pct = lessonsTotal > 0 ? Math.round((lessonsDone / lessonsTotal) * 100) : 0;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: RD.bg, color: RD.text }}>
      <div className="relative">
        <img src={`${import.meta.env.BASE_URL}assets/courses/course-tactical.webp`} alt="" className="absolute inset-0 h-[300px] w-full object-cover" />
        <div className="absolute inset-0 h-[300px]" style={{ background: 'linear-gradient(180deg, rgba(5,10,11,.55) 0%, #050A0B 100%)' }} />
        <div className="relative mx-auto w-full max-w-[520px] px-4 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] text-center">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full" style={{ background: 'rgba(232,180,71,.14)', border: '1px solid rgba(232,180,71,.45)', boxShadow: '0 0 60px rgba(232,180,71,.35)' }}>
            <Trophy size={46} style={{ color: RD.gold }} />
          </div>
          <h1 className="mt-6 text-[30px] font-extrabold tracking-tight">{hasNext ? 'Lesson Complete!' : 'Course Complete!'}</h1>
          <p className="mt-2 text-[14px]" style={{ color: 'rgba(245,247,246,.8)' }}>
            {hasNext ? <>Great work — you finished <b>{lessonTitle}</b>.</> : <>You&apos;ve finished every lesson, including <b>{lessonTitle}</b>.</>}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] py-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
              <b className="block text-[24px] font-extrabold leading-none">{lessonsDone}/{lessonsTotal}</b>
              <span className="mt-1.5 block text-[11.5px]" style={{ color: RD.muted }}>Lessons</span>
            </div>
            <div className="rounded-[16px] py-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
              <b className="block text-[24px] font-extrabold leading-none" style={{ color: RD.green }}>{pct}%</b>
              <span className="mt-1.5 block text-[11.5px]" style={{ color: RD.muted }}>Course progress</span>
            </div>
          </div>

          {hasNext ? (
            <button onClick={onNext} className="mt-6 flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-extrabold" style={{ background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A', boxShadow: '0 12px 28px -12px rgba(139,234,69,.6)' }}>
              Next Lesson <ArrowRight size={17} />
            </button>
          ) : (
            <>
              {onShare && (
                <button onClick={onShare} className="mt-6 flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-extrabold" style={{ background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A' }}>
                  Share your progress
                </button>
              )}
              <Link href="/courses" className="mt-3 flex w-full items-center justify-center rounded-[14px] py-3.5 text-[15px] font-bold" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}`, color: RD.text }}>
                Back to Courses
              </Link>
            </>
          )}
          {hasNext && (
            <button onClick={onViewCourse} className="mt-3 w-full rounded-[14px] py-3.5 text-[15px] font-bold" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}`, color: RD.text }}>
              View Course
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Lesson intro (mockup "Lesson Intro"): top bar + progress, hero art with the
// lesson title, a "What you'll learn" list, and one clear start button. The
// list is built by the caller from the lesson's real parts (never invented),
// and no estimated time is shown because lessons don't store one.
export interface IntroBullet { kind: 'concept' | 'example' | 'drill' | 'other'; text: string }

export function LessonIntroScreen({
  index, total, title, subtitle, artSrc, bullets, onStart, onBack,
}: {
  index: number;
  total: number;
  title: string;
  subtitle?: string | null;
  artSrc: string;
  bullets: IntroBullet[];
  onStart: () => void;
  onBack: () => void;
}) {
  const icon = (k: IntroBullet['kind']) =>
    k === 'concept' ? <BookOpen size={16} style={{ color: RD.gold }} />
    : k === 'example' ? <Target size={16} style={{ color: '#FF9A4D' }} />
    : k === 'drill' ? <Swords size={16} style={{ color: RD.green }} />
    : <CheckCircle2 size={16} style={{ color: RD.green }} />;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="relative flex items-center justify-center py-2.5">
          <button onClick={onBack} aria-label="Back to course overview" className="absolute left-0 grid h-10 w-10 place-items-center rounded-full" style={{ color: RD.text }}><ArrowLeft size={22} /></button>
          <b className="text-[16px]">Lesson {index + 1} of {total}</b>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.12)' }}>
          <div className="h-full rounded-full" style={{ width: `${total ? ((index + 1) / total) * 100 : 0}%`, background: RD.green }} />
        </div>

        <div className="relative mt-4 h-[210px] overflow-hidden rounded-[22px]" style={{ border: `1px solid ${RD.border}` }}>
          <img src={artSrc} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,10,11,0) 55%, rgba(5,10,11,.55) 100%)' }} />
        </div>

        <h1 className="mt-4 text-[32px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15.5px] leading-snug" style={{ color: 'rgba(245,247,246,.82)' }}>{subtitle}</p>}

        {bullets.length > 0 && (
          <section className="mt-4 rounded-[20px] p-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
            <h2 className="text-[19px] font-extrabold">What you&apos;ll learn</h2>
            <ul className="mt-3 grid gap-3">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-center gap-3 text-[14.5px]" style={{ color: 'rgba(245,247,246,.9)' }}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(255,255,255,.07)' }}>{icon(b.kind)}</span>
                  {b.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <button onClick={onStart} className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-[14px] py-4 text-[16px] font-extrabold"
          style={{ background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A', boxShadow: '0 14px 30px -14px rgba(139,234,69,.65)' }}>
          Start Lesson <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
