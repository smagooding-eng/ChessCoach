import { Router, type IRouter } from "express";
import { fetchChessComGames, extractGameMetadata } from "../lib/chesscom";
import { analyzePlayerGames } from "../lib/openaiAnalysis";

const router: IRouter = Router();

router.post("/opponents/analyze", async (req, res): Promise<void> => {
  const { username } = req.body as { username?: string };
  if (!username || typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  const target = username.trim().toLowerCase();
  req.log.info({ target }, "Analyzing opponent");

  let games;
  try {
    games = await fetchChessComGames(target, 2); // last 2 months
  } catch {
    res.status(400).json({ error: `Could not fetch games for "${target}". Check the username.` });
    return;
  }

  if (games.length === 0) {
    res.status(404).json({ error: `No recent games found for "${target}".` });
    return;
  }

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

  // Also compute quick stats
  let wins = 0, losses = 0, draws = 0;
  const openingMap = new Map<string, { games: number; wins: number }>();
  for (const g of gameSummaries) {
    const isWhite = g.whiteUsername.toLowerCase() === target;
    const result = isWhite
      ? g.result === "win" ? "win" : g.result === "loss" ? "loss" : "draw"
      : g.result === "win" ? "loss" : g.result === "loss" ? "win" : "draw";

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

  res.json({
    username: target,
    gamesAnalyzed: gameSummaries.length,
    wins,
    losses,
    draws,
    weaknesses: analysis.weaknesses,
    topOpenings,
  });
});

export default router;
