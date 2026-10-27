// Email open and click tracking for the emails we send (outreach, reminders,
// broadcasts). Each sent email gets a token: a 1x1 image records opens and
// links are routed through a redirect that records clicks. Both are served
// on chessscout.net/t/... (Vercel forwards them to the API).
//
// Outreach copies made in the admin panel start "pending": the panel fetches
// a tracked copy ahead of time, and only the copy you actually copy or open a
// draft with counts as sent. Opens in the first few minutes after that are
// you (the Gmail compose window loads the image when you paste), so they're
// kept apart as self-opens and don't count.
//
// Opens are approximate: Apple Mail preloads images (counts as opened even
// if unread) and some clients block images (opened but not counted). Some
// corporate mail scanners also "click" links to check them.
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const TRACK_BASE = (process.env.TRACK_BASE_URL || "https://chessscout.net").replace(/\/$/, "");

function secret(): string {
  return process.env.EMAIL_UNSUB_SECRET || process.env.RESEND_API_KEY || process.env.DATABASE_URL || "chessscout-track";
}
function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }

let ready: Promise<void> | null = null;
export function ensureEmailTracking(): Promise<void> {
  return (ready ??= (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS email_tracking (
      token VARCHAR PRIMARY KEY,
      kind VARCHAR NOT NULL,
      template VARCHAR,
      email VARCHAR,
      contact_id INTEGER,
      user_id VARCHAR,
      batch_size INTEGER NOT NULL DEFAULT 1,
      subject VARCHAR,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      opened_at TIMESTAMPTZ,
      open_count INTEGER NOT NULL DEFAULT 0,
      clicked_at TIMESTAMPTZ,
      click_count INTEGER NOT NULL DEFAULT 0,
      last_url VARCHAR
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_email_tracking_contact ON email_tracking (contact_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_email_tracking_kind ON email_tracking (kind, template, sent_at DESC)`);
    await db.execute(sql`ALTER TABLE email_tracking ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE email_tracking ADD COLUMN IF NOT EXISTS self_open_count INTEGER NOT NULL DEFAULT 0`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS email_tracking_fixes (id VARCHAR PRIMARY KEY, done_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const fixed = rowsOf<{ id: string }>(await db.execute(sql`INSERT INTO email_tracking_fixes (id) VALUES ('self_opens_v1') ON CONFLICT DO NOTHING RETURNING id`));
    if (fixed.length) {
      // Before this fix the admin preview loaded the pixel (and the panel
      // made a fresh tracked copy each time it rendered), so outreach showed
      // "opened" straight away and twice per club. Undo those: opens within
      // 5 minutes of the copy with no later activity, then drop the spare
      // copies that were never opened or clicked.
      await db.execute(sql`
        UPDATE email_tracking SET self_open_count = open_count, open_count = 0, opened_at = NULL
        WHERE kind IN ('outreach', 'outreach_bcc') AND opened_at IS NOT NULL AND clicked_at IS NULL
          AND opened_at < sent_at + interval '5 minutes' AND open_count <= 2`);
      await db.execute(sql`
        DELETE FROM email_tracking a
        WHERE a.kind IN ('outreach', 'outreach_bcc') AND a.opened_at IS NULL AND a.clicked_at IS NULL
          AND EXISTS (
            SELECT 1 FROM email_tracking b
            WHERE b.token <> a.token AND b.kind = a.kind AND b.template IS NOT DISTINCT FROM a.template
              AND COALESCE(b.contact_id, -1) = COALESCE(a.contact_id, -1) AND b.batch_size = a.batch_size
              AND (a.contact_id IS NOT NULL OR b.subject IS NOT DISTINCT FROM a.subject)
              AND ABS(EXTRACT(EPOCH FROM (b.sent_at - a.sent_at))) < 3600
              AND (b.opened_at IS NOT NULL OR b.clicked_at IS NOT NULL OR b.sent_at > a.sent_at)
          )`);
    }
  })());
}

export interface TrackInfo {
  kind: "outreach" | "outreach_bcc" | "drip" | "broadcast";
  template?: string | null; email?: string | null; contactId?: number | null; userId?: string | null;
  batchSize?: number; subject?: string | null;
  /** Prepared but not sent yet (see markSent). */
  pending?: boolean;
}

export async function createTrackingToken(t: TrackInfo): Promise<string> {
  await ensureEmailTracking();
  const token = crypto.randomBytes(12).toString("base64url");
  await db.execute(sql`
    INSERT INTO email_tracking (token, kind, template, email, contact_id, user_id, batch_size, subject, pending)
    VALUES (${token}, ${t.kind}, ${t.template ?? null}, ${t.email ?? null}, ${t.contactId ?? null}, ${t.userId ?? null},
      ${t.batchSize ?? 1}, ${(t.subject ?? "").slice(0, 200) || null}, ${t.pending === true})`);
  return token;
}

const sign = (token: string, url: string) => crypto.createHmac("sha256", secret()).update(`${token}|${url}`).digest("base64url").slice(0, 16);

/** Wraps http(s) links (not unsubscribe links) and adds the open pixel. */
export function instrumentHtml(html: string, token: string): string {
  const wrapped = html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url: string) => {
    if (/unsubscribe/i.test(url) || url.startsWith(`${TRACK_BASE}/t/`)) return m;
    const real = url.replace(/&amp;/g, "&");
    return `href="${TRACK_BASE}/t/c/${token}?u=${encodeURIComponent(real)}&s=${sign(token, real)}"`;
  });
  const pixel = `<img src="${TRACK_BASE}/t/o/${token}.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />`;
  return /<\/body>/i.test(wrapped) ? wrapped.replace(/<\/body>/i, `${pixel}</body>`) : `${wrapped}${pixel}`;
}

/** Convenience: token + instrumented HTML in one go (never throws; falls back to the plain HTML). */
export async function trackHtml(html: string, t: TrackInfo): Promise<string> {
  return (await trackHtmlWithToken(html, t)).html;
}
export async function trackHtmlWithToken(html: string, t: TrackInfo): Promise<{ html: string; token: string | null }> {
  try { const token = await createTrackingToken(t); return { html: instrumentHtml(html, token), token }; }
  catch (err) { logger.warn({ err }, "[track] could not add tracking"); return { html, token: null }; }
}

/** The prepared copy was actually used (copied / draft opened): it counts as sent from now. */
export async function markSent(token: string): Promise<void> {
  await db.execute(sql`UPDATE email_tracking SET pending = false, sent_at = now() WHERE token = ${token} AND pending`);
}

/** Opens from the sender's own compose window (pending, or within 3 minutes of sending) don't count. */
const SELF_WINDOW = sql`interval '3 minutes'`;
export async function recordOpen(token: string): Promise<void> {
  await db.execute(sql`
    UPDATE email_tracking SET
      self_open_count = self_open_count + CASE WHEN pending OR now() < sent_at + ${SELF_WINDOW} THEN 1 ELSE 0 END,
      open_count = open_count + CASE WHEN pending OR now() < sent_at + ${SELF_WINDOW} THEN 0 ELSE 1 END,
      opened_at = CASE WHEN pending OR now() < sent_at + ${SELF_WINDOW} THEN opened_at ELSE COALESCE(opened_at, now()) END
    WHERE token = ${token}`);
}

/** Records a click and returns where to send the reader (null if the link wasn't one we signed). */
export async function recordClick(token: string, url: string, sig: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url) || sign(token, url) !== sig) return null;
  await db.execute(sql`
    UPDATE email_tracking SET click_count = click_count + 1, clicked_at = COALESCE(clicked_at, now()),
      opened_at = COALESCE(opened_at, now()), last_url = ${url.slice(0, 500)}
    WHERE token = ${token}`);
  return url;
}

export async function trackingSummary() {
  await ensureEmailTracking();
  await db.execute(sql`DELETE FROM email_tracking WHERE pending AND sent_at < now() - interval '1 day'`).catch(() => {});
  const byTemplate = rowsOf<{ kind: string; template: string | null; sent: string; recipients: string; opened: string; clicked: string; last_sent: string }>(await db.execute(sql`
    SELECT kind, template, COUNT(*) AS sent, SUM(batch_size) AS recipients,
      COUNT(opened_at) AS opened, COUNT(clicked_at) AS clicked, MAX(sent_at) AS last_sent
    FROM email_tracking WHERE NOT pending GROUP BY kind, template ORDER BY MAX(sent_at) DESC LIMIT 100`));
  const recent = rowsOf(await db.execute(sql`
    SELECT kind, template, email, subject, batch_size AS "batchSize", sent_at AS "sentAt", opened_at AS "openedAt", open_count AS "openCount",
      clicked_at AS "clickedAt", click_count AS "clickCount", last_url AS "lastUrl"
    FROM email_tracking WHERE NOT pending ORDER BY sent_at DESC LIMIT 100`));
  return {
    byTemplate: byTemplate.map((r) => ({
      kind: r.kind, template: r.template, sent: Number(r.sent), recipients: Number(r.recipients),
      opened: Number(r.opened), clicked: Number(r.clicked), lastSent: r.last_sent,
    })),
    recent,
  };
}

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
export const TRANSPARENT_GIF = GIF;
