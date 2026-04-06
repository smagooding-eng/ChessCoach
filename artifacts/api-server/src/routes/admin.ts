import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, pageViewsTable } from "@workspace/db";
import { sql, count, gte, countDistinct } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { ADMIN_EMAILS } from "../lib/auth";

const router: IRouter = Router();
const FREE_TRIAL_DAYS = 3;

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function computeUserStatus(email: string | null, createdAt: string | Date, stripeSub: { status: string; created: number } | null) {
  const isAdmin = email && ADMIN_EMAILS.includes(email.toLowerCase());
  if (isAdmin) return { tier: 'admin' as const, detail: null };

  if (stripeSub && stripeSub.status === 'active') {
    const daysSince = Math.floor((Date.now() / 1000 - stripeSub.created) / 86400);
    return { tier: 'pro' as const, detail: daysSince };
  }

  if (stripeSub && stripeSub.status === 'canceled') {
    return { tier: 'free' as const, detail: Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000) };
  }

  const created = new Date(createdAt);
  const elapsed = Date.now() - created.getTime();
  const trialMs = FREE_TRIAL_DAYS * 86400000;
  if (elapsed < trialMs) {
    const daysLeft = Math.max(1, Math.ceil((trialMs - elapsed) / 86400000));
    return { tier: 'trial' as const, detail: daysLeft };
  }

  const daysSinceCreated = Math.floor(elapsed / 86400000);
  return { tier: 'free' as const, detail: daysSinceCreated };
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
      const [activeSubs, canceledSubs, pastDueSubs] = await Promise.all([
        stripe.subscriptions.list({ status: 'active', limit: 100 }),
        stripe.subscriptions.list({ status: 'canceled', limit: 100 }),
        stripe.subscriptions.list({ status: 'past_due', limit: 100 }),
      ]);
      subBreakdown = {
        active: activeSubs.data.length,
        trialing: 0,
        canceled: canceledSubs.data.length,
        pastDue: pastDueSubs.data.length,
        total: activeSubs.data.length + canceledSubs.data.length + pastDueSubs.data.length,
      };
    } catch {}

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

    let subMap: Record<string, { status: string; created: number; planInterval: string | null }> = {};
    try {
      const stripe = await getUncachableStripeClient();
      const allStatuses: Array<'active' | 'canceled' | 'past_due' | 'unpaid'> = ['active', 'canceled', 'past_due', 'unpaid'];
      const results = await Promise.all(
        allStatuses.map(status => stripe.subscriptions.list({ status, limit: 100 }))
      );
      for (const result of results) {
        for (const sub of result.data) {
          const custId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as any)?.id;
          if (!custId) continue;
          const existing = subMap[custId];
          const priority = ['active', 'past_due', 'canceled', 'unpaid'];
          if (!existing || priority.indexOf(sub.status) < priority.indexOf(existing.status)) {
            const item = sub.items?.data?.[0];
            subMap[custId] = {
              status: sub.status,
              created: sub.created,
              planInterval: item?.price?.recurring?.interval ?? null,
            };
          }
        }
      }
    } catch {}

    const enrichedUsers = users.map(u => {
      const stripeSub = u.stripeCustomerId ? subMap[u.stripeCustomerId] ?? null : null;
      const status = computeUserStatus(u.email, u.createdAt, stripeSub);
      return {
        id: u.id,
        email: u.email,
        chesscomUsername: u.chesscomUsername,
        firstName: u.firstName,
        createdAt: u.createdAt,
        tier: status.tier,
        tierDetail: status.detail,
        planInterval: stripeSub?.planInterval ?? null,
      };
    });

    res.json({ users: enrichedUsers });
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

export default router;
