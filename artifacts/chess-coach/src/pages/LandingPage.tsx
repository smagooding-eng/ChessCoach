import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useUser } from '@/hooks/use-user';
import { useLocation, Link } from 'wouter';
import { trackFunnelEvent } from '@/lib/funnelTracking';
import { useLandingFunnelTracking } from '@/hooks/use-landing-funnel-tracking';
import { Play as PlayIcon, ArrowRight, Mail, Eye, EyeOff, UserPlus, LogIn, Search, BarChart3, Brain, Check, X, Target, Crosshair, BookOpen, Gamepad2, Flame, Puzzle, Users, Skull, History, GraduationCap, Download as DownloadIcon, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, apiUrl, setAuthToken } from '@/lib/api';
import { useSiteImg } from '@/hooks/use-app-config';
import { GooglePlayBadge } from '@/components/GooglePlayBadge';
import { SiteStatsLine, HappeningNow } from '@/components/SiteStats';
import { t, tn, noGT } from '@/lib/i18n';
import { LanguageSelect } from '@/components/LanguagePicker';

const G = '#81B64C';
const G_HOVER = '#6FA23E';
const BG = '#050A0B';
const CARD = '#0D1516';
const TEXT = '#F5F7F6';
const MUTED = '#9AA8A5';
const ON_G = '#05100A'; // text colour on neon green: dark, for contrast

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
    { ok: pwd.length >= 8, label: t('At least 8 characters') },
    { ok: /[A-Za-z]/.test(pwd), label: t('Contains a letter') },
    { ok: /[0-9]/.test(pwd), label: t('Contains a number') },
  ];
}

