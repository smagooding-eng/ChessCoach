import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { useUnreadCount } from '@/components/RealtimeBridge';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMyAvatar } from '@/components/EditableAvatar';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useDashboardRedesignFlag } from '@/hooks/use-app-config';
import { GooglePlayBadge, PlayLogo } from '@/components/GooglePlayBadge';
import { PLAY_STORE_URL, shouldShowPlayBadge } from '@/lib/playApp';
import { runPageSwipe, pageCanSwipe, swipeAllowedFrom, swipeAllowedLoose } from '@/lib/swipeNav';
import { useLiveRatings, bestLiveRating } from '@/hooks/use-live-ratings';
import { LayoutDashboard, Import, History, BrainCircuit, GraduationCap, Swords, BookOpen, LogOut, MoreHorizontal, ChevronRight, Bot, Crown, Trophy, Play, Search, Download, Puzzle, User, Settings, CreditCard, Camera, Shield, Target, BarChart3 } from 'lucide-react';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { InstallGuide } from '@/components/InstallGuide';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

// Palette is CSS variables with the original values as fallbacks: with the
// redesign toggle OFF nothing sets the --cs-* variables, so every value
// resolves to exactly what it was before. With it ON, index.css's
// `html.cs-redesign` block supplies the new near-black / neon-green set.
const CHESSCOM_GREEN = 'var(--cs-green, #81b64c)';
const BG_DARK = 'var(--cs-bg-dark, #262421)';
const BG_SIDEBAR = 'var(--cs-bg-sidebar, #1e1c1a)';
const BG_CARD = 'var(--cs-bg-card, #302e2b)';
// Pop-up panels (More sheet, profile menu) stay solid even with the see-through photo look.
const PANEL_SOLID = 'var(--cs-panel-solid, var(--cs-bg-card, #302e2b))';
const TEXT_LIGHT = 'var(--cs-text-light, #e8e6e3)';
const TEXT_MUTED = 'var(--cs-text-muted, #9e9b98)';
const BORDER_COLOR = 'var(--cs-border, rgba(129,182,76,0.06))';
// Translucent sidebar backgrounds used to be `${BG_SIDEBAR}f5` / `f8` hex
// alpha suffixes, which can't be built from a var() -- own variables now.
const BG_SIDEBAR_95 = 'var(--cs-sidebar-a95, #1e1c1af5)';
const BG_SIDEBAR_97 = 'var(--cs-sidebar-a97, #1e1c1af8)';

// Inline outline icons for the redesigned nav/header (avoids depending on
// icon names this app doesn't already import elsewhere).
function HouseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function BellIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
// Bottom-nav icons the redesign mockup uses (house / target / swords / bars)
const REDESIGN_NAV_ICON: Record<string, React.ElementType> = {
  '/': HouseIcon,
  '/opponents': Target,
  '/play': Play,
  '/games': Swords,
  '/analysis': BarChart3,
};

const PRIMARY_NAV = [
  // The first four are the bottom bar (and the swipe order): Home, Play, Games, Analysis.
  { href: '/',          label: 'Home',            icon: LayoutDashboard },
  { href: '/play',      label: 'Play',            icon: Play },
  { href: '/games',     label: 'Games',           icon: History },
  { href: '/analysis',  label: 'Analysis',        icon: BrainCircuit },
  { href: '/opponents', label: 'Opponent Scout',  icon: Swords },
  { href: '/puzzles',   label: 'Puzzles',         icon: Puzzle },
  { href: '/lookup',    label: 'Game Lookup',     icon: Search },
  { href: '/scan',      label: 'Scan Position',   icon: Camera, badge: 'NEW' },
];

const SECONDARY_NAV = [
  { href: '/practice',     label: 'Practice Bots',   icon: Bot },
  { href: '/import',       label: 'Import Games',    icon: Import },
  { href: '/courses',      label: 'Courses',         icon: GraduationCap },
  { href: '/endgames',     label: 'Endgames',        icon: Trophy },
  { href: '/openings',     label: 'Openings',        icon: BookOpen },
  { href: '/subscription', label: 'Subscription',    icon: Crown },
  { href: '/settings',     label: 'Settings',        icon: Settings },
];

