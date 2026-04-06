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

    let subBreakdown = { active: 0, trialing: 0, canceled: 0, pastDue: 0, total: 0 };
    try {
      const stripe = await getUncachableStripeClient();
      const [activeSubs, trialingSubs, canceledSubs, pastDueSubs] = await Promise.all([
        stripe.subscriptions.list({ status: 'active', limit: 100 }),
        stripe.subscriptions.list({ status: 'trialing', limit: 100 }),
        stripe.subscriptions.list({ status: 'canceled', limit: 100 }),
        stripe.subscriptions.list({ status: 'past_due', limit: 100 }),
      ]);
      subBreakdown = {
        active: activeSubs.data.length,
        trialing: trialingSubs.data.length,
        canceled: canceledSubs.data.length,
        pastDue: pastDueSubs.data.length,
        total: activeSubs.data.length + trialingSubs.data.length + canceledSubs.data.length + pastDueSubs.data.length,
      };
    } catch {
      try {
        const subResult = await db.execute(
          sql`SELECT status, COUNT(*)::int as count FROM stripe.subscriptions GROUP BY status`
        );
        for (const row of (subResult as any).rows ?? []) {
          const c = Number(row.count);
          if (row.status === 'active') subBreakdown.active = c;
          else if (row.status === 'trialing') subBreakdown.trialing = c;
          else if (row.status === 'canceled') subBreakdown.canceled = c;
          else if (row.status === 'past_due') subBreakdown.pastDue = c;
          subBreakdown.total += c;
        }
      } catch {}
    }

    res.json({
      pageViews: { total: totalViewsResult.count, today: todayViewsResult.count },
      uniqueVisitors: { total: totalUniqueResult.count, today: todayUniqueResult.count },
      users: { total: totalUsersResult.count, today: todayUsersResult.count },
      subscriptions: subBreakdown,
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

    let subMap: Record<string, { status: string; trialEnd: number | null; currentPeriodStart: number | null; currentPeriodEnd: number | null; planInterval: string | null; canceledAt: number | null }> = {};
    try {
      const stripe = await getUncachableStripeClient();
      const allStatuses: Array<'active' | 'trialing' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired'> = ['active', 'trialing', 'canceled', 'past_due', 'unpaid'];
      const results = await Promise.all(
        allStatuses.map(status => stripe.subscriptions.list({ status, limit: 100 }))
      );
      for (const result of results) {
        for (const sub of result.data) {
          const custId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as any)?.id;
          if (!custId) continue;
          const existing = subMap[custId];
          const priority = ['active', 'trialing', 'past_due', 'canceled', 'unpaid'];
          if (!existing || priority.indexOf(sub.status) < priority.indexOf(existing.status)) {
            const item = sub.items?.data?.[0];
            const s = sub as any;
            subMap[custId] = {
              status: sub.status,
              trialEnd: sub.trial_end ?? null,
              currentPeriodStart: s.current_period_start ?? null,
              currentPeriodEnd: s.current_period_end ?? null,
              planInterval: item?.price?.recurring?.interval ?? null,
              canceledAt: sub.canceled_at ?? null,
            };
          }
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
              planInterval: null,
              canceledAt: null,
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
