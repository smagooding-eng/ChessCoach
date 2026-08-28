import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, pageViewsTable, gamesTable, weaknessesTable, coursesTable, lessonsTable, backgroundJobsTable, referralConversionsTable, affiliateAdjustmentsTable, seoArticlesTable } from "@workspace/db";
import { sql, count, gte, countDistinct, inArray, eq, and, isNotNull, desc } from "drizzle-orm";
import { puzzleAttemptsTable } from "@workspace/db";
import { sessionsTable } from "@workspace/db";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { ADMIN_EMAILS } from "../lib/auth";
import { generateNextSeoArticle } from "../lib/seoContentEngine";
import OpenAI from "openai";

const router: IRouter = Router();
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

  const elapsed = Date.now() - new Date(createdAt).getTime();
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

    const [
      totalGamesResult,
      todayGamesResult,
      analyzedGamesResult,
      scoutJobsResult,
      uniqueScoutTargetsResult,
      scanViewsResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(gamesTable),
      db.select({ count: count() }).from(gamesTable).where(gte(gamesTable.createdAt, todayStart)),
      db.select({ count: count() }).from(gamesTable).where(eq(gamesTable.analyzed, true)),
      db.select({ count: count() }).from(backgroundJobsTable).where(eq(backgroundJobsTable.type, 'scout')),
      db.select({ count: countDistinct(backgroundJobsTable.targetUsername) }).from(backgroundJobsTable).where(eq(backgroundJobsTable.type, 'scout')),
      db.select({ count: count() }).from(pageViewsTable).where(eq(pageViewsTable.path, '/scan')),
    ]);

    const topPagesRows = await db
      .select({
        path: pageViewsTable.path,
        views: count(),
        uniqueVisitors: countDistinct(pageViewsTable.visitorId),
      })
      .from(pageViewsTable)
      .groupBy(pageViewsTable.path)
      .orderBy(sql`count(*) desc`)
      .limit(20);

    res.json({
      pageViews: { total: totalViewsResult.count, today: todayViewsResult.count },
      uniqueVisitors: { total: totalUniqueResult.count, today: todayUniqueResult.count },
      users: { total: totalUsersResult.count, today: todayUsersResult.count },
      subscriptions: subBreakdown,
      games: {
        total: totalGamesResult[0].count,
        today: todayGamesResult[0].count,
        analyzed: analyzedGamesResult[0].count,
      },
      activity: {
        opponentsScoutedTotal: scoutJobsResult[0].count,
        uniqueOpponentsScouted: uniqueScoutTargetsResult[0].count,
        positionScans: scanViewsResult[0].count,
      },
      topPages: topPagesRows.map((r) => ({
        path: r.path,
        views: r.views,
        uniqueVisitors: r.uniqueVisitors,
      })),
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
        inviteCode: usersTable.inviteCode,
        referredByUserId: usersTable.referredByUserId,
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

    // Total lifetime payments per subscriber -- scoped only to customer
    // IDs that actually have/had a subscription (from subMap above),
    // not every user, to keep this fast rather than one Stripe call per
    // account regardless of whether they've ever paid anything.
    let paymentTotalsMap: Record<string, { totalCents: number; currency: string; count: number }> = {};
    try {
      const stripe = await getUncachableStripeClient();
      const subscriberCustomerIds = Object.keys(subMap);
      const chargeResults = await Promise.all(
        subscriberCustomerIds.map((custId) =>
          stripe.charges.list({ customer: custId, limit: 100 }).catch(() => null)
        )
      );
      subscriberCustomerIds.forEach((custId, i) => {
        const result = chargeResults[i];
        if (!result) return;
        const succeeded = result.data.filter((c) => c.status === "succeeded" && !c.refunded);
        if (succeeded.length === 0) return;
        paymentTotalsMap[custId] = {
          totalCents: succeeded.reduce((sum, c) => sum + c.amount, 0),
          currency: succeeded[0].currency,
          count: succeeded.length,
        };
      });
    } catch {}

    const referralCounts = await db.select({
      referrerUserId: referralConversionsTable.referrerUserId,
      total: count(),
    }).from(referralConversionsTable).groupBy(referralConversionsTable.referrerUserId);

    const refCountMap: Record<string, number> = {};
    for (const r of referralCounts) refCountMap[r.referrerUserId] = r.total;

    const enrichedUsers = users.map(u => {
      const stripeSub = u.stripeCustomerId ? subMap[u.stripeCustomerId] ?? null : null;
      const status = computeUserStatus(u.email, u.createdAt, stripeSub);
      const lastLogin = u.lastLoginAt;
      const daysSinceLogin = lastLogin ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / 86400000) : null;
      const payments = u.stripeCustomerId ? paymentTotalsMap[u.stripeCustomerId] ?? null : null;
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
        inviteCode: u.inviteCode,
        referredByUserId: u.referredByUserId,
        referralCount: refCountMap[u.id] ?? 0,
        totalPaidCents: payments?.totalCents ?? null,
        paidCurrency: payments?.currency ?? null,
        paymentCount: payments?.count ?? 0,
      };
    });

    res.json({ users: enrichedUsers });
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Subscribers list sourced directly from Stripe -- not from the local DB.
// This means it shows real subscribers even if their local account's
// stripeCustomerId link is broken or missing (a real, previously-seen
// data-migration issue), because it never depends on that link to find
// them in the first place. Local account info is attached for
// convenience where a match can be found, but isn't required.
router.get("/admin/subscribers", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stripe = await getUncachableStripeClient();
    const allStatuses: Array<'active' | 'past_due' | 'trialing' | 'canceled' | 'unpaid'> = ['active', 'past_due', 'trialing', 'canceled', 'unpaid'];
    const results = await Promise.all(
      allStatuses.map(status => stripe.subscriptions.list({ status, limit: 100, expand: ['data.customer'] }))
    );

    const priority = ['active', 'past_due', 'trialing', 'canceled', 'unpaid'];
    const subsByCustomer: Record<string, {
      customerId: string; customerName: string | null; customerEmail: string | null;
      status: string; planInterval: string | null; planAmountCents: number | null; created: number;
    }> = {};

    for (const result of results) {
      for (const sub of result.data) {
        const cust = sub.customer;
        const custId = typeof cust === 'string' ? cust : cust?.id;
        if (!custId) continue;
        const existing = subsByCustomer[custId];
        if (!existing || priority.indexOf(sub.status) < priority.indexOf(existing.status)) {
          const item = sub.items?.data?.[0];
          subsByCustomer[custId] = {
            customerId: custId,
            customerName: typeof cust === 'object' && !('deleted' in cust) ? cust.name ?? null : null,
            customerEmail: typeof cust === 'object' && !('deleted' in cust) ? cust.email ?? null : null,
            status: sub.status,
            planInterval: item?.price?.recurring?.interval ?? null,
            planAmountCents: item?.price?.unit_amount ?? null,
            created: sub.created,
          };
        }
      }
    }

    const customerIds = Object.keys(subsByCustomer);

    const chargeResults = await Promise.all(
      customerIds.map((custId) => stripe.charges.list({ customer: custId, limit: 100 }).catch(() => null))
    );
    const paymentTotals: Record<string, { totalCents: number; currency: string; count: number }> = {};
    customerIds.forEach((custId, i) => {
      const result = chargeResults[i];
      const succeeded = result ? result.data.filter((c) => c.status === "succeeded" && !c.refunded) : [];
      paymentTotals[custId] = {
        totalCents: succeeded.reduce((sum, c) => sum + c.amount, 0),
        currency: succeeded[0]?.currency ?? "usd",
        count: succeeded.length,
      };
    });

    const localUsers = customerIds.length > 0
      ? await db.select({
          id: usersTable.id, email: usersTable.email,
          chesscomUsername: usersTable.chesscomUsername, firstName: usersTable.firstName,
          stripeCustomerId: usersTable.stripeCustomerId,
        }).from(usersTable).where(inArray(usersTable.stripeCustomerId, customerIds))
      : [];
    const localByCustomerId: Record<string, typeof localUsers[number]> = {};
    for (const u of localUsers) if (u.stripeCustomerId) localByCustomerId[u.stripeCustomerId] = u;

    const subscribers = customerIds
      .map((custId) => {
        const sub = subsByCustomer[custId];
        const local = localByCustomerId[custId];
        const payments = paymentTotals[custId];
        return {
          ...sub,
          totalPaidCents: payments.totalCents,
          paidCurrency: payments.currency,
          paymentCount: payments.count,
          linkedToLocalAccount: !!local,
          localUserId: local?.id ?? null,
          localEmail: local?.email ?? null,
          localChesscomUsername: local?.chesscomUsername ?? null,
          localFirstName: local?.firstName ?? null,
        };
      })
      .sort((a, b) => b.created - a.created);

    res.json({ subscribers });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch subscribers from Stripe", details: err.message });
  }
});

