import { Router, type IRouter } from "express";
import { db, gamesTable, backgroundJobsTable } from "@workspace/db";
import { eq, desc, count, isNull, and } from "drizzle-orm";
import {
  ImportGamesBody,
  ImportGamesResponse,
  ListGamesResponse,
  GetGameResponse,
  GetGameReplayResponse,
  ListGamesQueryParams,
  GetGameParams,
  GetGameReplayParams,
} from "@workspace/api-zod";
import { fetchChessComGames, extractGameMetadata, parsePgnMoves, extractOpeningFromPgn } from "../lib/chesscom";
import { analyzeMoves, analyzeSingleMove, reviewFullGame } from "../lib/openaiAnalysis";
import { randomUUID } from "crypto";
import type { Logger } from "pino";

const router: IRouter = Router();

router.post("/games/import", async (req, res): Promise<void> => {
  const parsed = ImportGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, months = 3 } = parsed.data;

  req.log.info({ username, months }, "Importing games from chess.com");

  let games;
  try {
    games = await fetchChessComGames(username, months);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch games from chess.com");
    res.status(400).json({ error: "Failed to fetch games from chess.com. Check the username and try again." });
    return;
  }

  let imported = 0;

  for (const game of games) {
    try {
      const meta = extractGameMetadata(game, username);

      if (meta.chesscomGameId) {
        const existing = await db
          .select({ id: gamesTable.id })
          .from(gamesTable)
          .where(eq(gamesTable.chesscomGameId, meta.chesscomGameId))
          .limit(1);

        if (existing.length > 0) continue;
      }

      await db.insert(gamesTable).values({
        username: username.toLowerCase(),
        pgn: game.pgn,
        ...meta,
      });
      imported++;
    } catch (err) {
      req.log.warn({ err }, "Failed to insert game");
    }
  }

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(gamesTable)
    .where(eq(gamesTable.username, username.toLowerCase()));

  res.json(
    ImportGamesResponse.parse({
      imported,
      total: Number(total),
      username,
    })
  );
});

router.get("/games", async (req, res): Promise<void> => {
  const query = ListGamesQueryParams.safeParse(req.query);
  const username = query.success ? query.data.username : undefined;
  const limit = query.success ? (query.data.limit ?? 50) : 50;
  const offset = query.success ? (query.data.offset ?? 0) : 0;

  let dbQuery = db
    .select()
    .from(gamesTable)
    .orderBy(desc(gamesTable.playedAt))
    .limit(limit)
    .offset(offset);

  let countQuery = db.select({ value: count() }).from(gamesTable);

  if (username) {
    // @ts-ignore
    dbQuery = dbQuery.where(eq(gamesTable.username, username.toLowerCase()));
    // @ts-ignore
    countQuery = countQuery.where(eq(gamesTable.username, username.toLowerCase()));
  }

  const [games, [{ value: total }]] = await Promise.all([dbQuery, countQuery]);

  res.json(
    ListGamesResponse.parse({
      games: games.map((g) => ({
        ...g,
        reviewed: !!(g.reviewData && Array.isArray(g.reviewData) && (g.reviewData as unknown[]).length > 0),
        playedAt: g.playedAt.toISOString(),
        createdAt: g.createdAt.toISOString(),
      })),
      total: Number(total),
    })
  );
});

// One-time utility: re-extract opening names from PGN for all games with null opening
router.post("/games/fix-openings", async (req, res): Promise<void> => {
  const nullOpeningGames = await db
    .select({ id: gamesTable.id, pgn: gamesTable.pgn })
    .from(gamesTable)
    .where(isNull(gamesTable.opening));

  let updated = 0;
  for (const game of nullOpeningGames) {
    const { opening, eco } = extractOpeningFromPgn(game.pgn);
    if (opening) {
      await db
        .update(gamesTable)
        .set({ opening, eco })
        .where(eq(gamesTable.id, game.id));
      updated++;
    }
  }

  res.json({ total: nullOpeningGames.length, updated });
});

