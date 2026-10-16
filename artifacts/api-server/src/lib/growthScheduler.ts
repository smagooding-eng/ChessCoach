import cron from 'node-cron';
import { db, usersTable, emailDripLogTable, gamesTable, backgroundJobsTable } from "@workspace/db";
import { eq, and, lte, isNotNull, isNull, sql, count } from "drizzle-orm";
import { sendEmail } from "./email";
import { emailLayout, emailP, emailFeatures, emailPanel, escapeHtml, EMAIL } from "./emailTheme";
import { logger } from "./logger";
import { randomUUID } from "crypto";
import { runBulkReviewJob } from "../routes/games";
import { generateNextSeoArticle } from "./seoContentEngine";

let schedulerStarted = false;

export function startGrowthScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  cron.schedule('0 */6 * * *', async () => {
    logger.info('[growth] Email drip check');
    await runEmailDrips();
  });

  // DISABLED: this was silently burning real OpenAI cost with zero user
  // involvement -- every 15 minutes, up to 5 random accounts with any
  // unreviewed games would get a full OpenAI-powered review triggered
  // automatically. Confirmed via runAutoReviewTick -> runBulkReviewJob ->
  // reviewOneGame -> reviewFullGame, the same OpenAI-billed function used
  // for real user-requested reviews. With no meaningful user base yet,
  // this convenience feature's cost wasn't buying anything -- it just ran
  // continuously regardless of whether anyone was using the site.
  // Re-enable only with a real cost cap (e.g. a daily/monthly OpenAI
  // spend ceiling checked before each tick) once there's an actual
  // active user base where the convenience is worth paying for.
  //
  // cron.schedule('*/15 * * * *', async () => {
  //   logger.info('[review] Auto bulk-review tick');
  //   await runAutoReviewTick();
  // });

  // Weekly, not more often — this is a slow, compounding content channel.
  // Publishing one genuinely substantive article a week beats a burst of
  // thin ones, both for actual usefulness and for how Google treats it.
  cron.schedule('0 9 * * 1', async () => {
    logger.info('[seo] Weekly article generation tick');
    try {
      const result = await generateNextSeoArticle();
      if (result.published) {
        logger.info({ slug: result.slug }, '[seo] Article published');
      } else {
        logger.info({ reason: result.reason }, '[seo] No article published this week');
      }
    } catch (err: unknown) {
      logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[seo] Weekly generation failed');
    }
  });

  logger.info('[growth] Scheduler started (drips: every 6h, auto-review: DISABLED -- was an unbounded OpenAI cost source, seo: weekly Mondays 9am)');
}

// Gentle, throttled background review: each tick picks a small number of
// users who have unreviewed games and reviews just a few games each, rather
// than trying to clear entire backlogs at once. This is deliberately slow —
// Stockfish review is CPU-heavy on a single shared vCPU (Render free tier),
// and this competes with live site traffic. The much larger "Review All"
// button (games.ts) is for when a user explicitly wants to trade some
// temporary slowness for speed.
const AUTO_REVIEW_USERS_PER_TICK = 5;
const AUTO_REVIEW_GAMES_PER_USER_PER_TICK = 2;

