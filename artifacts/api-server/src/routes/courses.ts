import { Router, type IRouter } from "express";
import { db, coursesTable, lessonsTable, weaknessesTable, gamesTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
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
import { generateCourseForWeakness } from "../lib/openaiAnalysis";
import { randomUUID } from "crypto";
import type { Logger } from "pino";

const router: IRouter = Router();

// ── Job store for long-running course generation ──────────────────────────────
type CourseJobStatus = "pending" | "done" | "error";
interface CourseJob { status: CourseJobStatus; error?: string; createdAt: number; }
const courseJobs = new Map<string, CourseJob>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of courseJobs) if (job.createdAt < cutoff) courseJobs.delete(id);
}, 5 * 60 * 1000);

async function runCourseGenerationJob(username: string, jobId: string, log: Logger): Promise<void> {
  try {
    const weaknesses = await db
      .select()
      .from(weaknessesTable)
      .where(eq(weaknessesTable.username, username.toLowerCase()));

    if (weaknesses.length === 0) {
      courseJobs.set(jobId, { status: "error", error: "No weaknesses found. Run analysis first.", createdAt: Date.now() });
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

        const [course] = await db.insert(coursesTable).values({
          username: username.toLowerCase(),
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
            examplePgn: lesson.examplePgn,
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
    courseJobs.set(jobId, { status: "done", createdAt: Date.now() });
  } catch (err) {
    log.error({ err, jobId }, "Course generation job failed");
    const msg = err instanceof Error ? err.message : "Course generation failed";
    courseJobs.set(jobId, { status: "error", error: msg, createdAt: Date.now() });
  }
}

// POST /api/courses/generate-start — kick off generation, return jobId immediately
router.post("/courses/generate-start", async (req, res): Promise<void> => {
  const parsed = GenerateCoursesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { username } = parsed.data;
  const jobId = randomUUID();
  courseJobs.set(jobId, { status: "pending", createdAt: Date.now() });
  res.json({ jobId });
  runCourseGenerationJob(username.toLowerCase(), jobId, req.log).catch(() => {});
});

// GET /api/courses/generate-status/:jobId — poll for completion
router.get("/courses/generate-status/:jobId", (req, res): void => {
  const job = courseJobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: job.status, error: job.error });
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
    .where(eq(coursesTable.username, username.toLowerCase()))
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

      const [course] = await db
        .insert(coursesTable)
        .values({
          username: username.toLowerCase(),
          title: courseData.title,
          description: courseData.description,
          category: courseData.category,
          difficulty: courseData.difficulty,
          totalLessons: courseData.lessons.length,
          completedLessons: 0,
        })
        .returning();

      for (const lesson of courseData.lessons) {
        await db.insert(lessonsTable).values({
          courseId: course.id,
          title: lesson.title,
          content: lesson.content,
          orderIndex: lesson.orderIndex,
          completed: "false",
          examplePgn: lesson.examplePgn,
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

router.get("/courses/:id", async (req, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, params.data.id));

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const lessons = await db
    .select()
    .from(lessonsTable)
    .where(eq(lessonsTable.courseId, course.id))
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