// Get sample games for a specific opening — used by the opening detail page
router.get("/games/openings/detail", async (req, res): Promise<void> => {
  const username = (req.query.username as string | undefined)?.toLowerCase();
  const opening  = req.query.opening as string | undefined;
  const eco      = req.query.eco as string | undefined;

  if (!username || (!opening && !eco)) {
    res.status(400).json({ error: "username and opening or eco are required" });
    return;
  }

  // Find games matching this opening (by name or ECO code)
  const allGames = await db
    .select({
      id: gamesTable.id,
      pgn: gamesTable.pgn,
      result: gamesTable.result,
      opening: gamesTable.opening,
      eco: gamesTable.eco,
      whiteUsername: gamesTable.whiteUsername,
      blackUsername: gamesTable.blackUsername,
      whiteRating: gamesTable.whiteRating,
      blackRating: gamesTable.blackRating,
      playedAt: gamesTable.playedAt,
    })
    .from(gamesTable)
    .where(eq(gamesTable.username, username))
    .orderBy(desc(gamesTable.playedAt));

  const matched = allGames.filter(g => {
    if (eco && g.eco === eco) return true;
    if (opening && g.opening === opening) return true;
    return false;
  });

  // Extract opening moves by finding the most common prefix across all games
  const Chess = require("chess.js").Chess;
  const OPENING_HALF_MOVES = 14; // 7 full moves

  // Build a frequency table of moves at each position
  type MoveFreq = Map<string, number>;
  const movesByDepth: MoveFreq[] = Array.from({ length: OPENING_HALF_MOVES }, () => new Map());
  const fensByDepth: string[][] = Array.from({ length: OPENING_HALF_MOVES }, () => []);

  for (const g of matched.slice(0, 30)) {
    try {
      const chess = new Chess();
      chess.loadPgn(g.pgn);
      const history = chess.history({ verbose: true });
      const chess2 = new Chess();
      for (let i = 0; i < Math.min(OPENING_HALF_MOVES, history.length); i++) {
        const m = history[i];
        const key = m.san;
        movesByDepth[i].set(key, (movesByDepth[i].get(key) ?? 0) + 1);
        const fenBefore = chess2.fen();
        fensByDepth[i].push(fenBefore);
        chess2.move(m.san);
      }
    } catch { /* ignore parse errors */ }
  }

  // Build the main line: at each depth, pick the most-played move
  const mainLine: Array<{ san: string; fen: string; moveNumber: number; color: "white" | "black" }> = [];
  const chess = new Chess();
  for (let i = 0; i < OPENING_HALF_MOVES; i++) {
    const freq = movesByDepth[i];
    if (freq.size === 0) break;
    const bestSan = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    try {
      chess.move(bestSan);
      mainLine.push({
        san: bestSan,
        fen: chess.fen(),
        moveNumber: Math.floor(i / 2) + 1,
        color: i % 2 === 0 ? "white" : "black",
      });
    } catch { break; }
  }

  // Return top 10 sample games + main line
  const sampleGames = matched.slice(0, 10).map(g => ({
    id: g.id,
    result: g.result,
    whiteUsername: g.whiteUsername,
    blackUsername: g.blackUsername,
    whiteRating: g.whiteRating,
    blackRating: g.blackRating,
    playedAt: g.playedAt,
    opening: g.opening,
    eco: g.eco,
  }));

  res.json({
    totalGames: matched.length,
    sampleGames,
    mainLine,
    openingName: matched[0]?.opening ?? opening ?? eco ?? "Unknown Opening",
    eco: matched[0]?.eco ?? eco ?? null,
  });
});

