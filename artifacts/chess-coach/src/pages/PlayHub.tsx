import React from 'react';
import { Link } from 'wouter';
import { ChevronRight, Bot, Play, Swords, CalendarDays } from 'lucide-react';
import { BOTS } from '@/lib/chess-bot';
import { useBotAvatar, useBotName } from '@/lib/botAvatars';
import { useUser } from '@/hooks/use-user';
import { RD } from '@/lib/redesignTheme';
import { RedesignHeader } from '@/components/RedesignHeader';
import { scene } from '@/components/PhotoHero';
import { useSiteImg } from '@/hooks/use-app-config';

// "Play Chess" hub (redesign). Only offers what the app can actually do:
//  - Play a Bot: the real roster (count and rating range read from BOTS).
//  - Play a Friend: two players on this device (the existing Local Play).
//  - Play Online: live games with matchmaking and challenge links.
//  - Daily Games: 1 / 3 / 7 days per move, with push notifications.
export function PlayHub() {
  const { authUser } = useUser();
  const botAvatar = useBotAvatar();
  const botName = useBotName();
  const siteImg = useSiteImg();
  const lowest = Math.min(...BOTS.map((b) => b.rating));
  const highest = Math.max(...BOTS.map((b) => b.rating));

  const rows: { href: string; title: string; sub: string; icon: React.ReactNode; tint: string; show: boolean; img: string }[] = [
    { href: '/practice', title: 'Play a Bot', sub: `${BOTS.length} opponents • ${lowest}–${highest} ELO`, icon: <Bot size={22} />, tint: '#5BA8FF', show: true, img: 'play-bot' },
    { href: '/play/local', title: 'Play a Friend', sub: 'Two players, one device', icon: <Play size={22} />, tint: RD.green, show: true, img: 'play-friend' },
    { href: '/live', title: 'Play Online', sub: 'Live 5–15 min games · challenge a friend', icon: <Swords size={22} />, tint: RD.gold, show: !!authUser, img: 'play-online' },
    { href: '/daily', title: 'Daily Games', sub: '1, 3 or 7 days per move', icon: <CalendarDays size={22} />, tint: '#A98BFF', show: !!authUser, img: 'play-daily' },
  ];

  return (
    <div className="min-h-screen px-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid grid-cols-1 w-full max-w-[560px] gap-3 lg:max-w-[1000px]">
        <RedesignHeader title="Play Chess" backHref="/" />

        <section className="grid gap-3 lg:grid-cols-2">
          {rows.filter((r) => r.show).map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="relative flex min-h-[104px] items-center gap-3.5 overflow-hidden rounded-[20px] p-4 transition-transform active:scale-[.99]"
              style={{ background: RD.card, border: `1px solid ${RD.border}` }}
            >
              <img src={siteImg(scene(r.img))} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '75% center' }} />
              <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.95) 0%, rgba(5,10,11,.8) 42%, rgba(5,10,11,.1) 100%)' }} />
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-[14px]" style={{ background: 'rgba(5,10,11,.55)', color: r.tint, border: `1px solid ${r.tint}55` }}>{r.icon}</span>
              <span className="relative min-w-0 flex-1">
                <b className="block text-[16px] font-bold">{r.title}</b>
                <span className="block text-[12.5px]" style={{ color: RD.muted }}>{r.sub}</span>
              </span>
              <ChevronRight size={18} className="relative shrink-0" style={{ color: RD.text }} />
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
                <img src={botAvatar(b)} alt={botName(b)} className="h-14 w-14 rounded-full object-cover" style={{ border: `2px solid ${RD.border}`, background: RD.cardLight }} loading="lazy" />
                <span className="w-full truncate text-[12px] font-bold">{botName(b)}</span>
                <span className="text-[11px]" style={{ color: RD.muted }}>{b.rating}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
