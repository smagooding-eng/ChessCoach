import React, { useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, Target, Trophy, X, AlertCircle } from 'lucide-react';
import { useCourseDetail } from '@/hooks/use-courses';
import { RD } from '@/lib/redesignTheme';

// "Your Training Plan" (redesign). Everything here is derived from the
// player's real course progress -- nothing is invented:
//  - Next Move: the in-progress course closest to done (else the first
//    unfinished one), with its real current lesson from the course detail.
//  - Stats: sums over the real completed/total lesson counts.
//  - Priorities: the player's courses grouped by category (courses are
//    generated from their detected weaknesses), progress = lessons done.
//  - No "estimated time" is shown because courses don't store one, and
//    there's no XP system, so no XP is shown anywhere.
export interface CourseLike {
  id: number;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  totalLessons: number;
  completedLessons: number;
}

export type Art = { img: string; accent: string; icon: React.ElementType };
export const ART_BASE = `${import.meta.env.BASE_URL}assets/courses/`;

export function artFor(c: { id: number; category: string; title: string }): Art {
  const t = `${c.category} ${c.title}`.toLowerCase();
  if (/discover/.test(t)) return { img: 'course-discovered', accent: RD.gold, icon: Target };
  if (/tactic|fork|pin|skewer|combin|attack|blunder|calculation/.test(t)) return { img: 'course-tactical', accent: RD.gold, icon: Target };
  if (/open/.test(t)) return { img: 'course-opening', accent: '#35C6F4', icon: BookOpen };
  if (/endgame|end game|conversion|rook|pawn ending/.test(t)) return { img: 'course-endgame', accent: '#A98BFF', icon: Trophy };
  const pool = ['course-library', 'course-training-hero', 'course-opening', 'course-tactical'];
  return { img: pool[c.id % pool.length], accent: RD.green, icon: GraduationCap };
}

const DIFF_STYLE: Record<string, { bg: string; fg: string }> = {
  Beginner: { bg: 'rgba(139,234,69,.16)', fg: RD.green },
  Intermediate: { bg: 'rgba(53,198,244,.16)', fg: '#5FD3F7' },
  Advanced: { bg: 'rgba(169,139,255,.18)', fg: '#BBA4FF' },
};

const pctOf = (c: { completedLessons: number; totalLessons: number }) =>
  c.totalLessons > 0 ? Math.round((c.completedLessons / c.totalLessons) * 100) : 0;

