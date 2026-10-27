import { Router, type IRouter, type Request, type Response } from "express";
import { Chess } from "chess.js";
import { requireAuth } from "../middlewares/authMiddleware";
import { stockfishBotMove } from "../lib/engineAnalysis";
import { logger } from "../lib/logger";
import { db, gamesTable } from "@workspace/db";
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
/** A finished practice-bot game, stored like any other game (platform 'bot'). */
async function saveBotGame(req: Request, g: { bot: string; result: string; pgn: string; color: "w" | "b"; botRating: number }) {
  const chess = new Chess();
  chess.loadPgn(g.pgn); // throws on a bad PGN
  if (chess.history().length < 2) return;
  const u = req.user!;
  const me = u.scoutUsername || u.chesscomUsername || u.lichessUsername || u.firstName || u.email?.split("@")[0] || "You";
  const botName = `${g.bot} (Bot)`;
  const [white, black] = g.color === "w" ? [me, botName] : [botName, me];
  const tag = g.result === "draw" ? "1/2-1/2" : (g.result === "win") === (g.color === "w") ? "1-0" : "0-1";
  const now = new Date();
  chess.header("Event", "ChessScout practice bot", "Site", "ChessScout.net", "Date", now.toISOString().slice(0, 10).replace(/-/g, "."),
    "White", white, "Black", black, "Result", tag);
  await db.insert(gamesTable).values({
    userId: u.id, username: me.toLowerCase(), pgn: chess.pgn(),
    whiteUsername: white, blackUsername: black,
    whiteRating: g.color === "w" ? 0 : Math.round(g.botRating), blackRating: g.color === "b" ? 0 : Math.round(g.botRating),
    result: g.result, timeControl: "untimed", opening: null, eco: null, playedAt: now, url: null, platform: "bot",
  });
}

router.post("/bots/result", requireAuth, async (req: Request, res: Response) => {
  const { bot, result, moves, gameKey, pgn, color, botRating, takeback } = (req.body ?? {}) as {
    takeback?: unknown; bot?: unknown; result?: unknown; moves?: unknown; gameKey?: unknown; pgn?: unknown; color?: unknown; botRating?: unknown;
  };
  if (typeof bot !== "string" || !bot || bot.length > 60 || typeof result !== "string" || !BOT_RESULTS.has(result)
    || typeof gameKey !== "string" || !gameKey || gameKey.length > 80) {
    res.status(400).json({ error: "bot, result and gameKey are required" });
    return;
  }
  const n = typeof moves === "number" && Number.isFinite(moves) ? Math.max(0, Math.min(1000, Math.round(moves))) : 0;
  if (n < 2) { res.json({ saved: false }); return; }
  try {
    const ins = await db.execute(sql`
      INSERT INTO bot_results (user_id, bot, result, moves, game_key, takeback)
      VALUES (${req.user!.id}, ${bot}, ${result}, ${n}, ${gameKey}, ${takeback === true})
      ON CONFLICT (user_id, game_key) DO NOTHING RETURNING id
    `);
    const fresh = (Array.isArray(ins) ? ins : ((ins as { rows?: unknown[] })?.rows ?? [])).length > 0;
    // Keep the game itself too (Games tab > Bots), once per game.
    if (fresh && typeof pgn === "string" && pgn.length < 20_000 && (color === "w" || color === "b")) {
      await saveBotGame(req, { bot, result, pgn, color, botRating: typeof botRating === "number" ? botRating : 0 })
        .catch((err) => logger.warn({ err }, "save bot game failed"));
    }
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
      SELECT bot, COUNT(DISTINCT user_id) AS players FROM bot_results WHERE result = 'win' AND NOT takeback GROUP BY bot
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