// SEO articles -- these were missing entirely, which is why manual
// generation was silently failing (the frontend panel calls these exact
// paths, but nothing on the backend answered them until now).
// Every pro user's unique referral code (auto-generated when their
// subscription first went active), with how many people signed up
// through it and how many of those went Pro themselves. Separate from
// the per-user drill-down in /admin/users/:userId -- this is the
// all-codes-at-once view.
router.get("/admin/referral-codes", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const codedUsers = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        chesscomUsername: usersTable.chesscomUsername,
        inviteCode: usersTable.inviteCode,
      })
      .from(usersTable)
      .where(isNotNull(usersTable.inviteCode));

    if (codedUsers.length === 0) {
      res.json({ codes: [] });
      return;
    }

    const referrerIds = codedUsers.map((u) => u.id);
    const conversions = await db
      .select({
        referrerUserId: referralConversionsTable.referrerUserId,
        status: referralConversionsTable.status,
      })
      .from(referralConversionsTable)
      .where(inArray(referralConversionsTable.referrerUserId, referrerIds));

    const statsByReferrer: Record<string, { referred: number; converted: number }> = {};
    for (const c of conversions) {
      if (!statsByReferrer[c.referrerUserId]) statsByReferrer[c.referrerUserId] = { referred: 0, converted: 0 };
      statsByReferrer[c.referrerUserId].referred++;
      if (c.status === "converted") statsByReferrer[c.referrerUserId].converted++;
    }

    const codes = codedUsers
      .map((u) => ({
        userId: u.id,
        email: u.email,
        displayName: u.firstName || u.chesscomUsername || u.email || "Unknown",
        inviteCode: u.inviteCode,
        referred: statsByReferrer[u.id]?.referred ?? 0,
        converted: statsByReferrer[u.id]?.converted ?? 0,
      }))
      .sort((a, b) => b.converted - a.converted || b.referred - a.referred);

    res.json({ codes });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch referral codes", details: err.message });
  }
});