async function runAutoReviewTick() {
  try {
    // Postgres rejects ORDER BY RANDOM() directly on a SELECT DISTINCT
    // query -- "for SELECT DISTINCT, ORDER BY expressions must appear in
    // select list" -- which is exactly what this was doing before,
    // meaning this tick has been failing on every single run. Wrapping
    // the distinct selection in a subquery and randomizing the outer
    // query sidesteps that restriction.
    const distinctUsers = db
      .selectDistinct({ userId: gamesTable.userId })
      .from(gamesTable)
      .where(and(isNull(gamesTable.reviewData), isNotNull(gamesTable.userId)))
      .as('distinct_users');

    const candidates = await db
      .select({ userId: distinctUsers.userId })
      .from(distinctUsers)
      .orderBy(sql`RANDOM()`)
      .limit(AUTO_REVIEW_USERS_PER_TICK);

    for (const { userId } of candidates) {
      if (!userId) continue;
      try {
        const jobId = randomUUID();
        await db.insert(backgroundJobsTable).values({
          id: jobId,
          userId,
          type: 'bulk_review',
          status: 'pending',
        });
        await runBulkReviewJob(userId, jobId, logger, AUTO_REVIEW_GAMES_PER_USER_PER_TICK);
      } catch (err: unknown) {
        logger.error({ userId, error: err instanceof Error ? err.message : 'Unknown' }, '[review] Auto bulk-review failed for user');
      }
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[review] Auto bulk-review tick failed');
  }
}

async function runEmailDrips() {
  try {
    await sendTrialExpiryReminders();
    await sendWinBackEmails();
    await sendUnreviewedGamesReminder();
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[growth] Drip error');
  }
}

async function sendTrialExpiryReminders() {
  try {
    const now = new Date();
    const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const threeDaysPlus12h = new Date(threeDaysAgo.getTime() + 12 * 60 * 60 * 1000);

    const trialUsers = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      createdAt: usersTable.createdAt,
    }).from(usersTable)
      .where(and(
        isNotNull(usersTable.email),
        sql`${usersTable.stripeSubscriptionId} IS NULL`,
        sql`${usersTable.createdAt} <= ${threeDaysPlus12h.toISOString()}`,
        sql`${usersTable.createdAt} >= ${threeDaysAgo.toISOString()}`
      ));

    for (const user of trialUsers) {
      if (!user.email) continue;

      const [alreadySent] = await db.select().from(emailDripLogTable)
        .where(and(
          eq(emailDripLogTable.userId, user.id),
          eq(emailDripLogTable.dripType, 'trial_expiry')
        ));

      if (alreadySent) continue;

      try {
        await sendEmail({
          to: user.email,
          subject: "See what you're missing on the free plan ♟️",
          html: trialExpiryHtml(user.firstName),
        });
        await db.insert(emailDripLogTable).values({ userId: user.id, dripType: 'trial_expiry' });
        logger.info({ userId: user.id }, '[drip] Trial expiry reminder sent');
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Trial expiry send failed');
      }
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Trial expiry check failed');
  }
}

async function sendWinBackEmails() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const inactiveUsers = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
    }).from(usersTable)
      .where(and(
        isNotNull(usersTable.email),
        sql`${usersTable.lastLoginAt} IS NOT NULL`,
        sql`${usersTable.lastLoginAt} < ${sevenDaysAgo.toISOString()}`
      ));

    for (const user of inactiveUsers) {
      if (!user.email) continue;

      const [alreadySent] = await db.select().from(emailDripLogTable)
        .where(and(
          eq(emailDripLogTable.userId, user.id),
          eq(emailDripLogTable.dripType, 'win_back')
        ));

      if (alreadySent) continue;

      try {
        await sendEmail({
          to: user.email,
          subject: "♟️ Your opponents are getting scouted... are you?",
          html: winBackHtml(user.firstName),
        });
        await db.insert(emailDripLogTable).values({ userId: user.id, dripType: 'win_back' });
        logger.info({ userId: user.id }, '[drip] Win-back email sent');
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Win-back send failed');
      }
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Win-back check failed');
  }
}

// More specific than the generic win-back email: only fires for users who
// have real, unreviewed games sitting in their account — a concrete reason
// to come back rather than a generic "we miss you." Uses a slightly
// shorter inactivity window than win-back since it's a lower-pressure,
// more useful nudge.
const MIN_UNREVIEWED_GAMES_FOR_REMINDER = 3;

async function sendUnreviewedGamesReminder() {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const inactiveUsers = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      chesscomUsername: usersTable.chesscomUsername,
      lichessUsername: usersTable.lichessUsername,
    }).from(usersTable)
      .where(and(
        isNotNull(usersTable.email),
        sql`${usersTable.lastLoginAt} IS NOT NULL`,
        sql`${usersTable.lastLoginAt} < ${threeDaysAgo.toISOString()}`
      ));

    for (const user of inactiveUsers) {
      if (!user.email) continue;
      const username = (user.chesscomUsername || user.lichessUsername || '').toLowerCase();
      if (!username) continue;

      const [alreadySent] = await db.select().from(emailDripLogTable)
        .where(and(
          eq(emailDripLogTable.userId, user.id),
          eq(emailDripLogTable.dripType, 'unreviewed_games')
        ));
      if (alreadySent) continue;

      const [{ count: unreviewedCount }] = await db.select({ count: count() })
        .from(gamesTable)
        .where(and(eq(gamesTable.username, username), isNull(gamesTable.reviewData)));

      if (unreviewedCount < MIN_UNREVIEWED_GAMES_FOR_REMINDER) continue;

      try {
        await sendEmail({
          to: user.email,
          subject: `♟️ You have ${unreviewedCount} unreviewed games waiting`,
          html: unreviewedGamesHtml(user.firstName, unreviewedCount),
        });
        await db.insert(emailDripLogTable).values({ userId: user.id, dripType: 'unreviewed_games' });
        logger.info({ userId: user.id, unreviewedCount }, '[drip] Unreviewed games reminder sent');
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Unreviewed games send failed');
      }
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Unreviewed games check failed');
  }
}

