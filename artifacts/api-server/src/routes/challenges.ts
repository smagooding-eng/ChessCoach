import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, gameChallengesTable } from "@workspace/db";
import { and, eq, desc, inArray, isNotNull, gt, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { listTimeControls, cancelLiveRequestWaiter } from "../lib/liveServer";
import { isValidTimeControl, startGame, dailyLabel } from "../lib/correspondence";
import { notifyUser } from "../lib/notify";
import { logger } from "../lib/logger";

// "Challenge a friend" links for live and daily games.
//   POST /challenges            create  -> { code }
//   GET  /challenges/:code      details (public, so the link preview works signed-out)
//   POST /challenges/:code/accept   daily only (live is accepted over the live WebSocket)
//   POST /challenges/:code/cancel   creator only
//   GET  /challenges/mine       creator's open challenges
//
// Open links (open = true) can be used by anyone, any number of times. Each
// use creates a *request* (a row with parentCode = the open link's code) that
// the link's owner accepts or declines:
//   POST /challenges/:code/request    someone asks to play the owner
//   GET  /challenges/requests         owner's incoming requests
//   POST /challenges/:code/approve    owner accepts a daily request (live: over the WebSocket)
//   POST /challenges/:code/decline    owner declines
//   POST /challenges/:code/withdraw   requester takes it back
const router: IRouter = Router();

const LIVE_TTL_MS = 24 * 60 * 60 * 1000;
const DAILY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OPEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;      // open links last until turned off
const LIVE_REQUEST_TTL_MS = 30 * 60 * 1000;          // a live request is stale after 30 min
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
    status: new Date(ch.expiresAt).getTime() < Date.now() && (ch.status === "open" || ch.status === "requested") ? "expired" : ch.status === "started" ? "accepted" : ch.status,
    creatorUsername: ch.creatorUsername,
    open: ch.open,
    isRequest: !!ch.parentCode,
    parentCode: ch.parentCode,
    requesterUsername: ch.parentCode ? ch.acceptedByUsername : null,
    gameId: ch.gameId,
    expiresAt: ch.expiresAt,
  };
}

