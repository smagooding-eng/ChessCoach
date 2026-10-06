import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdmin, requireAuth } from "../middlewares/authMiddleware";
import { db, chessTrapsTable, trapProgressTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

const router: IRouter = Router();

// Viewing and training routes just need a logged-in user -- this is a
// real, launched feature now. Content-management routes (create/edit/
// archive) stay admin-only, gated per-route further down.
router.get("/traps", requireAuth, async (_req: Request, res: Response) => {
  try {
    const traps = await db.select().from(chessTrapsTable)
      .where(eq(chessTrapsTable.archived, false))
      .orderBy(asc(chessTrapsTable.orderIndex));
    res.json({ traps });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load traps" });
  }
});

router.get("/traps/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id as string;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid trap id" });
      return;
    }
    const [trap] = await db.select().from(chessTrapsTable).where(eq(chessTrapsTable.id, id));
    if (!trap) {
      res.status(404).json({ error: "Trap not found" });
      return;
    }

    // No paywall: traps are static training content with no AI/API cost,
    // so every difficulty is free for any logged-in user. (This used to
    // return summary-only + locked:true for non-beginner traps.)
    let progress: { commit: boolean; avoid: boolean } = { commit: false, avoid: false };
    const rows = await db.select().from(trapProgressTable)
      .where(and(eq(trapProgressTable.trapId, id), eq(trapProgressTable.userId, req.user!.id)));
    for (const r of rows) {
      if (r.mode === "commit") progress.commit = r.completed;
      if (r.mode === "avoid") progress.avoid = r.completed;
    }

    res.json({ trap, locked: false, progress });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load trap" });
  }
});

// Records an attempt at a mode, marking it completed on success.
// Body: { mode: 'commit' | 'avoid', success: boolean }
router.post("/traps/:id/attempt", requireAuth, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id as string;
    const id = parseInt(idParam, 10);
    const { mode, success } = req.body ?? {};
    if (isNaN(id) || (mode !== "commit" && mode !== "avoid")) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    // Progress recording follows the same rule as viewing: no paywall.
    // The existence check stays -- it's what turns a bad id into a clean
    // 404 instead of a failed insert.
    const [trap] = await db.select().from(chessTrapsTable).where(eq(chessTrapsTable.id, id));
    if (!trap) {
      res.status(404).json({ error: "Trap not found" });
      return;
    }

    const [existing] = await db.select().from(trapProgressTable)
      .where(and(
        eq(trapProgressTable.trapId, id),
        eq(trapProgressTable.userId, req.user!.id),
        eq(trapProgressTable.mode, mode),
      ));

    if (existing) {
      await db.update(trapProgressTable).set({
        attempts: existing.attempts + 1,
        completed: existing.completed || !!success,
        lastAttemptAt: new Date(),
      }).where(eq(trapProgressTable.id, existing.id));
    } else {
      await db.insert(trapProgressTable).values({
        userId: req.user!.id,
        trapId: id,
        mode,
        attempts: 1,
        completed: !!success,
        lastAttemptAt: new Date(),
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to record attempt" });
  }
});

// Admin content-management routes -- create/edit/archive traps.
router.post("/traps", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, category, difficulty, trapSide, summary, explanation, startingFen, trapLineSan, moveNotes, criticalMoveIndex, safeMovesSan, orderIndex } = req.body ?? {};
    if (!name || !category || !difficulty || !trapSide || !summary || !explanation || !startingFen || !Array.isArray(trapLineSan) || !Array.isArray(safeMovesSan)) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const [created] = await db.insert(chessTrapsTable).values({
      name, category, difficulty, trapSide, summary, explanation, startingFen,
      trapLineSan, moveNotes: Array.isArray(moveNotes) ? moveNotes : [],
      criticalMoveIndex: criticalMoveIndex ?? 0, safeMovesSan,
      orderIndex: orderIndex ?? 0,
    }).returning();
    res.json({ trap: created });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create trap" });
  }
});

router.put("/traps/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id as string;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid trap id" });
      return;
    }
    const updates = req.body ?? {};
    delete updates.id;
    delete updates.createdAt;
    await db.update(chessTrapsTable).set(updates).where(eq(chessTrapsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update trap" });
  }
});

router.delete("/traps/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id as string;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid trap id" });
      return;
    }
    await db.update(chessTrapsTable).set({ archived: true }).where(eq(chessTrapsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to archive trap" });
  }
});

export default router;
