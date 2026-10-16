import cron from 'node-cron';
import { db, usersTable, emailDripLogTable, gamesTable, backgroundJobsTable } from "@workspace/db";
import { eq, and, lte, isNotNull, isNull, sql, count } from "drizzle-orm";
import { sendEmail } from "./email";
import { emailLayout, emailP, emailFeatures, emailPanel, escapeHtml, EMAIL, EMAIL_FONT } from "./emailTheme";
import { unsubscribeHeaders, unsubscribeUrl } from "./emailPrefs";
import { sendPushToUser, isPushConfigured } from "./pushNotifications";
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

  // Push reminders once a day at 18:00 UTC (2pm New York, 11am California,
  // 7pm London) so nobody's phone buzzes in the middle of the night.
  cron.schedule('0 18 * * *', async () => {
    logger.info('[growth] Push drip check');
    await runPushDrips();
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
    await sendEngagedUpgradeEmails();
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[growth] Drip error');
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────

const DRIP_BATCH_LIMIT = 60;          // per drip type per run (runs every 6h)
const DRIP_SEND_GAP_MS = 600;         // stay under Resend's rate limit
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

function rowsOf<T>(r: any): T[] { return Array.isArray(r) ? r : (r?.rows ?? []); }

// When the player last actually used the site. Sessions last weeks, so
// last_login_at alone makes active players look gone; page views and the
// app-open timestamp catch them.
const LAST_ACTIVITY = sql`GREATEST(
  COALESCE(u.last_login_at, 'epoch'::timestamptz),
  COALESCE(u.last_active_at, 'epoch'::timestamptz),
  COALESCE((SELECT MAX(pv.created_at) FROM page_views pv WHERE pv.user_id = u.id), 'epoch'::timestamptz)
)`;

async function logDrip(userId: string, dripType: string): Promise<void> {
  await db.insert(emailDripLogTable).values({ userId, dripType }).onConflictDoNothing();
}

async function sendOptionalEmail(user: { id: string; email: string }, subject: string, html: string): Promise<void> {
  await sendEmail({ to: user.email, subject, html, headers: unsubscribeHeaders(user.id) });
}

function firstNameOf(name: string | null): string | null {
  const n = (name || '').trim().split(/\s+/)[0];
  return n ? n : null;
}

// ── Trial / free-plan nudge (3 days after signup, once) ─────────────────────

async function sendTrialExpiryReminders() {
  try {
    const candidates = rowsOf<{ id: string; email: string; first_name: string | null }>(await db.execute(sql`
      SELECT u.id, u.email, u.first_name FROM users u
      WHERE u.email IS NOT NULL
        AND u.email_opt_out = false
        AND u.stripe_subscription_id IS NULL
        AND u.is_premium_override = false
        AND u.created_at <= now() - interval '3 days'
        AND u.created_at >= now() - interval '3 days 12 hours'
        AND NOT EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'trial_expiry')
      LIMIT ${DRIP_BATCH_LIMIT}`));

    for (const user of candidates) {
      try {
        await sendOptionalEmail(user, "Here's what Pro adds to your ChessScout.net account", trialExpiryHtml(user.first_name, unsubscribeUrl(user.id)));
        await logDrip(user.id, 'trial_expiry');
        logger.info({ userId: user.id }, '[drip] Free-plan nudge sent');
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Free-plan nudge failed');
      }
      await pause(DRIP_SEND_GAP_MS);
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Free-plan nudge check failed');
  }
}

// ── Win-back ────────────────────────────────────────────────────────────────
// Two emails, each sent at most once per player:
//   win_back     after 7 days away: what's waiting for them right now
//                (their move in daily games, friend requests, messages,
//                games to review), built from their real account data.
//   win_back_30  after 30 days away, if the first one didn't bring them
//                back: what ChessScout.net offers now.
// Anyone who unsubscribed, or came back since, is skipped.

interface WinBackContext {
  yourMove: number;
  friendRequests: number;
  unreadMessages: number;
  unreviewedGames: number;
  rating: { label: string; value: number } | null;
  isPro: boolean;
  daysAway: number;
}

function timeControlLabel(id: string): string {
  const m = id.match(/^([a-z]+)_(\d+)_(\d+)$/i);
  if (!m) return id;
  const cat = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return `${cat} ${m[2]}+${m[3]}`;
}

async function loadWinBackContext(u: { id: string; chesscom_username: string | null; lichess_username: string | null; is_pro: boolean; last_activity: string | Date }): Promise<WinBackContext> {
  const [row] = rowsOf<{ your_move: string; friend_requests: string; unread_messages: string; tc: string | null; rating: number | null }>(await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM correspondence_games WHERE status = 'active' AND turn_user_id = ${u.id}) AS your_move,
      (SELECT COUNT(*) FROM friendships WHERE addressee_id = ${u.id} AND status = 'pending') AS friend_requests,
      (SELECT COUNT(*) FROM direct_messages WHERE recipient_id = ${u.id} AND read_at IS NULL) AS unread_messages,
      r.time_control AS tc, r.rating AS rating
    FROM (SELECT 1) one
    LEFT JOIN LATERAL (
      SELECT time_control, rating FROM user_live_ratings
      WHERE user_id = ${u.id} AND games_played > 0
      ORDER BY games_played DESC LIMIT 1
    ) r ON true`));

  let unreviewedGames = 0;
  const username = (u.chesscom_username || u.lichess_username || '').toLowerCase();
  if (username) {
    const [{ count: c }] = await db.select({ count: count() }).from(gamesTable)
      .where(and(eq(gamesTable.username, username), isNull(gamesTable.reviewData)));
    unreviewedGames = Number(c) || 0;
  }

  const last = new Date(u.last_activity).getTime();
  return {
    yourMove: Number(row?.your_move) || 0,
    friendRequests: Number(row?.friend_requests) || 0,
    unreadMessages: Number(row?.unread_messages) || 0,
    unreviewedGames,
    rating: row?.tc && row.rating != null ? { label: timeControlLabel(row.tc), value: Math.round(Number(row.rating)) } : null,
    isPro: !!u.is_pro,
    daysAway: Math.max(1, Math.floor((Date.now() - last) / 86_400_000)),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function winBackSubject(name: string | null, c: WinBackContext): string {
  if (c.yourMove > 0) return `It's your move in ${plural(c.yourMove, 'daily game')} ♟`;
  if (c.friendRequests > 0) return `${plural(c.friendRequests, 'friend request')} waiting for you on ChessScout.net`;
  if (c.unreadMessages > 0) return `You have ${plural(c.unreadMessages, 'unread message')} on ChessScout.net`;
  if (c.unreviewedGames >= 3) return `Your coach has ${c.unreviewedGames} games ready to review`;
  return name ? `Your board is set up, ${name} ♟` : 'Your board is set up ♟';
}

/** The "waiting for you" rows: only real, non-zero items. */
function waitingPanel(c: WinBackContext): string {
  const items: { n: number; label: string; href: string; cta: string }[] = [];
  if (c.yourMove > 0) items.push({ n: c.yourMove, label: `daily game${c.yourMove === 1 ? '' : 's'} waiting on your move`, href: `${EMAIL.site}/daily`, cta: 'Move' });
  if (c.friendRequests > 0) items.push({ n: c.friendRequests, label: `friend request${c.friendRequests === 1 ? '' : 's'}`, href: `${EMAIL.site}/friends`, cta: 'View' });
  if (c.unreadMessages > 0) items.push({ n: c.unreadMessages, label: `unread message${c.unreadMessages === 1 ? '' : 's'}`, href: `${EMAIL.site}/friends`, cta: 'Read' });
  if (c.unreviewedGames > 0) items.push({ n: c.unreviewedGames, label: `game${c.unreviewedGames === 1 ? '' : 's'} your coach hasn't reviewed yet`, href: `${EMAIL.site}/games`, cta: 'Review' });
  if (!items.length && !c.rating) return '';
  const rows = items.map(i => `<tr>
    <td width="46" valign="middle" style="padding:9px 0;font-family:${EMAIL_FONT};font-size:22px;font-weight:900;color:${EMAIL.text};">${i.n}</td>
    <td valign="middle" style="padding:9px 8px 9px 0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.4;color:${EMAIL.muted};">${i.label}</td>
    <td align="right" valign="middle" style="padding:9px 0;font-family:${EMAIL_FONT};"><a href="${i.href}" style="color:${EMAIL.green};font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap;">${i.cta} &rarr;</a></td>
  </tr>`).join('');
  const rating = c.rating
    ? `<div style="font-family:${EMAIL_FONT};font-size:13px;color:${EMAIL.muted};${items.length ? `border-top:1px solid ${EMAIL.border};margin-top:6px;padding-top:12px;` : ''}">Your ${c.rating.label} rating: <strong style="color:${EMAIL.text};">${c.rating.value}</strong></div>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr>
<td bgcolor="${EMAIL.cardInner}" style="background:${EMAIL.cardInner};border:1px solid ${EMAIL.border};border-radius:14px;padding:12px 18px 14px;">
  ${items.length ? `<div style="font-family:${EMAIL_FONT};font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${EMAIL.muted};margin:2px 0 2px;">Waiting for you</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>` : ''}
  ${rating}
</td></tr></table>`;
}

function secondaryLinks(): string {
  const a = (href: string, label: string) => `<a href="${EMAIL.site}${href}" style="color:${EMAIL.green};text-decoration:none;font-weight:700;">${label}</a>`;
  return `<p style="margin:14px 0 0;text-align:center;font-family:${EMAIL_FONT};font-size:13px;color:${EMAIL.faint};">${a('/opponents', 'Scout an opponent')} &nbsp;·&nbsp; ${a('/puzzles', 'Puzzles')} &nbsp;·&nbsp; ${a('/games', 'My games')}</p>`;
}

export function winBackHtml(name: string | null, c: WinBackContext, unsubUrl: string): string {
  const safeName = name ? escapeHtml(name) : null;
  const cta = c.yourMove > 0 ? { label: 'Make your move &rarr;', href: `${EMAIL.site}/daily` }
    : c.friendRequests > 0 ? { label: 'See your friend requests &rarr;', href: `${EMAIL.site}/friends` }
    : { label: 'Play a game &rarr;', href: `${EMAIL.site}/play` };
  return emailLayout({
    preheader: c.yourMove > 0 ? 'Your opponent is waiting on your move.' : 'Pick up where you left off: play, scout and get your games reviewed.',
    badge: `${c.daysAway} days away`,
    title: safeName ? `Your board is set up, ${safeName}` : 'Your board is set up',
    subtitle: "Here's what's waiting for you on ChessScout.net.",
    body: [
      waitingPanel(c),
      emailP('Pick up where you left off:', { mb: 6 }),
      emailFeatures([
        { glyph: '&#9822;', title: 'Play', text: 'Start a live game in seconds, or warm up against a bot at your level.' },
        { glyph: '&#9820;', title: 'Scout', text: "See your next opponent's openings and habits before you sit down." },
        { glyph: '&#9819;', title: 'Improve', text: 'Get your recent games reviewed: the key moments and what to play instead.' },
        { glyph: '&#9821;', title: 'Train', text: "Today's puzzles are ready." },
      ]),
    ].join(''),
    cta,
    afterCta: secondaryLinks(),
    footerNote: "You're getting this because you haven't visited ChessScout.net in a while. We only send this once.",
    unsubscribeUrl: unsubUrl,
  });
}

export function winBack30Html(name: string | null, c: WinBackContext, unsubUrl: string): string {
  const safeName = name ? escapeHtml(name) : null;
  return emailLayout({
    preheader: 'Live and daily games, coach reviews, opponent scouting, friends and tournaments.',
    badge: "What's new",
    title: safeName ? `A lot has changed, ${safeName}` : 'A lot has changed',
    subtitle: "Here's what ChessScout.net looks like now.",
    body: [
      waitingPanel(c),
      emailFeatures([
        { glyph: '&#9822;', title: 'Live and daily games', text: 'Play real people at the time control you like, with a rating that tracks your progress.' },
        { glyph: '&#9819;', title: 'Your coach reviews every game', text: 'Each game broken down move by move, with the key moments and what to play instead.' },
        { glyph: '&#9820;', title: 'Scout any opponent', text: 'Openings, habits and weak spots of any Chess.com or Lichess player, before you face them.' },
        { glyph: '&#9821;', title: 'Friends, challenges and tournaments', text: 'Add friends, send a challenge link, and play in arena tournaments.' },
      ]),
      c.isPro ? '' : emailP(`Playing is free. Pro is <strong style="color:${EMAIL.text};">$5/month</strong> for unlimited game analysis, full scouting reports and courses built from your games. Cancel anytime.`, { center: true, size: 13, mb: 22 }),
    ].join(''),
    cta: { label: 'Come take a look &rarr;', href: `${EMAIL.site}/play` },
    afterCta: secondaryLinks(),
    footerNote: "You're getting this because you haven't visited ChessScout.net in a while. We won't send another one of these.",
    unsubscribeUrl: unsubUrl,
  });
}

type WinBackCandidate = { id: string; email: string; first_name: string | null; chesscom_username: string | null; lichess_username: string | null; is_pro: boolean; last_activity: string };

async function sendWinBackEmails() {
  try {
    const first = rowsOf<WinBackCandidate>(await db.execute(sql`
      SELECT * FROM (
        SELECT u.id, u.email, u.first_name, u.chesscom_username, u.lichess_username,
          (u.stripe_subscription_id IS NOT NULL OR u.is_premium_override) AS is_pro,
          ${LAST_ACTIVITY} AS last_activity
        FROM users u
        WHERE u.email IS NOT NULL AND u.email_opt_out = false
          AND NOT EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'win_back')
      ) x
      WHERE x.last_activity > 'epoch'::timestamptz AND x.last_activity < now() - interval '7 days'
      ORDER BY x.last_activity DESC
      LIMIT ${DRIP_BATCH_LIMIT}`));

    for (const user of first) {
      try {
        const c = await loadWinBackContext(user);
        const name = firstNameOf(user.first_name);
        await sendOptionalEmail(user, winBackSubject(name, c), winBackHtml(name, c, unsubscribeUrl(user.id)));
        await logDrip(user.id, 'win_back');
        logger.info({ userId: user.id, daysAway: c.daysAway }, '[drip] Win-back sent');
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Win-back send failed');
      }
      await pause(DRIP_SEND_GAP_MS);
    }

    // Second touch: still away 30+ days, at least 14 days after the first
    // email, and no visit since it went out.
    const second = rowsOf<WinBackCandidate>(await db.execute(sql`
      SELECT * FROM (
        SELECT u.id, u.email, u.first_name, u.chesscom_username, u.lichess_username,
          (u.stripe_subscription_id IS NOT NULL OR u.is_premium_override) AS is_pro,
          ${LAST_ACTIVITY} AS last_activity,
          (SELECT d.sent_at FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'win_back') AS first_sent
        FROM users u
        WHERE u.email IS NOT NULL AND u.email_opt_out = false
          AND NOT EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'win_back_30')
      ) x
      WHERE x.first_sent IS NOT NULL
        AND x.first_sent < now() - interval '14 days'
        AND x.last_activity > 'epoch'::timestamptz
        AND x.last_activity < x.first_sent
        AND x.last_activity < now() - interval '30 days'
      ORDER BY x.last_activity DESC
      LIMIT ${DRIP_BATCH_LIMIT}`));

    for (const user of second) {
      try {
        const c = await loadWinBackContext(user);
        const name = firstNameOf(user.first_name);
        await sendOptionalEmail(user, name ? `What's new on ChessScout.net, ${name}` : "What's new on ChessScout.net", winBack30Html(name, c, unsubscribeUrl(user.id)));
        await logDrip(user.id, 'win_back_30');
        logger.info({ userId: user.id, daysAway: c.daysAway }, '[drip] Win-back (30 days) sent');
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Win-back (30 days) send failed');
      }
      await pause(DRIP_SEND_GAP_MS);
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Win-back check failed');
  }
}

// ── Unreviewed games reminder ───────────────────────────────────────────────
// Only for players with real, unreviewed games sitting in their account,
// 3+ days away. Sent once.
const MIN_UNREVIEWED_GAMES_FOR_REMINDER = 3;

async function sendUnreviewedGamesReminder() {
  try {
    const candidates = rowsOf<{ id: string; email: string; first_name: string | null; chesscom_username: string | null; lichess_username: string | null }>(await db.execute(sql`
      SELECT * FROM (
        SELECT u.id, u.email, u.first_name, u.chesscom_username, u.lichess_username, ${LAST_ACTIVITY} AS last_activity
        FROM users u
        WHERE u.email IS NOT NULL AND u.email_opt_out = false
          AND (u.chesscom_username IS NOT NULL OR u.lichess_username IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'unreviewed_games')
      ) x
      WHERE x.last_activity > 'epoch'::timestamptz AND x.last_activity < now() - interval '3 days'
      LIMIT ${DRIP_BATCH_LIMIT}`));

    for (const user of candidates) {
      const username = (user.chesscom_username || user.lichess_username || '').toLowerCase();
      if (!username) continue;
      const [{ count: unreviewedCount }] = await db.select({ count: count() })
        .from(gamesTable)
        .where(and(eq(gamesTable.username, username), isNull(gamesTable.reviewData)));
      if (unreviewedCount < MIN_UNREVIEWED_GAMES_FOR_REMINDER) continue;

      try {
        await sendOptionalEmail(user, `♟️ You have ${unreviewedCount} unreviewed games waiting`, unreviewedGamesHtml(firstNameOf(user.first_name), unreviewedCount, unsubscribeUrl(user.id)));
        await logDrip(user.id, 'unreviewed_games');
        logger.info({ userId: user.id, unreviewedCount }, '[drip] Unreviewed games reminder sent');
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Unreviewed games send failed');
      }
      await pause(DRIP_SEND_GAP_MS);
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Unreviewed games check failed');
  }
}

function unreviewedGamesHtml(name: string | null, gameCount: number, unsubUrl: string): string {
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
    unsubscribeUrl: unsubUrl,
  });
}

function trialExpiryHtml(name: string | null, unsubUrl: string): string {
  const greeting = name ? `Hey ${escapeHtml(name)}` : 'Hey there';
  return emailLayout({
    preheader: "Here's what Pro adds beyond the free plan, for $5/month.",
    badge: 'Pro',
    title: `${greeting}, here's what Pro adds`,
    body: [
      emailP("You joined ChessScout.net a few days ago. Playing is free. Here's what Pro unlocks on top:", { mb: 6 }),
      emailFeatures([
        { glyph: '&#9820;', title: 'Deep opponent scouting reports', text: 'Free plan includes 1 basic scout. Pro is unlimited with full weakness analysis.' },
        { glyph: '&#9819;', title: 'Unlimited game analysis', text: 'Deep analysis of every move, not just what your reviewed games already show.' },
        { glyph: '&#9822;', title: 'Personalized training courses', text: 'Built around your actual weaknesses, not generic lessons.' },
        { glyph: '&#9821;', title: 'Unlimited puzzles', text: 'Free plan is 5 a day. Pro removes the cap.' },
      ]),
      emailP(`Pro is <strong style="color:${EMAIL.text};">$5/month</strong>. Cancel anytime.`, { center: true, mb: 22 }),
    ].join(''),
    cta: { label: 'See Pro &rarr;', href: `${EMAIL.site}/subscription` },
    unsubscribeUrl: unsubUrl,
  });
}

// ── Upgrade call for engaged free players ──────────────────────────────────
// Free players who used ChessScout.net in every one of the last 4 weeks
// (and have had their account at least that long) get one email asking
// them to go Pro, with their own numbers from the last 4 weeks.

// Every signal of real use in the last 28 days: app opens, page views,
// live games and bot games.
const RECENT_ACTIVITY = sql`(
  SELECT user_id, day::timestamptz AS t FROM user_activity_days WHERE day > (now() - interval '28 days')::date
  UNION ALL SELECT user_id, created_at FROM page_views WHERE user_id IS NOT NULL AND created_at > now() - interval '28 days'
  UNION ALL SELECT white_user_id, finished_at FROM live_games WHERE white_user_id IS NOT NULL AND finished_at > now() - interval '28 days'
  UNION ALL SELECT black_user_id, finished_at FROM live_games WHERE black_user_id IS NOT NULL AND finished_at > now() - interval '28 days'
  UNION ALL SELECT user_id, created_at FROM bot_results WHERE created_at > now() - interval '28 days'
)`;

type EngagedCandidate = { id: string; email: string | null; first_name: string | null; days_active: number };

async function engagedFreePlayers(channel: 'email' | 'push', dripType: string): Promise<EngagedCandidate[]> {
  const channelCond = channel === 'email'
    ? sql`u.email IS NOT NULL AND u.email_opt_out = false`
    : sql`EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id)
          AND (u.email IS NULL OR u.email_opt_out = true OR EXISTS (
            SELECT 1 FROM email_drip_log e WHERE e.user_id = u.id AND e.drip_type = 'pro_upgrade_engaged' AND e.sent_at < now() - interval '3 days'))`;
  return rowsOf<EngagedCandidate>(await db.execute(sql`
    WITH act AS ${RECENT_ACTIVITY},
    weeks AS (
      SELECT user_id,
        COUNT(DISTINCT FLOOR(EXTRACT(EPOCH FROM (now() - t)) / 604800)) AS w,
        COUNT(DISTINCT (t AT TIME ZONE 'UTC')::date) AS days_active
      FROM act GROUP BY user_id
    )
    SELECT u.id, u.email, u.first_name, weeks.days_active::int AS days_active
    FROM users u JOIN weeks ON weeks.user_id = u.id
    WHERE weeks.w >= 4
      AND u.created_at < now() - interval '28 days'
      AND u.stripe_subscription_id IS NULL
      AND u.is_premium_override = false
      AND ${channelCond}
      AND NOT EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = ${dripType})
    ORDER BY weeks.days_active DESC
    LIMIT ${DRIP_BATCH_LIMIT}`));
}

interface MonthStats { daysActive: number; liveGames: number; dailyGames: number; botGames: number; rating: { label: string; value: number } | null }

async function loadMonthStats(userId: string, daysActive: number): Promise<MonthStats> {
  const [r] = rowsOf<{ live: string; daily: string; bots: string; tc: string | null; rating: number | null }>(await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM live_games WHERE (white_user_id = ${userId} OR black_user_id = ${userId}) AND finished_at > now() - interval '28 days') AS live,
      (SELECT COUNT(*) FROM correspondence_games WHERE (white_user_id = ${userId} OR black_user_id = ${userId}) AND finished_at > now() - interval '28 days') AS daily,
      (SELECT COUNT(*) FROM bot_results WHERE user_id = ${userId} AND created_at > now() - interval '28 days') AS bots,
      r.time_control AS tc, r.rating AS rating
    FROM (SELECT 1) one
    LEFT JOIN LATERAL (
      SELECT time_control, rating FROM user_live_ratings
      WHERE user_id = ${userId} AND games_played > 0
      ORDER BY games_played DESC LIMIT 1
    ) r ON true`));
  return {
    daysActive,
    liveGames: Number(r?.live) || 0,
    dailyGames: Number(r?.daily) || 0,
    botGames: Number(r?.bots) || 0,
    rating: r?.tc && r.rating != null ? { label: timeControlLabel(r.tc), value: Math.round(Number(r.rating)) } : null,
  };
}

function statsPanel(s: MonthStats): string {
  const games = s.liveGames + s.dailyGames + s.botGames;
  const cells: { n: string; label: string }[] = [{ n: String(s.daysActive), label: s.daysActive === 1 ? 'day active' : 'days active' }];
  if (games > 0) cells.push({ n: String(games), label: games === 1 ? 'game played' : 'games played' });
  if (s.rating) cells.push({ n: String(s.rating.value), label: `${s.rating.label} rating` });
  const width = Math.floor(100 / cells.length);
  const tds = cells.map(c => `<td width="${width}%" align="center" valign="top" style="padding:6px 4px;font-family:${EMAIL_FONT};">
    <div style="font-size:28px;font-weight:900;color:${EMAIL.text};line-height:1.1;">${c.n}</div>
    <div style="font-size:12px;color:${EMAIL.muted};margin-top:4px;">${c.label}</div></td>`).join('');
  const breakdown = [
    s.liveGames ? plural(s.liveGames, 'live game') : '',
    s.dailyGames ? plural(s.dailyGames, 'daily game') : '',
    s.botGames ? plural(s.botGames, 'bot game') : '',
  ].filter(Boolean).join(' · ');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr>
<td bgcolor="${EMAIL.cardInner}" style="background:${EMAIL.cardInner};border:1px solid ${EMAIL.border};border-radius:14px;padding:14px 12px;">
  <div style="font-family:${EMAIL_FONT};font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${EMAIL.muted};text-align:center;margin:0 0 8px;">Your last 4 weeks</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${tds}</tr></table>
  ${breakdown ? `<div style="font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL.faint};text-align:center;margin-top:8px;">${breakdown}</div>` : ''}
</td></tr></table>`;
}

export function engagedUpgradeHtml(name: string | null, s: MonthStats, unsubUrl: string): string {
  const safeName = name ? escapeHtml(name) : null;
  return emailLayout({
    preheader: "You've been on ChessScout.net every week this month. Here's what Pro adds, for $5/month.",
    badge: 'Every week this month',
    title: safeName ? `You're putting in the work, ${safeName}` : "You're putting in the work",
    subtitle: "You've used ChessScout.net every week for the last month. Pro gets more out of that time.",
    body: [
      statsPanel(s),
      emailP('With Pro you also get:', { mb: 6 }),
      emailFeatures([
        { glyph: '&#9819;', title: 'Unlimited game analysis', text: 'Every game you play reviewed move by move, with the key moments and what to play instead.' },
        { glyph: '&#9820;', title: 'Full opponent scouting reports', text: 'Unlimited reports on any Chess.com or Lichess player: openings, habits and weak spots.' },
        { glyph: '&#9822;', title: 'Courses built from your games', text: 'Lessons aimed at the mistakes you actually make, not generic theory.' },
        { glyph: '&#9821;', title: 'Unlimited puzzles', text: 'No daily cap.' },
      ]),
      emailP(`Pro is <strong style="color:${EMAIL.text};">$5/month</strong>. Cancel anytime.`, { center: true, mb: 22 }),
    ].join(''),
    cta: { label: 'Upgrade to Pro &rarr;', href: `${EMAIL.site}/subscription` },
    footerNote: "You're getting this because you've been active on ChessScout.net every week this month. We only send this once.",
    unsubscribeUrl: unsubUrl,
  });
}

async function sendEngagedUpgradeEmails() {
  try {
    const candidates = await engagedFreePlayers('email', 'pro_upgrade_engaged');
    for (const user of candidates) {
      if (!user.email) continue;
      try {
        const stats = await loadMonthStats(user.id, Number(user.days_active) || 0);
        const name = firstNameOf(user.first_name);
        await sendOptionalEmail({ id: user.id, email: user.email },
          name ? `${name}, you've played every week this month` : "You've played every week this month",
          engagedUpgradeHtml(name, stats, unsubscribeUrl(user.id)));
        await logDrip(user.id, 'pro_upgrade_engaged');
        logger.info({ userId: user.id, daysActive: stats.daysActive }, '[drip] Engaged upgrade email sent');
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Engaged upgrade email failed');
      }
      await pause(DRIP_SEND_GAP_MS);
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[drip] Engaged upgrade check failed');
  }
}

// ── Push reminders ──────────────────────────────────────────────────────────
// The push versions of the email drips, each sent once, only to players who
// allowed notifications on a device (turning them off in Profile stops
// these too). They go out a little before the matching email so the two
// don't land together:
//   push_win_back      5+ days away: the most urgent real thing waiting
//   push_win_back_30   30+ days away, 14+ days after the first push, no visit since
//   push_pro_upgrade   engaged free players, 3+ days after the upgrade email

async function pushDrip(userId: string, dripType: string, payload: { title: string; body: string; url: string }): Promise<boolean> {
  const r = await sendPushToUser(userId, { ...payload, tag: `cs:drip:${dripType}` });
  if (r.sent > 0) { await logDrip(userId, dripType); return true; }
  return false;
}

function winBackPush(c: WinBackContext): { title: string; body: string; url: string } {
  if (c.yourMove > 0) return { title: "It's your move ♟", body: `${plural(c.yourMove, 'daily game')} ${c.yourMove === 1 ? 'is' : 'are'} waiting on your move.`, url: '/daily' };
  if (c.friendRequests > 0) return { title: 'New friend request', body: `You have ${plural(c.friendRequests, 'friend request')} waiting on ChessScout.net.`, url: '/friends' };
  if (c.unreadMessages > 0) return { title: 'You have messages', body: `${plural(c.unreadMessages, 'unread message')} waiting for you.`, url: '/friends' };
  if (c.unreviewedGames >= 3) return { title: 'Your games are ready for review', body: `Your coach has ${c.unreviewedGames} games to go through with you.`, url: '/games' };
  return { title: 'Your board is set up ♟', body: "Quick game? Live opponents and today's puzzles are waiting.", url: '/play' };
}

async function runPushDrips() {
  if (!isPushConfigured()) return;
  try {
    const hasPush = sql`EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id)`;

    const first = rowsOf<WinBackCandidate>(await db.execute(sql`
      SELECT * FROM (
        SELECT u.id, u.email, u.first_name, u.chesscom_username, u.lichess_username,
          (u.stripe_subscription_id IS NOT NULL OR u.is_premium_override) AS is_pro,
          ${LAST_ACTIVITY} AS last_activity
        FROM users u
        WHERE ${hasPush}
          AND NOT EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'push_win_back')
      ) x
      WHERE x.last_activity > 'epoch'::timestamptz AND x.last_activity < now() - interval '5 days'
      ORDER BY x.last_activity DESC
      LIMIT ${DRIP_BATCH_LIMIT}`));
    for (const user of first) {
      try {
        const c = await loadWinBackContext(user);
        if (await pushDrip(user.id, 'push_win_back', winBackPush(c))) logger.info({ userId: user.id }, '[push-drip] Win-back push sent');
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[push-drip] Win-back push failed');
      }
    }

    const second = rowsOf<{ id: string }>(await db.execute(sql`
      SELECT * FROM (
        SELECT u.id, ${LAST_ACTIVITY} AS last_activity,
          (SELECT d.sent_at FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'push_win_back') AS first_sent
        FROM users u
        WHERE ${hasPush}
          AND NOT EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'push_win_back_30')
      ) x
      WHERE x.first_sent IS NOT NULL AND x.first_sent < now() - interval '14 days'
        AND x.last_activity > 'epoch'::timestamptz AND x.last_activity < x.first_sent
        AND x.last_activity < now() - interval '30 days'
      LIMIT ${DRIP_BATCH_LIMIT}`));
    for (const user of second) {
      try {
        await pushDrip(user.id, 'push_win_back_30', { title: "What's new on ChessScout.net", body: 'Live and daily games, coach reviews, friends and tournaments. Come take a look.', url: '/play' });
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[push-drip] 30-day push failed');
      }
    }

    const engaged = await engagedFreePlayers('push', 'push_pro_upgrade');
    for (const user of engaged) {
      try {
        await pushDrip(user.id, 'push_pro_upgrade', {
          title: "You've played every week this month",
          body: 'Get unlimited game reviews, scouting reports and courses with Pro. $5/month, cancel anytime.',
          url: '/subscription',
        });
      } catch (err: unknown) {
        logger.error({ userId: user.id, error: err instanceof Error ? err.message : 'Unknown' }, '[push-drip] Upgrade push failed');
      }
    }
  } catch (err: unknown) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, '[push-drip] Push drip check failed');
  }
}
