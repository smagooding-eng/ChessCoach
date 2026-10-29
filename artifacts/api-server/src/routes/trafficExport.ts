import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { parseDateRangeParams } from "./admin";
import { logger } from "../lib/logger";
import { exclusionSummary } from "../lib/analyticsExclusions";

// Admin: one JSON file with the traffic and funnel numbers for a date range,
// for sharing and analysis. Aggregates only -- no IP addresses, emails or
// user ids leave the server. Days are bucketed in the admin's time zone
// (tz = getTimezoneOffset() in minutes, same as the other admin panels).
//   GET /admin/traffic-export?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&tz=240
const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}
function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }
const num = (v: unknown) => Number(v ?? 0);

// Collapse ids in paths (/games/123 -> /games/:id, /share/<long token> -> /share/:token).
const PATH = sql`regexp_replace(regexp_replace(path, '/[0-9]+(?=/|$)', '/:id', 'g'), '/[A-Za-z0-9_-]{20,}(?=/|$)', '/:token', 'g')`;

router.get("/admin/traffic-export", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { since, until } = parseDateRangeParams(req, 30);
    const tzRaw = parseInt(String(req.query.tz ?? "0"), 10);
    const tz = Number.isFinite(tzRaw) ? Math.max(-840, Math.min(840, tzRaw)) : 0;
    const DAY = (col: string) => sql.raw(`to_char((${col} - interval '${tz} minutes'), 'YYYY-MM-DD')`);
    const HOUR = (col: string) => sql.raw(`extract(hour from (${col} - interval '${tz} minutes'))::int`);

    // Paying = an active/trialing subscription in the synced stripe.subscriptions table for the
    // user's Stripe customer (the same check Pro access uses). users.stripe_subscription_id was
    // never filled in by checkout, so counting that column alone always showed 0 subscribers.
    const hasStripe = await db.execute(sql`SELECT to_regclass('stripe.subscriptions') IS NOT NULL AS ok`).then((r) => !!(rowsOf<{ ok: boolean }>(r)[0]?.ok)).catch(() => false);
    const PAYING = (alias: string) => hasStripe
      ? sql.raw(`EXISTS (SELECT 1 FROM stripe.subscriptions s WHERE s.customer = ${alias}.stripe_customer_id AND s.status IN ('active','trialing'))`)
      : sql.raw(`(${alias}.stripe_subscription_id IS NOT NULL)`);
    const newSubsQuery = hasStripe
      ? db.execute(sql`
          SELECT ${DAY("to_timestamp(s.created)")} AS day,
            -- The in-page checkout creates an "incomplete" subscription as soon as
            -- the payment form opens; it only becomes real once a card is paid.
            -- So unpaid ones are checkouts opened, not subscriptions.
            COUNT(*) FILTER (WHERE s.status NOT IN ('incomplete','incomplete_expired')) AS new_subscriptions,
            COUNT(*) FILTER (WHERE s.status IN ('active','trialing')) AS still_active,
            COUNT(*) AS checkouts_opened,
            COUNT(*) FILTER (WHERE s.status IN ('incomplete','incomplete_expired')) AS unpaid_checkouts
          FROM stripe.subscriptions s JOIN users u ON u.stripe_customer_id = s.customer
          WHERE to_timestamp(s.created) >= ${since} AND to_timestamp(s.created) <= ${until}
            AND u.id NOT IN (SELECT id FROM analytics_excluded_users) AND s.livemode IS NOT FALSE
          GROUP BY 1 ORDER BY 1`).catch(() => [])
      : Promise.resolve([]);

    const [daily, signupsDaily, funnelDaily, funnelTotals, paths, entries, signupEntries, hours, convDaily, totals, exits, sources, activation, newSubs] = await Promise.all([
      db.execute(sql`
        SELECT ${DAY("created_at")} AS day, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors,
          COUNT(DISTINCT ip_address) AS unique_ips, COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS signed_in_views,
          COUNT(DISTINCT user_id) AS active_users
        FROM pv_people WHERE created_at >= ${since} AND created_at <= ${until}
        GROUP BY 1 ORDER BY 1`),
      db.execute(sql`
        SELECT ${DAY("created_at")} AS day, COUNT(*) AS signups,
          COUNT(*) FILTER (WHERE referred_by_user_id IS NOT NULL) AS referred_signups,
          COUNT(*) FILTER (WHERE ${PAYING("users")}) AS now_subscribed
        FROM users WHERE created_at >= ${since} AND created_at <= ${until} AND id NOT IN (SELECT id FROM analytics_excluded_users)
        GROUP BY 1 ORDER BY 1`),
      db.execute(sql`
        SELECT ${DAY("created_at")} AS day, platform, event_type, COUNT(DISTINCT visitor_id) AS visitors
        FROM lfe_people WHERE created_at >= ${since} AND created_at <= ${until}
        GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`),
      db.execute(sql`
        SELECT platform, event_type, COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS events,
          ROUND(AVG(elapsed_ms)) AS avg_elapsed_ms
        FROM lfe_people WHERE created_at >= ${since} AND created_at <= ${until}
        GROUP BY 1, 2 ORDER BY 1, 3 DESC`),
      db.execute(sql`
        SELECT ${PATH} AS path, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors,
          COUNT(DISTINCT user_id) AS signed_in_users
        FROM pv_people WHERE created_at >= ${since} AND created_at <= ${until}
        GROUP BY 1 ORDER BY views DESC LIMIT 80`),
      // First page each visitor saw in the range, and how many of them were ever signed in.
      db.execute(sql`
        WITH firsts AS (
          SELECT DISTINCT ON (visitor_id) visitor_id, ${PATH} AS path
          FROM pv_people WHERE visitor_id IS NOT NULL AND created_at >= ${since} AND created_at <= ${until}
          ORDER BY visitor_id, created_at
        ), signed AS (
          SELECT DISTINCT visitor_id FROM pv_people WHERE visitor_id IS NOT NULL AND user_id IS NOT NULL
        )
        SELECT f.path, COUNT(*) AS visitors, COUNT(s.visitor_id) AS became_or_were_signed_in
        FROM firsts f LEFT JOIN signed s ON s.visitor_id = f.visitor_id
        GROUP BY 1 ORDER BY visitors DESC LIMIT 50`),
      // For accounts created in the range: the first page their browser visited.
      db.execute(sql`
        WITH u AS (SELECT id FROM users WHERE created_at >= ${since} AND created_at <= ${until} AND id NOT IN (SELECT id FROM analytics_excluded_users)),
        v AS (SELECT DISTINCT pv.user_id, pv.visitor_id FROM pv_people pv JOIN u ON pv.user_id = u.id WHERE pv.visitor_id IS NOT NULL),
        firsts AS (
          SELECT DISTINCT ON (v.user_id) v.user_id, regexp_replace(regexp_replace(p.path, '/[0-9]+(?=/|$)', '/:id', 'g'), '/[A-Za-z0-9_-]{20,}(?=/|$)', '/:token', 'g') AS path
          FROM v JOIN pv_people p ON p.visitor_id = v.visitor_id ORDER BY v.user_id, p.created_at
        )
        SELECT path, COUNT(*) AS signups FROM firsts GROUP BY 1 ORDER BY signups DESC LIMIT 40`),
      db.execute(sql`
        SELECT ${HOUR("created_at")} AS hour, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
        FROM pv_people WHERE created_at >= ${since} AND created_at <= ${until}
        GROUP BY 1 ORDER BY 1`),
      db.execute(sql`
        SELECT ${DAY("converted_at")} AS day, COUNT(*) AS referral_conversions
        FROM referral_conversions WHERE converted_at >= ${since} AND converted_at <= ${until}
        GROUP BY 1 ORDER BY 1`),
      db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM users WHERE id NOT IN (SELECT id FROM analytics_excluded_users)) AS total_users,
          (SELECT COUNT(*) FROM users WHERE ${PAYING("users")} AND id NOT IN (SELECT id FROM analytics_excluded_users)) AS subscribers_now,
          (SELECT COUNT(*) FROM users WHERE is_premium_override AND id NOT IN (SELECT id FROM analytics_excluded_users)) AS comped_pro_now,
          (SELECT COUNT(*) FROM users WHERE created_at >= ${since} AND created_at <= ${until} AND id NOT IN (SELECT id FROM analytics_excluded_users)) AS signups_in_range,
          (SELECT COUNT(*) FROM pv_people WHERE created_at >= ${since} AND created_at <= ${until}) AS views_in_range,
          (SELECT COUNT(DISTINCT visitor_id) FROM pv_people WHERE created_at >= ${since} AND created_at <= ${until}) AS visitors_in_range,
          (SELECT COUNT(DISTINCT ip_address) FROM pv_people WHERE created_at >= ${since} AND created_at <= ${until}) AS unique_ips_in_range`),
      // Last page of each visitor's session-day (where people leave).
      db.execute(sql`
        WITH lasts AS (
          SELECT DISTINCT ON (visitor_id, ${DAY("created_at")}) ${PATH} AS path
          FROM pv_people WHERE visitor_id IS NOT NULL AND created_at >= ${since} AND created_at <= ${until}
          ORDER BY visitor_id, ${DAY("created_at")}, created_at DESC
        )
        SELECT path, COUNT(*) AS exits FROM lasts GROUP BY 1 ORDER BY exits DESC LIMIT 40`),
      // Where visitors came from: utm_source on our links, else the referring
      // site, else "direct / untagged". Recorded from Oct 2026 on.
      db.execute(sql`
        WITH src AS (
          SELECT DISTINCT ON (visitor_id) visitor_id,
            COALESCE(utm_source, referrer_host, 'direct / untagged') AS source, utm_campaign AS campaign
          FROM pv_people WHERE visitor_id IS NOT NULL AND created_at >= ${since} AND created_at <= ${until}
          ORDER BY visitor_id, (utm_source IS NULL AND referrer_host IS NULL), created_at
        ), signed AS (SELECT DISTINCT visitor_id FROM pv_people WHERE visitor_id IS NOT NULL AND user_id IS NOT NULL),
        newu AS (
          SELECT DISTINCT pv.visitor_id FROM pv_people pv JOIN users u ON u.id = pv.user_id
          WHERE u.created_at >= ${since} AND u.created_at <= ${until} AND pv.visitor_id IS NOT NULL
        )
        SELECT s.source, s.campaign, COUNT(*) AS visitors, COUNT(g.visitor_id) AS ever_signed_in, COUNT(n.visitor_id) AS new_member_browsers
        FROM src s LEFT JOIN signed g ON g.visitor_id = s.visitor_id LEFT JOIN newu n ON n.visitor_id = s.visitor_id
        GROUP BY 1, 2 ORDER BY visitors DESC LIMIT 60`),
      // New members who got going: linked Chess.com/Lichess or have games.
      db.execute(sql`
        WITH u AS (SELECT id, chesscom_username, lichess_username FROM users
          WHERE created_at >= ${since} AND created_at <= ${until} AND id NOT IN (SELECT id FROM analytics_excluded_users))
        SELECT COUNT(*) AS signups,
          COUNT(*) FILTER (WHERE COALESCE(chesscom_username, '') <> '' OR COALESCE(lichess_username, '') <> '') AS linked_chess_account,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM games g WHERE g.user_id = u.id)) AS have_games,
          COUNT(*) FILTER (WHERE COALESCE(chesscom_username, '') <> '' OR COALESCE(lichess_username, '') <> ''
            OR EXISTS (SELECT 1 FROM games g WHERE g.user_id = u.id)) AS activated
        FROM u`),
      newSubsQuery,
    ]);
    const act = rowsOf<Record<string, unknown>>(activation)[0] ?? {};

    const t = rowsOf<Record<string, unknown>>(totals)[0] ?? {};
    res.json({
      about: "ChessScout.net traffic and funnel export. Aggregates only (no IPs, emails or user ids). Days are in the admin's local time zone. The owner's own accounts (and their browsers) and suspected bots are left out.",
      excluded: await exclusionSummary(),
      generatedAt: new Date().toISOString(),
      range: { since: since.toISOString(), until: until.toISOString(), tzOffsetMinutes: tz },
      totals: {
        totalUsers: num(t.total_users), subscribersNow: num(t.subscribers_now), compedProNow: num(t.comped_pro_now),
        newSubscriptionsInRange: rowsOf<Record<string, unknown>>(newSubs).reduce((n, r) => n + num(r.new_subscriptions), 0),
        checkoutsOpenedInRange: rowsOf<Record<string, unknown>>(newSubs).reduce((n, r) => n + num(r.checkouts_opened), 0),
        unpaidCheckoutsInRange: rowsOf<Record<string, unknown>>(newSubs).reduce((n, r) => n + num(r.unpaid_checkouts), 0),
        signupsInRange: num(t.signups_in_range), pageViewsInRange: num(t.views_in_range),
        visitorsInRange: num(t.visitors_in_range), uniqueIpsInRange: num(t.unique_ips_in_range),
      },
      dailyTraffic: rowsOf<Record<string, unknown>>(daily).map((r) => ({
        day: r.day, views: num(r.views), visitors: num(r.visitors), uniqueIps: num(r.unique_ips),
        signedInViews: num(r.signed_in_views), activeUsers: num(r.active_users),
      })),
      dailySignups: rowsOf<Record<string, unknown>>(signupsDaily).map((r) => ({
        day: r.day, signups: num(r.signups), referredSignups: num(r.referred_signups), nowSubscribed: num(r.now_subscribed),
      })),
      // New paid subscriptions started in the range (from Stripe), and whether each is still active.
      dailyNewSubscriptions: rowsOf<Record<string, unknown>>(newSubs).map((r) => ({ day: r.day, newSubscriptions: num(r.new_subscriptions), stillActive: num(r.still_active), checkoutsOpened: num(r.checkouts_opened), unpaidCheckouts: num(r.unpaid_checkouts) })),
      dailyReferralConversions: rowsOf<Record<string, unknown>>(convDaily).map((r) => ({ day: r.day, conversions: num(r.referral_conversions) })),
      landingFunnelTotals: rowsOf<Record<string, unknown>>(funnelTotals).map((r) => ({
        platform: r.platform, event: r.event_type, visitors: num(r.visitors), events: num(r.events),
        avgElapsedMs: r.avg_elapsed_ms == null ? null : num(r.avg_elapsed_ms),
      })),
      landingFunnelDaily: rowsOf<Record<string, unknown>>(funnelDaily).map((r) => ({ day: r.day, platform: r.platform, event: r.event_type, visitors: num(r.visitors) })),
      topPages: rowsOf<Record<string, unknown>>(paths).map((r) => ({ path: r.path, views: num(r.views), visitors: num(r.visitors), signedInUsers: num(r.signed_in_users) })),
      entryPages: rowsOf<Record<string, unknown>>(entries).map((r) => ({ path: r.path, visitors: num(r.visitors), everSignedIn: num(r.became_or_were_signed_in) })),
      signupEntryPages: rowsOf<Record<string, unknown>>(signupEntries).map((r) => ({ path: r.path, signups: num(r.signups) })),
      exitPages: rowsOf<Record<string, unknown>>(exits).map((r) => ({ path: r.path, exits: num(r.exits) })),
      visitSources: rowsOf<Record<string, unknown>>(sources).map((r) => ({
        source: r.source, campaign: r.campaign ?? null, visitors: num(r.visitors), everSignedIn: num(r.ever_signed_in), newMemberBrowsers: num(r.new_member_browsers),
      })),
      newMemberActivation: {
        signups: num(act.signups), linkedChessAccount: num(act.linked_chess_account), haveGames: num(act.have_games), activated: num(act.activated),
        note: "Activated = linked Chess.com or Lichess, or has games in their account (games load on the Welcome screen, so /import views undercount this).",
      },
      hourOfDay: rowsOf<Record<string, unknown>>(hours).map((r) => ({ hour: num(r.hour), views: num(r.views), visitors: num(r.visitors) })),
    });
  } catch (err) {
    logger.error({ err }, "[traffic-export] failed");
    res.status(500).json({ error: "Could not build the export", details: (err as Error)?.message });
  }
});

export default router;
