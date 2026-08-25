import { Router, type IRouter } from "express";
import { db, gamesTable, coursesTable, lessonsTable, backgroundJobsTable } from "@workspace/db";
import { sql, eq, and, desc } from "drizzle-orm";
import { fetchChessComGames, extractGameMetadata, fetchChessComProfile, fetchChessComTopPlayers } from "../lib/chesscom";
import { analyzePlayerGames, generateExploitCourseForOpponent } from "../lib/openaiAnalysis";
import { randomUUID } from "crypto";
import { requireAuth, requirePremium } from "../middlewares/authMiddleware";
import { sanitizeLessons, type RawLesson } from "./courses";

const router: IRouter = Router();

// Real, live data from Chess.com's own public leaderboard -- not
// hardcoded names, since those would go stale and I'd have no way to
// verify accuracy. Public/no auth since it's the same data anyone can
// see on chess.com itself.
router.get("/opponents/top-players", async (_req, res) => {
  try {
    const players = await fetchChessComTopPlayers(25);
    res.json({ players });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch leaderboard", players: [] });
  }
});

type CourseJobStatus = "pending" | "done" | "error";
interface CourseJob {
  status: CourseJobStatus;
  coursesCreated?: number;
  error?: string;
  createdAt: number;
  userId: string;
}
const courseJobs = new Map<string, CourseJob>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of courseJobs) if (job.createdAt < cutoff) courseJobs.delete(id);
}, 5 * 60 * 1000);

router.post("/opponents/start", async (req, res): Promise<void> => {
  const { username } = req.body as { username?: string };
  const requestingUser = (req.headers["x-chess-username"] as string | undefined)?.toLowerCase() || null;
  const userId = req.user?.id;

  if (!username || typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const target = username.trim().toLowerCase();

  const [pending] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "scout"),
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

  const { hasFullAccess } = await import("../lib/accessControl");
  const { full: isFullAccess } = await hasFullAccess(userId);

  if (!isFullAccess) {
    const { checkUsageLimit } = await import("../lib/accessControl");
    const limitCheck = await checkUsageLimit(userId, "opponentScouts");
    if (!limitCheck.allowed) {
      res.status(403).json({
        error: "usage_limit",
        message: `Free plan includes ${limitCheck.limit} basic opponent scout. Upgrade to Pro for unlimited scouts with full weakness analysis!`,
        used: limitCheck.used,
        limit: limitCheck.limit,
      });
      return;
    }
  }

  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId,
    userId,
    type: "scout",
    status: "pending",
    targetUsername: target,
  });

  res.json({ jobId });

  req.log.info({ target, jobId, isFullAccess }, "Analyzing opponent (background)");

  runAnalysis(target, requestingUser, jobId, req.log, isFullAccess).catch((err) => {
    req.log.error({ err, jobId }, "Background analysis failed");
  });
});

router.get("/opponents/status/:jobId", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [job] = await db.select().from(backgroundJobsTable).where(
    and(eq(backgroundJobsTable.id, req.params.jobId as string), eq(backgroundJobsTable.userId, userId))
  );
  if (!job) {
    res.status(404).json({ error: "Job not found or expired" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: job.status,
    result: job.result,
    error: job.error,
  });
});

router.get("/opponents/history", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.json({ scouts: [] }); return; }

  const jobs = await db.select({
    id: backgroundJobsTable.id,
    targetUsername: backgroundJobsTable.targetUsername,
    status: backgroundJobsTable.status,
    createdAt: backgroundJobsTable.createdAt,
    completedAt: backgroundJobsTable.completedAt,
  }).from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "scout"),
      eq(backgroundJobsTable.status, "done"),
    )
  ).orderBy(desc(backgroundJobsTable.createdAt)).limit(20);

  const seen = new Set<string>();
  const uniqueScouts = jobs.filter(j => {
    const key = (j.targetUsername || "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.json({ scouts: uniqueScouts });
});

router.get("/opponents/history/:jobId", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [job] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.id, req.params.jobId as string),
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "scout"),
    )
  ).limit(1);

  if (!job) { res.status(404).json({ error: "Scout not found" }); return; }

  res.json({
    job: {
      id: job.id,
      status: job.status,
      targetUsername: job.targetUsername,
      result: job.result,
      createdAt: job.createdAt?.toISOString(),
    },
  });
});

