// Home: today's 3 puzzles from your own games, with the streak. Hidden until the
// member has games to make them from.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Check, ChevronRight, Puzzle as PuzzleGlyph } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function TodaysThreeCard({ className = '', card, border, muted }: { className?: string; card: string; border: string; muted: string }) {
  const [s, setS] = useState<{ doneToday: boolean; streak: number; hasGames: boolean } | null>(null);
  useEffect(() => {
    void apiFetch(`/api/daily-three/status?day=${today()}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => {});
  }, []);
  if (!s?.hasGames) return null;
  return (
    <Link href="/daily-three" className={`flex items-center gap-3 rounded-[18px] px-3.5 py-3.5 transition-transform active:scale-[.98] ${className}`}
      style={{ background: card, border: s.doneToday ? `1px solid ${border}` : '1px solid rgba(129,182,76,.35)' }}>
      <span className="grid shrink-0 place-items-center rounded-[12px]" style={{ width: 44, height: 44, background: '#212B2D' }}><PuzzleGlyph size={22} style={{ color: '#81B64C' }} /></span>
      <span className="min-w-0 flex-1">
        <b className="block text-[16px] font-extrabold leading-tight">{s.doneToday ? 'Today’s 3: done' : 'Today’s 3'}</b>
        <span className="block text-[12px] leading-snug" style={{ color: muted }}>
          {s.doneToday ? 'Three new ones tomorrow.' : 'Three positions from your own games. About 2 minutes.'}
        </span>
      </span>
      {s.streak > 0 && <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-black tabular-nums" style={{ background: 'rgba(255,255,255,.06)', color: '#E8B447' }}>{s.streak} day{s.streak === 1 ? '' : 's'}</span>}
      {s.doneToday ? <Check size={18} className="shrink-0" style={{ color: '#81B64C' }} /> : <ChevronRight size={16} className="shrink-0" style={{ color: muted }} />}
    </Link>
  );
}
