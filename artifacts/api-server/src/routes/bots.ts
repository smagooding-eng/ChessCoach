import { Router, type IRouter, type Request, type Response } from "express";
import { Chess } from "chess.js";
import { requireAuth } from "../middlewares/authMiddleware";
import { stockfishBotMove } from "../lib/engineAnalysis";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// A move for a practice bot, played by Stockfish limited to the bot's rating.
// Free for any signed-in user (it is plain engine compute, not an AI call).
// Body: { fen: string, elo: number }  ->  { san: string }
router.post("/bots/move", requireAuth, async (req: Request, res: Response) => {
  const { fen, elo } = (req.body ?? {}) as { fen?: unknown; elo?: unknown };
  if (typeof fen !== "string" || typeof elo !== "number" || !Number.isFinite(elo)) {
    res.status(400).json({ error: "fen (string) and elo (number) are required" });
    return;
  }

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    res.status(400).json({ error: "Invalid FEN" });
    return;
  }
  if (chess.isGameOver()) {
    res.status(409).json({ error: "Game is already over" });
    return;
  }

  try {
    const uci = await stockfishBotMove(fen, elo);
    if (!uci) {
      res.status(502).json({ error: "Engine returned no move" });
      return;
    }
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    res.json({ san: move.san });
  } catch (err) {
    logger.warn({ err }, "Bot engine move failed");
    res.status(502).json({ error: "Bot engine unavailable" });
  }
});

export default router;
