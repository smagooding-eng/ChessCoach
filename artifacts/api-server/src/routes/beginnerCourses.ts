import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdmin } from "../middlewares/authMiddleware";
import { db, beginnerCoursesTable, beginnerLessonsTable, beginnerLessonProgressTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

const router: IRouter = Router();

// Every route here is admin-gated for now -- hidden until ready for a
// real launch, same pattern as Chess Traps started with. Applied
// per-route rather than via a path-prefix router.use(), since a prefix
// gate on "/beginner-courses" would silently leave "/beginner-lessons/*"
// ungated.
router.get("/beginner-courses", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const courses = await db.select().from(beginnerCoursesTable)
      .where(eq(beginnerCoursesTable.archived, false))
      .orderBy(asc(beginnerCoursesTable.orderIndex));
    res.json({ courses });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load courses" });
  }
});

router.get("/beginner-courses/:id/lessons", requireAdmin, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id as string;
    const courseId = parseInt(idParam, 10);
    if (isNaN(courseId)) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const [course] = await db.select().from(beginnerCoursesTable).where(eq(beginnerCoursesTable.id, courseId));
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const lessons = await db.select({
      id: beginnerLessonsTable.id,
      title: beginnerLessonsTable.title,
      summary: beginnerLessonsTable.summary,
      orderIndex: beginnerLessonsTable.orderIndex,
    }).from(beginnerLessonsTable)
      .where(and(eq(beginnerLessonsTable.courseId, courseId), eq(beginnerLessonsTable.archived, false)))
      .orderBy(asc(beginnerLessonsTable.orderIndex));

    let completedIds: number[] = [];
    if (req.isAuthenticated()) {
      const rows = await db.select({ lessonId: beginnerLessonProgressTable.lessonId })
        .from(beginnerLessonProgressTable)
        .where(and(eq(beginnerLessonProgressTable.userId, req.user!.id), eq(beginnerLessonProgressTable.completed, true)));
      completedIds = rows.map(r => r.lessonId);
    }

    res.json({ course, lessons, completedIds });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load lessons" });
  }
});

router.get("/beginner-lessons/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id as string;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid lesson id" });
      return;
    }
    const [lesson] = await db.select().from(beginnerLessonsTable).where(eq(beginnerLessonsTable.id, id));
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    res.json({ lesson });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load lesson" });
  }
});

router.post("/beginner-lessons/:id/complete", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const idParam = req.params.id as string;
    const lessonId = parseInt(idParam, 10);
    if (isNaN(lessonId)) {
      res.status(400).json({ error: "Invalid lesson id" });
      return;
    }
    const [existing] = await db.select().from(beginnerLessonProgressTable)
      .where(and(eq(beginnerLessonProgressTable.lessonId, lessonId), eq(beginnerLessonProgressTable.userId, req.user!.id)));

    if (existing) {
      await db.update(beginnerLessonProgressTable).set({
        completed: true,
        completedAt: new Date(),
      }).where(eq(beginnerLessonProgressTable.id, existing.id));
    } else {
      await db.insert(beginnerLessonProgressTable).values({
        userId: req.user!.id,
        lessonId,
        completed: true,
        completedAt: new Date(),
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to mark lesson complete" });
  }
});

// Admin content-management routes.
router.post("/beginner-courses", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, iconEmoji, orderIndex } = req.body ?? {};
    if (!title || !description) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const [created] = await db.insert(beginnerCoursesTable).values({
      title, description, iconEmoji: iconEmoji ?? "♟️", orderIndex: orderIndex ?? 0,
    }).returning();
    res.json({ course: created });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create course" });
  }
});

router.post("/beginner-lessons", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { courseId, title, summary, steps, orderIndex } = req.body ?? {};
    if (!courseId || !title || !summary || !Array.isArray(steps)) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const [created] = await db.insert(beginnerLessonsTable).values({
      courseId, title, summary, steps, orderIndex: orderIndex ?? 0,
    }).returning();
    res.json({ lesson: created });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create lesson" });
  }
});

export default router;
