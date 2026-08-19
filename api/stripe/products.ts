import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import https from 'https';

// Previous fix (disabling keep-alive) did NOT resolve the
// StripeConnectionError, which rules out stale-socket reuse.
// Next theory: Node's DNS resolver can prefer an IPv6 route to
// api.stripe.com that this hosting environment can't actually reach,
// while curl (used to confirm connectivity manually) defaulted to a
// working IPv4 route with the same key on the same physical network
// path. Forcing family: 4 makes Node use IPv4 only for this client.
const ipv4OnlyAgent = new https.Agent({
  keepAlive: false,
  family: 4,
});

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
      httpAgent: ipv4OnlyAgent,
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
