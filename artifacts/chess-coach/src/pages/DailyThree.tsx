// Today's 3: three puzzles a day from the member's own games (where they missed the
// better move), with a streak. Made once per day on the server and kept, so a reload
// shows the same three. If their games haven't produced three yet, more are made
// from their reviewed games first; rated puzzles near their level fill any gap.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Bell, Check, ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { ScoutIcon } from '@/components/ScoutIcons';
import { PuzzleSet } from '@/components/puzzles/PuzzleRun';
import type { TacticPuzzleData } from '@/components/tactics/TacticPuzzle';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { markValueMoment } from '@/lib/valueMoment';

const MUTED = '#8F9997', GREEN = '#81B64C', CARD = '#182123', CARD2 = '#212B2D', BORDER = 'rgba(255,255,255,.07)';
type DP = TacticPuzzleData & { fromYourGame: boolean; gameId: number | null; opponent: string | null };
type Data = { day: string; puzzles: DP[]; doneToday: boolean; solvedToday: number; streak: number; needMore: boolean };

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function DailyThreePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [finished, setFinished] = useState<{ streak: number; solved: number } | null>(null);
  const solved = useRef(0);
  const push = usePushNotifications();
  const notifyOn = push.permission === 'granted' && push.isSubscribed;
  const canAsk = !notifyOn && push.permission !== 'denied' && push.permission !== 'unsupported';

  useEffect(() => {
    let off = false;
    const get = (fill: boolean) => apiFetch(`/api/daily-three?day=${today()}${fill ? '' : '&fill=0'}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() as Promise<Data> : Promise.reject(new Error('load'))));
    (async () => {
      try {
        let d = await get(false);
        // Not three from their games yet: make more from their reviewed games, then ask again.
        if (d.needMore) {
          if (!off) setMaking(true);
          await apiFetch('/api/puzzles/generate-from-games', { method: 'POST', credentials: 'include' }).catch(() => null);
          d = await get(true);
        } else if (d.puzzles.length < 3) d = await get(true);
        if (!off) { setData(d); setMaking(false); }
      } catch { if (!off) { setError("Couldn't load today's puzzles."); setMaking(false); } }
    })();
    return () => { off = true; };
  }, []);

  const onResult = (p: TacticPuzzleData, clean: boolean) => {
    if (clean) solved.current++;
    void apiFetch('/api/daily-three/result', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ puzzleId: p.id, solved: clean }) }).catch(() => {});
  };
  const onDone = async () => {
    const r = await apiFetch('/api/daily-three/done', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: today(), solved: solved.current }) }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) as { streak?: number } | null : null;
    setFinished({ streak: d?.streak ?? (data?.streak ?? 0) + 1, solved: solved.current });
    markValueMoment('puzzles');
  };

  const own = data?.puzzles.filter((p) => p.fromYourGame).length ?? 0;
  return (
    <div className="cs-split-wide relative z-10 mx-auto w-full max-w-[560px] px-4 pb-32 pt-3" style={{ color: '#F5F7F6' }}>
      <div className="mb-3 flex items-center gap-3">
        <Link href="/" aria-label="Back" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: GREEN }}><ArrowLeft size={22} /></Link>
        <ScoutIcon name="puzzles" size={34} />
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[18px] font-black">Today's 3</b>
          <span className="text-[12.5px]" style={{ color: MUTED }}>{own >= 3 ? 'All from your own games' : own > 0 ? `${own} from your own games` : 'Puzzles at your level'}</span>
        </div>
        {data && (data.streak > 0 || finished) && (
          <span className="rounded-full px-3 py-1 text-[13px] font-black tabular-nums" style={{ background: CARD2, color: '#E8B447' }}>{finished?.streak ?? data.streak} day{(finished?.streak ?? data.streak) === 1 ? '' : 's'}</span>
        )}
      </div>

      {error ? <p className="rounded-[14px] p-4 text-[14px]" style={{ background: CARD }}>{error}</p>
        : !data ? (
          <div className="flex items-center gap-3 rounded-[14px] p-4" style={{ background: CARD }}>
            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2" style={{ borderColor: `${GREEN} transparent ${GREEN} ${GREEN}` }} />
            <span className="text-[14px]">{making ? 'Finding positions from your games where the better move was there…' : 'Getting today’s puzzles…'}</span>
          </div>
        ) : finished || data.doneToday ? (
          <div className="space-y-3">
            <div className="rounded-[18px] p-5 text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-[16px]" style={{ background: GREEN }}><Check size={30} strokeWidth={3} color="#fff" /></div>
              <p className="mt-3 text-[19px] font-black">{finished ? 'Done for today' : 'You did today’s 3'}</p>
              <p className="mt-1 text-[14px]" style={{ color: MUTED }}>
                {finished ? `${finished.solved} of 3 first try. ` : ''}{(finished?.streak ?? data.streak) > 1 ? `That's ${finished?.streak ?? data.streak} days in a row. ` : ''}Three new ones tomorrow, from your newest games.
              </p>
            </div>
            {canAsk && (
              <div className="rounded-[16px] p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-[14.5px] font-extrabold">Want a reminder tomorrow?</p>
                <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>One a day, around the time you usually play. Nothing else.</p>
                <button onClick={() => { void push.subscribe(); }} disabled={push.loading} className="mt-2.5 flex items-center gap-1.5 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-extrabold text-white disabled:opacity-60" style={{ background: 'linear-gradient(180deg,#8FC25A,#81B64C)' }}><Bell size={15} /> Turn on reminders</button>
              </div>
            )}
            <div className="grid gap-2">
              <Link href="/play" className="flex items-center justify-between rounded-[14px] px-4 py-3.5 text-[14.5px] font-extrabold" style={{ background: CARD, border: `1px solid ${BORDER}` }}>Play a game <ChevronRight size={18} style={{ color: GREEN }} /></Link>
              <Link href="/games" className="flex items-center justify-between rounded-[14px] px-4 py-3.5 text-[14.5px] font-extrabold" style={{ background: CARD, border: `1px solid ${BORDER}` }}>Your reviewed games <ChevronRight size={18} style={{ color: GREEN }} /></Link>
            </div>
          </div>
        ) : data.puzzles.length === 0 ? (
          <p className="rounded-[14px] p-4 text-[14px]" style={{ background: CARD }}>No puzzles yet. Once your games are reviewed, the positions where you missed something show up here. <Link href="/games" className="font-bold underline" style={{ color: GREEN }}>Your games</Link></p>
        ) : (
          <>
            {data.puzzles[0]?.fromYourGame && (
              <p className="mb-3 text-[13px] leading-snug" style={{ color: MUTED }}>Each one is a position from your own game where there was a better move. Find it.</p>
            )}
            <PuzzleSet puzzles={data.puzzles} onResult={onResult} onDone={() => { void onDone(); }} />
          </>
        )}
    </div>
  );
}
