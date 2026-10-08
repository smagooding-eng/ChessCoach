import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/context/UserContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { ImportStatusWatcher } from "@/components/ImportStatusWatcher";
import { AutoPushPrompt } from "@/components/AutoPushPrompt";
import { useDashboardRedesignFlag } from "@/hooks/use-app-config";
import { BackgroundJobsWatcher } from "@/components/BackgroundJobsWatcher";
import { AudioAutoplayUnlock } from "@/components/AudioAutoplayUnlock";
import { Layout } from "@/components/Layout";
import { useUser } from "@/hooks/use-user";
import React, { useEffect, Component, Suspense, lazy, type ReactNode } from "react";
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
const DashboardRedesign = lazyRetry(() => import("@/pages/DashboardRedesign").then(m => ({ default: m.DashboardRedesign })));
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
const GamesRedesign = lazyRetry(() => import("@/pages/GamesRedesign").then(m => ({ default: m.GamesRedesign })));
// Same global flag as DashboardRouter above -- bulk review and the H2H
// search mode only exist on the classic Games page for now, so this
// switch is purely cosmetic for anyone who hasn't touched those features.
function GamesRouter() {
  const { enabled } = useDashboardRedesignFlag();
  return enabled ? <GamesRedesign /> : <Games />;
}
const GameReplay = lazyRetry(() => import("@/pages/GameReplay").then(m => ({ default: m.GameReplay })));
const Analysis = lazyRetry(() => import("@/pages/Analysis").then(m => ({ default: m.Analysis })));
const AnalysisRedesign = lazyRetry(() => import("@/pages/AnalysisRedesign").then(m => ({ default: m.AnalysisRedesign })));
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
const PlayHub = lazyRetry(() => import("@/pages/PlayHub").then(m => ({ default: m.PlayHub })));
// /play is the Play hub when the redesign is on; the original Local Play
// board otherwise. The board itself is always reachable at /play/local.
function PlayRouter() {
  const { enabled } = useDashboardRedesignFlag();
  return enabled ? <PlayHub /> : <LocalPlay />;
}
const LivePlay = lazyRetry(() => import("@/pages/LivePlay").then(m => ({ default: m.LivePlay })));
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
const PLivePlay      = () => <ProtectedRoute component={LivePlay} requireAdmin />;
const PTraps         = () => <ProtectedRoute component={TrapsPage} />;
const PTrapTraining  = () => <ProtectedRoute component={TrapTrainingPage} />;
const PBeginnerCourses = () => <ProtectedRoute component={BeginnerCoursesPage} requireAdmin />;
const PBeginnerCourseDetail = () => <ProtectedRoute component={BeginnerCourseDetailPage} requireAdmin />;
const PBeginnerLesson = () => <ProtectedRoute component={BeginnerLessonPage} requireAdmin />;
const PLiveHistory   = () => <ProtectedRoute component={LiveHistory} fallbackNav="/live" requireAdmin />;
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
  useEffect(() => {
    apiFetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path: location, visitorId: getVisitorId() }),
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

function Router() {
  return (
    <><ScrollToTop /><PageTracker /><Switch>
      <Route path="/setup" component={SetupRouter} />
      <Route path="/scout/:data" component={ScoutShare} />
      <Route path="/learn" component={ArticlesIndex} />
      <Route path="/learn/:slug" component={ArticlePage} />
      <Route path="/share/:data" component={ShareCard} />
      <Route path="/download" component={DownloadPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/scan-archive" component={ScanArchivePage} />
      <Route path="/privacy" component={PrivacyPage} />
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
      <Route path="/traps/:id" component={PTrapTraining} />
<Route path="/admin/beginner-courses/:id" component={PBeginnerCourseDetail} />
<Route path="/admin/beginner-courses" component={PBeginnerCourses} />
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

function AppBackgroundWrapper({ children }: { children: React.ReactNode }) {
  const { appBackgroundCss } = useSettings();
  return (
    <div style={{ minHeight: '100vh', ...appBackgroundCss }}>
      {children}
    </div>
  );
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
                  <ImportStatusWatcher />
                  <BackgroundJobsWatcher />
                  <AutoPushPrompt />
                  <AudioAutoplayUnlock />
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
