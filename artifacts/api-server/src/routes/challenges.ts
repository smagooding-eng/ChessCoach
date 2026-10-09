import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, gameChallengesTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { listTimeControls } from "../lib/liveServer";
import { isValidTimeControl, startGame, dailyLabel } from "../lib/correspondence";
import { sendPushToUser } from "../lib/pushNotifications";
import { logger } from "../lib/logger";

// "Challenge a friend" links for live and daily games.
//   POST /challenges            create  -> { code }
//   GET  /challenges/:code      details (public, so the link preview works signed-out)
//   POST /challenges/:code/accept   daily only (live is accepted over the live WebSocket)
//   POST /challenges/:code/cancel   creator only
//   GET  /challenges/mine       creator's open challenges
const router: IRouter = Router();

const LIVE_TTL_MS = 24 * 60 * 60 * 1000;
const DAILY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

const displayName = (req: Request) =>
  req.user!.chesscomUsername ?? req.user!.lichessUsername ?? req.user!.firstName ?? "Player";

function liveLabel(id: string): string | null {
  return listTimeControls().find((t) => t.id === id)?.label ?? null;
}

function publicChallenge(ch: typeof gameChallengesTable.$inferSelect) {
  return {
    code: ch.code,
    kind: ch.kind,
    timeControl: ch.timeControl,
    timeControlLabel: ch.kind === "live" ? liveLabel(ch.timeControl) : dailyLabel(ch.timeControl),
    mode: ch.mode,
    color: ch.color,
    status: new Date(ch.expiresAt).getTime() < Date.now() && ch.status === "open" ? "expired" : ch.status === "started" ? "accepted" : ch.status,
    creatorUsername: ch.creatorUsername,
    gameId: ch.gameId,
    expiresAt: ch.expiresAt,
  };
}

router.post("/challenges", requireAuth, async (req: Request, res: Response) => {
  try {
    const { kind, timeControl, mode, color } = req.body as { kind?: string; timeControl?: string; mode?: string; color?: string };
    if (kind !== "live" && kind !== "daily") { res.status(400).json({ error: "kind must be 'live' or 'daily'" }); return; }
    if (!timeControl) { res.status(400).json({ error: "timeControl is required" }); return; }
    if (kind === "live" && !liveLabel(timeControl)) { res.status(400).json({ error: "Invalid live time control" }); return; }
    if (kind === "daily" && !isValidTimeControl(timeControl)) { res.status(400).json({ error: "Invalid daily time control" }); return; }
    const code = newCode();
    const [ch] = await db.insert(gameChallengesTable).values({
      code,
      creatorUserId: req.user!.id,
      creatorUsername: displayName(req),
      kind,
      timeControl,
      mode: mode === "ranked" ? "ranked" : "casual",
      color: color === "white" || color === "black" ? color : "random",
      expiresAt: new Date(Date.now() + (kind === "live" ? LIVE_TTL_MS : DAILY_TTL_MS)),
    }).returning();
    res.json({ challenge: publicChallenge(ch) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create challenge", details: err.cause?.message ?? err.message });
  }
});

router.get("/challenges/mine", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(gameChallengesTable)
      .where(and(eq(gameChallengesTable.creatorUserId, req.user!.id), eq(gameChallengesTable.status, "open")))
      .orderBy(desc(gameChallengesTable.createdAt)).limit(20);
    res.json({ challenges: rows.map(publicChallenge).filter((c) => c.status === "open") });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load challenges", details: err.cause?.message ?? err.message });
  }
});

router.get("/challenges/:code", async (req: Request, res: Response) => {
  try {
    const [ch] = await db.select().from(gameChallengesTable).where(eq(gameChallengesTable.code, String(req.params.code)));
    if (!ch) { res.status(404).json({ error: "Challenge not found" }); return; }
    res.json({ challenge: publicChallenge(ch), isCreator: req.user?.id === ch.creatorUserId });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load challenge", details: err.cause?.message ?? err.message });
  }
});

router.post("/challenges/:code/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.update(gameChallengesTable).set({ status: "cancelled" })
      .where(and(eq(gameChallengesTable.code, String(req.params.code)), eq(gameChallengesTable.creatorUserId, req.user!.id), eq(gameChallengesTable.status, "open")));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to cancel", details: err.cause?.message ?? err.message });
  }
});

// Daily challenges start straight away: the game sits in the database until
// someone moves, so the creator doesn't need to be online.
router.post("/challenges/:code/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const [ch] = await db.select().from(gameChallengesTable).where(eq(gameChallengesTable.code, String(req.params.code)));
    if (!ch) { res.status(404).json({ error: "Challenge not found" }); return; }
    if (ch.kind !== "daily") { res.status(400).json({ error: "Live challenges are accepted from the Live play screen" }); return; }
    if (ch.creatorUserId === req.user!.id) { res.status(400).json({ error: "That's your own challenge — send the link to a friend." }); return; }
    if (ch.status !== "open") { res.status(409).json({ error: ch.status === "cancelled" ? "This challenge was cancelled" : "Someone already accepted this challenge" }); return; }
    if (new Date(ch.expiresAt).getTime() < Date.now()) { res.status(410).json({ error: "This challenge has expired" }); return; }
    if (!isValidTimeControl(ch.timeControl)) { res.status(400).json({ error: "Invalid challenge" }); return; }

    // Claim it first so two people can't both accept.
    const [claimed] = await db.update(gameChallengesTable)
      .set({ status: "accepted", acceptedByUserId: req.user!.id, acceptedByUsername: displayName(req) })
      .where(and(eq(gameChallengesTable.code, ch.code), eq(gameChallengesTable.status, "open"))).returning();
    if (!claimed) { res.status(409).json({ error: "Someone already accepted this challenge" }); return; }

    const me = { id: req.user!.id, name: displayName(req) };
    const creatorWhite = ch.color === "white" ? true : ch.color === "black" ? false : Math.random() < 0.5;
    const game = creatorWhite
      ? await startGame(ch.creatorUserId, ch.creatorUsername, me.id, me.name, ch.timeControl, ch.mode === "ranked" ? "ranked" : "casual")
      : await startGame(me.id, me.name, ch.creatorUserId, ch.creatorUsername, ch.timeControl, ch.mode === "ranked" ? "ranked" : "casual");
    await db.update(gameChallengesTable).set({ gameId: game.id, status: "started" }).where(eq(gameChallengesTable.code, ch.code));

    sendPushToUser(ch.creatorUserId, {
      title: "Challenge accepted",
      body: `${me.name} accepted your daily challenge (${dailyLabel(ch.timeControl)} per move). You're ${creatorWhite ? "White — your move!" : "Black."}`,
      url: `/daily/${game.id}`,
    }).catch((err) => logger.warn({ err }, "[challenges] accepted push failed"));

    res.json({ gameId: game.id });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to accept challenge", details: err.cause?.message ?? err.message });
  }
});

export default router;
