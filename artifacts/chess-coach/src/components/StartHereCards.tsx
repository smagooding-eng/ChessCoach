// Home page: a slim "New to chess?" row with the two ways in for beginners --
// the Beginner Path and Chess for Kids. Kept small on purpose so it doesn't
// compete with the rest of the home page. (Kid Mode is set up from the
// grown-up corner of the kids map.) Used by both home designs.

import { Link } from 'wouter';
import { GraduationCap } from 'lucide-react';
import { KidBear } from '@/components/kids/KidsArt';
import { useLearn, nextLesson, totalLessons } from '@/lib/learn/progress';

export function StartHereCards({ variant = 'classic' }: { variant?: 'classic' | 'redesign' }) {
  const { state } = useLearn();
  const done = Object.values(state.lessons).filter((n) => n > 0).length;
  const next = nextLesson(state);
  const total = totalLessons();

  const box = variant === 'redesign'
    ? { background: 'var(--rd-card, linear-gradient(160deg, #0F1819 0%, #0B1213 100%))', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16 }
    : { background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 };
  const pill = 'flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors hover:bg-white/[0.06]';
  const pillStyle = { background: 'rgba(255,255,255,0.04)', color: '#F5F7F6' };

  return (
    <div className={`${variant === 'redesign' ? 'lg:col-span-2' : 'px-3 md:px-0'}`}>
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5" style={box}>
        <span className="w-full sm:w-auto px-1 text-[11px] font-semibold uppercase tracking-[0.16em] shrink-0" style={{ color: '#9e9b98' }}>New to chess?</span>
        <Link href={next && done > 0 ? `/beginner/${next.unit.id}/${next.lesson.id}` : '/beginner'} className={pill} style={pillStyle}>
          <GraduationCap className="w-4 h-4 shrink-0" style={{ color: '#4a9eda' }} />
          <span className="truncate">{done > 0 && next ? `Beginner Path · ${done}/${total}` : 'Beginner Path'}</span>
        </Link>
        <Link href="/kids" className={pill} style={pillStyle}>
          <span className="shrink-0" style={{ width: 18, height: 18 }}><KidBear size={18} /></span>
          <span className="truncate">Chess for Kids</span>
        </Link>
      </div>
    </div>
  );
}
