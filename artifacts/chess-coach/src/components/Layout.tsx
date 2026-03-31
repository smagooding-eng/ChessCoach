import React from 'react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { LayoutDashboard, Import, History, BrainCircuit, GraduationCap, Swords, BookOpen, LogOut, MoreHorizontal, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const PRIMARY_NAV = [
  { href: '/',          label: 'Home',      icon: LayoutDashboard },
  { href: '/games',     label: 'Games',     icon: History },
  { href: '/analysis',  label: 'Analysis',  icon: BrainCircuit },
  { href: '/courses',   label: 'Courses',   icon: GraduationCap },
  { href: '/openings',  label: 'Openings',  icon: BookOpen },
];

const SECONDARY_NAV = [
  { href: '/import',    label: 'Import Games',    icon: Import },
  { href: '/opponents', label: 'Opponent Scout',  icon: Swords },
];

const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

function PlayerAvatar({ avatar, username, size = 'md' }: { avatar?: string; username?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-sm';
  if (avatar) {
    return <img src={avatar} alt={username} className={`${sizeClass} rounded-full object-cover border-2 border-primary/30`} />;
  }
  return (
    <div className={`${sizeClass} rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center shrink-0`}>
      <span className="font-black text-primary">{username?.[0]?.toUpperCase()}</span>
    </div>
  );
}

function SidebarLink({ item, isActive }: { item: typeof ALL_NAV[0]; isActive: boolean }) {
  return (
    <Link href={item.href} className="block">
      <div className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer text-sm font-semibold",
        isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}>
        {isActive && (
          <motion.div
            layoutId="activeNavBar"
            className="absolute left-0 w-0.5 h-5 bg-primary rounded-r-full"
          />
        )}
        <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "")} />
        {item.label}
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { username, logout } = useUser();
  const { player } = useChessPlayer(username ?? undefined);

  const displayRating = player?.rating;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 border-r border-border/60 bg-card/50 h-screen sticky top-0 z-40 flex-col">
        <div className="px-4 pt-5 pb-4 flex items-center gap-2.5 border-b border-border/40">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Chess Coach" className="w-8 h-8 object-contain" />
          <h1 className="text-lg font-display font-black text-gradient">Chess Coach</h1>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest px-3 mb-2">Main</p>
          {PRIMARY_NAV.map(item => (
            <SidebarLink key={item.href} item={item} isActive={location === item.href} />
          ))}
          <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest px-3 mt-4 mb-2">Tools</p>
          {SECONDARY_NAV.map(item => (
            <SidebarLink key={item.href} item={item} isActive={location === item.href} />
          ))}
        </nav>

        {/* Sidebar user footer */}
        <div className="p-3 border-t border-border/40">
          <div className="flex items-center justify-between px-2 py-2.5 rounded-xl bg-secondary/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <PlayerAvatar avatar={player?.avatar} username={username ?? ''} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground truncate leading-tight">{username}</p>
                {displayRating && (
                  <p className="text-[10px] text-primary font-bold leading-tight">{displayRating} ELO</p>
                )}
              </div>
            </div>
            <button onClick={() => logout()} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors shrink-0" title="Sign out">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile native app header ── */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-card/95 backdrop-blur-xl border-b border-border/40 sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Chess Coach" className="w-7 h-7 object-contain" />
          <span className="font-display font-black text-gradient text-base">Chess Coach</span>
        </div>
        <Link href="/profile" className="flex items-center gap-2 active:opacity-70 transition-opacity">
          <div className="flex flex-col items-end">
            <span className="text-xs font-black leading-tight">{username}</span>
            {displayRating && <span className="text-[10px] text-primary font-bold leading-tight">{displayRating} ELO</span>}
          </div>
          <PlayerAvatar avatar={player?.avatar} username={username ?? ''} size="sm" />
        </Link>
      </header>

      {/* ── Main content — full-bleed on mobile ── */}
      <main className="flex-1 min-h-screen overflow-x-hidden pb-24 md:pb-8 md:px-6 md:pt-6">
        <div className="md:max-w-5xl md:mx-auto">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/98 backdrop-blur-xl border-t border-border/50 bottom-nav-safe">
        <div className="flex items-stretch">
          {PRIMARY_NAV.slice(0, 4).map(item => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className={cn(
                  "relative flex flex-col items-center justify-center gap-1 pt-2.5 pb-2 min-h-[56px] transition-all active:scale-95",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-10 rounded-full bg-primary" />
                  )}
                  <item.icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
                  <span className={cn("text-[10px] leading-none font-bold", isActive ? "opacity-100" : "opacity-60")}>{item.label}</span>
                </div>
              </Link>
            );
          })}
          {(() => {
            const moreItems = [PRIMARY_NAV[4], ...SECONDARY_NAV];
            const activeMore = moreItems.find(i => location === i.href);
            const isActive = !!activeMore;
            const DisplayIcon = activeMore?.icon ?? MoreHorizontal;
            const label = activeMore?.label ?? 'More';
            const href = activeMore?.href ?? '/openings';
            return (
              <Link href={href} className="flex-1">
                <div className={cn(
                  "relative flex flex-col items-center justify-center gap-1 pt-2.5 pb-2 min-h-[56px] transition-all active:scale-95",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-10 rounded-full bg-primary" />}
                  <DisplayIcon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
                  <span className={cn("text-[10px] leading-none font-bold", isActive ? "opacity-100" : "opacity-60")}>{label}</span>
                </div>
              </Link>
            );
          })()}
        </div>
      </nav>

    </div>
  );
}
