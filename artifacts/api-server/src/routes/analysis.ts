import { Router, type IRouter } from "express";
import { db, gamesTable, weaknessesTable, coursesTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  AnalyzeGamesBody,
  AnalyzeGamesResponse,
  GetWeaknessesQueryParams,
  GetWeaknessesResponse,
  GetAnalysisSummaryQueryParams,
  GetAnalysisSummaryResponse,
} from "@workspace/api-zod";
import { analyzePlayerGames } from "../lib/openaiAnalysis";
import { randomUUID } from "crypto";
import type { Logger } from "pino";

const router: IRouter = Router();

// In-memory job store for long-running analysis
type AnalysisJobStatus = "pending" | "done" | "error";
interface AnalysisJob {
  status: AnalysisJobStatus;
  error?: string;
  createdAt: number;
}
const analysisJobs = new Map<string, AnalysisJob>();

setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of analysisJobs) {
    if (job.createdAt < cutoff) analysisJobs.delete(id);
  }
}, 5 * 60 * 1000);

async function runAnalysisJob(username: string, jobId: string, log: Logger): Promise<void> {
  try {
    const games = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.username, username.toLowerCase()))
      .orderBy(desc(gamesTable.playedAt))
      .limit(50);

    if (games.length === 0) {
      analysisJobs.set(jobId, { status: "error", error: "No games found. Import games first.", createdAt: Date.now() });
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
      gameId: g.id,
    }));

    const analysis = await analyzePlayerGames(username, gameSummaries);

    await db.delete(weaknessesTable).where(eq(weaknessesTable.username, username.toLowerCase()));

    for (const weakness of analysis.weaknesses) {
      const relatedGameIds = (weakness.relatedGameIndices ?? [])
        .filter((idx) => idx >= 0 && idx < games.length)
        .map((idx) => games[idx].id)
        .filter((id): id is number => typeof id === "number");

      await db.insert(weaknessesTable).values({
        username: username.toLowerCase(),
        category: weakness.category,
        severity: weakness.severity,
        description: weakness.description,
        frequency: weakness.frequency,
        examples: weakness.examples,
        relatedGameIds,
      });
    }

    await db
      .update(gamesTable)
      .set({ analyzed: true })
      .where(eq(gamesTable.username, username.toLowerCase()));

    log.info({ jobId, username }, "Analysis job complete");
    analysisJobs.set(jobId, { status: "done", createdAt: Date.now() });
  } catch (err) {
    log.error({ err, jobId }, "Analysis job failed");
    const msg = err instanceof Error ? err.message : "Analysis failed";
    analysisJobs.set(jobId, { status: "error", error: msg, createdAt: Date.now() });
  }
}

// POST /api/analysis/start — kick off analysis, return jobId immediately
router.post("/analysis/start", async (req, res): Promise<void> => {
  const parsed = AnalyzeGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username } = parsed.data;
  const jobId = randomUUID();
  analysisJobs.set(jobId, { status: "pending", createdAt: Date.now() });
  res.json({ jobId });
  runAnalysisJob(username.toLowerCase(), jobId, req.log).catch(() => {});
});

// GET /api/analysis/status/:jobId — poll for result
router.get("/analysis/status/:jobId", (req, res): void => {
  const job = analysisJobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.json({ status: job.status, error: job.error });
});

