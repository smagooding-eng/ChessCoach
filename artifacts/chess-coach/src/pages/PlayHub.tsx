import React from 'react';
import { Link } from 'wouter';
import { ChevronRight, Bot, Play, Swords } from 'lucide-react';
import { BOTS } from '@/lib/chess-bot';
import { useUser } from '@/hooks/use-user';
import { RD } from '@/lib/redesignTheme';

// "Play Chess" hub (redesign). Only offers what the app can actually do:
//  - Play a Bot: the real roster (count and rating range read from BOTS).
//  - Play a Friend: two players on this device (the existing Local Play).
//  - Play Online: shown to admins only, because /live is admin-only today.
// The mockup's online "Quick Match Settings" (time control / colour /
// Find a Game) and "share a link" friend games need matchmaking /
// correspondence UI that doesn't exist yet, so they're intentionally absent.
export function PlayHub() {
  const { authUser } = useUser();
  const lowest = Math.min(...BOTS.map((b) => b.rating));
  const highest = Math.max(...BOTS.map((b) => b.rating));

  const rows: { href: string; title: string; sub: string; icon: React.ReactNode; tint: string; show: boolean }[] = [
    { href: '/practice', title: 'Play a Bot', sub: `${BOTS.length} opponents • ${lowest}–${highest} ELO`, icon: <Bot size={22} />, tint: '#5BA8FF', show: true },
    { href: '/play/local', title: 'Play a Friend', sub: 'Two players, one device', icon: <Play size={22} />, tint: RD.green, show: true },
    { href: '/live', title: 'Play Online', sub: 'Live games (admin preview)', icon: <Swords size={22} />, tint: RD.gold, show: !!authUser?.isAdmin },
  ];

  return (
    <div className="-m-4 min-h-screen px-3 pt-3 md:-m-6 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid w-full max-w-[560px] gap-3">
        <div className="px-1">
          <h1 className="text-[24px] font-extrabold tracking-tight">Play Chess</h1>
          <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>Pick an opponent and start a game.</p>
        </div>

        <section className="grid gap-3">
          {rows.filter((r) => r.show).map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="flex items-center gap-3.5 rounded-[20px] p-4 transition-transform active:scale-[.99]"
              style={{ background: RD.card, border: `1px solid ${RD.border}` }}
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px]" style={{ background: `${r.tint}22`, color: r.tint, border: `1px solid ${r.tint}44` }}>{r.icon}</span>
              <span className="min-w-0 flex-1">
                <b className="block text-[16px] font-bold">{r.title}</b>
                <span className="block text-[12.5px]" style={{ color: RD.muted }}>{r.sub}</span>
              </span>
              <ChevronRight size={18} className="shrink-0" style={{ color: RD.muted }} />
            </Link>
          ))}
        </section>

        <section className="rounded-[20px] p-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold">Meet the bots</h2>
            <Link href="/practice" className="text-[12px] font-extrabold uppercase tracking-wider" style={{ color: RD.green }}>Choose →</Link>
          </div>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {BOTS.map((b) => (
              <Link key={b.name} href="/practice" className="flex w-[78px] shrink-0 flex-col items-center gap-1.5 text-center">
                <img src={b.avatar} alt="" className="h-14 w-14 rounded-full object-cover" style={{ border: `2px solid ${RD.border}`, background: RD.cardLight }} loading="lazy" />
                <span className="w-full truncate text-[12px] font-bold">{b.name}</span>
                <span className="text-[11px]" style={{ color: RD.muted }}>{b.rating}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
