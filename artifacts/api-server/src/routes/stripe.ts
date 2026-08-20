import { Router, type IRouter, type Request, type Response } from 'express';
import { storage } from '../lib/storage';
import { stripeService } from '../lib/stripeService';
import { getUncachableStripeClient } from '../lib/stripeClient';
import { db, referralConversionsTable, usersTable } from '@workspace/db';
import { eq, and, sql } from 'drizzle-orm';
import crypto from 'crypto';

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

router.get('/stripe/config', async (_req: Request, res: Response) => {
  try {
    const publishableKey = await stripeService.getPublishableKey();
    res.json({ publishableKey });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get Stripe config' });
  }
});

const FREE_TRIAL_DAYS = 3;

function getTrialInfo(createdAt: Date | string) {
  const created = new Date(createdAt);
  const now = new Date();
  const elapsed = now.getTime() - created.getTime();
  const totalMs = FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const remaining = totalMs - elapsed;
  const daysLeft = Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  return { isActive: remaining > 0, daysLeft, endsAt: new Date(created.getTime() + totalMs).toISOString() };
}

router.get('/stripe/subscription', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const user = await storage.getUser(req.user.id);

    if (user?.isPremiumOverride) {
      res.json({ subscription: null, status: 'active', premiumOverride: true });
      return;
    }

    if (user?.stripeCustomerId) {
      let subscription: any = null;
      try {
        subscription = await storage.getSubscriptionByCustomerId(user.stripeCustomerId);
      } catch {
        try {
          const stripe = await getUncachableStripeClient();
          const subs = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status: 'all',
            limit: 1,
          });
          if (subs.data.length > 0) {
            subscription = subs.data[0];
          }
        } catch {}
      }
      if (subscription && ['active', 'trialing'].includes(subscription.status as string)) {
        if (subscription.status === 'active') {
          try {
            const [pending] = await db.select().from(referralConversionsTable)
              .where(and(
                eq(referralConversionsTable.referredUserId, req.user.id),
                eq(referralConversionsTable.status, 'signed_up')
              ));
            if (pending) {
              await db.update(referralConversionsTable)
                .set({ status: 'converted', convertedAt: new Date() })
                .where(eq(referralConversionsTable.id, pending.id));
            }
          } catch {}
        }
        if (subscription.status === 'active' && !user?.inviteCode) {
          try {
            await db.update(usersTable)
              .set({ inviteCode: generateInviteCode() })
              .where(eq(usersTable.id, req.user.id));
          } catch {}
        }
        res.json({ subscription, status: subscription.status });
        return;
      }
    }

    res.json({ subscription: null, status: 'free' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

router.post('/stripe/checkout', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { priceId } = req.body;
  if (!priceId) {
    res.status(400).json({ error: 'priceId is required' });
    return;
  }

  try {
    if (!priceId.startsWith('price_')) {
      res.status(400).json({ error: 'Invalid price ID' });
      return;
    }

    const user = await storage.getUser(req.user.id);
    let customerId = user?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripeService.createCustomer(
        user?.email || `${req.user.id}@chess-coach.app`,
        req.user.id,
      );
      await storage.updateUserStripeInfo(req.user.id, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    const frontendUrl = process.env.CORS_ORIGIN;
    const origin = frontendUrl || getOrigin(req);
    const basePath = frontendUrl ? '' : '/chess-coach';
    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${origin}${basePath}/subscription?success=true`,
      `${origin}${basePath}/subscription?canceled=true`,
    );

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/stripe/portal', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const user = await storage.getUser(req.user.id);
    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No Stripe customer found' });
      return;
    }

    const frontendUrl = process.env.CORS_ORIGIN;
    const origin = frontendUrl || getOrigin(req);
    const basePath = frontendUrl ? '' : '/chess-coach';
    const session = await stripeService.createCustomerPortalSession(
      user.stripeCustomerId,
      `${origin}${basePath}/subscription`,
    );

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Portal session error:', err.message, err.code);
    res.status(500).json({ error: err.message || 'Failed to create portal session' });
  }
});

router.get('/stripe/products', async (_req: Request, res: Response) => {
  try {
    try {
      const stripe = await getUncachableStripeClient();
      const products = await stripe.products.list({ active: true, limit: 10 });
      if (products.data.length > 0) {
        const result = [];
        for (const product of products.data) {
          const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
          result.push({
            id: product.id,
            name: product.name,
            description: product.description,
            active: product.active,
            prices: prices.data.map((p: any) => ({
              id: p.id,
              unit_amount: p.unit_amount,
              currency: p.currency,
              recurring: p.recurring,
              active: p.active,
            })),
          });
        }
        res.json({ data: result });
        return;
      }
    } catch (stripeErr: any) {
      console.error('Live Stripe products fetch failed:', stripeErr.message);
    }

    let rows: any[] = [];
    try {
      rows = await storage.listProductsWithPrices();
    } catch (cacheErr: any) {
      console.error('Cached products fetch failed:', cacheErr.message);
    }

    if (rows.length > 0) {
      const productsMap = new Map<string, any>();
      for (const row of rows) {
        if (!productsMap.has(row.product_id as string)) {
          productsMap.set(row.product_id as string, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            prices: []
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id as string).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
          });
        }
      }
      res.json({ data: Array.from(productsMap.values()) });
      return;
    }

    res.json({ data: [] });
  } catch (err: any) {
    console.error('Products list error:', err.message);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

export default router;
