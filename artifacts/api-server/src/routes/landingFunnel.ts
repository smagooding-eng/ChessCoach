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

const VALID_EVENTS = new Set(["landing_view", "mia_started", "mia_skipped", "signup_clicked", "signup_completed"]);

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
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch landing funnel stats", details: err.message });
  }
});

export default router;
