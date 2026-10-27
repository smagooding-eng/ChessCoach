// Content Studio (admin only): find notable moments in any reviewed game and
// open them in the Studio player. See lib/contentMoments.ts.
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { listMoments, tagCounts, contentScanProgress, scanContentBatch, studioGame, ensureContentTables, studioTraps } from "../lib/contentMoments";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

router.get("/admin/studio/moments", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureContentTables();
    const q = req.query;
    const moments = await listMoments({
      tags: typeof q.tags === "string" && q.tags ? q.tags.split(",") : [],
      opening: typeof q.opening === "string" ? q.opening.slice(0, 80) : undefined,
      minRating: q.minRating ? Number(q.minRating) || undefined : undefined,
      platform: typeof q.platform === "string" && q.platform ? q.platform : undefined,
      sort: q.sort === "new" || q.sort === "random" ? q.sort : "best",
      limit: q.limit ? Number(q.limit) : 48,
      offset: q.offset ? Number(q.offset) : 0,
      sinceDays: q.sinceDays ? Number(q.sinceDays) || undefined : undefined,
    });
    res.json({ moments });
  } catch (err) {
    req.log.error({ err }, "[studio] moments failed");
    res.status(500).json({ error: "Couldn't load moments" });
  }
});

router.get("/admin/studio/summary", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await ensureContentTables();
    const [counts, progress] = await Promise.all([tagCounts(), contentScanProgress()]);
    res.json({ counts, progress });
  } catch {
    res.json({ counts: {}, progress: { scanned: 0, reviewed: 0, moments: 0 } });
  }
});

/** Scan more games now (also runs on its own in the background). */
router.post("/admin/studio/scan", requireAdmin, async (_req: Request, res: Response) => {
  await ensureContentTables();
  const done = await scanContentBatch(150);
  res.json({ ...done, progress: await contentScanProgress() });
});

router.get("/admin/studio/game/:id", requireAdmin, async (req: Request, res: Response) => {
  const g = await studioGame(Number(req.params.id));
  if (!g) { res.status(404).json({ error: "Game not found" }); return; }
  res.json(g);
});

router.get("/admin/studio/traps", requireAdmin, async (_req: Request, res: Response) => {
  res.json({ traps: await studioTraps() });
});

export default router;
