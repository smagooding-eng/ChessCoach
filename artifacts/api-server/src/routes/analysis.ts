import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { requirePremium } from "../middlewares/authMiddleware";
import { db, gamesTable, weaknessesTable, coursesTable, backgroundJobsTable } from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import {
  AnalyzeGamesBody,
  AnalyzeGamesResponse,
  GetWeaknessesQueryParams,
  GetWeaknessesResponse,
  GetAnalysisSummaryQueryParams,
  GetAnalysisSummaryResponse,
} from "@workspace/api-zod";
import { analyzePlayerGames, computeGroundedWeaknesses } from "../lib/openaiAnalysis";
import { accuracyFromAvgLoss, evaluateAllPositions, classifyFromWinPctLoss, winPct, isSacrificialMove } from "../lib/engineAnalysis";
import { randomUUID } from "crypto";
import type { Logger } from "pino";
import OpenAI from "openai";
import { Chess } from "chess.js";
import sharp from "sharp";

const router: IRouter = Router();

async function runAnalysisJob(username: string, jobId: string, log: Logger, userId: string): Promise<void> {
  try {
    const games = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.username, username.toLowerCase()))
      .orderBy(desc(gamesTable.playedAt))
      .limit(50);

    if (games.length === 0) {
      await db.update(backgroundJobsTable).set({
        status: "error",
        error: "No games found. Import games first.",
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, jobId));
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

    // Prefer real engine-grounded weakness detection, computed from the
    // user's FULL reviewed history (not just the last 50 games above, which
    // exist mainly to feed the GPT fallback) — "consistent trends across
    // all games" should actually mean all games, not a recent slice. Only
    // the columns the grounded function needs are selected, skipping the
    // (potentially large) pgn text.
    const allReviewed = await db
      .select({
        id: gamesTable.id,
        opening: gamesTable.opening,
        whiteUsername: gamesTable.whiteUsername,
        blackUsername: gamesTable.blackUsername,
        reviewData: gamesTable.reviewData,
      })
      .from(gamesTable)
      .where(and(
        eq(gamesTable.username, username.toLowerCase()),
        sql`${gamesTable.reviewData} IS NOT NULL`,
      ))
      .orderBy(desc(gamesTable.playedAt))
      .limit(500);

    const grounded = computeGroundedWeaknesses(username, allReviewed);
    // Free users get the grounded (stats-based, zero OpenAI cost) weakness
    // detection only -- if there isn't enough reviewed-game data for it
    // yet, they see a "review more games" prompt rather than silently
    // falling back to the paid AI analysis. Pro users keep the existing
    // behavior: prefer grounded when available, fall back to full AI
    // analysis otherwise.
    const { hasFullAccess } = await import("../lib/accessControl");
    const { full: isFullAccess } = await hasFullAccess(userId);
    const analysis = grounded ?? (isFullAccess ? await analyzePlayerGames(username, gameSummaries) : null);

    if (!analysis) {
      await db.update(backgroundJobsTable).set({
        status: "error",
        error: "Not enough reviewed games yet for a weakness report. Review a few more games, or upgrade to Pro for full analysis.",
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, jobId));
      return;
    }
    const indexSourceGames = grounded ? allReviewed : games;

    await db.delete(weaknessesTable).where(eq(weaknessesTable.username, username.toLowerCase()));

    for (const weakness of analysis.weaknesses) {
      const relatedGameIds = (weakness.relatedGameIndices ?? [])
        .filter((idx) => idx >= 0 && idx < indexSourceGames.length)
        .map((idx) => indexSourceGames[idx].id)
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
    await db.update(backgroundJobsTable).set({
      status: "done",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  } catch (err) {
    log.error({ err, jobId }, "Analysis job failed");
    const msg = err instanceof Error ? err.message : "Analysis failed";
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: msg,
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  }
}

router.post("/analysis/start", async (req, res): Promise<void> => {
  const parsed = AnalyzeGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username } = parsed.data;
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [pending] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "analysis"),
      eq(backgroundJobsTable.status, "pending"),
    )
  );

  if (pending) {
    const age = Date.now() - new Date(pending.createdAt).getTime();
    if (age > 10 * 60 * 1000) {
      await db.update(backgroundJobsTable).set({
        status: "error",
        error: "Timed out (server restart or crash)",
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, pending.id));
    } else {
      res.json({ jobId: pending.id });
      return;
    }
  }

  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId,
    userId,
    type: "analysis",
    status: "pending",
    targetUsername: username.toLowerCase(),
  });

  res.json({ jobId });
  runAnalysisJob(username.toLowerCase(), jobId, req.log, userId).catch(() => {});
});

router.get("/analysis/status/:jobId", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [job] = await db.select().from(backgroundJobsTable).where(
    and(eq(backgroundJobsTable.id, req.params.jobId as string), eq(backgroundJobsTable.userId, userId))
  );
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: job.status, error: job.error });
});

router.get("/analysis/active-job", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.json({ job: null }); return; }

  const [job] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "analysis"),
    )
  ).orderBy(desc(backgroundJobsTable.createdAt)).limit(1);

  if (!job) { res.json({ job: null }); return; }

  const ageMs = Date.now() - job.createdAt.getTime();
  if (job.status === "pending" && ageMs > 10 * 60 * 1000) {
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: "Timed out (server restart or crash)",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, job.id));
    res.json({ job: null });
    return;
  }
  if (job.status === "done" && ageMs > 60_000) {
    res.json({ job: null });
    return;
  }
  if (job.status === "error" && ageMs > 60_000) {
    res.json({ job: null });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.json({ job: { id: job.id, status: job.status, error: job.error, createdAt: job.createdAt.toISOString() } });
});

