import React, { useState, useEffect } from 'react';
import { useUser } from '@/hooks/use-user';
import { useLocation } from 'wouter';
import { ArrowRight, Trophy, Mail, Eye, EyeOff, UserPlus, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

export function Setup() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [chesscomUsername, setChesscomUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  const { login, refreshAuth, isAuthenticated, isAuthLoading } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch('/api/auth/google/status', { credentials: 'include' })
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
      <div className="min-h-screen flex items-center justify-center">
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
        if (firstName.trim()) body.firstName = firstName.trim();
        if (chesscomUsername.trim()) body.chesscomUsername = chesscomUsername.trim();
      }

      const res = await fetch(endpoint, {
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
    window.location.href = '/api/auth/google';
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt="Hero background"
          className="w-full h-full object-cover opacity-60 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-panel p-8 md:p-10 rounded-3xl relative z-10"
      >
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 mb-4 bg-primary/20 rounded-full flex items-center justify-center shadow-[0_0_30px_hsl(89_44%_50%_/_0.3)]">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-white">
            Welcome to <span className="text-gradient">Chess Coach</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        {googleAvailable && (
          <>
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-secondary/50 hover:bg-secondary transition-colors text-foreground font-medium mb-4"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground uppercase">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1 ml-1">
                Name <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-3 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1 ml-1">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1 ml-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Min 6 characters' : 'Your password'}
                className="w-full px-4 py-3 pr-10 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all text-sm"
                required
                minLength={mode === 'register' ? 6 : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1 ml-1">
                Chess.com Username <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                type="text"
                value={chesscomUsername}
                onChange={(e) => setChesscomUsername(e.target.value)}
                placeholder="e.g. Hikaru"
                className="w-full px-4 py-3 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all text-sm"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full group flex items-center justify-center gap-2 btn-primary text-sm mt-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : mode === 'register' ? (
              <>
                <UserPlus className="w-4 h-4" />
                Create Account
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
            {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-muted-foreground">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => { setMode('register'); setError(''); }}
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
