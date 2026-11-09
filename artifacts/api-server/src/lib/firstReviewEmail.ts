// "Your games are reviewed": the day-after-signup nudge. Most new members link
// their chess account on day one and then never come back, while their games
// are reviewed in the background. A day later (if they haven't been back), this
// tells them what the reviews found, from their own reviewed games only: how many
// were reviewed, their best game by accuracy, and the game with the most
// blunders, each linking straight to that review. Email once, plus one push if
// they turned notifications on. Opted-out and excluded accounts are skipped.
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { emailLayout, emailP, emailFeatures, escapeHtml, EMAIL } from "./emailTheme";
import { unsubscribeHeaders, unsubscribeUrl } from "./emailPrefs";
import { trackHtml } from "./emailTracking";
import { sendEmail } from "./email";
import { sendPushToUser, isPushConfigured } from "./pushNotifications";
import { logger } from "./logger";

const BATCH = 40;
const GAP_MS = 600;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

const LAST_ACTIVITY = sql`GREATEST(
  COALESCE(u.last_login_at, 'epoch'::timestamptz),
  COALESCE(u.last_active_at, 'epoch'::timestamptz),
  COALESCE((SELECT MAX(pv.created_at) FROM page_views pv WHERE pv.user_id = u.id), 'epoch'::timestamptz)
)`;

interface ReviewMove { color?: string; classification?: string }
interface Found { reviewed: number; total: number; latest: { id: number; opp: string } | null; best: { id: number; acc: number; opp: string } | null; worst: { id: number; blunders: number; opp: string } | null }

/** What their reviewed games show (their own side only). */
async function findings(userId: string): Promise<Found> {
  const games = rowsOf<{ id: number; username: string; white_username: string; black_username: string; review_data: unknown }>(await db.execute(sql`
    SELECT g.id, g.username, g.white_username, g.black_username, g.review_data
    FROM games g
    WHERE g.user_id = ${userId} AND g.review_data IS NOT NULL AND g.platform IS DISTINCT FROM 'bot'
    ORDER BY g.played_at DESC LIMIT 25`));
  const all = rowsOf<{ n: number; id: number | null; username: string | null; white_username: string | null; black_username: string | null }>(await db.execute(sql`
    SELECT (SELECT COUNT(*)::int FROM games WHERE user_id = ${userId} AND platform IS DISTINCT FROM 'bot') AS n,
      l.id, l.username, l.white_username, l.black_username
    FROM (SELECT 1) one LEFT JOIN LATERAL (
      SELECT id, username, white_username, black_username FROM games WHERE user_id = ${userId} AND platform IS DISTINCT FROM 'bot' ORDER BY played_at DESC LIMIT 1
    ) l ON true`))[0];
  const latest = all?.id ? { id: all.id, opp: (all.white_username ?? '').toLowerCase() === (all.username ?? '').toLowerCase() ? (all.black_username ?? '') : (all.white_username ?? '') } : null;
  let best: Found['best'] = null, worst: Found['worst'] = null;
  for (const g of games) {
    const me = g.username.toLowerCase();
    const white = g.white_username.toLowerCase() === me;
    if (!white && g.black_username.toLowerCase() !== me) continue;
    const rd = g.review_data as { moves?: ReviewMove[]; whiteAccuracy?: number; blackAccuracy?: number } | ReviewMove[] | null;
    const moves = Array.isArray(rd) ? rd : rd?.moves ?? [];
    const acc = !Array.isArray(rd) ? (white ? rd?.whiteAccuracy : rd?.blackAccuracy) : undefined;
    const opp = white ? g.black_username : g.white_username;
    if (typeof acc === 'number' && acc > 0 && (!best || acc > best.acc)) best = { id: g.id, acc: Math.round(acc), opp };
    const blunders = moves.filter((m) => m.color === (white ? 'white' : 'black') && (m.classification === 'blunder' || m.classification === 'missed_win')).length;
    if (blunders > 0 && (!worst || blunders > worst.blunders)) worst = { id: g.id, blunders, opp };
  }
  return { reviewed: games.length, total: all?.n ?? 0, latest, best, worst };
}