// Individual referred users -- not just aggregate counts. Each row is
// one signup, with who referred them, when they signed up, and whether
// they've converted to a paid subscription. This is the drill-down view
// behind the referral codes summary, and what powers selecting specific
// referred users to email directly.
router.get("/admin/referral-signups", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const conversions = await db.select().from(referralConversionsTable).orderBy(desc(referralConversionsTable.createdAt));
    if (conversions.length === 0) {
      res.json({ signups: [] });
      return;
    }

    const referrerIds = [...new Set(conversions.map(c => c.referrerUserId))];
    const referredIds = [...new Set(conversions.map(c => c.referredUserId))];
    const allIds = [...new Set([...referrerIds, ...referredIds])];

    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        chesscomUsername: usersTable.chesscomUsername,
        inviteCode: usersTable.inviteCode,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, allIds));
    const usersById = new Map<string, typeof users[number]>(users.map(u => [u.id, u]));

    const signups = conversions.map(c => {
      const referrer = usersById.get(c.referrerUserId);
      const referred = usersById.get(c.referredUserId);
      return {
        conversionId: c.id,
        referrerName: referrer?.firstName || referrer?.chesscomUsername || referrer?.email || "Unknown",
        referrerInviteCode: referrer?.inviteCode ?? null,
        referredUserId: c.referredUserId,
        referredEmail: referred?.email ?? null,
        referredName: referred?.firstName || referred?.chesscomUsername || referred?.email || "Unknown",
        signedUpAt: referred?.createdAt ?? c.createdAt,
        status: c.status,
        convertedAt: c.convertedAt,
        commissionOwedCents: c.commissionOwedCents,
        commissionPaidAt: c.commissionPaidAt,
      };
    });

    res.json({ signups });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch referral signups", details: err.message });
  }
});

router.get("/admin/seo-articles", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const articles = await db
      .select()
      .from(seoArticlesTable)
      .orderBy(desc(seoArticlesTable.createdAt))
      .limit(200);
    res.json({ articles });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch SEO articles", details: err.message });
  }
});

router.post("/admin/seo-articles/generate", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await generateNextSeoArticle();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ published: false, reason: err.message || "Generation failed" });
  }
});

router.patch("/admin/seo-articles/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { published } = req.body as { published?: boolean };
    if (typeof published !== "boolean") {
      res.status(400).json({ error: "published (boolean) is required" });
      return;
    }
    await db.update(seoArticlesTable).set({ published }).where(eq(seoArticlesTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update article", details: err.message });
  }
});

router.delete("/admin/seo-articles/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await db.delete(seoArticlesTable).where(eq(seoArticlesTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete article", details: err.message });
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
    res.status(500).json({ error: "Failed to clear analysis cache", details: err.message });
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

router.post("/admin/users/:userId/premium-override", requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const { enabled } = req.body as { enabled: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) required" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ isPremiumOverride: enabled })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, email: usersTable.email, isPremiumOverride: usersTable.isPremiumOverride });

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update premium access", details: err.message });
  }
});

