import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { BoardStyleTipHost } from '@/components/BoardStyleTip';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { RealtimeBridge } from "@/components/RealtimeBridge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/context/UserContext";
import { SettingsProvider, useSettings, BG_PHOTOS } from "@/context/SettingsContext";
// The four bottom-bar sections (Home, Play, Games, Analysis) are bundled up
// front rather than code-split: swiping between them must show the next
// page straight away, never a loading screen first.
import { DashboardRedesign } from "@/pages/DashboardRedesign";
import { useKidMode, isKidsPath } from "@/lib/kids/kidMode";
import { LearnSync } from "@/lib/learnSync";
import { axonTrack } from "@/lib/axon";
import { PlayHub } from "@/pages/PlayHub";
import { GamesRedesign } from "@/pages/GamesRedesign";
import { AnalysisRedesign } from "@/pages/AnalysisRedesign";
import { ImportStatusWatcher } from "@/components/ImportStatusWatcher";
import { AutoPushPrompt } from "@/components/AutoPushPrompt";
import { useDashboardRedesignFlag } from "@/hooks/use-app-config";
import { BackgroundJobsWatcher } from "@/components/BackgroundJobsWatcher";
import { AudioAutoplayUnlock } from "@/components/AudioAutoplayUnlock";
import { Layout } from "@/components/Layout";
import { useUser } from "@/hooks/use-user";
import React, { useEffect, Component, Suspense, lazy, type ReactNode } from "react";
import { PageLoader } from "@/components/PageLoader";
import { PublicShell } from "@/components/PublicShell";
import { apiFetch } from "@/lib/api";

function ErrorFallback({ error, fallbackNav, onReset }: { error: Error | null; fallbackNav: string; onReset: () => void }) {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="text-5xl">♟</div>
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-md">{error?.message ?? 'An unexpected error occurred.'}</p>
      <button
        onClick={() => {
          onReset();
          navigate(fallbackNav);
        }}
        className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
      >
        Go back
      </button>
    </div>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode; fallbackNav?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; fallbackNav?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          fallbackNav={this.props.fallbackNav ?? '/'}
          onReset={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}

// After a new deploy, a tab that was already open still points at the OLD
// page bundles, which no longer exist on the server -- so opening any page it
// hasn't loaded yet fails ("most pages don't load", usually on a desktop tab
// left open across releases). When a page bundle fails to download, reload once
// to pick up the new release; the guard stops a reload loop if the failure is
// something else.
const CHUNK_RELOAD_KEY = 'cs_chunk_reload_at';
export function reloadForNewRelease(): boolean {
  try {
    const last = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0', 10);
    if (Date.now() - last < 15000) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch { /* storage blocked: still try once */ }
  window.location.reload();
  return true;
}
function lazyRetry<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => factory().catch((err) => {
    if (reloadForNewRelease()) return new Promise<{ default: T }>(() => {}); // page is reloading
    throw err;
  }));
}
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewRelease()) e.preventDefault();
  });
}

