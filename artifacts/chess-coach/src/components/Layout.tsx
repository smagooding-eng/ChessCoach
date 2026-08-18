import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useLiveRatings, bestLiveRating } from '@/hooks/use-live-ratings';
import { LayoutDashboard, Import, History, BrainCircuit, GraduationCap, Swords, BookOpen, LogOut, MoreHorizontal, ChevronRight, Bot, Crown, Trophy, Play, Search, Download, Puzzle, User, Settings, CreditCard, Camera, Shield } from 'lucide-react';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { InstallGuide } from '@/components/InstallGuide';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

const CHESSCOM_GREEN = '#81b64c';
const BG_DARK = '#262421';
const BG_SIDEBAR = '#1e1c1a';
const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const BORDER_COLOR = 'rgba(129,182,76,0.06)';

const PRIMARY_NAV = [
  { href: '/',          label: 'Home',            icon: LayoutDashboard },
  { href: '/opponents', label: 'Opponent Scout',  icon: Swords },
  { href: '/games',     label: 'Games',           icon: History },
  { href: '/analysis',  label: 'Analysis',        icon: BrainCircuit },
  { href: '/puzzles',   label: 'Puzzles',         icon: Puzzle, badge: 'BETA' },
  { href: '/lookup',    label: 'Game Lookup',     icon: Search },
  { href: '/play',      label: 'Play Local',      icon: Play },
  { href: '/scan',      label: 'Scan Position',   icon: Camera, badge: 'NEW' },
];

const SECONDARY_NAV = [
  { href: '/practice',     label: 'Practice Bots',   icon: Bot },
  { href: '/import',       label: 'Import Games',    icon: Import },
  { href: '/courses',      label: 'Courses',         icon: GraduationCap, badge: 'BETA' },
  { href: '/endgames',     label: 'Endgames',        icon: Trophy,        badge: 'BETA' },
  { href: '/openings',     label: 'Openings',        icon: BookOpen,      badge: 'BETA' },
  { href: '/subscription', label: 'Subscription',    icon: Crown },
];

const ADMIN_NAV = [
  { href: '/admin', label: 'Admin', icon: Shield },
];

const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV, ...ADMIN_NAV];

function PlayerAvatar({ avatar, username, size = 'md' }: { avatar?: string; username?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 28 : size === 'lg' ? 44 : 34;
  if (avatar) {
    return <img src={avatar} alt={username} className="rounded-full object-cover" style={{ width: dim, height: dim, border: `2px solid rgba(129,182,76,0.3)` }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: dim, height: dim, background: 'rgba(129,182,76,0.12)', border: `2px solid rgba(129,182,76,0.25)` }}>
      <span className="font-black" style={{ color: CHESSCOM_GREEN, fontSize: dim * 0.35 }}>{username?.[0]?.toUpperCase()}</span>
    </div>
  );
}