router.get("/games/openings", async (req, res): Promise<void> => {
  const username = (req.query.username as string | undefined)?.toLowerCase();
  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  const games = await db
    .select({
      result: gamesTable.result,
      opening: gamesTable.opening,
      eco: gamesTable.eco,
      whiteUsername: gamesTable.whiteUsername,
      blackUsername: gamesTable.blackUsername,
    })
    .from(gamesTable)
    .where(eq(gamesTable.username, username));

  const totalGames = games.length;

  type Stat = { games: number; wins: number; losses: number; draws: number };
  type OpeningStat = {
    eco: string | null;
    opening: string;
    total: Stat;
    white: Stat;
    black: Stat;
  };

  const map = new Map<string, OpeningStat>();

  for (const g of games) {
    const key = g.opening || "Unknown Opening";
    if (!map.has(key)) {
      const empty = (): Stat => ({ games: 0, wins: 0, losses: 0, draws: 0 });
      map.set(key, { eco: g.eco, opening: key, total: empty(), white: empty(), black: empty() });
    }
    const stat = map.get(key)!;
    if (!stat.eco && g.eco) stat.eco = g.eco;

    const isWhite = g.whiteUsername.toLowerCase() === username;
    const colorStat = isWhite ? stat.white : stat.black;

    stat.total.games++;
    colorStat.games++;

    if (g.result === "win") {
      stat.total.wins++;
      colorStat.wins++;
    } else if (g.result === "loss") {
      stat.total.losses++;
      colorStat.losses++;
    } else {
      stat.total.draws++;
      colorStat.draws++;
    }
  }

  const wr = (s: Stat) => (s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0);

  const openings = Array.from(map.values())
    .map((s) => ({
      eco: s.eco,
      opening: s.opening,
      totalGames: s.total.games,
      percentage: totalGames > 0 ? Math.round((s.total.games / totalGames) * 100) : 0,
      wins: s.total.wins,
      losses: s.total.losses,
      draws: s.total.draws,
      winRate: wr(s.total),
      white: { games: s.white.games, wins: s.white.wins, losses: s.white.losses, draws: s.white.draws, winRate: wr(s.white) },
      black: { games: s.black.games, wins: s.black.wins, losses: s.black.losses, draws: s.black.draws, winRate: wr(s.black) },
    }))
    .sort((a, b) => b.totalGames - a.totalGames);

  res.json({ openings, totalGames });
});

router.get("/games/h2h-lookup", async (req, res): Promise<void> => {
  const player1 = (req.query.player1 as string || "").trim().toLowerCase();
  const player2 = (req.query.player2 as string || "").trim().toLowerCase();

  if (!player1 || !player2) {
    res.status(400).json({ error: "Both player1 and player2 are required" });
    return;
  }

  if (player1 === player2) {
    res.status(400).json({ error: "Players must be different" });
    return;
  }

  try {
    req.log.info({ player1, player2 }, "H2H lookup: fetching games from chess.com");
    const games = await fetchChessComGames(player1, 6);

    const h2hGames = games
      .filter(g => {
        const w = g.white.username.toLowerCase();
        const b = g.black.username.toLowerCase();
        return (w === player1 && b === player2) || (w === player2 && b === player1);
      })
      .sort((a, b) => b.end_time - a.end_time)
      .slice(0, 50);

    const results = h2hGames.map(g => {
      const { opening, eco } = extractOpeningFromPgn(g.pgn);
      const moves = parsePgnMoves(g.pgn);
      return {
        id: g.url?.split("/").pop() || String(g.end_time),
        whiteUsername: g.white.username,
        blackUsername: g.black.username,
        whiteRating: g.white.rating,
        blackRating: g.black.rating,
        whiteResult: g.white.result,
        blackResult: g.black.result,
        timeControl: g.time_control,
        playedAt: new Date(g.end_time * 1000).toISOString(),
        opening,
        eco,
        pgn: g.pgn,
        moves,
      };
    });

    res.json({
      player1,
      player2,
      totalGames: results.length,
      games: results,
    });
  } catch (err: any) {
    req.log.error({ err, player1, player2 }, "H2H lookup failed");
    res.status(500).json({ error: err.message || "Failed to fetch games" });
  }
});

router.get("/games/review-status/:jobId", async (req, res): Promise<void> => {
  const [job] = await db.select().from(backgroundJobsTable).where(eq(backgroundJobsTable.id, req.params.jobId as string));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.setHeader("Cache-Control", "no-store");

  if (job.status === "done") {
    const gameId = parseInt(job.targetUsername ?? "0", 10);
    const [game] = await db.select({ reviewData: gamesTable.reviewData }).from(gamesTable).where(eq(gamesTable.id, gameId));
    if (game?.reviewData) {
      const cached = game.reviewData as Record<string, unknown>;
      const moves = cached.moves ?? cached;
      const gameSummary = cached.gameSummary ?? null;
      res.json({ status: "done", reviewData: { moves, gameSummary } });
      return;
    }
  }

  res.json({ status: job.status, error: job.error ?? null });
});

router.get("/games/:id", async (req, res): Promise<void> => {
  const params = GetGameParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  res.json(
    GetGameResponse.parse({
      ...game,
      reviewed: !!(game.reviewData && Array.isArray(game.reviewData) && (game.reviewData as unknown[]).length > 0),
      playedAt: game.playedAt.toISOString(),
      createdAt: game.createdAt.toISOString(),
    })
  );
});

