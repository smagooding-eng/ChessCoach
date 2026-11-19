// Straight to the 3-day Pro trial checkout (Stripe), from wherever the offer was made.
// source is logged so the admin trial panel can show where trials start.
import { apiFetch, apiFetchLocal } from '@/lib/api';

type Price = { id: string; recurring?: { interval?: string } };

export async function startTrial(source: 'promo' | 'coach' | 'subscription'): Promise<string | null> {
  const d = await apiFetchLocal('/api/stripe/products').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const price = (d?.data?.[0]?.prices as Price[] | undefined)?.find((x) => x.recurring?.interval === 'month');
  if (!price) { window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/subscription?offer=trial&from=${source}`; return null; }
  try {
    const r = await apiFetch('/api/stripe/checkout-trial', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: price.id, source }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.url) { window.location.href = j.url; return null; }
    return j.error || 'Couldn’t start the free trial. Please try again.';
  } catch { return 'Connection error. Please try again.'; }
}
