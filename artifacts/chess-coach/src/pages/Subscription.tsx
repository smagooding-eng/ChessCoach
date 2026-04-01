import { useState, useEffect } from 'react';
import { useUser } from '@/hooks/use-user';
import { useLocation } from 'wouter';
import { Crown, Check, Zap, BrainCircuit, GraduationCap, Swords, Volume2, Loader2, ExternalLink, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api';

const PREMIUM_FEATURES = [
  { icon: BrainCircuit, label: 'AI Game Analysis', desc: 'Deep GPT-powered analysis of every game' },
  { icon: GraduationCap, label: 'Personalized Courses', desc: 'AI-generated courses based on your weaknesses' },
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
    apiFetch('/api/stripe/products', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.data) setProducts(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCheckout = async (priceId: string) => {
    if (!isAuthenticated) {
      setLocation('/setup');
      return;
    }

    setCheckoutLoading(priceId);
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
      }
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await apiFetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Portal error:', err);
    } finally {
      setPortalLoading(false);
    }
  };


  const product = products[0];
  const weeklyPrice = product?.prices?.find((p: PriceInfo) => p.recurring?.interval === 'week');
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
          Welcome to Chess Coach Pro! Your subscription is now active.
        </motion.div>
      )}
      {isCanceled && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-center"
        >
          Checkout was canceled. You can try again anytime.
        </motion.div>
      )}

      <div className="text-center mb-8">
        <Crown className="w-12 h-12 text-primary mx-auto mb-3" />
        <h1 className="text-3xl font-display font-bold mb-2">
          {subscription.status === 'free_trial'
            ? 'Free Trial'
            : isPremium ? 'Your Premium Plan' : 'Upgrade to Pro'}
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          {subscription.status === 'free_trial'
            ? `You have ${subscription.trialDaysLeft} day${subscription.trialDaysLeft === 1 ? '' : 's'} left in your free trial. Subscribe before it ends to keep all premium features.`
            : isPremium
              ? 'You have access to all premium features.'
              : 'Your free trial has ended. Subscribe to Chess Coach Pro to unlock all premium features.'}
        </p>
      </div>

      {subscription.status === 'free_trial' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 max-w-md mx-auto p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-center text-sm"
        >
          <Clock className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          {subscription.trialDaysLeft} day{subscription.trialDaysLeft === 1 ? '' : 's'} remaining in your free trial. Add your payment info below to continue after the trial.
        </motion.div>
      )}

      {isPremium && subscription.status !== 'free_trial' ? (
        <div className="max-w-md mx-auto">
          <div className="glass-panel rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Chess Coach Pro</h3>
                <p className="text-sm text-muted-foreground capitalize">
                  Status: <span className="text-primary font-semibold">{subscription.status}</span>
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
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors font-semibold text-sm"
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
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="glass-panel rounded-2xl p-6 border-2 border-border/60">
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

            <div className="glass-panel rounded-2xl p-6 border-2 border-primary/40 relative overflow-hidden">
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider">
                3-day free trial
              </div>
              <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" />
                Pro Plan
              </h3>

              <div className="space-y-3 mb-6">
                {PREMIUM_FEATURES.map((f) => (
                  <div key={f.label} className="flex items-start gap-2.5">
                    <f.icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">{f.label}</p>
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
                  {weeklyPrice && (
                    <button
                      onClick={() => handleCheckout(weeklyPrice.id)}
                      disabled={!!checkoutLoading}
                      className="w-full flex items-center justify-center gap-2 btn-primary text-sm py-3"
                    >
                      {checkoutLoading === weeklyPrice.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          $1/week
                        </>
                      )}
                    </button>
                  )}
                  {monthlyPrice && (
                    <button
                      onClick={() => handleCheckout(monthlyPrice.id)}
                      disabled={!!checkoutLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors font-semibold text-sm"
                    >
                      {checkoutLoading === monthlyPrice.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>$4/month <span className="text-xs text-muted-foreground">(save ~$0.35/week)</span></>
                      )}
                    </button>
                  )}
                  {!weeklyPrice && !monthlyPrice && (
                    <p className="text-sm text-muted-foreground text-center">Pricing plans coming soon.</p>
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
