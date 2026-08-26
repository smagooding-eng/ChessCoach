import { useState, useEffect } from 'react';
import { PieceTile } from '@/components/DesignSystem';
import { useUser } from '@/hooks/use-user';
import { useLocation } from 'wouter';
import { Crown, Check, Zap, BrainCircuit, GraduationCap, Swords, Volume2, Loader2, ExternalLink, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch, apiFetchLocal } from '@/lib/api';

const PREMIUM_FEATURES = [
  { icon: BrainCircuit, label: 'Deep Game Analysis', desc: 'In-depth analysis of every game you play' },
  { icon: GraduationCap, label: 'Personalized Courses', desc: 'Custom courses built from your weaknesses' },
  { icon: Volume2, label: 'TTS Narration', desc: 'Listen to lesson content with text-to-speech' },
  { icon: Swords, label: 'Opponent Scouting', desc: 'Analyze your opponents\' strengths and weaknesses' },
];

const FREE_FEATURES = [
  'Import games from chess.com',
  'View game history & replay moves',
  'Basic performance dashboard',
  'Practice against bots (all levels)',
  'Opening repertoire explorer',
];

interface PriceInfo {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string } | null;
  active: boolean;
}

interface ProductInfo {
  id: string;
  name: string;
  description: string;
  prices: PriceInfo[];
}

export function Subscription() {
  const { isAuthenticated, subscription, refreshSubscription, isPremium } = useUser();
  const [, setLocation] = useLocation();
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isSuccess = searchParams?.get('success') === 'true';
  const isCanceled = searchParams?.get('canceled') === 'true';

  useEffect(() => {
    if (isSuccess) {
      refreshSubscription();
    }
  }, [isSuccess, refreshSubscription]);

  useEffect(() => {
    // NOTE: uses apiFetchLocal (always same-origin/Vercel), not apiFetch
    // (which points at Render). This route is a Vercel serverless function
    // added to work around Render free tier's outbound-connectivity issue
    // reaching Stripe. See artifacts/chess-coach/api/stripe/products.ts.
    apiFetchLocal('/api/stripe/products', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.data) setProducts(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const [checkoutError, setCheckoutError] = useState('');

  const handleCheckout = async (priceId: string) => {
    if (!isAuthenticated) {
      setLocation('/setup');
      return;
    }

    setCheckoutLoading(priceId);
    setCheckoutError('');
    try {
      const res = await apiFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError(data.error || 'Could not start checkout. Please try again.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setCheckoutError('Connection error. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const [portalError, setPortalError] = useState('');

  const handlePortal = async () => {
    setPortalLoading(true);
    setPortalError('');
    try {
      const res = await apiFetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPortalError(data.error || 'Could not open subscription management. Please try again.');
      }
    } catch (err) {
      console.error('Portal error:', err);
      setPortalError('Connection error. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  };


  const product = products[0];
  const yearlyPrice = product?.prices?.find((p: PriceInfo) => p.recurring?.interval === 'year');
  const monthlyPrice = product?.prices?.find((p: PriceInfo) => p.recurring?.interval === 'month');

  return (
    <div className="p-4 md:p-0">
      {isSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-center"
        >
          <Check className="w-5 h-5 inline-block mr-2" />
          Welcome to ChessScout.net Pro! Your subscription is now active.
        </motion.div>
      )}
      {isCanceled && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-center font-medium"
        >
          Checkout was canceled. You can try again anytime.
        </motion.div>
      )}

      <div className="flex flex-col items-center text-center mb-8">
        <PieceTile piece="♛" size={56} />
        <h1 className="text-2xl md:text-3xl font-black mt-3 mb-2" style={{ letterSpacing: '-0.02em' }}>
          {isPremium ? 'Your Pro Plan' : 'Upgrade to Pro'}
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          {isPremium
            ? 'You have access to all Pro features.'
            : "You're on the Free plan. Subscribe to ChessScout.net Pro to unlock unlimited puzzles, opponent scouting, and courses."}
        </p>
      </div>

      {isPremium ? (
        <div className="max-w-md mx-auto">
          <div className="glass-panel rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">ChessScout.net Pro</h3>
                <p className="text-sm text-muted-foreground capitalize">
                  Status: <span className="text-primary font-bold">{subscription.status}</span>
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              {PREMIUM_FEATURES.map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  <span>{f.label}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors font-bold text-sm"
            >
              {portalLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Manage Subscription
                  <ExternalLink className="w-4 h-4" />
                </>
              )}
            </button>
            {portalError && (
              <p className="mt-2 text-xs text-red-400 text-center">{portalError}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="glass-panel rounded-xl p-6 border-2 border-border/60">
              <h3 className="text-lg font-bold mb-1">Free Plan</h3>
              <p className="text-3xl font-bold mb-4">$0<span className="text-sm font-normal text-muted-foreground">/forever</span></p>
              <div className="space-y-2.5 mb-6">
                {FREE_FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 rounded-xl bg-secondary/50 text-center text-sm text-muted-foreground font-medium">
                Current Plan
              </div>
            </div>

            <div className="glass-panel rounded-xl p-6 border-2 border-primary/40 relative overflow-hidden">
              <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" />
                Pro Plan
              </h3>

              <div className="space-y-3 mb-6">
                {PREMIUM_FEATURES.map((f) => (
                  <div key={f.label} className="flex items-start gap-2.5">
                    <f.icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold">{f.label}</p>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-2">
                  {monthlyPrice && (
                    <button
                      onClick={() => handleCheckout(monthlyPrice.id)}
                      disabled={!!checkoutLoading}
                      className="w-full flex items-center justify-center gap-2 btn-primary text-sm py-3"
                    >
                      {checkoutLoading === monthlyPrice.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          ${(monthlyPrice.unit_amount / 100).toFixed(0)}/month
                        </>
                      )}
                    </button>
                  )}
                  {yearlyPrice && (
                    <button
                      onClick={() => handleCheckout(yearlyPrice.id)}
                      disabled={!!checkoutLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors font-bold text-sm"
                    >
                      {checkoutLoading === yearlyPrice.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          ${(yearlyPrice.unit_amount / 100).toFixed(0)}/year
                        </>
                      )}
                    </button>
                  )}
                  {!yearlyPrice && !monthlyPrice && (
                    <p className="text-sm text-muted-foreground text-center">Pricing plans coming soon.</p>
                  )}
                  {checkoutError && (
                    <p className="text-xs text-red-400 text-center mt-2">{checkoutError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