router.get("/admin/users/:userId/usage", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const [user] = await db.select().from(usersTable).where(sql`${usersTable.id} = ${userId}`);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const username = user.chesscomUsername;

    const [gamesImported] = await db.select({ count: count() }).from(gamesTable)
      .where(username ? eq(gamesTable.username, username) : sql`false`);

    const [gamesReviewed] = await db.select({ count: count() }).from(gamesTable)
      .where(and(
        username ? eq(gamesTable.username, username) : sql`false`,
        isNotNull(gamesTable.reviewData)
      ));

    const [scoutJobs] = await db.select({ count: count() }).from(backgroundJobsTable)
      .where(sql`${backgroundJobsTable.userId} = ${userId} AND ${backgroundJobsTable.type} = 'analysis'`);

    const [puzzlesSolved] = await db.select({ count: count() }).from(puzzleAttemptsTable)
      .where(sql`${puzzleAttemptsTable.userId} = ${userId} AND ${puzzleAttemptsTable.solved} = true`);

    const [puzzlesFailed] = await db.select({ count: count() }).from(puzzleAttemptsTable)
      .where(sql`${puzzleAttemptsTable.userId} = ${userId} AND ${puzzleAttemptsTable.solved} = false`);

    const [coursesGenerated] = await db.select({ count: count() }).from(coursesTable)
      .where(username ? eq(coursesTable.username, username) : sql`false`);

    const [lessonsCompleted] = await db.select({ count: count() }).from(lessonsTable)
      .where(eq(lessonsTable.completed, "true"));

    const [pageViewCount] = await db.select({ count: count() }).from(pageViewsTable)
      .where(sql`${pageViewsTable.userId} = ${userId}`);

    const recentPages = await db.select({ path: pageViewsTable.path, createdAt: pageViewsTable.createdAt })
      .from(pageViewsTable)
      .where(sql`${pageViewsTable.userId} = ${userId}`)
      .orderBy(sql`${pageViewsTable.createdAt} DESC`)
      .limit(20);

    const referrals = await db.select({
      id: referralConversionsTable.id,
      referredUserId: referralConversionsTable.referredUserId,
      status: referralConversionsTable.status,
      createdAt: referralConversionsTable.createdAt,
      convertedAt: referralConversionsTable.convertedAt,
    }).from(referralConversionsTable)
      .where(sql`${referralConversionsTable.referrerUserId} = ${userId}`);

    const referredUsers = referrals.length > 0
      ? await db.select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, chesscomUsername: usersTable.chesscomUsername })
        .from(usersTable)
        .where(inArray(usersTable.id, referrals.map(r => r.referredUserId)))
      : [];

    const referralDetails = referrals.map(r => {
      const referred = referredUsers.find(u => u.id === r.referredUserId);
      return {
        ...r,
        referredEmail: referred?.email ?? null,
        referredName: referred?.firstName ?? referred?.chesscomUsername ?? null,
      };
    });

    let payments: { totalPaidCents: number; currency: string; count: number; history: { id: string; amountCents: number; currency: string; status: string; description: string | null; createdAt: string }[] } | null = null;
    let paymentsError: string | null = null;
    const hasStripeCustomer = !!user.stripeCustomerId;
    if (user.stripeCustomerId) {
      try {
        const stripe = await getUncachableStripeClient();
        const charges = await stripe.charges.list({ customer: user.stripeCustomerId, limit: 100 });
        const succeeded = charges.data.filter((c) => c.status === "succeeded" && !c.refunded);
        payments = {
          totalPaidCents: succeeded.reduce((sum, c) => sum + c.amount, 0),
          currency: succeeded[0]?.currency ?? "usd",
          count: succeeded.length,
          history: succeeded
            .sort((a, b) => b.created - a.created)
            .map((c) => ({
              id: c.id,
              amountCents: c.amount,
              currency: c.currency,
              status: c.status,
              description: c.description,
              createdAt: new Date(c.created * 1000).toISOString(),
            })),
        };
      } catch (stripeErr: any) {
        console.error("Failed to fetch Stripe payment history:", stripeErr.message);
        paymentsError = stripeErr.message;
      }
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        chesscomUsername: user.chesscomUsername,
        inviteCode: user.inviteCode,
        referredByUserId: user.referredByUserId,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        isPremiumOverride: user.isPremiumOverride,
      },
      usage: {
        gamesImported: gamesImported.count,
        gamesReviewed: gamesReviewed.count,
        opponentsScouted: scoutJobs.count,
        puzzlesSolved: puzzlesSolved.count,
        puzzlesFailed: puzzlesFailed.count,
        coursesGenerated: coursesGenerated.count,
        lessonsCompleted: lessonsCompleted.count,
        pageViews: pageViewCount.count,
      },
      payments,
      paymentsError,
      hasStripeCustomer,
      recentPages,
      referrals: referralDetails,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch user usage", details: err.message });
  }
});

