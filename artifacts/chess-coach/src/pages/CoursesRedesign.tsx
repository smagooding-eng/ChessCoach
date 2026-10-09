import React, { useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, Play, Target, Trophy, X, AlertCircle } from 'lucide-react';
import { useCourseDetail } from '@/hooks/use-courses';
import { RD } from '@/lib/redesignTheme';
import { useSiteImg } from '@/hooks/use-app-config';

// Courses (redesign): "Your Training Plan" -- next-move hero, flat stat
// columns, priority rows, a recommended-course card and compact course rows,
// as in the course mockups. Everything is derived from the player's real
// course progress; nothing is invented. Estimated durations and XP are not
// shown because courses don't store them.
export interface CourseLike {
  id: number;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  totalLessons: number;
  completedLessons: number;
}

export type Art = { img: string; accent: string; tile: string; bar: string; icon: React.ElementType };
export const ART_BASE = `${import.meta.env.BASE_URL}assets/courses/`;

export function artFor(c: { id: number; category: string; title: string }): Art {
  const t = `${c.category} ${c.title}`.toLowerCase();
  if (/discover/.test(t)) return { img: 'course-discovered', accent: RD.gold, tile: '#E0454F', bar: RD.green, icon: Target };
  if (/tactic|fork|pin|skewer|combin|attack|blunder|calculation/.test(t)) return { img: 'course-tactical', accent: RD.gold, tile: '#E0454F', bar: RD.green, icon: Target };
  if (/open/.test(t)) return { img: 'course-opening', accent: '#35C6F4', tile: '#3B82F6', bar: '#3B82F6', icon: BookOpen };
  if (/endgame|end game|conversion|rook|pawn ending/.test(t)) return { img: 'course-endgame', accent: '#A98BFF', tile: '#A855F7', bar: '#A855F7', icon: Trophy };
  const pool = ['course-library', 'course-training-hero', 'course-opening', 'course-tactical'];
  return { img: pool[c.id % pool.length], accent: RD.green, tile: RD.green, bar: RD.green, icon: GraduationCap };
}

// Every course picture, for lists that should not show the same one twice in a row.
export const ART_POOL = ['course-library', 'course-training-hero', 'course-opening', 'course-tactical', 'course-discovered', 'course-endgame'];

// Pictures for a list of courses, top to bottom: each keeps its own art unless
// one of the two rows above already used it, then it moves to the next free one.
export function distinctArtImgs(list: { id: number; category: string; title: string }[]): string[] {
  const recent: string[] = [];
  return list.map((c) => {
    let img = artFor(c).img;
    let i = ART_POOL.indexOf(img);
    for (let t = 0; t < ART_POOL.length && recent.includes(img); t++) { i = (i + 1) % ART_POOL.length; img = ART_POOL[i]; }
    recent.push(img);
    if (recent.length > 2) recent.shift();
    return img;
  });
}

// Small per-lesson thumbnails inside one course: start with the course's own
// art, then rotate through the others so neighbouring lessons never match.
// With real photos on there are more pictures to rotate through.
export function lessonThumbSrc(i: number, courseImg: string, photo: boolean): string {
  const courses = [courseImg, ...ART_POOL.filter((x) => x !== courseImg)].map((x) => `${ART_BASE}${x}.webp`);
  const pool = photo
    ? [...courses, ...Array.from({ length: 12 }, (_, k) => `${import.meta.env.BASE_URL}assets/openings/thumb-${k}.webp`)]
    : courses;
  return pool[i % pool.length];
}

const DIFF_DOT: Record<string, string> = { Beginner: RD.green, Intermediate: '#35C6F4', Advanced: '#A98BFF' };

const pctOf = (c: { completedLessons: number; totalLessons: number }) =>
  c.totalLessons > 0 ? Math.round((c.completedLessons / c.totalLessons) * 100) : 0;

