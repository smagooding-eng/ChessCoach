import { Router, type IRouter } from "express";
import { db, coursesTable, lessonsTable, weaknessesTable, gamesTable, backgroundJobsTable } from "@workspace/db";
import { eq, desc, inArray, and, count } from "drizzle-orm";
import {
  ListCoursesQueryParams,
  ListCoursesResponse,
  GenerateCoursesBody,
  GenerateCoursesResponse,
  GetCourseParams,
  GetCourseResponse,
  UpdateCourseProgressParams,
  UpdateCourseProgressBody,
  UpdateCourseProgressResponse,
} from "@workspace/api-zod";
import { generateCourseForWeakness, generateEndgameCourse, type EndgameType } from "../lib/openaiAnalysis";
import { verifyLesson, verifyLessonDrillEngine } from "../lib/puzzleVerifier";
import { analyzePuzzle } from "../lib/chessMotifs";
import { Chess } from "chess.js";
import { randomUUID } from "crypto";
import type { Logger } from "pino";

const router: IRouter = Router();

interface RawLesson {
  title: string;
  content: string;
  orderIndex: number;
  examplePgn: string | null;
  fixExamplePgn?: string | null;
  drillFen?: string | null;
  drillExpectedMove?: string | null;
  drillHint?: string | null;
}

/**
 * Verify each lesson before persistence. Invalid example/fix/drill data is
 * stripped (text-only downgrade) so the lesson stays useful while bad chess
 * data is removed. Returns the sanitized lesson list and a count of downgrades.
 */
async function sanitizeLessons(lessons: RawLesson[], log?: Logger): Promise<{ lessons: RawLesson[]; downgraded: number }> {
  let downgraded = 0;
  const sanitized: RawLesson[] = [];
  for (const lesson of lessons) {
    const next: RawLesson = { ...lesson };
    let changed = false;

    // Re-check after each strip so we converge on a valid lesson.
    let verdict = verifyLesson({
      examplePgn: next.examplePgn ?? null,
      fixExamplePgn: next.fixExamplePgn ?? null,
      drillFen: next.drillFen ?? null,
      drillExpectedMove: next.drillExpectedMove ?? null,
    });

    if (!verdict.ok && verdict.reasons.some(r => r.startsWith("drill"))) {
      next.drillFen = null;
      next.drillExpectedMove = null;
      next.drillHint = null;
      changed = true;
    }
    verdict = verifyLesson({
      examplePgn: next.examplePgn ?? null,
      fixExamplePgn: next.fixExamplePgn ?? null,
      drillFen: next.drillFen ?? null,
      drillExpectedMove: next.drillExpectedMove ?? null,
    });
    if (!verdict.ok && verdict.reasons.some(r => r.startsWith("fix"))) {
      next.fixExamplePgn = null;
      changed = true;
    }
    verdict = verifyLesson({
      examplePgn: next.examplePgn ?? null,
      fixExamplePgn: next.fixExamplePgn ?? null,
      drillFen: next.drillFen ?? null,
      drillExpectedMove: next.drillExpectedMove ?? null,
    });
    if (!verdict.ok && verdict.reasons.some(r => r.startsWith("example"))) {
      next.examplePgn = null;
      changed = true;
    }

    // Engine reconciliation: if a drill survived legality checks, verify that
    // the claimed expected move matches Stockfish's top choice. If not, strip
    // the drill (text-only downgrade).
    if (next.drillFen && next.drillExpectedMove) {
      let engineOk = false;
      let engineReasons: string[] = ["engine verification unavailable"];
      try {
        const engineVerdict = await verifyLessonDrillEngine(next.drillFen, next.drillExpectedMove);
        engineOk = engineVerdict.ok;
        engineReasons = engineVerdict.reasons;
      } catch {
        engineOk = false;
        engineReasons = ["engine verification failed"];
      }
      if (!engineOk) {
        // Strict: never persist a drill claim we could not engine-verify.
        log?.warn({ title: lesson.title, reasons: engineReasons }, "Drill stripped (engine reconciliation failed or unavailable)");
        next.drillFen = null;
        next.drillExpectedMove = null;
        next.drillHint = null;
        changed = true;
      }
    }

    // Tactical-claim consistency: when the lesson title implies a specific
    // motif, the example PGN must actually demonstrate it per the motif
    // detector. Otherwise strip the example (the lesson stays as text).
    if (next.examplePgn) {
      const titleLower = (lesson.title ?? "").toLowerCase();
      const tacticTokens = ["fork", "pin", "skewer", "discovered", "sacrifice", "mate"];
      const claimed = tacticTokens.filter(t => titleLower.includes(t));
      if (claimed.length > 0) {
        try {
          const c = new Chess();
          c.loadPgn(next.examplePgn);
          const history = c.history({ verbose: true });
          if (history.length >= 2) {
            // Re-derive the position just before the final move and the UCI
            // of that move so the detector can run on it.
            const replay = new Chess();
            for (let i = 0; i < history.length - 1; i++) {
              replay.move({ from: history[i].from, to: history[i].to, promotion: history[i].promotion });
            }
            const last = history[history.length - 1];
            const uci = `${last.from}${last.to}${last.promotion ?? ""}`;
            const motif = analyzePuzzle(replay.fen(), [uci]);
            const detected = new Set(motif.themes.map(t => t.toLowerCase()));
            const norm = (s: string) => s.replace(/[^a-z0-9]/g, "");
            const missing = claimed.filter(c => ![...detected].some(d => norm(d).includes(c)));
            if (missing.length > 0) {
              log?.warn({ title: lesson.title, missing }, "Lesson example does not demonstrate claimed tactic; stripping example");
              next.examplePgn = null;
              next.fixExamplePgn = null;
              changed = true;
            }
          }
        } catch {
          // Unparseable PGN: strip the example.
          next.examplePgn = null;
          next.fixExamplePgn = null;
          changed = true;
        }
      }
    }

    if (changed) {
      downgraded++;
      log?.warn({ title: lesson.title }, "Lesson downgraded to text-only after verification failure");
    }
    sanitized.push(next);
  }
  return { lessons: sanitized, downgraded };
}

