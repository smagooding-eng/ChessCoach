import React from 'react';
// The Learn page (from the dashboard's Learn button): every way to study in
// one place -- Chess for Kids, the Beginner Path, Courses, Puzzles, Openings
// and Endgames, plus the free articles.

import { Link } from 'wouter';
import { ArrowUpRight, BookOpen, GraduationCap, Puzzle, Trophy, Baby, Sprout, Newspaper } from 'lucide-react';
import { RD } from '@/lib/redesignTheme';
import { RedesignHeader } from '@/components/RedesignHeader';
import { useDashboardRedesignFlag, useSiteImg } from '@/hooks/use-app-config';
import { useLearn, nextLesson, totalLessons } from '@/lib/learn/progress';
import { KidBear } from '@/components/kids/KidsArt';
import { FenThumb } from '@/components/FenThumb';

const BASE = import.meta.env.BASE_URL;

interface Tile {
  title: string; sub: string; href: string; img?: string; photo?: boolean;
  /** Drawn art instead of a photo. */
  art?: React.ReactNode; bg?: string;
  icon: typeof BookOpen; badge?: string;
}

export function LearnHub() {
  const { enabled: redesign } = useDashboardRedesignFlag();
  const siteImg = useSiteImg();
  const { state } = useLearn();
  const done = Object.values(state.lessons).filter((n) => n > 0).length;
  const total = totalLessons();
  const next = nextLesson(state);

  const tiles: Tile[] = [
    {
      title: 'Chess for Kids', sub: 'Colorful worlds, read-aloud lessons and Benny the Bear', href: '/kids', icon: Baby,
      bg: 'linear-gradient(135deg, #2D6FB8 0%, #4FA3E0 45%, #7CC46B 100%)',
      art: <span className="absolute -right-2 bottom-1 opacity-95"><KidBear size={118} /></span>,
    },
    {
      title: 'Beginner Path', sub: done > 0 ? `${done} of ${total} lessons done · keep going` : 'Every piece, step by step, then your first game',
      href: done > 0 && next ? `/beginner/${next.unit.id}/${next.lesson.id}` : '/beginner', icon: Sprout,
      bg: 'linear-gradient(135deg, #10301A 0%, #1E4A2A 55%, #2E6B3A 100%)',
      art: <span className="absolute -right-3 top-3 rotate-[8deg] opacity-80"><FenThumb fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" size={124} /></span>,
    },
    { title: 'Courses', sub: 'Lessons and drills built from your games', href: '/courses', img: `${BASE}assets/courses/course-library.webp`, icon: GraduationCap },
    { title: 'Puzzles', sub: 'Unlimited tactics, from mate in 1 up', href: '/puzzles', img: `${BASE}chessscout/puzzles.webp`, photo: true, icon: Puzzle },
    { title: 'Openings', sub: 'Learn and drill your repertoire', href: '/openings', img: `${BASE}chessscout/openings.webp`, photo: true, icon: BookOpen },
    { title: 'Endgames', sub: 'The positions every player must know', href: '/endgames', img: `${BASE}chessscout/scenes/hero-endgames.webp`, photo: true, icon: Trophy },
  ];

  return (
    <div className="min-h-screen px-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto w-full max-w-[680px] lg:max-w-[1100px]">
        {redesign ? (
          <RedesignHeader title="Learn" icon={<GraduationCap size={24} />} />
        ) : (
          <h1 className="px-1 pb-3 pt-4 text-[24px] font-extrabold tracking-tight">Learn</h1>
        )}
        <p className="mb-4 px-1 text-[14px]" style={{ color: RD.muted }}>Pick how you want to get better today.</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <Link key={t.title} href={t.href}
              className="relative flex min-h-[132px] flex-col justify-end overflow-hidden rounded-[20px] p-4 transition-transform active:scale-[.98]"
              style={{ background: t.bg ?? RD.cardSolid, border: `1px solid ${RD.border}` }}>
              {t.img && <img src={t.photo ? siteImg(t.img) : t.img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
              {t.art}
              <span className="absolute inset-0" style={{ background: t.art
                ? 'linear-gradient(0deg, rgba(5,10,11,.82) 0%, rgba(5,10,11,.3) 55%, rgba(5,10,11,0) 100%)'
                : 'linear-gradient(0deg, rgba(5,10,11,.94) 0%, rgba(5,10,11,.62) 55%, rgba(5,10,11,.2) 100%)' }} />
              <span className={`absolute ${t.art ? 'left-4 top-4' : 'right-3 top-3'} grid h-9 w-9 place-items-center rounded-[10px]`} style={{ background: 'rgba(5,10,11,.6)', color: RD.green, border: '1px solid rgba(129,182,76,.3)' }}>
                <t.icon size={18} />
              </span>
              <span className={`relative min-w-0 ${t.art ? 'pr-24' : ''}`}>
                <b className="flex items-center gap-1.5 text-[17px] font-extrabold leading-tight">{t.title} <ArrowUpRight size={16} style={{ color: RD.green }} /></b>
                <span className="mt-0.5 block text-[13px] font-semibold" style={{ color: '#C4CCC9' }}>{t.sub}</span>
              </span>
            </Link>
          ))}
        </div>

        <Link href="/learn" className="mt-4 flex items-center gap-3 rounded-[16px] px-4 py-3.5" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
          <Newspaper size={18} style={{ color: RD.green }} />
          <span className="min-w-0 flex-1">
            <b className="block text-[14px] font-extrabold">Articles</b>
            <span className="block text-[12.5px]" style={{ color: RD.muted }}>Free guides on openings, tactics and improving</span>
          </span>
          <ArrowUpRight size={16} style={{ color: RD.green }} />
        </Link>
      </div>
    </div>
  );
}
