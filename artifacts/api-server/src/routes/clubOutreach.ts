import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { ensureClubOutreachTables, startDiscovery, isDiscoveryRunning } from "../lib/clubOutreach";
import { sendEmail } from "../lib/email";
import { unsubscribeFooterHtml } from "../lib/emailTheme";
import { clubUnsubscribeUrl } from "../lib/emailPrefs";

// Admin: club & organizer contacts for one-by-one outreach from Gmail.
//   GET    /admin/club-outreach               contacts (+ counts, latest runs)
//   POST   /admin/club-outreach/discover      find new contacts now
//   POST   /admin/club-outreach/status        { ids, status, template? }
//   POST   /admin/club-outreach/contacts      add one by hand
//   PATCH  /admin/club-outreach/contacts/:id  notes / status
//   POST   /admin/club-outreach/dnc           { email } never contact again
const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}
function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }

const STATUSES = ["new", "contacted", "replied", "not_interested", "bounced"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i;

let tablesReady: Promise<void> | null = null;
const ready = () => (tablesReady ??= ensureClubOutreachTables());

router.get("/admin/club-outreach", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ready();
    const status = String(req.query.status ?? "new");
    const where = status === "all" ? sql`TRUE` : sql`c.status = ${status}`;
    const contacts = rowsOf(await db.execute(sql`
      SELECT c.id, c.email, c.org_name AS "orgName", c.org_type AS "orgType", c.city, c.region, c.country, c.website,
        c.source_url AS "sourceUrl", c.status, c.notes, c.found_at AS "foundAt", c.contacted_at AS "contactedAt",
        c.contacted_template AS "contactedTemplate", c.run_id AS "runId"
      FROM club_contacts c
      WHERE ${where} AND NOT EXISTS (SELECT 1 FROM club_contact_dnc d WHERE LOWER(d.email) = LOWER(c.email))
      ORDER BY c.found_at DESC LIMIT 1000`));
    const counts = rowsOf<{ status: string; n: string }>(await db.execute(sql`SELECT status, COUNT(*) AS n FROM club_contacts GROUP BY status`));
    const runs = rowsOf(await db.execute(sql`
      SELECT id, started_at AS "startedAt", finished_at AS "finishedAt", candidates, added, error, trigger, searches
      FROM club_outreach_runs ORDER BY started_at DESC LIMIT 6`));
    const [{ n: dnc }] = rowsOf<{ n: string }>(await db.execute(sql`SELECT COUNT(*) AS n FROM club_contact_dnc`));
    res.json({
      contacts,
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
      doNotContact: Number(dnc),
      runs,
      running: isDiscoveryRunning(),
    });
  } catch (err) {
    logger.error({ err }, "[club-outreach] list failed");
    res.status(500).json({ error: "Could not load contacts" });
  }
});

router.post("/admin/club-outreach/discover", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ready();
    const searches = Math.max(1, Math.min(20, Math.round(Number(req.body?.searches ?? 8))));
    const runId = await startDiscovery({ searches, trigger: "manual" });
    if (runId === null) { res.status(409).json({ error: "A search is already running" }); return; }
    res.json({ runId });
  } catch (err) {
    logger.error({ err }, "[club-outreach] discover failed");
    res.status(500).json({ error: "Could not start the search" });
  }
});

// ── Sending through Resend ──
// Each email goes to one organization (no Bcc), with replies to your Gmail,
// a one-click unsubscribe link, and a daily cap that leaves room for the
// site's own emails on the same Resend plan.
const OUTREACH_DAILY_LIMIT = Math.max(1, Number(process.env.OUTREACH_RESEND_DAILY_LIMIT) || 80);

async function sentToday(): Promise<number> {
  const [r] = rowsOf<{ n: string }>(await db.execute(sql`SELECT COUNT(*) AS n FROM club_outreach_sends WHERE sent_at > now() - interval '24 hours'`));
  return Number(r?.n ?? 0);
}

router.get("/admin/club-outreach/resend-quota", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await ready();
    const used = await sentToday();
    res.json({ limit: OUTREACH_DAILY_LIMIT, used, remaining: Math.max(0, OUTREACH_DAILY_LIMIT - used) });
  } catch { res.status(500).json({ error: "Could not load" }); }
});

