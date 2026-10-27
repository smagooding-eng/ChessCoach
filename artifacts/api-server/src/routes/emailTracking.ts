import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { recordOpen, recordClick, trackingSummary, trackHtmlWithToken, markSent, TRANSPARENT_GIF, ensureEmailTracking } from "../lib/emailTracking";
import { logger } from "../lib/logger";

// Open pixel + click redirect (public), the admin summary, and tracked HTML
// for styled emails pasted into Gmail.
const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

router.get("/t/o/:file", async (req: Request, res: Response) => {
  const token = String(req.params.file).replace(/\.gif$/i, "");
  res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, private", Pragma: "no-cache" });
  res.end(TRANSPARENT_GIF);
  void ensureEmailTracking().then(() => recordOpen(token)).catch(() => {});
});

router.get("/t/c/:token", async (req: Request, res: Response) => {
  const url = String(req.query.u ?? "");
  const sig = String(req.query.s ?? "");
  try {
    await ensureEmailTracking();
    const dest = await recordClick(String(req.params.token), url, sig);
    res.redirect(302, dest ?? "https://chessscout.net");
  } catch {
    res.redirect(302, /^https:\/\/chessscout\.net/i.test(url) ? url : "https://chessscout.net");
  }
});

router.get("/admin/email-tracking/summary", requireAdmin, async (_req: Request, res: Response) => {
  try { res.json(await trackingSummary()); }
  catch (err) { logger.error({ err }, "[track] summary failed"); res.status(500).json({ error: "Could not load" }); }
});

// Styled outreach copied into Gmail: one tracked copy per club (one by one)
// or one per Bcc batch (opens/clicks then count for the batch as a whole).
router.post("/admin/club-outreach/tracked-html", requireAdmin, async (req: Request, res: Response) => {
  try {
    const html = String(req.body?.html ?? "");
    const contacts = (Array.isArray(req.body?.contacts) ? req.body.contacts : []) as { id: number; email: string }[];
    if (!html || !contacts.length) { res.status(400).json({ error: "html and contacts are required" }); return; }
    const one = contacts.length === 1 ? contacts[0] : null;
    await ensureEmailTracking();
    const out = await trackHtmlWithToken(html, {
      kind: one ? "outreach" : "outreach_bcc",
      template: typeof req.body?.template === "string" ? req.body.template.slice(0, 40) : null,
      email: one?.email ?? null, contactId: one ? Number(one.id) : null,
      batchSize: contacts.length, subject: typeof req.body?.subject === "string" ? req.body.subject : null,
      pending: true,
    });
    res.json({ html: out.html, token: out.token });
  } catch (err) {
    logger.error({ err }, "[track] tracked-html failed");
    res.status(500).json({ error: "Could not prepare" });
  }
});

// The prepared copy was copied / a draft was opened with it: count it as sent.
router.post("/admin/email-tracking/:token/sent", requireAdmin, async (req: Request, res: Response) => {
  try { await ensureEmailTracking(); await markSent(String(req.params.token)); res.json({ ok: true }); }
  catch (err) { logger.error({ err }, "[track] mark sent failed"); res.status(500).json({ error: "Could not save" }); }
});

export default router;
