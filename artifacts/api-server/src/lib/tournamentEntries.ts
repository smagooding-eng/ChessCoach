// Pro tournaments: created by Pro members, open to Pro members, or to anyone
// who pays a one-off entry fee. The organizer earns a fixed amount for every
// entry from someone who wasn't already Pro (a new Pro subscription started
// from the tournament, or a paid entry fee). Earnings are recorded as
// affiliate adjustments, so they show on the organizer's Affiliate page and
// are paid out through the existing Stripe Connect payout.
import { db, usersTable, affiliateAdjustmentsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { getUncachableStripeClient } from "./stripeClient";
import { stripeService } from "./stripeService";
import { notifyUser } from "./notify";
import { logger } from "./logger";

export const ENTRY_FEE_CENTS = 500;
export const ORGANIZER_CREDIT_CENTS = 100;

function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }

export async function ensureTournamentEntryTables(): Promise<void> {
  await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS entry_fee_cents INTEGER`);
  await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS organizer_terms_at TIMESTAMPTZ`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS tournament_entries (
    tournament_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    method VARCHAR NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    stripe_session_id VARCHAR UNIQUE,
    payment_intent_id VARCHAR,
    organizer_credit_cents INTEGER NOT NULL DEFAULT 0,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tournament_id, user_id)
  )`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS tournament_pro_intents (
    tournament_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tournament_id, user_id)
  )`);
}

interface TInfo { id: string; name: string; created_by: string; entry_fee_cents: number | null; eligibility: string; status: string }

export async function loadTournamentInfo(tid: string): Promise<TInfo | null> {
  return rowsOf<TInfo>(await db.execute(sql`SELECT id, name, created_by, entry_fee_cents, eligibility, status FROM tournaments WHERE id = ${tid}`))[0] ?? null;
}

export async function hasPaidEntry(tid: string, userId: string): Promise<boolean> {
  const rows = rowsOf(await db.execute(sql`SELECT 1 FROM tournament_entries WHERE tournament_id = ${tid} AND user_id = ${userId} AND refunded_at IS NULL`));
  return rows.length > 0;
}

/** Credit the organizer for one entry (never for their own). */
async function creditOrganizer(t: TInfo, userId: string, username: string, method: "pro" | "fee"): Promise<number> {
  if (!t.created_by || t.created_by === userId) return 0;
  // ChessScout's own (admin-run) tournaments don't pay an organizer.
  const [org] = await db.select({ isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.id, t.created_by));
  if (!org || org.isAdmin) return 0;
  await db.update(usersTable).set({ isAffiliate: true }).where(eq(usersTable.id, t.created_by));
  await db.insert(affiliateAdjustmentsTable).values({
    affiliateUserId: t.created_by,
    cents: ORGANIZER_CREDIT_CENTS,
    reason: `Tournament entry (${method === "fee" ? "entry fee" : "new Pro member"}): ${username} in ${t.name}`.slice(0, 250),
  });
  void notifyUser(t.created_by, {
    title: `You earned $${(ORGANIZER_CREDIT_CENTS / 100).toFixed(2)} from ${t.name}`,
    body: `${username} joined ${method === "fee" ? "with an entry fee" : "as a new Pro member"}.`,
    url: "/affiliate", kind: "tournament",
  }).catch(() => {});
  return ORGANIZER_CREDIT_CENTS;
}

/** Remember that a non-Pro player chose "Go Pro" from this tournament. */
export async function recordProIntent(tid: string, userId: string): Promise<void> {
  await db.execute(sql`INSERT INTO tournament_pro_intents (tournament_id, user_id) VALUES (${tid}, ${userId}) ON CONFLICT DO NOTHING`);
}

/**
 * Called when a Pro member joins a Pro tournament. If they went Pro from
 * this tournament (an intent recorded while they weren't Pro), log the entry
 * and credit the organizer once.
 */
export async function creditProSignupIfAny(tid: string, userId: string, username: string): Promise<void> {
  const [intent] = rowsOf(await db.execute(sql`SELECT 1 FROM tournament_pro_intents WHERE tournament_id = ${tid} AND user_id = ${userId}`));
  if (!intent) return;
  const t = await loadTournamentInfo(tid);
  if (!t) return;
  const ins = rowsOf(await db.execute(sql`
    INSERT INTO tournament_entries (tournament_id, user_id, method) VALUES (${tid}, ${userId}, 'pro')
    ON CONFLICT DO NOTHING RETURNING user_id`));
  if (!ins.length) return;
  const credit = await creditOrganizer(t, userId, username, "pro");
  await db.execute(sql`UPDATE tournament_entries SET organizer_credit_cents = ${credit} WHERE tournament_id = ${tid} AND user_id = ${userId}`);
}