// Pages — lazy-loaded so each page's JS only downloads when that route is
// actually visited, instead of every page (including rarely-used ones like
// Admin and ScanPosition) being bundled into the initial page load.
const Setup = lazyRetry(() => import("@/pages/Setup").then(m => ({ default: m.Setup })));
const LandingPage = lazyRetry(() => import("@/pages/LandingPage").then(m => ({ default: m.LandingPage })));
const MobileSetup = lazyRetry(() => import("@/pages/MobileSetup").then(m => ({ default: m.MobileSetup })));
const ScoutShare = lazyRetry(() => import("@/pages/ScoutShare").then(m => ({ default: m.ScoutShare })));
const ArticlesIndex = lazyRetry(() => import("@/pages/Articles").then(m => ({ default: m.ArticlesIndex })));
const PublicPlayersIndex = lazyRetry(() => import("@/pages/PublicPlayers").then(m => ({ default: m.PublicPlayersIndex })));
const PublicPlayerPage = lazyRetry(() => import("@/pages/PublicPlayers").then(m => ({ default: m.PublicPlayerPage })));
const ArticlePage = lazyRetry(() => import("@/pages/Articles").then(m => ({ default: m.ArticlePage })));
const ShareCard = lazyRetry(() => import("@/pages/ShareCard").then(m => ({ default: m.ShareCard })));
const DownloadPage = lazyRetry(() => import("@/pages/Download"));
const SettingsPage = lazyRetry(() => import("@/pages/Settings"));
const ScanArchivePage = lazyRetry(() => import("@/pages/ScanArchive"));
const PrivacyPage = lazyRetry(() => import("@/pages/Privacy"));
const RafflePage = lazyRetry(() => import("@/pages/Raffle"));
const RaffleRulesPage = lazyRetry(() => import("@/pages/RaffleRules"));
const AffiliatePage = lazyRetry(() => import("@/pages/Affiliate"));
const TrapsPage = lazyRetry(() => import("@/pages/Traps"));
const BeginnerCoursesPage = lazyRetry(() => import("@/pages/BeginnerCourses"));
const KidsHomePage = lazyRetry(() => import("@/pages/kids/KidsHome"));
const BeginnerPathPage = lazyRetry(() => import("@/pages/learn/BeginnerPath"));
const BeginnerLessonPlayPage = lazyRetry(() => import("@/pages/learn/BeginnerLessonPlay"));
const KidsWorldPage = lazyRetry(() => import("@/pages/kids/KidsWorld"));
const KidsPlayPage = lazyRetry(() => import("@/pages/kids/KidsPlay"));
const KidsGamePage = lazyRetry(() => import("@/pages/kids/KidsGame"));
const BeginnerCourseDetailPage = lazyRetry(() => import("@/pages/BeginnerCourseDetail"));
const BeginnerLessonPage = lazyRetry(() => import("@/pages/BeginnerLesson"));
const TrapTrainingPage = lazyRetry(() => import("@/pages/TrapTraining"));
const TermsPage = lazyRetry(() => import("@/pages/Terms"));
const CreditsPage = lazyRetry(() => import("@/pages/Credits"));
const VsAimchessPage = lazyRetry(() => import("@/pages/VsAimchess"));
const PricingPage = lazyRetry(() => import("@/pages/Pricing"));
const VsImproveMyChessPage = lazyRetry(() => import("@/pages/VsImproveMyChess"));
const VsFreeAnalysisPage = lazyRetry(() => import("@/pages/VsFreeAnalysis"));
const Dashboard = lazyRetry(() => import("@/pages/Dashboard").then(m => ({ default: m.Dashboard })));
// Picks between the current dashboard and the new design concept based
// on the GLOBAL dashboard-redesign flag (admin-controlled, same value
// for every user -- see use-app-config.ts) -- both stay fully intact,
// this just decides which one renders at "/". Defined here (not inside
// Dashboard.tsx itself) so switching designs doesn't require loading
// the other design's whole module too. This used to read a per-account
// SettingsContext preference; replaced with the global flag per
// explicit instruction that this should apply to all users, not just
// whichever account had flipped their own switch.
function DashboardRouter() {
  const { enabled } = useDashboardRedesignFlag();
  return enabled ? <DashboardRedesign /> : <Dashboard />;
}
const Import = lazyRetry(() => import("@/pages/Import").then(m => ({ default: m.Import })));
const Games = lazyRetry(() => import("@/pages/Games").then(m => ({ default: m.Games })));
// Same global flag as DashboardRouter above -- bulk review and the H2H
// search mode only exist on the classic Games page for now, so this
// switch is purely cosmetic for anyone who hasn't touched those features.
function GamesRouter() {
  const { enabled } = useDashboardRedesignFlag();
  return enabled ? <GamesRedesign /> : <Games />;
}
const GameReplay = lazyRetry(() => import("@/pages/GameReplay").then(m => ({ default: m.GameReplay })));
const Analysis = lazyRetry(() => import("@/pages/Analysis").then(m => ({ default: m.Analysis })));
function AnalysisRouter() {
  const { enabled } = useDashboardRedesignFlag();
  return enabled ? <AnalysisRedesign /> : <Analysis />;
}
const Courses = lazyRetry(() => import("@/pages/Courses").then(m => ({ default: m.Courses })));
const CourseDetail = lazyRetry(() => import("@/pages/CourseDetail").then(m => ({ default: m.CourseDetail })));
const Endgames = lazyRetry(() => import("@/pages/Endgames").then(m => ({ default: m.Endgames })));
const WeaknessDetail = lazyRetry(() => import("@/pages/WeaknessDetail").then(m => ({ default: m.WeaknessDetail })));
const OpponentAnalysis = lazyRetry(() => import("@/pages/OpponentAnalysis").then(m => ({ default: m.OpponentAnalysis })));
const Openings = lazyRetry(() => import("@/pages/Openings").then(m => ({ default: m.Openings })));
const OpeningDetail = lazyRetry(() => import("@/pages/OpeningDetail").then(m => ({ default: m.OpeningDetail })));
const PracticeBots = lazyRetry(() => import("@/pages/PracticeBots").then(m => ({ default: m.PracticeBots })));
const LocalPlay = lazyRetry(() => import("@/pages/LocalPlay").then(m => ({ default: m.LocalPlay })));
// /play is the Play hub when the redesign is on; the original Local Play
// board otherwise. The board itself is always reachable at /play/local.
function PlayRouter() {
  const { enabled } = useDashboardRedesignFlag();
  return enabled ? <PlayHub /> : <LocalPlay />;
}
const LivePlay = lazyRetry(() => import("@/pages/LivePlay").then(m => ({ default: m.LivePlay })));
const FriendsPage = lazyRetry(() => import("@/pages/Friends").then(m => ({ default: m.Friends })));
const MessagesPage = lazyRetry(() => import("@/pages/Messages").then(m => ({ default: m.Messages })));
const TournamentPage = lazyRetry(() => import("@/pages/Tournament").then(m => ({ default: m.Tournament })));
const CreateTournamentPage = lazyRetry(() => import("@/pages/CreateTournament").then(m => ({ default: m.CreateTournament })));
const TournamentsIndexPage = lazyRetry(() => import("@/pages/TournamentsIndex").then(m => ({ default: m.TournamentsIndex })));
const LiveHistory = lazyRetry(() => import("@/pages/LiveHistory").then(m => ({ default: m.LiveHistory })));
const GameLookup = lazyRetry(() => import("@/pages/GameLookup").then(m => ({ default: m.GameLookup })));
const Subscription = lazyRetry(() => import("@/pages/Subscription").then(m => ({ default: m.Subscription })));
const Profile = lazyRetry(() => import("@/pages/Profile").then(m => ({ default: m.Profile })));
const Puzzles = lazyRetry(() => import("@/pages/Puzzles").then(m => ({ default: m.Puzzles })));
const ShopPage = lazyRetry(() => import("@/pages/Shop").then(m => ({ default: m.ShopPage })));
const SolvedPuzzles = lazyRetry(() => import("@/pages/SolvedPuzzles"));
const ScanPosition = lazyRetry(() => import("@/pages/ScanPosition").then(m => ({ default: m.ScanPosition })));
const Admin = lazyRetry(() => import("@/pages/Admin").then(m => ({ default: m.Admin })));
const Welcome = lazyRetry(() => import("@/pages/Welcome").then(m => ({ default: m.Welcome })));
const NotFound = lazyRetry(() => import("@/pages/not-found"));
const DailyGame = lazyRetry(() => import("@/pages/DailyGame").then(m => ({ default: m.DailyGame })));
const NotificationsPage = lazyRetry(() => import("@/pages/Notifications").then(m => ({ default: m.Notifications })));
const ChallengePage = lazyRetry(() => import("@/pages/Challenge").then(m => ({ default: m.Challenge })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Protected Route Wrapper
function ProtectedRoute({ component: Component, fallbackNav, requireAdmin, skipWelcomeRedirect, fullscreen }: { component: React.ComponentType; fallbackNav?: string; requireAdmin?: boolean; skipWelcomeRedirect?: boolean; fullscreen?: boolean }) {
  const { username, isLoaded, isAuthenticated, isAuthLoading, authUser } = useUser();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (isLoaded && !isAuthLoading && !username && !isAuthenticated) {
      // Signed out on a tournament link: come back to it after signing up.
      const m = location.match(/^\/tournaments\/([a-z0-9]+)$/i);
      if (m && m[1] !== 'new') { try { localStorage.setItem('cs_pending_tournament', m[1]); } catch { /* ignore */ } }
      navigate('/setup', { replace: true } as never);
      return;
    }
    if (requireAdmin && !isAuthLoading && isAuthenticated && !authUser?.isAdmin) {
      navigate('/', { replace: true } as never);
      return;
    }
    if (
      !skipWelcomeRedirect &&
      !isAuthLoading &&
      isAuthenticated &&
      authUser &&
      !authUser.chesscomUsername &&
      !authUser.lichessUsername &&
      !authUser.scoutUsername &&
      location !== '/welcome'
    ) {
      navigate('/welcome', { replace: true } as never);
    }
  }, [isLoaded, username, navigate, isAuthenticated, isAuthLoading, requireAdmin, authUser, skipWelcomeRedirect, location]);

  if (!isLoaded || isAuthLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <div className="text-4xl animate-bounce">&#9820;</div>
        <div className="w-32 h-1 bg-primary/15 rounded-full overflow-hidden">
          <div className="h-full w-[30%] bg-primary rounded-full animate-[barSlide_1.4s_ease-in-out_infinite]"
            style={{ animation: 'barSlide 1.4s ease-in-out infinite' }} />
        </div>
      </div>
    );
  }
  if (!username && !isAuthenticated) return null;
  if (requireAdmin && !authUser?.isAdmin) return null;

  return (
    <Layout fullscreen={fullscreen}>
      <ErrorBoundary fallbackNav={fallbackNav ?? '/'}>
        <Component />
      </ErrorBoundary>
    </Layout>
  );
}