export function firstReviewHtml(name: string | null, f: Found, unsubUrl: string): string {
  const n = name ? escapeHtml(name) : null;
  if (!f.reviewed && f.latest) {
    return emailLayout({
      preheader: `Your ${f.total} games are in. See where your latest one was won or lost.`,
      badge: 'Your games are in',
      title: n ? `${n}, your ${f.total} games are ready to review` : `Your ${f.total} games are ready to review`,
      subtitle: 'Every move graded, with what to play instead.',
      body: emailP(`Start with your latest game${f.latest.opp ? `, against <strong style="color:${EMAIL.text};">${escapeHtml(f.latest.opp)}</strong>` : ''}. One tap and your coach goes through it move by move, then picks out the mistakes you make most.`, { center: true, mb: 22 }),
      cta: { label: 'Review my latest game &rarr;', href: `${EMAIL.site}/games/${f.latest.id}` },
      footerNote: "You're getting this because you joined ChessScout.net yesterday. We only send this once.",
      unsubscribeUrl: unsubUrl,
    });
  }
  const items: { glyph: string; title: string; text: string }[] = [];
  if (f.best) items.push({ glyph: '&#9819;', title: `Your best game: ${f.best.acc}% accuracy`, text: `Against ${escapeHtml(f.best.opp)}. <a href="${EMAIL.site}/games/${f.best.id}" style="color:${EMAIL.green};font-weight:700;">See what you did right &rarr;</a>` });
  if (f.worst) items.push({ glyph: '&#9822;', title: `${f.worst.blunders} blunder${f.worst.blunders > 1 ? 's' : ''} in one game`, text: `Against ${escapeHtml(f.worst.opp)}. <a href="${EMAIL.site}/games/${f.worst.id}" style="color:${EMAIL.green};font-weight:700;">See each one and the better move &rarr;</a>` });
  return emailLayout({
    preheader: `We reviewed ${f.reviewed} of your games. Here's what we found.`,
    badge: 'Your reviews are ready',
    title: n ? `${n}, we went through ${f.reviewed} of your games` : `We went through ${f.reviewed} of your games`,
    subtitle: 'Every move graded, with what to play instead.',
    body: [
      items.length ? emailFeatures(items) : '',
      emailP('Your coach also picks out the mistakes you make most, so you know what to work on.', { center: true, mb: 22 }),
    ].join(''),
    cta: { label: 'See your reviews &rarr;', href: `${EMAIL.site}/games` },
    footerNote: "You're getting this because you joined ChessScout.net yesterday. We only send this once.",
    unsubscribeUrl: unsubUrl,
  });
}

export async function runFirstReviewEmails(): Promise<void> {
  try {
    // Joined 20–72 hours ago, haven't been back for 16 hours, and have reviewed games.
    const rows = rowsOf<{ id: string; email: string | null; first_name: string | null; email_opt_out: boolean }>(await db.execute(sql`
      SELECT * FROM (
        SELECT u.id, u.email, u.first_name, u.email_opt_out, ${LAST_ACTIVITY} AS last_activity
        FROM users u
        WHERE u.created_at <= now() - interval '20 hours' AND u.created_at >= now() - interval '72 hours'
          AND u.id NOT IN (SELECT id FROM analytics_excluded_users)
          AND NOT EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'first_review_ready')
          AND EXISTS (SELECT 1 FROM games g WHERE g.user_id = u.id AND g.platform IS DISTINCT FROM 'bot')
      ) x
      WHERE x.last_activity < now() - interval '16 hours'
      LIMIT ${BATCH}`));
    for (const u of rows) {
      try {
        const f = await findings(u.id);
        if (!f.reviewed && !f.latest) continue;
        const name = (u.first_name || '').trim().split(/\s+/)[0] || null;
        let sent = false;
        if (u.email && !u.email_opt_out) {
          const subject = f.reviewed ? (name ? `${name}, your game reviews are ready` : 'Your game reviews are ready') : (name ? `${name}, your games are ready to review` : 'Your games are ready to review');
          const html = await trackHtml(firstReviewHtml(name, f, unsubscribeUrl(u.id)), { kind: 'drip', template: 'first_review_ready', email: u.email, userId: u.id, subject });
          await sendEmail({ to: u.email, subject, html, headers: unsubscribeHeaders(u.id) });
          sent = true;
        }
        // Push only in the daytime for the Americas and Europe (12:00–23:59 UTC).
        const hour = new Date().getUTCHours();
        if (isPushConfigured() && hour >= 12) {
          const title = f.reviewed ? 'Your game reviews are ready' : 'Your games are ready to review';
          const body = f.worst ? `${f.reviewed} games reviewed. One had ${f.worst.blunders} blunder${f.worst.blunders > 1 ? 's' : ''}: see the better moves.` : f.reviewed ? `${f.reviewed} of your games are reviewed, every move graded.` : `${f.total} games are in. See where your latest one was won or lost.`;
          const url = f.worst ? `/games/${f.worst.id}` : f.reviewed ? '/games' : `/games/${f.latest!.id}`;
          const r = await sendPushToUser(u.id, { title, body, url, tag: 'cs:drip:first_review_ready' }).catch(() => ({ sent: 0 }));
          if (r.sent > 0) sent = true;
        }
        // Logged even when nothing could be sent, so each person is only ever tried once.
        await db.execute(sql`INSERT INTO email_drip_log (user_id, drip_type) VALUES (${u.id}, 'first_review_ready') ON CONFLICT DO NOTHING`);
        if (sent) logger.info({ userId: u.id }, '[first-review] sent');
      } catch (err) {
        logger.error({ userId: u.id, err: err instanceof Error ? err.message : String(err) }, '[first-review] failed');
      }
      await pause(GAP_MS);
    }
  } catch (err) {
    logger.error({ err }, '[first-review] check failed');
  }
}