function unreviewedGamesHtml(name: string | null, gameCount: number): string {
  const greeting = name ? `Hey ${escapeHtml(name)}` : 'Hey there';
  return emailLayout({
    preheader: `${gameCount} of your games are waiting for your coach's review.`,
    badge: 'Waiting for review',
    title: `${greeting}, ${gameCount} of your games haven't been reviewed yet`,
    body: [
      emailPanel(`<div style="color:${EMAIL.text};font-size:34px;font-weight:900;margin:0 0 2px;">${gameCount}</div><div style="color:${EMAIL.muted};font-size:13px;">unreviewed game${gameCount === 1 ? '' : 's'} with mistakes we haven't broken down yet</div>`),
      emailP("That's real patterns you might be repeating without knowing it. Get the breakdown before your next game.", { center: true, mb: 22 }),
    ].join(''),
    cta: { label: 'Review my games &rarr;', href: `${EMAIL.site}/games` },
    footerNote: "You're getting this because it's been a few days since your last visit. We only send this once.",
  });
}

function trialExpiryHtml(name: string | null): string {
  const greeting = name ? `Hey ${escapeHtml(name)}` : 'Hey there';
  return emailLayout({
    preheader: "Here's what Pro unlocks beyond the free plan.",
    badge: 'Upgrade available',
    title: `${greeting}, here's what you're missing on the free plan`,
    body: [
      emailP("You joined ChessScout.net a few days ago. Here's the full picture of what Pro unlocks beyond the free tier:", { mb: 6 }),
      emailFeatures([
        { glyph: '&#9820;', title: 'Deep opponent scouting reports', text: 'Free plan includes 1 basic scout. Pro is unlimited with full weakness analysis.' },
        { glyph: '&#9819;', title: 'Unlimited game analysis', text: 'Deep analysis of every move, not just what your reviewed games already show.' },
        { glyph: '&#9822;', title: 'Personalized training courses', text: 'Built around your actual weaknesses, not generic lessons.' },
        { glyph: '&#9821;', title: 'Unlimited puzzles', text: 'Free plan is 5 a day. Pro removes the cap.' },
      ]),
      emailP(`Pro is <strong style="color:${EMAIL.text};">$5/month</strong> or <strong style="color:${EMAIL.text};">$55/year</strong>. Cancel anytime.`, { center: true, mb: 22 }),
    ].join(''),
    cta: { label: 'Upgrade to Pro &rarr;', href: `${EMAIL.site}/subscription` },
  });
}

function winBackHtml(name: string | null): string {
  const greeting = name ? `We miss you, ${escapeHtml(name)}!` : 'We miss you!';
  return emailLayout({
    preheader: 'Your next game, your next opponent and your next review are waiting.',
    badge: "It's been a week",
    title: greeting,
    body: [
      emailP("It's been a week since your last visit to ChessScout.net. Here's what's waiting for you:", { mb: 6 }),
      emailFeatures([
        { glyph: '&#9822;', title: 'Play', text: 'Jump into a live or daily game, or pick up a bot game where you left it.' },
        { glyph: '&#9820;', title: 'Scout', text: 'Check your next opponent\'s openings and habits before you sit down.' },
        { glyph: '&#9819;', title: 'Improve', text: 'Get your recent games reviewed and see what to play instead.' },
        { glyph: '&#9821;', title: 'Train', text: 'A new set of daily puzzles to sharpen your tactics.' },
      ]),
    ].join(''),
    cta: { label: 'Get back in the game &rarr;', href: EMAIL.site },
  });
}
