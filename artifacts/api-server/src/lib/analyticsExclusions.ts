// Who to leave out of the admin's traffic, funnel and activity numbers:
//   1. the owner's own accounts (by email), every browser they've used them
//      in (including that browser's signed-out visits), and
//   2. suspected bots that got past the user-agent check: a browser that
//      never signed in, seen on an IP that produced 5+ such browsers in one
//      day (headless scrapers and ad-network checkers rotate their ids).
// Imported games and other per-account records are untouched; this only
// changes what the reporting queries count.
//
// The reporting queries read these views instead of the raw tables:
//   pv_people   = page_views without excluded accounts/browsers/bots
//   lfe_people  = landing_funnel_events without the same browsers
//   analytics_excluded_users = the owner's account ids
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_EMAILS = ["chessscout.net@gmail.com", "smagooding@gmail.com"];

export const EXCLUDED_EMAILS: string[] = (process.env.ANALYTICS_EXCLUDE_EMAILS
  ? process.env.ANALYTICS_EXCLUDE_EMAILS.split(",")
  : DEFAULT_EMAILS
).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@']+@[^\s@']+$/.test(e));

/** Same-IP, same-day threshold for counting never-signed-in browsers as automated. */
const BOT_BROWSERS_PER_IP_DAY = 5;

export async function ensureAnalyticsViews(): Promise<void> {
  try {
    const list = EXCLUDED_EMAILS.length ? EXCLUDED_EMAILS.map((e) => `'${e}'`).join(", ") : "''";
    await db.execute(sql.raw(`CREATE OR REPLACE VIEW analytics_excluded_users AS
      SELECT id FROM users WHERE lower(email) IN (${list})`));
    await db.execute(sql.raw(`CREATE OR REPLACE VIEW analytics_bot_visitors AS
      WITH anon AS (
        SELECT visitor_id FROM page_views WHERE visitor_id IS NOT NULL
        GROUP BY visitor_id HAVING BOOL_AND(user_id IS NULL)
      ),
      ip_day AS (
        SELECT pv.ip_address, date_trunc('day', pv.created_at) AS d
        FROM page_views pv JOIN anon a ON a.visitor_id = pv.visitor_id
        WHERE pv.ip_address IS NOT NULL
        GROUP BY 1, 2 HAVING COUNT(DISTINCT pv.visitor_id) >= ${BOT_BROWSERS_PER_IP_DAY}
      )
      SELECT DISTINCT pv.visitor_id
      FROM page_views pv
      JOIN anon a ON a.visitor_id = pv.visitor_id
      JOIN ip_day i ON i.ip_address = pv.ip_address AND i.d = date_trunc('day', pv.created_at)`));
    await db.execute(sql.raw(`CREATE OR REPLACE VIEW analytics_excluded_visitors AS
      SELECT DISTINCT visitor_id FROM page_views
        WHERE visitor_id IS NOT NULL AND user_id IN (SELECT id FROM analytics_excluded_users)
      UNION
      SELECT visitor_id FROM analytics_bot_visitors`));
    await db.execute(sql.raw(`CREATE OR REPLACE VIEW pv_people AS
      SELECT pv.* FROM page_views pv
      WHERE (pv.user_id IS NULL OR pv.user_id NOT IN (SELECT id FROM analytics_excluded_users))
        AND (pv.visitor_id IS NULL OR pv.visitor_id NOT IN (SELECT visitor_id FROM analytics_excluded_visitors))`));
    await db.execute(sql.raw(`CREATE OR REPLACE VIEW lfe_people AS
      SELECT e.* FROM landing_funnel_events e
      WHERE e.visitor_id NOT IN (SELECT visitor_id FROM analytics_excluded_visitors)`));
  } catch (err) {
    logger.error({ err }, "[analytics] could not create reporting views");
  }
}

/** The owner's account ids (for queries over other tables). */
export async function excludedUserIds(): Promise<string[]> {
  try {
    const r = await db.execute(sql`SELECT id FROM analytics_excluded_users`);
    const rows = (r as unknown as { rows?: { id: string }[] }).rows ?? [];
    return (rows as { id: string }[]).map((x) => String(x.id));
  } catch { return []; }
}

/** How much was left out, for a note in the admin panels. */
export async function exclusionSummary(): Promise<{ accounts: number; browsers: number; suspectedBotBrowsers: number; emails: string[] }> {
  try {
    const r = await db.execute(sql`SELECT
      (SELECT COUNT(*) FROM analytics_excluded_users) AS accounts,
      (SELECT COUNT(*) FROM analytics_excluded_visitors) AS browsers,
      (SELECT COUNT(*) FROM analytics_bot_visitors) AS bots`);
    const row = (((r as unknown as { rows?: unknown[] }).rows ?? [])[0] ?? {}) as Record<string, unknown>;
    return { accounts: Number(row.accounts ?? 0), browsers: Number(row.browsers ?? 0), suspectedBotBrowsers: Number(row.bots ?? 0), emails: EXCLUDED_EMAILS };
  } catch { return { accounts: 0, browsers: 0, suspectedBotBrowsers: 0, emails: EXCLUDED_EMAILS }; }
}