const PDashboard     = () => <ProtectedRoute component={DashboardRouter} />;
const PImport        = () => <ProtectedRoute component={Import} />;
const PGames         = () => <ProtectedRoute component={GamesRouter} />;
const PGameReplay    = () => <ProtectedRoute component={GameReplay} fallbackNav="/games" />;
const PAnalysis      = () => <ProtectedRoute component={AnalysisRouter} />;
const PWeakness      = () => <ProtectedRoute component={WeaknessDetail} fallbackNav="/analysis" />;
const PCourses       = () => <ProtectedRoute component={Courses} />;
const PCourseDetail  = () => <ProtectedRoute component={CourseDetail} fallbackNav="/courses" fullscreen />;
const PEndgames      = () => <ProtectedRoute component={Endgames} />;
const POpenings      = () => <ProtectedRoute component={Openings} />;
const POpeningDetail = () => <ProtectedRoute component={OpeningDetail} fallbackNav="/openings" />;
const POpponents     = () => <ProtectedRoute component={OpponentAnalysis} />;
const PPracticeBots  = () => <ProtectedRoute component={PracticeBots} />;
const PLocalPlay     = () => <ProtectedRoute component={PlayRouter} />;
const PLocalBoard    = () => <ProtectedRoute component={LocalPlay} />;
const PLivePlay      = () => <ProtectedRoute component={LivePlay} />;
const PFriends       = () => <ProtectedRoute component={FriendsPage} />;
const PMessages      = () => <ProtectedRoute component={MessagesPage} />;
// Tournaments are public: signed-out visitors get them in a light frame,
// signed-in players inside the app as usual.
function PublicOrApp({ component: Component, skipWelcomeRedirect, fullscreen }: { component: React.ComponentType; skipWelcomeRedirect?: boolean; fullscreen?: boolean }) {
  const { isAuthenticated, isAuthLoading } = useUser();
  if (isAuthLoading) return <PageLoader />;
  if (!isAuthenticated) return <PublicShell><Suspense fallback={<PageLoader />}><Component /></Suspense></PublicShell>;
  return <ProtectedRoute component={Component} skipWelcomeRedirect={skipWelcomeRedirect} fullscreen={fullscreen} />;
}
const PTournament    = () => <PublicOrApp component={TournamentPage} />;
const PTournaments   = () => <PublicOrApp component={TournamentsIndexPage} />;
const PCreateTournament = () => <ProtectedRoute component={CreateTournamentPage} />;
// Daily games are a tab of Play Online now; /daily (old links, notifications) opens that tab.
const DailyTab = () => <LivePlay initialTab="daily" />;
const PDailyGames    = () => <ProtectedRoute component={DailyTab} />;
const PDailyGame     = () => <ProtectedRoute component={DailyGame} />;
const PNotifications = () => <ProtectedRoute component={NotificationsPage} />;
const PTraps         = () => <ProtectedRoute component={TrapsPage} />;
const PTrapTraining  = () => <ProtectedRoute component={TrapTrainingPage} />;
const PBeginnerCourses = () => <ProtectedRoute component={BeginnerCoursesPage} requireAdmin />;
// Chess for Kids works without signing in (progress stays on the device), so
// a child locked in Kid Mode is never bounced to a login screen.
const kidsPage = (C: React.ComponentType) => () => <ErrorBoundary fallbackNav="/kids"><C /></ErrorBoundary>;
const PKidsHome = kidsPage(KidsHomePage);
const PKidsWorld = kidsPage(KidsWorldPage);
const PKidsPlay = kidsPage(KidsPlayPage);
const PKidsGame = kidsPage(KidsGamePage);
// The Beginner Path is open to visitors too (a shareable way in: try a lesson
// before signing up). Signed in, it skips the link-your-account redirect,
// since brand-new players may not have a chess.com / Lichess account yet.
const PBeginnerPath = () => <PublicOrApp component={BeginnerPathPage} skipWelcomeRedirect />;
const PBeginnerLessonPlay = () => <PublicOrApp component={BeginnerLessonPlayPage} skipWelcomeRedirect fullscreen />;
const PBeginnerCourseDetail = () => <ProtectedRoute component={BeginnerCourseDetailPage} requireAdmin />;
const PBeginnerLesson = () => <ProtectedRoute component={BeginnerLessonPage} requireAdmin />;
const PLiveHistory   = () => <ProtectedRoute component={LiveHistory} fallbackNav="/live" />;
const PGameLookup    = () => <ProtectedRoute component={GameLookup} />;
const PSubscription  = () => <ProtectedRoute component={Subscription} />;
const PProfile       = () => <ProtectedRoute component={Profile} />;
const PPuzzles       = () => <ProtectedRoute component={Puzzles} />;
const PShop          = () => <ProtectedRoute component={ShopPage} />;
const PSolvedPuzzles = () => <ProtectedRoute component={SolvedPuzzles} />;
const PScanPosition  = () => <ProtectedRoute component={ScanPosition} />;
const PAdmin         = () => <ProtectedRoute component={Admin} />;
const PWelcome       = () => <ProtectedRoute component={Welcome} skipWelcomeRedirect />;

