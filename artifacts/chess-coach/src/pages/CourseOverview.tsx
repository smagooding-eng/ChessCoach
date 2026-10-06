import React, { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, CheckCircle2, Layers, Play } from 'lucide-react';
import { RD } from '@/lib/redesignTheme';
import { artFor, ART_BASE, type CourseLike } from './CoursesRedesign';

// Course Overview (redesign), per the course mockup: top bar, full-bleed art,
// title / description / meta, progress, one primary action, and a Lessons /
// About tab strip with the lesson list. Lesson states are the real ones only
// (completed / current / upcoming -- the app doesn't lock lessons). No
// estimated duration is shown because courses don't store one.
export function CourseOverview({
  course, lessons, onOpen,
}: {
  course: CourseLike;
  lessons: { id: number; title: string; completed: boolean }[];
  onOpen: (index: number) => void;
}) {
  const [tab, setTab] = useState<'lessons' | 'about'>('lessons');
  const art = artFor(course);
  const total = course.totalLessons || lessons.length;
  const pct = total > 0 ? Math.round((course.completedLessons / total) * 100) : 0;
  const currentIdx = lessons.findIndex((l) => !l.completed);
  const allDone = currentIdx === -1 && lessons.length > 0;

  return (
    <div className="min-h-full pb-10" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto w-full max-w-[600px]">
        <div className="relative flex items-center justify-center px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href="/courses" aria-label="Back to courses" className="absolute left-3 grid h-10 w-10 place-items-center rounded-full" style={{ color: RD.text }}>
            <ArrowLeft size={22} />
          </Link>
          <b className="text-[16px]">Course</b>
        </div>

        <div className="relative h-[210px] overflow-hidden">
          <img src={`${ART_BASE}${art.img}.webp`} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,10,11,0) 40%, #050A0B 100%)' }} />
        </div>

        <div className="-mt-6 relative z-10 px-4">
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">{course.title}</h1>
          <p className="mt-1.5 text-[15px] leading-snug" style={{ color: 'rgba(245,247,246,.85)' }}>{course.description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[14px]" style={{ color: 'rgba(245,247,246,.85)' }}>
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: RD.green }} />{course.difficulty}</span>
            <span className="flex items-center gap-2"><Layers size={15} />{total} lesson{total === 1 ? '' : 's'}</span>
            <span style={{ color: RD.muted }}>{course.category}</span>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[13px]" style={{ color: 'rgba(245,247,246,.85)' }}>
              <span>{pct}% complete</span>
              <span>{course.completedLessons} / {total} lessons</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.12)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: RD.green }} />
            </div>
          </div>

          <button
            onClick={() => onOpen(allDone ? 0 : Math.max(currentIdx, 0))}
            className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-[14px] py-4 text-[16px] font-extrabold"
            style={{ background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A', boxShadow: '0 14px 30px -14px rgba(139,234,69,.65)' }}
          >
            {allDone ? 'Review from the start' : `Continue Lesson ${currentIdx + 1}`} <ArrowRight size={18} />
          </button>

          <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-[14px]" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
            {([['lessons', 'Lessons'], ['about', 'About']] as const).map(([id, label]) => {
              const active = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)} className="py-3 text-[14.5px] font-bold transition-colors"
                  style={active ? { background: 'rgba(139,234,69,.12)', color: RD.green, boxShadow: `inset 0 -2px 0 ${RD.green}` } : { color: RD.muted }}>
                  {label}
                </button>
              );
            })}
          </div>

          {tab === 'lessons' ? (
            <section className="mt-3 grid gap-1.5">
              {lessons.map((l, i) => {
                const isCurrent = i === currentIdx;
                return (
                  <button
                    key={l.id}
                    onClick={() => onOpen(i)}
                    aria-current={isCurrent ? 'step' : undefined}
                    className="flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left"
                    style={{ background: isCurrent ? 'rgba(139,234,69,.08)' : 'transparent', boxShadow: isCurrent ? `inset 0 0 0 1.5px ${RD.green}` : undefined }}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[9px]" style={{ border: `1px solid ${RD.border}` }}>
                      <img src={`${ART_BASE}${art.img}.webp`} alt="" loading="lazy" className="h-full w-full object-cover" style={{ objectPosition: `${(i * 37) % 100}% center` }} />
                    </span>
                    <span className="w-5 shrink-0 text-center text-[13px]" style={{ color: RD.muted }}>{i + 1}</span>
                    <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug" style={{ color: l.completed || isCurrent ? RD.text : 'rgba(245,247,246,.75)' }}>{l.title}</span>
                    {l.completed ? (
                      <CheckCircle2 size={22} className="shrink-0" style={{ color: RD.green }} aria-label="Completed" />
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={isCurrent ? { background: RD.green, color: '#05100A' } : { border: `1.5px solid ${RD.border}`, color: RD.muted }}>
                        <Play size={12} fill="currentColor" aria-label={isCurrent ? 'Up next' : 'Not started'} />
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          ) : (
            <section className="mt-3 rounded-[18px] p-4 text-[14px] leading-relaxed" style={{ background: RD.card, border: `1px solid ${RD.border}`, color: 'rgba(245,247,246,.85)' }}>
              <p>{course.description}</p>
              <p className="mt-3 text-[13px]" style={{ color: RD.muted }}>Built from the weaknesses found in your own games, so every example comes from positions you actually played.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