router.post("/admin/fix-chess960", requireAdmin, async (req: Request, res: Response) => {
  try {
    const allGames = await db.select({ id: gamesTable.id, pgn: gamesTable.pgn }).from(gamesTable);

    let fixed = 0;
    let cleared = 0;

    for (const game of allGames) {
      const fenMatch = game.pgn.match(/\[FEN "([^"]+)"\]/);
      if (!fenMatch) continue;

      const originalFen = fenMatch[1];
      const parts = originalFen.split(' ');
      if (parts.length < 3) continue;

      const castling = parts[2];
      if (!castling || castling === '-' || /^[KQkq]+$/.test(castling)) continue;
      if (!/^[A-Ha-h]+$/.test(castling)) continue;

      const ranks = parts[0].split('/');
      const whiteBack = ranks[7] || '';
      const blackBack = ranks[0] || '';

      function findKingFile(rank: string): number {
        let file = 0;
        for (const ch of rank) {
          if (ch >= '1' && ch <= '8') file += parseInt(ch);
          else { if (ch === 'K' || ch === 'k') return file; file++; }
        }
        return -1;
      }
      function findPieceFile(rank: string, piece: string): number[] {
        const files: number[] = [];
        let file = 0;
        for (const ch of rank) {
          if (ch >= '1' && ch <= '8') file += parseInt(ch);
          else { if (ch === piece) files.push(file); file++; }
        }
        return files;
      }

      let newCastling = '';
      const whiteKing = findKingFile(whiteBack);
      const blackKing = findKingFile(blackBack);
      const whiteRooks = findPieceFile(whiteBack, 'R');
      const blackRooks = findPieceFile(blackBack, 'r');

      for (const c of castling) {
        const upper = c.toUpperCase();
        const fileIdx = upper.charCodeAt(0) - 65;
        if (c === upper) {
          if (whiteRooks.includes(fileIdx)) {
            newCastling += fileIdx > whiteKing ? 'K' : 'Q';
          }
        } else {
          if (blackRooks.includes(fileIdx)) {
            newCastling += fileIdx > blackKing ? 'k' : 'q';
          }
        }
      }

      parts[2] = newCastling || '-';
      const normalizedFen = parts.join(' ');
      const newPgn = game.pgn.replace(`[FEN "${originalFen}"]`, `[FEN "${normalizedFen}"]`);

      if (newPgn !== game.pgn) {
        await db.update(gamesTable)
          .set({ pgn: newPgn, reviewData: null })
          .where(eq(gamesTable.id, game.id));
        fixed++;
        cleared++;
      }
    }

    res.json({ success: true, totalGames: allGames.length, fixedPgns: fixed, clearedReviews: cleared });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fix Chess960 games", details: err.message });
  }
});

const CAMPAIGN_THEMES: Record<string, string> = {
  "Free Trial": "Emphasize the free 3-day trial with no credit card required. Urgency: try it risk-free today.",
  "Opponent Scouting": "Focus on the killer feature: smart scouting reports that expose any opponent's weaknesses before you play them.",
  "Game Analysis": "Highlight move-by-move game analysis with Stockfish 17 engine + coaching explanations for every move.",
  "New Feature": "Announce exciting new features. Be enthusiastic and specific about what's new.",
  "General Promo": "Broad promotional message covering the full value proposition: scouting, analysis, courses, bots, and progress tracking.",
  "ELO Improvement": "Target players who want to gain rating points. Emphasize how personalized training and weakness detection leads to measurable improvement.",
};

