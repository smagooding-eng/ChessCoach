import { Router, type IRouter, type Request, type Response } from "express";
import { Chess } from "chess.js";
import { requireAuth } from "../middlewares/authMiddleware";
import { exploreAllMoves, exploreAutoGame, ExplorerBusyError } from "../lib/engineAnalysis";

// Position explorer: Stockfish's score for every legal move in a position, so
// the board can show each square's evaluation swing as soon as a piece is
// picked up.
//   POST /explore/moves { fen } -> { fen, turn, depth, moves: [{ uci, san, from, to, cp, mate }] }
// cp / mate are from the side to move's point of view.
const router: IRouter = Router();

router.post("/explore/moves", requireAuth, async (req: Request, res: Response) => {
  const fen = typeof req.body?.fen === "string" ? req.body.fen.trim() : "";
  try { new Chess(fen); } catch { res.status(400).json({ error: "That isn't a legal position." }); return; }
  try {
    res.json(await exploreAllMoves(fen));
  } catch (err) {
    if (err instanceof ExplorerBusyError) { res.status(503).json({ error: err.message }); return; }
    req.log.error({ err }, "[explore] failed");
    res.status(500).json({ error: "The engine couldn't look at this position right now." });
  }
});

// Content Studio: the whole game at once (best / worst per side), for a video.
router.post("/explore/auto-game", requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  const fen = typeof req.body?.fen === "string" ? req.body.fen.trim() : "";
  const m = (v: unknown) => (v === "worst" ? "worst" : "best") as "best" | "worst";
  const maxPlies = Math.max(2, Math.min(160, Number(req.body?.maxPlies) || 80));
  try { new Chess(fen); } catch { res.status(400).json({ error: "That isn't a legal position." }); return; }
  try {
    res.json(await exploreAutoGame(fen, { w: m(req.body?.white), b: m(req.body?.black) }, maxPlies));
  } catch (err) {
    if (err instanceof ExplorerBusyError) { res.status(503).json({ error: err.message }); return; }
    req.log.error({ err }, "[explore] auto game failed");
    res.status(500).json({ error: "The engine couldn't play this game right now." });
  }
});

export default router;
