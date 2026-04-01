import { Router, type IRouter, type Request, type Response } from "express";
import healthRouter from "./health";
import gamesRouter from "./games";
import analysisRouter from "./analysis";
import coursesRouter from "./courses";
import opponentsRouter from "./opponents";
import ttsRouter from "./tts";
import authRouter from "./auth";
import stripeRouter from "./stripe";
import adminRouter from "./admin";
import { requirePremium } from "../middlewares/authMiddleware";
import { db, pageViewsTable } from "@workspace/db";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(gamesRouter);
router.use(stripeRouter);
router.use(adminRouter);

router.post("/track", async (req: Request, res: Response) => {
  try {
    const { path } = req.body;
    if (!path) { res.status(400).json({ error: "path required" }); return; }
    await db.insert(pageViewsTable).values({
      path,
      userId: req.user?.id ?? null,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to track" });
  }
});

router.use("/analysis", requirePremium);
router.use(analysisRouter);
router.use("/courses", requirePremium);
router.use(coursesRouter);
router.use("/opponents", requirePremium);
router.use(opponentsRouter);
router.use("/tts", requirePremium);
router.use(ttsRouter);

export default router;
