import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { LayoutDashboard, Import, History, BrainCircuit, GraduationCap, Swords, BookOpen, LogOut, MoreHorizontal, ChevronRight, Bot, Crown, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

const CHESSCOM_GREEN = '#81b64c';
const BG_DARK = '#262421';
const BG_SIDEBAR = '#1e1c1a';
const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const BORDER_COLOR = 'rgba(255,255,255,0.06)';

const PRIMARY_NAV = [
  { href: '/',          label: 'Home',      icon: LayoutDashboard },
  { href: '/games',     label: 'Games',     icon: History },
  { href: '/analysis',  label: 'Analysis',  icon: BrainCircuit },
  { href: '/courses',   label: 'Courses',   icon: GraduationCap },
  { href: '/endgames',  label: 'Endgames',  icon: Trophy },
  { href: '/openings',  label: 'Openings',  icon: BookOpen },
];

const SECONDARY_NAV = [
  { href: '/practice',     label: 'Practice Bots',   icon: Bot },
  { href: '/import',       label: 'Import Games',    icon: Import },
  { href: '/opponents',    label: 'Opponent Scout',  icon: Swords },
  { href: '/subscription', label: 'Subscription',    icon: Crown },
];

const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

function PlayerAvatar({ avatar, username, size = 'md' }: { avatar?: string; username?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 28 : size === 'lg' ? 44 : 34;
  if (avatar) {
    return <img src={avatar} alt={username} className="rounded-md object-cover" style={{ width: dim, height: dim, border: `2px solid rgba(129,182,76,0.3)` }} />;
  }
  return (
    <div className="rounded-md flex items-center justify-center shrink-0"
      style={{ width: dim, height: dim, background: 'rgba(129,182,76,0.12)', border: `2px solid rgba(129,182,76,0.25)` }}>
      <span className="font-black" style={{ color: CHESSCOM_GREEN, fontSize: dim * 0.35 }}>{username?.[0]?.toUpperCase()}</span>
    </div>
  );
}

function SidebarLink({ item, isActive }: { item: typeof ALL_NAV[0]; isActive: boolean }) {
  return (
    <Link href={item.href} className="block">
      <div className={cn(
        "relative flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 cursor-pointer text-[13px] font-semibold",
      )} style={{
        background: isActive ? 'rgba(129,182,76,0.12)' : 'transparent',
        color: isActive ? CHESSCOM_GREEN : TEXT_MUTED,
      }}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = TEXT_LIGHT; } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = TEXT_MUTED; } }}>
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full" style={{ background: CHESSCOM_GREEN }} />
        )}
        <item.icon className="w-4 h-4 shrink-0" />
        {item.label}
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { username, logout, isAuthenticated, authLogout, isPremium, subscription, authUser } = useUser();
  const { player } = useChessPlayer(username ?? undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const handleLogout = isAuthenticated ? authLogout : logout;

  const displayRating = player?.rating;

  const moreItems = [...PRIMARY_NAV.slice(4), ...SECONDARY_NAV];
  const activeMore = moreItems.find(i => location === i.href || location.startsWith(i.href + '/'));
  const isMoreActive = !!activeMore;

  useEffect(() => { setMoreOpen(false); }, [location]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: BG_DARK }}>

      <aside className="hidden md:flex w-52 h-screen sticky top-0 z-40 flex-col" style={{ background: BG_SIDEBAR, borderRight: `1px solid ${BORDER_COLOR}` }}>
        <div className="px-4 pt-4 pb-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}>
          <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="ChessScout.net" className="w-7 h-7 object-contain" />
          <h1 className="text-base font-black text-gradient">ChessScout.net</h1>
        </div>

        <nav className="flex-1 px-2.5 py-2.5 space-y-0.5 overflow-y-auto">
          <p className="text-[9px] font-black uppercase tracking-widest px-3 mb-1.5 mt-1" style={{ color: 'rgba(158,155,152,0.5)' }}>Main</p>
          {PRIMARY_NAV.map(item => (
            <SidebarLink key={item.href} item={item} isActive={location === item.href} />
          ))}
          <p className="text-[9px] font-black uppercase tracking-widest px-3 mt-3 mb-1.5" style={{ color: 'rgba(158,155,152,0.5)' }}>Tools</p>
          {SECONDARY_NAV.map(item => (
            <SidebarLink key={item.href} item={item} isActive={location === item.href} />
          ))}
        </nav>

        <div className="p-2.5" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
          <div className="flex items-center justify-between px-2 py-2 rounded-lg" style={{ background: BG_CARD }}>
            <Link href="/profile" className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
              <PlayerAvatar avatar={player?.avatar} username={username ?? ''} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate leading-tight" style={{ color: TEXT_LIGHT }}>{username}</p>
                {displayRating && (
                  <p className="text-[10px] font-bold leading-tight" style={{ color: CHESSCOM_GREEN }}>{displayRating} ELO</p>
                )}
              </div>
            </Link>
            <button onClick={() => handleLogout()} className="p-1.5 rounded transition-colors shrink-0 hover:bg-red-400/10" style={{ color: TEXT_MUTED }} title="Sign out"
              onMouseEnter={e => (e.currentTarget.style.color = '#dc4343')}
              onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <header className="md:hidden flex items-center justify-between px-4 h-12 sticky top-0 z-50" style={{ background: `${BG_SIDEBAR}f5`, borderBottom: `1px solid ${BORDER_COLOR}`, backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="ChessScout.net" className="w-6 h-6 object-contain" />
          <span className="font-black text-gradient text-sm">ChessScout.net</span>
        </div>
        <Link href="/profile" className="flex items-center gap-2 active:opacity-70 transition-opacity">
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold leading-tight" style={{ color: TEXT_LIGHT }}>{username}</span>
            {displayRating && <span className="text-[10px] font-bold leading-tight" style={{ color: CHESSCOM_GREEN }}>{displayRating}</span>}
          </div>
          <PlayerAvatar avatar={player?.avatar} username={username ?? ''} size="sm" />
        </Link>
      </header>

      <main className="flex-1 min-h-screen overflow-x-hidden pb-20 md:pb-6 md:px-5 md:pt-5">
        <div className="md:max-w-5xl md:mx-auto">
          {subscription.status === 'free_trial' && subscription.trialDaysLeft != null && !authUser?.isAdmin && (
            <Link href="/subscription" className="block mb-3 mx-3 md:mx-0">
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg text-sm transition-colors"
                style={{ background: 'rgba(234,166,49,0.1)', border: '1px solid rgba(234,166,49,0.2)', color: '#eaa631' }}>
                <span>
                  <Crown className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                  Free trial: {subscription.trialDaysLeft} day{subscription.trialDaysLeft === 1 ? '' : 's'} left
                </span>
                <span className="text-xs font-semibold opacity-70">Subscribe &rarr;</span>
              </div>
            </Link>
          )}
          {children}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bottom-nav-safe" style={{ background: `${BG_SIDEBAR}f8`, borderTop: `1px solid ${BORDER_COLOR}`, backdropFilter: 'blur(16px)' }}>
        <div className="flex items-stretch">
          {PRIMARY_NAV.slice(0, 4).map(item => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className="relative flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 min-h-[52px] transition-all active:scale-95">
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full" style={{ background: CHESSCOM_GREEN }} />
                  )}
                  <item.icon className="w-5 h-5 transition-transform" style={{ color: isActive ? CHESSCOM_GREEN : TEXT_MUTED, transform: isActive ? 'scale(1.1)' : 'scale(1)' }} />
                  <span className="text-[10px] leading-none font-bold" style={{ color: isActive ? CHESSCOM_GREEN : TEXT_MUTED, opacity: isActive ? 1 : 0.6 }}>{item.label}</span>
                </div>
              </Link>
            );
          })}
          <button onClick={() => setMoreOpen(o => !o)} className="flex-1">
            <div className="relative flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 min-h-[52px] transition-all active:scale-95">
              {isMoreActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full" style={{ background: CHESSCOM_GREEN }} />}
              {React.createElement(activeMore?.icon ?? MoreHorizontal, {
                className: "w-5 h-5",
                style: { color: isMoreActive ? CHESSCOM_GREEN : TEXT_MUTED, transform: isMoreActive ? 'scale(1.1)' : 'scale(1)' }
              })}
              <span className="text-[10px] leading-none font-bold" style={{ color: isMoreActive ? CHESSCOM_GREEN : TEXT_MUTED, opacity: isMoreActive ? 1 : 0.6 }}>
                {activeMore?.label ?? 'More'}
              </span>
            </div>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              key="more-backdrop"
              className="md:hidden fixed inset-0 z-[60]"
              style={{ background: 'rgba(0,0,0,0.6)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              key="more-sheet"
              className="md:hidden fixed bottom-0 left-0 right-0 z-[70] rounded-t-2xl"
              style={{ background: BG_CARD, borderTop: `1px solid ${BORDER_COLOR}` }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mt-2.5" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <nav className="px-3 pt-3 pb-8 space-y-0.5">
                {moreItems.map(item => {
                  const active = location === item.href || location.startsWith(item.href + '/');
                  return (
                    <Link key={item.href} href={item.href} className="block">
                      <div className="flex items-center gap-3 px-3.5 py-3 rounded-lg transition-colors"
                        style={{
                          background: active ? 'rgba(129,182,76,0.1)' : 'transparent',
                          color: active ? CHESSCOM_GREEN : TEXT_LIGHT,
                        }}>
                        <item.icon className="w-5 h-5" />
                        <span className="font-semibold text-sm">{item.label}</span>
                        {active && <ChevronRight className="w-4 h-4 ml-auto" />}
                      </div>
                    </Link>
                  );
                })}
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
                  <button
                    onClick={() => { setMoreOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg active:bg-red-500/10 transition-colors"
                    style={{ color: '#dc4343' }}
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-semibold text-sm">Sign Out</span>
                  </button>
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
