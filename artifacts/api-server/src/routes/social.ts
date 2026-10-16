import { Router, type IRouter, type Request, type Response } from "express";
import { db, gameChallengesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { notifyUser, emitToUser, hasOpenApp } from "../lib/notify";
import { isLiveConnected, isInLiveGame, listTimeControls } from "../lib/liveServer";
import { logger } from "../lib/logger";

// Friends and direct messages.
//   GET    /friends                     friends (with online status + unread), incoming and sent requests
//   GET    /friends/search?q=           find people by username / first name
//   POST   /friends/request {userId}    send a request (accepts theirs if they already asked you)
//   POST   /friends/:userId/accept
//   POST   /friends/:userId/decline
//   DELETE /friends/:userId             unfriend, or cancel a request you sent
//   GET    /messages/:userId            thread with a friend (marks it read)
//   POST   /messages/:userId {body?, challengeCode?}
//   GET    /social/unread               { messages, requests } for badges
const router: IRouter = Router();

interface UserRow { id: string; scout_username?: string | null; chesscom_username: string | null; lichess_username: string | null; first_name: string | null; profile_image_url: string | null }

function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] })?.rows) ?? [];
}

function nameOf(u: Pick<UserRow, "scout_username" | "chesscom_username" | "lichess_username" | "first_name">): string {
  return u.scout_username || u.chesscom_username || u.lichess_username || u.first_name || "Player";
}