function AuthModal({ open, onClose, initialMode, externalError, context = 'default' }: { open: boolean; onClose: () => void; initialMode: 'login' | 'register'; externalError?: string; context?: 'default' | 'opponent_scout' }) {
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
      trackFunnelEvent('signup_form_submitted');
      if (!clientValidEmail(email)) {
        setError(t('Please enter a valid email address'));
        trackFunnelEvent('signup_error');
        return;
      }
      const failed = passwordChecks(password).filter(c => !c.ok);
      if (failed.length > 0) {
        setError(failed[0].label);
        trackFunnelEvent('signup_error');
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
      if (!res.ok) {
        setError(data.error || t('Something went wrong'));
        if (mode === 'register') trackFunnelEvent('signup_error');
        return;
      }
      if (mode === 'register') trackFunnelEvent('signup_completed');
      if (data.token) setAuthToken(data.token);
      localStorage.removeItem('chessscout_ref');
      if (data.user?.chesscomUsername) login(data.user.chesscomUsername);
      await refreshAuth();
      setLocation('/');
    } catch {
      setError(t('Connection error. Please try again.'));
      if (mode === 'register') trackFunnelEvent('signup_error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    trackFunnelEvent('google_oauth_clicked');
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
          <button onClick={onClose} aria-label={t('Close')} className="absolute top-4 right-4 hover:opacity-70 transition-opacity" style={{ color: MUTED }}>
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-black" style={{ color: TEXT }}>
              {mode === 'login' ? t('Welcome Back') : context === 'opponent_scout' ? t('Scout Any Opponent Free') : t('Create Your Free Account')}
            </h2>
            <p className="text-sm mt-1" style={{ color: MUTED }}>
              {mode === 'login' ? t('Sign in to your account') : t('Free to start — upgrade to Pro anytime')}
            </p>
            {mode === 'register' && (
              <p className="text-xs font-bold mt-1.5 flex items-center justify-center gap-1" style={{ color: G }}>
                <Check className="w-3.5 h-3.5" /> {t('No credit card required')}
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
                {t('Continue with Google')}
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                <span className="text-xs uppercase" style={{ color: MUTED }}>{t('or')}</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(220,67,67,0.35)', border: '1px solid rgba(220,67,67,0.6)', color: '#ffffff' }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1 ml-1" style={{ color: TEXT }}>{t('Email')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED }} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setEmailTouched(true)} placeholder="you@example.com" required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.08)', color: TEXT }}
                  onFocus={e => (e.target.style.borderColor = G)} />
              </div>
              {mode === 'register' && emailTouched && email && !clientValidEmail(email) && (
                <p className="text-[11px] mt-1 ml-1" style={{ color: '#ef6b6b' }}>{t("That doesn't look like a valid email address.")}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 ml-1" style={{ color: TEXT }}>{t('Password')}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? t('At least 8 chars, with letters & numbers') : t('Your password')} required minLength={mode === 'register' ? 8 : undefined}
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
              style={{ background: G, color: ON_G }}
              onMouseEnter={e => (e.currentTarget.style.background = G_HOVER)}
              onMouseLeave={e => (e.currentTarget.style.background = G)}>
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : mode === 'register' ? (
                <><UserPlus className="w-4 h-4" />{context === 'opponent_scout' ? t('Scout Any Opponent Free') : t('Create Free Account')}</>
              ) : (
                <><LogIn className="w-4 h-4" />{t('Sign In')}</>
              )}
              {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <div className="mt-5 text-center text-sm" style={{ color: MUTED }}>
            {mode === 'login' ? (
              <>{t("Don't have an account?")}{' '}<button onClick={() => { setMode('register'); setError(''); }} className="font-medium hover:underline" style={{ color: G }}>{t('Sign up')}</button></>
            ) : (
              <>{t('Already have an account?')}{' '}<button onClick={() => { setMode('login'); setError(''); }} className="font-medium hover:underline" style={{ color: G }}>{t('Sign in')}</button></>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Previously used its own IntersectionObserver to only start counting up
// once scrolled into view -- but the parent section already fades in via
// whileInView, and opacity:0 doesn't stop an element from being
// geometrically "in the viewport." That meant the count-up could run
// (and finish) while still invisible, so it snapped straight to the
// final number the instant the fade-in revealed it. Simpler and
// correct: this only ever mounts after stats have already loaded and
// the section is about to render, so just animate on mount.
function AnimatedCount({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (target <= 0 || started.current) return;
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
  }, [target, duration]);

  return <span>{count.toLocaleString()}</span>;
}

function SocialProofBar() {
  const [stats, setStats] = useState<{ users: number; gamesImported: number; gamesAnalyzed: number } | null>(null);

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

// ── One-screen landing page ──────────────────────────────────────────────────────────────
// The position in the example board is a real tactic (checked): White wins with 18.Qxd8!, and after
// ...Rxd8 19.Rxd8 is checkmate. The card text below only claims "a winning combination".
const SAMPLE_FEN = '3r1rk1/pp3ppp/4b3/8/2B5/3Q1N2/PP3PPP/3R2K1';

function ExampleBoard() {
  const cells: (string | null)[] = [];
  SAMPLE_FEN.split('/').forEach((row) => {
    for (const ch of row) {
      if (/\d/.test(ch)) for (let k = 0; k < parseInt(ch, 10); k++) cells.push(null);
      else cells.push(ch);
    }
  });
  const sprite = (ch: string) => `${import.meta.env.BASE_URL}pieces/chessnut/${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toUpperCase()}.svg`;
  // Drawn as ONE svg in an 8x8 coordinate space. The previous CSS-grid version let the
  // rows size themselves from inline <img> line boxes, so rows came out unequal and a
  // seam showed across the board; squares, pieces, highlights and the arrow now all share
  // the same exact grid. Light squares are a single background rect, so there are no
  // light/light edges at all, and dark squares use crispEdges to avoid hairline gaps.
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.12)' }} role="img" aria-label={t('Example position with a missed winning tactic')}>
      <svg viewBox="0 0 8 8" className="block h-full w-full" preserveAspectRatio="none">
        <rect x="0" y="0" width="8" height="8" fill="#C9D3B6" />
        {Array.from({ length: 64 }, (_, i) => {
          const f = i % 8, r = Math.floor(i / 8);
          return (r + f) % 2 === 1 ? <rect key={`d${i}`} x={f} y={r} width="1" height="1" fill="#4F6B45" shapeRendering="crispEdges" /> : null;
        })}
        <rect x="6" y="0" width="1" height="1" fill="rgba(255,80,88,0.6)" shapeRendering="crispEdges" />
        <rect x="3" y="0" width="1" height="1" fill="rgba(129,182,76,0.5)" shapeRendering="crispEdges" />
        {cells.slice(0, 64).map((ch, i) => ch ? (
          <image key={`p${i}`} href={sprite(ch)} x={i % 8} y={Math.floor(i / 8)} width="1" height="1" preserveAspectRatio="xMidYMid meet" />
        ) : null)}
        <g className="pointer-events-none">
          <line x1="3.5" y1="5.12" x2="3.5" y2="1.45" stroke={G} strokeWidth="0.2" strokeLinecap="round" />
          <polygon points="3.5,0.9 3.2,1.5 3.8,1.5" fill={G} />
        </g>
      </svg>
    </div>
  );
}

function PersonalAnalysisCard() {
  const rows = [
    { icon: Crosshair, name: t('Tactical Awareness'), level: t('HIGH'), pct: 72, color: '#FF5058', note: t('You missed tactical opportunities in 7 of your last 20 games.') },
    { icon: BookOpen, name: t('Opening Preparation'), level: t('MEDIUM'), pct: 38, color: '#F2A93B', note: '' },
    { icon: Brain, name: t('Positional Play'), level: t('LOW'), pct: 22, color: G, note: '' },
  ];
  return (
    <div className="grid grid-cols-[1.45fr_1fr] overflow-hidden rounded-[20px]"
      style={{ background: 'linear-gradient(160deg, rgba(14,26,24,0.9), rgba(6,13,12,0.92))', border: '1px solid rgba(129,182,76,0.22)', boxShadow: '0 24px 60px -30px rgba(129,182,76,0.35)' }}>
      <div className="min-w-0 p-2.5 sm:p-5">
        <div className="mb-2 flex items-center gap-2 sm:mb-4">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full sm:h-9 sm:w-9" style={{ background: '#81B64C' }}><Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: '#FFFFFF' }} /></span>
          <span className="text-[10px] font-black uppercase leading-tight tracking-[0.08em] sm:text-[12px]" style={{ color: G }}>{t('Your personal analysis')}</span>
        </div>
        <div className="space-y-2 sm:space-y-4">
          {rows.map((r) => (
            <div key={r.name}>
              <div className="mb-1 flex items-center justify-between gap-1.5">
                <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold sm:gap-2 sm:text-[15px]" style={{ color: TEXT }}>
                  <r.icon className="hidden h-4 w-4 shrink-0 sm:block" style={{ color: r.color }} />
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="shrink-0 rounded px-1 py-px text-[8.5px] font-black tracking-wider sm:px-1.5 sm:py-0.5 sm:text-[10px]" style={{ color: r.color, background: `${r.color}22`, border: `1px solid ${r.color}55` }}>{r.level}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full sm:h-2" style={{ background: 'rgba(255,255,255,0.09)' }}><div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} /></div>
                <span className="w-8 text-right text-[10.5px] font-bold sm:text-[12px]" style={{ color: MUTED }}>{r.pct}%</span>
              </div>
              {r.note && <p className="mt-1 text-[11px] leading-snug [@media(max-height:780px)]:hidden sm:text-[12.5px]" style={{ color: MUTED }}>{r.note}</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0 p-2.5 sm:p-5" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        <p className="mb-1.5 text-[9px] font-black uppercase leading-tight tracking-[0.06em] sm:mb-2 sm:text-[11px]" style={{ color: MUTED }}>{t('A real example from your game')}</p>
        <ExampleBoard />
        <p className="mt-1.5 text-[12px] font-bold sm:mt-2 sm:text-[14px]" style={{ color: TEXT }}>{tn('You played {move}', { move: <span translate="no" style={{ color: '#FF5058' }}>18. Qe2?</span> })}</p>
        <p className="mt-0.5 text-[10px] leading-snug [@media(max-height:780px)]:hidden sm:text-[12px]" style={{ color: MUTED }}>{t('You missed a winning combination. ChessScout shows you exactly what to look for and how to fix it.')}</p>
      </div>
    </div>
  );
}

export function LandingPage() {
  const siteImg = useSiteImg();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authContext, setAuthContext] = useState<'default' | 'opponent_scout'>('default');
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
      trackFunnelEvent('google_signup_error');
      setOauthError(t('Google sign-in is not available yet. Please use email and password.'));
      setAuthOpen(true);
    } else if (urlError === 'google_auth_failed') {
      trackFunnelEvent('google_signup_error');
      setOauthError(t('Google sign-in failed. Please try again or use email and password.'));
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

  const openSignup = () => { trackFunnelEvent('signup_clicked'); setAuthMode('register'); setAuthContext('default'); setAuthOpen(true); };

  // Separate from openSignup deliberately: someone clicking "Scout an
  // opponent" wants to scout an opponent, not necessarily to sign up --
  // counting this click as signup_clicked was inflating that funnel
  // metric with non-signup intent and, worse, popping up a modal headed
  // "Analyze My Games Free" for someone who never asked to analyze their
  // own games. Tracked and labeled separately instead.
  const openOpponentScout = () => { trackFunnelEvent('opponent_scout_clicked'); setAuthMode('register'); setAuthContext('opponent_scout'); setAuthOpen(true); };
  const openLogin = () => { setAuthMode('login'); setAuthOpen(true); };

  // The motto's three words, as the strip under the hero: each opens the
  // matching part of ChessScout (Scout goes to the public player pages, so a
  // visitor can try it without signing up).
  const pillars = [
    { icon: PlayIcon, title: t('Play'), sub: t('Live · Daily · Bots'), onClick: openSignup },
    { icon: Crosshair, title: t('Scout'), sub: t('See what anyone plays'), onClick: () => setLocation('/players') },
    { icon: BarChart3, title: t('Improve'), sub: t('Every game reviewed'), onClick: openSignup },
  ];

  return (
    <div {...noGT()} className="relative flex min-h-[100dvh] flex-col overflow-x-hidden" style={{ background: `radial-gradient(ellipse at 75% 0%, #0F2B1D 0%, #07130F 34%, ${BG} 68%)` }}>
      {/* knight art: bleeds off the right edge on phones (as in the mockup), sits fully in view on desktop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <img src={siteImg(`${import.meta.env.BASE_URL}chessscout/scout-knight.webp`)} alt=""
          className="absolute right-[-34%] top-[7%] h-[58%] w-auto max-w-none sm:right-[-6%] sm:top-[4%] sm:h-[70%] lg:right-0 lg:top-0 lg:h-[88%]"
          style={{ WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 58%, transparent 100%)', maskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 58%, transparent 100%)' }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${BG} 0%, ${BG}f2 34%, ${BG}b3 60%, ${BG}00 100%)` }} />
        <div className="absolute inset-x-0 bottom-0 h-[34%]" style={{ background: `linear-gradient(180deg, ${BG}00, ${BG})` }} />
      </div>

      <nav className="relative z-20 shrink-0">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-8">
          <div translate="no" className="flex items-baseline gap-0.5">
            <span className="text-[1.3rem] font-black tracking-tight" style={{ color: TEXT }}>Chess</span>
            <span className="text-[1.3rem] font-black tracking-tight" style={{ color: G }}>Scout</span>
            <span className="ml-0.5 text-sm font-bold" style={{ color: MUTED }}>.net</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/players" className="hidden text-sm font-medium transition-colors hover:text-white sm:inline" style={{ color: MUTED }}>{t('Top players')}</Link>
            <Link href="/pricing" className="hidden text-sm font-medium transition-colors hover:text-white sm:inline" style={{ color: MUTED }}>{t('Pricing')}</Link>
            <LanguageSelect compact className="hidden text-sm font-medium sm:inline-flex" style={{ color: MUTED }} />
            <button onClick={openLogin} className="text-sm font-medium transition-colors hover:text-white" style={{ color: MUTED }}>{t('Sign In')}</button>
            <button onClick={openSignup} className="rounded-xl px-4 py-2 text-sm font-extrabold transition-all sm:px-5 sm:py-2.5"
              style={{ background: G, color: ON_G, boxShadow: `0 6px 22px ${G}40` }}
              onMouseEnter={e => (e.currentTarget.style.background = G_HOVER)} onMouseLeave={e => (e.currentTarget.style.background = G)}>
              {t('Join Free')}
            </button>
          </div>
        </div>
      </nav>

      <main data-track-section="hero" className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center gap-3 px-4 pb-3 sm:px-8 lg:grid lg:grid-cols-2 lg:gap-12 lg:pb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="lg:self-center">
          <h1 className="font-black leading-[1.04] tracking-tight text-[clamp(2.1rem,11vw,3.2rem)] sm:text-[3.8rem] lg:text-[5rem]" style={{ color: TEXT, fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {t('Play.')}<br />
            {t('Scout.')}<br />
            <span className="relative inline-block">
              <span style={{ color: G }}>{t('Improve.')}</span>
              <motion.span aria-hidden initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.5, duration: 0.7, ease: 'easeOut' }}
                className="absolute -bottom-1.5 left-0 right-0 h-1 origin-left rounded-full" style={{ background: `linear-gradient(90deg, ${G}, ${G}00)` }} />
            </span>
          </h1>

          {/* The second half of the motto: a full line under the headline, not a small tag. */}
          <p className="mt-3 text-[clamp(1.15rem,5.6vw,1.6rem)] font-extrabold leading-tight tracking-tight sm:text-[1.9rem] lg:text-[2.2rem]" style={{ color: TEXT }}>
            {t('Play smarter.')} <span style={{ color: G }}>{t('Win more.')}</span>
          </p>

          <p className="mt-2 max-w-[34rem] text-[14px] leading-snug [@media(max-height:700px)]:hidden sm:text-base sm:leading-relaxed lg:text-lg" style={{ color: 'rgba(245,247,246,0.78)' }}>
            {t('Play live, daily or against bots right here on ChessScout. Your coach reviews every game and shows exactly why you won or lost — and before a big game, scout what your opponent plays.')}
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <button onClick={openSignup}
              className="group inline-flex items-center justify-center gap-2.5 rounded-2xl px-7 py-3 text-[15px] font-extrabold transition-all sm:px-9 sm:py-3.5 sm:text-base"
              style={{ background: `linear-gradient(180deg, #A8D876, ${G_HOVER})`, color: ON_G, boxShadow: `0 14px 36px -12px ${G}90` }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
              <PlayIcon className="h-5 w-5" fill="currentColor" />
              {t('Play Free')}
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
            <button onClick={openOpponentScout}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[14px] font-extrabold transition-colors sm:py-3.5 sm:text-[15px]"
              style={{ background: 'rgba(255,255,255,.06)', color: TEXT, border: '1px solid rgba(255,255,255,.14)' }}>
              <Search className="h-4 w-4" style={{ color: G }} />
              {t('Scout an Opponent')}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-semibold sm:gap-x-5 sm:text-[13px]" style={{ color: 'rgba(245,247,246,0.82)' }}>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" style={{ color: G }} /> {t('Free to start')}</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" style={{ color: G }} /> {t('No credit card required')}</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" style={{ color: G }} /> {t('Cancel anytime')}</span>
          </div>
          <SiteStatsLine className="mt-2 text-[12px] sm:text-[13px]" style={{ color: 'rgba(245,247,246,0.72)' }} />
          <HappeningNow className="mt-2" />
          <GooglePlayBadge height={44} className="mt-3" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.12 }} className="lg:self-end">
          <PersonalAnalysisCard />
        </motion.div>
      </main>

      <div className="relative z-10 mx-auto w-full max-w-7xl shrink-0 px-4 sm:px-8">
        <div className="grid grid-cols-3 rounded-2xl py-2 sm:py-3 lg:py-4" style={{ background: 'rgba(13,21,22,0.72)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {pillars.map((f, i) => (
            <button key={f.title} onClick={f.onClick} className="flex flex-col items-center px-1.5 text-center transition-colors hover:bg-white/[0.03] sm:px-4"
              style={{ borderLeft: i ? '1px solid rgba(255,255,255,0.08)' : undefined }}>
              <f.icon className="mb-1 h-5 w-5 sm:mb-1.5 sm:h-7 sm:w-7" style={{ color: G }} />
              <span className="text-[13px] font-extrabold leading-tight sm:text-[16px]" style={{ color: TEXT }}>{f.title}</span>
              <span className="mt-0.5 text-[10.5px] leading-tight sm:text-[12.5px]" style={{ color: MUTED }}>{f.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <footer className="relative z-10 shrink-0 px-4 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2 text-center text-[11px]" style={{ color: MUTED }}>
        <span className="mr-3 hidden sm:inline">{t('For club players 400–2000 ELO.')}</span>
        <LanguageSelect compact className="mx-1.5 align-middle sm:hidden" />
        <Link href="/pricing" className="mx-1.5 hover:underline">{t('Pricing')}</Link>
        <Link href="/players" className="mx-1.5 hover:underline">{t('Top players')}</Link>
        <Link href="/learn" className="mx-1.5 hover:underline">{t('Learn')}</Link>
        <a href={`${import.meta.env.BASE_URL}download`} className="mx-1.5 hover:underline">{t('Get the app')}</a>
        <Link href="/privacy" className="mx-1.5 hover:underline">{t('Privacy')}</Link>
        <Link href="/terms" className="mx-1.5 hover:underline">{t('Terms')}</Link>
        <Link href="/credits" className="mx-1.5 hover:underline">{t('Photo credits')}</Link>
      </footer>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} externalError={oauthError} context={authContext} />
    </div>
  );
}
