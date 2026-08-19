import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import https from 'https';

// Root cause found: the Stripe Node SDK's default HTTP agent keeps TCP
// connections alive and reuses them across invocations. In serverless
// environments (Vercel Functions, Render's container model), the
// container can freeze/thaw between requests, and the agent tries to
// reuse a socket that's already dead server-side -- which surfaces as a
// generic StripeConnectionError. Confirmed via: (1) raw curl from a
// normal machine works fine with the same key, (2) zero GET requests
// from this account ever reached Stripe's logs from either Render or
// Vercel. Disabling keep-alive forces a fresh connection every request,
// which avoids the stale-socket reuse entirely.
const noKeepAliveAgent = new https.Agent({ keepAlive: false });

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
      httpAgent: noKeepAliveAgent,
      maxNetworkRetries: 2,
      timeout: 15000,
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