router.post("/admin/club-outreach/send", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ready();
    const items = (Array.isArray(req.body?.items) ? req.body.items : []) as { id: number; subject: string; html: string; text: string }[];
    const replyTo = typeof req.body?.replyTo === "string" && EMAIL_RE.test(req.body.replyTo) ? req.body.replyTo : undefined;
    const template = typeof req.body?.template === "string" ? req.body.template.slice(0, 40) : null;
    if (!items.length) { res.status(400).json({ error: "Nothing to send" }); return; }
    const remaining = Math.max(0, OUTREACH_DAILY_LIMIT - (await sentToday()));
    if (remaining <= 0) { res.status(429).json({ error: `Daily Resend limit reached (${OUTREACH_DAILY_LIMIT} in 24 hours). Try again tomorrow or use Gmail.` }); return; }
    const batch = items.slice(0, Math.min(remaining, 100));
    const ids = batch.map((i) => Number(i.id)).filter(Number.isInteger);
    if (!ids.length) { res.status(400).json({ error: "Nothing to send" }); return; }
    const contacts = rowsOf<{ id: number; email: string }>(await db.execute(sql`
      SELECT c.id, c.email FROM club_contacts c
      WHERE c.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        AND NOT EXISTS (SELECT 1 FROM club_contact_dnc d WHERE LOWER(d.email) = LOWER(c.email))`));
    const byId = new Map(contacts.map((c) => [Number(c.id), c.email]));
    let sent = 0;
    const failed: { id: number; error: string }[] = [];
    for (const it of batch) {
      const to = byId.get(Number(it.id));
      if (!to) { failed.push({ id: it.id, error: "on the do-not-contact list or missing" }); continue; }
      const unsub = clubUnsubscribeUrl(to);
      const html = `${String(it.html ?? "")}${unsubscribeFooterHtml(unsub)}`;
      const text = `${String(it.text ?? "")}\n\nUnsubscribe: ${unsub}`;
      try {
        const data = await sendEmail({
          to, subject: String(it.subject ?? "").slice(0, 200), html, text, replyTo,
          headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        });
        await db.execute(sql`INSERT INTO club_outreach_sends (contact_id, email, template, resend_id) VALUES (${it.id}, ${to}, ${template}, ${data?.id ?? null})`);
        await db.execute(sql`UPDATE club_contacts SET status = 'contacted', contacted_at = now(), contacted_template = COALESCE(${template}, contacted_template) WHERE id = ${it.id}`);
        sent++;
      } catch (err) {
        failed.push({ id: it.id, error: err instanceof Error ? err.message : "send failed" });
        if (/rate|429|limit/i.test(String((err as Error)?.message))) break;
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    res.json({ sent, failed, skippedForLimit: items.length - batch.length, remaining: Math.max(0, OUTREACH_DAILY_LIMIT - (await sentToday())) });
  } catch (err) {
    logger.error({ err }, "[club-outreach] resend send failed");
    res.status(500).json({ error: "Could not send" });
  }
});

router.post("/admin/club-outreach/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ready();
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter((n: number) => Number.isInteger(n)).slice(0, 2000);
    const status = String(req.body?.status ?? "");
    if (!ids.length || !(STATUSES as readonly string[]).includes(status)) { res.status(400).json({ error: "ids and a valid status are required" }); return; }
    const template = typeof req.body?.template === "string" ? req.body.template.slice(0, 40) : null;
    const idList = sql.join(ids.map((id: number) => sql`${id}`), sql`, `);
    await db.execute(sql`
      UPDATE club_contacts SET status = ${status},
        contacted_at = CASE WHEN ${status} = 'contacted' THEN now() ELSE contacted_at END,
        contacted_template = CASE WHEN ${status} = 'contacted' THEN COALESCE(${template}, contacted_template) ELSE contacted_template END
      WHERE id IN (${idList})`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[club-outreach] status failed");
    res.status(500).json({ error: "Could not update" });
  }
});

router.post("/admin/club-outreach/contacts", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ready();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const orgName = String(req.body?.orgName ?? "").trim().slice(0, 200);
    if (!EMAIL_RE.test(email) || !orgName) { res.status(400).json({ error: "An email and organization name are required" }); return; }
    const [dnc] = rowsOf(await db.execute(sql`SELECT email FROM club_contact_dnc WHERE LOWER(email) = ${email}`));
    if (dnc) { res.status(400).json({ error: "That address is on the do-not-contact list" }); return; }
    const ins = rowsOf(await db.execute(sql`
      INSERT INTO club_contacts (email, org_name, org_type, city, website, source_url)
      VALUES (${email}, ${orgName}, ${String(req.body?.orgType ?? "").slice(0, 120) || null}, ${String(req.body?.city ?? "").slice(0, 120) || null},
        ${String(req.body?.website ?? "").slice(0, 500) || null}, 'added by hand')
      ON CONFLICT DO NOTHING RETURNING id`));
    if (!ins.length) { res.status(409).json({ error: "That email is already in the list" }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[club-outreach] add failed");
    res.status(500).json({ error: "Could not add" });
  }
});

router.patch("/admin/club-outreach/contacts/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const notes = typeof req.body?.notes === "string" ? req.body.notes.slice(0, 2000) : null;
    await db.execute(sql`UPDATE club_contacts SET notes = ${notes} WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[club-outreach] patch failed");
    res.status(500).json({ error: "Could not save" });
  }
});

router.post("/admin/club-outreach/dnc", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ready();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { res.status(400).json({ error: "A valid email is required" }); return; }
    await db.execute(sql`INSERT INTO club_contact_dnc (email, reason) VALUES (${email}, ${String(req.body?.reason ?? "").slice(0, 200) || null}) ON CONFLICT DO NOTHING`);
    await db.execute(sql`UPDATE club_contacts SET status = 'not_interested' WHERE LOWER(email) = ${email}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[club-outreach] dnc failed");
    res.status(500).json({ error: "Could not save" });
  }
});

export default router;
