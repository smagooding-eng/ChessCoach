import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { ensureClubOutreachTables, startDiscovery, isDiscoveryRunning } from "../lib/clubOutreach";

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