function SidebarLink({ item, isActive }: { item: typeof ALL_NAV[0]; isActive: boolean }) {
  const badge = (item as any).badge as string | undefined;
  return (
    <Link href={item.href} className="block">
      <div className={cn(
        "relative flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer text-[13px] font-semibold",
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
        {badge && (
          <span className="ml-auto px-1.5 py-px rounded text-[8px] font-black tracking-wider" style={{ background: 'rgba(234,166,49,0.15)', color: '#eaa631' }}>
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { username, logout, isAuthenticated, authLogout, isPremium, subscription, authUser } = useUser();
  const { player } = useChessPlayer(username ?? undefined);
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const handleLogout = isAuthenticated ? authLogout : logout;
  const { showGuide, setShowGuide, dismissInstall, platform } = usePwaInstall();

  useEffect(() => { setMoreOpen(false); setProfileOpen(false); }, [location]);

  // Fixes a confirmed iOS standalone-PWA bug: on first mount after sign-in,
  // the browser can fall back to a 980px virtual viewport instead of the
  // device's real width, incorrectly triggering the desktop (md:) layout.
  // A prior attempt (toggling the existing meta tag's content attribute)
  // did not resolve this — WebKit largely reads the viewport meta tag once
  // at initial parse and often ignores later attribute changes on the same
  // element. This instead removes the tag entirely and inserts a fresh one,
  // forcing a genuine re-parse.
  const [diag, setDiag] = useState<string | null>(null);
  useEffect(() => {
    if (sessionStorage.getItem('viewport-diag-dismissed')) return;
    const before = window.innerWidth;

    const old = document.querySelector('meta[name="viewport"]');
    const content = old?.getAttribute('content') || 'width=device-width,initial-scale=1';
    if (old) old.remove();
    const fresh = document.createElement('meta');
    fresh.setAttribute('name', 'viewport');
    fresh.setAttribute('content', content);
    document.head.appendChild(fresh);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const after = window.innerWidth;
        setDiag(`before=${before} after=${after} standalone=${window.matchMedia('(display-mode: standalone)').matches}`);
      });
    });
  }, []);

  const ratings: number[] = [];
  if (multiElo.chesscom?.hasData) ratings.push(multiElo.chesscom.currentRating);
  if (multiElo.lichess?.hasData) ratings.push(multiElo.lichess.currentRating);
  const { data: liveRatingsData } = useLiveRatings();
  const liveBest = bestLiveRating(liveRatingsData?.ratings);
  const scoutElo = liveBest
    ? liveBest.rating
    : (ratings.length > 0
        ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
        : (player?.rating ?? null));

  const moreItems = [...PRIMARY_NAV.slice(4), ...SECONDARY_NAV, ...(authUser?.isAdmin ? ADMIN_NAV : [])];
  const activeMore = moreItems.find(i => location === i.href || location.startsWith(i.href + '/'));
  const isMoreActive = !!activeMore;

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: BG_DARK }}>
      {diag && (
        <div
          onClick={() => { sessionStorage.setItem('viewport-diag-dismissed', '1'); setDiag(null); }}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: '#000', color: '#0f0', fontSize: '10px', padding: '4px 8px', wordBreak: 'break-all', fontFamily: 'monospace' }}
        >
          {diag} (tap to dismiss)
        </div>
      )}

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
          {authUser?.isAdmin && (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest px-3 mt-3 mb-1.5" style={{ color: 'rgba(158,155,152,0.5)' }}>Admin</p>
              {ADMIN_NAV.map(item => (
                <SidebarLink key={item.href} item={item} isActive={location === item.href} />
              ))}
            </>
          )}
        </nav>

        <div className="p-2.5" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
          <div className="flex items-center gap-1.5 px-2 py-2 rounded-xl" style={{ background: BG_CARD }}>
            <Link href="/profile" className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity">
              <PlayerAvatar avatar={player?.avatar} username={username ?? ''} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate leading-tight" style={{ color: TEXT_LIGHT }}>{username}</p>
                {scoutElo != null && (
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-[8px] font-black uppercase tracking-[0.14em] leading-none" style={{ color: CHESSCOM_GREEN }}>Scout</span>
                    <span className="text-[11px] font-black leading-none" style={{ color: TEXT_LIGHT }}>{scoutElo}</span>
                  </div>
                )}
              </div>
            </Link>
            <Link href="/download" className="p-1.5 rounded transition-colors shrink-0 hover:bg-green-400/10" style={{ color: CHESSCOM_GREEN }} title="Download App">
              <Download className="w-3.5 h-3.5" />
            </Link>
            <button onClick={() => handleLogout()} className="p-1.5 rounded transition-colors shrink-0 hover:bg-red-400/10" style={{ color: TEXT_MUTED }} title="Sign out"
              onMouseEnter={e => (e.currentTarget.style.color = '#dc4343')}
              onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 h-12" style={{ background: `${BG_SIDEBAR}f5`, borderBottom: `1px solid ${BORDER_COLOR}`, backdropFilter: 'blur(16px)' }}>
          <Link href="/" className="flex items-center gap-2 active:opacity-70 transition-opacity">
            <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="ChessScout.net" className="w-6 h-6 object-contain" />
            <span className="font-black text-gradient text-sm">ChessScout.net</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/download" className="p-1.5 rounded active:scale-95 transition-all" style={{ color: CHESSCOM_GREEN }} title="Download App">
              <Download className="w-5 h-5" />
            </Link>
            <button onClick={() => setProfileOpen(o => !o)} className="flex items-center gap-2 active:opacity-70 transition-opacity">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-xs font-bold leading-none" style={{ color: TEXT_LIGHT }}>{username}</span>
                {scoutElo != null && (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[8px] font-black uppercase tracking-[0.14em] leading-none" style={{ color: CHESSCOM_GREEN }}>Scout</span>
                    <span className="text-[11px] font-black leading-none" style={{ color: TEXT_LIGHT }}>{scoutElo}</span>
                  </div>
                )}
              </div>
              <PlayerAvatar avatar={player?.avatar} username={username ?? ''} size="sm" />
            </button>
          </div>
        </div>
        <AnimatePresence>
          {profileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
              style={{ background: BG_CARD, borderBottom: `1px solid ${BORDER_COLOR}` }}
            >
              <div className="px-3 py-2 space-y-0.5">
                <Link href="/profile" className="block">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors active:bg-white/5" style={{ color: TEXT_LIGHT }}>
                    <User className="w-4.5 h-4.5" style={{ color: TEXT_MUTED }} />
                    <span className="font-semibold text-sm">Profile</span>
                  </div>
                </Link>
                <Link href="/subscription" className="block">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors active:bg-white/5" style={{ color: TEXT_LIGHT }}>
                    <Crown className="w-4.5 h-4.5" style={{ color: '#eaa631' }} />
                    <span className="font-semibold text-sm">Subscription</span>
                    {isPremium && <span className="ml-auto text-[9px] font-black px-1.5 py-px rounded" style={{ background: 'rgba(129,182,76,0.15)', color: CHESSCOM_GREEN }}>PRO</span>}
                  </div>
                </Link>
                <div className="pt-1 mt-1" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
                  <button
                    onClick={() => { setProfileOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-red-500/10 transition-colors"
                    style={{ color: '#dc4343' }}
                  >
                    <LogOut className="w-4.5 h-4.5" />
                    <span className="font-semibold text-sm">Sign Out</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 min-h-screen overflow-x-hidden pb-20 md:pb-6 md:px-5 md:pt-5">
        <div className="md:max-w-5xl md:mx-auto">
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
                  const badge = (item as any).badge as string | undefined;
                  return (
                    <Link key={item.href} href={item.href} className="block">
                      <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-colors"
                        style={{
                          background: active ? 'rgba(129,182,76,0.1)' : 'transparent',
                          color: active ? CHESSCOM_GREEN : TEXT_LIGHT,
                        }}>
                        <item.icon className="w-5 h-5" />
                        <span className="font-semibold text-sm">{item.label}</span>
                        {badge && (
                          <span className="px-1.5 py-px rounded text-[9px] font-black tracking-wider" style={{ background: 'rgba(234,166,49,0.15)', color: '#eaa631' }}>
                            {badge}
                          </span>
                        )}
                        {active && <ChevronRight className="w-4 h-4 ml-auto" />}
                      </div>
                    </Link>
                  );
                })}
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
                  <Link href="/download" onClick={() => setMoreOpen(false)} className="block">
                    <div className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl active:bg-green-500/10 transition-colors" style={{ color: CHESSCOM_GREEN }}>
                      <Download className="w-5 h-5" />
                      <span className="font-semibold text-sm">Download App</span>
                    </div>
                  </Link>
                  <button
                    onClick={() => { setMoreOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl active:bg-red-500/10 transition-colors"
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

      {showGuide && (
        <InstallGuide
          platform={platform}
          onClose={() => setShowGuide(false)}
          onDismiss={dismissInstall}
        />
      )}

    </div>
  );
}
