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

// Returns the commission (in cents) the referrer earns for this specific
// conversion, or null if they earn nothing -- not an affiliate, the
// affiliate program has ended, or this conversion fell outside every
// configured tier. Computed once at conversion time and stored as a
// snapshot (see referralConversionsTable.commissionOwedCents), not
// recomputed live, so later edits to an affiliate's tiers don't
// retroactively change amounts already earned.
async function computeAffiliateCommissionCents(referrerUserId: string, referredUserId: string): Promise<number | null> {
  const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, referrerUserId));
  if (!referrer?.isAffiliate) return null;
  if (referrer.affiliateProgramEndsAt && new Date() > new Date(referrer.affiliateProgramEndsAt)) return null;

  const tiers = referrer.affiliateCommissionTiers;
  if (!tiers || tiers.length === 0) return null;

  const [referred] = await db.select().from(usersTable).where(eq(usersTable.id, referredUserId));
  if (!referred?.createdAt) return null;

  const daysSinceSignup = (Date.now() - new Date(referred.createdAt).getTime()) / (24 * 60 * 60 * 1000);

  // Tiers are matched in ascending maxDaysSinceSignup order -- the first
  // tier whose window the conversion falls within wins. A conversion
  // past every tier's window earns nothing.
  const sorted = [...tiers].sort((a, b) => a.maxDaysSinceSignup - b.maxDaysSinceSignup);
  for (const tier of sorted) {
    if (daysSinceSignup <= tier.maxDaysSinceSignup) return tier.cents;
  }
  return null;
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
              const commissionOwedCents = await computeAffiliateCommissionCents(pending.referrerUserId, req.user.id);
              await db.update(referralConversionsTable)
                .set({ status: 'converted', convertedAt: new Date(), commissionOwedCents })
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

// Creates a Stripe Connect Express account for the current user if they
// don't have one yet, then returns a one-time onboarding link URL.
// Express accounts are the lightest-weight Connect option -- Stripe's
// own hosted UI handles bank details and identity verification, so
// there's no custom onboarding form to build or maintain here.
router.post('/affiliate/connect/onboard', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (!user?.isAffiliate) {
      res.status(403).json({ error: 'Not an affiliate' });
      return;
    }

    const stripe = await getUncachableStripeClient();
    let accountId = user.stripeConnectAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email ?? undefined,
        capabilities: { transfers: { requested: true } },
      });
      accountId = account.id;
      await db.update(usersTable).set({ stripeConnectAccountId: accountId }).where(eq(usersTable.id, user.id));
    }

    const origin = getOrigin(req);
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/affiliate?connect=refresh`,
      return_url: `${origin}/affiliate?connect=complete`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to start onboarding' });
  }
});

// The current user's own affiliate status: whether they're an
// affiliate at all, their Connect payout-readiness, and their personal
// commission totals (owed-unpaid and lifetime-paid).
router.get('/affiliate/status', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (!user?.isAffiliate) {
      res.json({ isAffiliate: false });
      return;
    }

    let payoutsEnabled = false;
    if (user.stripeConnectAccountId) {
      try {
        const stripe = await getUncachableStripeClient();
        const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
        payoutsEnabled = !!account.payouts_enabled;
      } catch { /* account may still be mid-onboarding */ }
    }

    const conversions = await db.select().from(referralConversionsTable)
      .where(eq(referralConversionsTable.referrerUserId, user.id));
    let owedUnpaidCents = 0;
    let paidCents = 0;
    for (const c of conversions) {
      const cents = c.commissionOwedCents ?? 0;
      if (!cents) continue;
      if (c.commissionPaidAt) paidCents += cents;
      else owedUnpaidCents += cents;
    }

    res.json({
      isAffiliate: true,
      connected: !!user.stripeConnectAccountId,
      payoutsEnabled,
      inviteCode: user.inviteCode,
      affiliateProgramEndsAt: user.affiliateProgramEndsAt,
      owedUnpaidCents,
      paidCents,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load affiliate status' });
  }
});

export default router;