function getVisitorId(): string {
  const key = 'chess_coach_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function PageTracker() {
  const [location] = useLocation();
  // AppLovin Axon: a page view on every screen change (never for kids pages).
  useEffect(() => { if (!isKidsPath(location)) axonTrack('page_view'); }, [location]);
  // A referral code on any shared link (?ref=CODE) is kept for signup.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref && /^[A-Za-z0-9_-]{3,40}$/.test(ref)) localStorage.setItem('chessscout_ref', ref.toUpperCase());
    } catch { /* ignore */ }
  }, [location]);
  useEffect(() => {
    apiFetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      // automated: the browser says it's driven by a script (headless/test tools)
      // ownTool: our own screenshot tools add ?cs_shot=1 (Share Kit, store and link-preview shots)
      body: JSON.stringify({ path: location, visitorId: getVisitorId(), automated: navigator.webdriver === true, ownTool: new URLSearchParams(window.location.search).has('cs_shot') }),
    }).catch(() => {});
  }, [location]);
  return null;
}

// Scroll the window (and the main scroll container, if any) to the top
// whenever the route path changes, so each page starts at the top.
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      window.scrollTo(0, 0);
    }
    const main = document.querySelector('main');
    if (main && typeof main.scrollTo === 'function') {
      main.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location]);
  return null;
}

