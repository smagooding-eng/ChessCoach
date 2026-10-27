// Keeps users.stripe_subscription_id in step with Stripe. Pro access itself is
// checked against the synced stripe.subscriptions table (see accessControl),
// but checkout never wrote the subscription onto the user, so everything that
// reads this column (emails, the funnel, the traffic export) treated paying
// members as free. Set while a subscription is active or trialing, cleared
// when it isn't.
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function syncUserSubscriptions(): Promise<{ set: number; cleared: number }> {
  const ok = await db.execute(sql`SELECT to_regclass('stripe.subscriptions') IS NOT NULL AS ok`)
    .then((r) => !!((Array.isArray(r) ? r : (r as { rows?: { ok: boolean }[] }).rows ?? [])[0] as { ok?: boolean } | undefined)?.ok)
    .catch(() => false);
  if (!ok) return { set: 0, cleared: 0 };
  const set = await db.execute(sql`
    UPDATE users u SET stripe_subscription_id = sub.id
    FROM (SELECT DISTINCT ON (customer) customer, id FROM stripe.subscriptions
          WHERE status IN ('active','trialing') ORDER BY customer, created DESC) sub
    WHERE u.stripe_customer_id = sub.customer AND u.stripe_subscription_id IS DISTINCT FROM sub.id`);
  const cleared = await db.execute(sql`
    UPDATE users u SET stripe_subscription_id = NULL
    WHERE u.stripe_subscription_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM stripe.subscriptions s WHERE s.customer = u.stripe_customer_id AND s.status IN ('active','trialing'))`);
  const n = (r: unknown) => Number((r as { rowCount?: number })?.rowCount ?? 0);
  return { set: n(set), cleared: n(cleared) };
}

export function startSubscriptionSync(): void {
  const run = () => syncUserSubscriptions()
    .then((r) => { if (r.set || r.cleared) logger.info(r, "[subscriptions] synced users with Stripe"); })
    .catch((err) => logger.warn({ err }, "[subscriptions] sync failed"));
  setTimeout(run, 30_000).unref?.();
  setInterval(run, 30 * 60_000).unref?.();
}