router.get("/games/:id/replay", async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const moves = parsePgnMoves(game.pgn);

  res.json(
    GetGameReplayResponse.parse({
      id: game.id,
      pgn: game.pgn,
      moves,
      whiteUsername: game.whiteUsername,
      blackUsername: game.blackUsername,
      whiteRating: game.whiteRating,
      blackRating: game.blackRating,
      result: game.result,
      opening: game.opening,
      eco: game.eco,
      analysisNotes: game.analysisNotes,
    })
  );
});

router.post("/games/:id/analyze-moves", async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const moves = parsePgnMoves(game.pgn);
  const classifications = await analyzeMoves({
    pgn: game.pgn,
    moves,
    opening: game.opening,
    result: game.result,
    whiteUsername: game.whiteUsername,
    blackUsername: game.blackUsername,
  });

  res.json({ classifications });
});

router.post("/games/:id/analyze-move", async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { moveIndex } = req.body as { moveIndex?: number };
  if (typeof moveIndex !== "number" || moveIndex < 0) {
    res.status(400).json({ error: "moveIndex is required and must be a non-negative number" });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const moves = parsePgnMoves(game.pgn);

  if (moveIndex >= moves.length) {
    res.status(400).json({ error: "moveIndex out of range" });
    return;
  }

  try {
    const analysis = await analyzeSingleMove({
      moves,
      moveIndex,
      opening: game.opening,
      result: game.result,
      whiteUsername: game.whiteUsername,
      blackUsername: game.blackUsername,
    });
    res.json(analysis);
  } catch (err) {
    req.log.error({ err }, "Failed to analyze single move");
    res.status(500).json({ error: "Analysis failed" });
  }
});

async function runReviewJob(gameId: number, jobId: string, log: Logger): Promise<void> {
  try {
    const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId));
    if (!game) {
      await db.update(backgroundJobsTable).set({
        status: "error",
        error: "Game not found",
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, jobId));
      return;
    }

    const moves = parsePgnMoves(game.pgn);
    const reviewResult = await reviewFullGame({
      moves,
      opening: game.opening,
      result: game.result,
      whiteUsername: game.whiteUsername,
      blackUsername: game.blackUsername,
    });

    await db.update(gamesTable)
      .set({ reviewData: reviewResult as unknown as Record<string, unknown> })
      .where(eq(gamesTable.id, gameId));

    await db.update(backgroundJobsTable).set({
      status: "done",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));

    log.info({ jobId, gameId }, "Review job complete");
  } catch (err) {
    log.error({ err, jobId, gameId }, "Review job failed");
    const msg = err instanceof Error ? err.message : "Review failed";
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: msg,
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  }
}

router.get("/games/:id/review", async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select({ reviewData: gamesTable.reviewData })
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  if (game.reviewData) {
    const cached = game.reviewData as Record<string, unknown>;
    const moves = cached.moves ?? cached;
    const gameSummary = cached.gameSummary ?? null;
    res.json({ status: "done", reviewData: { moves, gameSummary } });
    return;
  }

  const [activeJob] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.type, "review"),
      eq(backgroundJobsTable.targetUsername, String(params.data.id)),
      eq(backgroundJobsTable.status, "pending"),
    )
  );

  if (activeJob) {
    res.json({ status: "pending", jobId: activeJob.id });
    return;
  }

  res.json({ status: "none", reviewData: null });
});

router.post("/games/:id/review", async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const forceReview = req.query.force === "true";

  if (game.reviewData && !forceReview) {
    const cached = game.reviewData as Record<string, unknown>;
    const moves = cached.moves ?? cached;
    const gameSummary = cached.gameSummary ?? null;
    res.json({ status: "done", reviewData: { moves, gameSummary } });
    return;
  }

  const [existingJob] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.type, "review"),
      eq(backgroundJobsTable.targetUsername, String(params.data.id)),
      eq(backgroundJobsTable.status, "pending"),
    )
  );

  if (existingJob) {
    res.json({ status: "pending", jobId: existingJob.id });
    return;
  }

  if (forceReview) {
    await db.update(gamesTable)
      .set({ reviewData: null })
      .where(eq(gamesTable.id, params.data.id));
  }

  const userId = req.user?.id ?? "anonymous";
  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId,
    userId,
    type: "review",
    status: "pending",
    targetUsername: String(params.data.id),
  });

  res.json({ status: "pending", jobId });
  runReviewJob(params.data.id, jobId, req.log).catch(() => {});
});

export default router;
