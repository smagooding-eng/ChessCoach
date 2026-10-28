import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
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

export default router;
