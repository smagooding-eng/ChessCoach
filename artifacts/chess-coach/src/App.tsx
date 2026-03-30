import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-user";
import { useEffect } from "react";

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
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/Layout";

const queryClient = new QueryClient();

// Protected Route Wrapper
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { username, isLoaded } = useUser();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoaded && !username) {
      // Replace so pressing Back doesn't loop back to a protected route
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

function Router() {
  return (
    <Switch>
      <Route path="/setup" component={Setup} />
      
      {/* Protected Routes */}
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/import" component={() => <ProtectedRoute component={Import} />} />
      <Route path="/games" component={() => <ProtectedRoute component={Games} />} />
      <Route path="/games/:id" component={() => <ProtectedRoute component={GameReplay} />} />
      <Route path="/analysis" component={() => <ProtectedRoute component={Analysis} />} />
      <Route path="/analysis/:id" component={() => <ProtectedRoute component={WeaknessDetail} />} />
      <Route path="/courses" component={() => <ProtectedRoute component={Courses} />} />
      <Route path="/courses/:id" component={() => <ProtectedRoute component={CourseDetail} />} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
