import React, { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Chess } from 'chess.js';
import { ArrowRight, CheckCircle2, Trophy, XCircle } from 'lucide-react';
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
      <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-extrabold uppercase tracking-[.16em]" style={{ color: RD.green }}>Quick check</p>
        <h2 className="mt-1 text-[24px] font-extrabold leading-tight">Which move is better here?</h2>
        <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>
          One of these is the move from your game. The other is the engine&apos;s choice for this position.
        </p>

        <div className="mt-4 overflow-hidden rounded-[18px]" style={{ border: `1px solid ${RD.border}` }}>
          <ChessBoard fen={quiz.fen} flipped={flipped} practiceMode={false} arrows={arrows} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {options.map((san, i) => {
            const isBest = san === quiz.best;
            const state = !picked ? 'idle' : isBest ? 'right' : picked === san ? 'wrong' : 'dim';
            return (
              <button
                key={san}
                onClick={() => !picked && setPicked(san)}
                disabled={!!picked}
                className="flex items-center justify-center gap-2 rounded-[14px] py-4 text-[17px] font-extrabold transition-colors"
                style={{
                  background: state === 'right' ? 'rgba(139,234,69,.12)' : state === 'wrong' ? 'rgba(255,80,88,.12)' : RD.cardSolid,
                  border: `1.5px solid ${state === 'right' ? RD.green : state === 'wrong' ? RD.red : RD.border}`,
                  opacity: state === 'dim' ? 0.5 : 1,
                }}
              >
                <span style={{ color: RD.muted }}>{String.fromCharCode(65 + i)}.</span> {san}
                {state === 'right' && <CheckCircle2 size={18} style={{ color: RD.green }} aria-label="Correct" />}
                {state === 'wrong' && <XCircle size={18} style={{ color: RD.red }} aria-label="Incorrect" />}
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
