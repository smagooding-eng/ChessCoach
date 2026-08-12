import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, pageViewsTable, gamesTable, weaknessesTable, coursesTable, lessonsTable, backgroundJobsTable, referralConversionsTable } from "@workspace/db";
import { sql, count, gte, countDistinct, inArray, eq, and, isNotNull } from "drizzle-orm";
import { puzzleAttemptsTable } from "@workspace/db";
import { sessionsTable } from "@workspace/db";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { ADMIN_EMAILS } from "../lib/auth";
import OpenAI from "openai";

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

    // Admin accounts' own page views shouldn't inflate visitor/traffic
    // counts — testing across desktop, mobile, and the installed app all
    // count as separate localStorage-based visitor IDs otherwise.
    const allUsersForAdminCheck = await db
      .select({ id: usersTable.id, email: usersTable.email, isAdmin: usersTable.isAdmin })
      .from(usersTable);
    const adminIdList = allUsersForAdminCheck
      .filter((u) => u.isAdmin || (u.email && ADMIN_EMAILS.includes(u.email.toLowerCase())))
      .map((u) => u.id);
    const excludeAdmin = adminIdList.length > 0
      ? sql`(${pageViewsTable.userId} IS NULL OR ${pageViewsTable.userId} NOT IN (${sql.join(adminIdList.map((id) => sql`${id}`), sql`, `)}))`
      : sql`TRUE`;

    const [totalUsersResult] = await db
      .select({ count: count() })
      .from(usersTable);

    const [todayUsersResult] = await db
      .select({ count: count() })
      .from(usersTable)
      .where(gte(usersTable.createdAt, todayStart));

    const [totalViewsResult] = await db
      .select({ count: count() })
      .from(pageViewsTable)
      .where(excludeAdmin);

    const [todayViewsResult] = await db
      .select({ count: count() })
      .from(pageViewsTable)
      .where(and(gte(pageViewsTable.createdAt, todayStart), excludeAdmin));

    const [totalUniqueResult] = await db
      .select({ count: countDistinct(pageViewsTable.visitorId) })
      .from(pageViewsTable)
      .where(excludeAdmin);

    const [todayUniqueResult] = await db
      .select({ count: countDistinct(pageViewsTable.visitorId) })
      .from(pageViewsTable)
      .where(and(gte(pageViewsTable.createdAt, todayStart), excludeAdmin));

    // Cross-check against IP address — localStorage-based visitor IDs
    // fragment across browsers/devices/incognito for the same real person,
    // so this tends to run lower and is often the more trustworthy number.
    const [totalUniqueByIpResult] = await db
      .select({ count: countDistinct(pageViewsTable.ipAddress) })
      .from(pageViewsTable)
      .where(excludeAdmin);

    const [todayUniqueByIpResult] = await db
      .select({ count: countDistinct(pageViewsTable.ipAddress) })
      .from(pageViewsTable)
      .where(and(gte(pageViewsTable.createdAt, todayStart), excludeAdmin));

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
      db.select({ count: count() }).from(pageViewsTable).where(and(eq(pageViewsTable.path, '/scan'), excludeAdmin)),
    ]);

    const topPagesRows = await db
      .select({
        path: pageViewsTable.path,
        views: count(),
        uniqueVisitors: countDistinct(pageViewsTable.visitorId),
        uniqueByIp: countDistinct(pageViewsTable.ipAddress),
      })
      .from(pageViewsTable)
      .where(excludeAdmin)
      .groupBy(pageViewsTable.path)
      .orderBy(sql`count(*) desc`)
      .limit(20);

    res.json({
      pageViews: { total: totalViewsResult.count, today: todayViewsResult.count },
      uniqueVisitors: {
        total: totalUniqueResult.count,
        today: todayUniqueResult.count,
        totalByIp: totalUniqueByIpResult.count,
        todayByIp: todayUniqueByIpResult.count,
      },
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
        uniqueByIp: r.uniqueByIp,
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
      .select({
        id: usersTable.id,
        email: usersTable.email,
        stripeCustomerId: usersTable.stripeCustomerId,
        chesscomUsername: usersTable.chesscomUsername,
        lichessUsername: usersTable.lichessUsername,
      })
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

    // Usernames tied to these accounts — games/weaknesses/courses are keyed
    // by username (string), not userId, since they mirror imported
    // chess.com/lichess data rather than the internal user record.
    const usernames = Array.from(new Set(
      usersToDelete.flatMap(u => [u.chesscomUsername, u.lichessUsername].filter((s): s is string => !!s))
        .map(s => s.toLowerCase())
    ));

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
    await db.delete(referralConversionsTable).where(
      sql`${referralConversionsTable.referrerUserId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
          OR ${referralConversionsTable.referredUserId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`
    );

    if (usernames.length > 0) {
      // Lessons must go before courses — lessonsTable.courseId is a real DB
      // foreign key to coursesTable.id with no cascade, so deleting a course
      // that still has lessons referencing it would fail outright.
      const coursesToDelete = await db
        .select({ id: coursesTable.id })
        .from(coursesTable)
        .where(inArray(coursesTable.username, usernames));
      const courseIds = coursesToDelete.map(c => c.id);
      if (courseIds.length > 0) {
        await db.delete(lessonsTable).where(inArray(lessonsTable.courseId, courseIds));
      }
      await db.delete(coursesTable).where(inArray(coursesTable.username, usernames));
      await db.delete(weaknessesTable).where(inArray(weaknessesTable.username, usernames));
      await db.delete(gamesTable).where(inArray(gamesTable.userId, ids));
    }

    // sessionsTable isn't cleaned up here — it has no userId column (the
    // association lives inside an opaque JSONB session blob), and stale
    // sessions already expire naturally via their `expire` timestamp, so a
    // deleted user's session simply stops authenticating rather than
    // lingering as a real orphaned-data concern.

    await db.delete(usersTable).where(inArray(usersTable.id, ids));

    res.json({ success: true, deleted: ids.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete users", details: err.message });
  }
});

router.get("/admin/users/:userId/usage", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const [user] = await db.select().from(usersTable).where(sql`${usersTable.id} = ${userId}`);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const username = user.chesscomUsername?.toLowerCase();

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
      apiKey: process.env.OPENAI_API_KEY,
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
      model: "gpt-4o-mini",
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
    const [gamesResult] = await db.select({ count: count() }).from(gamesTable)
      .where(isNotNull(gamesTable.reviewData));
    const [scoutsResult] = await db.select({ count: count() }).from(backgroundJobsTable)
      .where(and(eq(backgroundJobsTable.type, "scout"), eq(backgroundJobsTable.status, "done")));

    res.json({
      users: usersResult.count,
      gamesAnalyzed: gamesResult.count,
      opponentsScouted: scoutsResult.count,
    });
  } catch {
    res.json({ users: 0, gamesAnalyzed: 0, opponentsScouted: 0 });
  }
});

export default router;