async function runCourseGenerationJob(username: string, jobId: string, log: Logger): Promise<void> {
  try {
    const weaknesses = await db
      .select()
      .from(weaknessesTable)
      .where(eq(weaknessesTable.username, username.toLowerCase()));

    if (weaknesses.length === 0) {
      await db.update(backgroundJobsTable).set({
        status: "error",
        error: "No weaknesses found. Run analysis first.",
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, jobId));
      return;
    }

    for (const weakness of weaknesses.slice(0, 4)) {
      try {
        let relatedGamePgns: string[] = [];
        if (weakness.relatedGameIds && weakness.relatedGameIds.length > 0) {
          const relatedGames = await db
            .select({ pgn: gamesTable.pgn })
            .from(gamesTable)
            .where(inArray(gamesTable.id, weakness.relatedGameIds));
          relatedGamePgns = relatedGames.map(g => g.pgn).filter(Boolean) as string[];
        }
        if (relatedGamePgns.length === 0) {
          const fallbackGames = await db
            .select({ pgn: gamesTable.pgn })
            .from(gamesTable)
            .where(eq(gamesTable.username, username.toLowerCase()))
            .orderBy(desc(gamesTable.playedAt))
            .limit(6);
          relatedGamePgns = fallbackGames.map(g => g.pgn).filter(Boolean) as string[];
        }

        const courseData = await generateCourseForWeakness({
          category: weakness.category,
          severity: weakness.severity,
          description: weakness.description,
          frequency: weakness.frequency,
          examples: weakness.examples,
        }, relatedGamePgns);

        const { lessons: safeLessons } = await sanitizeLessons(courseData.lessons as RawLesson[], log);
        const [course] = await db.insert(coursesTable).values({
          username: username.toLowerCase(),
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
            examplePgn: lesson.examplePgn,
            fixExamplePgn: lesson.fixExamplePgn ?? null,
            drillFen: lesson.drillFen ?? null,
            drillExpectedMove: lesson.drillExpectedMove ?? null,
            drillHint: lesson.drillHint ?? null,
          });
        }
      } catch (err) {
        log.error({ err, weakness: weakness.category }, "Failed to generate course for weakness");
      }
    }

    log.info({ jobId, username }, "Course generation job complete");
    await db.update(backgroundJobsTable).set({
      status: "done",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  } catch (err) {
    log.error({ err, jobId }, "Course generation job failed");
    const msg = err instanceof Error ? err.message : "Course generation failed";
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: msg,
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  }
}

router.post("/courses/generate-start", async (req, res): Promise<void> => {
  const parsed = GenerateCoursesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { username } = parsed.data;
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const [pending] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "course_generation"),
      eq(backgroundJobsTable.status, "pending"),
    )
  );
  if (pending) {
    res.json({ jobId: pending.id });
    return;
  }

  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId,
    userId,
    type: "course_generation",
    status: "pending",
    targetUsername: username.toLowerCase(),
  });
  res.json({ jobId });
  runCourseGenerationJob(username.toLowerCase(), jobId, req.log).catch(() => {});
});