router.post("/analysis/analyze", requirePremium, async (req, res): Promise<void> => {
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

  const allReviewed = await db
    .select({
      id: gamesTable.id,
      opening: gamesTable.opening,
      whiteUsername: gamesTable.whiteUsername,
      blackUsername: gamesTable.blackUsername,
      reviewData: gamesTable.reviewData,
    })
    .from(gamesTable)
    .where(and(
      eq(gamesTable.username, username.toLowerCase()),
      sql`${gamesTable.reviewData} IS NOT NULL`,
    ))
    .orderBy(desc(gamesTable.playedAt))
    .limit(500);

  const grounded = computeGroundedWeaknesses(username, allReviewed);
  const analysis = grounded ?? await analyzePlayerGames(username, gameSummaries);
  const indexSourceGames = grounded ? allReviewed : games;

  await db.delete(weaknessesTable).where(eq(weaknessesTable.username, username.toLowerCase()));

  for (const weakness of analysis.weaknesses) {
    const relatedGameIds = (weakness.relatedGameIndices ?? [])
      .filter((idx) => idx >= 0 && idx < indexSourceGames.length)
      .map((idx) => indexSourceGames[idx].id)
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

  // Build preview FENs by looking up each weakness's first related game's PGN
  const allGameIds = Array.from(new Set(
    weaknesses.flatMap((w) => (w.relatedGameIds ?? []).slice(0, 1))
  ));
  const pgnById = new Map<number, string | null>();
  if (allGameIds.length > 0) {
    const rows = await db
      .select({ id: gamesTable.id, pgn: gamesTable.pgn })
      .from(gamesTable)
      .where(inArray(gamesTable.id, allGameIds));
    for (const r of rows) pgnById.set(r.id, r.pgn);
  }
  function fenFromPgn(pgn: string | null): string | null {
    if (!pgn) return null;
    try {
      const Chess = require("chess.js").Chess;
      const c = new Chess();
      c.loadPgn(pgn);
      const history = c.history({ verbose: true });
      const mid = Math.min(Math.floor(history.length * 0.55), history.length);
      if (mid === 0) return null;
      const player = new Chess();
      for (let i = 0; i < mid; i++) player.move(history[i].san);
      return player.fen();
    } catch {
      return null;
    }
  }

  // Memoize PGN -> FEN parsing per gameId so weaknesses sharing the same first
  // related game don't repeat the parse.
  const fenByGameId = new Map<number, string | null>();

  res.json(
    GetWeaknessesResponse.parse({
      username,
      weaknesses: weaknesses.map((w) => {
        const firstId = (w.relatedGameIds ?? [])[0];
        let previewFen: string | null = null;
        if (firstId != null) {
          if (fenByGameId.has(firstId)) {
            previewFen = fenByGameId.get(firstId) ?? null;
          } else {
            previewFen = fenFromPgn(pgnById.get(firstId) ?? null);
            fenByGameId.set(firstId, previewFen);
          }
        }
        return {
          ...w,
          previewFen,
          createdAt: w.createdAt.toISOString(),
        };
      }),
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
    .select({
      whiteUsername: gamesTable.whiteUsername,
      blackUsername: gamesTable.blackUsername,
      whiteRating: gamesTable.whiteRating,
      blackRating: gamesTable.blackRating,
      result: gamesTable.result,
      opening: gamesTable.opening,
      timeControl: gamesTable.timeControl,
      playedAt: gamesTable.playedAt,
      reviewData: gamesTable.reviewData,
    })
    .from(gamesTable)
    .where(eq(gamesTable.username, username.toLowerCase()));

  const reviewedCount = games.filter(
    (g) => g.reviewData && typeof g.reviewData === "object"
  ).length;

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

  // Build last-6-month trend (chronological), bucketed by UTC year-month for TZ stability
  const monthlyMap = new Map<string, { wins: number; losses: number; draws: number; games: number }>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, { wins: 0, losses: 0, draws: 0, games: 0 });
  }
  for (const g of games) {
    if (!g.playedAt) continue;
    const d = new Date(g.playedAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = monthlyMap.get(key);
    if (!bucket) continue;
    bucket.games++;
    if (g.result === "win") bucket.wins++;
    else if (g.result === "loss") bucket.losses++;
    else bucket.draws++;
  }
  const monthlyTrend = Array.from(monthlyMap.entries()).map(([month, b]) => ({
    month,
    wins: b.wins,
    losses: b.losses,
    draws: b.draws,
    games: b.games,
    winRate: b.games > 0 ? Math.round((b.wins / b.games) * 100) / 100 : 0,
  }));

  // Phase accuracy across all reviewed games. Phases are bucketed by full-move number
  // (moveIndex/2 + 1): opening = 1-15, middlegame = 16-32, endgame = 33+.
  type PhaseKey = "opening" | "middlegame" | "endgame";
  const WIN_PCT_MAP: Record<string, number> = {
    checkmate: 0, brilliant: 0, great: 0, best: 0, excellent: 0.5, book: 0.7, good: 2,
    inaccuracy: 8, mistake: 16, blunder: 33, missed_win: 25,
  };
  const phaseBuckets: Record<PhaseKey, {
    moves: number; winPctLossSum: number;
    blunders: number; mistakes: number; inaccuracies: number; bestOrBetter: number;
  }> = {
    opening:    { moves: 0, winPctLossSum: 0, blunders: 0, mistakes: 0, inaccuracies: 0, bestOrBetter: 0 },
    middlegame: { moves: 0, winPctLossSum: 0, blunders: 0, mistakes: 0, inaccuracies: 0, bestOrBetter: 0 },
    endgame:    { moves: 0, winPctLossSum: 0, blunders: 0, mistakes: 0, inaccuracies: 0, bestOrBetter: 0 },
  };
  let gamesAnalyzed = 0;
  const monthlyAccuracyMap = new Map<string, { moves: number; winPctLossSum: number; blunders: number }>();
  for (const g of games) {
    if (!g.reviewData || typeof g.reviewData !== "object") continue;
    const rd = g.reviewData as { moves?: unknown };
    const movesArr = Array.isArray(rd.moves) ? rd.moves : Array.isArray(g.reviewData) ? (g.reviewData as unknown[]) : null;
    if (!movesArr || movesArr.length === 0) continue;

    const userColor: "white" | "black" = g.whiteUsername.toLowerCase() === username.toLowerCase() ? "white" : "black";
    let contributedThisGame = false;
    const gameMonthKey = g.playedAt
      ? `${new Date(g.playedAt).getUTCFullYear()}-${String(new Date(g.playedAt).getUTCMonth() + 1).padStart(2, "0")}`
      : null;

    for (const raw of movesArr) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as {
        moveIndex?: number; color?: string; classification?: string;
        cpLoss?: number | null; engineAvailable?: boolean;
      };
      if (m.color !== userColor) continue;
      if (typeof m.classification !== "string") continue;

      const moveNumber = Math.floor((m.moveIndex ?? 0) / 2) + 1;
      const phase: PhaseKey =
        moveNumber <= 15 ? "opening" :
        moveNumber <= 32 ? "middlegame" : "endgame";

      const bucket = phaseBuckets[phase];
      bucket.moves++;
      contributedThisGame = true;

      const cls = m.classification;
      if (cls === "blunder") bucket.blunders++;
      else if (cls === "mistake" || cls === "missed_win") bucket.mistakes++;
      else if (cls === "inaccuracy") bucket.inaccuracies++;
      else if (["best", "great", "brilliant", "excellent"].includes(cls)) bucket.bestOrBetter++;

      const base = WIN_PCT_MAP[cls] ?? 2;
      const useEngine = m.cpLoss != null && m.engineAvailable === true;
      const sample = useEngine
        ? (m.cpLoss as number)
        : Math.max(base, ["good", "book", "excellent", "best", "great"].includes(cls) && !m.engineAvailable ? 3 : base);
      bucket.winPctLossSum += sample;

      // Progression tracking: same per-move data, bucketed by the game's
      // month instead of by game phase, so accuracy/blunder-rate over time
      // is a real computed trend rather than just win/loss counts.
      if (gameMonthKey) {
        if (!monthlyAccuracyMap.has(gameMonthKey)) {
          monthlyAccuracyMap.set(gameMonthKey, { moves: 0, winPctLossSum: 0, blunders: 0 });
        }
        const mBucket = monthlyAccuracyMap.get(gameMonthKey)!;
        mBucket.moves++;
        mBucket.winPctLossSum += sample;
        if (cls === "blunder") mBucket.blunders++;
      }
    }
    if (contributedThisGame) gamesAnalyzed++;
  }
  const phaseStat = (b: typeof phaseBuckets["opening"]) => ({
    accuracy: b.moves > 0 ? Math.round(accuracyFromAvgLoss(b.winPctLossSum / b.moves)) : 0,
    moves: b.moves,
    blunders: b.blunders,
    mistakes: b.mistakes,
    inaccuracies: b.inaccuracies,
    bestOrBetter: b.bestOrBetter,
  });
  const phaseAccuracy = {
    opening: phaseStat(phaseBuckets.opening),
    middlegame: phaseStat(phaseBuckets.middlegame),
    endgame: phaseStat(phaseBuckets.endgame),
    gamesAnalyzed,
  };

  // Real progression over time: accuracy and blunder rate by month, computed
  // from actual engine-verified move classifications — not just win/loss
  // counts (monthlyTrend, above), so this can genuinely show "you're
  // blundering less than you were 3 months ago" or the reverse.
  const accuracyTrend = Array.from(monthlyAccuracyMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, b]) => ({
      month,
      accuracy: b.moves > 0 ? Math.round(accuracyFromAvgLoss(b.winPctLossSum / b.moves)) : 0,
      moves: b.moves,
      blunderRate: b.moves > 0 ? Math.round((b.blunders / b.moves) * 1000) / 10 : 0,
    }));

  res.json(
    GetAnalysisSummaryResponse.parse({
      username,
      totalGames,
      wins,
      losses,
      draws,
      winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) / 100 : 0,
      avgRating: totalGames > 0 ? Math.round(totalRating / totalGames) : 0,
      reviewedCount,
      openingStats,
      resultsByTimeControl,
      monthlyTrend,
      phaseAccuracy,
      accuracyTrend,
    })
  );
});

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

