import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/context/UserContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { ImportStatusWatcher } from "@/components/ImportStatusWatcher";
import { BackgroundJobsWatcher } from "@/components/BackgroundJobsWatcher";
import { Layout } from "@/components/Layout";
import { useUser } from "@/hooks/use-user";
import { useEffect, Component, Suspense, lazy, type ReactNode } from "react";
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

// Pages — lazy-loaded so each page's JS only downloads when that route is
// actually visited, instead of every page (including rarely-used ones like
// Admin and ScanPosition) being bundled into the initial page load.
const Setup = lazy(() => import("@/pages/Setup").then(m => ({ default: m.Setup })));
const LandingPage = lazy(() => import("@/pages/LandingPage").then(m => ({ default: m.LandingPage })));
const ScoutShare = lazy(() => import("@/pages/ScoutShare").then(m => ({ default: m.ScoutShare })));
const ArticlesIndex = lazy(() => import("@/pages/Articles").then(m => ({ default: m.ArticlesIndex })));
const ArticlePage = lazy(() => import("@/pages/Articles").then(m => ({ default: m.ArticlePage })));
const ShareCard = lazy(() => import("@/pages/ShareCard").then(m => ({ default: m.ShareCard })));
const DownloadPage = lazy(() => import("@/pages/Download"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const ScanArchivePage = lazy(() => import("@/pages/ScanArchive"));
const PrivacyPage = lazy(() => import("@/pages/Privacy"));
const RafflePage = lazy(() => import("@/pages/Raffle"));
const RaffleRulesPage = lazy(() => import("@/pages/RaffleRules"));
const AffiliatePage = lazy(() => import("@/pages/Affiliate"));
const TermsPage = lazy(() => import("@/pages/Terms"));
const VsAimchessPage = lazy(() => import("@/pages/VsAimchess"));
const PricingPage = lazy(() => import("@/pages/Pricing"));
const VsImproveMyChessPage = lazy(() => import("@/pages/VsImproveMyChess"));
const VsFreeAnalysisPage = lazy(() => import("@/pages/VsFreeAnalysis"));
const Dashboard = lazy(() => import("@/pages/Dashboard").then(m => ({ default: m.Dashboard })));
const Import = lazy(() => import("@/pages/Import").then(m => ({ default: m.Import })));
const Games = lazy(() => import("@/pages/Games").then(m => ({ default: m.Games })));
const GameReplay = lazy(() => import("@/pages/GameReplay").then(m => ({ default: m.GameReplay })));
const Analysis = lazy(() => import("@/pages/Analysis").then(m => ({ default: m.Analysis })));
const Courses = lazy(() => import("@/pages/Courses").then(m => ({ default: m.Courses })));
const CourseDetail = lazy(() => import("@/pages/CourseDetail").then(m => ({ default: m.CourseDetail })));
const Endgames = lazy(() => import("@/pages/Endgames").then(m => ({ default: m.Endgames })));
const WeaknessDetail = lazy(() => import("@/pages/WeaknessDetail").then(m => ({ default: m.WeaknessDetail })));
const OpponentAnalysis = lazy(() => import("@/pages/OpponentAnalysis").then(m => ({ default: m.OpponentAnalysis })));
const Openings = lazy(() => import("@/pages/Openings").then(m => ({ default: m.Openings })));
const OpeningDetail = lazy(() => import("@/pages/OpeningDetail").then(m => ({ default: m.OpeningDetail })));
const PracticeBots = lazy(() => import("@/pages/PracticeBots").then(m => ({ default: m.PracticeBots })));
const LocalPlay = lazy(() => import("@/pages/LocalPlay").then(m => ({ default: m.LocalPlay })));
const LivePlay = lazy(() => import("@/pages/LivePlay").then(m => ({ default: m.LivePlay })));
const LiveHistory = lazy(() => import("@/pages/LiveHistory").then(m => ({ default: m.LiveHistory })));
const GameLookup = lazy(() => import("@/pages/GameLookup").then(m => ({ default: m.GameLookup })));
const Subscription = lazy(() => import("@/pages/Subscription").then(m => ({ default: m.Subscription })));
const Profile = lazy(() => import("@/pages/Profile").then(m => ({ default: m.Profile })));
const Puzzles = lazy(() => import("@/pages/Puzzles").then(m => ({ default: m.Puzzles })));
const SolvedPuzzles = lazy(() => import("@/pages/SolvedPuzzles"));
const ScanPosition = lazy(() => import("@/pages/ScanPosition").then(m => ({ default: m.ScanPosition })));
const Admin = lazy(() => import("@/pages/Admin").then(m => ({ default: m.Admin })));
const Welcome = lazy(() => import("@/pages/Welcome").then(m => ({ default: m.Welcome })));
const NotFound = lazy(() => import("@/pages/not-found"));

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
function ProtectedRoute({ component: Component, fallbackNav, requireAdmin, skipWelcomeRedirect }: { component: React.ComponentType; fallbackNav?: string; requireAdmin?: boolean; skipWelcomeRedirect?: boolean }) {
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
    <Layout>
      <ErrorBoundary fallbackNav={fallbackNav ?? '/'}>
        <Component />
      </ErrorBoundary>
    </Layout>
  );
}

const PDashboard     = () => <ProtectedRoute component={Dashboard} />;
const PImport        = () => <ProtectedRoute component={Import} />;
const PGames         = () => <ProtectedRoute component={Games} />;
const PGameReplay    = () => <ProtectedRoute component={GameReplay} fallbackNav="/games" />;
const PAnalysis      = () => <ProtectedRoute component={Analysis} />;
const PWeakness      = () => <ProtectedRoute component={WeaknessDetail} fallbackNav="/analysis" />;
const PCourses       = () => <ProtectedRoute component={Courses} />;
const PCourseDetail  = () => <ProtectedRoute component={CourseDetail} fallbackNav="/courses" />;
const PEndgames      = () => <ProtectedRoute component={Endgames} />;
const POpenings      = () => <ProtectedRoute component={Openings} />;
const POpeningDetail = () => <ProtectedRoute component={OpeningDetail} fallbackNav="/openings" />;
const POpponents     = () => <ProtectedRoute component={OpponentAnalysis} />;
const PPracticeBots  = () => <ProtectedRoute component={PracticeBots} />;
const PLocalPlay     = () => <ProtectedRoute component={LocalPlay} />;
const PLivePlay      = () => <ProtectedRoute component={LivePlay} requireAdmin />;
const PLiveHistory   = () => <ProtectedRoute component={LiveHistory} fallbackNav="/live" requireAdmin />;
const PGameLookup    = () => <ProtectedRoute component={GameLookup} />;
const PSubscription  = () => <ProtectedRoute component={Subscription} />;
const PProfile       = () => <ProtectedRoute component={Profile} />;
const PPuzzles       = () => <ProtectedRoute component={Puzzles} />;
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

function Router() {
  return (
    <><ScrollToTop /><PageTracker /><Switch>
      <Route path="/setup" component={LandingPage} />
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
      <Route path="/live"            component={PLivePlay} />
      <Route path="/live/history"    component={PLiveHistory} />
      <Route path="/lookup"          component={PGameLookup} />
      <Route path="/puzzles"          component={PPuzzles} />
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
