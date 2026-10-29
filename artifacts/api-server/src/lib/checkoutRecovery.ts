// Unfinished checkout follow-ups.
//
// The in-page checkout creates an "incomplete" Stripe subscription as soon as
// someone picks a plan; it only becomes real when they pay. For people who
// opened checkout and never paid:
//   checkout_recovery     ~2h after the abandoned checkout (within 7 days):
//                         "finish going Pro", linking straight back to the
//                         same plan's payment form.
//   checkout_trial_offer  48h after that email, if they still haven't paid:
//                         3 days of Pro free, card on file, billed after.
// Each email goes to a person at most once, ever. Anyone who has ever paid
// (active, trialing, past due or canceled) is never sent either, and never
// offered the trial. Opted-out and excluded (owner) accounts are skipped.
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { emailLayout, emailP, emailFeatures, escapeHtml, EMAIL } from "./emailTheme";
import { unsubscribeHeaders, unsubscribeUrl } from "./emailPrefs";
import { trackHtml } from "./emailTracking";
import { sendEmail } from "./email";
import { logger } from "./logger";

export const TRIAL_DAYS = 3;
/** How long the trial offer stays open after its email. */
const TRIAL_OFFER_VALID_DAYS = 14;
const BATCH = 40;
const GAP_MS = 600;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

async function hasStripeTables(): Promise<boolean> {
  try {
    const r = rowsOf<{ ok: boolean }>(await db.execute(sql`SELECT to_regclass('stripe.subscriptions') IS NOT NULL AS ok`));
    return !!r[0]?.ok;
  } catch { return false; }
}

// Ever paid = any subscription that got past "incomplete".
const EVER_PAID = sql.raw(`EXISTS (SELECT 1 FROM stripe.subscriptions p WHERE p.customer = u.stripe_customer_id AND p.status NOT IN ('incomplete','incomplete_expired'))`);

function firstName(n: string | null): string | null {
  const f = (n || '').trim().split(/\s+/)[0];
  return f || null;
}

async function send(user: { id: string; email: string }, subject: string, html: string, template: string) {
  const tracked = await trackHtml(html, { kind: 'drip', template, email: user.email, userId: user.id, subject });
  await sendEmail({ to: user.email, subject, html: tracked, headers: unsubscribeHeaders(user.id) });
  await db.execute(sql`INSERT INTO email_drip_log (user_id, drip_type) VALUES (${user.id}, ${template}) ON CONFLICT DO NOTHING`);
}

const PRO_FEATURES = [
  { glyph: '&#9819;', title: 'Unlimited game analysis', text: 'Every game reviewed move by move, with the key moments and what to play instead.' },
  { glyph: '&#9820;', title: 'Full opponent scouting', text: 'Unlimited reports on any Chess.com or Lichess player.' },
  { glyph: '&#9822;', title: 'Courses from your own games', text: 'Lessons aimed at the mistakes you actually make.' },
  { glyph: '&#9821;', title: 'Unlimited puzzles', text: 'No daily cap.' },
];

export function finishCheckoutHtml(name: string | null, link: string, unsubUrl: string): string {
  const n = name ? escapeHtml(name) : null;
  return emailLayout({
    preheader: 'Your ChessScout.net Pro checkout is still open. Pick up where you left off.',
    badge: 'Checkout not finished',
    title: n ? `Still want Pro, ${n}?` : 'Still want Pro?',
    subtitle: "You started upgrading to ChessScout.net Pro but didn't finish, so you haven't been charged.",
    body: [
      emailP('Pro gets you:', { mb: 6 }),
      emailFeatures(PRO_FEATURES),
      emailP('The button below takes you straight back to checkout. Cancel anytime.', { center: true, mb: 22 }),
    ].join(''),
    cta: { label: 'Finish going Pro &rarr;', href: link },
    footerNote: "You're getting this because you started a Pro checkout on ChessScout.net. We only send this once.",
    unsubscribeUrl: unsubUrl,
  });
}

export function trialOfferHtml(name: string | null, unsubUrl: string): string {
  const n = name ? escapeHtml(name) : null;
  return emailLayout({
    preheader: `Try ChessScout.net Pro free for ${TRIAL_DAYS} days.`,
    badge: `${TRIAL_DAYS} days free`,
    title: n ? `${n}, try Pro free for ${TRIAL_DAYS} days` : `Try Pro free for ${TRIAL_DAYS} days`,
    subtitle: 'Get every Pro feature now and see if it helps your chess before you pay anything.',
    body: [
      emailFeatures(PRO_FEATURES),
      emailP(`Add a card to start. You won't be charged during the ${TRIAL_DAYS} days. After that, Pro continues at your plan's normal price and your card is billed automatically, unless you cancel before the trial ends (one tap in <strong style="color:${EMAIL.text};">Profile &rsaquo; Manage subscription</strong>).`, { center: true, mb: 22 }),
    ].join(''),
    cta: { label: `Start my ${TRIAL_DAYS} free days &rarr;`, href: `${EMAIL.site}/subscription?offer=trial` },
    footerNote: 'This offer is open for two weeks and is only for your account. We only send this once.',
    unsubscribeUrl: unsubUrl,
  });
}

