import { Router, type IRouter } from "express";
import { db, gamesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
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
import { fetchChessComGames, extractGameMetadata, parsePgnMoves } from "../lib/chesscom";
import { analyzeMoves, analyzeSingleMove } from "../lib/openaiAnalysis";

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
        playedAt: g.playedAt.toISOString(),
        createdAt: g.createdAt.toISOString(),
      })),
      total: Number(total),
    })
  );
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

export default router;