function avatarOf(u: UserRow): string {
  return u.profile_image_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(nameOf(u))}&backgroundType=gradientLinear`;
}

function presence(userId: string): "playing" | "online" | "offline" {
  if (isInLiveGame(userId)) return "playing";
  if (isLiveConnected(userId) || hasOpenApp(userId)) return "online";
  return "offline";
}

function person(u: UserRow) {
  return { userId: u.id, name: nameOf(u), avatar: avatarOf(u), status: presence(u.id) };
}

const me = (req: Request) => req.user!.id;
const myName = (req: Request) => req.user!.scoutUsername || req.user!.chesscomUsername || req.user!.lichessUsername || req.user!.firstName || "Player";

async function loadUser(id: string): Promise<UserRow | null> {
  const r = rowsOf<UserRow>(await db.execute(sql`
    SELECT id, scout_username, chesscom_username, lichess_username, first_name, profile_image_url FROM users WHERE id = ${id}`));
  return r[0] ?? null;
}

async function areFriends(a: string, b: string): Promise<boolean> {
  const r = rowsOf<{ id: number }>(await db.execute(sql`
    SELECT id FROM friendships WHERE status = 'accepted'
      AND ((requester_id = ${a} AND addressee_id = ${b}) OR (requester_id = ${b} AND addressee_id = ${a})) LIMIT 1`));
  return r.length > 0;
}

router.get("/friends", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    interface FRow extends UserRow { requester_id: string; status: string; created_at: string }
    const rows = rowsOf<FRow>(await db.execute(sql`
      SELECT f.requester_id, f.status, f.created_at, u.id, u.scout_username, u.chesscom_username, u.lichess_username, u.first_name, u.profile_image_url
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.requester_id = ${uid} THEN f.addressee_id ELSE f.requester_id END
      WHERE f.requester_id = ${uid} OR f.addressee_id = ${uid}`));
    const unread = rowsOf<{ sender_id: string; n: number | string }>(await db.execute(sql`
      SELECT sender_id, COUNT(*) AS n FROM direct_messages WHERE recipient_id = ${uid} AND read_at IS NULL GROUP BY sender_id`));
    const unreadBy = new Map(unread.map((r) => [r.sender_id, Number(r.n) || 0]));
    const last = rowsOf<{ partner: string; body: string; created_at: string; sender_id: string }>(await db.execute(sql`
      SELECT DISTINCT ON (partner) partner, body, created_at, sender_id FROM (
        SELECT CASE WHEN sender_id = ${uid} THEN recipient_id ELSE sender_id END AS partner, body, created_at, sender_id
        FROM direct_messages WHERE sender_id = ${uid} OR recipient_id = ${uid}
      ) x ORDER BY partner, created_at DESC`));
    const lastBy = new Map(last.map((r) => [r.partner, r]));

    const rank = { playing: 0, online: 0, offline: 1 } as const;
    const friends = rows.filter((r) => r.status === "accepted").map((r) => {
      const l = lastBy.get(r.id);
      return {
        ...person(r),
        unread: unreadBy.get(r.id) ?? 0,
        lastMessage: l ? { body: l.body, at: l.created_at, mine: l.sender_id === uid } : null,
      };
    }).sort((a, b) =>
      (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0)
      || rank[a.status] - rank[b.status]
      || (b.lastMessage ? new Date(b.lastMessage.at).getTime() : 0) - (a.lastMessage ? new Date(a.lastMessage.at).getTime() : 0)
      || a.name.localeCompare(b.name));
    const incoming = rows.filter((r) => r.status === "pending" && r.requester_id !== uid).map((r) => ({ ...person(r), at: r.created_at }));
    const sent = rows.filter((r) => r.status === "pending" && r.requester_id === uid).map((r) => ({ ...person(r), at: r.created_at }));
    res.json({ friends, incoming, sent });
  } catch (err) {
    logger.error({ err }, "[friends] list failed");
    res.status(500).json({ error: "Could not load friends" });
  }
});

router.get("/friends/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    const q = String(req.query.q ?? "").trim().slice(0, 40);
    if (q.length < 2) { res.json({ results: [] }); return; }
    const like = q.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
    const rows = rowsOf<UserRow & { rel_status: string | null; rel_requester: string | null }>(await db.execute(sql`
      SELECT u.id, u.scout_username, u.chesscom_username, u.lichess_username, u.first_name, u.profile_image_url,
        f.status AS rel_status, f.requester_id AS rel_requester
      FROM users u
      LEFT JOIN friendships f ON (f.requester_id = ${uid} AND f.addressee_id = u.id) OR (f.addressee_id = ${uid} AND f.requester_id = u.id)
      WHERE u.id <> ${uid} AND (
        u.scout_username ILIKE ${like} OR u.chesscom_username ILIKE ${like} OR u.lichess_username ILIKE ${like} OR u.first_name ILIKE ${like}
      )
      ORDER BY (LOWER(COALESCE(u.scout_username, u.chesscom_username, u.lichess_username, u.first_name, '')) = LOWER(${q})) DESC, u.created_at DESC
      LIMIT 15`));
    res.json({
      results: rows.map((r) => ({
        ...person(r),
        relation: r.rel_status === "accepted" ? "friends" : r.rel_status === "pending" ? (r.rel_requester === uid ? "sent" : "incoming") : "none",
      })),
    });
  } catch (err) {
    logger.error({ err }, "[friends] search failed");
    res.status(500).json({ error: "Search failed" });
  }
});

router.post("/friends/request", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    const target = String((req.body as { userId?: string })?.userId ?? "");
    if (!target || target === uid) { res.status(400).json({ error: "Pick someone else" }); return; }
    const other = await loadUser(target);
    if (!other) { res.status(404).json({ error: "Player not found" }); return; }
    const existing = rowsOf<{ requester_id: string; status: string }>(await db.execute(sql`
      SELECT requester_id, status FROM friendships
      WHERE (requester_id = ${uid} AND addressee_id = ${target}) OR (requester_id = ${target} AND addressee_id = ${uid})`));
    const row = existing[0];
    if (row?.status === "accepted") { res.json({ relation: "friends" }); return; }
    if (row && row.requester_id === uid) { res.json({ relation: "sent" }); return; }
    if (row && row.requester_id === target) {
      // They already asked you: this is a yes.
      await db.execute(sql`UPDATE friendships SET status = 'accepted', accepted_at = now()
        WHERE requester_id = ${target} AND addressee_id = ${uid}`);
      notifyUser(target, { kind: "friend", title: "Friend request accepted", body: `${myName(req)} is now your friend. Say hi or send a challenge.`, url: `/messages/${uid}` }).catch(() => {});
      res.json({ relation: "friends" });
      return;
    }
    const pending = rowsOf<{ n: number | string }>(await db.execute(sql`
      SELECT COUNT(*) AS n FROM friendships WHERE requester_id = ${uid} AND status = 'pending'`));
    if (Number(pending[0]?.n ?? 0) >= 100) { res.status(429).json({ error: "You have a lot of requests waiting. Try again once some are answered." }); return; }
    await db.execute(sql`INSERT INTO friendships (requester_id, addressee_id) VALUES (${uid}, ${target}) ON CONFLICT DO NOTHING`);
    notifyUser(target, { kind: "friend", title: "New friend request", body: `${myName(req)} wants to be friends on ChessScout.`, url: "/friends" }).catch(() => {});
    emitToUser(target, "friends_update", {});
    res.json({ relation: "sent" });
  } catch (err) {
    logger.error({ err }, "[friends] request failed");
    res.status(500).json({ error: "Could not send the request" });
  }
});

router.post("/friends/:userId/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    const other = String(req.params.userId);
    const r = rowsOf<{ id: number }>(await db.execute(sql`
      UPDATE friendships SET status = 'accepted', accepted_at = now()
      WHERE requester_id = ${other} AND addressee_id = ${uid} AND status = 'pending' RETURNING id`));
    if (r.length === 0) { res.status(404).json({ error: "Request not found" }); return; }
    notifyUser(other, { kind: "friend", title: "Friend request accepted", body: `${myName(req)} is now your friend. Say hi or send a challenge.`, url: `/messages/${uid}` }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[friends] accept failed");
    res.status(500).json({ error: "Could not accept" });
  }
});

router.post("/friends/:userId/decline", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM friendships WHERE requester_id = ${String(req.params.userId)} AND addressee_id = ${me(req)} AND status = 'pending'`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[friends] decline failed");
    res.status(500).json({ error: "Could not decline" });
  }
});

