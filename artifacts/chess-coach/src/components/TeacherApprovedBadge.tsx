// "Teacher Approved on Google Play": ChessScout.net's Google Play listing carries
// Google's Teacher Approved mark. Shown on the landing page, the public pages and
// the download page. Links to the Play listing. (Our own design, not Google's artwork.)
import { GraduationCap, Star } from 'lucide-react';
import { PLAY_STORE_URL } from '@/lib/playApp';
import { t } from '@/lib/i18n';

/** The big version: a card with the cap, the title and a line under it. */
export function TeacherApprovedBadge({ className = '', size = 'lg' }: { className?: string; size?: 'lg' | 'sm' }) {
  const lg = size === 'lg';
  return (
    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label={t('Teacher Approved on Google Play')}
      className={`group inline-flex items-center gap-3 rounded-2xl transition-transform hover:-translate-y-px active:scale-[0.98] ${lg ? 'px-3.5 py-2.5' : 'px-2.5 py-1.5'} ${className}`}
      style={{ background: 'linear-gradient(135deg, #1B2A1B, #121A13)', border: '1px solid rgba(232,180,71,.55)', boxShadow: '0 10px 30px -14px rgba(232,180,71,.55)' }}>
      <span className={`grid shrink-0 place-items-center rounded-xl ${lg ? 'h-11 w-11' : 'h-8 w-8'}`} style={{ background: 'linear-gradient(180deg, #F3C95A, #D9A12E)' }}>
        <GraduationCap className={lg ? 'h-6 w-6' : 'h-[18px] w-[18px]'} color="#1A1405" strokeWidth={2.4} />
      </span>
      <span className="text-left leading-tight">
        <span className={`flex items-center gap-1 font-black ${lg ? 'text-[16px] sm:text-[17px]' : 'text-[13px]'}`} style={{ color: '#F5F7F6' }}>
          {t('Teacher Approved')}
          <Star className={lg ? 'h-3.5 w-3.5' : 'h-3 w-3'} fill="#E8B447" color="#E8B447" />
        </span>
        <span className={`block font-bold ${lg ? 'text-[12.5px]' : 'text-[11px]'}`} style={{ color: '#E8B447' }}>{t('on Google Play')}</span>
      </span>
    </a>
  );
}

/** A thin strip for the top of public pages. */
export function TeacherApprovedStrip() {
  return (
    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer"
      className="flex w-full items-center justify-center gap-2 px-3 py-1.5 text-[12.5px] font-extrabold"
      style={{ background: 'linear-gradient(90deg, #2A2210, #1B2A1B, #2A2210)', color: '#F5F7F6', borderBottom: '1px solid rgba(232,180,71,.35)' }}>
      <GraduationCap className="h-4 w-4" color="#E8B447" />
      <span>{t('Teacher Approved on Google Play')}</span>
      <Star className="h-3 w-3" fill="#E8B447" color="#E8B447" />
    </a>
  );
}
