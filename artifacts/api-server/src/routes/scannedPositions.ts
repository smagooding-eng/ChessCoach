import { Router, type IRouter, type Request, type Response } from "express";
import { db, scannedPositionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();

// Save a scanned position to the signed-in user's archive.
router.post("/scanned-positions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { fen, label } = req.body as { fen?: string; label?: string };
    if (!fen || typeof fen !== "string") {
      res.status(400).json({ error: "fen is required" });
      return;
    }

    const [saved] = await db
      .insert(scannedPositionsTable)
      .values({
        userId: req.user!.id,
        fen,
        label: label?.trim() || null,
      })
      .returning();

    res.json({ position: saved });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to save position", details: err.message });
  }
});

// List the signed-in user's archive, most recent first.
router.get("/scanned-positions", requireAuth, async (req: Request, res: Response) => {
  try {
    const positions = await db
      .select()
      .from(scannedPositionsTable)
      .where(eq(scannedPositionsTable.userId, req.user!.id))
      .orderBy(desc(scannedPositionsTable.createdAt))
      .limit(200);

    res.json({ positions });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load archive", details: err.message });
  }
});

// Delete one archived position -- only if it belongs to the requesting user.
router.delete("/scanned-positions/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const deleted = await db
      .delete(scannedPositionsTable)
      .where(and(eq(scannedPositionsTable.id, id), eq(scannedPositionsTable.userId, req.user!.id)))
      .returning({ id: scannedPositionsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Position not found" });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete position", details: err.message });
  }
});

export default router;
