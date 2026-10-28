import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendEmail } from "../lib/email";
import { unsubscribeFooterHtml } from "../lib/emailTheme";
import { clubUnsubscribeUrl } from "../lib/emailPrefs";
import { trackHtml, ensureEmailTracking } from "../lib/emailTracking";
import { ensureClubOutreachTables } from "../lib/clubOutreach";
import { ensureBacklinkTables } from "../lib/backlinkGap";
import {
  getCompetitors, setCompetitors, startBacklinkRun, runState, importBacklinks, listTargets, setTargetStatus, draftOutreach, normDomain,
} from "../lib/backlinkGap";

// Admin › Growth › Competitor backlinks.
//   GET  /admin/backlinks                 targets + competitors + run state
//   PUT  /admin/backlinks/competitors     { competitors: string[] }
//   POST /admin/backlinks/run             find backlinks for every competitor (background)
//   POST /admin/backlinks/import          { competitor, text } pasted export
//   POST /admin/backlinks/:id/status      { status, notes? }
//   POST /admin/backlinks/:id/draft       { sender } -> { subject, body }
//   POST /admin/backlinks/:id/send        { subject, body, to?, replyTo? } via Resend (shares club outreach's daily cap)
const router: IRouter = Router();
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}
const STATUSES = new Set(["new", "contacted", "replied", "won", "skipped"]);

router.get("/admin/backlinks", requireAdmin, async (req: Request, res: Response) => {
  try { res.json({ targets: await listTargets(), competitors: await getCompetitors(), run: runState() }); }
  catch (err) { req.log.error({ err }, "[backlinks] list failed"); res.status(500).json({ error: "Could not load" }); }
});
router.put("/admin/backlinks/competitors", requireAdmin, async (req: Request, res: Response) => {
  const list = Array.isArray(req.body?.competitors) ? req.body.competitors.map(String) : [];
  try { res.json({ competitors: await setCompetitors(list) }); } catch { res.status(500).json({ error: "Could not save" }); }
});
router.post("/admin/backlinks/run", requireAdmin, async (_req: Request, res: Response) => {
  const started = startBacklinkRun();
  res.json({ started, run: runState() });
});
router.post("/admin/backlinks/import", requireAdmin, async (req: Request, res: Response) => {
  const competitor = normDomain(String(req.body?.competitor ?? ""));
  const text = String(req.body?.text ?? "");
  if (!competitor) { res.status(400).json({ error: "Which competitor is this export for? (e.g. aimchess.com)" }); return; }
  if (!text.trim()) { res.status(400).json({ error: "Paste the export first" }); return; }
  try { res.json(await importBacklinks(competitor, text)); } catch (err) { req.log.error({ err }, "[backlinks] import failed"); res.status(500).json({ error: "Could not import" }); }
});
router.post("/admin/backlinks/:id/status", requireAdmin, async (req: Request, res: Response) => {
  const status = String(req.body?.status ?? "");
  if (!STATUSES.has(status)) { res.status(400).json({ error: "Bad status" }); return; }
  await setTargetStatus(Number(req.params.id), status, typeof req.body?.notes === "string" ? req.body.notes.slice(0, 2000) : undefined);
  res.json({ ok: true });
});
router.post("/admin/backlinks/:id/draft", requireAdmin, async (req: Request, res: Response) => {
  try { res.json(await draftOutreach(Number(req.params.id), String(req.body?.sender || "Shann").slice(0, 60))); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Could not draft" }); }
});

// ── Sending with Resend ─────────────────────────────────────────────────────
// Same rules as club outreach: the do-not-contact list is checked, every email
// has an unsubscribe link (which adds the address to that list), opens/clicks
// are tracked, and sends count toward the shared daily outreach limit.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i;
const DAILY_LIMIT = Math.max(1, Number(process.env.OUTREACH_RESEND_DAILY_LIMIT) || 80);
function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** A plain personal email: paragraphs, with links clickable (and tracked). */
function plainToHtml(body: string): string {
  const paras = body.trim().split(/\n{2,}/).map((p) => esc(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\b(chessscout\.net)(?![^<]*<\/a>)(?!\/)/gi, '<a href="https://chessscout.net">$1</a>').replace(/\n/g, "<br>"));
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2328;max-width:560px">${paras.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join("")}</div>`;
}

router.get("/admin/backlinks/send-limit", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await ensureClubOutreachTables();
    const [r] = rowsOf<{ n: string }>(await db.execute(sql`SELECT COUNT(*) AS n FROM club_outreach_sends WHERE sent_at > now() - interval '24 hours'`));
    const used = Number(r?.n ?? 0);
    res.json({ limit: DAILY_LIMIT, used, remaining: Math.max(0, DAILY_LIMIT - used) });
  } catch { res.status(500).json({ error: "Could not load" }); }
});

router.post("/admin/backlinks/:id/send", requireAdmin, async (req: Request, res: Response) => {
  try {
    await Promise.all([ensureBacklinkTables(), ensureClubOutreachTables(), ensureEmailTracking()]);
    const id = Number(req.params.id);
    const [t] = rowsOf<{ id: number; email: string | null; draft_subject: string | null; draft_body: string | null }>(await db.execute(sql`SELECT id, email, draft_subject, draft_body FROM backlink_targets WHERE id = ${id}`));
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    const to = String(req.body?.to || t.email || "").trim().toLowerCase();
    const subject = String(req.body?.subject ?? t.draft_subject ?? "").trim().slice(0, 200);
    const body = String(req.body?.body ?? t.draft_body ?? "").trim();
    const replyTo = typeof req.body?.replyTo === "string" && EMAIL_RE.test(req.body.replyTo) ? req.body.replyTo : undefined;
    if (!EMAIL_RE.test(to)) { res.status(400).json({ error: "No valid email address for this site" }); return; }
    if (!subject || !body) { res.status(400).json({ error: "Write (or draft) the email first" }); return; }
    const [dnc] = rowsOf(await db.execute(sql`SELECT email FROM club_contact_dnc WHERE LOWER(email) = ${to}`));
    if (dnc) { res.status(409).json({ error: "This address is on the do-not-contact list" }); return; }
    const [r] = rowsOf<{ n: string }>(await db.execute(sql`SELECT COUNT(*) AS n FROM club_outreach_sends WHERE sent_at > now() - interval '24 hours'`));
    if (Number(r?.n ?? 0) >= DAILY_LIMIT) { res.status(429).json({ error: `Daily outreach limit reached (${DAILY_LIMIT} in 24 hours). Try again tomorrow or use Gmail.` }); return; }
    const unsub = clubUnsubscribeUrl(to);
    const html = await trackHtml(`${plainToHtml(body)}${unsubscribeFooterHtml(unsub)}`, { kind: "outreach", template: "backlink", email: to, subject });
    const data = await sendEmail({
      to, subject, html, text: `${body}\n\nUnsubscribe: ${unsub}`, replyTo,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    await db.execute(sql`INSERT INTO club_outreach_sends (contact_id, email, template, resend_id) VALUES (NULL, ${to}, 'backlink', ${data?.id ?? null})`);
    await db.execute(sql`UPDATE backlink_targets SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, sent_at = now(), sent_to = ${to},
      draft_subject = ${subject}, draft_body = ${body} WHERE id = ${id}`);
    res.json({ ok: true, sentTo: to });
  } catch (err) {
    req.log.error({ err }, "[backlinks] send failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not send" });
  }
});

export default router;
