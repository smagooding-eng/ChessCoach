// The 3-day Pro trial, end to end: what members did with the promo (shown / tapped
// Start / closed), who opened trial checkout and from where, and what Stripe says
// happened after (in trial, cancelling, paid, ended). Shann's own accounts are left out.
import { Router, type IRouter, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { requireAdmin } from '../middlewares/authMiddleware';
import { EXCLUDED_EMAILS } from '../lib/analyticsExclusions';
import { getUncachableStripeClient } from '../lib/stripeClient';

const router: IRouter = Router();
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  return (ready ??= (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS trial_events (
      id SERIAL PRIMARY KEY, user_id VARCHAR NOT NULL, event VARCHAR(24) NOT NULL,
      source VARCHAR(16), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trial_events_at ON trial_events (created_at)`);
  })().catch((e) => { ready = null; throw e; }));
}

const SOURCES = new Set(['promo', 'subscription', 'pricing', 'email']);
export const trialSource = (s: unknown): string => (typeof s === 'string' && SOURCES.has(s) ? s : 'subscription');

/** One step of the trial funnel for a member (never throws). */
export async function logTrialEvent(userId: string, event: string, source?: string): Promise<void> {
  try {
    await ensureTable();
    await db.execute(sql`INSERT INTO trial_events (user_id, event, source) VALUES (${userId}, ${event}, ${source ?? null})`);
  } catch { /* tracking never gets in the way */ }
}

// From the promo itself
const PROMO_EVENTS = new Set(['shown', 'start', 'dismiss', 'checkout_failed']);
router.post('/trial/track', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const event = String(req.body?.event ?? '');
  if (!PROMO_EVENTS.has(event)) { res.status(400).json({ error: 'Unknown event' }); return; }
  await logTrialEvent(req.user.id, event, 'promo');
  res.json({ ok: true });
});

type TrialRow = { email: string | null; status: string; startedAt: string; trialEnd: string | null; outcome: string };

router.get('/admin/trial-stats', requireAdmin, async (req: Request, res: Response) => {
  const day = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const start = day(req.query.startDate) ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const end = day(req.query.endDate) ?? new Date().toISOString().slice(0, 10);
  const since = new Date(`${start}T00:00:00Z`), until = new Date(new Date(`${end}T00:00:00Z`).getTime() + 864e5);
  try {
    await ensureTable();
    const excluded = EXCLUDED_EMAILS.length ? EXCLUDED_EMAILS : ['-'];
    const ev = rowsOf<{ event: string; source: string | null; people: number }>(await db.execute(sql`
      SELECT e.event, e.source, COUNT(DISTINCT e.user_id)::int AS people
      FROM trial_events e JOIN users u ON u.id = e.user_id
      WHERE e.created_at >= ${since.toISOString()} AND e.created_at < ${until.toISOString()}
        AND lower(u.email) NOT IN (${sql.join(excluded.map((x) => sql`${x}`), sql`, `)})
      GROUP BY e.event, e.source`));
    // How long members looked at the promo before closing it (from their latest "shown").
    // The offer itself showed ~3.4s in before 18 Nov 2026, and ~0.6s in since.
    const [close] = rowsOf<{ median: number | null; quick: number }>(await db.execute(sql`
      WITH d AS (
        SELECT EXTRACT(EPOCH FROM e.created_at - (
          SELECT max(s.created_at) FROM trial_events s
          WHERE s.user_id = e.user_id AND s.event = 'shown' AND s.created_at <= e.created_at)) AS secs
        FROM trial_events e JOIN users u ON u.id = e.user_id
        WHERE e.event = 'dismiss' AND e.created_at >= ${since.toISOString()} AND e.created_at < ${until.toISOString()}
          AND lower(u.email) NOT IN (${sql.join(excluded.map((x) => sql`${x}`), sql`, `)}))
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY secs)::float AS median,
             COUNT(*) FILTER (WHERE secs < 4)::int AS quick
      FROM d WHERE secs IS NOT NULL`));
    const count = (event: string, source?: string) => ev.filter((r) => r.event === event && (!source || r.source === source)).reduce((n, r) => n + r.people, 0);
    // The promo as one path per person, so the parts add up: everyone who saw it either tapped
    // Start, closed it without tapping, or did neither (left the page with it open). A member
    // who saw it on several days is counted once.
    const [path] = rowsOf<{ saw: number; tapped: number; closed_only: number; checkout_after: number; checkout_any: number; failed: number }>(await db.execute(sql`
      WITH e AS (
        SELECT e.user_id, e.event, e.source FROM trial_events e JOIN users u ON u.id = e.user_id
        WHERE e.created_at >= ${since.toISOString()} AND e.created_at < ${until.toISOString()}
          AND lower(u.email) NOT IN (${sql.join(excluded.map((x) => sql`${x}`), sql`, `)})),
      p AS (
        SELECT user_id,
          bool_or(event = 'shown') AS saw, bool_or(event = 'start') AS tapped, bool_or(event = 'dismiss') AS closed,
          bool_or(event = 'checkout') AS checkout, bool_or(event = 'checkout_failed') AS failed
        FROM e GROUP BY user_id)
      SELECT count(*) FILTER (WHERE saw)::int AS saw,
             count(*) FILTER (WHERE saw AND tapped)::int AS tapped,
             count(*) FILTER (WHERE saw AND closed AND NOT tapped)::int AS closed_only,
             count(*) FILTER (WHERE saw AND tapped AND checkout)::int AS checkout_after,
             count(*) FILTER (WHERE checkout)::int AS checkout_any,
             count(*) FILTER (WHERE failed)::int AS failed
      FROM p`));

    // Who each Stripe customer is (and which are Shann's own)
    const cust = rowsOf<{ cid: string; email: string | null }>(await db.execute(sql`
      SELECT stripe_customer_id AS cid, email FROM users WHERE stripe_customer_id IS NOT NULL`));
    const emailOf = new Map(cust.map((c) => [c.cid, c.email]));
    const mine = new Set(cust.filter((c) => c.email && EXCLUDED_EMAILS.includes(c.email.toLowerCase())).map((c) => c.cid));

    // Every trial is tagged on its subscription (free_trial; the older email-only offer too)
    const trials: TrialRow[] = [];
    let stripeError: string | null = null;
    try {
      const stripe = await getUncachableStripeClient();
      let page: string | undefined;
      for (let i = 0; i < 10; i++) {
        const r = await stripe.subscriptions.search({ query: "metadata['offer']:'free_trial' OR metadata['offer']:'checkout_recovery_trial'", limit: 100, ...(page ? { page } : {}) });
        for (const s of r.data) {
          const cid = typeof s.customer === 'string' ? s.customer : s.customer.id;
          if (mine.has(cid)) continue;
          const created = new Date(s.created * 1000);
          if (created < since || created >= until) continue;
          const outcome = s.status === 'trialing' ? (s.cancel_at_period_end ? 'cancelling' : 'in_trial')
            : s.status === 'active' ? (s.cancel_at_period_end ? 'paid_cancelling' : 'paid')
            : s.status === 'past_due' || s.status === 'unpaid' ? 'payment_failed'
            : s.status === 'incomplete' || s.status === 'incomplete_expired' ? 'not_started'
            : 'ended';
          trials.push({ email: emailOf.get(cid) ?? null, status: s.status, startedAt: created.toISOString(), trialEnd: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null, outcome });
        }
        if (!r.has_more || !r.next_page) break;
        page = r.next_page;
      }
    } catch (e) { stripeError = e instanceof Error ? e.message : 'Stripe unavailable'; }

    const by = (o: string) => trials.filter((t) => t.outcome === o).length;
    const started = trials.filter((t) => t.outcome !== 'not_started').length;
    res.json({
      startDate: start, endDate: end,
      path: path ? { saw: path.saw, tapped: path.tapped, closedOnly: path.closed_only, neither: Math.max(0, path.saw - path.tapped - path.closed_only),
        tappedThenCheckout: path.checkout_after, checkoutPeople: path.checkout_any, checkoutFailed: path.failed } : null,
      promo: { shown: count('shown'), start: count('start'), dismiss: count('dismiss'),
        closeMedianSecs: close?.median != null ? Math.round(close.median * 10) / 10 : null, closedUnder4s: close?.quick ?? 0 },
      checkout: { total: count('checkout'), promo: count('checkout', 'promo'), subscription: count('checkout', 'subscription'), pricing: count('checkout', 'pricing'), email: count('checkout', 'email') },
      trials: { started, inTrial: by('in_trial'), cancelling: by('cancelling'), paid: by('paid') + by('paid_cancelling'), paidCancelling: by('paid_cancelling'), paymentFailed: by('payment_failed'), ended: by('ended') },
      recent: trials.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 25),
      stripeError,
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not load trial stats', details: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
