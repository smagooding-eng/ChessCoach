import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/authMiddleware";
import {
  listCorrespondenceTimeControls, createOrJoinCorrespondenceGame, leaveQueue,
  listGamesForUser, getGame, makeMove, resignGame,
} from "../lib/correspondence";

const router: IRouter = Router();

router.get("/correspondence/time-controls", (_req: Request, res: Response) => {
  res.json({ timeControls: listCorrespondenceTimeControls() });
});

router.post("/correspondence/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const { timeControl } = req.body as { timeControl?: string };
    if (!timeControl) {
      res.status(400).json({ error: "timeControl is required" });
      return;
    }
    const displayName = req.user!.chesscomUsername ?? req.user!.lichessUsername ?? req.user!.firstName ?? "Player";
    const result = await createOrJoinCorrespondenceGame(req.user!.id, displayName, timeControl);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Failed to create or join a correspondence game" });
  }
});

router.post("/correspondence/cancel-queue", requireAuth, async (req: Request, res: Response) => {
  try {
    const { timeControl } = req.body as { timeControl?: string };
    if (!timeControl) {
      res.status(400).json({ error: "timeControl is required" });
      return;
    }
    await leaveQueue(req.user!.id, timeControl);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to leave queue", details: err.cause?.message ?? err.message });
  }
});

router.get("/correspondence/games", requireAuth, async (req: Request, res: Response) => {
  try {
    const games = await listGamesForUser(req.user!.id);
    res.json({ games });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load games", details: err.cause?.message ?? err.message });
  }
});

router.get("/correspondence/games/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const game = await getGame(req.params.id, req.user!.id);
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json({ game });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load game", details: err.cause?.message ?? err.message });
  }
});

router.post("/correspondence/games/:id/move", requireAuth, async (req: Request, res: Response) => {
  try {
    const { san } = req.body as { san?: string };
    if (!san?.trim()) {
      res.status(400).json({ error: "san (the move in standard algebraic notation) is required" });
      return;
    }
    const result = await makeMove(req.params.id, req.user!.id, san.trim());
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ game: result.game });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to make move", details: err.cause?.message ?? err.message });
  }
});

router.post("/correspondence/games/:id/resign", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await resignGame(req.params.id, req.user!.id);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ game: result.game });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to resign", details: err.cause?.message ?? err.message });
  }
});

export default router;