function Bar({ value, color = RD.green }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.10)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(value, value > 0 ? 3 : 0)}%`, background: color }} />
    </div>
  );
}

export function CoursesRedesign({
  courses, isGenerating, genError, onGenerate, onArchive,
}: {
  courses: CourseLike[];
  isGenerating: boolean;
  genError: string | null;
  onGenerate: () => void;
  onArchive: (id: number) => void;
}) {
  const [tab, setTab] = useState<'all' | 'progress' | 'done'>('all');

  const inProgress = courses
    .filter((c) => c.totalLessons > 0 && c.completedLessons > 0 && c.completedLessons < c.totalLessons)
    .sort((a, b) => pctOf(b) - pctOf(a));
  const nextCourse = inProgress[0] ?? courses.find((c) => c.completedLessons < c.totalLessons) ?? null;

  // Only fetched when there's a course to show (the hook is disabled for id 0)
  const { data: detail } = useCourseDetail(nextCourse?.id ?? 0);
  const sorted = [...(detail?.lessons ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const currentLesson = sorted.find((l) => !l.completed) ?? null;

  const lessonsDone = courses.reduce((n, c) => n + c.completedLessons, 0);
  const lessonsTotal = courses.reduce((n, c) => n + c.totalLessons, 0);
  const started = courses.filter((c) => c.completedLessons > 0).length;
  const overall = lessonsTotal > 0 ? Math.round((lessonsDone / lessonsTotal) * 100) : 0;

  const byCategory = Object.values(
    courses.reduce<Record<string, { name: string; done: number; total: number; probe: CourseLike }>>((acc, c) => {
      const g = (acc[c.category] ??= { name: c.category, done: 0, total: 0, probe: c });
      g.done += c.completedLessons;
      g.total += c.totalLessons;
      return acc;
    }, {}),
  )
    .filter((g) => g.total > 0)
    .sort((a, b) => (b.total - b.done) - (a.total - a.done))
    .slice(0, 4);

  const visible = courses.filter((c) => {
    const p = pctOf(c);
    if (tab === 'progress') return p > 0 && p < 100;
    if (tab === 'done') return p === 100;
    return true;
  });

  const nextArt = nextCourse ? artFor(nextCourse) : null;

  return (
    <div className="-m-4 min-h-screen px-3 pt-3 md:-m-6 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid w-full max-w-[860px] gap-4">
        <div className="px-1">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Your Training Plan</h1>
          <p className="mt-1 text-[13.5px]" style={{ color: RD.muted }}>Built from your games. Focus on what will improve your rating the fastest.</p>
        </div>

        {/* YOUR NEXT MOVE */}
        {nextCourse && nextArt && (
          <section className="relative overflow-hidden rounded-[22px]" style={{ border: `1px solid ${RD.green}`, boxShadow: '0 0 0 1px rgba(139,234,69,.25), 0 18px 50px -20px rgba(139,234,69,.35)' }}>
            <img src={`${ART_BASE}course-training-hero.webp`} alt="" loading="eager" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '80% center' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.96) 0%, rgba(5,10,11,.82) 45%, rgba(5,10,11,.15) 100%)' }} />
            <div className="relative z-10 p-5 md:p-7">
              <p className="text-[11px] font-extrabold uppercase tracking-[.16em]" style={{ color: RD.green }}>Your next move</p>
              <h2 className="mt-1.5 max-w-[70%] text-[24px] font-extrabold leading-tight md:text-[30px]">{nextCourse.title}</h2>
              <p className="mt-1 max-w-[70%] text-[13px]" style={{ color: 'rgba(245,247,246,.78)' }}>
                Lesson {Math.min(nextCourse.completedLessons + 1, nextCourse.totalLessons)} of {nextCourse.totalLessons}
                {currentLesson ? <><br />{currentLesson.title}</> : null}
              </p>
              <div className="mt-3 max-w-[70%]"><Bar value={pctOf(nextCourse)} /></div>
              <Link href={`/courses/${nextCourse.id}`} className="mt-4 inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-[14px] font-extrabold" style={{ background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A', boxShadow: '0 10px 26px -10px rgba(139,234,69,.6)' }}>
                Continue Training <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        )}

        {/* Stats */}
        {courses.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { v: lessonsDone, l: 'Lessons completed' },
              { v: started, l: 'Courses started' },
              { v: `${overall}%`, l: 'Training progress' },
            ].map((s) => (
              <div key={s.l} className="rounded-[16px] px-3 py-3.5 text-center" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                <b className="block text-[24px] font-extrabold leading-none">{s.v}</b>
                <span className="mt-1.5 block text-[11px]" style={{ color: RD.muted }}>{s.l}</span>
              </div>
            ))}
          </div>
        )}

        {/* Priorities */}
        {byCategory.length > 0 && (
          <section className="grid gap-2.5">
            <div className="px-1">
              <h2 className="text-[19px] font-extrabold">Your Priorities</h2>
              <p className="text-[12.5px]" style={{ color: RD.muted }}>From the weaknesses found in your games.</p>
            </div>
            {byCategory.map((g) => {
              const a = artFor({ id: g.probe.id, category: g.name, title: g.probe.title });
              const p = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0;
              const left = g.total - g.done;
              return (
                <div key={g.name} className="flex items-center gap-3.5 rounded-[18px] p-3.5" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px]" style={{ background: `${a.accent}22`, color: a.accent, border: `1px solid ${a.accent}44` }}>
                    <a.icon size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <b className="truncate text-[15px] font-bold">{g.name}</b>
                      <b className="text-[15px] font-extrabold">{p}%</b>
                    </div>
                    <div className="my-1.5"><Bar value={p} color={a.accent === RD.gold ? RD.green : a.accent} /></div>
                    <span className="text-[11.5px]" style={{ color: RD.muted }}>{left} lesson{left === 1 ? '' : 's'} ready</span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* All courses */}
        <section className="grid gap-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="text-[19px] font-extrabold">All Courses</h2>
              <p className="text-[12.5px]" style={{ color: RD.muted }}>Build the skills that matter most.</p>
            </div>
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="flex shrink-0 items-center gap-2 rounded-[12px] px-3.5 py-2.5 text-[12.5px] font-extrabold transition-opacity disabled:opacity-60"
              style={{ background: 'rgba(139,234,69,.10)', color: RD.green, border: `1px solid ${RD.green}` }}
            >
              {isGenerating ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2" style={{ borderColor: RD.green, borderTopColor: 'transparent' }} />Building…</> : <><GraduationCap size={15} />New courses</>}
            </button>
          </div>

          {genError && (
            <div className="flex items-center gap-2 rounded-[14px] p-3 text-[13px]" style={{ background: 'rgba(255,80,88,.10)', border: '1px solid rgba(255,80,88,.30)', color: '#FF9DA2' }}>
              <AlertCircle size={16} className="shrink-0" /> {genError}
            </div>
          )}

          {courses.length > 0 && (
            <div className="flex items-center gap-1 rounded-[14px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
              {([['all', 'Courses'], ['progress', 'In Progress'], ['done', 'Completed']] as const).map(([id, label]) => {
                const active = tab === id;
                return (
                  <button key={id} onClick={() => setTab(id)} className="flex-1 rounded-[10px] py-2 text-[12.5px] font-bold transition-colors"
                    style={active ? { background: 'rgba(139,234,69,.10)', color: RD.green, boxShadow: `inset 0 0 0 1px ${RD.green}` } : { background: 'transparent', color: RD.muted }}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {isGenerating && (
            <div className="rounded-[20px] px-6 py-10 text-center" style={{ background: RD.card, border: `1px dashed ${RD.green}` }}>
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4" style={{ borderColor: RD.green, borderTopColor: 'transparent' }} />
              <b className="text-[16px]">Generating your courses…</b>
              <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>Analysing your weaknesses and building lessons from your own games. This usually takes 1–2 minutes.</p>
            </div>
          )}

          {courses.length === 0 && !isGenerating && (
            <div className="rounded-[20px] px-6 py-12 text-center" style={{ background: RD.card, border: `1px dashed ${RD.border}` }}>
              <BookOpen className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <b className="text-[17px]">No courses yet</b>
              <p className="mx-auto mt-1 max-w-sm text-[13px]" style={{ color: RD.muted }}>Run a deep analysis and generate courses tailored to your weak spots.</p>
              <button onClick={onGenerate} className="mt-5 rounded-[12px] px-5 py-3 text-[14px] font-extrabold" style={{ background: RD.green, color: '#05100A' }}>Generate now</button>
            </div>
          )}

          {courses.length > 0 && visible.length === 0 && !isGenerating && (
            <div className="rounded-[20px] px-6 py-10 text-center text-[13px]" style={{ background: RD.card, border: `1px solid ${RD.border}`, color: RD.muted }}>Nothing here yet.</div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((c) => {
              const a = artFor(c);
              const p = pctOf(c);
              const done = p === 100;
              const diff = DIFF_STYLE[c.difficulty] ?? { bg: 'rgba(255,255,255,.10)', fg: RD.muted };
              return (
                <article key={c.id} className="relative overflow-hidden rounded-[20px]" style={{ border: `1px solid ${RD.border}` }}>
                  <img src={`${ART_BASE}${a.img}.webp`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,10,11,.55) 0%, rgba(5,10,11,.92) 62%)' }} />
                  <div className="relative z-10 flex min-h-[210px] flex-col p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md px-2 py-1 text-[10.5px] font-extrabold" style={{ background: 'rgba(0,0,0,.45)', color: RD.text, border: `1px solid ${RD.border}` }}>{c.category}</span>
                      <span className="rounded-md px-2 py-1 text-[10.5px] font-extrabold" style={{ background: diff.bg, color: diff.fg }}>{c.difficulty}</span>
                    </div>
                    <h3 className="mt-3 text-[18px] font-extrabold leading-snug">{c.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[12.5px]" style={{ color: 'rgba(245,247,246,.72)' }}>{c.description}</p>
                    <div className="mt-auto pt-4">
                      <div className="mb-1.5 flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-1" style={{ color: done ? RD.green : RD.muted }}>
                          {done && <CheckCircle2 size={13} />}{c.completedLessons} / {c.totalLessons} lessons
                        </span>
                        <b style={{ color: RD.green }}>{p}%</b>
                      </div>
                      <Bar value={p} />
                      <div className="mt-3 flex gap-2">
                        <Link href={`/courses/${c.id}`} className="flex flex-1 items-center justify-center gap-2 rounded-[12px] py-2.5 text-[13.5px] font-extrabold"
                          style={done ? { background: 'rgba(255,255,255,.08)', color: RD.text, border: `1px solid ${RD.border}` } : { background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A' }}>
                          {done ? 'Review course' : p > 0 ? 'Continue' : 'Start'}{!done && <ArrowRight size={15} />}
                        </Link>
                        <button onClick={() => onArchive(c.id)} title="Clear this course" aria-label={`Clear course ${c.title}`} className="grid w-11 place-items-center rounded-[12px]" style={{ background: 'rgba(0,0,0,.4)', border: `1px solid ${RD.border}`, color: RD.muted }}>
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
