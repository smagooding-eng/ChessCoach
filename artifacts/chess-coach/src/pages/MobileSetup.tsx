import React, { useState, useEffect } from 'react';
import { useUser } from '@/hooks/use-user';
import { useLocation } from 'wouter';
import { Trophy, Mail, Eye, EyeOff } from 'lucide-react';
import { apiFetch, apiUrl, setAuthToken } from '@/lib/api';

// Mobile-specific entry screen -- one screen, sign up or log in, nothing
// else. Desktop keeps the full marketing LandingPage unchanged; this is
// what mobile visitors see instead (wired in App.tsx's /setup route via
// useIsMobile()).
//
// Deliberately NOT a trimmed-down version of the marketing page: no demo,
// no "play a bot to see how you do," no feature list, no scroll. Just
// enough to get someone an account, matching how most mobile apps
// onboard (download, sign up, go). Chess.com/Lichess username collection
// happens on the next screen (/welcome), not here -- this screen stays
// to email + password so it fits on one screen without scrolling on a
// typical phone.
//
// Based on the (previously orphaned, never routed to) Setup.tsx, with
// the optional Name and Chess.com Username fields removed to keep this
// specific screen minimal -- those still work fine via /welcome
// immediately after.
export function MobileSetup() {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [referralCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || localStorage.getItem('chessscout_ref') || '';
  });

  const { login, refreshAuth, isAuthenticated, isAuthLoading } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (referralCode) localStorage.setItem('chessscout_ref', referralCode);
  }, [referralCode]);

  useEffect(() => {
    apiFetch('/api/auth/google/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { available: false })
      .then(d => setGoogleAvailable(!!d.available))
      .catch(() => setGoogleAvailable(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError === 'google_not_configured') {
      setError('Google sign-in is not available yet. Please use email and password.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (urlError === 'google_auth_failed') {
      setError('Google sign-in failed. Please try again or use email and password.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  if (isAuthLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    setLocation('/');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body: Record<string, string> = { email, password };
      if (mode === 'register') {
        const ref = referralCode || localStorage.getItem('chessscout_ref') || '';
        if (ref) body.referralCode = ref;
      }

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      if (data.token) setAuthToken(data.token);
      localStorage.removeItem('chessscout_ref');

      // No username collected on this screen (it's the whole reason
      // this screen is short enough to not scroll), so there's nothing
      // to fire an immediate import for here, unlike Setup.tsx. The
      // next screen (/welcome, triggered automatically by ProtectedRoute
      // for a user with no linked username) handles that trigger
      // instead -- this account genuinely has nothing to import yet.
      if (data.user?.chesscomUsername) {
        login(data.user.chesscomUsername);
      }

      await refreshAuth();
      setLocation('/');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const ref = referralCode || localStorage.getItem('chessscout_ref') || '';
    const url = ref ? apiUrl(`/api/auth/google?ref=${encodeURIComponent(ref)}`) : apiUrl('/api/auth/google');
    window.location.href = url;
  };

  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center px-5 bg-background overflow-y-auto">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 mb-3 bg-primary/20 rounded-full flex items-center justify-center">
            <Trophy className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold text-white">ChessScout.net</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === 'login' ? 'Sign in to your account' : 'Find the 2–3 mistakes keeping you stuck'}
          </p>
        </div>

        {googleAvailable && (
          <>
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-secondary/50 text-foreground font-medium mb-3 text-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground uppercase">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        {error && (
          <div className="mb-3 p-2.5 rounded-xl bg-red-500/20 border bg-red-500 text-white text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
                required
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Password (8+ characters)' : 'Password'}
                className="w-full px-4 py-3 pr-10 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
                required
                minLength={mode === 'register' ? 8 : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 btn-primary text-sm mt-1"
          >
            {loading
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : mode === 'register' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => { setMode('register'); setError(''); }}
                className="text-primary font-medium"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="text-primary font-medium"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
