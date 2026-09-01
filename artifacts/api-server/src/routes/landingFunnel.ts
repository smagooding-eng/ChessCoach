import { Router, type IRouter, type Request, type Response } from "express";
import { db, landingFunnelEventsTable } from "@workspace/db";
import { sql, gte } from "drizzle-orm";

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
    const signupCompleted = countMap["signup_completed"] ?? 0;

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

    res.json({
      days,
      landingViews,
      miaStarted,
      miaSkipped,
      signupClicked,
      signupCompleted,
      leftWithoutAction,
      scrollDepth,
      engaged10s,
      sectionViews,
      sectionExits,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch landing funnel stats", details: err.message });
  }
});

export default router;
