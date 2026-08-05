import cron from 'node-cron';
import { db, growthCampaignsTable, usersTable, emailDripLogTable, gamesTable, backgroundJobsTable } from "@workspace/db";
import { eq, and, lte, isNotNull, isNull, sql } from "drizzle-orm";
import { executePostForCampaign, computeNextRun } from "./growthService";
import { sendEmail } from "./email";
import { logger } from "./logger";
import { randomUUID } from "crypto";
import { runBulkReviewJob } from "../routes/games";

let schedulerStarted = false;

export function startGrowthScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  cron.schedule('*/15 * * * *', async () => {
    logger.info('[growth] Campaign scheduler tick');
    await runDueCampaigns();
  });

  cron.schedule('0 */6 * * *', async () => {
    logger.info('[growth] Email drip check');
    await runEmailDrips();
  });

  cron.schedule('*/15 * * * *', async () => {
    logger.info('[review] Auto bulk-review tick');
    await runAutoReviewTick();
  });

  logger.info('[growth] Scheduler started (campaigns: every 15min, drips: every 6h, auto-review: every 15min)');
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
    const candidates = await db
      .selectDistinct({ userId: gamesTable.userId })
      .from(gamesTable)
      .where(and(isNull(gamesTable.reviewData), isNotNull(gamesTable.userId)))
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

async function runDueCampaigns() {
  try {
    const now = new Date();
    const dueCampaigns = await db.select().from(growthCampaignsTable)
      .where(and(
        eq(growthCampaignsTable.status, 'active'),
        lte(growthCampaignsTable.nextRunAt, now)
      ));

    for (const campaign of dueCampaigns) {
      logger.info({ campaignId: campaign.id, name: campaign.name }, '[growth] Running campaign');
      try {
        const platforms = campaign.platforms as string[];
        await executePostForCampaign(campaign.id, platforms, campaign.theme, campaign.customNote);

        const nextRun = computeNextRun(campaign.frequency);
        await db.update(growthCampaignsTable)
          .set({ lastRunAt: now, nextRunAt: nextRun })
          .where(eq(growthCampaignsTable.id, campaign.id));

        logger.info({ campaignId: campaign.id, nextRun }, '[growth] Campaign completed');
      } catch (err: unknown) {
        logger.error({ campaignId: campaign.id, error: err instanceof Error ? err.message : 'Unknown' }, '[growth] Campaign failed');
      }
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[growth] Scheduler error');
  }
}

async function runEmailDrips() {
  try {
    await sendTrialExpiryReminders();
    await sendWinBackEmails();
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
          subject: "⏰ Your ChessScout trial ends soon — don't lose your edge!",
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

function trialExpiryHtml(name: string | null): string {
  const n = name || 'there';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#262421;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#81b64c;font-size:24px;margin:0;">♜ ChessScout.net</h1></div>
  <div style="background:#302e2b;border-radius:12px;padding:32px;margin-bottom:24px;">
    <h2 style="color:#e8e6e3;font-size:20px;margin:0 0 16px;">Hey ${n}, your free trial is ending soon!</h2>
    <p style="color:#9e9b98;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Your 3-day ChessScout trial expires in less than 12 hours. After that, you'll lose access to:
    </p>
    <ul style="color:#e8e6e3;font-size:14px;line-height:2;padding-left:20px;margin:0 0 20px;">
      <li>Deep opponent scouting reports</li>
      <li>Unlimited game analysis with Stockfish 17</li>
      <li>Personalized training courses</li>
      <li>Practice bots from 400 to 2000 ELO</li>
    </ul>
    <p style="color:#9e9b98;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Lock in your edge for just <strong style="color:#81b64c;">$4/month</strong> or <strong style="color:#81b64c;">$1/week</strong>. Cancel anytime.
    </p>
    <div style="text-align:center;">
      <a href="https://chessscout.net" style="display:inline-block;background:#81b64c;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Keep My Edge →</a>
    </div>
  </div>
  <p style="color:#666;font-size:12px;text-align:center;">ChessScout.net — Know your opponent's weaknesses.</p>
</div></body></html>`;
}

function winBackHtml(name: string | null): string {
  const n = name || 'there';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#262421;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#81b64c;font-size:24px;margin:0;">♜ ChessScout.net</h1></div>
  <div style="background:#302e2b;border-radius:12px;padding:32px;margin-bottom:24px;">
    <h2 style="color:#e8e6e3;font-size:20px;margin:0 0 16px;">We miss you, ${n}!</h2>
    <p style="color:#9e9b98;font-size:15px;line-height:1.6;margin:0 0 20px;">
      It's been a week since your last visit to ChessScout. While you've been away, other players have been scouting their opponents and climbing the ranks.
    </p>
    <p style="color:#9e9b98;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Here's what you're missing:
    </p>
    <ul style="color:#e8e6e3;font-size:14px;line-height:2;padding-left:20px;margin:0 0 20px;">
      <li>New analysis features for deeper insights</li>
      <li>Fresh daily puzzles to sharpen your tactics</li>
      <li>Updated scouting reports for your opponents</li>
    </ul>
    <div style="text-align:center;">
      <a href="https://chessscout.net" style="display:inline-block;background:#81b64c;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Get Back in the Game →</a>
    </div>
  </div>
  <p style="color:#666;font-size:12px;text-align:center;">ChessScout.net — Know your opponent's weaknesses.</p>
</div></body></html>`;
}
