import { Router, type IRouter } from "express";
import { db, gamesTable, coursesTable, lessonsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { fetchChessComGames, extractGameMetadata, fetchChessComProfile } from "../lib/chesscom";
import { analyzePlayerGames, generateExploitCourseForOpponent } from "../lib/openaiAnalysis";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// In-memory job store — simple and sufficient for this use case
type JobStatus = "pending" | "done" | "error";
interface Job {
  status: JobStatus;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, Job>();

// Prune jobs older than 10 minutes every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);

// POST /api/opponents/start — kick off analysis, return jobId immediately
router.post("/opponents/start", async (req, res): Promise<void> => {
  const { username } = req.body as { username?: string };
  const requestingUser = (req.headers["x-chess-username"] as string | undefined)?.toLowerCase() || null;

  if (!username || typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  const target = username.trim().toLowerCase();
  const jobId = randomUUID();

  jobs.set(jobId, { status: "pending", createdAt: Date.now() });
  res.json({ jobId });

  req.log.info({ target, jobId }, "Analyzing opponent (background)");

  // Run analysis in background — don't await
  runAnalysis(target, requestingUser, jobId, req.log).catch((err) => {
    req.log.error({ err, jobId }, "Background analysis failed");
  });
});

// GET /api/opponents/status/:jobId — poll for results
router.get("/opponents/status/:jobId", (req, res): void => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found or expired" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(job);
});

async function runAnalysis(
  target: string,
  requestingUser: string | null,
  jobId: string,
  log: import("pino").Logger,
): Promise<void> {
  try {
    const [profileResult, gamesResult] = await Promise.allSettled([
      fetchChessComProfile(target),
      fetchChessComGames(target, 2),
    ]);

    if (gamesResult.status === "rejected" || (gamesResult.status === "fulfilled" && gamesResult.value.length === 0)) {
      const noGames = gamesResult.status === "fulfilled" && gamesResult.value.length === 0;
      jobs.set(jobId, {
        status: "error",
        error: noGames
          ? `No recent games found for "${target}".`
          : `Could not fetch games for "${target}". Check the username.`,
        createdAt: jobs.get(jobId)!.createdAt,
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

    if (!analysis || !Array.isArray(analysis.weaknesses)) {
      jobs.set(jobId, {
        status: "error",
        error: "AI analysis returned an unexpected response. Please try again.",
        createdAt: jobs.get(jobId)!.createdAt,
      });
      return;
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

    jobs.set(jobId, {
      status: "done",
      result: {
        username: target,
        profile,
        gamesAnalyzed: gameSummaries.length,
        wins,
        losses,
        draws,
        weaknesses: analysis.weaknesses,
        topOpenings,
        headToHead,
      },
      createdAt: jobs.get(jobId)!.createdAt,
    });

    log.info({ jobId, target }, "Opponent analysis complete");
  } catch (err) {
    log.error({ err, jobId }, "Opponent analysis error");
    jobs.set(jobId, {
      status: "error",
      error: "Analysis failed. Please try again in a moment.",
      createdAt: jobs.get(jobId)!.createdAt,
    });
  }
}

// ── Opponent-based course generation ─────────────────────────────────────────

type CourseJobStatus = "pending" | "done" | "error";
interface CourseJob {
  status: CourseJobStatus;
  coursesCreated?: number;
  error?: string;
  createdAt: number;
}
const courseJobs = new Map<string, CourseJob>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of courseJobs) if (job.createdAt < cutoff) courseJobs.delete(id);
}, 5 * 60 * 1000);

interface OpponentWeakness {
  category: string;
  severity: string;
  description: string;
  frequency: number;
  examples: string[];
}

// POST /api/opponents/generate-courses — generate exploit courses for a user
router.post("/opponents/generate-courses", async (req, res): Promise<void> => {
  const { opponentUsername, weaknesses, requestingUser } = req.body as {
    opponentUsername?: string;
    weaknesses?: OpponentWeakness[];
    requestingUser?: string;
  };

  if (!opponentUsername || !weaknesses?.length || !requestingUser) {
    res.status(400).json({ error: "opponentUsername, weaknesses, and requestingUser are required" });
    return;
  }

  const jobId = randomUUID();
  courseJobs.set(jobId, { status: "pending", createdAt: Date.now() });
  res.json({ jobId });

  req.log.info({ opponentUsername, requestingUser, jobId }, "Generating exploit courses (background)");

  runCourseGeneration(opponentUsername, weaknesses, requestingUser.toLowerCase(), jobId, req.log).catch((err) => {
    req.log.error({ err, jobId }, "Background course generation failed");
  });
});

// GET /api/opponents/courses-job/:jobId — poll for course generation status
router.get("/opponents/courses-job/:jobId", (req, res): void => {
  const job = courseJobs.get(req.params.jobId);
  if (!job) {
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
): Promise<void> {
  let coursesCreated = 0;
  // Take top 3 weaknesses by severity order
  const prioritized = [...weaknesses].sort((a, b) => {
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4);
  }).slice(0, 3);

  for (const weakness of prioritized) {
    try {
      const courseData = await generateExploitCourseForOpponent(opponentUsername, {
        category: weakness.category,
        severity: weakness.severity,
        description: weakness.description,
        frequency: weakness.frequency,
        examples: weakness.examples,
      });

      const [course] = await db.insert(coursesTable).values({
        username,
        title: courseData.title,
        description: courseData.description,
        category: courseData.category,
        difficulty: courseData.difficulty,
        totalLessons: courseData.lessons.length,
        completedLessons: 0,
      }).returning();

      for (const lesson of courseData.lessons) {
        await db.insert(lessonsTable).values({
          courseId: course.id,
          title: lesson.title,
          content: lesson.content,
          orderIndex: lesson.orderIndex,
          completed: "false",
          examplePgn: lesson.examplePgn ?? null,
          drillFen: lesson.drillFen ?? null,
          drillExpectedMove: lesson.drillExpectedMove ?? null,
          drillHint: lesson.drillHint ?? null,
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
  });

  log.info({ jobId, opponentUsername, coursesCreated }, "Exploit course generation complete");
}

export default router;
