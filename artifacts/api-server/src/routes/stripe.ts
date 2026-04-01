import { Router, type IRouter, type Request, type Response } from 'express';
import { storage } from '../lib/storage';
import { stripeService } from '../lib/stripeService';

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

    if (user?.stripeCustomerId) {
      const subscription = await storage.getSubscriptionByCustomerId(user.stripeCustomerId);
      if (subscription && ['active', 'trialing'].includes(subscription.status)) {
        res.json({ subscription, status: subscription.status });
        return;
      }
    }

    if (user?.createdAt) {
      const trial = getTrialInfo(user.createdAt);
      if (trial.isActive) {
        res.json({
          subscription: null,
          status: 'free_trial',
          trialDaysLeft: trial.daysLeft,
          trialEndsAt: trial.endsAt,
        });
        return;
      }
    }

    res.json({ subscription: null, status: 'none' });
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
    const price = await storage.getPrice(priceId);
    if (!price || !price.active) {
      res.status(400).json({ error: 'Invalid or inactive price' });
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

    const origin = getOrigin(req);
    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${origin}/chess-coach/subscription?success=true`,
      `${origin}/chess-coach/subscription?canceled=true`,
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

    const origin = getOrigin(req);
    const session = await stripeService.createCustomerPortalSession(
      user.stripeCustomerId,
      `${origin}/chess-coach/subscription`,
    );

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

router.get('/stripe/products', async (_req: Request, res: Response) => {
  try {
    const rows = await storage.listProductsWithPrices();

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
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list products' });
  }
});

export default router;