const ADMIN_NAV = [
  { href: '/admin', label: 'Admin', icon: Shield },
];

const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV, ...ADMIN_NAV];

function PlayerAvatar({ avatar, username, size = 'md' }: { avatar?: string; username?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 28 : size === 'lg' ? 44 : 34;
  if (avatar) {
    return <img src={avatar} alt={username} className="rounded-full object-cover" style={{ width: dim, height: dim, border: '2px solid var(--cs-avatar-border, rgba(129,182,76,0.3))' }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: dim, height: dim, background: 'rgba(255,255,255,.06)', border: '2px solid var(--cs-avatar-border, rgba(129,182,76,0.25))' }}>
      <span className="font-black" style={{ color: CHESSCOM_GREEN, fontSize: dim * 0.35 }}>{username?.[0]?.toUpperCase()}</span>
    </div>
  );
}

function SidebarLink({ item, isActive }: { item: typeof ALL_NAV[0]; isActive: boolean }) {
  const badge = (item as any).badge as string | undefined;
  return (
    <Link href={item.href} className="block">
      <div className={cn(
        "cs-side-link relative flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer text-[13px] font-semibold",
      )} style={{
        background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
        color: isActive ? TEXT_LIGHT : TEXT_MUTED,
      }}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = TEXT_LIGHT; } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = TEXT_MUTED; } }}>
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full" style={{ background: CHESSCOM_GREEN }} />
        )}
        <item.icon className="w-4 h-4 shrink-0" />
        {item.label}
        {badge && (
          <span className="ml-auto px-1.5 py-px rounded text-[8px] font-black tracking-wider" style={{ background: 'rgba(234,166,49,0.35)', color: '#ffffff' }}>
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}

// fullscreen skips the sidebar, mobile header, and bottom nav entirely
// and renders children in a plain 100dvh container with no padding or
// max-width constraint -- for pages like lesson/course playback that
// need the whole viewport for a one-screen, no-scroll layout, where
// persistent app chrome competing for space would defeat the purpose.
export function Layout({ children, fullscreen }: { children: React.ReactNode; fullscreen?: boolean }) {
  const [location, navigateTo] = useLocation();
  const { authUser: layoutAuthUser } = useUser();
  const unreadCount = useUnreadCount();
  // Came from a friend's challenge link while signed out: once signed in
  // (and past onboarding, which needs a linked chess account), go back to it.
  useEffect(() => {
    if (location === '/welcome' || location === '/setup') return;
    if (!layoutAuthUser || (!layoutAuthUser.chesscomUsername && !layoutAuthUser.lichessUsername && !layoutAuthUser.scoutUsername)) return;
    let code: string | null = null;
    let tournament: string | null = null;
    try { code = localStorage.getItem('cs_pending_challenge'); tournament = localStorage.getItem('cs_pending_tournament'); } catch { /* ignore */ }
    if (code) {
      try { localStorage.removeItem('cs_pending_challenge'); } catch { /* ignore */ }
      navigateTo(`/challenge/${code}`);
      return;
    }
    if (tournament) {
      try { localStorage.removeItem('cs_pending_tournament'); } catch { /* ignore */ }
      navigateTo(`/tournaments/${tournament}`);
      return;
    }
    // Any other page they were on when they signed up (shared links, articles…).
    let back: string | null = null;
    try { back = localStorage.getItem('cs_return_to'); } catch { /* ignore */ }
    if (back) {
      try { localStorage.removeItem('cs_return_to'); } catch { /* ignore */ }
      if (back !== location) navigateTo(back);
    }
  }, [location, navigateTo, layoutAuthUser]);
  const { enabled: redesign } = useDashboardRedesignFlag();
  // The redesigned inner screens (games list + game analysis, analysis, puzzles,
  // openings, traps, import, play hub) draw their own header, as in the mockups,
  // so Layout's logo bar is skipped there on mobile. Detail pages that weren't
  // redesigned (an opening, a trap lesson, local play) keep it.
  const pageOwnsHeader = redesign && /^\/(games|analysis|puzzles|openings|traps|import|play|settings|profile|learning)$|^\/games\/\d+$/.test(location);
  // While the redesign toggle is on, <html> carries `cs-redesign`, which
  // index.css uses to swap the whole app's theme (incl. portaled dialogs).
  // Layout only wraps the signed-in app, so public/marketing pages never get it.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('cs-redesign', redesign);
    return () => document.documentElement.classList.remove('cs-redesign');
  }, [redesign]);
  const { username, logout, isAuthenticated, authLogout, isPremium, subscription, authUser, isSubscriptionLoaded } = useUser();
  const freePlan = isSubscriptionLoaded && !!authUser && !isPremium;
  const { player } = useChessPlayer(username ?? undefined);
  const myAvatar = useMyAvatar();
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const [moreOpen, setMoreOpen] = useState(false);

  // Swipe left/right between menus on phones: a page's own tabs first, then
  // the bottom-nav sections (Home, Play, Games, Analysis).
  const mainRef = useRef<HTMLElement | null>(null);
  const swipeState = useRef({ location, moreOpen });
  swipeState.current = { location, moreOpen };
  // The page follows your finger while you swipe; let go past the threshold
  // (or flick) and it slides off while the next page / tab slides in from the
  // other side. Not far enough: it springs back.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const sections = PRIMARY_NAV.slice(0, 4).map((i) => i.href);
    type Start = { x: number; y: number; t: number; ok: boolean; mode: 'unknown' | 'drag' | 'scroll'; target: 'tab' | 'page' | 'none' | null; dir: 1 | -1 };
    let start: Start | null = null;
    let animating = false;
    const W = () => window.innerWidth;
    // What moves: the whole page when going to another section; only the tab
    // content (everything after the page's [data-swipe-tabs] bar) when the
    // swipe changes the page's own tab, so the header and tab bar stay put.
    let moving: HTMLElement[] = [];
    const tabContent = (): HTMLElement[] => {
      const bar = Array.from(el.querySelectorAll<HTMLElement>('[data-swipe-tabs]')).find((b) => b.offsetParent !== null);
      const out: HTMLElement[] = [];
      for (let n = bar?.nextElementSibling ?? null; n; n = n.nextElementSibling) if (n instanceof HTMLElement) out.push(n);
      return out;
    };
    const movingFor = (target: 'tab' | 'page' | 'none') => (target === 'tab' ? tabContent() : [el]);
    const set = (x: number, transition: string | null, list = moving) => {
      for (const m of list) {
        m.style.transition = transition ?? 'none';
        m.style.transform = `translate3d(${x}px,0,0)`;
        m.style.opacity = String(1 - Math.min(Math.abs(x) / W(), 1) * 0.35);
      }
    };
    const clear = (list = moving) => { for (const m of list) { m.style.transition = ''; m.style.transform = ''; m.style.opacity = ''; m.style.willChange = ''; } };
    const pageOnlyHere = () => /^\/opponents(\/|$)/.test(swipeState.current.location);
    const targetFor = (dir: 1 | -1): 'tab' | 'page' | 'none' => {
      if (!pageOnlyHere() && pageCanSwipe(dir)) return 'tab';
      const i = sections.indexOf(swipeState.current.location);
      return i >= 0 && i + dir >= 0 && i + dir < sections.length ? 'page' : 'none';
    };
    const onStart = (e: TouchEvent) => {
      if (animating || e.touches.length !== 1 || window.innerWidth >= 768) { start = null; return; }
      const t = e.touches[0];
      // Leave the screen edges to the phone's own back/forward gestures.
      const edge = t.clientX < 24 || t.clientX > window.innerWidth - 24;
      // Opponent Scout swipes straight to the next/previous page (it has no
      // swipeable tabs), so sideways-scrolling rows there don't block it.
      const ok = !edge && !swipeState.current.moreOpen && (pageOnlyHere() ? swipeAllowedLoose(e.target) : swipeAllowedFrom(e.target));
      start = { x: t.clientX, y: t.clientY, t: Date.now(), ok, mode: 'unknown', target: null, dir: 1 };
    };
    const onMove = (e: TouchEvent) => {
      const s0 = start;
      if (!s0 || !s0.ok || s0.mode === 'scroll') return;
      const t = e.touches[0];
      const dx = t.clientX - s0.x, dy = t.clientY - s0.y;
      if (s0.mode === 'unknown') {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.4) { s0.mode = 'scroll'; return; }
        s0.mode = 'drag';
      }
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      if (s0.target === null || dir !== s0.dir) {
        s0.dir = dir; s0.target = targetFor(dir);
        const next = movingFor(s0.target);
        clear(moving.filter((m) => !next.includes(m)));
        moving = next;
        for (const m of moving) m.style.willChange = 'transform, opacity';
      }
      // Nowhere to go that way: a little rubber-band give only.
      const x = s0.target === 'none' ? dx * 0.18 : dx * 0.92;
      set(x, null);
    };
    const finish = (dir: 1 | -1, target: 'tab' | 'page') => {
      animating = true;
      const outList = moving;
      set(-dir * W(), 'transform 160ms cubic-bezier(.4,0,1,1), opacity 160ms linear', outList);
      window.setTimeout(() => {
        if (target === 'tab') runPageSwipe(dir);
        else navigateTo(sections[sections.indexOf(swipeState.current.location) + dir]);
        // Wait for the new tab / page to render, then bring it in from the other side.
        requestAnimationFrame(() => {
          const inList = target === 'tab' ? tabContent() : [el];
          clear(outList.filter((m) => !inList.includes(m)));
          moving = inList;
          set(dir * W() * 0.35, null, inList);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            set(0, 'transform 260ms cubic-bezier(.2,.8,.2,1), opacity 260ms ease-out', inList);
            window.setTimeout(() => { clear(inList); animating = false; }, 280);
          }));
        });
      }, 160);
    };
    const onEnd = (e: TouchEvent) => {
      const s0 = start; start = null;
      if (!s0 || !s0.ok || s0.mode !== 'drag') return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s0.x;
      const dt = Math.max(1, Date.now() - s0.t);
      const flick = Math.abs(dx) / dt > 0.5 && Math.abs(dx) > 40;
      const far = Math.abs(dx) > W() * 0.28;
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      const target = targetFor(dir);
      if ((flick || far) && target !== 'none' && !swipeState.current.moreOpen) { finish(dir, target); return; }
      // spring back
      const back = moving;
      set(0, 'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease-out', back);
      window.setTimeout(() => { if (!animating) clear(back); }, 240);
    };
    const onCancel = () => { if (start?.mode === 'drag') { const back = moving; set(0, 'transform 200ms ease-out, opacity 200ms ease-out', back); window.setTimeout(() => { if (!animating) clear(back); }, 220); } start = null; };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd); el.removeEventListener('touchcancel', onCancel);
      clear();
    };
  }, [navigateTo]);
  const [profileOpen, setProfileOpen] = useState(false);
  const handleLogout = isAuthenticated ? authLogout : logout;
  const { showGuide, setShowGuide, dismissInstall, platform } = usePwaInstall();

  useEffect(() => { setMoreOpen(false); setProfileOpen(false); }, [location]);

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

  // All the hooks above still run every render regardless of this flag
  // (rules of hooks) -- only the JSX output differs. 100dvh rather than
  // 100vh accounts for mobile browser chrome (address bar, etc.)
  // shrinking the visible viewport, which 100vh does not.
  if (fullscreen) {
    // overflow-y: auto, not hidden -- hidden was the actual cause of the
    // board/intro-card getting cut off, not fixed by it. Content taller
    // than the viewport (the lesson intro card, in particular) was
    // becoming literally invisible rather than scrollable, which is a
    // worse outcome than scrolling: hiding content outright is never
    // the right fallback for "didn't fit." The compact one-screen board
    // layout is still the goal for the interactive lesson/drill steps;
    // this is the safety net for anything that doesn't fit that goal
    // perfectly, not a replacement for it.
    return (
      <div style={{ height: '100dvh', overflowY: 'auto', overflowX: 'hidden', background: BG_DARK }}>
        {children}
      </div>
    );
  }

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
          <p className="text-[9px] font-black uppercase tracking-widest px-3 mt-3 mb-1.5" data-side-label style={{ color: 'rgba(158,155,152,0.5)' }}>Tools</p>
          {SECONDARY_NAV.map(item => (
            <SidebarLink key={item.href} item={item} isActive={location === item.href} />
          ))}
          {authUser?.isAdmin && (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest px-3 mt-3 mb-1.5" data-side-label style={{ color: 'rgba(158,155,152,0.5)' }}>Admin</p>
              {ADMIN_NAV.map(item => (
                <SidebarLink key={item.href} item={item} isActive={location === item.href} />
              ))}
            </>
          )}
        </nav>

        <div className="p-2.5" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
          {freePlan && (
            <Link href="/subscription" className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-extrabold transition-transform active:scale-[.98]"
              style={{ background: 'linear-gradient(180deg,#F2C560,#D99A24)', color: '#1A1205' }}>
              <Crown className="w-4 h-4" /> Go Pro
              <span className="ml-auto text-[10.5px] font-bold opacity-80">$5/mo</span>
            </Link>
          )}
          <div className="flex items-center gap-1.5 px-2 py-2 rounded-xl" style={{ background: BG_CARD }}>
            <Link href="/profile" className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity">
              <PlayerAvatar avatar={myAvatar ?? undefined} username={username ?? ''} size="sm" />
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
            {shouldShowPlayBadge() && (
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded transition-colors shrink-0 hover:bg-white/5" title="Get it on Google Play">
                <PlayLogo size={14} />
              </a>
            )}
            <button onClick={() => handleLogout()} className="p-1.5 rounded transition-colors shrink-0 hover:bg-red-400/10" style={{ color: TEXT_MUTED }} title="Sign out"
              onMouseEnter={e => (e.currentTarget.style.color = '#dc4343')}
              onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {!pageOwnsHeader && (
      <header className="md:hidden sticky top-0 z-50 top-nav-safe" style={{ background: BG_SIDEBAR_95 }}>
        {redesign ? (
          <div className="flex items-center justify-between px-4 h-[60px]" style={{ borderBottom: `1px solid ${BORDER_COLOR}`, backdropFilter: 'blur(16px)' }}>
            <Link href="/" className="flex items-center gap-2.5 active:opacity-70 transition-opacity">
              <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="ChessScout.net" className="w-8 h-8 object-contain" />
              <span className="text-[20px] font-extrabold tracking-tight leading-none" style={{ color: TEXT_LIGHT }}>
                Chess<span style={{ color: CHESSCOM_GREEN }}>Scout</span>.net
              </span>
            </Link>
            <div className="flex items-center gap-0.5">
              {shouldShowPlayBadge() && (
                <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="grid h-10 w-10 place-items-center rounded-full active:bg-white/5" aria-label="Get it on Google Play">
                  <PlayLogo size={20} />
                </a>
              )}
              <Link href="/lookup" className="grid h-10 w-10 place-items-center rounded-full active:bg-white/5" style={{ color: TEXT_LIGHT }} aria-label="Look up a player or game">
                <Search className="w-[22px] h-[22px]" />
              </Link>
              {/* Notifications inbox, with an unread dot */}
              <Link href="/notifications" className="relative grid h-10 w-10 place-items-center rounded-full active:bg-white/5" style={{ color: TEXT_LIGHT }} aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
                <BellIcon className="w-[22px] h-[22px]" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 grid min-w-[17px] h-[17px] place-items-center rounded-full px-1 text-[10px] font-black" style={{ background: '#FF5058', color: '#fff' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
              <button onClick={() => setProfileOpen(o => !o)} className="ml-1.5 active:opacity-70 transition-opacity" aria-label="Account menu">
                <PlayerAvatar avatar={myAvatar ?? undefined} username={username ?? ''} size="md" />
              </button>
            </div>
          </div>
        ) : (
        <div className="flex items-center justify-between px-4 h-12" style={{ borderBottom: `1px solid ${BORDER_COLOR}`, backdropFilter: 'blur(16px)' }}>
          <Link href="/" className="flex items-center gap-2 active:opacity-70 transition-opacity">
            <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="ChessScout.net" className="w-6 h-6 object-contain" />
            <span className="font-black text-gradient text-sm">ChessScout.net</span>
          </Link>
          <div className="flex items-center gap-2">
            {shouldShowPlayBadge() && (
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded active:scale-95 transition-all" title="Get it on Google Play">
                <PlayLogo size={20} />
              </a>
            )}
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
              <PlayerAvatar avatar={myAvatar ?? undefined} username={username ?? ''} size="sm" />
            </button>
          </div>
        </div>
        )}
        <AnimatePresence>
          {profileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
              style={{ background: PANEL_SOLID, borderBottom: `1px solid ${BORDER_COLOR}` }}
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
                    {isPremium && <span className="ml-auto text-[9px] font-black px-1.5 py-px rounded" style={{ background: '#81B64C', color: '#FFFFFF' }}>PRO</span>}
                  </div>
                </Link>
                <div className="pt-1 mt-1" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
                  <button
                    onClick={() => { setProfileOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-red-500/20 transition-colors"
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
      )}

      <main ref={mainRef} className="flex-1 min-h-screen overflow-x-hidden pb-20 md:pb-6 md:px-5 md:pt-5">
        <div className={`md:mx-auto ${redesign ? 'md:max-w-[1280px]' : 'md:max-w-5xl'}`}>
          {children}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bottom-nav-safe" style={{ background: BG_SIDEBAR_97, borderTop: `1px solid ${BORDER_COLOR}`, backdropFilter: 'blur(16px)' }}>
        <div className="flex items-stretch">
          {PRIMARY_NAV.slice(0, 4).map(item => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href + '/'));
            const NavIcon: React.ElementType = redesign ? (REDESIGN_NAV_ICON[item.href] ?? item.icon) : item.icon;
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className="relative flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 min-h-[52px] transition-all active:scale-95">
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full" style={{ background: CHESSCOM_GREEN }} />
                  )}
                  <NavIcon className="w-5 h-5 transition-transform" style={{ color: isActive ? CHESSCOM_GREEN : TEXT_MUTED, transform: isActive ? 'scale(1.1)' : 'scale(1)' }} />
                  <span className="text-[10px] leading-none font-bold" style={{ color: isActive ? CHESSCOM_GREEN : TEXT_MUTED, opacity: isActive ? 1 : 0.6 }}>{redesign && item.href === '/opponents' ? 'Scout' : item.label}</span>
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
              style={{ background: PANEL_SOLID, borderTop: `1px solid ${BORDER_COLOR}` }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mt-2.5" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <nav className="px-3 pt-3 pb-8 space-y-0.5">
                {freePlan && (
                  <Link href="/subscription" onClick={() => setMoreOpen(false)} className="mb-2 block">
                    <div className="flex items-center gap-3 rounded-xl px-3.5 py-3" style={{ background: 'linear-gradient(135deg, rgba(232,180,71,.16), rgba(129,182,76,.06))', border: '1px solid rgba(232,180,71,.4)' }}>
                      <Crown className="w-5 h-5" style={{ color: '#E8B447' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-extrabold" style={{ color: TEXT_LIGHT }}>Go Pro</span>
                        <span className="block text-[11.5px]" style={{ color: TEXT_MUTED }}>AI coach, courses and scouting reports · $5/mo</span>
                      </span>
                      <ChevronRight className="w-4 h-4" style={{ color: '#E8B447' }} />
                    </div>
                  </Link>
                )}
                {moreItems.map(item => {
                  const active = location === item.href || location.startsWith(item.href + '/');
                  const badge = (item as any).badge as string | undefined;
                  return (
                    <Link key={item.href} href={item.href} className="block">
                      <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-colors"
                        style={{
                          background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                          color: TEXT_LIGHT,
                        }}>
                        <item.icon className="w-5 h-5" />
                        <span className="font-semibold text-sm">{item.label}</span>
                        {badge && (
                          <span className="px-1.5 py-px rounded text-[9px] font-black tracking-wider" style={{ background: 'rgba(234,166,49,0.35)', color: '#ffffff' }}>
                            {badge}
                          </span>
                        )}
                        {active && <ChevronRight className="w-4 h-4 ml-auto" />}
                      </div>
                    </Link>
                  );
                })}
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
                  {shouldShowPlayBadge() && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="font-semibold text-sm" style={{ color: TEXT_LIGHT }}>Get the Android app</span>
                      <GooglePlayBadge height={40} />
                    </div>
                  )}
                  <button
                    onClick={() => { setMoreOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl active:bg-red-500/20 transition-colors"
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
