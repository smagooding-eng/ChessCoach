import { Router, type IRouter, type Request, type Response } from "express";
import { db, landingFunnelEventsTable } from "@workspace/db";
import { sql, gte, lte, and, eq } from "drizzle-orm";
import { parseDateRangeParams } from "./admin";
import { botKind } from "../lib/botDetect";

// Same shape returned by /api/admin/stats -- kept identical so the admin
// UI can render both with one component.
interface VisitorBreakdown { new: number; returning: number; bounced: number }

type Platform = "web" | "app";

// Scoped version of the same new/returning/bounced logic used in
// admin.ts, but restricted to visitors who actually fired a
// `landing_view` event in this window AND on this platform (rather than
// every visitor site-wide). Joins out to page_views by visitor_id --
// that's the same localStorage-backed id used by both the funnel tracker
// and the generic page-view tracker, so it's a reliable join key. A
// visitor_id with no matching page_views row at all (edge case) is
// treated as a single-day, not-signed-up visit rather than dropped from
// the count.
async function getLandingVisitorBreakdown(since: Date, until: Date, platform: Platform): Promise<VisitorBreakdown> {
  const result = await db.execute(sql`
    WITH landing_visitors AS (
      SELECT DISTINCT visitor_id
      FROM lfe_people
      WHERE event_type = 'landing_view' AND platform = ${platform} AND created_at >= ${since} AND created_at <= ${until}
    ),
    visitor_agg AS (
      SELECT
        lv.visitor_id,
        COALESCE(COUNT(DISTINCT date_trunc('day', pv.created_at)), 0) AS days_active,
        COALESCE(BOOL_OR(pv.user_id IS NOT NULL), false) AS signed_up
      FROM landing_visitors lv
      LEFT JOIN pv_people pv ON pv.visitor_id = lv.visitor_id
      GROUP BY lv.visitor_id
    )
    SELECT
      COUNT(*) FILTER (WHERE days_active <= 1) AS new_visitors,
      COUNT(*) FILTER (WHERE days_active > 1) AS returning_visitors,
      COUNT(*) FILTER (WHERE NOT signed_up) AS bounced_visitors
    FROM visitor_agg
  `);
  const row = (result.rows[0] ?? {}) as {
    new_visitors?: string | number; returning_visitors?: string | number; bounced_visitors?: string | number;
  };
  return {
    new: Number(row.new_visitors ?? 0),
    returning: Number(row.returning_visitors ?? 0),
    bounced: Number(row.bounced_visitors ?? 0),
  };
}

const router: IRouter = Router();

// Matches admin.ts's own local requireAdmin -- it isn't exported from
// authMiddleware.ts, each route file that needs it defines its own.
function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|embedly|bingpreview|semrush|ahrefs|mj12|google-inspectiontool|phantomjs|puppeteer|playwright|selenium|python-requests|curl\/|wget|go-http-client|node-fetch/i;

const SECTION_IDS = ["hero", "pillars", "explore", "how_it_works", "differentiators", "features", "faq", "pricing", "final_cta"] as const;

// Which way people pay on the Pro plan: Stripe's own page, the card form, or a wallet button.
const CHECKOUT_EVENTS = ["pro_checkout_stripe", "pro_checkout_card", "pro_checkout_google_pay", "pro_checkout_apple_pay",
  "pro_checkout_link", "pro_checkout_amazon_pay", "pro_checkout_paypal", "pro_checkout_other"] as const;
const SIGNUP_EVENTS = ["signup_completed", "google_signup_completed", "lichess_signup_completed"];

