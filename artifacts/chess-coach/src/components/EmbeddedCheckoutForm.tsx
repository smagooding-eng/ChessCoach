import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2, Lock } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const CHESSCOM_GREEN = '#81b64c';

// Loaded once per module -- loadStripe() caches internally, but this
// keeps us from re-triggering the script load on every render.
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string);

interface EmbeddedCheckoutFormProps {
  priceId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function CheckoutFormInner({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    // confirmPayment handles 3D Secure / SCA authentication inline (a
    // modal, not a redirect) if the card requires it -- the vast
    // majority of cards don't, and this completes instantly.
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed. Please check your card details and try again.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />

      {error && (
        <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(220,67,67,0.2)', border: '1px solid rgba(220,67,67,0.5)', color: '#ffffff' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-black text-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100"
        style={{ background: `linear-gradient(180deg, #a8d876 0%, ${CHESSCOM_GREEN} 55%, #5f8f36 100%)`, color: '#fff', boxShadow: '0 4px 0 #4a7028' }}
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        {submitting ? 'Processing...' : 'Subscribe'}
      </button>

      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        Cancel
      </button>
    </form>
  );
}

export function EmbeddedCheckoutForm({ priceId, onSuccess, onCancel }: EmbeddedCheckoutFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/stripe/checkout-embedded', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.clientSecret) {
          setError(data.error || 'Could not start checkout. Please try again.');
          return;
        }
        setClientSecret(data.clientSecret);
      })
      .catch(() => {
        if (!cancelled) setError('Connection error. Please try again.');
      });
    return () => { cancelled = true; };
  }, [priceId]);

  if (error) {
    return (
      <div className="p-4 rounded-xl text-sm text-center" style={{ background: 'rgba(220,67,67,0.2)', border: '1px solid rgba(220,67,67,0.5)', color: '#ffffff' }}>
        {error}
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: CHESSCOM_GREEN }} />
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: CHESSCOM_GREEN,
            colorBackground: '#262421',
            colorText: '#e8e6e3',
            borderRadius: '12px',
          },
        },
      }}
    >
      <CheckoutFormInner onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}
