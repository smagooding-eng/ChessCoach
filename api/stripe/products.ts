import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

// This route intentionally lives on Vercel instead of the Render backend.
// Render's free tier has documented outbound-connectivity restrictions that
// cause GET /api/stripe/products to fail with a StripeConnectionError, even
// with a valid sk_live_ key. Vercel serverless functions don't have that
// restriction, so this calls Stripe directly with no DB fallback needed.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    res.status(500).json({ error: 'STRIPE_SECRET_KEY is not set on Vercel' });
    return;
  }

  try {
    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-08-27.basil' as any,
    });

    const products = await stripe.products.list({ active: true, limit: 10 });

    const result = [];
    for (const product of products.data) {
      const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
      result.push({
        id: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
        prices: prices.data.map((p) => ({
          id: p.id,
          unit_amount: p.unit_amount,
          currency: p.currency,
          recurring: p.recurring,
          active: p.active,
        })),
      });
    }

    res.json({ data: result });
  } catch (err: any) {
    console.error('Vercel Stripe products error:', err.message);
    res.status(500).json({
      error: 'Failed to list products',
      _debug: { message: err.message, type: err.type, code: err.code },
    });
  }
}
