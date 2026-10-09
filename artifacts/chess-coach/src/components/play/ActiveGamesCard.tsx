import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Swords, ChevronRight, CalendarDays } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { PT, cardStyle, formatLeft } from '@/lib/playTheme';

interface DailyRow {
  id: string; timeControl: string; whiteUserId: string; blackUserId: string;
  whiteUsername: string; blackUsername: string; turnUserId: string;
  whiteBankMs: number; blackBankMs: number; lastMoveAt: string; drawOfferFrom: string | null;
}
interface LiveActive { id: string; white: { username: string }; black: { username: string }; timeControl: { label: string }; turn: 'w' | 'b' }

const TC: Record<string, string> = { corr_1d: '1 day', corr_3d: '3 days', corr_7d: '7 days' };

// "Your games" on the home page: any live game in progress plus active daily
// games (your move first). Refreshes in real time; hidden when there are none.
export function ActiveGamesCard() {
  const { authUser } = useUser();
  const me = authUser?.id;
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [live, setLive] = useState<{ game: LiveActive; color: 'w' | 'b' } | null>(null);

  const load = useCallback(async () => {
    const [d, l] = await Promise.all([
      apiFetch('/api/correspondence/games').then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/live/active-game').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (d) { setDaily(d.games ?? []); if (typeof d.now === 'number') setOffset(d.now - Date.now()); }
    setLive(l?.game && l.game.status === 'active' ? { game: l.game, color: l.color } : null);
  }, []);

  useEffect(() => {
    if (!me) return;
    void load();
    const on = () => { void load(); };
    window.addEventListener('cs:daily-update', on);
    const t = setInterval(load, 60_000);
    return () => { window.removeEventListener('cs:daily-update', on); clearInterval(t); };
  }, [me, load]);

  if (!me || (daily.length === 0 && !live)) return null;

  const sorted = [...daily].sort((a, b) => Number(b.turnUserId === me) - Number(a.turnUserId === me));
  const myMoves = sorted.filter(g => g.turnUserId === me).length;

  return (
    <section className="overflow-hidden lg:col-span-2" style={cardStyle}>
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <h2 className="flex items-center gap-2 text-[16px] font-extrabold" style={{ color: PT.text }}>
          <Swords size={18} style={{ color: PT.green }} /> Your games
          {myMoves > 0 && <span className="rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: PT.green, color: PT.onGreen }}>{myMoves} your move</span>}
        </h2>
        <Link href="/daily" className="text-[12px] font-extrabold uppercase tracking-wider" style={{ color: PT.green }}>All</Link>
      </div>
      {live && (
        <Link href="/live" className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full" style={{ background: PT.red }} />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>
              Live vs {live.color === 'w' ? live.game.black.username : live.game.white.username}
            </b>
            <span className="block text-[12px]" style={{ color: PT.muted }}>{live.game.timeControl.label} · in progress</span>
          </span>
          <span className="shrink-0 text-[12px] font-extrabold" style={{ color: PT.green }}>Resume</span>
          <ChevronRight size={16} style={{ color: PT.muted }} />
        </Link>
      )}
      {sorted.slice(0, 4).map(g => {
        const white = g.whiteUserId === me;
        const yours = g.turnUserId === me;
        const bank = g.turnUserId === g.whiteUserId ? g.whiteBankMs : g.blackBankMs;
        const left = bank - (Date.now() + offset - new Date(g.lastMoveAt).getTime());
        return (
          <Link key={g.id} href={`/daily/${g.id}`} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
            <CalendarDays size={16} className="shrink-0" style={{ color: yours ? PT.green : PT.muted }} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>vs {white ? g.blackUsername : g.whiteUsername}</b>
              <span className="block text-[12px]" style={{ color: PT.muted }}>Daily · {TC[g.timeControl] ?? g.timeControl}{g.drawOfferFrom ? ' · draw offer' : ''}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[12px] font-extrabold" style={{ color: yours ? PT.green : PT.muted }}>{yours ? 'Your move' : 'Their move'}</span>
              <span className="block text-[11px]" style={{ color: left < 3_600_000 ? PT.red : PT.muted }}>{formatLeft(left)}</span>
            </span>
            <ChevronRight size={16} style={{ color: PT.muted }} />
          </Link>
        );
      })}
    </section>
  );
}
