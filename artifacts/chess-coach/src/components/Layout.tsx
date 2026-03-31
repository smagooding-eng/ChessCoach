import React from 'react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { LayoutDashboard, Import, History, BrainCircuit, GraduationCap, Swords, BookOpen, LogOut, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const PRIMARY_NAV = [
  { href: '/',          label: 'Overview',  icon: LayoutDashboard },
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

function SidebarLink({ item, isActive, onClick }: {
  item: typeof ALL_NAV[0];
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={item.href} className="block" onClick={onClick}>
      <div className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 cursor-pointer text-sm font-medium",
        isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}>
        {isActive && (
          <motion.div
            layoutId="activeNavBar"
            className="absolute left-0 w-0.5 h-6 bg-primary rounded-r-full"
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 border-r border-border/60 bg-card/50 h-screen sticky top-0 z-40 flex-col">
        {/* Logo */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-2.5 border-b border-border/40">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Chess Coach" className="w-8 h-8 object-contain" />
          <h1 className="text-lg font-display font-bold text-gradient">Chess Coach</h1>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-3 mb-2">Main</p>
          {PRIMARY_NAV.map(item => (
            <SidebarLink key={item.href} item={item} isActive={location === item.href} />
          ))}
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-3 mt-4 mb-2">Tools</p>
          {SECONDARY_NAV.map(item => (
            <SidebarLink key={item.href} item={item} isActive={location === item.href} />
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-border/40">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-secondary/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{username?.[0]?.toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Signed in</p>
                <p className="text-xs font-bold text-foreground truncate">{username}</p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-card/90 backdrop-blur-md border-b border-border/60 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Chess Coach" className="w-6 h-6 object-contain" />
          <span className="font-display font-bold text-gradient text-sm">Chess Coach</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">{username?.[0]?.toUpperCase()}</span>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 min-h-screen overflow-x-hidden px-4 pt-4 pb-24 md:pb-8 md:px-6 md:pt-6">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border/60 bottom-nav-safe">
        <div className="flex items-stretch">
          {PRIMARY_NAV.slice(0, 4).map(item => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className={cn(
                  "relative flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
                  )}
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium leading-none">{item.label}</span>
                </div>
              </Link>
            );
          })}
          {/* 5th slot — shows active overflow page, or defaults to Openings */}
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
                  "relative flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
                  )}
                  <DisplayIcon className="w-5 h-5" />
                  <span className="text-[10px] font-medium leading-none">{label}</span>
                </div>
              </Link>
            );
          })()}
        </div>
      </nav>

    </div>
  );
}