/** Stripe Checkout for a one-off entry fee. Returns the hosted page URL. */
export async function createEntryCheckout(opts: { tid: string; userId: string; email: string | null; frontendOrigin: string }): Promise<string> {
  const t = await loadTournamentInfo(opts.tid);
  if (!t || t.eligibility !== "pro") throw new Error("This tournament doesn't take entry fees");
  const amount = t.entry_fee_cents ?? ENTRY_FEE_CENTS;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, opts.userId));
  let customerId = user?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripeService.createCustomer(user?.email || `${opts.userId}@chess-coach.app`, opts.userId);
    await db.update(usersTable).set({ stripeCustomerId: customer.id }).where(eq(usersTable.id, opts.userId));
    customerId = customer.id;
  }
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: amount,
        product_data: { name: `Tournament entry: ${t.name}`.slice(0, 120), description: "One-time entry to a ChessScout.net Pro tournament" },
      },
    }],
    metadata: { kind: "tournament_entry", tournamentId: t.id, userId: opts.userId },
    payment_intent_data: { metadata: { kind: "tournament_entry", tournamentId: t.id, userId: opts.userId } },
    success_url: `${opts.frontendOrigin}/tournaments/${t.id}?entry={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.frontendOrigin}/tournaments/${t.id}`,
  });
  if (!session.url) throw new Error("Could not start checkout");
  return session.url;
}

/**
 * Records a paid entry from a completed Checkout Session (from the return
 * page or the webhook; safe to call twice). Joins the player and credits the
 * organizer. Returns the tournament id when it recorded or found the entry.
 */
export async function recordPaidEntry(sessionId: string, expectUserId?: string): Promise<{ tournamentId: string; userId: string } | null> {
  const stripe = await getUncachableStripeClient();
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  const md = (s.metadata ?? {}) as Record<string, string>;
  if (md.kind !== "tournament_entry" || !md.tournamentId || !md.userId) return null;
  if (expectUserId && md.userId !== expectUserId) throw new Error("This payment belongs to another account");
  if (s.payment_status !== "paid") return null;
  const t = await loadTournamentInfo(md.tournamentId);
  if (!t) return null;
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, md.userId));
  const username = u?.scoutUsername || u?.chesscomUsername || u?.lichessUsername || u?.firstName || u?.email?.split("@")[0] || "Player";
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  const ins = rowsOf(await db.execute(sql`
    INSERT INTO tournament_entries (tournament_id, user_id, method, amount_cents, stripe_session_id, payment_intent_id)
    VALUES (${t.id}, ${md.userId}, 'fee', ${s.amount_total ?? 0}, ${s.id}, ${pi})
    ON CONFLICT DO NOTHING RETURNING user_id`));
  await db.execute(sql`
    INSERT INTO tournament_players (tournament_id, user_id, username) VALUES (${t.id}, ${md.userId}, ${username})
    ON CONFLICT (tournament_id, user_id) DO UPDATE SET withdrawn = false`);
  if (ins.length) {
    const credit = await creditOrganizer(t, md.userId, username, "fee");
    await db.execute(sql`UPDATE tournament_entries SET organizer_credit_cents = ${credit} WHERE tournament_id = ${t.id} AND user_id = ${md.userId}`);
    logger.info({ tid: t.id, userId: md.userId, amount: s.amount_total }, "[tournament] paid entry recorded");
  }
  return { tournamentId: t.id, userId: md.userId };
}

/** Tournament cancelled: refund entry fees and take back the organizer's credit for them. */
export async function refundTournamentEntries(tid: string): Promise<void> {
  try {
    const t = await loadTournamentInfo(tid);
    const entries = rowsOf<{ user_id: string; payment_intent_id: string | null; organizer_credit_cents: number }>(await db.execute(sql`
      SELECT user_id, payment_intent_id, organizer_credit_cents FROM tournament_entries
      WHERE tournament_id = ${tid} AND method = 'fee' AND refunded_at IS NULL`));
    if (!entries.length) return;
    const stripe = await getUncachableStripeClient();
    for (const e of entries) {
      try {
        if (e.payment_intent_id) await stripe.refunds.create({ payment_intent: e.payment_intent_id });
        await db.execute(sql`UPDATE tournament_entries SET refunded_at = now() WHERE tournament_id = ${tid} AND user_id = ${e.user_id}`);
        if (t && e.organizer_credit_cents > 0) {
          await db.insert(affiliateAdjustmentsTable).values({
            affiliateUserId: t.created_by, cents: -e.organizer_credit_cents, reason: `Refunded entry (tournament cancelled): ${t.name}`.slice(0, 250),
          });
        }
        void notifyUser(e.user_id, { title: "Entry fee refunded", body: `${t?.name ?? "The tournament"} was cancelled, so your entry fee is on its way back.`, kind: "tournament" }).catch(() => {});
      } catch (err) {
        logger.error({ err, tid, userId: e.user_id }, "[tournament] entry refund failed");
      }
    }
  } catch (err) {
    logger.error({ err, tid }, "[tournament] refunds failed");
  }
}

/** Organizer's view: entries and what they earned from this tournament. */
export async function organizerSummary(tid: string): Promise<{ proEntries: number; feeEntries: number; earnedCents: number }> {
  const [r] = rowsOf<{ pro: string; fee: string; earned: string }>(await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE method = 'pro') AS pro,
           COUNT(*) FILTER (WHERE method = 'fee' AND refunded_at IS NULL) AS fee,
           COALESCE(SUM(organizer_credit_cents) FILTER (WHERE refunded_at IS NULL), 0) AS earned
    FROM tournament_entries WHERE tournament_id = ${tid}`));
  return { proEntries: Number(r?.pro ?? 0), feeEntries: Number(r?.fee ?? 0), earnedCents: Number(r?.earned ?? 0) };
}