// Every device now gets the full LandingPage. It used to be desktop-only: phones
// (including the installed app) were sent to the minimal one-screen sign-up, so a
// landing-page redesign was never visible on mobile. That minimal screen is kept,
// not removed -- open /setup?quick=1 to get it (e.g. for a deep link from the app).
function SetupRouter() {
  const quick = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('quick') === '1';
  return quick ? <MobileSetup /> : <LandingPage />;
}

function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true } as never); }, [to, navigate]);
  return null;
}

// Kid Mode: while it's on, the only pages are the kids ones. Anything else
// (a bookmark, the back button, a notification link) goes back to /kids.
function KidModeLock() {
  const [location, navigate] = useLocation();
  useEffect(() => { navigate('/kids', { replace: true } as never); }, [location, navigate]);
  return null;
}

function Router() {
  const kidMode = useKidMode();
  const [where] = useLocation();
  if (kidMode && !isKidsPath(where)) return <KidModeLock />;
  return (
    <><ScrollToTop /><PageTracker /><BoardStyleTipHost /><Switch>
      <Route path="/setup" component={SetupRouter} />
      <Route path="/scout/:data" component={ScoutShare} />
      <Route path="/players" component={PublicPlayersIndex} />
      <Route path="/players/:slug" component={PublicPlayerPage} />
      <Route path="/learn" component={ArticlesIndex} />
      <Route path="/learn/:slug" component={ArticlePage} />
      <Route path="/share/:data" component={ShareCard} />
      <Route path="/download" component={DownloadPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/scan-archive" component={ScanArchivePage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/challenge/:code" component={ChallengePage} />
      <Route path="/raffle" component={RafflePage} />
      <Route path="/raffle-rules" component={RaffleRulesPage} />
      <Route path="/affiliate" component={AffiliatePage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/credits" component={CreditsPage} />
      <Route path="/vs/aimchess" component={VsAimchessPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/vs/improve-my-chess" component={VsImproveMyChessPage} />
      <Route path="/vs/free-chess-analysis" component={VsFreeAnalysisPage} />
      <Route path="/welcome" component={PWelcome} />

      {/* Protected Routes — stable named components prevent remounting on every render */}
      <Route path="/"            component={PDashboard} />
      <Route path="/import"      component={PImport} />
      <Route path="/games"       component={PGames} />
      <Route path="/games/:id"   component={PGameReplay} />
      <Route path="/analysis"    component={PAnalysis} />
      <Route path="/analysis/:id" component={PWeakness} />
      <Route path="/courses"     component={PCourses} />
      <Route path="/courses/:id" component={PCourseDetail} />
      <Route path="/endgames"    component={PEndgames} />
      <Route path="/openings"        component={POpenings} />
      <Route path="/openings/:eco"   component={POpeningDetail} />
      <Route path="/opponents"       component={POpponents} />
      <Route path="/practice"        component={PPracticeBots} />
      <Route path="/play"            component={PLocalPlay} />
      <Route path="/play/local"      component={PLocalBoard} />
      <Route path="/live"            component={PLivePlay} />
      <Route path="/friends"         component={PFriends} />
      <Route path="/messages/:userId" component={PMessages} />
      <Route path="/tournaments" component={PTournaments} />
      <Route path="/tournaments/new" component={PCreateTournament} />
      <Route path="/tournaments/:id" component={PTournament} />
      <Route path="/daily"           component={PDailyGames} />
      <Route path="/notifications"   component={PNotifications} />
      <Route path="/daily/:id"       component={PDailyGame} />
      <Route path="/correspondence/:id" component={PDailyGame} />
      <Route path="/traps/:id" component={PTrapTraining} />
<Route path="/admin/beginner-courses/:id" component={PBeginnerCourseDetail} />
<Route path="/admin/beginner-courses" component={PBeginnerCourses} />
      <Route path="/beginner/:unit/:lesson" component={PBeginnerLessonPlay} />
      <Route path="/beginner" component={PBeginnerPath} />
      <Route path="/kids/benny" component={PKidsGame} />
      <Route path="/kids/:world/:level" component={PKidsPlay} />
      <Route path="/kids/:world" component={PKidsWorld} />
      <Route path="/kids" component={PKidsHome} />
      {/* old admin-preview addresses keep working */}
      <Route path="/admin/beginner/:unit/:lesson">{(p) => <RedirectTo to={`/beginner/${p.unit}/${p.lesson}`} />}</Route>
      <Route path="/admin/beginner"><RedirectTo to="/beginner" /></Route>
      <Route path="/admin/kids/:a/:b">{(p) => <RedirectTo to={`/kids/${p.a}/${p.b}`} />}</Route>
      <Route path="/admin/kids/:a">{(p) => <RedirectTo to={`/kids/${p.a}`} />}</Route>
      <Route path="/admin/kids"><RedirectTo to="/kids" /></Route>
<Route path="/admin/beginner-lessons/:id" component={PBeginnerLesson} />
      <Route path="/traps"     component={PTraps} />
      <Route path="/live/history"    component={PLiveHistory} />
      <Route path="/lookup"          component={PGameLookup} />
      <Route path="/puzzles"          component={PPuzzles} />
      <Route path="/shop"             component={PShop} />
      <Route path="/puzzles/solved"   component={PSolvedPuzzles} />
      <Route path="/scan"             component={PScanPosition} />
      <Route path="/admin"            component={PAdmin} />
      <Route path="/subscription"    component={PSubscription} />
      <Route path="/profile"          component={PProfile} />

      <Route component={NotFound} />
    </Switch></>
  );
}

function PageLoadingFallback() {
  return <PageLoader />;
}

function AppBackgroundWrapper({ children }: { children: React.ReactNode }) {
  const { appBackgroundCss, uiStyle, bgPhoto, cardGlass } = useSettings();
  const photo = uiStyle === 'photo' ? BG_PHOTOS.find((p) => p.id === bgPhoto) ?? BG_PHOTOS[0] : null;
  // Photo look: the html class switches every card to see-through (index.css).
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('cs-photo', !!photo);
    if (photo) el.dataset.glass = cardGlass; else delete el.dataset.glass;
    // bright backdrops (white, green) get firmer cards and shadowed text
    if (photo?.tone === 'light') el.dataset.tone = 'light'; else delete el.dataset.tone;
  }, [photo, cardGlass]);
  // Per-backdrop blur/shade (plain colours and boards aren't blurred).
  const backdropVars = photo ? {
    ...(photo.blur != null ? { '--photo-blur': `${photo.blur}px` } : {}),
    ...(photo.shade != null ? { '--photo-shade': String(photo.shade) } : {}),
  } as React.CSSProperties : undefined;
  return (
    <div style={{ minHeight: '100vh', ...(photo ? {} : appBackgroundCss) }}>
      {photo && (
        <div className="cs-photo-backdrop" aria-hidden="true" style={backdropVars}>
          <div className="cs-photo-backdrop-img" style={photo.css ? { background: photo.css } : { backgroundImage: `url("${photo.src}")` }} />
          <div className="cs-photo-backdrop-shade" />
        </div>
      )}
      {children}
    </div>
  );
}

/** Grown-up pop-ups (notification prompts, live challenges, import toasts) stay out of Kid Mode. */
function NotInKidMode({ children }: { children: ReactNode }) {
  return useKidMode() ? null : <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <UserProvider>
          <SettingsProvider>
            <AppBackgroundWrapper>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Suspense fallback={<PageLoadingFallback />}>
                    <Router />
                  </Suspense>
                  <NotInKidMode>
                    <ImportStatusWatcher />
                    <BackgroundJobsWatcher />
                    <AutoPushPrompt />
                    <RealtimeBridge />
                  </NotInKidMode>
                  <AudioAutoplayUnlock />
                  <LearnSync />
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </AppBackgroundWrapper>
          </SettingsProvider>
        </UserProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