router.delete("/friends/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    const other = String(req.params.userId);
    await db.execute(sql`DELETE FROM friendships
      WHERE (requester_id = ${uid} AND addressee_id = ${other}) OR (requester_id = ${other} AND addressee_id = ${uid})`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[friends] remove failed");
    res.status(500).json({ error: "Could not remove" });
  }
});

interface MsgRow { id: number; sender_id: string; recipient_id: string; body: string; challenge_code: string | null; created_at: string; read_at: string | null }
function publicMsg(m: MsgRow, uid: string) {
  return { id: m.id, mine: m.sender_id === uid, from: m.sender_id, body: m.body, challengeCode: m.challenge_code, at: m.created_at, read: !!m.read_at };
}

router.get("/messages/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    const other = String(req.params.userId);
    const u = await loadUser(other);
    if (!u) { res.status(404).json({ error: "Player not found" }); return; }
    const before = Number(req.query.before) || 0;
    const rows = rowsOf<MsgRow>(await db.execute(sql`
      SELECT id, sender_id, recipient_id, body, challenge_code, created_at, read_at FROM direct_messages
      WHERE ((sender_id = ${uid} AND recipient_id = ${other}) OR (sender_id = ${other} AND recipient_id = ${uid}))
        ${before ? sql`AND id < ${before}` : sql``}
      ORDER BY id DESC LIMIT 50`));
    const marked = rowsOf<{ id: number }>(await db.execute(sql`
      UPDATE direct_messages SET read_at = now() WHERE recipient_id = ${uid} AND sender_id = ${other} AND read_at IS NULL RETURNING id`));
    if (marked.length > 0) {
      emitToUser(uid, "dm_read", { userId: other });
      // the chat is read, so its bell entry is too
      await db.execute(sql`UPDATE notifications SET read_at = now() WHERE user_id = ${uid} AND url = ${`/messages/${other}`} AND read_at IS NULL`);
    }
    // Challenges in the chat: show whether each is still open.
    const codes = [...new Set(rows.map((r) => r.challenge_code).filter((c): c is string => !!c))];
    const challenges: Record<string, { status: string; label: string | null; expired: boolean }> = {};
    for (const code of codes) {
      const [ch] = await db.select().from(gameChallengesTable).where(eq(gameChallengesTable.code, code));
      if (!ch) continue;
      challenges[code] = {
        status: ch.status,
        label: listTimeControls().find((t) => t.id === ch.timeControl)?.label ?? null,
        expired: new Date(ch.expiresAt).getTime() < Date.now(),
      };
    }
    res.json({
      friend: { ...person(u), isFriend: await areFriends(uid, other) },
      messages: rows.reverse().map((m) => publicMsg(m, uid)),
      challenges,
      hasMore: rows.length === 50,
    });
  } catch (err) {
    logger.error({ err }, "[messages] thread failed");
    res.status(500).json({ error: "Could not load messages" });
  }
});

