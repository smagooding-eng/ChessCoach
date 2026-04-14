import cron from 'node-cron';
import { db, growthCampaignsTable, usersTable, emailDripLogTable } from "@workspace/db";
import { eq, and, lte, isNotNull, sql } from "drizzle-orm";
import { executePostForCampaign, computeNextRun } from "../routes/growth";
import { sendEmail } from "./email";
import { logger } from "./logger";

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

  logger.info('[growth] Scheduler started (campaigns: every 15min, drips: every 6h)');
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
      } catch (err: any) {
        logger.error({ campaignId: campaign.id, error: err.message }, '[growth] Campaign failed');
      }
    }
  } catch (err: any) {
    logger.error({ error: err.message }, '[growth] Scheduler error');
  }
}

async function runEmailDrips() {
  try {
    await sendTrialExpiryReminders();
    await sendWinBackEmails();
  } catch (err: any) {
    logger.error({ error: err.message }, '[growth] Drip error');
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
      } catch (err: any) {
        logger.error({ userId: user.id, error: err.message }, '[drip] Trial expiry send failed');
      }
    }
  } catch (err: any) {
    logger.error({ error: err.message }, '[drip] Trial expiry check failed');
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
      } catch (err: any) {
        logger.error({ userId: user.id, error: err.message }, '[drip] Win-back send failed');
      }
    }
  } catch (err: any) {
    logger.error({ error: err.message }, '[drip] Win-back check failed');
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
      <li>AI opponent scouting reports</li>
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
      <li>New AI analysis features for deeper insights</li>
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
