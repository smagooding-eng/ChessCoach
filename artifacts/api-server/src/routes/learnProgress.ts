import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

// Beginner Path + Chess for Kids progress, saved per account so it follows
// the player to any device (and never leaks into another account on a shared
// device). Also the account's Kid Mode flag: an account set up for a child
// opens locked in Chess for Kids wherever it signs in.
//
// Table: learn_progress (created at startup in index.ts).

const router: IRouter = Router();
const MAX = 64 * 1024; // plenty for star maps; stops junk

router.get("/learn/progress", requireAuth, async (req: Request, res: Response) => {
  try {
    const r = await db.execute(sql`SELECT beginner, kids, kid_mode FROM learn_progress WHERE user_id = ${req.user!.id}`);
    const row = (r.rows?.[0] ?? null) as { beginner: unknown; kids: unknown; kid_mode: boolean } | null;
    res.json(row ? { beginner: row.beginner ?? null, kids: row.kids ?? null, kidMode: !!row.kid_mode } : { beginner: null, kids: null, kidMode: false });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load progress", details: err.message });
  }
});

router.put("/learn/progress", requireAuth, async (req: Request, res: Response) => {
  try {
    const { beginner, kids, kidMode } = (req.body ?? {}) as { beginner?: unknown; kids?: unknown; kidMode?: unknown };
    const b = beginner !== undefined && beginner !== null && typeof beginner === "object" ? JSON.stringify(beginner) : null;
    const k = kids !== undefined && kids !== null && typeof kids === "object" ? JSON.stringify(kids) : null;
    if ((b && b.length > MAX) || (k && k.length > MAX)) { res.status(413).json({ error: "Too large" }); return; }
    const km = typeof kidMode === "boolean" ? kidMode : null;
    await db.execute(sql`
      INSERT INTO learn_progress (user_id, beginner, kids, kid_mode, updated_at)
      VALUES (${req.user!.id}, ${b}::jsonb, ${k}::jsonb, COALESCE(${km}, false), now())
      ON CONFLICT (user_id) DO UPDATE SET
        beginner = COALESCE(EXCLUDED.beginner, learn_progress.beginner),
        kids = COALESCE(EXCLUDED.kids, learn_progress.kids),
        kid_mode = COALESCE(${km}, learn_progress.kid_mode),
        updated_at = now()`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to save progress", details: err.message });
  }
});

export default router;
