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
  "Opponent Scouting": "Focus on the killer feature: AI scouting reports that expose any opponent's weaknesses before you play them.",
  "Game Analysis": "Highlight move-by-move game analysis with Stockfish 17 engine + AI coaching explanations for every move.",
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

    const prompt = `You are a marketing copywriter for ChessScout.net — an AI-powered chess coaching app.

PRODUCT INFO:
- AI opponent scouting reports that expose weaknesses of any Chess.com or Lichess player
- Move-by-move game analysis powered by Stockfish 17 + AI coaching
- Personalized training courses generated from your actual mistakes
- 8 practice AI bots from 400 to 2000 ELO
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
      res.status(500).json({ error: "AI returned unexpected format" });
      return;
    }
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate marketing copy", details: err.message });
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
