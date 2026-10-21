// The Learn page (from the dashboard's Learn button): every way to study in
// one place -- Chess for Kids, the Beginner Path, Courses, Puzzles, Openings,
// Chess Traps and Endgames, and the free articles. The tiles use the same
// look as the home page's feature tiles (photo, green icon chip, arrow).

import { Link } from 'wouter';
import { ArrowRight, BookOpen, GraduationCap, Puzzle, Trophy, Baby, Sprout, Newspaper, Crosshair } from 'lucide-react';
import { RD } from '@/lib/redesignTheme';
import { RedesignHeader } from '@/components/RedesignHeader';
import { useDashboardRedesignFlag, useSiteImg } from '@/hooks/use-app-config';
import { usePhotoLook } from '@/context/SettingsContext';
import { useLearn, nextLesson, totalLessons } from '@/lib/learn/progress';

const BASE = import.meta.env.BASE_URL;
const asset = (file: string) => `${BASE}chessscout/${file}`;
const CARD = 'var(--rd-card, linear-gradient(160deg, #0F1819 0%, #0B1213 100%))';
const BORDER = 'rgba(255,255,255,.08)';

interface Tile { label: string; sub: string; href: string; img: string; pos: string; icon: typeof BookOpen }

export function LearnHub() {
  const { enabled: redesign } = useDashboardRedesignFlag();
  const siteImg = useSiteImg();
  const photoLook = usePhotoLook();
  const { state } = useLearn();
  const done = Object.values(state.lessons).filter((n) => n > 0).length;
  const total = totalLessons();
  const next = nextLesson(state);

  const tiles: Tile[] = [
    { label: 'Chess for Kids', sub: 'Worlds, lessons & Benny the Bear', href: '/kids', img: asset('scenes/theme-hanging.webp'), pos: '62% center', icon: Baby },
    {
      label: 'Beginner Path', sub: done > 0 ? `${done} of ${total} lessons done` : 'Start from zero, step by step',
      href: done > 0 && next ? `/beginner/${next.unit.id}/${next.lesson.id}` : '/beginner', img: asset('scenes/quick-local.webp'), pos: '62% center', icon: Sprout,
    },
    { label: 'Courses', sub: 'Lessons from your games', href: '/courses', img: `${BASE}assets/courses/course-library.webp`, pos: '70% center', icon: GraduationCap },
    { label: 'Puzzles', sub: 'Unlimited tactics', href: '/puzzles', img: asset('puzzles.webp'), pos: '73% center', icon: Puzzle },
    { label: 'Openings', sub: 'Drill and learn', href: '/openings', img: asset('openings.webp'), pos: '68% center', icon: BookOpen },
    { label: 'Chess Traps', sub: 'Learn the classics', href: '/traps', img: asset('traps.webp'), pos: '59% center', icon: Crosshair },
    { label: 'Endgames', sub: 'Positions to know', href: '/endgames', img: asset('scenes/hero-endgames.webp'), pos: '62% center', icon: Trophy },
    { label: 'Articles', sub: 'Free guides', href: '/learn', img: asset('scenes/hero-lookup.webp'), pos: '62% center', icon: Newspaper },
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

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className={`relative block overflow-hidden rounded-[18px] transition-transform active:scale-[.98] ${photoLook ? '' : 'min-h-[128px]'}`}
              style={photoLook ? { background: CARD, border: `1px solid ${BORDER}` } : {
                backgroundColor: 'var(--rd-card-solid, #050A0B)',
                border: `1px solid ${BORDER}`,
                backgroundImage: `url(${siteImg(t.img)})`,
                backgroundSize: 'auto 100%',
                backgroundPosition: t.pos,
                backgroundRepeat: 'no-repeat',
              }}
            >
              {!photoLook && <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.78) 0%, rgba(5,10,11,.25) 62%, rgba(5,10,11,0) 100%), linear-gradient(0deg, rgba(5,10,11,.65) 0%, rgba(5,10,11,0) 55%)' }} />}
              <div className={`relative z-10 flex h-full ${photoLook ? 'items-center gap-3 p-3' : 'min-h-[128px] flex-col justify-between p-3.5'}`}>
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px]"
                  style={{ background: 'linear-gradient(160deg, #81B64C, #5f8f36)', boxShadow: '0 2px 8px rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.18)' }}
                >
                  <t.icon size={21} color="#fff" />
                </span>
                <div className={`flex justify-between gap-2 ${photoLook ? 'min-w-0 flex-1 items-center' : 'items-end'}`}>
                  <div className="min-w-0">
                    <b className={`block font-extrabold leading-tight ${photoLook ? 'text-[16px]' : 'text-[17px] sm:text-[19px]'}`}>{t.label}</b>
                    <span className="block text-[12px] leading-snug sm:text-[12.5px]" style={{ color: '#C4CCC9' }}>{t.sub}</span>
                  </div>
                  {!photoLook && (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ border: '1.5px solid rgba(255,255,255,.7)', background: 'rgba(5,10,11,.45)' }}>
                      <ArrowRight size={16} />
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
