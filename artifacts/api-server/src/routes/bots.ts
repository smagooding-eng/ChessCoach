import { Router, type IRouter, type Request, type Response } from "express";
import { Chess } from "chess.js";
import { requireAuth } from "../middlewares/authMiddleware";
import { stockfishBotMove } from "../lib/engineAnalysis";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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

// ── Bot records ────────────────────────────────────────────────────────────
// Save one finished practice-bot game. gameKey makes it idempotent (the app
// may retry). Only real games count: from the starting position, at least a
// couple of moves in.
const BOT_RESULTS = new Set(["win", "loss", "draw"]);
router.post("/bots/result", requireAuth, async (req: Request, res: Response) => {
  const { bot, result, moves, gameKey } = (req.body ?? {}) as { bot?: unknown; result?: unknown; moves?: unknown; gameKey?: unknown };
  if (typeof bot !== "string" || !bot || bot.length > 60 || typeof result !== "string" || !BOT_RESULTS.has(result)
    || typeof gameKey !== "string" || !gameKey || gameKey.length > 80) {
    res.status(400).json({ error: "bot, result and gameKey are required" });
    return;
  }
  const n = typeof moves === "number" && Number.isFinite(moves) ? Math.max(0, Math.min(1000, Math.round(moves))) : 0;
  if (n < 2) { res.json({ saved: false }); return; }
  try {
    await db.execute(sql`
      INSERT INTO bot_results (user_id, bot, result, moves, game_key)
      VALUES (${req.user!.id}, ${bot}, ${result}, ${n}, ${gameKey})
      ON CONFLICT (user_id, game_key) DO NOTHING
    `);
    res.json({ saved: true });
  } catch (err) {
    logger.warn({ err }, "save bot result failed");
    res.status(500).json({ error: "Could not save the result" });
  }
});

// Your record against each bot + how many different players have beaten each
// one. Works signed out too (then only the "beaten by" counts).
router.get("/bots/stats", async (req: Request, res: Response) => {
  const rowsOf = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows?: unknown[] })?.rows ?? [])) as Record<string, unknown>[];
  try {
    const beaten = rowsOf(await db.execute(sql`
      SELECT bot, COUNT(DISTINCT user_id) AS players FROM bot_results WHERE result = 'win' GROUP BY bot
    `));
    const beatenBy: Record<string, number> = {};
    for (const r of beaten) beatenBy[String(r.bot)] = Number(r.players ?? 0);

    const mine: Record<string, { wins: number; losses: number; draws: number }> = {};
    if (req.user?.id) {
      const rows = rowsOf(await db.execute(sql`
        SELECT bot,
          COUNT(*) FILTER (WHERE result = 'win') AS wins,
          COUNT(*) FILTER (WHERE result = 'loss') AS losses,
          COUNT(*) FILTER (WHERE result = 'draw') AS draws
        FROM bot_results WHERE user_id = ${req.user.id} GROUP BY bot
      `));
      for (const r of rows) mine[String(r.bot)] = { wins: Number(r.wins ?? 0), losses: Number(r.losses ?? 0), draws: Number(r.draws ?? 0) };
    }
    res.json({ beatenBy, mine });
  } catch (err) {
    logger.warn({ err }, "bot stats failed");
    res.json({ beatenBy: {}, mine: {} });
  }
});

export default router;
