import React from 'react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { LayoutDashboard, Import, History, BrainCircuit, GraduationCap, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { username, logout } = useUser();

  const navItems = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/import', label: 'Import Games', icon: Import },
    { href: '/games', label: 'My Games', icon: History },
    { href: '/analysis', label: 'AI Analysis', icon: BrainCircuit },
    { href: '/courses', label: 'My Courses', icon: GraduationCap },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Sidebar */}
      <aside className="w-full md:w-64 glass-panel border-r border-t-0 md:h-screen sticky top-0 z-40 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Chess Coach" className="w-10 h-10 object-contain" />
          <h1 className="text-xl font-display font-bold text-gradient">Chess Coach</h1>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer font-medium",
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
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen overflow-x-hidden p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
