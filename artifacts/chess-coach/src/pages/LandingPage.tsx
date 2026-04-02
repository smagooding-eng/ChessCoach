import React, { useState, useEffect } from 'react';
import { useUser } from '@/hooks/use-user';
import { useLocation } from 'wouter';
import { ArrowRight, Mail, Eye, EyeOff, UserPlus, LogIn, Search, BarChart3, Brain, TrendingUp, Check, X, ChevronRight, Zap, Target, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, apiUrl, setAuthToken } from '@/lib/api';

function AuthModal({ open, onClose, initialMode, externalError }: { open: boolean; onClose: () => void; initialMode: 'login' | 'register'; externalError?: string }) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [chesscomUsername, setChesscomUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(externalError || '');

  useEffect(() => { setMode(initialMode); }, [initialMode]);
  useEffect(() => { if (externalError) setError(externalError); }, [externalError]);
  const [loading, setLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  const { login, refreshAuth } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    apiFetch('/api/auth/google/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { available: false })
      .then(d => setGoogleAvailable(!!d.available))
      .catch(() => setGoogleAvailable(false));
  }, []);

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
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); return; }
      if (data.token) setAuthToken(data.token);
      if (data.user?.chesscomUsername) login(data.user.chesscomUsername);
      await refreshAuth();
      setLocation('/');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = apiUrl('/api/auth/google');
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'login' ? 'Sign in' : 'Start free trial'}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-md glass-panel p-8 rounded-2xl relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-display font-bold text-white">
              {mode === 'login' ? 'Welcome Back' : 'Start Your Free Trial'}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {mode === 'login' ? 'Sign in to your account' : '3 days free, then $4/month'}
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
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1 ml-1">
                  Name <span className="text-muted-foreground">(optional)</span>
                </label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Your name"
                  className="w-full px-4 py-3 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all text-sm" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1 ml-1">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Min 6 characters' : 'Your password'} required minLength={mode === 'register' ? 6 : undefined}
                  className="w-full px-4 py-3 pr-10 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all text-sm" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1 ml-1">
                  Chess.com Username <span className="text-muted-foreground">(optional)</span>
                </label>
                <input type="text" value={chesscomUsername} onChange={(e) => setChesscomUsername(e.target.value)} placeholder="e.g. Hikaru"
                  className="w-full px-4 py-3 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all text-sm" />
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full group flex items-center justify-center gap-2 btn-primary text-sm mt-2">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : mode === 'register' ? (
                <><UserPlus className="w-4 h-4" />Start Free Trial</>
              ) : (
                <><LogIn className="w-4 h-4" />Sign In</>
              )}
              {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>Don't have an account?{' '}<button onClick={() => { setMode('register'); setError(''); }} className="text-primary hover:underline font-medium">Sign up</button></>
            ) : (
              <>Already have an account?{' '}<button onClick={() => { setMode('login'); setError(''); }} className="text-primary hover:underline font-medium">Sign in</button></>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function OpponentScoutPreview() {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="glass-panel rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opponent Scout</span>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/8 border border-red-500/20">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm text-foreground">Weak Endgames</span>
            </div>
            <span className="text-xs font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">Critical</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-orange-500/8 border border-orange-500/20">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-sm text-foreground">Blunders Under Pressure</span>
            </div>
            <span className="text-xs font-bold text-orange-400 bg-orange-500/15 px-2 py-0.5 rounded-full">High</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-yellow-500/8 border border-yellow-500/20">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-sm text-foreground">Struggles vs d4</span>
            </div>
            <span className="text-xs font-bold text-yellow-400 bg-yellow-500/15 px-2 py-0.5 rounded-full">Medium</span>
          </div>
        </div>

        <div className="mt-3 p-3 rounded-xl bg-primary/8 border border-primary/20">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Game Plan</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Play 1.d4 and aim for endgames. They collapse under time pressure in longer games.
          </p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [oauthError, setOauthError] = useState('');
  const { isAuthenticated, isAuthLoading } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError === 'google_not_configured') {
      setOauthError('Google sign-in is not available yet. Please use email and password.');
      setAuthOpen(true);
    } else if (urlError === 'google_auth_failed') {
      setOauthError('Google sign-in failed. Please try again or use email and password.');
      setAuthOpen(true);
    }
    if (urlError) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

  const openSignup = () => { setAuthMode('register'); setAuthOpen(true); };
  const openLogin = () => { setAuthMode('login'); setAuthOpen(true); };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-display font-bold text-white">Chess</span>
            <span className="text-xl font-display font-bold text-gradient">Coach</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={openLogin} className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
              Sign In
            </button>
            <button onClick={openSignup} className="btn-primary text-sm !py-2 !px-4 !min-h-0">
              Start Free Trial
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-display font-black text-white leading-[1.1] tracking-tight">
                Know How to Beat Your Opponent{' '}
                <span className="text-gradient">Before the Game Starts</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-lg">
                See your opponent's biggest weaknesses, get a simple game plan, and improve your own play at the same time.
              </p>
              <p className="mt-2 text-sm text-primary font-medium">
                Start with a 3-day free trial
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button onClick={openSignup} className="btn-primary btn-lg group">
                  <Search className="w-5 h-5" />
                  Scout Your Opponent Free
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <button onClick={openSignup} className="btn-secondary btn-lg">
                  <BarChart3 className="w-5 h-5" />
                  Analyze My Game
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="hidden lg:block"
            >
              <OpponentScoutPreview />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Mobile preview (shown below hero on small screens) */}
      <section className="lg:hidden pb-16 px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <OpponentScoutPreview />
        </motion.div>
      </section>

      {/* How It Works */}
      <section className="py-20 sm:py-24 border-t border-border/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
              <Zap className="w-3.5 h-3.5" /> HOW IT WORKS
            </div>
            <h2 className="text-3xl sm:text-4xl font-display font-black text-white">
              Three Simple Steps
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: '1', icon: Search, title: 'Enter a Username', desc: 'Enter a Chess.com username or upload a game' },
              { step: '2', icon: Target, title: 'We Find Patterns', desc: 'We break down key patterns, habits, and mistakes' },
              { step: '3', icon: Brain, title: 'Get Your Plan', desc: 'You get clear insights and exactly what to do next' },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="relative mx-auto w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-primary" />
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-display font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Benefits */}
      <section className="py-20 sm:py-24 border-t border-border/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-display font-black text-white">
              Everything You Need to{' '}
              <span className="text-gradient">Win More Games</span>
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-5">
            {[
              { icon: Search, title: 'Opponent Scout', desc: 'Know what your opponent struggles with before you play', highlight: true },
              { icon: BarChart3, title: 'Game Breakdown', desc: 'See your biggest mistakes and missed opportunities', highlight: false },
              { icon: Brain, title: 'Clear Explanations', desc: 'Understand what went wrong and how to fix it', highlight: false },
              { icon: TrendingUp, title: 'Track Improvement', desc: 'See progress over time and build better habits', highlight: false },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`glass-card rounded-2xl p-6 ${item.highlight ? 'border-primary/30 bg-primary/5' : ''}`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${item.highlight ? 'bg-primary/20' : 'bg-secondary'}`}>
                  <item.icon className={`w-5 h-5 ${item.highlight ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <h3 className="text-lg font-display font-bold text-white mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Statement */}
      <section className="py-20 sm:py-24 border-t border-border/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <Shield className="w-10 h-10 text-primary mx-auto mb-5" />
            <h2 className="text-2xl sm:text-3xl font-display font-black text-white leading-snug">
              Most players lose for the same reasons every game.{' '}
              <span className="text-gradient">Find yours and fix them.</span>
            </h2>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 sm:py-24 border-t border-border/30" id="pricing">
        <div className="max-w-md mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-display font-black text-white">
              Simple Pricing
            </h2>
            <p className="text-muted-foreground mt-2">No surprises. Cancel anytime.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-panel rounded-2xl p-8 border-primary/30 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />

            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold mb-4">
                3-DAY FREE TRIAL
              </div>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-display font-black text-white">$4</span>
                <span className="text-muted-foreground text-lg">/month</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Just $1/week</p>
            </div>

            <div className="space-y-3 mb-8">
              {[
                'Unlimited game analysis',
                'Opponent scouting',
                'Personalized insights',
                'Training recommendations',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-sm text-foreground">{feature}</span>
                </div>
              ))}
            </div>

            <button onClick={openSignup} className="w-full btn-primary btn-lg group">
              Start Free Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-28 border-t border-border/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl sm:text-4xl font-display font-black text-white mb-4">
              Win More Games{' '}
              <span className="text-gradient">Starting Today</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
              Try it free for 3 days — no guesswork, just results.
            </p>
            <button onClick={openSignup} className="btn-primary btn-lg group">
              <Search className="w-5 h-5" />
              Scout Your Opponent Free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-muted-foreground">
            Chess Coach &middot; Improve your game, one move at a time.
          </p>
        </div>
      </footer>

      {/* Sticky Mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 sm:hidden bg-background/95 backdrop-blur-lg border-t border-border/50 p-3 bottom-nav-safe">
        <button onClick={openSignup} className="w-full btn-primary group">
          Scout Your Opponent Free
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} externalError={oauthError} />
    </div>
  );
}
