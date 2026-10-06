import React, { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Layers } from 'lucide-react';
import { RD } from '@/lib/redesignTheme';
import { artFor, ART_BASE, type CourseLike } from './CoursesRedesign';

// Course Overview (redesign): art header, progress, one clear primary
// action, and the lesson list. Lesson states are the real ones only --
// completed / current (first unfinished) / upcoming. The app doesn't lock
// lessons, so there's deliberately no "locked" state, and courses don't
// store an estimated duration, so none is shown.
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
      <div className="mx-auto w-full max-w-[760px]">
        <div className="relative h-[230px] overflow-hidden md:rounded-b-[24px]">
          <img src={`${ART_BASE}${art.img}.webp`} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,10,11,.35) 0%, rgba(5,10,11,.15) 40%, #050A0B 100%)' }} />
          <Link href="/courses" aria-label="Back to courses" className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full" style={{ background: 'rgba(5,10,11,.65)', border: `1px solid ${RD.border}`, color: RD.text }}>
            <ArrowLeft size={19} />
          </Link>
        </div>

        <div className="-mt-12 relative z-10 px-4">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{course.title}</h1>
          <p className="mt-1 text-[13.5px]" style={{ color: 'rgba(245,247,246,.78)' }}>{course.description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: RD.muted }}>
            <span className="rounded-md px-2 py-1 font-extrabold" style={{ background: 'rgba(139,234,69,.14)', color: RD.green }}>{course.difficulty}</span>
            <span className="flex items-center gap-1"><Layers size={13} />{total} lesson{total === 1 ? '' : 's'}</span>
            <span>{course.category}</span>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[12px]" style={{ color: RD.muted }}>
              <span>{pct}% complete</span>
              <span>{course.completedLessons} / {total} lessons</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.10)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${RD.greenDark}, ${RD.green})` }} />
            </div>
          </div>

          <button
            onClick={() => onOpen(allDone ? 0 : Math.max(currentIdx, 0))}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-extrabold"
            style={{ background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A', boxShadow: '0 12px 28px -12px rgba(139,234,69,.6)' }}
          >
            {allDone ? 'Review from the start' : `Continue Lesson ${currentIdx + 1}`} <ArrowRight size={17} />
          </button>

          <div className="mt-5 flex items-center gap-1 rounded-[14px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
            {([['lessons', 'Lessons'], ['about', 'About']] as const).map(([id, label]) => {
              const active = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)} className="flex-1 rounded-[10px] py-2 text-[13px] font-bold transition-colors"
                  style={active ? { background: 'rgba(139,234,69,.10)', color: RD.green, boxShadow: `inset 0 0 0 1px ${RD.green}` } : { background: 'transparent', color: RD.muted }}>
                  {label}
                </button>
              );
            })}
          </div>

          {tab === 'lessons' ? (
            <section className="mt-3 overflow-hidden rounded-[18px]" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
              {lessons.map((l, i) => {
                const isCurrent = i === currentIdx;
                return (
                  <button
                    key={l.id}
                    onClick={() => onOpen(i)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                    style={{
                      borderTop: i ? `1px solid ${RD.border}` : undefined,
                      background: isCurrent ? 'rgba(139,234,69,.07)' : undefined,
                      boxShadow: isCurrent ? `inset 0 0 0 1px ${RD.green}` : undefined,
                    }}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className="w-5 shrink-0 text-center text-[12px] font-bold" style={{ color: RD.muted }}>{i + 1}</span>
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[9px]" style={{ border: `1px solid ${RD.border}` }}>
                      <img src={`${ART_BASE}${art.img}.webp`} alt="" loading="lazy" className="h-full w-full object-cover" style={{ objectPosition: `${(i * 37) % 100}% center` }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="line-clamp-2 text-[14px] font-bold leading-snug" style={{ color: l.completed || isCurrent ? RD.text : 'rgba(245,247,246,.72)' }}>{l.title}</b>
                      {isCurrent && <span className="text-[11.5px] font-bold" style={{ color: RD.green }}>Up next</span>}
                    </span>
                    {l.completed ? (
                      <CheckCircle2 size={20} className="shrink-0" style={{ color: RD.green }} aria-label="Completed" />
                    ) : (
                      <ChevronRight size={17} className="shrink-0" style={{ color: isCurrent ? RD.green : RD.muted }} />
                    )}
                  </button>
                );
              })}
            </section>
          ) : (
            <section className="mt-3 rounded-[18px] p-4 text-[13.5px] leading-relaxed" style={{ background: RD.card, border: `1px solid ${RD.border}`, color: 'rgba(245,247,246,.82)' }}>
              <p>{course.description}</p>
              <p className="mt-3 text-[12.5px]" style={{ color: RD.muted }}>Built from the weaknesses found in your own games, so every example comes from positions you actually played.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