router.post("/analysis/scan-position", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const { hasFullAccess } = await import("../lib/accessControl");
    const { full: isFullAccess } = await hasFullAccess(userId);

    if (!isFullAccess) {
      const { db: dbClient, scanAttemptsTable: scanAttempts } = await import("@workspace/db");
      const { and: andOp, eq: eqOp, gte: gteOp, count: countOp } = await import("drizzle-orm");
      const { FREE_TIER_LIMITS } = await import("../lib/accessControl");
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [todayResult] = await dbClient
        .select({ c: countOp() })
        .from(scanAttempts)
        .where(andOp(
          eqOp(scanAttempts.userId, userId),
          eqOp(scanAttempts.success, true),
          gteOp(scanAttempts.createdAt, todayStart),
        ));
      const usedToday = todayResult?.c ?? 0;
      if (usedToday >= FREE_TIER_LIMITS.scanPositionsPerDay) {
        res.status(403).json({
          error: "usage_limit",
          message: `Free plan includes ${FREE_TIER_LIMITS.scanPositionsPerDay} successful scans per day. Upgrade to Pro for unlimited scans!`,
          used: usedToday,
          limit: FREE_TIER_LIMITS.scanPositionsPerDay,
        });
        return;
      }
    }

    const { image } = req.body as { image: string };
    if (!image) {
      res.status(400).json({ error: "Image data is required" });
      return;
    }

    const base64Match = image.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
    if (!base64Match) {
      res.status(400).json({ error: "Invalid image format. Send a base64 data URL." });
      return;
    }

    const originalBase64 = base64Match[2];
    const sizeBytes = Math.ceil(originalBase64.length * 0.75);
    if (sizeBytes > 10 * 1024 * 1024) {
      res.status(400).json({ error: "Image too large. Max 10MB." });
      return;
    }

    const ai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Send the user's original image straight to the AI — no cropping, no
    // resizing. Earlier attempts to auto-crop to a board bbox ended up chopping
    // off parts of the board when the AI mis-detected the bounds.
    const mimeType = `image/${base64Match[1]}` as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    const base64Data = originalBase64;

    const PROMPT = `You are reading a chess board from a screenshot. Read it SQUARE BY SQUARE — never skip any square.

ORIENTATION:
- If you see file labels a–h along an edge and rank labels 1–8 along the other edge, use them as ground truth. The labels show you where each square is.
- Otherwise assume White is on the bottom (rank 1 = bottom row, file a = left column).

OUTPUT — return a JSON object with an 8-row grid covering EVERY square, from rank 8 down to rank 1, files a→h.

Each square's value is one of:
- "."  (empty square)
- "K","Q","R","B","N","P"  (WHITE piece — uppercase = light-colored piece)
- "k","q","r","b","n","p"  (BLACK piece — lowercase = dark-colored piece)

CRITICAL RULES — read carefully:
1. PIECE COLOR (most important — get this right!):
   - WHITE pieces are LIGHT-colored (cream / off-white / ivory). They appear pale against any square.
   - BLACK pieces are DARK-colored (dark brown, charcoal, or solid black). They appear dark against any square.
   - The piece's color is NEVER determined by the square it sits on. A white knight on a dark square is still WHITE. A black bishop on a light square is still BLACK.
   - When a light piece sits on a light square, look for the SHADOW or OUTLINE that distinguishes it from the square — it is still white.
   - When a dark piece sits on a dark square, the piece will still be visibly darker / more saturated than the square — it is still black.
   - For each piece, ask yourself: "Is the BODY of this piece lighter or darker than a neutral gray?" Lighter = white. Darker = black.
2. Distinguishing pieces by silhouette:
   - PAWN ♟ — small, simple round head on a base. The most common piece. Shorter than other pieces.
   - ROOK ♜ — castle/tower shape with crenellations (square teeth) on top.
   - KNIGHT ♞ — a horse head, faces sideways.
   - BISHOP ♝ — tall with a pointed/mitered top, often with a small slit/notch.
   - QUEEN ♛ — tall with a crown of multiple points/spikes around the top.
   - KING ♚ — tall with a CROSS or "+" on top. Only ONE per color.
3. EXACTLY 1 white king and 1 black king must appear. Count them at the end. If wrong, re-look.
4. NO pawns may sit on rank 1 or rank 8. If you see a piece there, it is NOT a pawn.
5. Maximum 8 pawns per color, max 32 pieces total.
6. Empty squares ARE empty — do not invent pieces. If unsure whether a square has a piece, it is probably empty.
7. FINAL COLOR PASS: Before responding, scan your output and re-check the color of every piece against the image. Pieces that look pale/cream in the image must be uppercase. Pieces that look dark/black must be lowercase. Wrong-color pieces are the most common scan error — fix them now.

WHOSE TURN: Look for any "White to move" / "Black to move" label, evaluation bar arrow, or highlighted last-move squares. Default "w" if unclear.

Return ONLY this JSON, no markdown:
{
  "rank8": ["?","?","?","?","?","?","?","?"],   // files a..h on rank 8
  "rank7": ["?","?","?","?","?","?","?","?"],
  "rank6": ["?","?","?","?","?","?","?","?"],
  "rank5": ["?","?","?","?","?","?","?","?"],
  "rank4": ["?","?","?","?","?","?","?","?"],
  "rank3": ["?","?","?","?","?","?","?","?"],
  "rank2": ["?","?","?","?","?","?","?","?"],
  "rank1": ["?","?","?","?","?","?","?","?"],
  "active_color": "w" | "b",
  "confidence": "high" | "medium" | "low",
  "notes": "<one-line description of the position>"
}`;

    type ScanResp = {
      rank8?: string[]; rank7?: string[]; rank6?: string[]; rank5?: string[];
      rank4?: string[]; rank3?: string[]; rank2?: string[]; rank1?: string[];
      pieces?: string[]; // legacy fallback if model still returns piece list
      active_color?: string; confidence?: string; notes?: string;
    };

    async function callOnce(): Promise<ScanResp> {
      const r = await ai.chat.completions.create({
        model: "gpt-5.6-terra",
        max_completion_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: "high" } },
          ],
        }],
        response_format: { type: "json_object" },
      });
      const c = r.choices[0]?.message?.content ?? "{}";
      try { return JSON.parse(c) as ScanResp; } catch { return {}; }
    }

    function gridToPieces(p: ScanResp): string[] {
      const ranks: Array<[number, string[] | undefined]> = [
        [8, p.rank8], [7, p.rank7], [6, p.rank6], [5, p.rank5],
        [4, p.rank4], [3, p.rank3], [2, p.rank2], [1, p.rank1],
      ];
      const out: string[] = [];
      for (const [rankNum, row] of ranks) {
        if (!Array.isArray(row) || row.length !== 8) continue;
        for (let f = 0; f < 8; f++) {
          const cell = (row[f] || '').trim();
          if (!cell || cell === '.' || cell === '?' || cell === '') continue;
          if (cell.length !== 1) continue;
          const isWhite = cell === cell.toUpperCase();
          const piece = cell.toUpperCase();
          if (!'KQRBNP'.includes(piece)) continue;
          const file = String.fromCharCode(97 + f);
          out.push(`${piece}${isWhite ? 'w' : 'b'}@${file}${rankNum}`);
        }
      }
      // Fallback if model returned the legacy pieces[] format
      if (out.length === 0 && Array.isArray(p.pieces)) return p.pieces;
      return out;
    }

    // Convert a ScanResp into an 8x8 string grid where each cell is one of
    //   '', 'K','Q','R','B','N','P','k','q','r','b','n','p'
    // Index [r][f] where r=0 is rank 8, f=0 is file a.
    function respToGrid(p: ScanResp): string[][] | null {
      const grid: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
      const rows: Array<string[] | undefined> = [p.rank8, p.rank7, p.rank6, p.rank5, p.rank4, p.rank3, p.rank2, p.rank1];
      let validRows = 0;
      for (let r = 0; r < 8; r++) {
        const row = rows[r];
        if (!Array.isArray(row) || row.length !== 8) continue;
        validRows++;
        for (let f = 0; f < 8; f++) {
          const cell = (row[f] || '').trim();
          if (!cell || cell === '.' || cell === '?' || cell === '_' || cell === '-') { grid[r][f] = ''; continue; }
          if (cell.length !== 1) { grid[r][f] = ''; continue; }
          if (!'KQRBNPkqrbnp'.includes(cell)) { grid[r][f] = ''; continue; }
          grid[r][f] = cell;
        }
      }
      // Try legacy pieces[] format
      if (validRows < 4 && Array.isArray(p.pieces)) {
        for (const raw of p.pieces) {
          const m = String(raw).trim().match(/^([KQRBNP])([wb])@([a-h])([1-8])$/i);
          if (!m) continue;
          const piece = m[1].toUpperCase();
          const isWhite = m[2].toLowerCase() === 'w';
          const file = m[3].toLowerCase().charCodeAt(0) - 97;
          const rank = parseInt(m[4]);
          const r = 8 - rank;
          grid[r][file] = isWhite ? piece : piece.toLowerCase();
        }
        validRows = 8;
      }
      return validRows >= 4 ? grid : null;
    }

    // Per-square majority vote across multiple grids.
    function voteGrid(grids: string[][][]): string[][] {
      const out: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const counts: Record<string, number> = {};
          for (const g of grids) counts[g[r][f]] = (counts[g[r][f]] || 0) + 1;
          // Pick the value with highest count; break ties by preferring non-empty
          let best = '';
          let bestCount = -1;
          for (const [v, c] of Object.entries(counts)) {
            if (c > bestCount || (c === bestCount && v !== '' && best === '')) {
              best = v; bestCount = c;
            }
          }
          out[r][f] = best;
        }
      }
      return out;
    }

    function gridDirectToPieces(grid: string[][]): string[] {
      const out: string[] = [];
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = grid[r][f];
          if (!cell) continue;
          const piece = cell.toUpperCase();
          const isWhite = cell === piece;
          const file = String.fromCharCode(97 + f);
          const rank = 8 - r;
          out.push(`${piece}${isWhite ? 'w' : 'b'}@${file}${rank}`);
        }
      }
      return out;
    }

    function piecesToFen(pieces: string[], activeColor: string): string | null {
      const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
      const pieceMap: Record<string, string> = {
        Kw: 'K', Qw: 'Q', Rw: 'R', Bw: 'B', Nw: 'N', Pw: 'P',
        Kb: 'k', Qb: 'q', Rb: 'r', Bb: 'b', Nb: 'n', Pb: 'p',
      };
      for (const raw of pieces) {
        const m = raw.trim().match(/^([KQRBNP])([wb])@([a-h])([1-8])$/i);
        if (!m) continue;
        const key = m[1].toUpperCase() + m[2].toLowerCase();
        const fenPiece = pieceMap[key];
        if (!fenPiece) continue;
        const file = m[3].toLowerCase().charCodeAt(0) - 97; // 0-7
        const rank = parseInt(m[4]) - 1; // 0-7
        // FEN rank 8 = board[0], rank 1 = board[7]
        const row = 7 - rank;
        board[row][file] = fenPiece;
      }
      const ranks: string[] = [];
      for (let r = 0; r < 8; r++) {
        let line = '';
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = board[r][f];
          if (p) {
            if (empty > 0) { line += empty.toString(); empty = 0; }
            line += p;
          } else {
            empty++;
          }
        }
        if (empty > 0) line += empty.toString();
        ranks.push(line);
      }
      const placement = ranks.join('/');
      const turn = activeColor === 'b' ? 'b' : 'w';
      return `${placement} ${turn} - - 0 1`;
    }

    function scoreParse(pieces: string[]): number {
      let kw = 0, kb = 0, total = 0;
      const seenSquares = new Set<string>();
      for (const raw of pieces) {
        const m = raw.trim().match(/^([KQRBNP])([wb])@([a-h])([1-8])$/i);
        if (!m) continue;
        const sq = (m[3] + m[4]).toLowerCase();
        if (seenSquares.has(sq)) return -1; // two pieces on same square = invalid
        seenSquares.add(sq);
        const piece = m[1].toUpperCase();
        const color = m[2].toLowerCase();
        if (piece === 'P' && (m[4] === '1' || m[4] === '8')) return -1; // pawn on back rank
        if (piece === 'K' && color === 'w') kw++;
        if (piece === 'K' && color === 'b') kb++;
        total++;
      }
      if (kw !== 1 || kb !== 1) return 0;
      if (total > 32) return 0;
      return total;
    }

    // 3-pass parallel: per-square majority vote across the grids. Uses
    // allSettled rather than all — a single call failing (rate limit,
    // timeout, transient API error) shouldn't crash the whole scan when
    // the other passes could still produce a usable result.
    const settled = await Promise.allSettled([callOnce(), callOnce(), callOnce()]);
    const passes = settled
      .filter((s): s is PromiseFulfilledResult<ScanResp> => s.status === "fulfilled")
      .map(s => s.value);
    const grids = passes.map(respToGrid).filter((g): g is string[][] => g !== null);

    if (grids.length === 0) {
      res.status(422).json({ error: "Could not recognize a chess position in this image." });
      return;
    }

    const voted = voteGrid(grids);

    // Holds the cropped 640x640 board image as a data URL — returned to the
    // client so the user can compare what we detected vs. the original board.
    let croppedDataUrl: string | null = null;
    // Original screenshot (downscaled) with the detected bbox drawn on it,
    // so the user can SEE what region we identified as the board.
    let annotatedDataUrl: string | null = null;

    // ─────────────────────────────────────────────────────────────────────────
    // FOCUSED COLOR VERIFICATION on a clean cropped board.
    //
    // The first AI scan reads piece TYPES well but is unreliable at COLOR
    // (white vs black) when the input image has clutter (browser chrome,
    // player panels, eval bars, screenshot UI, etc.).
    //
    // So: ask the AI for the board's bounding box, crop & re-encode just the
    // board, then run TWO focused color-verification passes that ONLY ask
    // about color for the squares the first scan said are occupied.
    //
    // Each pass returns a map { "e1": "w", "d4": "b", ... }. We require both
    // passes to AGREE for a square before flipping its color. Then we sanity
    // check the result (1 white king, 1 black king, ≤16 each color) before
    // committing — if it would produce an invalid position, we revert.
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const originalBuf = Buffer.from(originalBase64, 'base64');
      const meta = await sharp(originalBuf).metadata();
      const imgW = meta.width ?? 0;
      const imgH = meta.height ?? 0;
      if (imgW < 64 || imgH < 64) throw new Error('image too small');

      // Build the list of occupied squares from the voted grid.
      const occupiedSquares: Array<{ r: number; f: number; sq: string; piece: string }> = [];
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = voted[r][f];
          if (!cell) continue;
          const file = String.fromCharCode(97 + f);
          const rank = 8 - r;
          occupiedSquares.push({ r, f, sq: `${file}${rank}`, piece: cell });
        }
      }
      if (occupiedSquares.length === 0) throw new Error('no pieces to verify');

      // 1. Find the board with AI VISION.
      //
      // Geometric detection (variance, edges, components) repeatedly fails
      // on real screenshots because chess.com's cream/tan boards have very
      // low texture variance, while UI elements (text, buttons, eval bars)
      // have high variance. We were chasing pixel heuristics and getting
      // wrong crops every time. The vision model already finds the board
      // perfectly (that's how it reads pieces), so just ASK it for the
      // bounding box. One small extra call, dead reliable.
      const bboxPromptImg = `data:${mimeType};base64,${originalBase64}`;
      let aiBbox: { x1: number; y1: number; x2: number; y2: number } | null = null;
      try {
        const bboxResp = await ai.chat.completions.create({
          model: "gpt-5.6-terra",
          max_completion_tokens: 200,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `Locate the 8x8 chess board in this image. Return ONLY a JSON object with the board's bounding box as percentages of the image dimensions (0-100). The bbox must INCLUDE all 64 squares plus any rank/file labels right next to the board, but EXCLUDE everything else (browser chrome, status bars, player names, eval bars, post text, captions, comments). The board is square — the bbox should be roughly square.

Format: {"x1": <left%>, "y1": <top%>, "x2": <right%>, "y2": <bottom%>}` },
              { type: "image_url", image_url: { url: bboxPromptImg, detail: "high" } },
            ],
          }],
          response_format: { type: "json_object" },
        });
        const bboxRaw = bboxResp.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(bboxRaw);
        const x1 = Number(parsed.x1), y1 = Number(parsed.y1), x2 = Number(parsed.x2), y2 = Number(parsed.y2);
        if ([x1, y1, x2, y2].every(v => Number.isFinite(v) && v >= 0 && v <= 100) && x2 > x1 && y2 > y1) {
          aiBbox = { x1, y1, x2, y2 };
        }
      } catch (e) {
        req.log?.warn?.({ err: String(e) }, "AI bbox call failed");
      }

      let cropX: number, cropY: number, cropSide: number;
      if (aiBbox) {
        // Use AI bbox. Inscribe a square within it so the result is square.
        const pxL = (aiBbox.x1 / 100) * imgW;
        const pxR = (aiBbox.x2 / 100) * imgW;
        const pxT = (aiBbox.y1 / 100) * imgH;
        const pxB = (aiBbox.y2 / 100) * imgH;
        const cx = (pxL + pxR) / 2;
        const cy = (pxT + pxB) / 2;
        // Use the LARGER dimension so we don't accidentally cut off the board
        // if the AI returned a slightly tall or wide bbox; clamp to image.
        const halfMax = Math.max((pxR - pxL) / 2, (pxB - pxT) / 2);
        const halfClamped = Math.min(halfMax, cx, imgW - cx, cy, imgH - cy);
        cropX = Math.max(0, Math.round(cx - halfClamped));
        cropY = Math.max(0, Math.round(cy - halfClamped));
        cropSide = Math.min(Math.round(halfClamped * 2), imgW - cropX, imgH - cropY);
        req.log?.info?.({ aiBbox, cropX, cropY, cropSide, imgW, imgH }, "Board cropped via AI bbox");
      } else {
        // Fallback: use the full image.
        cropX = 0; cropY = 0; cropSide = Math.min(imgW, imgH);
      }

      // 2. Crop to the board.
      const croppedJpeg = await sharp(originalBuf)
        .extract({ left: cropX, top: cropY, width: cropSide, height: cropSide })
        .resize(640, 640, { fit: 'fill' })
        .jpeg({ quality: 92 })
        .toBuffer();

      // Sanity check: a real chess board crop has high color variance.
      const stats = await sharp(croppedJpeg).stats();
      const channelStdAvg = stats.channels.length > 0
        ? stats.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / Math.min(3, stats.channels.length)
        : 0;
      const channelMeanAvg = stats.channels.length > 0
        ? stats.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / Math.min(3, stats.channels.length)
        : 0;
      if (channelStdAvg < 25 || channelMeanAvg < 15 || channelMeanAvg > 245) {
        req.log?.warn?.({ stddev: channelStdAvg, mean: channelMeanAvg }, "Crop looks empty — bbox missed the board, skipping verification");
        throw new Error('crop is empty / monochrome — bbox missed the board');
      }

      const cropB64 = croppedJpeg.toString('base64');
      croppedDataUrl = `data:image/jpeg;base64,${cropB64}`;

      // 3. Build a focused color-verification prompt.
      const sqList = occupiedSquares.map(s => s.sq).join(', ');
      const COLOR_PROMPT = `This image shows a chess board, cropped tightly. White pieces are on the bottom (rank 1), or use any rank/file labels you can see as ground truth.

For each of these squares, look at the piece sitting there and tell me its COLOR ONLY: "w" (white / light / cream / ivory) or "b" (black / dark / charcoal).

A piece's COLOR is determined by the BODY of the piece itself, NOT by the color of the square it sits on. A white knight on a dark square is still WHITE. A black bishop on a light square is still BLACK.

Squares to check: ${sqList}

Return ONLY a JSON object mapping each square to its color, nothing else. Example:
{ "e1": "w", "d8": "b", "a1": "w" }`;

      async function colorPass(): Promise<Record<string, string>> {
        try {
          const r = await ai.chat.completions.create({
            model: "gpt-5.6-terra",
            max_completion_tokens: 1500,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: COLOR_PROMPT },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${cropB64}`, detail: "high" } },
              ],
            }],
            response_format: { type: "json_object" },
          });
          const obj = JSON.parse(r.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(obj)) {
            const sq = k.toLowerCase().trim();
            const val = String(v).toLowerCase().trim();
            if (/^[a-h][1-8]$/.test(sq) && (val === 'w' || val === 'b')) out[sq] = val;
          }
          return out;
        } catch { return {}; }
      }

      // 4. Two parallel passes — only flip a piece if BOTH agree.
      const [colorsA, colorsB] = await Promise.all([colorPass(), colorPass()]);

      const scratch = voted.map(row => row.slice());
      let flips = 0;
      for (const { r, f, sq, piece } of occupiedSquares) {
        const a = colorsA[sq];
        const b = colorsB[sq];
        if (!a || !b || a !== b) continue;     // require agreement
        const wantWhite = a === 'w';
        const isWhite = piece === piece.toUpperCase();
        if (wantWhite === isWhite) continue;   // already correct
        scratch[r][f] = wantWhite ? piece.toUpperCase() : piece.toLowerCase();
        flips++;
      }

      // 5. Sanity check before committing.
      let kw = 0, kb = 0, w = 0, b = 0;
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const c = scratch[r][f];
          if (!c) continue;
          if (c === 'K') kw++; else if (c === 'k') kb++;
          if (c === c.toUpperCase()) w++; else b++;
        }
      }
      if (kw === 1 && kb === 1 && w <= 16 && b <= 16) {
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) voted[r][f] = scratch[r][f];
        req.log?.info?.({ flips, occupied: occupiedSquares.length }, "Color verification applied");
      } else {
        req.log?.warn?.({ kw, kb, w, b, flips }, "Color verification produced invalid position — keeping original");
      }
    } catch (err) {
      req.log?.warn?.({ err: (err as Error).message }, "Color verification skipped");
    }

    const votedPieces = gridDirectToPieces(voted);
    const votedScore = scoreParse(votedPieces);

    // If voted result is invalid (e.g. wrong king count), fall back to best individual pass
    let bestPieces: string[];
    let best: ScanResp;
    if (votedScore > 0) {
      bestPieces = votedPieces;
      // Pick best active_color/notes from passes that scored well
      const scored = passes.map(p => ({ p, s: scoreParse(gridToPieces(p)) }));
      scored.sort((a, b) => b.s - a.s);
      best = scored[0].p;
    } else {
      const scored = passes.map(p => ({ p, pieces: gridToPieces(p), s: scoreParse(gridToPieces(p)) }));
      scored.sort((a, b) => b.s - a.s);
      bestPieces = scored[0].pieces;
      best = scored[0].p;
    }

    if (bestPieces.length === 0) {
      res.status(422).json({ error: "Could not recognize a chess position in this image." });
      return;
    }

    // Clean obviously-impossible artifacts before building the FEN:
    // pawns cannot live on rank 1 or rank 8 — drop them if the AI placed any there.
    // Piece format produced by gridDirectToPieces is `${PIECE}${w|b}@${file}${rank}` (e.g. "Pw@e2").
    const cleanedPieces = bestPieces.filter(ps => {
      const m = ps.match(/^([KQRBNP])([wb])@([a-h])([1-8])$/i);
      if (!m) return true; // keep non-matching entries — piecesToFen will skip them itself
      const piece = m[1].toUpperCase();
      const rank = parseInt(m[4], 10);
      if (piece === 'P' && (rank === 1 || rank === 8)) return false;
      return true;
    });

    const builtFen = piecesToFen(cleanedPieces, best.active_color || 'w');
    if (!builtFen) {
      res.status(422).json({ error: "Could not parse the recognized position." });
      return;
    }

    // Try strict validation; if it fails, return the built FEN anyway so the user can
    // see what was detected and fix it on the board instead of getting a hard error.
    let validatedFen: string = builtFen;
    try {
      const chess = new Chess(builtFen);
      validatedFen = chess.fen();
    } catch {
      validatedFen = builtFen;
    }

    // Confidence based on how strongly the passes agreed.
    // Count how many of the 64 squares had unanimous agreement across all grids.
    let unanimous = 0;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const v = grids[0][r][f];
        if (grids.every(g => g[r][f] === v)) unanimous++;
      }
    }
    const agreementRatio = unanimous / 64;
    let confidence: string;
    if (agreementRatio >= 0.97) confidence = "high";
    else if (agreementRatio >= 0.9) confidence = "medium";
    else confidence = "low";

    if (!isFullAccess) {
      try {
        const { db: dbClient2, scanAttemptsTable: scanAttempts2 } = await import("@workspace/db");
        await dbClient2.insert(scanAttempts2).values({ userId, success: true });
      } catch { /* logging failure shouldn't block the actual response */ }
    }

    res.json({
      fen: validatedFen,
      confidence,
      notes: best.notes || "",
      croppedImage: croppedDataUrl,
      annotatedImage: annotatedDataUrl,
    });
  } catch (err: unknown) {
    req.log?.error?.({ err }, "Scan position error");
    res.status(500).json({ error: "Failed to analyze the image. Please try again." });
  }
});

// Analyzes an arbitrary sequence of moves with the real engine-based
// classification pipeline -- unlike every other analysis route, this
// doesn't require a stored game. Built specifically so bot games (which
// are ephemeral, client-side, and never saved to gamesTable) can get an
// accurate re-classification after the game ends, replacing the
// necessarily much cruder depth-2 client-side estimate used live during
// play for instant feedback.
router.post("/analysis/analyze-moves", async (req: Request, res: Response): Promise<void> => {
  try {
    const { moves, startFen } = req.body as {
      moves?: { san: string; color: "white" | "black" }[];
      startFen?: string;
    };
    if (!Array.isArray(moves) || moves.length === 0) {
      res.status(400).json({ error: "moves array is required" });
      return;
    }
    if (moves.length > 200) {
      res.status(400).json({ error: "Too many moves for a single request" });
      return;
    }

    const chess = startFen ? new Chess(startFen) : new Chess();
    const fens: string[] = [chess.fen()];
    const uciMoves: { from: string; to: string }[] = [];
    for (const m of moves) {
      const result = chess.move(m.san);
      if (!result) {
        res.status(400).json({ error: `Illegal move in sequence: ${m.san}` });
        return;
      }
      fens.push(chess.fen());
      uciMoves.push({ from: result.from, to: result.to });
    }

    const evals = await evaluateAllPositions(fens);

    const results: { moveIndex: number; san: string; classification: string }[] = [];
    for (let i = 0; i < moves.length; i++) {
      const evalBefore = evals[i];
      const evalAfter = evals[i + 1];
      if (!evalBefore || !evalAfter) continue;

      const playerColor = moves[i].color;
      const cpBefore = evalBefore.cpWhite;
      const cpAfter = evalAfter.cpWhite;
      const playedUci = `${uciMoves[i].from}${uciMoves[i].to}`;
      const isTopEngineMove = evalBefore.bestMoveUci.startsWith(playedUci);
      const isSecondEngineMove = evalBefore.secondBestUci.startsWith(playedUci);
      const isOpeningRange = i < 30;
      const wasBalanced = Math.abs(cpBefore) < 150;

      let winPctLossRaw: number;
      if (playerColor === "white") {
        winPctLossRaw = winPct(cpBefore) - winPct(cpAfter);
      } else {
        winPctLossRaw = (100 - winPct(cpBefore)) - (100 - winPct(cpAfter));
      }
      const playerWinBefore = playerColor === "white" ? winPct(cpBefore) : 100 - winPct(cpBefore);
      const playerWinAfter = playerColor === "white" ? winPct(cpAfter) : 100 - winPct(cpAfter);

      let legalMoveCount = 20;
      try {
        const pos = new Chess(fens[i]);
        legalMoveCount = pos.moves().length;
      } catch {}

      let classification = classifyFromWinPctLoss(
        winPctLossRaw, isTopEngineMove, isSecondEngineMove, isOpeningRange, wasBalanced,
        playerWinBefore, false, playerWinAfter, legalMoveCount, cpBefore, cpAfter, playerColor,
      );

      if (classification === "brilliant") {
        if (!isSacrificialMove(fens[i], moves[i].san)) classification = "best";
      }

      results.push({ moveIndex: i, san: moves[i].san, classification, cpLoss: Math.max(0, winPctLossRaw) });
    }

    res.json({ results });
  } catch (err: any) {
    req.log?.error?.({ err }, "analyze-moves error");
    res.status(500).json({ error: "Failed to analyze moves" });
  }
});

export default router;