router.get("/courses/generate-status/:jobId", async (req, res): Promise<void> => {
  const [job] = await db.select().from(backgroundJobsTable).where(eq(backgroundJobsTable.id, req.params.jobId as string));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: job.status, error: job.error });
});

router.get("/courses/active-job", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.json({ job: null }); return; }

  const [job] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "course_generation"),
      eq(backgroundJobsTable.status, "pending"),
    )
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({ job: job ? { jobId: job.id, status: job.status } : null });
});

router.get("/courses/quality", async (_req, res): Promise<void> => {
  try {
    const [totalRow] = await db.select({ c: count() }).from(lessonsTable);
    const [archivedRow] = await db.select({ c: count() }).from(lessonsTable).where(eq(lessonsTable.archived, true));
    const total = totalRow?.c ?? 0;
    const archived = archivedRow?.c ?? 0;
    const valid = total - archived;

    // Rolling-window: last 100 lessons by id (proxy for "fresh batch").
    const recent = await db
      .select({ id: lessonsTable.id, archived: lessonsTable.archived })
      .from(lessonsTable)
      .orderBy(desc(lessonsTable.id))
      .limit(100);
    const recentTotal = recent.length;
    const recentArchived = recent.filter(r => r.archived).length;
    const passRateRecent = recentTotal > 0 ? (recentTotal - recentArchived) / recentTotal : 1;

    res.json({
      total,
      valid,
      archived,
      passRate: total > 0 ? valid / total : 1,
      window: recentTotal,
      passRateRecent,
    });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

router.get("/courses", async (req, res): Promise<void> => {
  const query = ListCoursesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { username } = query.data;

  const courses = await db
    .select()
    .from(coursesTable)
    .where(and(
      eq(coursesTable.username, username.toLowerCase()),
      eq(coursesTable.archived, false),
    ))
    .orderBy(desc(coursesTable.createdAt));

  res.json(
    ListCoursesResponse.parse({
      courses: courses.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    })
  );
});

router.post("/courses/generate", async (req, res): Promise<void> => {
  const parsed = GenerateCoursesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username } = parsed.data;

  req.log.info({ username }, "Generating courses");

  const weaknesses = await db
    .select()
    .from(weaknessesTable)
    .where(eq(weaknessesTable.username, username.toLowerCase()));

  if (weaknesses.length === 0) {
    res.status(400).json({ error: "No weaknesses found. Run analysis first." });
    return;
  }

  const generatedCourses = [];

  for (const weakness of weaknesses.slice(0, 4)) {
    try {
      let relatedGamePgns: string[] = [];
      if (weakness.relatedGameIds && weakness.relatedGameIds.length > 0) {
        const relatedGames = await db
          .select({ pgn: gamesTable.pgn })
          .from(gamesTable)
          .where(inArray(gamesTable.id, weakness.relatedGameIds));
        relatedGamePgns = relatedGames.map(g => g.pgn).filter(Boolean) as string[];
      }
      if (relatedGamePgns.length === 0) {
        const fallbackGames = await db
          .select({ pgn: gamesTable.pgn })
          .from(gamesTable)
          .where(eq(gamesTable.username, username.toLowerCase()))
          .orderBy(desc(gamesTable.playedAt))
          .limit(6);
        relatedGamePgns = fallbackGames.map(g => g.pgn).filter(Boolean) as string[];
      }

      const courseData = await generateCourseForWeakness({
        category: weakness.category,
        severity: weakness.severity,
        description: weakness.description,
        frequency: weakness.frequency,
        examples: weakness.examples,
      }, relatedGamePgns);

      const { lessons: safeLessons } = await sanitizeLessons(courseData.lessons as RawLesson[], req.log);
      const [course] = await db
        .insert(coursesTable)
        .values({
          username: username.toLowerCase(),
          title: courseData.title,
          description: courseData.description,
          category: courseData.category,
          difficulty: courseData.difficulty,
          totalLessons: safeLessons.length,
          completedLessons: 0,
        })
        .returning();

      for (const lesson of safeLessons) {
        await db.insert(lessonsTable).values({
          courseId: course.id,
          title: lesson.title,
          content: lesson.content,
          orderIndex: lesson.orderIndex,
          completed: "false",
          examplePgn: lesson.examplePgn,
          fixExamplePgn: lesson.fixExamplePgn ?? null,
          drillFen: lesson.drillFen ?? null,
          drillExpectedMove: lesson.drillExpectedMove ?? null,
          drillHint: lesson.drillHint ?? null,
        });
      }

      generatedCourses.push({
        ...course,
        createdAt: course.createdAt.toISOString(),
      });
    } catch (err) {
      req.log.error({ err, weakness: weakness.category }, "Failed to generate course");
    }
  }

  res.json(GenerateCoursesResponse.parse({ courses: generatedCourses }));
});

// ── Endgame training ─────────────────────────────────────────────────────────
async function runEndgameJob(
  username: string,
  type: EndgameType,
  jobId: string,
  log: Logger,
): Promise<void> {
  try {
    let gamePgns: string[] = [];
    let playerRating: number | undefined;

    const userGames = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.username, username))
      .orderBy(desc(gamesTable.playedAt))
      .limit(10);

    if (userGames.length > 0) {
      const g = userGames[0];
      playerRating = g.whiteUsername.toLowerCase() === username.toLowerCase()
        ? g.whiteRating
        : g.blackRating;
    }

    if (type === "personal_endgames") {
      gamePgns = userGames.map(g => g.pgn).filter(Boolean) as string[];
      if (gamePgns.length === 0) {
        await db.update(backgroundJobsTable).set({
          status: "error",
          error: "No games found. Import games first.",
          completedAt: new Date(),
        }).where(eq(backgroundJobsTable.id, jobId));
        return;
      }
    }

    const courseData = await generateEndgameCourse(type, playerRating, gamePgns);

    const { lessons: safeLessons } = await sanitizeLessons(courseData.lessons as RawLesson[], log);
    const [course] = await db
      .insert(coursesTable)
      .values({
        username,
        title: courseData.title,
        description: courseData.description,
        category: courseData.category || "Endgame Technique",
        difficulty: courseData.difficulty,
        totalLessons: safeLessons.length,
        completedLessons: 0,
      })
      .returning();

    for (const lesson of safeLessons) {
      await db.insert(lessonsTable).values({
        courseId: course.id,
        title: lesson.title,
        content: lesson.content,
        orderIndex: lesson.orderIndex,
        completed: "false",
        examplePgn: lesson.examplePgn,
        fixExamplePgn: lesson.fixExamplePgn ?? null,
        drillFen: lesson.drillFen ?? null,
        drillExpectedMove: lesson.drillExpectedMove ?? null,
        drillHint: lesson.drillHint ?? null,
      });
    }

    await db.update(backgroundJobsTable).set({
      status: "done",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
    log.info({ jobId, type, courseId: course.id }, "Endgame course generated");
  } catch (err) {
    log.error({ err, jobId, type }, "Endgame course generation failed");
    const msg = err instanceof Error ? err.message : "Endgame course generation failed";
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: msg,
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  }
}

router.post("/courses/endgame/generate-start", async (req, res): Promise<void> => {
  const { username, type } = req.body as { username?: string; type?: string };
  if (!username || !type) {
    res.status(400).json({ error: "username and type are required" });
    return;
  }
  const validTypes: EndgameType[] = ["checkmate_patterns", "essential_endgames", "personal_endgames"];
  if (!validTypes.includes(type as EndgameType)) {
    res.status(400).json({ error: "Invalid type. Use: checkmate_patterns, essential_endgames, or personal_endgames" });
    return;
  }
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const endgameJobType = `endgame_${type}`;
  const [pending] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, endgameJobType),
      eq(backgroundJobsTable.status, "pending"),
    )
  );
  if (pending) {
    res.json({ jobId: pending.id });
    return;
  }

  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId,
    userId,
    type: endgameJobType,
    status: "pending",
    targetUsername: username.toLowerCase(),
  });
  res.json({ jobId });
  runEndgameJob(username.toLowerCase(), type as EndgameType, jobId, req.log).catch(() => {});
});

