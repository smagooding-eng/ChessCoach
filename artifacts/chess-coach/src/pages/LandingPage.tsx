import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '@/hooks/use-user';
import { useLocation, Link } from 'wouter';
import { HeroDemo } from '@/components/HeroDemo';
import { trackFunnelEvent } from '@/lib/funnelTracking';
import { useLandingFunnelTracking } from '@/hooks/use-landing-funnel-tracking';
import { ArrowRight, Mail, Eye, EyeOff, UserPlus, LogIn, Search, BarChart3, Brain, Check, X, Target, Crosshair, BookOpen, Gamepad2, Flame, Puzzle, Users, Skull, History, GraduationCap, Download as DownloadIcon, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, apiUrl, setAuthToken } from '@/lib/api';

const G = '#81b64c';
const BG = '#262421';
const CARD = '#302e2b';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
function clientValidEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) return false;
  const [local, domain] = trimmed.split('@');
  if (!local || !domain) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  const tld = domain.split('.').pop() || '';
  return tld.length >= 2;
}

type PwdCheck = { ok: boolean; label: string };
function passwordChecks(pwd: string): PwdCheck[] {
  return [
    { ok: pwd.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(pwd), label: 'Contains a letter' },
    { ok: /[0-9]/.test(pwd), label: 'Contains a number' },
  ];
}

