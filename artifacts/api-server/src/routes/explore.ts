import { Router, type IRouter, type Request, type Response } from "express";
import { Chess } from "chess.js";
import { requireAuth } from "../middlewares/authMiddleware";
import { exploreAllMoves, ExplorerBusyError } from "../lib/engineAnalysis";

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

export default router;