router.post("/challenges", requireAuth, async (req: Request, res: Response) => {
  try {
    const { kind, timeControl, mode, color, open } = req.body as { kind?: string; timeControl?: string; mode?: string; color?: string; open?: boolean };
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
      open: open === true,
      expiresAt: new Date(Date.now() + (open === true ? OPEN_TTL_MS : kind === "live" ? LIVE_TTL_MS : DAILY_TTL_MS)),
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

// Challenges you've opened but not answered yet -- shown on your home and
// Play screens so a link you looked at (e.g. right before signing up) isn't lost.
router.get("/challenges/invites", requireAuth, async (req: Request, res: Response) => {
  try {
    const r = await db.execute(sql`
      SELECT ci.code FROM challenge_invites ci
      JOIN game_challenges gc ON gc.code = ci.code
      WHERE ci.user_id = ${req.user!.id} AND ci.dismissed_at IS NULL
        AND gc.status = 'open' AND gc.expires_at > now()
        AND gc.creator_user_id <> ${req.user!.id} AND gc.parent_code IS NULL
      ORDER BY ci.created_at DESC LIMIT 10
    `);
    const list = (Array.isArray(r) ? r : ((r as unknown as { rows?: unknown[] }).rows ?? [])) as { code: string }[];
    const codes = list.map((x) => x.code);
    if (codes.length === 0) { res.json({ invites: [] }); return; }
    const rows = await db.select().from(gameChallengesTable).where(inArray(gameChallengesTable.code, codes));
    const order = new Map(codes.map((c, i) => [c, i]));
    rows.sort((a, b) => (order.get(a.code) ?? 0) - (order.get(b.code) ?? 0));
    res.json({ invites: rows.map(publicChallenge) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load invites", details: err.cause?.message ?? err.message });
  }
});

// Requests you've sent through other people's open links, still waiting.
router.get("/challenges/sent", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(gameChallengesTable)
      .where(and(
        eq(gameChallengesTable.acceptedByUserId, req.user!.id),
        isNotNull(gameChallengesTable.parentCode),
        inArray(gameChallengesTable.status, ["requested", "approved"]),
        gt(gameChallengesTable.expiresAt, new Date()),
      ))
      .orderBy(desc(gameChallengesTable.createdAt)).limit(20);
    res.json({ sent: rows.map(publicChallenge) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load", details: err.cause?.message ?? err.message });
  }
});

// Challenge requests waiting for the owner's answer (newest first).
router.get("/challenges/requests", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(gameChallengesTable)
      .where(and(
        eq(gameChallengesTable.creatorUserId, req.user!.id),
        isNotNull(gameChallengesTable.parentCode),
        inArray(gameChallengesTable.status, ["requested", "approved"]),
        gt(gameChallengesTable.expiresAt, new Date()),
      ))
      .orderBy(desc(gameChallengesTable.createdAt)).limit(30);
    res.json({ requests: rows.map(publicChallenge) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load requests", details: err.cause?.message ?? err.message });
  }
});

router.get("/challenges/:code", async (req: Request, res: Response) => {
  try {
    const [ch] = await db.select().from(gameChallengesTable).where(eq(gameChallengesTable.code, String(req.params.code)));
    if (!ch) { res.status(404).json({ error: "Challenge not found" }); return; }
    res.json({
      challenge: publicChallenge(ch),
      isCreator: req.user?.id === ch.creatorUserId,
      isRequester: !!ch.parentCode && !!req.user?.id && req.user.id === ch.acceptedByUserId,
    });
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
    if (ch.open || ch.parentCode) { res.status(400).json({ error: "Send a challenge request instead" }); return; }
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

    notifyUser(ch.creatorUserId, {
      kind: "challenge",
      title: "Challenge accepted",
      body: `${me.name} accepted your daily challenge (${dailyLabel(ch.timeControl)} per move). You're ${creatorWhite ? "White — your move!" : "Black."}`,
      url: `/daily/${game.id}`,
    }).catch((err) => logger.warn({ err }, "[challenges] accepted push failed"));

    res.json({ gameId: game.id });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to accept challenge", details: err.cause?.message ?? err.message });
  }
});

// The signed-in person opened this challenge link: remember it for them.
router.post("/challenges/:code/seen", requireAuth, async (req: Request, res: Response) => {
  try {
    const [ch] = await db.select().from(gameChallengesTable).where(eq(gameChallengesTable.code, String(req.params.code)));
    if (!ch || ch.parentCode || ch.creatorUserId === req.user!.id) { res.json({ success: false }); return; }
    await db.execute(sql`
      INSERT INTO challenge_invites (user_id, code) VALUES (${req.user!.id}, ${ch.code})
      ON CONFLICT (user_id, code) DO NOTHING
    `);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed", details: err.cause?.message ?? err.message });
  }
});

router.post("/challenges/:code/dismiss", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE challenge_invites SET dismissed_at = now() WHERE user_id = ${req.user!.id} AND code = ${String(req.params.code)}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed", details: err.cause?.message ?? err.message });
  }
});

// ── Open links: requests ───────────────────────────────────────────────────

// Someone opened an open link and wants to play its owner.
router.post("/challenges/:code/request", requireAuth, async (req: Request, res: Response) => {
  try {
    const [link] = await db.select().from(gameChallengesTable).where(eq(gameChallengesTable.code, String(req.params.code)));
    if (!link || !link.open) { res.status(404).json({ error: "Challenge link not found" }); return; }
    if (link.creatorUserId === req.user!.id) { res.status(400).json({ error: "That's your own link — post it so others can challenge you." }); return; }
    if (link.status !== "open") { res.status(410).json({ error: `${link.creatorUsername} has turned this link off` }); return; }
    if (new Date(link.expiresAt).getTime() < Date.now()) { res.status(410).json({ error: "This link has expired" }); return; }

    // One pending request per person per link: re-use it.
    const [existing] = await db.select().from(gameChallengesTable).where(and(
      eq(gameChallengesTable.parentCode, link.code),
      eq(gameChallengesTable.acceptedByUserId, req.user!.id),
      inArray(gameChallengesTable.status, ["requested", "approved"]),
      gt(gameChallengesTable.expiresAt, new Date()),
    ));
    if (existing) { res.json({ request: publicChallenge(existing) }); return; }

    const name = displayName(req);
    await db.execute(sql`UPDATE challenge_invites SET dismissed_at = now() WHERE user_id = ${req.user!.id} AND code = ${link.code}`).catch(() => {});
    const [row] = await db.insert(gameChallengesTable).values({
      code: newCode(),
      creatorUserId: link.creatorUserId,
      creatorUsername: link.creatorUsername,
      kind: link.kind,
      timeControl: link.timeControl,
      mode: link.mode,
      color: link.color,
      status: "requested",
      acceptedByUserId: req.user!.id,
      acceptedByUsername: name,
      parentCode: link.code,
      expiresAt: new Date(Date.now() + (link.kind === "live" ? LIVE_REQUEST_TTL_MS : DAILY_TTL_MS)),
    }).returning();

    const tcLabel = link.kind === "live" ? liveLabel(link.timeControl) : `daily ${dailyLabel(link.timeControl)}`;
    notifyUser(link.creatorUserId, {
      kind: "challenge",
      title: "Challenge request",
      body: `${name} wants to play you (${tcLabel}, ${link.mode}). Tap to accept or decline.`,
      url: `/challenge/${row.code}`,
    }).catch((err) => logger.warn({ err }, "[challenges] request push failed"));

    res.json({ request: publicChallenge(row) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to send the request", details: err.cause?.message ?? err.message });
  }
});

// Owner accepts a DAILY request: the game starts now (no one needs to be online).
router.post("/challenges/:code/approve", requireAuth, async (req: Request, res: Response) => {
  try {
    const [ch] = await db.select().from(gameChallengesTable).where(eq(gameChallengesTable.code, String(req.params.code)));
    if (!ch || !ch.parentCode || ch.creatorUserId !== req.user!.id) { res.status(404).json({ error: "Request not found" }); return; }
    if (ch.kind !== "daily") { res.status(400).json({ error: "Live requests are accepted from the Live play screen" }); return; }
    if (ch.status !== "requested") { res.status(409).json({ error: ch.status === "cancelled" ? "They withdrew the request" : "This request was already answered" }); return; }
    if (new Date(ch.expiresAt).getTime() < Date.now()) { res.status(410).json({ error: "This request has expired" }); return; }
    if (!isValidTimeControl(ch.timeControl) || !ch.acceptedByUserId || !ch.acceptedByUsername) { res.status(400).json({ error: "Invalid request" }); return; }

    const [claimed] = await db.update(gameChallengesTable).set({ status: "approved" })
      .where(and(eq(gameChallengesTable.code, ch.code), eq(gameChallengesTable.status, "requested"))).returning();
    if (!claimed) { res.status(409).json({ error: "This request was already answered" }); return; }

    const ownerWhite = ch.color === "white" ? true : ch.color === "black" ? false : Math.random() < 0.5;
    const mode = ch.mode === "ranked" ? "ranked" : "casual";
    const game = ownerWhite
      ? await startGame(ch.creatorUserId, ch.creatorUsername, ch.acceptedByUserId, ch.acceptedByUsername, ch.timeControl, mode)
      : await startGame(ch.acceptedByUserId, ch.acceptedByUsername, ch.creatorUserId, ch.creatorUsername, ch.timeControl, mode);
    await db.update(gameChallengesTable).set({ gameId: game.id, status: "started" }).where(eq(gameChallengesTable.code, ch.code));

    notifyUser(ch.acceptedByUserId, {
      kind: "challenge",
      title: "Challenge accepted",
      body: `${ch.creatorUsername} accepted your daily challenge. You're ${ownerWhite ? "Black." : "White — your move!"}`,
      url: `/daily/${game.id}`,
    }).catch((err) => logger.warn({ err }, "[challenges] approve push failed"));

    res.json({ gameId: game.id });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to accept", details: err.cause?.message ?? err.message });
  }
});

router.post("/challenges/:code/decline", requireAuth, async (req: Request, res: Response) => {
  try {
    const [ch] = await db.update(gameChallengesTable).set({ status: "declined" })
      .where(and(
        eq(gameChallengesTable.code, String(req.params.code)),
        eq(gameChallengesTable.creatorUserId, req.user!.id),
        isNotNull(gameChallengesTable.parentCode),
        inArray(gameChallengesTable.status, ["requested", "approved"]),
      )).returning();
    if (ch?.acceptedByUserId) {
      cancelLiveRequestWaiter(ch.code, `${ch.creatorUsername} declined your challenge.`);
      notifyUser(ch.acceptedByUserId, {
        kind: "challenge",
        title: "Challenge declined",
        body: `${ch.creatorUsername} can't play right now.`,
        url: `/challenge/${ch.code}`,
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to decline", details: err.cause?.message ?? err.message });
  }
});

router.post("/challenges/:code/withdraw", requireAuth, async (req: Request, res: Response) => {
  try {
    const [ch] = await db.update(gameChallengesTable).set({ status: "cancelled" })
      .where(and(
        eq(gameChallengesTable.code, String(req.params.code)),
        eq(gameChallengesTable.acceptedByUserId, req.user!.id),
        isNotNull(gameChallengesTable.parentCode),
        inArray(gameChallengesTable.status, ["requested", "approved"]),
      )).returning();
    if (ch) cancelLiveRequestWaiter(ch.code, "Request withdrawn.");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to withdraw", details: err.cause?.message ?? err.message });
  }
});

export default router;
