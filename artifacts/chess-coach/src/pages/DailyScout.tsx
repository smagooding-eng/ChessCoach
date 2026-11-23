// /daily (the link in shared Daily Scout results): today's puzzle, or your result if done.
import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useDailyScout } from '@/pages/Progress';
import { AppIcon } from '@/components/AppIcon';
import { setPageMeta } from '@/lib/pageMeta';

export default function DailyScoutPage() {
  const { authUser, isAuthLoading } = useUser();
  const d = useDailyScout();
  const [, navigate] = useLocation();
  useEffect(() => { setPageMeta('Daily Scout — ChessScout.net', 'One chess puzzle a day for everyone, from a real game. Can you find it?', '/daily'); }, []);
  useEffect(() => { if (authUser && d && !d.mine) navigate(`/puzzles?daily=${d.number}&id=${d.puzzleId}`, { replace: true }); }, [authUser, d, navigate]);
  return (
    <div className="mx-auto grid min-h-[70vh] w-full max-w-[460px] place-items-center px-4" style={{ color: '#F5F7F6' }}>
      <div className="w-full rounded-[14px] p-6 text-center" style={{ background: 'var(--rd-card-solid, #182123)' }}>
        <AppIcon name="daily-scout" size={56} />
        <b className="mt-2 block text-[22px] font-black">Daily Scout{d ? ` #${d.number}` : ''}</b>
        {!d || isAuthLoading ? <Loader2 className="mx-auto mt-4 animate-spin" /> : (
          <>
            <p className="mt-1 text-[14px]" style={{ color: '#8F9997' }}>
              One puzzle a day for everyone, from a real game a member played.{d.stats.played ? ` ${d.stats.solvedPct ?? 0}% of ${d.stats.played} solved today's.` : ''}
            </p>
            {authUser
              ? <p className="mt-3 text-[14px]">{d.mine ? (d.mine.solved ? 'You solved today’s. Come back tomorrow.' : 'Today’s got away. Come back tomorrow.') : 'Opening…'}</p>
              : <Link href={`/puzzles?daily=${d.number}&id=${d.puzzleId}`} className="cs-cta mt-4">Play today’s puzzle</Link>}
            {authUser && <Link href="/progress" className="mt-3 block text-[13px] font-bold underline" style={{ color: '#81B64C' }}>Your progress</Link>}
          </>
        )}
      </div>
    </div>
  );
}
