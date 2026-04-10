import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, pageViewsTable, gamesTable, weaknessesTable, coursesTable, lessonsTable, backgroundJobsTable } from "@workspace/db";
import { sql, count, gte, countDistinct, inArray, eq } from "drizzle-orm";
import { puzzleAttemptsTable } from "@workspace/db";
import { sessionsTable } from "@workspace/db";
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
      const [activeSubs, pastDueSubs] = await Promise.all([
        stripe.subscriptions.list({ status: 'active', limit: 100 }),
        stripe.subscriptions.list({ status: 'past_due', limit: 100 }),
      ]);
      subBreakdown = {
        active: activeSubs.data.length,
        trialing: 0,
        canceled: 0,
        pastDue: pastDueSubs.data.length,
        total: activeSubs.data.length + pastDueSubs.data.length,
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
        lastLoginAt: usersTable.lastLoginAt,
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
      const lastLogin = u.lastLoginAt;
      const daysSinceLogin = lastLogin ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / 86400000) : null;
      return {
        id: u.id,
        email: u.email,
        chesscomUsername: u.chesscomUsername,
        firstName: u.firstName,
        createdAt: u.createdAt,
        tier: status.tier,
        tierDetail: status.detail,
        planInterval: stripeSub?.planInterval ?? null,
        daysSinceLogin,
      };
    });

    res.json({ users: enrichedUsers });
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/admin/clear-ai-cache", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const gamesResult = await db.update(gamesTable)
      .set({ reviewData: null, analysisNotes: null, analyzed: false });

    const weaknessesResult = await db.delete(weaknessesTable);

    const lessonsResult = await db.delete(lessonsTable);
    const coursesResult = await db.delete(coursesTable);

    const jobsResult = await db.update(backgroundJobsTable)
      .set({ result: null, status: "cleared", error: null })
      .where(inArray(backgroundJobsTable.type, ["analysis", "review"]));

    res.json({
      success: true,
      cleared: {
        games: "review_data, analysis_notes, analyzed reset",
        weaknesses: "deleted",
        lessons: "deleted",
        courses: "deleted",
        jobs: "analysis/review results cleared (scouts preserved)",
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to clear AI cache", details: err.message });
  }
});

router.post("/admin/users/delete", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userIds } = req.body as { userIds: string[] };
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: "userIds array required" });
      return;
    }

    const usersToDelete = await db
      .select({ id: usersTable.id, email: usersTable.email, stripeCustomerId: usersTable.stripeCustomerId })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));

    const adminEmails = usersToDelete
      .filter(u => u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()))
      .map(u => u.email);
    if (adminEmails.length > 0) {
      res.status(403).json({ error: `Cannot delete admin accounts: ${adminEmails.join(", ")}` });
      return;
    }

    const ids = usersToDelete.map(u => u.id);
    if (ids.length === 0) {
      res.status(404).json({ error: "No matching users found" });
      return;
    }

    try {
      const stripe = await getUncachableStripeClient();
      for (const u of usersToDelete) {
        if (u.stripeCustomerId) {
          try {
            const subs = await stripe.subscriptions.list({ customer: u.stripeCustomerId, status: 'active', limit: 10 });
            for (const sub of subs.data) {
              await stripe.subscriptions.cancel(sub.id);
            }
          } catch {}
        }
      }
    } catch {}

    await db.delete(puzzleAttemptsTable).where(inArray(puzzleAttemptsTable.userId, ids));
    await db.delete(backgroundJobsTable).where(inArray(backgroundJobsTable.userId, ids));
    await db.delete(pageViewsTable).where(inArray(pageViewsTable.userId, ids));

    const deletedResult = await db.delete(usersTable).where(inArray(usersTable.id, ids));

    res.json({ success: true, deleted: ids.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete users", details: err.message });
  }
});

export default router;