router.get("/opponents/active-job", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.json({ job: null }); return; }

  const [job] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "scout"),
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

  res.setHeader("Cache-Control", "no-store");
  res.json({
    job: {
      id: job.id,
      status: job.status,
      targetUsername: job.targetUsername,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
    },
  });
});

async function runAnalysis(
  target: string,
  requestingUser: string | null,
  jobId: string,
  log: import("pino").Logger,
  isFullAccess: boolean,
): Promise<void> {
  try {
    const [profileResult, gamesResult] = await Promise.allSettled([
      fetchChessComProfile(target),
      fetchChessComGames(target, 2),
    ]);

    if (gamesResult.status === "rejected" || (gamesResult.status === "fulfilled" && gamesResult.value.length === 0)) {
      const noGames = gamesResult.status === "fulfilled" && gamesResult.value.length === 0;
      await db.update(backgroundJobsTable).set({
        status: "error",
        error: noGames
          ? `No recent games found for "${target}".`
          : `Could not fetch games for "${target}". Check the username.`,
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, jobId));
      return;
    }

    const games = gamesResult.value;
    const profile = profileResult.status === "fulfilled" ? profileResult.value : null;

    const gameSummaries = games.slice(0, 100).map((g) => {
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

    // The expensive, OpenAI-powered weakness analysis only runs for
    // full-access (Pro/admin) users. Free/basic scouts skip this call
    // entirely -- real cost savings, not just hiding the result -- and
    // get the stats below instead (record, top openings, head-to-head),
    // which were always computed independently of the AI call anyway.
    let weaknesses: OpponentWeakness[] = [];
    if (isFullAccess) {
      const analysis = await analyzePlayerGames(target, gameSummaries, { isOpponentScout: true });
      if (!analysis || !Array.isArray(analysis.weaknesses)) {
        await db.update(backgroundJobsTable).set({
          status: "error",
          error: "Analysis returned an unexpected response. Please try again.",
          completedAt: new Date(),
        }).where(eq(backgroundJobsTable.id, jobId));
        return;
      }
      weaknesses = analysis.weaknesses;
    }

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
        log.warn({ err }, "Head-to-head query failed");
      }
    }

    const gamePgns = gameSummaries.map(g => g.pgn).filter(Boolean);

    const resultData = {
      username: target,
      profile,
      gamesAnalyzed: gameSummaries.length,
      wins,
      losses,
      draws,
      weaknesses,
      isFullAccess,
      topOpenings,
      headToHead,
      gamePgns,
    };

    await db.update(backgroundJobsTable).set({
      status: "done",
      result: resultData as unknown as Record<string, unknown>,
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));

    log.info({ jobId, target }, "Opponent analysis complete");
  } catch (err) {
    log.error({ err, jobId }, "Opponent analysis error");
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: "Analysis failed. Please try again in a moment.",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  }
}

interface OpponentWeakness {
  category: string;
  severity: string;
  description: string;
  frequency: number;
  examples: string[];
  relatedGameIndices?: number[];
}