function Bar({ value, color = RD.green, h = 6 }: { value: number; color?: string; h?: number }) {
  return (
    <div className="overflow-hidden rounded-full" style={{ height: h, background: 'rgba(255,255,255,.12)' }}>
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
  const siteImg = useSiteImg();
  const [tab, setTab] = useState<'all' | 'progress'>('all');

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

  const visible = courses.filter((c) => (tab === 'progress' ? c.completedLessons > 0 : true));
  const visibleImgs = distinctArtImgs(visible);
  const recommended = nextCourse ?? courses[0] ?? null;
  const card = { background: RD.card, border: `1px solid ${RD.border}` } as const;

  return (
    <div className="min-h-screen px-3 pt-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid grid-cols-1 w-full max-w-[600px] gap-5 lg:max-w-[1100px]">
        <div className="px-1">
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">Your Training Plan</h1>
          <p className="mt-1.5 text-[15px] leading-snug" style={{ color: 'rgba(245,247,246,.82)' }}>Built from your games. Focus on what will improve your rating the fastest.</p>
        </div>

        {/* YOUR NEXT MOVE */}
        {nextCourse && (
          <section className="relative overflow-hidden rounded-[22px]" style={{ border: `1.5px solid ${RD.green}`, boxShadow: '0 0 0 1px rgba(129,182,76,.18), 0 18px 50px -22px rgba(129,182,76,.5)' }}>
            <img src={siteImg(`${ART_BASE}course-training-hero.webp`)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '82% center' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.94) 0%, rgba(5,10,11,.78) 48%, rgba(5,10,11,.05) 100%)' }} />
            <div className="relative z-10 p-5">
              <p className="text-[12px] font-extrabold uppercase tracking-[.18em]" style={{ color: '#D9C46A' }}>Your next move</p>
              <h2 className="mt-2 max-w-[68%] text-[26px] font-extrabold leading-tight">{nextCourse.title}</h2>
              <p className="mt-1.5 max-w-[68%] text-[14px] leading-snug" style={{ color: 'rgba(245,247,246,.85)' }}>
                Lesson {Math.min(nextCourse.completedLessons + 1, nextCourse.totalLessons)} of {nextCourse.totalLessons}
                {currentLesson ? <><br />{currentLesson.title}</> : null}
              </p>
              <Link href={`/courses/${nextCourse.id}`} className="mt-4 inline-flex items-center gap-2.5 rounded-[12px] px-6 py-3.5 text-[15px] font-extrabold" style={{ background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A', boxShadow: '0 10px 26px -10px rgba(129,182,76,.6)' }}>
                Continue Training <ArrowRight size={17} />
              </Link>
            </div>
          </section>
        )}

        {/* Stats: flat columns */}
        {courses.length > 0 && (
          <div className="grid grid-cols-3 text-center">
            {[{ v: lessonsDone, l: 'Lessons completed' }, { v: started, l: 'Courses started' }, { v: `${overall}%`, l: 'Training progress' }].map((s, i) => (
              <div key={s.l} className="px-2 py-1" style={{ borderLeft: i ? `1px solid ${RD.border}` : undefined }}>
                <b className="block text-[30px] font-extrabold leading-tight">{s.v}</b>
                <span className="text-[12px]" style={{ color: RD.muted }}>{s.l}</span>
              </div>
            ))}
          </div>
        )}

        {/* Your Priorities */}
        {byCategory.length > 0 && (
          <section className="grid gap-3 lg:grid-cols-2">
            <div className="px-1 lg:col-span-2">
              <h2 className="text-[26px] font-extrabold leading-tight">Your Priorities</h2>
              <p className="text-[14px]" style={{ color: RD.muted }}>Based on your recent games.</p>
            </div>
            {byCategory.map((g) => {
              const a = artFor({ id: g.probe.id, category: g.name, title: g.probe.title });
              const p = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0;
              const left = g.total - g.done;
              return (
                <div key={g.name} className="flex items-center gap-3.5 rounded-[20px] p-3.5" style={card}>
                  <span className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-[16px]" style={{ background: `${a.tile}30`, border: `1.5px solid ${a.tile}99`, color: a.tile }}>
                    <a.icon size={30} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[17px] font-extrabold">{g.name}</b>
                    <div className="my-2"><Bar value={p} color={a.bar} h={8} /></div>
                    <span className="text-[12.5px] font-semibold" style={{ color: a.bar }}>{left} lesson{left === 1 ? '' : 's'} ready</span>
                  </div>
                  <b className="shrink-0 text-[20px] font-extrabold">{p}%</b>
                </div>
              );
            })}
          </section>
        )}

        {/* Recommended for you */}
        {recommended && (
          <section className="grid gap-2.5">
            <h2 className="px-1 text-[20px] font-extrabold">Recommended for you</h2>
            <Link href={`/courses/${recommended.id}`} className="relative block overflow-hidden rounded-[22px]" style={{ border: `1px solid ${RD.border}` }}>
              <img src={siteImg(`${ART_BASE}${artFor(recommended).img}.webp`)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '75% center' }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.92) 0%, rgba(5,10,11,.7) 55%, rgba(5,10,11,.1) 100%)' }} />
              <div className="relative z-10 flex min-h-[210px] flex-col p-5">
                <h3 className="max-w-[75%] text-[26px] font-extrabold leading-tight">{recommended.title}</h3>
                <p className="mt-1.5 line-clamp-2 max-w-[70%] text-[14.5px] leading-snug" style={{ color: 'rgba(245,247,246,.9)' }}>{recommended.description}</p>
                <div className="mt-auto pt-4">
                  <p className="mb-1.5 text-[13px] font-bold">{pctOf(recommended)}% complete</p>
                  <div className="max-w-[78%]"><Bar value={pctOf(recommended)} h={7} /></div>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="flex items-center gap-2 text-[13px]" style={{ color: 'rgba(245,247,246,.85)' }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIFF_DOT[recommended.difficulty] ?? RD.green }} />{recommended.difficulty} • {recommended.totalLessons} lessons
                    </span>
                    <span className="grid h-11 w-11 place-items-center rounded-[12px]" style={{ background: RD.green, color: '#05100A' }}><ArrowRight size={20} /></span>
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* All courses */}
        <section className="grid gap-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="text-[26px] font-extrabold leading-tight">All Courses</h2>
              <p className="text-[14px]" style={{ color: RD.muted }}>Build the skills that matter most.</p>
            </div>
            <button onClick={onGenerate} disabled={isGenerating} className="flex shrink-0 items-center gap-2 rounded-[12px] px-3.5 py-2.5 text-[12.5px] font-extrabold disabled:opacity-60" style={{ background: 'rgba(129,182,76,.10)', color: RD.green, border: `1px solid ${RD.green}` }}>
              {isGenerating ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2" style={{ borderColor: RD.green, borderTopColor: 'transparent' }} />Building…</> : <><GraduationCap size={15} />New courses</>}
            </button>
          </div>

          {genError && (
            <div className="flex items-center gap-2 rounded-[14px] p-3 text-[13px]" style={{ background: 'rgba(255,80,88,.10)', border: '1px solid rgba(255,80,88,.30)', color: '#FF9DA2' }}>
              <AlertCircle size={16} className="shrink-0" /> {genError}
            </div>
          )}

          {courses.length > 0 && (
            <div className="grid grid-cols-2 overflow-hidden rounded-[14px]" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
              {([['all', 'Courses'], ['progress', 'My Progress']] as const).map(([id, label]) => {
                const active = tab === id;
                return (
                  <button key={id} onClick={() => setTab(id)} className="py-3 text-[14.5px] font-bold transition-colors"
                    style={active ? { background: 'rgba(129,182,76,.12)', color: RD.green, boxShadow: `inset 0 -2px 0 ${RD.green}` } : { color: RD.muted }}>
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
            <div className="rounded-[20px] px-6 py-10 text-center text-[13px]" style={{ background: RD.card, border: `1px solid ${RD.border}`, color: RD.muted }}>You haven&apos;t started a course yet.</div>
          )}

          {visible.map((c, ci) => {
            const a = artFor(c);
            const p = pctOf(c);
            const done = p === 100;
            return (
              <div key={c.id} className="flex items-stretch overflow-hidden rounded-[20px]" style={card}>
                <Link href={`/courses/${c.id}`} className="flex min-w-0 flex-1 items-stretch">
                  <span className="relative w-[96px] shrink-0 overflow-hidden">
                    <img src={siteImg(`${ART_BASE}${visibleImgs[ci]}.webp`)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1 px-3.5 py-3.5">
                    <b className="block truncate text-[16.5px] font-extrabold">{c.title}</b>
                    <span className="mt-0.5 line-clamp-1 block text-[13px]" style={{ color: RD.muted }}>{c.description}</span>
                    <span className="mt-2 flex items-center gap-2 text-[12.5px]" style={{ color: 'rgba(245,247,246,.8)' }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIFF_DOT[c.difficulty] ?? RD.green }} />{c.difficulty} • {c.totalLessons} lessons
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-center justify-center gap-1.5 pr-2">
                    <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: done ? 'rgba(129,182,76,.16)' : RD.green, color: done ? RD.green : '#05100A' }}>
                      {done ? <CheckCircle2 size={20} aria-label="Completed" /> : <Play size={16} fill="currentColor" aria-label="Open course" />}
                    </span>
                    <b className="text-[13px]" style={{ color: p > 0 ? RD.green : RD.muted }}>{p}%</b>
                  </span>
                </Link>
                <button onClick={() => onArchive(c.id)} title="Clear this course" aria-label={`Clear course ${c.title}`} className="grid w-9 shrink-0 place-items-center" style={{ color: RD.muted, borderLeft: `1px solid ${RD.border}` }}>
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