// POST /api/analysis/analyze — kept for backward compat (blocking, avoid in production)
router.post("/analysis/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username } = parsed.data;
  req.log.info({ username }, "Starting game analysis (blocking)");

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
    gameId: g.id,
  }));

  const analysis = await analyzePlayerGames(username, gameSummaries);

  await db.delete(weaknessesTable).where(eq(weaknessesTable.username, username.toLowerCase()));

  for (const weakness of analysis.weaknesses) {
    const relatedGameIds = (weakness.relatedGameIndices ?? [])
      .filter((idx) => idx >= 0 && idx < games.length)
      .map((idx) => games[idx].id)
      .filter((id): id is number => typeof id === "number");

    await db.insert(weaknessesTable).values({
      username: username.toLowerCase(),
      category: weakness.category,
      severity: weakness.severity,
      description: weakness.description,
      frequency: weakness.frequency,
      examples: weakness.examples,
      relatedGameIds,
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

  // Prefer AI-selected specific game IDs; fall back to recent games
  const gameSelectFields = {
    id: gamesTable.id,
    whiteUsername: gamesTable.whiteUsername,
    blackUsername: gamesTable.blackUsername,
    result: gamesTable.result,
    opening: gamesTable.opening,
    timeControl: gamesTable.timeControl,
    playedAt: gamesTable.playedAt,
    whiteRating: gamesTable.whiteRating,
    blackRating: gamesTable.blackRating,
    pgn: gamesTable.pgn,
  };

  let relatedGames;
  if (weakness.relatedGameIds && weakness.relatedGameIds.length > 0) {
    relatedGames = await db
      .select(gameSelectFields)
      .from(gamesTable)
      .where(inArray(gamesTable.id, weakness.relatedGameIds));
  } else {
    relatedGames = await db
      .select(gameSelectFields)
      .from(gamesTable)
      .where(eq(gamesTable.username, weakness.username))
      .orderBy(desc(gamesTable.playedAt))
      .limit(8);
  }

  // Extract a representative mid-game FEN from each related game
  function extractMidGameFen(pgn: string | null): string | null {
    if (!pgn) return null;
    try {
      const Chess = require("chess.js").Chess;
      const chess = new Chess();
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });
      const midPoint = Math.min(Math.floor(history.length * 0.55), history.length);
      if (midPoint === 0) return null;
      const player = new Chess();
      for (let i = 0; i < midPoint; i++) player.move(history[i].san);
      return player.fen();
    } catch {
      return null;
    }
  }

  const relatedCourses = await db
    .select()
    .from(coursesTable)
    .where(
      and(
        eq(coursesTable.username, weakness.username),
        eq(coursesTable.category, weakness.category)
      )
    );

  // Resolve "Game N" ordinal references in AI-generated examples to actual game IDs.
  // The analysis uses orderBy(desc(playedAt)).limit(50), so Game 1 = most recent.
  const analysisGames = await db
    .select({ id: gamesTable.id })
    .from(gamesTable)
    .where(eq(gamesTable.username, weakness.username))
    .orderBy(desc(gamesTable.playedAt))
    .limit(50);

  const ordinalToId: Record<number, number> = {};
  analysisGames.forEach((g, idx) => { ordinalToId[idx + 1] = g.id; });

  function extractGameIdsFromText(text: string): number[] {
    const ids: number[] = [];
    // Matches: "Game 2", "Games 29-30", "Games 6 and 13", etc.
    const re = /[Gg]ames?\s+(\d+)(?:\s*[-–]\s*(\d+))?(?:\s+and\s+(\d+))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = parseInt(m[1]);
      if (m[2]) {
        const end = parseInt(m[2]);
        for (let i = start; i <= end; i++) if (ordinalToId[i]) ids.push(ordinalToId[i]);
      } else {
        if (ordinalToId[start]) ids.push(ordinalToId[start]);
      }
      if (m[3]) {
        const extra = parseInt(m[3]);
        if (ordinalToId[extra]) ids.push(ordinalToId[extra]);
      }
    }
    return [...new Set(ids)];
  }

  const examplesWithLinks = (weakness.examples ?? []).map((text) => ({
    text,
    gameIds: extractGameIdsFromText(text),
  }));

  res.json({
    weakness: { ...weakness, createdAt: weakness.createdAt.toISOString() },
    examplesWithLinks,
    relatedGames: relatedGames.map((g) => ({
      id: g.id,
      whiteUsername: g.whiteUsername,
      blackUsername: g.blackUsername,
      result: g.result,
      opening: g.opening,
      timeControl: g.timeControl,
      playedAt: g.playedAt?.toISOString() ?? null,
      whiteRating: g.whiteRating,
      blackRating: g.blackRating,
      midGameFen: extractMidGameFen(g.pgn),
    })),
    relatedCourses: relatedCourses.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});

export default router;
