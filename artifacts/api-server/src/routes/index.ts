import { Router, type IRouter, type Request, type Response } from "express";
import healthRouter from "./health";
import gamesRouter from "./games";
import analysisRouter from "./analysis";
import coursesRouter from "./courses";
import opponentsRouter from "./opponents";
import ttsRouter from "./tts";
import authRouter, { touchLastActive } from "./auth";
import emailPrefsRouter from "./emailPrefs";
import clubOutreachRouter from "./clubOutreach";
import publicStatsRouter from "./publicStats";
import emailTrackingRouter from "./emailTracking";
import stripeRouter from "./stripe";
import adminRouter from "./admin";
import emailRouter from "./email";
import storageRouter from "./storage";
import puzzlesRouter from "./puzzles";
import liveRouter from "./live";
import publicScoutRouter from "./publicScout";
import outreachRouter from "./outreach";
import articlesRouter from "./articles";
import publicPlayersRouter from "./publicPlayers";
import scannedPositionsRouter from "./scannedPositions";
import demoRouter from "./demo";
import landingFunnelRouter from "./landingFunnel";
import trafficExportRouter from "./trafficExport";
import trapsRouter from "./traps";
import botsRouter from "./bots";
import beginnerCoursesRouter from "./beginnerCourses";
import shopRouter from "./shop";
import pushRouter from "./push";
import learnProgressRouter from "./learnProgress";
import correspondenceRouter from "./correspondence";
import challengesRouter from "./challenges";
import notificationsRouter from "./notifications";
import appConfigRouter from "./appConfig";
import socialRouter from "./social";
import tournamentsRouter from "./tournaments";
import { requirePremium } from "../middlewares/authMiddleware";
import { db, pageViewsTable } from "@workspace/db";
import { botKind } from "../lib/botDetect";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(gamesRouter);
router.use(stripeRouter);
router.use(adminRouter);
router.use(emailRouter);
router.use(emailPrefsRouter);
router.use(clubOutreachRouter);
router.use(publicStatsRouter);
router.use(emailTrackingRouter);
router.use("/storage", storageRouter);
router.use(puzzlesRouter);
router.use(liveRouter);
router.use(publicScoutRouter);
router.use(outreachRouter);
router.use(articlesRouter);
router.use(publicPlayersRouter);
router.use(scannedPositionsRouter);
router.use(demoRouter);
router.use(landingFunnelRouter);
router.use(trafficExportRouter);
router.use(trapsRouter);
router.use(botsRouter);
router.use(beginnerCoursesRouter);
router.use(shopRouter);
router.use(pushRouter);
router.use(learnProgressRouter);
router.use(correspondenceRouter);
router.use(challengesRouter);
router.use(notificationsRouter);
router.use(appConfigRouter);
router.use(socialRouter);
router.use(tournamentsRouter);

router.post("/track", async (req: Request, res: Response) => {
  try {
    const { path, visitorId, automated, ownTool } = req.body;
    if (!path) { res.status(400).json({ error: "path required" }); return; }
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip || "unknown";
    // Bots go to their own table, so page views and visitors are people only.
    const ua = String(req.headers["user-agent"] ?? "").slice(0, 400);
    const kind = req.user?.id ? null : ownTool === true ? "ChessScout's own tools" : botKind(ua, automated === true);
    if (kind) {
      await db.execute(sql`INSERT INTO bot_visits (path, kind, user_agent, ip_address, source) VALUES (${String(path).slice(0, 300)}, ${kind}, ${ua}, ${ip}, 'browser')`);
      res.json({ ok: true });
      return;
    }
    if (req.user?.id) touchLastActive(req.user.id);
    await db.insert(pageViewsTable).values({
      path,
      userId: req.user?.id ?? null,
      visitorId: visitorId || `ip_${ip}`,
      ipAddress: ip,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to track" });
  }
});

// Crawlers that never run the page's JavaScript (link previews, search
// engines) are reported by the Vercel functions that answer them (api/og.ts,
// api/page.ts). Only bot user agents are stored.
router.post("/track-bot", async (req: Request, res: Response) => {
  try {
    const { path, ua, ip } = (req.body ?? {}) as { path?: string; ua?: string; ip?: string };
    const kind = botKind(ua);
    if (path && kind) {
      await db.execute(sql`INSERT INTO bot_visits (path, kind, user_agent, ip_address, source)
        VALUES (${String(path).slice(0, 300)}, ${kind}, ${String(ua ?? "").slice(0, 400)}, ${String(ip ?? "").slice(0, 64) || null}, 'crawler')`);
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

router.use(analysisRouter);
router.use("/courses", requirePremium);
router.use(coursesRouter);
router.use(opponentsRouter);
router.use("/tts", requirePremium);
router.use(ttsRouter);

export default router;
