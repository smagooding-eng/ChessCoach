import { Router, type IRouter } from "express";
import { db, gamesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { fetchChessComGames, extractGameMetadata, fetchChessComProfile } from "../lib/chesscom";
import { analyzePlayerGames } from "../lib/openaiAnalysis";

const router: IRouter = Router();

router.post("/opponents/analyze", async (req, res): Promise<void> => {
  const { username } = req.body as { username?: string };
  const requestingUser = (req.headers["x-chess-username"] as string | undefined)?.toLowerCase() || null;

  if (!username || typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  const target = username.trim().toLowerCase();
  req.log.info({ target }, "Analyzing opponent");

  // Fetch profile, games, and head-to-head in parallel
  const [profileResult, gamesResult] = await Promise.allSettled([
    fetchChessComProfile(target),
    fetchChessComGames(target, 2),
  ]);

  if (gamesResult.status === "rejected" || (gamesResult.status === "fulfilled" && gamesResult.value.length === 0)) {
    const noGames = gamesResult.status === "fulfilled" && gamesResult.value.length === 0;
    res.status(noGames ? 404 : 400).json({
      error: noGames
        ? `No recent games found for "${target}".`
        : `Could not fetch games for "${target}". Check the username.`,
    });
    return;
  }

  const games = gamesResult.value;
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;

  const gameSummaries = games.slice(0, 40).map((g) => {
    const meta = extractGameMetadata(g, target);
    return {
      pgn: g.pgn ?? "",
      result: meta.result,
      opening: meta.opening,
      timeControl: meta.timeControl,
      whiteUsername: meta.whiteUsername,
      blackUsername: meta.blackUsername,
      whiteRating: meta.whiteRating ?? 0,
      blackRating: meta.blackRating ?? 0,
    };
  });

  const analysis = await analyzePlayerGames(target, gameSummaries);

  // Compute win/loss/draw and opening stats
  // NOTE: g.result is already from the target player's perspective (extracted by extractGameMetadata)
  let wins = 0, losses = 0, draws = 0;
  const openingMap = new Map<string, { games: number; wins: number }>();
  for (const g of gameSummaries) {
    const result = g.result === "win" ? "win" : g.result === "loss" ? "loss" : "draw";

    if (result === "win") wins++;
    else if (result === "loss") losses++;
    else draws++;

    const opening = g.opening || "Unknown";
    if (!openingMap.has(opening)) openingMap.set(opening, { games: 0, wins: 0 });
    const s = openingMap.get(opening)!;
    s.games++;
    if (result === "win") s.wins++;
  }

  const topOpenings = Array.from(openingMap.entries())
    .map(([opening, s]) => ({ opening, games: s.games, winRate: Math.round((s.wins / s.games) * 100) }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 5);

  // Head-to-head — only if requesting user is known
  let headToHead: { wins: number; losses: number; draws: number; total: number } | null = null;
  if (requestingUser && requestingUser !== target) {
    try {
      const h2hRows = await db
        .select({
          whiteUsername: gamesTable.whiteUsername,
          blackUsername: gamesTable.blackUsername,
          result: gamesTable.result,
        })
        .from(gamesTable)
        .where(
          sql`(
            (lower(${gamesTable.whiteUsername}) = ${requestingUser} AND lower(${gamesTable.blackUsername}) = ${target})
            OR
            (lower(${gamesTable.whiteUsername}) = ${target} AND lower(${gamesTable.blackUsername}) = ${requestingUser})
          )`
        )
        .limit(200);

      let h2wWins = 0, h2hLosses = 0, h2hDraws = 0;
      for (const row of h2hRows) {
        const userIsWhite = row.whiteUsername.toLowerCase() === requestingUser;
        const result = userIsWhite
          ? row.result
          : row.result === "win" ? "loss" : row.result === "loss" ? "win" : "draw";
        if (result === "win") h2wWins++;
        else if (result === "loss") h2hLosses++;
        else h2hDraws++;
      }

      if (h2hRows.length > 0) {
        headToHead = { wins: h2wWins, losses: h2hLosses, draws: h2hDraws, total: h2hRows.length };
      }
    } catch (err) {
      req.log.warn({ err }, "Head-to-head query failed");
    }
  }

  res.json({
    username: target,
    profile,
    gamesAnalyzed: gameSummaries.length,
    wins,
    losses,
    draws,
    weaknesses: analysis.weaknesses,
    topOpenings,
    headToHead,
  });
});

export default router;
