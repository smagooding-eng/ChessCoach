import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { LayoutDashboard, Import, History, BrainCircuit, GraduationCap, Swords, LogOut, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { username, logout } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/import', label: 'Import Games', icon: Import },
    { href: '/games', label: 'My Games', icon: History },
    { href: '/analysis', label: 'AI Analysis', icon: BrainCircuit },
    { href: '/courses', label: 'My Courses', icon: GraduationCap },
    { href: '/opponents', label: 'Opponent Scout', icon: Swords },
  ];

  const NavContent = () => (
    <>
      <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className="block" onClick={() => setMobileOpen(false)}>
              <div className={cn(
                "relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer font-medium",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(202,138,4,0.15)]"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}>
                <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "")} />
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute left-0 w-1 h-8 bg-primary rounded-r-full"
                  />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto border-t border-white/5">
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-secondary/50">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Logged in as</span>
            <span className="text-sm font-bold text-foreground truncate max-w-[100px]">{username}</span>
          </div>
          <button
            onClick={() => logout()}
            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 glass-panel border-r h-screen sticky top-0 z-40 flex-col">
        <div className="p-6 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Chess Coach" className="w-10 h-10 object-contain" />
          <h1 className="text-xl font-display font-bold text-gradient">Chess Coach</h1>
        </div>
        <NavContent />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 glass-panel border-b border-white/10 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Chess Coach" className="w-7 h-7 object-contain" />
          <span className="font-display font-bold text-gradient text-base">Chess Coach</span>
        </div>
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="p-2 rounded-xl bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="md:hidden fixed top-0 left-0 z-50 h-full w-72 glass-panel border-r border-white/10 flex flex-col"
            >
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Chess Coach" className="w-10 h-10 object-contain" />
                  <h1 className="text-xl font-display font-bold text-gradient">Chess Coach</h1>
                </div>
                <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <NavContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 min-h-screen overflow-x-hidden p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
