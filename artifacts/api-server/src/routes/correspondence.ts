import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/authMiddleware";
import {
  listCorrespondenceTimeControls, createOrJoinCorrespondenceGame, leaveQueue, listQueueForUser,
  listGamesForUser, getGame, makeMove, resignGame, offerDraw, respondDraw, getDailyRating,
} from "../lib/correspondence";

// Daily games (1 / 3 / 7 days per move). Kept on the /correspondence/*
// paths the server already had.
const router: IRouter = Router();

const displayName = (req: Request) =>
  req.user!.chesscomUsername ?? req.user!.lichessUsername ?? req.user!.firstName ?? "Player";

router.get("/correspondence/time-controls", (_req: Request, res: Response) => {
  res.json({ timeControls: listCorrespondenceTimeControls() });
});

router.post("/correspondence/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const { timeControl, mode } = req.body as { timeControl?: string; mode?: string };
    if (!timeControl) { res.status(400).json({ error: "timeControl is required" }); return; }
    const result = await createOrJoinCorrespondenceGame(req.user!.id, displayName(req), timeControl, mode === "ranked" ? "ranked" : "casual");
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Failed to create or join a daily game" });
  }
});

router.post("/correspondence/cancel-queue", requireAuth, async (req: Request, res: Response) => {
  try {
    const { timeControl, mode } = req.body as { timeControl?: string; mode?: string };
    if (!timeControl) { res.status(400).json({ error: "timeControl is required" }); return; }
    await leaveQueue(req.user!.id, timeControl, mode);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to leave queue", details: err.cause?.message ?? err.message });
  }
});

router.get("/correspondence/queue", requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ queue: await listQueueForUser(req.user!.id) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load queue", details: err.cause?.message ?? err.message });
  }
});

router.get("/correspondence/rating", requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ rating: await getDailyRating(req.user!.id) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load rating", details: err.cause?.message ?? err.message });
  }
});

router.get("/correspondence/games", requireAuth, async (req: Request, res: Response) => {
  try {
    const { active, finished } = await listGamesForUser(req.user!.id);
    res.json({ games: active, finished, now: Date.now() });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load games", details: err.cause?.message ?? err.message });
  }
});

router.get("/correspondence/games/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const game = await getGame(String(req.params.id), req.user!.id);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    res.json({ game, now: Date.now() });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load game", details: err.cause?.message ?? err.message });
  }
});

const action = (fn: (gameId: string, userId: string, req: Request) => Promise<{ success: boolean; error?: string; game?: unknown }>) =>
  async (req: Request, res: Response) => {
    try {
      const result = await fn(String(req.params.id), req.user!.id, req);
      if (!result.success) { res.status(400).json({ error: result.error }); return; }
      res.json({ game: result.game, now: Date.now() });
    } catch (err: any) {
      res.status(500).json({ error: "Request failed", details: err.cause?.message ?? err.message });
    }
  };

router.post("/correspondence/games/:id/move", requireAuth, action(async (id, uid, req) => {
  const { san } = req.body as { san?: string };
  if (!san?.trim()) return { success: false, error: "san (the move in standard algebraic notation) is required" };
  return makeMove(id, uid, san.trim());
}));
router.post("/correspondence/games/:id/resign", requireAuth, action((id, uid) => resignGame(id, uid)));
router.post("/correspondence/games/:id/draw-offer", requireAuth, action((id, uid) => offerDraw(id, uid)));
router.post("/correspondence/games/:id/draw-accept", requireAuth, action((id, uid) => respondDraw(id, uid, true)));
router.post("/correspondence/games/:id/draw-decline", requireAuth, action((id, uid) => respondDraw(id, uid, false)));

export default router;
