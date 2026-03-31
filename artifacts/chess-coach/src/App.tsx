import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/context/UserContext";
import { useUser } from "@/hooks/use-user";
import { useEffect, Component, type ReactNode } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="text-5xl">♟</div>
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground max-w-md">{this.state.error?.message ?? 'An unexpected error occurred.'}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.history.back(); }}
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            Go back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Pages
import { Setup } from "@/pages/Setup";
import { Dashboard } from "@/pages/Dashboard";
import { Import } from "@/pages/Import";
import { Games } from "@/pages/Games";
import { GameReplay } from "@/pages/GameReplay";
import { Analysis } from "@/pages/Analysis";
import { Courses } from "@/pages/Courses";
import { CourseDetail } from "@/pages/CourseDetail";
import { WeaknessDetail } from "@/pages/WeaknessDetail";
import { OpponentAnalysis } from "@/pages/OpponentAnalysis";
import { Openings } from "@/pages/Openings";
import { OpeningDetail } from "@/pages/OpeningDetail";
import { PracticeBots } from "@/pages/PracticeBots";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/Layout";

const queryClient = new QueryClient();

// Protected Route Wrapper
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { username, isLoaded } = useUser();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoaded && !username) {
      navigate('/setup', { replace: true } as never);
    }
  }, [isLoaded, username, navigate]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!username) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

// Define stable named wrappers outside of Router to prevent remounting on every render
const PDashboard     = () => <ProtectedRoute component={Dashboard} />;
const PImport        = () => <ProtectedRoute component={Import} />;
const PGames         = () => <ProtectedRoute component={Games} />;
const PGameReplay    = () => <ProtectedRoute component={GameReplay} />;
const PAnalysis      = () => <ProtectedRoute component={Analysis} />;
const PWeakness      = () => <ProtectedRoute component={WeaknessDetail} />;
const PCourses       = () => <ProtectedRoute component={Courses} />;
const PCourseDetail  = () => <ProtectedRoute component={CourseDetail} />;
const POpenings      = () => <ProtectedRoute component={Openings} />;
const POpeningDetail = () => <ProtectedRoute component={OpeningDetail} />;
const POpponents     = () => <ProtectedRoute component={OpponentAnalysis} />;
const PPracticeBots  = () => <ProtectedRoute component={PracticeBots} />;

function Router() {
  return (
    <Switch>
      <Route path="/setup" component={Setup} />

      {/* Protected Routes — stable named components prevent remounting on every render */}
      <Route path="/"            component={PDashboard} />
      <Route path="/import"      component={PImport} />
      <Route path="/games"       component={PGames} />
      <Route path="/games/:id"   component={PGameReplay} />
      <Route path="/analysis"    component={PAnalysis} />
      <Route path="/analysis/:id" component={PWeakness} />
      <Route path="/courses"     component={PCourses} />
      <Route path="/courses/:id" component={PCourseDetail} />
      <Route path="/openings"        component={POpenings} />
      <Route path="/openings/:eco"   component={POpeningDetail} />
      <Route path="/opponents"       component={POpponents} />
      <Route path="/practice"        component={PPracticeBots} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <UserProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </UserProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
