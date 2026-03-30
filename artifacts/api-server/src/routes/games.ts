import { Router, type IRouter } from "express";
import { db, gamesTable } from "@workspace/db";
import { eq, desc, count, isNull } from "drizzle-orm";
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