router.post("/admin/marketing/generate", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { theme, customNote } = req.body as { theme: string; customNote?: string };
    if (!theme || !CAMPAIGN_THEMES[theme]) {
      res.status(400).json({ error: "Invalid theme. Choose from: " + Object.keys(CAMPAIGN_THEMES).join(", ") });
      return;
    }

    const openai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    });

    const prompt = `You are a marketing copywriter for ChessScout.net — a smart chess coaching app.

PRODUCT INFO:
- Smart opponent scouting reports that expose weaknesses of any Chess.com or Lichess player
- Move-by-move game analysis powered by Stockfish 17 + coaching
- Personalized training courses generated from your actual mistakes
- 8 practice bots from 400 to 2000 ELO
- ELO tracking across Chess.com and Lichess
- 3-day free trial, $4/month or $1/week, no credit card required
- Website: https://chessscout.net

CAMPAIGN THEME: ${theme}
THEME GUIDANCE: ${CAMPAIGN_THEMES[theme]}
${customNote ? `ADDITIONAL NOTE: ${customNote}` : ""}

Generate ad copy for each of these platforms. Each post should feel native to the platform — match its tone, length conventions, and culture:

1. **Twitter/X** — Max 280 chars. Punchy, use 2-3 relevant hashtags. Chess community tone.
2. **Reddit (r/chess)** — Title + body. Informative, not salesy. Value-first. Reddit hates obvious ads, so frame as a useful tool discovery. 150-250 words body. Target experienced players.
3. **Reddit (r/chessbeginners)** — Title + body. Beginner-friendly tone, encouraging. Frame as a learning tool that helps newer players improve. 150-250 words body. Avoid jargon.
4. **Facebook** — Engaging, slightly longer. 100-150 words. Include a call to action.
5. **Instagram** — Caption style, 100-150 words. Use relevant emojis and 5-8 hashtags at the end.
6. **Discord** — Casual, community-friendly. 80-120 words. Like sharing something cool with friends.
7. **Forum/General** — Neutral, informative tone. 100-200 words. Could be posted on chess forums, Quora, etc.

Return VALID JSON only:
{
  "posts": [
    { "platform": "Twitter/X", "content": "..." },
    { "platform": "Reddit (r/chess)", "title": "...", "content": "..." },
    { "platform": "Reddit (r/chessbeginners)", "title": "...", "content": "..." },
    { "platform": "Facebook", "content": "..." },
    { "platform": "Instagram", "content": "..." },
    { "platform": "Discord", "content": "..." },
    { "platform": "Forum/General", "content": "..." }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    if (!parsed.posts || !Array.isArray(parsed.posts)) {
      res.status(500).json({ error: "Engine returned unexpected format" });
      return;
    }
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate marketing copy", details: err.message });
  }
});

router.post("/admin/courses/cleanup-sweep", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { verifyLesson, verifyLessonDrillEngine } = await import("../lib/puzzleVerifier");
    const useEngine = req.body?.useEngine !== false;
    const limit = Math.min(parseInt(String(req.body?.limit ?? "1000")), 5000);

    const lessons = await db
      .select()
      .from(lessonsTable)
      .where(eq(lessonsTable.archived, false))
      .limit(limit);

    let archived = 0;
    let passed = 0;
    const failedExamples: { id: number; reasons: string[] }[] = [];

    // Per-category aggregation: lesson belongs to a course; bucket by course.category.
    const courseCategoryById = new Map<number, string>();
    {
      const courses = await db.select({ id: coursesTable.id, category: coursesTable.category }).from(coursesTable);
      for (const c of courses) courseCategoryById.set(c.id, c.category ?? "uncategorized");
    }
    const byCategory = new Map<string, { passed: number; archived: number }>();
    const bumpCat = (cat: string, key: "passed" | "archived") => {
      const cur = byCategory.get(cat) ?? { passed: 0, archived: 0 };
      cur[key] += 1;
      byCategory.set(cat, cur);
    };

    for (const l of lessons) {
      const verdict = verifyLesson({
        id: l.id,
        examplePgn: l.examplePgn,
        fixExamplePgn: l.fixExamplePgn,
        drillFen: l.drillFen,
        drillExpectedMove: l.drillExpectedMove,
      });
      let engineFail: string[] = [];
      if (verdict.ok && useEngine && l.drillFen && l.drillExpectedMove) {
        const ev = await verifyLessonDrillEngine(l.drillFen, l.drillExpectedMove);
        if (!ev.ok) engineFail = ev.reasons;
      }
      const cat = courseCategoryById.get(l.courseId) ?? "uncategorized";
      if (verdict.ok && engineFail.length === 0) {
        passed++;
        bumpCat(cat, "passed");
      } else {
        archived++;
        bumpCat(cat, "archived");
        const reasons = verdict.ok ? engineFail : verdict.reasons;
        if (failedExamples.length < 25) failedExamples.push({ id: l.id, reasons });
        await db.update(lessonsTable).set({ archived: true }).where(eq(lessonsTable.id, l.id));
      }
    }
    const perCategory = [...byCategory.entries()].map(([category, v]) => {
      const total = v.passed + v.archived;
      return { category, passed: v.passed, archived: v.archived, passRate: total > 0 ? v.passed / total : 1 };
    });

    // Auto-archive courses whose lessons are all archived
    const allCourses = await db.select().from(coursesTable).where(eq(coursesTable.archived, false));
    let coursesArchived = 0;
    for (const c of allCourses) {
      const courseLessons = await db
        .select()
        .from(lessonsTable)
        .where(and(eq(lessonsTable.courseId, c.id), eq(lessonsTable.archived, false)));
      if (courseLessons.length === 0) {
        await db.update(coursesTable).set({ archived: true }).where(eq(coursesTable.id, c.id));
        coursesArchived++;
      }
    }

    res.json({
      scanned: lessons.length,
      passed,
      archived,
      coursesArchived,
      passRate: lessons.length > 0 ? passed / lessons.length : 1,
      perCategory,
      failedExamples,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/admin/courses/quality", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [totalRow] = await db.select({ c: count() }).from(lessonsTable);
    const [archivedRow] = await db.select({ c: count() }).from(lessonsTable).where(eq(lessonsTable.archived, true));
    const total = totalRow?.c ?? 0;
    const archived = archivedRow?.c ?? 0;
    res.json({ total, valid: total - archived, archived, passRate: total > 0 ? (total - archived) / total : 1 });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

// Coach alignment report — what fraction of recent reviewed-game move
// explanations passed reconciliation (engine-aligned) vs were replaced
// by the deterministic fallback. Useful for monitoring drift.
router.get("/admin/coach-alignment", requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"))));
    const rows = await db.select({ id: gamesTable.id, reviewData: gamesTable.reviewData })
      .from(gamesTable)
      .where(isNotNull(gamesTable.reviewData))
      .orderBy(sql`${gamesTable.id} DESC`)
      .limit(limit);

    let totalMoves = 0;
    let aligned = 0;
    let fallback = 0;
    let unmarked = 0;
    const perGame: Array<{ gameId: number; moves: number; aligned: number; fallback: number; pct: number | null }> = [];

    for (const row of rows) {
      const data = row.reviewData as { moves?: Array<{ coachStatus?: string }> } | null;
      const moves = Array.isArray(data?.moves) ? data!.moves : [];
      let a = 0, f = 0, u = 0;
      for (const m of moves) {
        if (m.coachStatus === "engine-aligned") a++;
        else if (m.coachStatus === "fallback") f++;
        else u++;
      }
      totalMoves += moves.length;
      aligned += a;
      fallback += f;
      unmarked += u;
      perGame.push({
        gameId: row.id,
        moves: moves.length,
        aligned: a,
        fallback: f,
        pct: a + f > 0 ? Math.round(100 * a / (a + f)) : null,
      });
    }

    res.json({
      gamesScanned: rows.length,
      totalMoves,
      aligned,
      fallback,
      unmarked,
      alignmentPct: aligned + fallback > 0 ? Math.round(100 * aligned / (aligned + fallback)) : null,
      perGame,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to compute alignment report", details: err?.message });
  }
});

router.get("/public/stats", async (_req: Request, res: Response) => {
  try {
    const [usersResult] = await db.select({ count: count() }).from(usersTable);
    const [gamesImportedResult] = await db.select({ count: count() }).from(gamesTable);
    const [gamesResult] = await db.select({ count: count() }).from(gamesTable)
      .where(eq(gamesTable.analyzed, true));
    const [scoutsResult] = await db.select({ count: count() }).from(backgroundJobsTable)
      .where(and(eq(backgroundJobsTable.type, "scout"), eq(backgroundJobsTable.status, "done")));

    res.json({
      users: usersResult.count,
      gamesImported: gamesImportedResult.count,
      gamesAnalyzed: gamesResult.count,
      opponentsScouted: scoutsResult.count,
    });
  } catch {
    res.json({ users: 0, gamesImported: 0, gamesAnalyzed: 0, opponentsScouted: 0 });
  }
});

// List every affiliate (isAffiliate = true) with their commission
// totals -- owed-and-unpaid, and lifetime-paid. Totals are summed from
// the commissionOwedCents snapshots already stored on each conversion
// at the time it converted, not recomputed live.
router.get("/admin/affiliates", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const affiliates = await db.select().from(usersTable).where(eq(usersTable.isAffiliate, true));

    const results = await Promise.all(affiliates.map(async (a) => {
      const conversions = await db.select().from(referralConversionsTable)
        .where(and(
          eq(referralConversionsTable.referrerUserId, a.id),
          isNotNull(referralConversionsTable.commissionOwedCents),
        ));
      const adjustments = await db.select().from(affiliateAdjustmentsTable)
        .where(eq(affiliateAdjustmentsTable.affiliateUserId, a.id))
        .orderBy(desc(affiliateAdjustmentsTable.createdAt));
      let owedUnpaidCents = 0;
      let paidCents = 0;
      for (const c of conversions) {
        const cents = c.commissionOwedCents ?? 0;
        if (c.commissionPaidAt) paidCents += cents;
        else owedUnpaidCents += cents;
      }
      for (const adj of adjustments) {
        if (adj.paidAt) paidCents += adj.cents;
        else owedUnpaidCents += adj.cents;
      }
      return {
        id: a.id,
        email: a.email,
        firstName: a.firstName,
        lastName: a.lastName,
        inviteCode: a.inviteCode,
        affiliateCommissionTiers: a.affiliateCommissionTiers,
        affiliateProgramEndsAt: a.affiliateProgramEndsAt,
        stripeConnectAccountId: a.stripeConnectAccountId,
        conversionCount: conversions.length,
        adjustments,
        owedUnpaidCents,
        paidCents,
      };
    }));

    res.json({ affiliates: results });
  } catch (err) {
    res.status(500).json({ error: "Failed to load affiliates" });
  }
});

// Mark a user as an affiliate (or update their existing terms). Body:
// { email?: string, isAffiliate: boolean, commissionTiers?: [{maxDaysSinceSignup, cents}], programEndsAt?: string | null }
// :userId in the URL can be a real user ID, or the literal string
// "by-email" with an email in the body -- lets the admin panel take a
// plain email input instead of needing a full user-search UI for what
// is, for now, a single affiliate.
router.post("/admin/affiliates/:userId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const { email, isAffiliate, commissionTiers, programEndsAt } = req.body ?? {};

    let target;
    if (userId === "by-email") {
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }
      [target] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    } else {
      [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    }
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await db.update(usersTable).set({
      isAffiliate: !!isAffiliate,
      affiliateCommissionTiers: Array.isArray(commissionTiers) ? commissionTiers : null,
      affiliateProgramEndsAt: programEndsAt ? new Date(programEndsAt) : null,
    }).where(eq(usersTable.id, target.id));

    res.json({ success: true, userId: target.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to update affiliate" });
  }
});

// Trigger an actual Stripe transfer for an affiliate's outstanding
// unpaid commission. Requires the affiliate to have completed Stripe
// Connect onboarding (stripeConnectAccountId set and payouts enabled).
// Marks every unpaid conversion as paid only after the transfer
// succeeds, so a failed transfer never gets marked paid.
router.post("/admin/affiliates/:userId/payout", requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const [affiliate] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!affiliate?.isAffiliate) {
      res.status(404).json({ error: "Not an affiliate" });
      return;
    }
    if (!affiliate.stripeConnectAccountId) {
      res.status(400).json({ error: "Affiliate hasn't connected a payout account yet" });
      return;
    }

    const unpaid = await db.select().from(referralConversionsTable)
      .where(and(
        eq(referralConversionsTable.referrerUserId, userId),
        isNotNull(referralConversionsTable.commissionOwedCents),
      ));
    const unpaidConversions = unpaid.filter(c => !c.commissionPaidAt && (c.commissionOwedCents ?? 0) > 0);

    const unpaidAdjustments = (await db.select().from(affiliateAdjustmentsTable)
      .where(eq(affiliateAdjustmentsTable.affiliateUserId, userId)))
      .filter(a => !a.paidAt);

    const totalCents =
      unpaidConversions.reduce((sum, c) => sum + (c.commissionOwedCents ?? 0), 0) +
      unpaidAdjustments.reduce((sum, a) => sum + a.cents, 0);

    if (totalCents <= 0) {
      res.status(400).json({ error: "Nothing owed" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const transfer = await stripe.transfers.create({
      amount: totalCents,
      currency: "usd",
      destination: affiliate.stripeConnectAccountId,
      description: `Affiliate commission payout — ${unpaidConversions.length} conversion(s), ${unpaidAdjustments.length} adjustment(s)`,
    });

    const now = new Date();
    await Promise.all([
      ...unpaidConversions.map(c =>
        db.update(referralConversionsTable).set({ commissionPaidAt: now }).where(eq(referralConversionsTable.id, c.id))
      ),
      ...unpaidAdjustments.map(a =>
        db.update(affiliateAdjustmentsTable).set({ paidAt: now }).where(eq(affiliateAdjustmentsTable.id, a.id))
      ),
    ]);

    res.json({ success: true, transferId: transfer.id, amountCents: totalCents, conversionsPaid: unpaidConversions.length, adjustmentsPaid: unpaidAdjustments.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Payout failed" });
  }
});

// Add a manual commission adjustment for an affiliate -- a correction
// or bonus that isn't tied to a specific auto-calculated conversion.
// Positive cents adds to what's owed, negative subtracts. Body:
// { cents: number, reason?: string }
router.post("/admin/affiliates/:userId/adjustments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const { cents, reason } = req.body ?? {};
    if (!Number.isFinite(cents) || cents === 0) {
      res.status(400).json({ error: "cents must be a non-zero number" });
      return;
    }
    const [affiliate] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!affiliate?.isAffiliate) {
      res.status(404).json({ error: "Not an affiliate" });
      return;
    }
    await db.insert(affiliateAdjustmentsTable).values({
      affiliateUserId: userId,
      cents: Math.round(cents),
      reason: reason || null,
      createdByUserId: req.user?.id ?? null,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to add adjustment" });
  }
});

export default router;
