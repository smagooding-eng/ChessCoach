import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesRouter from "./games";
import analysisRouter from "./analysis";
import coursesRouter from "./courses";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gamesRouter);
router.use(analysisRouter);
router.use(coursesRouter);

export default router;
