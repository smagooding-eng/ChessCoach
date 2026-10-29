// Content Studio (admin only): find notable moments in any reviewed game and
// open them in the Studio player. See lib/contentMoments.ts.
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { listMoments, tagCounts, contentScanProgress, scanContentBatch, studioGame, ensureContentTables, studioTraps, studioPuzzles, puzzleThemes, studioReviews, reviewGameForStudio, studioScouts, studioScout, studioLessons, studioScans } from "../lib/contentMoments";

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
    res.json({ counts: {}, progress: { scanned: 0, reviewed: 0, moments: 0, analyzed: 0, unreviewed: 0, reviewer: null } });
  }
});

/** Scan more games now (also runs on its own in the background). */
router.post("/admin/studio/scan", requireAdmin, async (_req: Request, res: Response) => {
  await ensureContentTables();
  const done = await scanContentBatch(150);
  res.json({ ...done, progress: await contentScanProgress() });
});

/** Review more games (engine only, isolated engine) so the scanner can find clips in them. */
router.post("/admin/studio/review-more", requireAdmin, async (req: Request, res: Response) => {
  await ensureContentTables();
  const { startStudioReviews } = await import("../lib/contentMoments");
  const count = Math.max(1, Math.min(500, Number(req.body?.count) || 50));
  const r = await startStudioReviews(count);
  if (!r.started) { res.status(409).json({ error: r.error }); return; }
  res.json({ ok: true, progress: await contentScanProgress() });
});
router.post("/admin/studio/review-more/stop", requireAdmin, async (_req: Request, res: Response) => {
  const { stopStudioReviews } = await import("../lib/contentMoments");
  stopStudioReviews();
  res.json({ ok: true });
});

router.get("/admin/studio/game/:id", requireAdmin, async (req: Request, res: Response) => {
  const g = await studioGame(Number(req.params.id));
  if (!g) { res.status(404).json({ error: "Game not found" }); return; }
  res.json(g);
});

router.get("/admin/studio/traps", requireAdmin, async (_req: Request, res: Response) => {
  res.json({ traps: await studioTraps() });
});

router.get("/admin/studio/puzzles", requireAdmin, async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const puzzles = await studioPuzzles({
      theme: typeof q.theme === "string" && /^[A-Za-z0-9_]{1,40}$/.test(q.theme) ? q.theme : undefined,
      minRating: q.minRating ? Number(q.minRating) || undefined : undefined,
      maxRating: q.maxRating ? Number(q.maxRating) || undefined : undefined,
      source: typeof q.source === "string" && q.source ? q.source.slice(0, 20) : undefined,
      sort: q.sort === "hard" || q.sort === "easy" || q.sort === "new" ? q.sort : "random",
      limit: q.limit ? Number(q.limit) : 48, offset: q.offset ? Number(q.offset) : 0,
    });
    res.json({ puzzles });
  } catch (err) {
    req.log.error({ err }, "[studio] puzzles failed");
    res.status(500).json({ error: "Couldn't load puzzles" });
  }
});

router.get("/admin/studio/puzzle-themes", requireAdmin, async (_req: Request, res: Response) => {
  try { res.json({ themes: await puzzleThemes() }); } catch { res.json({ themes: [] }); }
});

router.get("/admin/studio/reviews", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureContentTables();
    const q = req.query;
    const reviews = await studioReviews({
      q: typeof q.q === "string" && q.q.trim() ? q.q.trim().slice(0, 60) : undefined,
      minRating: q.minRating ? Number(q.minRating) || undefined : undefined,
      platform: typeof q.platform === "string" && q.platform ? q.platform : undefined,
      sort: q.sort === "new" || q.sort === "accuracy" ? q.sort : "drama",
      limit: q.limit ? Number(q.limit) : 48, offset: q.offset ? Number(q.offset) : 0,
      sinceDays: q.sinceDays ? Number(q.sinceDays) || undefined : undefined,
      player: typeof q.player === "string" && q.player.trim() ? q.player.trim().slice(0, 60) : undefined,
      gameNo: typeof q.gameNo === "string" && q.gameNo.trim() ? q.gameNo.trim().slice(0, 200) : undefined,
      bots: q.bots === "1",
      all: q.all === "1",
    });
    res.json({ reviews });
  } catch (err) {
    req.log.error({ err }, "[studio] reviews failed");
    res.status(500).json({ error: "Couldn't load reviews" });
  }
});

// Review one chosen game (any game, bots included) so it can be made into a clip.
router.post("/admin/studio/review-game/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureContentTables();
    const r = await reviewGameForStudio(Number(req.params.id));
    if (!r.ok) { res.status(409).json({ error: r.error }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "[studio] review-game failed");
    res.status(500).json({ error: "Could not review that game." });
  }
});

router.get("/admin/studio/scouts", requireAdmin, async (req: Request, res: Response) => {
  try { res.json({ scouts: await studioScouts(typeof req.query.q === "string" ? req.query.q.slice(0, 40) : undefined) }); }
  catch (err) { req.log.error({ err }, "[studio] scouts failed"); res.json({ scouts: [] }); }
});
router.get("/admin/studio/scout/:id", requireAdmin, async (req: Request, res: Response) => {
  const s = await studioScout(String(req.params.id));
  if (!s) { res.status(404).json({ error: "Scout not found" }); return; }
  res.json(s);
});
router.get("/admin/studio/lessons", requireAdmin, async (req: Request, res: Response) => {
  try { res.json({ courses: await studioLessons() }); } catch (err) { req.log.error({ err }, "[studio] lessons failed"); res.json({ courses: [] }); }
});
router.get("/admin/studio/scans", requireAdmin, async (req: Request, res: Response) => {
  try { res.json({ scans: await studioScans() }); } catch (err) { req.log.error({ err }, "[studio] scans failed"); res.json({ scans: [] }); }
});
/** The engine's best move and line for any position (scanned boards, lesson positions). */
router.post("/admin/studio/best-line", requireAdmin, async (req: Request, res: Response) => {
  const fen = typeof req.body?.fen === "string" ? req.body.fen.trim() : "";
  try {
    const { Chess } = await import("chess.js");
    new Chess(fen);
  } catch { res.status(400).json({ error: "That isn't a legal position." }); return; }
  try {
    const { evaluateAllPositions } = await import("../lib/engineAnalysis");
    const [ev] = await evaluateAllPositions([fen], 18);
    res.json({ bestLineSan: ev?.bestLineSan ?? [], bestMoveSan: ev?.bestMoveSan ?? null, cpWhite: ev?.cpWhite ?? 0 });
  } catch (err) {
    req.log.error({ err }, "[studio] best line failed");
    res.status(500).json({ error: "The engine couldn't look at this position right now." });
  }
});

export default router;
