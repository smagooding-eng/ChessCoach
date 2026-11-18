// After you move in a daily game: if another daily game is waiting on your move, go to
// it (the one with the least time left first): ChessScout daily games and Lichess daily
// games alike. A short banner says where it's going, with "Stay here" to cancel.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { lichessAuth, nowPlaying, isDaily } from '@/lib/lichessBoard';
import { dailyTimeLeft, type DailyGameRow } from '@/pages/DailyGames';
import { PT } from '@/lib/playTheme';

type Next = { href: string; opponent: string; leftMs: number };

export async function findNextMyMove(me: string, skip: { daily?: string; lichess?: string }): Promise<Next | null> {
  const found: Next[] = [];
  await Promise.all([
    apiFetch('/api/correspondence/games', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { games?: DailyGameRow[]; now?: number } | null) => {
        const offset = typeof d?.now === 'number' ? d.now - Date.now() : 0;
        for (const g of d?.games ?? []) {
          if (g.status !== 'active' || g.turnUserId !== me || g.id === skip.daily) continue;
          found.push({ href: `/daily/${g.id}`, opponent: g.whiteUserId === me ? g.blackUsername : g.whiteUsername, leftMs: dailyTimeLeft(g, offset) });
        }
      })
      .catch(() => {}),
    (lichessAuth() ? nowPlaying() : Promise.resolve([]))
      .then((list) => {
        for (const g of list) {
          if (!isDaily(g) || !g.isMyTurn || g.gameId === skip.lichess) continue;
          found.push({ href: `/lichess?game=${g.gameId}&from=list`, opponent: g.opponent?.username ?? 'Opponent', leftMs: typeof g.secondsLeft === 'number' ? g.secondsLeft * 1000 : Number.MAX_SAFE_INTEGER });
        }
      })
      .catch(() => {}),
  ]);
  found.sort((a, b) => a.leftMs - b.leftMs);
  return found[0] ?? null;
}

const GO_AFTER_MS = 1600;

/** goNext(skip) after your move; render {banner}. */
export function useGoToNextMove(me: string | undefined) {
  const [, navigate] = useLocation();
  const [next, setNext] = useState<Next | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const goNext = useCallback(async (skip: { daily?: string; lichess?: string }) => {
    if (!me) return;
    const n = await findNextMyMove(me, skip);
    if (!n) return;
    setNext(n);
    clearTimeout(timer.current);
    // A moment to see your move land, then on to the next game
    timer.current = setTimeout(() => { setNext(null); navigate(n.href); }, GO_AFTER_MS);
  }, [me, navigate]);

  const stay = () => { clearTimeout(timer.current); setNext(null); };

  const banner = next ? (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[60] flex justify-center px-4 md:bottom-6">
      <div className="flex w-full max-w-[420px] items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl" style={{ background: '#121B1D', border: `1px solid ${PT.border}` }}>
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] font-extrabold" style={{ color: PT.text }}>Next: your move vs {next.opponent}</b>
          <span className="block h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)', marginTop: 6 }}>
            <span className="block h-full rounded-full" style={{ background: PT.green, animation: `csNextBar ${GO_AFTER_MS}ms linear forwards` }} />
          </span>
        </span>
        <button type="button" onClick={stay} className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.06)', color: PT.text }}>Stay here</button>
      </div>
      <style>{'@keyframes csNextBar { from { width: 0 } to { width: 100% } }'}</style>
    </div>
  ) : null;

  return { goNext, banner };
}
