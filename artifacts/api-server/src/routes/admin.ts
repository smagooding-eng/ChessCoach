import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, pageViewsTable } from "@workspace/db";
import { sql, count, gte, countDistinct } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";

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

    const [totalUniqueResult] = await db
      .select({ count: countDistinct(pageViewsTable.visitorId) })
      .from(pageViewsTable);

    const [todayUniqueResult] = await db
      .select({ count: countDistinct(pageViewsTable.visitorId) })
      .from(pageViewsTable)
      .where(gte(pageViewsTable.createdAt, todayStart));

    let activeSubscriptions = 0;
    try {
      const stripe = await getUncachableStripeClient();
      const activeSubs = await stripe.subscriptions.list({ status: 'active', limit: 100 });
      const trialingSubs = await stripe.subscriptions.list({ status: 'trialing', limit: 100 });
      activeSubscriptions = activeSubs.data.length + trialingSubs.data.length;
    } catch {
      try {
        const subResult = await db.execute(
          sql`SELECT COUNT(*) as count FROM stripe.subscriptions WHERE status IN ('active', 'trialing')`
        );
        activeSubscriptions = Number((subResult as any).rows?.[0]?.count ?? 0);
      } catch {}
    }

    res.json({
      pageViews: { total: totalViewsResult.count, today: todayViewsResult.count },
      uniqueVisitors: { total: totalUniqueResult.count, today: todayUniqueResult.count },
      users: { total: totalUsersResult.count, today: todayUsersResult.count },
      subscriptions: { active: activeSubscriptions },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

router.get("/admin/users", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        chesscomUsername: usersTable.chesscomUsername,
        firstName: usersTable.firstName,
        createdAt: usersTable.createdAt,
        stripeCustomerId: usersTable.stripeCustomerId,
      })
      .from(usersTable)
      .orderBy(sql`${usersTable.createdAt} DESC`);

    let subMap: Record<string, { status: string; trialEnd: number | null; currentPeriodStart: number | null; currentPeriodEnd: number | null }> = {};
    try {
      const stripe = await getUncachableStripeClient();
      const allSubs = await stripe.subscriptions.list({ limit: 100, expand: ['data.customer'] });
      for (const sub of allSubs.data) {
        const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (!custId) continue;
        const existing = subMap[custId];
        if (!existing || (sub.status === 'active' && existing.status !== 'active') || (sub.status === 'trialing' && existing.status !== 'active')) {
          subMap[custId] = {
            status: sub.status,
            trialEnd: sub.trial_end ?? null,
            currentPeriodStart: sub.current_period_start ?? null,
            currentPeriodEnd: sub.current_period_end ?? null,
          };
        }
      }
    } catch {
      try {
        const subRows = await db.execute(
          sql`SELECT customer, status, trial_end, current_period_start, current_period_end FROM stripe.subscriptions WHERE customer IS NOT NULL`
        );
        for (const row of (subRows as any).rows ?? []) {
          const existing = subMap[row.customer];
          if (!existing || (row.status === 'active' && existing.status !== 'active') || (row.status === 'trialing' && existing.status !== 'active')) {
            subMap[row.customer] = {
              status: row.status,
              trialEnd: row.trial_end ? Number(row.trial_end) : null,
              currentPeriodStart: row.current_period_start ? Number(row.current_period_start) : null,
              currentPeriodEnd: row.current_period_end ? Number(row.current_period_end) : null,
            };
          }
        }
      } catch {}
    }

    const enrichedUsers = users.map(u => {
      const sub = u.stripeCustomerId ? subMap[u.stripeCustomerId] : null;
      return {
        id: u.id,
        email: u.email,
        chesscomUsername: u.chesscomUsername,
        firstName: u.firstName,
        createdAt: u.createdAt,
        subscription: sub ?? null,
      };
    });

    res.json({ users: enrichedUsers });
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

export default router;
