import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, gameChallengesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authMiddleware";
import { listOpenApps, notifyUser } from "../lib/notify";
import { listTimeControls, isLiveConnected, isInLiveGame } from "../lib/liveServer";
import { isValidTimeControl, dailyLabel } from "../lib/correspondence";
import { logger } from "../lib/logger";
import { declineUrl } from "../lib/challengeInvites";

// Admin: who's on ChessScout.net right now, and sending one of them a
// challenge that shows up on their dashboard ("You've been challenged"),
// in their notifications, and as a push if they allow it.
//   GET  /admin/online-now
//   POST /admin/challenge-user  { userId, kind: 'live'|'daily', timeControl, mode, color, note? }

const router: IRouter = Router();
const rowsOf = <T>(r: unknown): T[] => ((r as unknown as { rows?: T[] }).rows ?? []);
const RECENT_MIN = 10;

router.get("/admin/online-now", requireAdmin, async (req: Request, res: Response) => {
  try {
    const open = listOpenApps();
    // Also anyone who loaded a page in the last few minutes (e.g. app closed since, or no live connection).
    const recent = rowsOf<{ user_id: string; path: string; at: string }>(await db.execute(sql`
      SELECT DISTINCT ON (user_id) user_id, path, created_at AS at FROM page_views
      WHERE user_id IS NOT NULL AND created_at > now() - make_interval(mins => ${RECENT_MIN})
      ORDER BY user_id, created_at DESC`));
    const ids = [...new Set([...open.map((o) => o.userId), ...recent.map((r) => r.user_id)])].filter((id) => id !== req.user!.id);
    if (!ids.length) { res.json({ users: [], recentMinutes: RECENT_MIN }); return; }
    const users = rowsOf<{ id: string; email: string | null; scout_username: string | null; chesscom_username: string | null; lichess_username: string | null; first_name: string | null }>(await db.execute(sql`
      SELECT id, email, scout_username, chesscom_username, lichess_username, first_name FROM users
      WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND id NOT IN (SELECT id FROM analytics_excluded_users)`));
    const pushOn = new Set(rowsOf<{ user_id: string }>(await db.execute(sql`
      SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)).map((r) => r.user_id));
    const openBy = new Map(open.map((o) => [o.userId, o]));
    const recentBy = new Map(recent.map((r) => [r.user_id, r]));
    const list = users.map((u) => {
      const o = openBy.get(u.id), r = recentBy.get(u.id);
      return {
        id: u.id,
        label: u.scout_username || u.chesscom_username || u.lichess_username || u.first_name || u.email || u.id,
        email: u.email, scoutUsername: u.scout_username, chesscomUsername: u.chesscom_username, lichessUsername: u.lichess_username,
        status: o ? (o.visible ? "online" : "app open in background") : "active in the last few minutes",
        path: o?.path ?? r?.path ?? null,
        lastSeenAt: o?.seenAt ? new Date(o.seenAt).toISOString() : r?.at ? new Date(r.at).toISOString() : null,
        pushEnabled: pushOn.has(u.id),
        onLivePlay: isLiveConnected(u.id),
        inLiveGame: isInLiveGame(u.id),
      };
    }).sort((a, b) => (a.status === "online" ? 0 : 1) - (b.status === "online" ? 0 : 1) || (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));
    res.json({ users: list, recentMinutes: RECENT_MIN, liveTimeControls: listTimeControls() });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load who's online", details: err?.message });
  }
});

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => [...crypto.randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join("");

router.post("/admin/challenge-user", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, kind, timeControl, mode, color, note } = req.body as { userId?: string; kind?: string; timeControl?: string; mode?: string; color?: string; note?: string };
    if (!userId || userId === req.user!.id) { res.status(400).json({ error: "Pick someone to challenge" }); return; }
    if (kind !== "live" && kind !== "daily") { res.status(400).json({ error: "kind must be 'live' or 'daily'" }); return; }
    const liveTc = listTimeControls().find((t) => t.id === timeControl);
    if (kind === "live" && !liveTc) { res.status(400).json({ error: "Invalid live time control" }); return; }
    if (kind === "daily" && !(timeControl && isValidTimeControl(timeControl))) { res.status(400).json({ error: "Invalid daily time control" }); return; }
    const target = rowsOf<{ id: string }>(await db.execute(sql`SELECT id FROM users WHERE id = ${userId}`))[0];
    if (!target) { res.status(404).json({ error: "That account no longer exists" }); return; }

    const me = req.user!;
    const myName = me.scoutUsername || me.chesscomUsername || me.lichessUsername || me.firstName || "ChessScout.net";
    const code = newCode();
    await db.insert(gameChallengesTable).values({
      code, creatorUserId: me.id, creatorUsername: myName, kind, timeControl: timeControl!,
      mode: mode === "ranked" ? "ranked" : "casual",
      color: color === "white" || color === "black" ? color : "random",
      open: false,
      expiresAt: new Date(Date.now() + (kind === "live" ? 24 : 7 * 24) * 60 * 60 * 1000),
    });
    // Shows on their dashboard and Play screen under "You've been challenged".
    await db.execute(sql`INSERT INTO challenge_invites (user_id, code, invited_by) VALUES (${userId}, ${code}, ${me.id}) ON CONFLICT (user_id, code) DO NOTHING`);
    const tcLabel = kind === "live" ? liveTc!.label : `${dailyLabel(timeControl!)} per move`;
    const extra = typeof note === "string" && note.trim() ? ` "${note.trim().slice(0, 140)}"` : "";
    await notifyUser(userId, {
      title: `${myName} challenged you`,
      body: `${kind === "live" ? "Live" : "Daily"} game, ${tcLabel}, ${mode === "ranked" ? "ranked" : "casual"}. Tap to play.${extra}`,
      url: `/challenge/${code}`,
      kind: "challenge",
      tag: `challenge:${code}`,
      // On the phone: Accept / Decline buttons, stays until answered, buzzes.
      push: {
        actions: [{ action: "accept", title: "Accept" }, { action: "decline", title: "Decline" }],
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 400],
        links: { accept: `/challenge/${code}?accept=1`, decline: declineUrl(userId, code) },
      },
    }).catch((err) => logger.warn({ err }, "[admin-challenge] notify failed"));
    res.json({ code, url: `/challenge/${code}` });
  } catch (err: any) {
    res.status(500).json({ error: "Could not send the challenge", details: err?.message });
  }
});

export default router;