async function sendFinishCheckoutEmails() {
  const rows = rowsOf<{ id: string; email: string; first_name: string | null; price_id: string | null }>(await db.execute(sql`
    SELECT DISTINCT ON (u.id) u.id, u.email, u.first_name,
      COALESCE((s.items::jsonb)->'data'->0->'price'->>'id', (s.items::jsonb)->'data'->0->>'price') AS price_id
    FROM users u
    JOIN stripe.subscriptions s ON s.customer = u.stripe_customer_id
    WHERE s.status IN ('incomplete','incomplete_expired')
      AND to_timestamp(s.created) <= now() - interval '2 hours'
      AND to_timestamp(s.created) >= now() - interval '7 days'
      AND s.livemode IS NOT FALSE
      AND u.email IS NOT NULL AND u.email_opt_out = false AND u.is_premium_override = false
      AND u.id NOT IN (SELECT id FROM analytics_excluded_users)
      AND NOT ${EVER_PAID}
      AND NOT EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'checkout_recovery')
    ORDER BY u.id, s.created DESC
    LIMIT ${BATCH}`));
  for (const u of rows) {
    try {
      const link = `${EMAIL.site}/subscription${u.price_id && /^price_\w+$/.test(u.price_id) ? `?price=${u.price_id}` : ''}`;
      const name = firstName(u.first_name);
      await send(u, name ? `${name}, your Pro checkout is still open` : 'Your Pro checkout is still open',
        finishCheckoutHtml(name, link, unsubscribeUrl(u.id)), 'checkout_recovery');
      logger.info({ userId: u.id }, '[checkout-recovery] finish-checkout email sent');
    } catch (err) {
      logger.error({ userId: u.id, err: err instanceof Error ? err.message : String(err) }, '[checkout-recovery] finish-checkout email failed');
    }
    await pause(GAP_MS);
  }
}

async function sendTrialOfferEmails() {
  const rows = rowsOf<{ id: string; email: string; first_name: string | null }>(await db.execute(sql`
    SELECT u.id, u.email, u.first_name
    FROM users u
    JOIN email_drip_log d ON d.user_id = u.id AND d.drip_type = 'checkout_recovery'
    WHERE d.sent_at <= now() - interval '48 hours'
      AND d.sent_at >= now() - interval '10 days'
      AND u.email IS NOT NULL AND u.email_opt_out = false AND u.is_premium_override = false
      AND u.id NOT IN (SELECT id FROM analytics_excluded_users)
      AND NOT ${EVER_PAID}
      AND NOT EXISTS (SELECT 1 FROM email_drip_log t WHERE t.user_id = u.id AND t.drip_type = 'checkout_trial_offer')
    LIMIT ${BATCH}`));
  for (const u of rows) {
    try {
      const name = firstName(u.first_name);
      await send(u, name ? `${name}, ${TRIAL_DAYS} days of Pro on us` : `${TRIAL_DAYS} days of Pro on us`,
        trialOfferHtml(name, unsubscribeUrl(u.id)), 'checkout_trial_offer');
      logger.info({ userId: u.id }, '[checkout-recovery] trial offer sent');
    } catch (err) {
      logger.error({ userId: u.id, err: err instanceof Error ? err.message : String(err) }, '[checkout-recovery] trial offer failed');
    }
    await pause(GAP_MS);
  }
}

export async function runCheckoutRecovery(): Promise<void> {
  if (!(await hasStripeTables())) return;
  try { await sendFinishCheckoutEmails(); } catch (err) { logger.error({ err }, '[checkout-recovery] finish-checkout check failed'); }
  try { await sendTrialOfferEmails(); } catch (err) { logger.error({ err }, '[checkout-recovery] trial offer check failed'); }
}

/** Was this person sent the trial offer (still open) and have they never paid? */
export async function trialOfferEligible(userId: string): Promise<boolean> {
  if (!(await hasStripeTables())) return false;
  const r = rowsOf<{ ok: boolean }>(await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM users u
      JOIN email_drip_log d ON d.user_id = u.id AND d.drip_type = 'checkout_trial_offer'
      WHERE u.id = ${userId}
        AND d.sent_at >= now() - make_interval(days => ${TRIAL_OFFER_VALID_DAYS})
        AND u.is_premium_override = false
        AND (u.stripe_customer_id IS NULL OR NOT ${EVER_PAID})
    ) AS ok`));
  return !!r[0]?.ok;
}
