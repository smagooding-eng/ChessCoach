import { Router, type IRouter, type Request, type Response } from "express";
import { db, landingFunnelEventsTable } from "@workspace/db";
import { sql, gte } from "drizzle-orm";

// Same shape returned by /api/admin/stats -- kept identical so the admin
// UI can render both with one component.
interface VisitorBreakdown { new: number; returning: number; bounced: number }

// Scoped version of the same new/returning/bounced logic used in
// admin.ts, but restricted to visitors who actually fired a
// `landing_view` event in this window (rather than every visitor
// site-wide). Joins out to page_views by visitor_id -- that's the same
// localStorage-backed id used by both the funnel tracker and the
// generic page-view tracker, so it's a reliable join key. A visitor_id
// with no matching page_views row at all (edge case) is treated as a
// single-day, not-signed-up visit rather than dropped from the count.
async function getLandingVisitorBreakdown(since: Date): Promise<VisitorBreakdown> {
  const result = await db.execute(sql`
    WITH landing_visitors AS (
      SELECT DISTINCT visitor_id
      FROM landing_funnel_events
      WHERE event_type = 'landing_view' AND created_at >= ${since}
    ),
    visitor_agg AS (
      SELECT
        lv.visitor_id,
        COALESCE(COUNT(DISTINCT date_trunc('day', pv.created_at)), 0) AS days_active,
        COALESCE(BOOL_OR(pv.user_id IS NOT NULL), false) AS signed_up
      FROM landing_visitors lv
      LEFT JOIN page_views pv ON pv.visitor_id = lv.visitor_id
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

const SECTION_IDS = ["hero", "how_it_works", "differentiators", "features", "faq", "pricing", "final_cta"] as const;

const VALID_EVENTS = new Set([
  "landing_view", "mia_started", "mia_skipped", "signup_clicked", "signup_completed",
  "signup_form_submitted", "signup_error", "opponent_scout_clicked",
  "scroll_25", "scroll_50", "scroll_75", "scroll_100",
  "engaged_10s",
  ...SECTION_IDS.map((s) => `viewed_${s}`),
  ...SECTION_IDS.map((s) => `exit_${s}`),
]);

// Public -- fired directly from the landing page, no auth (most visitors
// firing these events haven't signed up yet, that's the whole point).
router.post("/landing-funnel/track", async (req: Request, res: Response) => {
  try {
    const { visitorId, eventType } = req.body as { visitorId?: string; eventType?: string };
    if (!visitorId || !eventType || !VALID_EVENTS.has(eventType)) {
      res.status(400).json({ error: "Invalid visitorId or eventType" });
      return;
    }
    await db.insert(landingFunnelEventsTable).values({ visitorId, eventType });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to log event" });
  }
});

// Admin-only aggregation. Separate route/section from the general admin
// dashboard's page-view stats, per explicit instruction not to mix them in.
router.get("/admin/landing-funnel", requireAdmin, async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const counts = await db
      .select({ eventType: landingFunnelEventsTable.eventType, count: sql<number>`count(distinct ${landingFunnelEventsTable.visitorId})` })
      .from(landingFunnelEventsTable)
      .where(gte(landingFunnelEventsTable.createdAt, since))
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

    // "Left without doing anything" = viewed the landing page but never
    // triggered any other funnel event at all (not even Mia or signup click).
    const distinctActiveVisitors = await db
      .select({ visitorId: landingFunnelEventsTable.visitorId })
      .from(landingFunnelEventsTable)
      .where(gte(landingFunnelEventsTable.createdAt, since));
    const visitorEventCounts: Record<string, number> = {};
    for (const row of distinctActiveVisitors) {
      visitorEventCounts[row.visitorId] = (visitorEventCounts[row.visitorId] ?? 0) + 1;
    }
    const leftWithoutAction = Object.values(visitorEventCounts).filter((c) => c === 1).length;

    const visitorBreakdown = await getLandingVisitorBreakdown(since);

    res.json({
      days,
      landingViews,
      miaStarted,
      miaSkipped,
      signupClicked,
      signupFormSubmitted,
      signupError,
      signupCompleted,
      opponentScoutClicked,
      leftWithoutAction,
      scrollDepth,
      engaged10s,
      sectionViews,
      sectionExits,
      visitorBreakdown,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch landing funnel stats", details: err.message });
  }
});

export default router;