router.get("/courses/endgame/generate-status/:jobId", async (req, res): Promise<void> => {
  const [job] = await db.select().from(backgroundJobsTable).where(eq(backgroundJobsTable.id, req.params.jobId as string));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: job.status, error: job.error });
});

router.get("/courses/endgame/active-job", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.json({ jobs: [] }); return; }

  const jobs = await db.select({
    id: backgroundJobsTable.id,
    type: backgroundJobsTable.type,
    status: backgroundJobsTable.status,
  }).from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.status, "pending"),
    )
  );

  const endgameJobs = jobs.filter(j => j.type.startsWith("endgame_"));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    jobs: endgameJobs.map(j => ({
      jobId: j.id,
      endgameType: j.type.replace("endgame_", ""),
      status: j.status,
    })),
  });
});

router.get("/courses/endgame", async (req, res): Promise<void> => {
  const username = (req.query.username as string)?.toLowerCase();
  if (!username) { res.status(400).json({ error: "username is required" }); return; }

  const courses = await db
    .select()
    .from(coursesTable)
    .where(and(
      eq(coursesTable.username, username),
      eq(coursesTable.archived, false),
    ))
    .orderBy(desc(coursesTable.createdAt));

  const endgameCourses = courses.filter(c =>
    c.category === "Endgame Technique" ||
    c.title.toLowerCase().includes("endgame") ||
    c.title.toLowerCase().includes("checkmate")
  );

  res.json({
    courses: endgameCourses.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});

// ── Course detail (must be after /courses/endgame* to avoid route conflict) ──
router.get("/courses/:id", async (req, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [course] = await db
    .select()
    .from(coursesTable)
    .where(and(eq(coursesTable.id, params.data.id), eq(coursesTable.archived, false)));

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const lessons = await db
    .select()
    .from(lessonsTable)
    .where(and(eq(lessonsTable.courseId, course.id), eq(lessonsTable.archived, false)))
    .orderBy(lessonsTable.orderIndex);

  res.json(
    GetCourseResponse.parse({
      ...course,
      createdAt: course.createdAt.toISOString(),
      lessons: lessons.map((l) => ({
        ...l,
        completed: l.completed === "true",
      })),
    })
  );
});

router.patch("/courses/:id/progress", async (req, res): Promise<void> => {
  const params = UpdateCourseProgressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateCourseProgressBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { id } = params.data;
  const { lessonId, completed } = body.data;

  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, id));

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  await db
    .update(lessonsTable)
    .set({ completed: completed ? "true" : "false" })
    .where(eq(lessonsTable.id, lessonId));

  const lessons = await db
    .select()
    .from(lessonsTable)
    .where(eq(lessonsTable.courseId, id));

  const completedCount = lessons.filter((l) => l.completed === "true").length;

  const [updatedCourse] = await db
    .update(coursesTable)
    .set({ completedLessons: completedCount })
    .where(eq(coursesTable.id, id))
    .returning();

  res.json(
    UpdateCourseProgressResponse.parse({
      ...updatedCourse,
      createdAt: updatedCourse.createdAt.toISOString(),
      lessons: lessons.map((l) => ({
        ...l,
        completed: l.completed === "true",
      })),
    })
  );
});

export default router;