// ── "We reviewed your games" for every member (the catch-up reviewer) ────────
// Sent once per person, after the catch-up reviewer (routes/games.ts) has gone
// through their latest games. Every link goes straight to a reviewed game.
export function gamesReviewedHtml(name: string | null, f: Found, latestReviewedId: number, unsubUrl: string): string {
  const n = name ? escapeHtml(name) : null;
  const items: { glyph: string; title: string; text: string }[] = [];
  if (f.best) items.push({ glyph: '&#9819;', title: `Your best game: ${f.best.acc}% accuracy`, text: `Against ${escapeHtml(f.best.opp)}. <a href="${EMAIL.site}/games/${f.best.id}" style="color:${EMAIL.green};font-weight:700;">See what you did right &rarr;</a>` });
  if (f.worst) items.push({ glyph: '&#9822;', title: `${f.worst.blunders} blunder${f.worst.blunders > 1 ? 's' : ''} in one game`, text: `Against ${escapeHtml(f.worst.opp)}. <a href="${EMAIL.site}/games/${f.worst.id}" style="color:${EMAIL.green};font-weight:700;">See each one and the better move &rarr;</a>` });
  return emailLayout({
    preheader: `Your ${f.reviewed === 1 ? 'game is' : `${f.reviewed} latest games are`} reviewed, free. Every move graded.`,
    badge: 'Your reviews are ready',
    title: n ? `${n}, we reviewed your games` : 'We reviewed your games',
    subtitle: `${f.reviewed === 1 ? 'Your latest game' : `Your ${f.reviewed} latest games`}, every move graded by Stockfish, free.`,
    body: [
      items.length ? emailFeatures(items) : '',
      emailP('Each review shows your mistakes, the better move, and the moments you got right. Your coach also picks out what you get wrong most, so you know what to work on.', { center: true, mb: 22 }),
    ].join(''),
    cta: { label: 'See my game review &rarr;', href: `${EMAIL.site}/games/${latestReviewedId}` },
    afterCta: `<p style="margin:14px 0 0;text-align:center;font-size:13px;color:${EMAIL.muted};"><a href="${EMAIL.site}/games" style="color:${EMAIL.green};font-weight:700;">All my reviewed games &rarr;</a></p>`,
    footerNote: "You're getting this because you have a ChessScout.net account. We only send this once.",
    unsubscribeUrl: unsubUrl,
  });
}

/** Email (and push) one member that their games are reviewed. Returns false if nothing was sent. */
export async function sendGamesReviewedEmail(userId: string): Promise<boolean> {
  const [u] = rowsOf<{ id: string; email: string | null; first_name: string | null; email_opt_out: boolean; excluded: boolean; sent: boolean }>(await db.execute(sql`
    SELECT u.id, u.email, u.first_name, u.email_opt_out,
      EXISTS (SELECT 1 FROM analytics_excluded_users x WHERE x.id = u.id) AS excluded,
      EXISTS (SELECT 1 FROM email_drip_log d WHERE d.user_id = u.id AND d.drip_type = 'games_reviewed_catchup') AS sent
    FROM users u WHERE u.id = ${userId}`));
  if (!u || u.excluded || u.sent) return false;
  const f = await findings(userId);
  const [last] = rowsOf<{ id: number }>(await db.execute(sql`SELECT id FROM games WHERE user_id = ${userId} AND review_data IS NOT NULL
    AND platform IS DISTINCT FROM 'bot' ORDER BY played_at DESC LIMIT 1`));
  if (!f.reviewed || !last) return false;
  const name = (u.first_name || '').trim().split(/\s+/)[0] || null;
  let sent = false;
  if (u.email && !u.email_opt_out) {
    const subject = name ? `${name}, we reviewed your games (free)` : 'We reviewed your games (free)';
    const html = await trackHtml(gamesReviewedHtml(name, f, last.id, unsubscribeUrl(u.id)), { kind: 'drip', template: 'games_reviewed_catchup', email: u.email, userId: u.id, subject });
    await sendEmail({ to: u.email, subject, html, headers: unsubscribeHeaders(u.id) });
    sent = true;
  }
  if (isPushConfigured()) {
    const r = await sendPushToUser(u.id, { title: 'Your games are reviewed', body: f.worst ? `One had ${f.worst.blunders} blunder${f.worst.blunders > 1 ? 's' : ''}: see the better moves.` : 'Every move graded. See your mistakes and best moves.', url: `/games/${f.worst?.id ?? last.id}`, tag: 'cs:drip:games_reviewed' }).catch(() => ({ sent: 0 }));
    if (r.sent > 0) sent = true;
  }
  await db.execute(sql`INSERT INTO email_drip_log (user_id, drip_type) VALUES (${u.id}, 'games_reviewed_catchup') ON CONFLICT DO NOTHING`);
  if (sent) logger.info({ userId }, '[games-reviewed] sent');
  return sent;
}