// Simple flood guard: 30 messages a minute per sender.
const sendLog = new Map<string, number[]>();
function allowSend(uid: string): boolean {
  const now = Date.now();
  const list = (sendLog.get(uid) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 30) { sendLog.set(uid, list); return false; }
  list.push(now);
  sendLog.set(uid, list);
  return true;
}

router.post("/messages/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    const other = String(req.params.userId);
    if (other === uid) { res.status(400).json({ error: "That's you" }); return; }
    if (!(await areFriends(uid, other))) { res.status(403).json({ error: "You can only message friends" }); return; }
    if (!allowSend(uid)) { res.status(429).json({ error: "Slow down a little" }); return; }
    const { body: rawBody, challengeCode } = (req.body ?? {}) as { body?: string; challengeCode?: string };
    let body = String(rawBody ?? "").trim().slice(0, 1000);
    let code: string | null = null;
    let label = "";
    if (challengeCode) {
      const [ch] = await db.select().from(gameChallengesTable).where(eq(gameChallengesTable.code, String(challengeCode)));
      if (!ch || ch.creatorUserId !== uid) { res.status(400).json({ error: "Challenge not found" }); return; }
      code = ch.code;
      label = listTimeControls().find((t) => t.id === ch.timeControl)?.label ?? ch.timeControl;
      if (!body) body = `Challenge: ${label} · ${ch.mode === "ranked" ? "Ranked" : "Casual"}`;
    }
    if (!body) { res.status(400).json({ error: "Write a message" }); return; }
    const rows = rowsOf<MsgRow>(await db.execute(sql`
      INSERT INTO direct_messages (sender_id, recipient_id, body, challenge_code)
      VALUES (${uid}, ${other}, ${body}, ${code})
      RETURNING id, sender_id, recipient_id, body, challenge_code, created_at, read_at`));
    const m = rows[0];
    if (!m) { res.status(500).json({ error: "Could not send" }); return; }
    emitToUser(other, "dm", { from: uid, message: publicMsg(m, other) });
    emitToUser(uid, "dm", { from: uid, to: other, message: publicMsg(m, uid) });
    const sender = myName(req);
    notifyUser(other, code
      ? { kind: "challenge", title: `${sender} challenged you`, body: `${label} live game. Tap to accept.`, url: `/challenge/${code}` }
      : { kind: "message", title: sender, body: body.length > 120 ? body.slice(0, 117) + "…" : body, url: `/messages/${uid}` },
    ).catch(() => {});
    res.json({ message: publicMsg(m, uid) });
  } catch (err) {
    logger.error({ err }, "[messages] send failed");
    res.status(500).json({ error: "Could not send" });
  }
});

router.get("/social/unread", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    const m = rowsOf<{ n: number | string }>(await db.execute(sql`
      SELECT COUNT(*) AS n FROM direct_messages WHERE recipient_id = ${uid} AND read_at IS NULL`));
    const r = rowsOf<{ n: number | string }>(await db.execute(sql`
      SELECT COUNT(*) AS n FROM friendships WHERE addressee_id = ${uid} AND status = 'pending'`));
    res.json({ messages: Number(m[0]?.n ?? 0), requests: Number(r[0]?.n ?? 0) });
  } catch (err) {
    logger.error({ err }, "[social] unread failed");
    res.json({ messages: 0, requests: 0 });
  }
});

export default router;
