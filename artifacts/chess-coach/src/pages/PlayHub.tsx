import React from 'react';
import { Link } from 'wouter';
import { ChevronRight, Bot, Play, Swords, Trophy } from 'lucide-react';
import { BOTS } from '@/lib/chess-bot';
import { useBotAvatar, useBotName } from '@/lib/botAvatars';
import { useUser } from '@/hooks/use-user';
import { RD } from '@/lib/redesignTheme';
import { RedesignHeader } from '@/components/RedesignHeader';
import { scene } from '@/components/PhotoHero';
import { useSiteImg } from '@/hooks/use-app-config';
import { ChallengeInbox } from '@/components/play/OpenChallenges';
import { ActiveGamesCard } from '@/components/play/ActiveGamesCard';
import { usePhotoLook } from '@/context/SettingsContext';
import { SiteStatsLine, HappeningNow } from '@/components/SiteStats';

// "Play Chess" hub (redesign). Only offers what the app can actually do:
//  - Play a Bot: the real roster (count and rating range read from BOTS).
//  - Play a Friend: two players on this device (the existing Local Play).
//  - Play Online: live games with matchmaking and challenge links.
//  - Daily Games: 1 / 3 / 7 days per move, with push notifications.
//  - Tournaments: create one (arena or knockout) and share its link.
export function PlayHub() {
  const { authUser } = useUser();
  const botAvatar = useBotAvatar();
  const botName = useBotName();
  const siteImg = useSiteImg();
  const photoLook = usePhotoLook();
  const lowest = Math.min(...BOTS.map((b) => b.rating));
  const highest = Math.max(...BOTS.map((b) => b.rating));

  // Online first (live and daily games live together there), then local, then bots.
  const rows: { href: string; title: string; sub: string; icon: React.ReactNode; tint: string; show: boolean; img: string }[] = [
    { href: '/live', title: 'Play Online', sub: 'Live and daily games · challenge a friend', icon: <Swords size={22} />, tint: RD.green, show: !!authUser, img: 'play-online' },
    { href: '/tournaments', title: 'Tournaments', sub: 'Join one, follow standings, or create one for your club', icon: <Trophy size={22} />, tint: RD.green, show: !!authUser, img: 'play-daily' },
    { href: '/play/local', title: 'Play Local', sub: 'Two players, one device', icon: <Play size={22} />, tint: RD.green, show: true, img: 'play-friend' },
    { href: '/practice', title: 'Play Bots', sub: `${BOTS.length} opponents • ${lowest}–${highest} ELO`, icon: <Bot size={22} />, tint: RD.green, show: true, img: 'play-bot' },
  ];

  return (
    <div className="min-h-screen px-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid grid-cols-1 w-full max-w-[560px] gap-3 lg:max-w-[1000px]">
        <RedesignHeader title="Play Chess" backHref="/" />
        <div className="flex flex-col gap-1.5">
          <HappeningNow />
          <SiteStatsLine className="px-1 text-[12px]" style={{ color: RD.muted }} max={2} />
        </div>
        {authUser && <ChallengeInbox />}
        {authUser && <div><ActiveGamesCard /></div>}

        <section className="grid gap-3 lg:grid-cols-2">
          {rows.filter((r) => r.show).map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className={`relative flex items-center gap-3.5 overflow-hidden rounded-[20px] p-4 transition-transform active:scale-[.99] ${photoLook ? '' : 'min-h-[104px]'}`}
              style={{ background: RD.card, border: `1px solid ${RD.border}` }}
            >
              {!photoLook && <img src={siteImg(scene(r.img))} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '75% center' }} />}
              {!photoLook && <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.95) 0%, rgba(5,10,11,.8) 42%, rgba(5,10,11,.1) 100%)' }} />}
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
          {/* Every bot at once (wraps, no sideways scrolling); tap one to play it. */}
          <div className="grid grid-cols-5 gap-x-1.5 gap-y-3">
            {BOTS.map((b) => (
              <Link key={b.name} href={`/practice?bot=${b.rating}`} className="flex min-w-0 flex-col items-center gap-1 text-center transition-transform active:scale-95" aria-label={`Play ${botName(b)} (${b.rating})`}>
                <img src={botAvatar(b)} alt="" className="h-12 w-12 rounded-full object-cover min-[400px]:h-14 min-[400px]:w-14" style={{ border: `2px solid ${RD.border}`, background: RD.cardLight }} loading="lazy" />
                <span className="w-full truncate text-[11px] font-bold leading-tight">{botName(b)}</span>
                <span className="text-[10.5px] leading-none" style={{ color: RD.muted }}>{b.rating}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
