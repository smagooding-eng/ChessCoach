import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesRouter from "./games";
import analysisRouter from "./analysis";
import coursesRouter from "./courses";
import opponentsRouter from "./opponents";
import ttsRouter from "./tts";
import authRouter from "./auth";
import stripeRouter from "./stripe";
import { requirePremium } from "../middlewares/authMiddleware";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(gamesRouter);
router.use(stripeRouter);

router.use("/analysis", requirePremium);
router.use(analysisRouter);
router.use("/courses", requirePremium);
router.use(coursesRouter);
router.use("/opponents", requirePremium);
router.use(opponentsRouter);
router.use("/tts", requirePremium);
router.use(ttsRouter);

export default router;