type Device = "mobile" | "tablet" | "desktop";
function deviceOf(ua: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

const VALID_EVENTS = new Set([
  "landing_view", "mia_started", "mia_skipped", "signup_clicked", "signup_completed",
  "signup_form_submitted", "signup_error", "opponent_scout_clicked",
  "google_oauth_clicked", "google_signup_completed", "google_signup_error", "google_login_completed",
  "guest_game_started", "guest_game_finished",
  "lichess_oauth_clicked", "lichess_signup_completed", "lichess_login_completed",
  // the trip out to Google / Lichess to sign in: left for it, cancelled Google's sheet, or
  // came back without finishing (as opposed to leaving the site)
  "left_for_signin", "google_signin_cancelled", "google_signin_abandoned", "lichess_signin_abandoned",
  // the Instagram page (/ig): looked up their games; inside an app's built-in browser, tapped "open in browser"
  "ig_games_shown", "inapp_open_browser",
  "scroll_25", "scroll_50", "scroll_75", "scroll_100",
  "engaged_10s",
  // in-app popups: shown and closed, to see what they do to new members
  "popup_shown_pro_offer", "popup_closed_pro_offer", "popup_shown_board_setup", "popup_closed_board_setup",
  "popup_shown_review_alerts", "popup_closed_review_alerts",
  ...CHECKOUT_EVENTS,
  ...SECTION_IDS.map((s) => `viewed_${s}`),
  ...SECTION_IDS.map((s) => `exit_${s}`),
]);

// Public -- fired directly from the landing page, no auth (most visitors
// firing these events haven't signed up yet, that's the whole point).
router.post("/landing-funnel/track", async (req: Request, res: Response) => {
  try {
    const { visitorId, eventType, platform, elapsedMs } = req.body as {
      visitorId?: string; eventType?: string; platform?: string; elapsedMs?: number;
    };
    if (!visitorId || !eventType || !VALID_EVENTS.has(eventType)) {
      res.status(400).json({ error: "Invalid visitorId or eventType" });
      return;
    }
    // Bots aren't part of the funnel (they're counted in bot_visits instead).
    if (botKind(String(req.headers["user-agent"] ?? ""), (req.body as { automated?: boolean }).automated === true)) {
      res.json({ ok: true });
      return;
    }
    // Unrecognized/missing platform falls back to 'web' rather than
    // rejecting the event outright -- an older cached client bundle
    // without the platform field shouldn't start dropping events.
    // Search-engine crawlers and other bots run the page's JavaScript too, so
    // they used to show up as "landing page views" that never scroll or leave.
    // They're acknowledged but not counted.
    const ua = String(req.headers["user-agent"] ?? "");
    if (!ua || BOT_UA.test(ua)) { res.json({ success: true, ignored: true }); return; }
    const safePlatform: Platform = platform === "app" ? "app" : "web";
    const safeElapsedMs = typeof elapsedMs === "number" && Number.isFinite(elapsedMs) && elapsedMs >= 0
      ? Math.round(elapsedMs)
      : null;
    await db.insert(landingFunnelEventsTable).values({
      visitorId,
      eventType,
      platform: safePlatform,
      elapsedMs: safeElapsedMs,
      device: deviceOf(ua),
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to log event" });
  }
});

// The full stats shape for ONE platform slice. Used twice per request
// (once for 'web', once for 'app') so the admin panel can show them
// side by side under a single shared date filter, rather than needing
// two separate API calls or two separate date pickers.
async function getFunnelStatsForPlatform(since: Date, until: Date, platform: Platform) {
  const platformFilter = eq(landingFunnelEventsTable.platform, platform);
  // Leave out the owner's browsers and suspected bots (lib/analyticsExclusions.ts).
  const notExcluded = sql`${landingFunnelEventsTable.visitorId} NOT IN (SELECT visitor_id FROM analytics_excluded_visitors)`;

  const counts = await db
    .select({ eventType: landingFunnelEventsTable.eventType, count: sql<number>`count(distinct ${landingFunnelEventsTable.visitorId})` })
    .from(landingFunnelEventsTable)
    .where(and(platformFilter, gte(landingFunnelEventsTable.createdAt, since), lte(landingFunnelEventsTable.createdAt, until), notExcluded))
    .groupBy(landingFunnelEventsTable.eventType);

  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c.eventType] = Number(c.count);

  const landingViews = countMap["landing_view"] ?? 0;
  const miaStarted = countMap["mia_started"] ?? 0;
  const miaSkipped = countMap["mia_skipped"] ?? 0;
  const signupClicked = countMap["signup_clicked"] ?? 0;
  const signupFormSubmitted = countMap["signup_form_submitted"] ?? 0;
  const signupError = countMap["signup_error"] ?? 0;
  const signupCompleted = countMap["signup_completed"] ?? 0;
  const opponentScoutClicked = countMap["opponent_scout_clicked"] ?? 0;
  const googleOauthClicked = countMap["google_oauth_clicked"] ?? 0;
  const googleSignupCompleted = countMap["google_signup_completed"] ?? 0;
  const googleSignupError = countMap["google_signup_error"] ?? 0;
  const googleLoginCompleted = countMap["google_login_completed"] ?? 0;

  // Total "actually signed up" across both paths -- the email form and
  // Google OAuth are tracked as separate funnels above (for good reason,
  // they have different failure modes), but "how many actually signed
  // up" as a single headline number needs both added together.
  const lichessOauthClicked = countMap["lichess_oauth_clicked"] ?? 0;
  const lichessSignupCompleted = countMap["lichess_signup_completed"] ?? 0;
  const lichessLoginCompleted = countMap["lichess_login_completed"] ?? 0;
  const totalSignedUp = signupCompleted + googleSignupCompleted + lichessSignupCompleted;
  const signIn = {
    leftForSignIn: countMap["left_for_signin"] ?? 0,
    googleCancelled: countMap["google_signin_cancelled"] ?? 0,
    googleCameBackWithout: countMap["google_signin_abandoned"] ?? 0,
    lichessCameBackWithout: countMap["lichess_signin_abandoned"] ?? 0,
    igGamesShown: countMap["ig_games_shown"] ?? 0,
    openedInBrowser: countMap["inapp_open_browser"] ?? 0,
  };

  const scrollDepth = {
    scroll25: countMap["scroll_25"] ?? 0,
    scroll50: countMap["scroll_50"] ?? 0,
    scroll75: countMap["scroll_75"] ?? 0,
    scroll100: countMap["scroll_100"] ?? 0,
  };
  const engaged10s = countMap["engaged_10s"] ?? 0;

  const sectionViews: Record<string, number> = {};
  const sectionExits: Record<string, number> = {};
  for (const s of SECTION_IDS) {
    sectionViews[s] = countMap[`viewed_${s}`] ?? 0;
    sectionExits[s] = countMap[`exit_${s}`] ?? 0;
  }

  // "When" people leave each section -- median elapsed time (ms since
  // page load) at the moment of the exit event, per section. Median
  // rather than average since a handful of people leaving a tab open
  // for hours before closing it would otherwise blow the average up to
  // something meaningless.
  const exitTimingRows = await db.execute(sql`
    SELECT
      event_type,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_ms) AS median_elapsed_ms,
      COUNT(*) FILTER (WHERE elapsed_ms IS NOT NULL) AS sample_size
    FROM lfe_people
    WHERE platform = ${platform}
      AND created_at >= ${since} AND created_at <= ${until}
      AND event_type LIKE 'exit_%'
      AND elapsed_ms IS NOT NULL
    GROUP BY event_type
  `);
  const sectionExitTimingMs: Record<string, { medianMs: number; sampleSize: number }> = {};
  for (const row of exitTimingRows.rows as { event_type: string; median_elapsed_ms: string | number | null; sample_size: string | number }[]) {
    const section = row.event_type.replace(/^exit_/, "");
    if (row.median_elapsed_ms == null) continue;
    sectionExitTimingMs[section] = {
      medianMs: Math.round(Number(row.median_elapsed_ms)),
      sampleSize: Number(row.sample_size),
    };
  }

  // "Left without doing anything" = viewed the landing page but never
  // triggered any other funnel event at all (not even Mia or signup click).
  const distinctActiveVisitors = await db
    .select({ visitorId: landingFunnelEventsTable.visitorId, eventType: landingFunnelEventsTable.eventType })
    .from(landingFunnelEventsTable)
    .where(and(platformFilter, gte(landingFunnelEventsTable.createdAt, since), lte(landingFunnelEventsTable.createdAt, until), notExcluded));
  // Seeing the page (the view, the hero coming into view, leaving from the
  // hero) isn't an action. This used to count visitors with exactly one
  // event, but every visit logs at least two (page view + hero view), so it
  // always read 0.
  const PASSIVE = /^(landing_view|viewed_hero|exit_.+)$/;
  const viewed = new Set<string>();
  const acted = new Set<string>();
  for (const row of distinctActiveVisitors) {
    if (row.eventType === "landing_view") viewed.add(row.visitorId);
    if (!PASSIVE.test(row.eventType)) acted.add(row.visitorId);
  }
  const leftWithoutAction = [...viewed].filter((v) => !acted.has(v)).length;

  const visitorBreakdown = await getLandingVisitorBreakdown(since, until, platform);

  return {
    landingViews,
    miaStarted,
    miaSkipped,
    signupClicked,
    signupFormSubmitted,
    signupError,
    signupCompleted,
    opponentScoutClicked,
    googleOauthClicked,
    googleSignupCompleted,
    googleSignupError,
    googleLoginCompleted,
    lichessOauthClicked,
    lichessSignupCompleted,
    lichessLoginCompleted,
    signIn,
    totalSignedUp,
    leftWithoutAction,
    scrollDepth,
    engaged10s,
    sectionViews,
    sectionExits,
    sectionExitTimingMs,
    visitorBreakdown,
  };
}

// Phone, tablet or computer: landing visitors and new accounts, website and app together.
// Only counts events recorded since the device started being saved.
async function getDeviceStats(since: Date, until: Date) {
  const r = await db.execute(sql`
    SELECT device,
      COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'landing_view') AS visitors,
      COUNT(DISTINCT visitor_id) FILTER (WHERE event_type IN (${sql.join(SIGNUP_EVENTS.map((e) => sql`${e}`), sql`, `)})) AS signups
    FROM landing_funnel_events
    WHERE device IS NOT NULL AND created_at >= ${since} AND created_at <= ${until}
      AND visitor_id NOT IN (SELECT visitor_id FROM analytics_excluded_visitors)
    GROUP BY device`);
  const out: Record<Device, { visitors: number; signups: number }> = { mobile: { visitors: 0, signups: 0 }, tablet: { visitors: 0, signups: 0 }, desktop: { visitors: 0, signups: 0 } };
  for (const row of r.rows as { device: string; visitors: string | number; signups: string | number }[]) {
    if (row.device in out) out[row.device as Device] = { visitors: Number(row.visitors), signups: Number(row.signups) };
  }
  return out;
}

// Pro checkout: how many people pressed each way to pay (one per person per way).
async function getCheckoutClicks(since: Date, until: Date) {
  const r = await db.execute(sql`
    SELECT event_type, device, COUNT(DISTINCT visitor_id) AS people
    FROM landing_funnel_events
    WHERE event_type LIKE 'pro_checkout_%' AND created_at >= ${since} AND created_at <= ${until}
      AND visitor_id NOT IN (SELECT visitor_id FROM analytics_excluded_visitors)
    GROUP BY event_type, device`);
  const out: Record<string, { total: number; mobile: number; tablet: number; desktop: number }> = {};
  for (const e of CHECKOUT_EVENTS) out[e.replace("pro_checkout_", "")] = { total: 0, mobile: 0, tablet: 0, desktop: 0 };
  for (const row of r.rows as { event_type: string; device: string | null; people: string | number }[]) {
    const k = row.event_type.replace("pro_checkout_", ""); const n = Number(row.people);
    if (!out[k]) continue;
    out[k].total += n;
    if (row.device === "mobile" || row.device === "tablet" || row.device === "desktop") out[k][row.device] += n;
  }
  return out;
}

// Admin-only aggregation. Separate route/section from the general admin
// dashboard's page-view stats, per explicit instruction not to mix them in.
// Returns both platform slices in one response under a single date range,
// so the admin panel can render Website and App side by side without a
// second date picker or a second round trip.
router.get("/admin/landing-funnel", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { since, until } = parseDateRangeParams(req, 30);

    const [web, app] = await Promise.all([
      getFunnelStatsForPlatform(since, until, "web"),
      getFunnelStatsForPlatform(since, until, "app"),
    ]);

    const [byDevice, checkoutClicks] = await Promise.all([getDeviceStats(since, until), getCheckoutClicks(since, until)]);

    res.json({
      days: Math.max(1, Math.round((until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000))),
      web,
      app,
      byDevice,
      checkoutClicks,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch landing funnel stats", details: err?.cause?.message ?? err?.message });
  }
});

export default router;