function AuthModal({ open, onClose, initialMode, externalError }: { open: boolean; onClose: () => void; initialMode: 'login' | 'register'; externalError?: string }) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Chess.com/Lichess username used to live in this form too, but that's
  // a second decision on top of "create an account" -- and ProtectedRoute
  // already force-routes any authenticated user with neither username set
  // to /welcome, so it's never actually lost, just asked for one step
  // later once they've already got an account. Referral code stays
  // (captured silently below from the ?ref= param / localStorage, no
  // visible field needed) since it has to be attached at signup time.
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(externalError || '');
  const [emailTouched, setEmailTouched] = useState(false);

  useEffect(() => { setMode(initialMode); }, [initialMode]);
  useEffect(() => { if (externalError) setError(externalError); }, [externalError]);
  const [loading, setLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  const { login, refreshAuth } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) localStorage.setItem('chessscout_ref', ref);
    const stored = localStorage.getItem('chessscout_ref');
    if (stored) setReferralCodeInput(stored);
  }, []);

  useEffect(() => {
    apiFetch('/api/auth/google/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { available: false })
      .then(d => setGoogleAvailable(!!d.available))
      .catch(() => setGoogleAvailable(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      if (!clientValidEmail(email)) {
        setError('Please enter a valid email address');
        return;
      }
      const failed = passwordChecks(password).filter(c => !c.ok);
      if (failed.length > 0) {
        setError(failed[0].label);
        return;
      }
    }
    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body: Record<string, string> = { email: email.trim().toLowerCase(), password };
      if (mode === 'register') {
        const ref = referralCodeInput.trim().toUpperCase();
        if (ref) body.referralCode = ref;
      }
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); return; }
      if (mode === 'register') trackFunnelEvent('signup_completed');
      if (data.token) setAuthToken(data.token);
      localStorage.removeItem('chessscout_ref');
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
    const ref = localStorage.getItem('chessscout_ref') || '';
    const url = ref ? apiUrl(`/api/auth/google?ref=${encodeURIComponent(ref)}`) : apiUrl('/api/auth/google');
    window.location.href = url;
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
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-md rounded-xl relative p-8"
          style={{ background: CARD, border: `1px solid rgba(255,255,255,0.06)` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 hover:opacity-70 transition-opacity" style={{ color: MUTED }}>
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-black" style={{ color: TEXT }}>
              {mode === 'login' ? 'Welcome Back' : 'Analyze My Games Free'}
            </h2>
            <p className="text-sm mt-1" style={{ color: MUTED }}>
              {mode === 'login' ? 'Sign in to your account' : 'Free to start — upgrade to Pro anytime'}
            </p>
            {mode === 'register' && (
              <p className="text-xs font-bold mt-1.5 flex items-center justify-center gap-1" style={{ color: G }}>
                <Check className="w-3.5 h-3.5" /> No credit card required
              </p>
            )}
          </div>

          {googleAvailable && (
            <>
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border transition-colors font-medium mb-4"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: TEXT }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
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
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                <span className="text-xs uppercase" style={{ color: MUTED }}>or</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(220,67,67,0.35)', border: '1px solid rgba(220,67,67,0.6)', color: '#ffffff' }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1 ml-1" style={{ color: TEXT }}>Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED }} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setEmailTouched(true)} placeholder="you@example.com" required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.08)', color: TEXT }}
                  onFocus={e => (e.target.style.borderColor = G)} />
              </div>
              {mode === 'register' && emailTouched && email && !clientValidEmail(email) && (
                <p className="text-[11px] mt-1 ml-1" style={{ color: '#ef6b6b' }}>That doesn't look like a valid email address.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 ml-1" style={{ color: TEXT }}>Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'At least 8 chars, with letters & numbers' : 'Your password'} required minLength={mode === 'register' ? 8 : undefined}
                  className="w-full px-4 py-3 pr-10 rounded-xl text-sm outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.08)', color: TEXT }}
                  onFocus={e => (e.target.style.borderColor = G)}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity" style={{ color: MUTED }}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'register' && password && (
                <ul className="mt-1.5 ml-1 space-y-0.5">
                  {passwordChecks(password).map((c) => (
                    <li key={c.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: c.ok ? G : MUTED }}>
                      <Check className="w-3 h-3" style={{ opacity: c.ok ? 1 : 0.35 }} />
                      {c.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="submit" disabled={loading}
              className="w-full group flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all mt-2"
              style={{ background: G, color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#6fa23e')}
              onMouseLeave={e => (e.currentTarget.style.background = G)}>
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : mode === 'register' ? (
                <><UserPlus className="w-4 h-4" />Analyze My Games Free</>
              ) : (
                <><LogIn className="w-4 h-4" />Sign In</>
              )}
              {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <div className="mt-5 text-center text-sm" style={{ color: MUTED }}>
            {mode === 'login' ? (
              <>Don't have an account?{' '}<button onClick={() => { setMode('register'); setError(''); }} className="font-medium hover:underline" style={{ color: G }}>Sign up</button></>
            ) : (
              <>Already have an account?{' '}<button onClick={() => { setMode('login'); setError(''); }} className="font-medium hover:underline" style={{ color: G }}>Sign in</button></>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function AnimatedCount({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  const runAnimation = () => {
    if (started.current) return;
    started.current = true;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
      else setCount(target);
    };
    requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (target <= 0 || started.current) return;
    if (!('IntersectionObserver' in window)) { runAnimation(); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { runAnimation(); observer.disconnect(); }
    }, { threshold: 0.1 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

function SocialProofBar() {
  const [stats, setStats] = useState<{ users: number; gamesImported: number; gamesAnalyzed: number; opponentsScouted: number } | null>(null);

  useEffect(() => {
    apiFetch('/api/public/stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {});
  }, []);

  // Below the volume threshold for real numbers to mean anything --
  // rather than leaving this blank (silence reads as "nobody's here
  // yet"), show something true and non-numeric instead of inventing a
  // stat. This still returns null on the very first load before the
  // stats fetch resolves, since a flash of the fallback text would look
  // worse than nothing for the ~100ms most visitors won't even notice.
  if (!stats) return null;
  if (stats.gamesAnalyzed < 5) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="py-8"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <p className="text-center text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>
          Every scan runs on a real Stockfish engine — not generic tips
        </p>
      </motion.div>
    );
  }

  const items = [
    { label: 'Games Imported', value: stats.gamesImported, icon: DownloadIcon },
    { label: 'Games Analyzed', value: stats.gamesAnalyzed, icon: BarChart3 },
    { label: 'Opponents Scouted', value: stats.opponentsScouted, icon: Crosshair },
  ].filter(i => i.value > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="py-10"
      style={{ borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-8">
        <div className="flex flex-wrap justify-center gap-8 sm:gap-16">
          {items.map(item => (
            <div key={item.label} className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <item.icon className="w-4 h-4" style={{ color: G }} />
                <span className="text-2xl sm:text-3xl font-black" style={{ color: TEXT }}>
                  <AnimatedCount target={item.value} />
                  {item.value >= 1000 ? '+' : ''}
                </span>
              </div>
              <p className="text-xs font-medium" style={{ color: MUTED }}>{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [oauthError, setOauthError] = useState('');
  const { isAuthenticated, isAuthLoading } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    trackFunnelEvent('landing_view');
  }, []);

  useLandingFunnelTracking();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) localStorage.setItem('chessscout_ref', ref);
    const urlError = params.get('error');
    if (urlError === 'google_not_configured') {
      setOauthError('Google sign-in is not available yet. Please use email and password.');
      setAuthOpen(true);
    } else if (urlError === 'google_auth_failed') {
      setOauthError('Google sign-in failed. Please try again or use email and password.');
      setAuthOpen(true);
    }
    if (urlError || ref) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

  const openSignup = () => { trackFunnelEvent('signup_clicked'); setAuthMode('register'); setAuthOpen(true); };
  const openLogin = () => { setAuthMode('login'); setAuthOpen(true); };

  // Sends first-touch clicks ("Try Free" in the nav, the hero CTA, the
  // mobile sticky bar) into the free no-signup demo instead of straight
  // into the signup wall -- a visitor who's never seen the product
  // shouldn't hit a form before they've seen any value. Pricing and the
  // final CTA further down the page skip this and go straight to
  // openSignup: by that point they've already scrolled past the demo
  // (or deliberately ignored it), so re-routing them back up to it would
  // be the wrong call.
  const scrollToDemo = () => {
    const el = document.getElementById('hero-demo');
    if (!el) { openSignup(); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      document.getElementById('demo-username-input')?.focus();
    }, 450);
  };

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: `radial-gradient(ellipse at top, #2c2925 0%, ${BG} 50%, #1c1a18 100%)` }}>
      <nav className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: `${BG}dd`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <span className="text-lg font-black" style={{ color: TEXT }}>Chess</span>
            <span className="text-lg font-black" style={{ color: G }}>Scout</span>
            <span className="text-sm font-bold ml-0.5" style={{ color: MUTED }}>.net</span>
          </div>
          <div className="flex items-center gap-3">
            <a href={`${import.meta.env.BASE_URL}download`}
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
              style={{ color: MUTED }}
              onMouseEnter={e => (e.currentTarget.style.color = TEXT)} onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
              <Smartphone className="w-3.5 h-3.5" /> Download
            </a>
            <Link href="/pricing"
              className="hidden sm:inline-flex text-sm font-medium transition-colors"
              style={{ color: MUTED }}
              onMouseEnter={e => (e.currentTarget.style.color = TEXT)} onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
              Pricing
            </Link>
            <button onClick={openLogin} className="text-sm font-medium transition-colors" style={{ color: MUTED }}
              onMouseEnter={e => (e.currentTarget.style.color = TEXT)} onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
              Sign In
            </button>
            <button onClick={scrollToDemo} className="text-sm font-bold px-5 py-2 rounded-xl transition-all"
              style={{ background: G, color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#6fa23e')}
              onMouseLeave={e => (e.currentTarget.style.background = G)}>
              Try Free
            </button>
          </div>
        </div>
      </nav>

      <section data-track-section="hero" className="relative pt-12 pb-16 sm:pt-20 sm:pb-24">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[1000px] h-[800px] rounded-full blur-[160px]" style={{ background: `${G}08` }} />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-20 items-start">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="pt-4 lg:pt-12">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5 text-[11px] font-black tracking-wide"
                style={{
                  background: 'linear-gradient(90deg, rgba(255,180,0,0.15), rgba(220,67,67,0.15))',
                  color: '#ffc34d',
                  border: '1px solid rgba(255,180,0,0.35)',
                }}>
                <Flame className="w-3.5 h-3.5" />
                FREE TO START · NO CARD REQUIRED
              </motion.div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.6rem] font-black leading-[1.05] tracking-tight" style={{ color: TEXT }}>
                Find Why You're{' '}
                <br className="hidden sm:block" />
                <span className="relative inline-block">
                  <span
                    className="relative z-10"
                    style={{
                      background: `linear-gradient(90deg, ${G} 0%, #b8e070 50%, ${G} 100%)`,
                      backgroundSize: '200% auto',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                      animation: 'shimmer 3s linear infinite',
                    }}
                  >
                    Losing Games
                  </span>
                  <motion.span
                    aria-hidden
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.6, duration: 0.6, ease: 'easeOut' }}
                    className="absolute left-0 right-0 -bottom-1 h-1 rounded-full origin-left"
                    style={{ background: `linear-gradient(90deg, ${G}, transparent)` }}
                  />
                </span>
              </h1>
              <style>{`@keyframes shimmer { to { background-position: 200% center; } }`}</style>

              <p className="mt-5 text-base sm:text-lg leading-relaxed max-w-lg" style={{ color: MUTED }}>
                Upload your Chess.com or Lichess games and see why you plateau at the same rating — the 2-3 mistakes keeping you stuck, with exactly how to fix them.
              </p>

              <p className="mt-2 text-xs max-w-lg" style={{ color: MUTED }}>
                For club players 400–2000 ELO. Not for titled players or grandmasters.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <button onClick={scrollToDemo}
                  className="group flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl font-bold text-sm transition-all"
                  style={{ background: G, color: '#fff', boxShadow: `0 4px 20px ${G}40` }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#6fa23e'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = G; e.currentTarget.style.transform = 'translateY(0)'; }}>
                  <BarChart3 className="w-4 h-4" />
                  Analyze My Games Free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <div className="flex items-center gap-4 text-xs font-medium">
                  <button onClick={openSignup}
                    className="flex items-center gap-1.5 transition-colors"
                    style={{ color: MUTED }}
                    onMouseEnter={e => { e.currentTarget.style.color = TEXT; }}
                    onMouseLeave={e => { e.currentTarget.style.color = MUTED; }}>
                    <Crosshair className="w-3.5 h-3.5" />
                    Scout an opponent
                  </button>
                  <a href={`${import.meta.env.BASE_URL}download`}
                    className="flex items-center gap-1.5 transition-colors"
                    style={{ color: MUTED }}
                    onMouseEnter={e => { e.currentTarget.style.color = TEXT; }}
                    onMouseLeave={e => { e.currentTarget.style.color = MUTED; }}>
                    <DownloadIcon className="w-3.5 h-3.5" />
                    Get the app
                  </a>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-bold" style={{ color: MUTED }}>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" style={{ color: G }} /> Free tier included</span>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" style={{ color: G }} /> No credit card</span>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" style={{ color: G }} /> Cancel anytime</span>
              </div>
            </motion.div>

            {/* This is now the single hero visual on every breakpoint --
                a live, no-signup demo instead of a decorative mockup.
                lg:grid-cols-2 stacks it below the text column on mobile
                automatically, so there's no separate mobile duplicate to
                maintain. */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="lg:pt-12"
            >
              <HeroDemo onUpgradeClick={openSignup} />
            </motion.div>
          </div>
        </div>
      </section>

      <SocialProofBar />

      <section data-track-section="how_it_works" className="py-16 sm:py-20" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-black" style={{ color: TEXT }}>
              How It Works
            </h2>
            <p className="mt-2 text-sm" style={{ color: MUTED }}>Three steps to your next win</p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { num: '01', icon: BarChart3, title: 'Import Your Games', desc: 'Connect your Chess.com or Lichess account. We pull your recent games in seconds.' },
              { num: '02', icon: Brain, title: 'We Find Your Mistakes', desc: 'Our engine spots the patterns costing you points — across openings, endgames, and time trouble.' },
              { num: '03', icon: Target, title: 'Get a Clear Game Plan', desc: 'A short, focused list of what to fix first — with drills built around your actual weaknesses.' },
            ].map((item, i) => (
              <motion.div
                key={item.num}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl p-6 relative overflow-hidden group"
                style={{ background: `linear-gradient(180deg, ${CARD} 0%, #2a2825 100%)`, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 24px 60px -14px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.05) inset' }}
              >
                <span className="absolute top-4 right-4 text-4xl font-black" style={{ color: 'rgba(255,255,255,0.03)' }}>{item.num}</span>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${G}15` }}>
                  <item.icon className="w-5 h-5" style={{ color: G }} />
                </div>
                <h3 className="text-base font-bold mb-1.5" style={{ color: TEXT }}>{item.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section data-track-section="differentiators" className="py-16 sm:py-20" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black" style={{ color: TEXT }}>
              Everything You Get
            </h2>
            <p className="mt-2 text-sm" style={{ color: MUTED }}>One subscription, a full toolkit — not just a report card</p>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wider"
              style={{ background: `${G}15`, color: G, border: `1px solid ${G}30` }}>
              NOBODY ELSE HAS THIS
            </div>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-5 mb-12">
            {[
              { icon: Search, title: 'Scan Position', desc: 'See a position anywhere — your game, a book, a stream — snap a photo and practice it out from any position. Play it against a bot or explore every line. No one else lets you do this.' },
              { icon: Gamepad2, title: 'Practice Bots', desc: '8 bot opponents from 400 to 2000 ELO with live move analysis as you play — build new habits in real games, not just puzzles.' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-2xl p-7"
                style={{ background: `linear-gradient(180deg, ${G}0f 0%, ${G}05 100%)`, border: `1.5px solid ${G}35`, boxShadow: `0 24px 60px -14px ${G}20` }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: `${G}20` }}>
                  <item.icon className="w-6 h-6" style={{ color: G }} />
                </div>
                <h3 className="text-lg font-black mb-2" style={{ color: TEXT }}>{item.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <p className="text-xs font-black uppercase tracking-widest mb-4" style={{ color: MUTED }}>You'll use these every day</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {[
              { icon: Puzzle, title: 'Puzzles', desc: 'Fresh sets daily' },
              { icon: Users, title: 'Local Play', desc: 'Play offline anytime' },
              { icon: BookOpen, title: 'Opening Trainer', desc: 'Drill your repertoire' },
              { icon: Skull, title: 'Chess Traps', desc: 'Learn the classics, both sides' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="rounded-xl p-5"
                style={{ background: CARD, border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <item.icon className="w-5 h-5 mb-3" style={{ color: TEXT }} />
                <h3 className="text-sm font-bold mb-1" style={{ color: TEXT }}>{item.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <p className="text-xs font-black uppercase tracking-widest mb-4" style={{ color: MUTED }}>Plus, whenever you need them</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: BarChart3, title: 'Deep Analysis', desc: 'Move-by-move breakdown of every game' },
              { icon: Crosshair, title: 'Opponent Scout', desc: 'Prep for a specific rival or tournament' },
              { icon: History, title: 'Game Lookup', desc: 'Every past game, one search away' },
              { icon: GraduationCap, title: 'Courses', desc: 'Personalized lessons from your mistakes' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="rounded-xl p-5"
                style={{ background: CARD, border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <item.icon className="w-5 h-5 mb-3" style={{ color: MUTED }} />
                <h3 className="text-sm font-bold mb-1" style={{ color: TEXT }}>{item.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section data-track-section="faq" className="py-16 sm:py-20" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-8">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black" style={{ color: TEXT }}>Questions</h2>
          </motion.div>
          <div className="space-y-4">
            {[
              { q: 'How is this different from Chess.com game review?', a: 'Chess.com reviews one game at a time. ChessScout.net looks across all your games to find the mistake you keep making — not just what happened in this one.' },
              { q: 'What does the free tier include?', a: '5 puzzles/day, 1 basic opponent scout, 2 Scan Position uses/day, unlimited practice bots, Opening Trainer, and Local Play, basic analysis from your reviewed games, and your 20 most recent games — no card required.' },
              { q: 'Will I understand the analysis at my level?', a: 'Yes. Explanations are written in plain language, not engine notation — built for players working on real improvement, not just engine output.' },
              { q: 'Does it work with Lichess?', a: 'Yes, both Chess.com and Lichess are supported.' },
              { q: 'Can I cancel anytime?', a: 'Yes, cancel anytime from your account settings — no phone call, no retention flow.' },
            ].map((item) => (
              <motion.div key={item.q} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                className="rounded-xl p-5" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.04)' }}>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: TEXT }}>{item.q}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{item.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section data-track-section="pricing" id="pricing" className="py-16 sm:py-20" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-lg mx-auto px-4 sm:px-8">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-10">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: G }}>
              Fix your biggest mistakes in your next 3 games
            </p>
            <h2 className="text-2xl sm:text-3xl font-black" style={{ color: TEXT }}>
              Simple Pricing
            </h2>
            <p className="mt-2 text-sm" style={{ color: MUTED }}>No surprises. Cancel anytime.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-xl p-8 relative overflow-hidden"
            style={{
              background: CARD,
              border: `2px solid ${G}50`,
              boxShadow: `0 0 0 1px ${G}20, 0 30px 80px ${G}15, 0 0 60px ${G}10`,
            }}
          >
            {/* Animated glow border */}
            <motion.div
              aria-hidden
              className="absolute -top-px left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${G}, transparent)` }}
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />

            {/* "MOST POPULAR" tilted ribbon */}
            <div
              className="absolute -right-12 top-5 px-12 py-1 text-[10px] font-black tracking-widest text-white"
              style={{
                background: `linear-gradient(90deg, #ea9733, #dc4343)`,
                transform: 'rotate(35deg)',
                boxShadow: '0 4px 12px rgba(220,67,67,0.4)',
              }}
            >
              MOST POPULAR
            </div>

            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black mb-4"
                style={{ background: `${G}15`, color: G, border: `1px solid ${G}40` }}>
                <Flame className="w-3 h-3" /> FREE TIER AVAILABLE
              </div>
              <p className="text-[11px] mb-4" style={{ color: MUTED }}>
                Free: 5 puzzles/day, 1 basic opponent scout, 2 scans/day, unlimited practice bots & Local Play, your 20 most recent games.
                <br />Pro unlocks unlimited everything plus full AI weakness analysis and personalized courses.
              </p>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-6xl font-black" style={{ color: TEXT }}>$5</span>
                <span className="text-lg" style={{ color: MUTED }}>/month</span>
              </div>
              <p className="text-sm mt-1" style={{ color: MUTED }}>or just <span style={{ color: G, fontWeight: 800 }}>$55/year</span> <span style={{ color: G, fontSize: 11, fontWeight: 700 }}>(save 8%)</span></p>
              <p className="text-[11px] font-bold mt-2" style={{ color: '#ffc34d' }}>
                💡 Less than one cup of coffee · cancel anytime
              </p>
            </div>

            <div className="space-y-3 mb-8">
              {[
                'Full deep analysis of every game you play',
                'Personalized courses built from your mistakes',
                'Scan any position for the best move',
                'Practice against 8 bots (400–2000 ELO)',
                'Opponent scouting when you need it',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${G}18` }}>
                    <Check className="w-3 h-3" style={{ color: G }} />
                  </div>
                  <span className="text-sm" style={{ color: TEXT }}>{feature}</span>
                </div>
              ))}
            </div>

            <button onClick={openSignup}
              className="w-full group flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all"
              style={{ background: G, color: '#fff', boxShadow: `0 4px 20px ${G}40` }}
              onMouseEnter={e => { e.currentTarget.style.background = '#6fa23e'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = G; e.currentTarget.style.transform = 'translateY(0)'; }}>
              Analyze My Games Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      <section data-track-section="final_cta" className="py-20 sm:py-28" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-2xl sm:text-3xl font-black leading-snug" style={{ color: TEXT }}>
              Most players lose for the same reasons every game.{' '}
              <span style={{ color: G }}>Find yours.</span>
            </h2>
            <div className="mt-8">
              <button onClick={openSignup}
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-sm transition-all"
                style={{ background: G, color: '#fff', boxShadow: `0 4px 20px ${G}40` }}
                onMouseEnter={e => { e.currentTarget.style.background = '#6fa23e'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = G; e.currentTarget.style.transform = 'translateY(0)'; }}>
                Analyze My Games Free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} className="py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-4 text-xs" style={{ color: MUTED }}>
            <Link href="/learn" className="hover:underline">Learn</Link>
            <Link href="/pricing" className="hover:underline">Pricing</Link>
            <Link href="/vs/aimchess" className="hover:underline">vs Aimchess</Link>
            <Link href="/vs/improve-my-chess" className="hover:underline">vs Improve My Chess</Link>
            <Link href="/vs/free-chess-analysis" className="hover:underline">vs Free Analysis</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:underline">Terms</Link>
          </div>
          <p className="text-xs text-center" style={{ color: MUTED }}>
            ChessScout.net &middot; Improve your game, one move at a time.
          </p>
        </div>
      </footer>

      <div className="fixed bottom-0 left-0 right-0 z-30 sm:hidden p-3 bottom-nav-safe" style={{ background: `${BG}f0`, backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={openSignup}
          className="w-full group flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm"
          style={{ background: G, color: '#fff' }}>
          Analyze My Games Free
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} externalError={oauthError} />
    </div>
  );
}
