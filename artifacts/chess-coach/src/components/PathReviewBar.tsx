// On the Game Review page, when the game was opened from a Learn Path review step: once the
// review is ready the step counts, and the way back to the path (or on to the next step) is here.
import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Check, ChevronRight } from 'lucide-react';
import { pathReviewFor, completeStep, stepByKey, readPath, startStep } from '@/lib/learnPath';

export function PathReviewBar({ gameId, ready }: { gameId: number; ready: boolean }) {
  const [, navigate] = useLocation();
  const link = pathReviewFor(gameId);
  const key = link?.key ?? null;
  useEffect(() => { if (ready && key) completeStep(key); }, [ready, key]);
  if (!link) return null;
  const found = key ? stepByKey(key) : null;
  const s = readPath();
  const next = found ? found.level.steps.find((x) => !s.done[x.key] && x.key !== key) : null;
  return (
    <div className="shrink-0 flex items-center gap-2 rounded-[14px] px-3 py-2 text-[13px] font-bold" style={{ background: '#182123', border: '1px solid rgba(129,182,76,.35)', color: '#F5F7F6' }}>
      {ready && key ? <Check size={16} color="#81B64C" strokeWidth={3} /> : null}
      <span className="min-w-0 flex-1 truncate">{!key ? 'Learn Path: review it, then try again' : ready ? 'Learn Path: review done' : 'Learn Path: reviewing your game…'}</span>
      {ready && next && <button onClick={() => { startStep(next); navigate(next.href); }} className="rounded-[10px] px-2.5 py-1 text-[12.5px] font-extrabold text-white" style={{ background: '#81B64C' }}>Next <ChevronRight size={13} className="inline" /></button>}
      <Link href="/path" className="rounded-[10px] px-2.5 py-1 text-[12.5px] font-extrabold" style={{ background: '#212B2D' }}>Path</Link>
    </div>
  );
}
