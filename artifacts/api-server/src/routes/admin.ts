import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, pageViewsTable } from "@workspace/db";
import { sql, count, gte } from "drizzle-orm";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

router.get("/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalUsersResult] = await db
      .select({ count: count() })
      .from(usersTable);

    const [todayUsersResult] = await db
      .select({ count: count() })
      .from(usersTable)
      .where(gte(usersTable.createdAt, todayStart));

    const [totalViewsResult] = await db
      .select({ count: count() })
      .from(pageViewsTable);

    const [todayViewsResult] = await db
      .select({ count: count() })
      .from(pageViewsTable)
      .where(gte(pageViewsTable.createdAt, todayStart));

    let activeSubscriptions = 0;
    try {
      const { storage } = await import("../lib/storage");
      const subResult = await db.execute(
        sql`SELECT COUNT(*) as count FROM subscriptions WHERE status IN ('active', 'trialing')`
      );
      activeSubscriptions = Number((subResult as any).rows?.[0]?.count ?? 0);
    } catch {}

    res.json({
      pageViews: { total: totalViewsResult.count, today: todayViewsResult.count },
      users: { total: totalUsersResult.count, today: todayUsersResult.count },
      subscriptions: { active: activeSubscriptions },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

router.post("/admin/pageview", requireAdmin, async (req: Request, res: Response) => {
  res.status(405).json({ error: "Use GET /api/track endpoint" });
});

export default router;