router.post("/opponents/generate-courses", requireAuth, requirePremium, async (req, res): Promise<void> => {
  const { opponentUsername, weaknesses } = req.body as {
    opponentUsername?: string;
    weaknesses?: OpponentWeakness[];
  };

  if (!opponentUsername || !weaknesses?.length) {
    res.status(400).json({ error: "opponentUsername and weaknesses are required" });
    return;
  }

  // Who receives the generated course — always the authenticated user, never
  // trusted from the request body (that field used to be spoofable, letting
  // anyone attribute generated courses to an arbitrary username).
  const requestingUser = req.user!.chesscomUsername || req.user!.lichessUsername;
  if (!requestingUser) {
    res.status(400).json({ error: "Link a Chess.com or Lichess username to your account first." });
    return;
  }

  const userId = req.user!.id;
  let storedGamePgns: string[] = [];
  try {
    const [latestJob] = await db
      .select({ result: backgroundJobsTable.result })
      .from(backgroundJobsTable)
      .where(
        and(
          eq(backgroundJobsTable.userId, userId),
          eq(backgroundJobsTable.type, "scout"),
          eq(backgroundJobsTable.status, "done"),
          eq(backgroundJobsTable.targetUsername, opponentUsername.toLowerCase()),
        )
      )
      .orderBy(desc(backgroundJobsTable.createdAt))
      .limit(1);
    if (latestJob?.result && (latestJob.result as any).gamePgns) {
      storedGamePgns = (latestJob.result as any).gamePgns;
    }
  } catch (err) {
    req.log.warn({ err }, "Failed to fetch stored game PGNs for course generation");
  }

  const jobId = randomUUID();
  courseJobs.set(jobId, { status: "pending", createdAt: Date.now(), userId });
  res.json({ jobId });

  req.log.info({ opponentUsername, requestingUser, jobId }, "Generating exploit courses (background)");

  runCourseGeneration(opponentUsername, weaknesses, requestingUser.toLowerCase(), jobId, req.log, storedGamePgns).catch((err) => {
    req.log.error({ err, jobId }, "Background course generation failed");
  });
});

router.get("/opponents/courses-job/:jobId", requireAuth, (req, res): void => {
  const job = courseJobs.get(req.params.jobId as string);
  if (!job || job.userId !== req.user!.id) {
    res.status(404).json({ error: "Job not found or expired" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(job);
});

async function runCourseGeneration(
  opponentUsername: string,
  weaknesses: OpponentWeakness[],
  username: string,
  jobId: string,
  log: import("pino").Logger,
  allGamePgns: string[] = [],
): Promise<void> {
  let coursesCreated = 0;
  const prioritized = [...weaknesses].sort((a, b) => {
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4);
  }).slice(0, 3);

  for (const weakness of prioritized) {
    try {
      let relatedPgns: string[] = [];
      if (allGamePgns.length > 0 && weakness.relatedGameIndices?.length) {
        relatedPgns = weakness.relatedGameIndices
          .filter(idx => idx >= 0 && idx < allGamePgns.length)
          .map(idx => allGamePgns[idx]);
      }
      if (relatedPgns.length === 0 && allGamePgns.length > 0) {
        relatedPgns = allGamePgns.slice(0, 6);
      }

      const courseData = await generateExploitCourseForOpponent(opponentUsername, {
        category: weakness.category,
        severity: weakness.severity,
        description: weakness.description,
        frequency: weakness.frequency,
        examples: weakness.examples,
      }, relatedPgns);

      const { lessons: safeLessons } = await sanitizeLessons(courseData.lessons as RawLesson[], log);

      const [course] = await db.insert(coursesTable).values({
        username,
        title: courseData.title,
        description: courseData.description,
        category: courseData.category,
        difficulty: courseData.difficulty,
        totalLessons: safeLessons.length,
        completedLessons: 0,
      }).returning();

      for (const lesson of safeLessons) {
        await db.insert(lessonsTable).values({
          courseId: course.id,
          title: lesson.title,
          content: lesson.content,
          orderIndex: lesson.orderIndex,
          completed: "false",
          examplePgn: lesson.examplePgn ?? null,
          fixExamplePgn: lesson.fixExamplePgn ?? null,
          drillFen: lesson.drillFen ?? null,
          drillExpectedMove: lesson.drillExpectedMove ?? null,
          drillHint: lesson.drillHint ?? null,
          extraChallenges: lesson.extraChallenges ?? null,
          conceptTitle: lesson.conceptTitle ?? null,
        });
      }

      coursesCreated++;
      log.info({ jobId, opponentUsername, weakness: weakness.category }, "Exploit course created");
    } catch (err) {
      log.error({ err, weakness: weakness.category }, "Failed to generate exploit course");
    }
  }

  courseJobs.set(jobId, {
    status: coursesCreated > 0 ? "done" : "error",
    coursesCreated,
    error: coursesCreated === 0 ? "Failed to generate any courses. Please try again." : undefined,
    createdAt: courseJobs.get(jobId)!.createdAt,
    userId: courseJobs.get(jobId)!.userId,
  });

  log.info({ jobId, opponentUsername, coursesCreated }, "Exploit course generation complete");
}

export default router;
