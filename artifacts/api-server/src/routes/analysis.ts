import { Router, type IRouter } from "express";
import { db, gamesTable, weaknessesTable, coursesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import {
  AnalyzeGamesBody,
  AnalyzeGamesResponse,
  GetWeaknessesQueryParams,
  GetWeaknessesResponse,
  GetAnalysisSummaryQueryParams,
  GetAnalysisSummaryResponse,
} from "@workspace/api-zod";
import { analyzePlayerGames } from "../lib/openaiAnalysis";

const router: IRouter = Router();

router.post("/analysis/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username } = parsed.data;

  req.log.info({ username }, "Starting game analysis");

  const games = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.username, username.toLowerCase()))
    .orderBy(desc(gamesTable.playedAt))
    .limit(50);

  if (games.length === 0) {
    res.status(400).json({ error: "No games found for this username. Import games first." });
    return;
  }

  const gameSummaries = games.map((g) => ({
    pgn: g.pgn,
    result: g.result,
    opening: g.opening,
    timeControl: g.timeControl,
    whiteUsername: g.whiteUsername,
    blackUsername: g.blackUsername,
    whiteRating: g.whiteRating,
    blackRating: g.blackRating,
  }));

  const analysis = await analyzePlayerGames(username, gameSummaries);

  await db.delete(weaknessesTable).where(eq(weaknessesTable.username, username.toLowerCase()));

  for (const weakness of analysis.weaknesses) {
    await db.insert(weaknessesTable).values({
      username: username.toLowerCase(),
      category: weakness.category,
      severity: weakness.severity,
      description: weakness.description,
      frequency: weakness.frequency,
      examples: weakness.examples,
    });
  }

  await db
    .update(gamesTable)
    .set({ analyzed: true })
    .where(eq(gamesTable.username, username.toLowerCase()));

  res.json(
    AnalyzeGamesResponse.parse({
      username,
      gamesAnalyzed: games.length,
      weaknesses: analysis.weaknesses,
      summary: analysis.summary,
    })
  );
});

router.get("/analysis/weaknesses", async (req, res): Promise<void> => {
  const query = GetWeaknessesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { username } = query.data;

  const weaknesses = await db
    .select()
    .from(weaknessesTable)
    .where(eq(weaknessesTable.username, username.toLowerCase()))
    .orderBy(desc(weaknessesTable.createdAt));

  const lastUpdated = weaknesses.length > 0 ? weaknesses[0].createdAt.toISOString() : null;

  res.json(
    GetWeaknessesResponse.parse({
      username,
      weaknesses: weaknesses.map((w) => ({
        ...w,
        createdAt: w.createdAt.toISOString(),
      })),
      lastUpdated,
    })
  );
});

router.get("/analysis/summary", async (req, res): Promise<void> => {
  const query = GetAnalysisSummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { username } = query.data;

  const games = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.username, username.toLowerCase()));

  const totalGames = games.length;

  let wins = 0, losses = 0, draws = 0;
  const openingMap = new Map<string, { games: number; wins: number; losses: number; draws: number }>();
  const timeControlMap = new Map<string, { games: number; wins: number; losses: number }>();
  let totalRating = 0;

  for (const g of games) {
    const userIsWhite = g.whiteUsername.toLowerCase() === username.toLowerCase();
    const rating = userIsWhite ? g.whiteRating : g.blackRating;
    if (rating > 0) totalRating += rating;

    const result = g.result;
    if (result === "win") wins++;
    else if (result === "loss") losses++;
    else draws++;

    const opening = g.opening || "Unknown Opening";
    if (!openingMap.has(opening)) {
      openingMap.set(opening, { games: 0, wins: 0, losses: 0, draws: 0 });
    }
    const opStat = openingMap.get(opening)!;
    opStat.games++;
    if (result === "win") opStat.wins++;
    else if (result === "loss") opStat.losses++;
    else opStat.draws++;

    const tc = g.timeControl;
    if (!timeControlMap.has(tc)) {
      timeControlMap.set(tc, { games: 0, wins: 0, losses: 0 });
    }
    const tcStat = timeControlMap.get(tc)!;
    tcStat.games++;
    if (result === "win") tcStat.wins++;
    else if (result === "loss") tcStat.losses++;
  }

  const openingStats = Array.from(openingMap.entries())
    .map(([opening, stat]) => ({ opening, ...stat }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 8);

  const resultsByTimeControl = Array.from(timeControlMap.entries())
    .map(([timeControl, stat]) => ({ timeControl, ...stat }))
    .sort((a, b) => b.games - a.games);

  res.json(
    GetAnalysisSummaryResponse.parse({
      username,
      totalGames,
      wins,
      losses,
      draws,
      winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) / 100 : 0,
      avgRating: totalGames > 0 ? Math.round(totalRating / totalGames) : 0,
      openingStats,
      resultsByTimeControl,
    })
  );
});

// GET /api/analysis/weaknesses/:id — weakness detail with related games + courses
router.get("/analysis/weaknesses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid weakness id" });
    return;
  }

  const [weakness] = await db
    .select()
    .from(weaknessesTable)
    .where(eq(weaknessesTable.id, id));

  if (!weakness) {
    res.status(404).json({ error: "Weakness not found" });
    return;
  }

  const relatedGames = await db
    .select({
      id: gamesTable.id,
      whiteUsername: gamesTable.whiteUsername,
      blackUsername: gamesTable.blackUsername,
      result: gamesTable.result,
      opening: gamesTable.opening,
      timeControl: gamesTable.timeControl,
      playedAt: gamesTable.playedAt,
      whiteRating: gamesTable.whiteRating,
      blackRating: gamesTable.blackRating,
    })
    .from(gamesTable)
    .where(eq(gamesTable.username, weakness.username))
    .orderBy(desc(gamesTable.playedAt))
    .limit(8);

  const relatedCourses = await db
    .select()
    .from(coursesTable)
    .where(
      and(
        eq(coursesTable.username, weakness.username),
        eq(coursesTable.category, weakness.category)
      )
    );

  res.json({
    weakness: { ...weakness, createdAt: weakness.createdAt.toISOString() },
    relatedGames: relatedGames.map((g) => ({
      ...g,
      playedAt: g.playedAt?.toISOString() ?? null,
    })),
    relatedCourses: relatedCourses.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});

export default router;
