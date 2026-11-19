// Streamer Studio (Pro members and admins; watching is open to anyone signed in):
//  - stream recordings, uploaded in parts while recording (R2 multipart) so long videos
//    never sit in the server's memory; played back / downloaded through short-lived R2 links
//  - live streams on chessscout.net: the streamer's browser sends video+voice straight to
//    each viewer (WebRTC); this server only passes the connection details between them.

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import express from "express";
import { randomUUID } from "crypto";
import {
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { objectStorageClient } from "../lib/objectStorage";

const router: IRouter = Router();

// The studio (recording, going live, co-streaming): Pro members and admins.
async function requireStudio(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Sign in first" }); return; }
  if (req.user.isAdmin) { next(); return; }
  try {
    const { hasFullAccess } = await import("../lib/accessControl");
    if ((await hasFullAccess(String(req.user.id))).full) { next(); return; }
  } catch { /* fall through */ }
  // Invited by the admin to stream together: the studio opens for that co-stream.
  if (adminGuest(String(req.user.id))) { next(); return; }
  res.status(403).json({ error: "Streamer Studio is part of ChessScout Pro." });
}
/** Has an invite from (or a co-stream with) an admin: Studio is open to them for it. */
function adminGuest(uid: string): boolean {
  coSweep();
  for (const c of costreams.values()) if (c.byAdmin && (c.to === uid || c.from === uid)) return true;
  return false;
}
// Watching a live stream: anyone signed in.
function requireMember(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Sign in to watch" }); return; }
  next();
}
const isAdmin = (req: Request) => !!req.user?.isAdmin;
// Every route answers at its old /admin/ path too (older studio pages still open).
const both = (p: string) => [`/admin${p}`, p];

function bucketAndPrefix(): { bucket: string; prefix: string } {
  const dir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/^\/+/, "").replace(/\/+$/, "");
  const [bucket, ...rest] = dir.split("/");
  if (!bucket) throw new Error("PRIVATE_OBJECT_DIR not set");
  return { bucket, prefix: rest.join("/") };
}

const rowsOf = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];

let tableReady: Promise<unknown> | null = null;
const ensureTable = () => (tableReady ??= db.execute(sql`CREATE TABLE IF NOT EXISTS stream_recordings (
  id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL,
  upload_id TEXT,
  mime TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'uploading',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`).catch((e) => { tableReady = null; throw e; }));

async function getRec(id: string, req?: Request) {
  const r = rowsOf(await db.execute(sql`SELECT * FROM stream_recordings WHERE id = ${id}`));
  const rec = r[0] as { id: string; user_id: string; object_key: string; upload_id: string | null; mime: string; status: string } | undefined;
  // A member's own recordings only (admins: anyone's)
  if (rec && req && !isAdmin(req) && rec.user_id !== String(req.user?.id)) return undefined;
  return rec;
}

// Start a recording upload
router.post(both("/stream-recordings"), requireStudio, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const mime = String(req.body?.mime || "video/webm").slice(0, 80);
    const title = String(req.body?.title || "").slice(0, 120);
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const id = randomUUID();
    const { bucket, prefix } = bucketAndPrefix();
    const key = `${prefix ? prefix + "/" : ""}stream-recordings/${id}.${ext}`;
    const up = await objectStorageClient.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: mime.split(";")[0] }));
    await db.execute(sql`INSERT INTO stream_recordings (id, user_id, title, object_key, upload_id, mime)
      VALUES (${id}, ${String(req.user!.id)}, ${title}, ${key}, ${up.UploadId ?? null}, ${mime})`);
    res.json({ id });
  } catch (err) {
    req.log.error({ err }, "[streams] start recording failed");
    res.status(500).json({ error: "Couldn't start saving the recording." });
  }
});

// One part (5MB+ except the last), raw bytes
router.put(both("/stream-recordings/:id/parts/:n"), requireStudio, express.raw({ type: () => true, limit: "16mb" }), async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const rec = await getRec(String(req.params.id), req);
    const n = Number(req.params.n);
    if (!rec || rec.status !== "uploading" || !rec.upload_id) { res.status(404).json({ error: "Recording not found" }); return; }
    if (!Number.isInteger(n) || n < 1 || n > 10000) { res.status(400).json({ error: "Bad part number" }); return; }
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) { res.status(400).json({ error: "Empty part" }); return; }
    const { bucket } = bucketAndPrefix();
    const out = await objectStorageClient.send(new UploadPartCommand({ Bucket: bucket, Key: rec.object_key, UploadId: rec.upload_id, PartNumber: n, Body: body }));
    await db.execute(sql`UPDATE stream_recordings SET size_bytes = size_bytes + ${body.length} WHERE id = ${rec.id}`);
    res.json({ etag: out.ETag });
  } catch (err) {
    req.log.error({ err }, "[streams] part upload failed");
    res.status(500).json({ error: "Part upload failed" });
  }
});

router.post(both("/stream-recordings/:id/complete"), requireStudio, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const rec = await getRec(String(req.params.id), req);
    if (!rec || !rec.upload_id) { res.status(404).json({ error: "Recording not found" }); return; }
    const parts = (Array.isArray(req.body?.parts) ? req.body.parts : []) as { n: number; etag: string }[];
    if (!parts.length) { res.status(400).json({ error: "No parts" }); return; }
    const { bucket } = bucketAndPrefix();
    await objectStorageClient.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: rec.object_key, UploadId: rec.upload_id,
      MultipartUpload: { Parts: parts.sort((a, b) => a.n - b.n).map((p) => ({ PartNumber: p.n, ETag: p.etag })) },
    }));
    const dur = Math.max(0, Math.min(24 * 3600_000, Number(req.body?.durationMs) || 0));
    await db.execute(sql`UPDATE stream_recordings SET status = 'ready', upload_id = NULL, duration_ms = ${dur} WHERE id = ${rec.id}`);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "[streams] complete failed");
    res.status(500).json({ error: "Couldn't finish saving the recording." });
  }
});

async function removeRec(rec: { id: string; object_key: string; upload_id: string | null }) {
  const { bucket } = bucketAndPrefix();
  if (rec.upload_id) await objectStorageClient.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: rec.object_key, UploadId: rec.upload_id })).catch(() => undefined);
  else await objectStorageClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: rec.object_key })).catch(() => undefined);
  await db.execute(sql`DELETE FROM stream_recordings WHERE id = ${rec.id}`);
}

router.delete(both("/stream-recordings/:id"), requireStudio, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const rec = await getRec(String(req.params.id), req);
    if (rec) await removeRec(rec);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "[streams] delete failed");
    res.status(500).json({ error: "Couldn't delete the recording." });
  }
});

router.get(both("/stream-recordings"), requireStudio, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    // uploads that never finished (closed tab, lost signal) are cleared after a day
    const stale = rowsOf(await db.execute(sql`SELECT id, object_key, upload_id FROM stream_recordings WHERE status = 'uploading' AND created_at < now() - interval '1 day'`));
    // (any studio user's visit tidies these; they belong to nobody any more)
    for (const r of stale) await removeRec(r as { id: string; object_key: string; upload_id: string | null });
    const mine = isAdmin(req) ? null : String(req.user!.id);
    const rows = rowsOf(await db.execute(sql`SELECT r.id, r.title, r.mime, r.size_bytes, r.duration_ms, r.status, r.created_at, COALESCE(u.scout_username, u.lichess_username, u.chesscom_username, u.first_name) AS username
      FROM stream_recordings r LEFT JOIN users u ON u.id = r.user_id
      WHERE ${mine}::text IS NULL OR r.user_id = ${mine}
      ORDER BY r.created_at DESC LIMIT 100`));
    res.json({ recordings: rows });
  } catch (err) {
    req.log.error({ err }, "[streams] list failed");
    res.status(500).json({ error: "Couldn't load recordings." });
  }
});

// Short-lived link to play or download
router.get(both("/stream-recordings/:id/url"), requireStudio, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const rec = await getRec(String(req.params.id), req);
    if (!rec || rec.status !== "ready") { res.status(404).json({ error: "Recording not found" }); return; }
    const { bucket } = bucketAndPrefix();
    const download = req.query.download === "1";
    const ext = rec.object_key.split(".").pop() || "webm";
    const url = await getSignedUrl(objectStorageClient, new GetObjectCommand({
      Bucket: bucket, Key: rec.object_key,
      ResponseContentType: rec.mime.split(";")[0],
      ...(download ? { ResponseContentDisposition: `attachment; filename="chessscout-stream-${rec.id.slice(0, 8)}.${ext}"` } : {}),
    }), { expiresIn: 3600 });
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "[streams] url failed");
    res.status(500).json({ error: "Couldn't open the recording." });
  }
});

// ── Live streams: connection hand-off between the streamer and viewers (kept in memory) ──
interface Viewer { id: string; offer: string; answer: string | null; at: number; userId: string }
interface Live { id: string; userId: string; title: string; host: string; startedAt: number; beat: number; viewers: Map<string, Viewer>; coId?: string }
const lives = new Map<string, Live>();
const LIVE_TIMEOUT = 20_000;
function sweep() {
  const now = Date.now();
  for (const [id, l] of lives) {
    if (now - l.beat > LIVE_TIMEOUT) { lives.delete(id); continue; }
    for (const [vid, v] of l.viewers) if (now - v.at > 120_000) l.viewers.delete(vid);
  }
}

router.get(both("/live-streams"), requireMember, (_req: Request, res: Response) => {
  sweep();
  res.json({ streams: [...lives.values()].map((l) => {
    // A co-stream: both players' streams carry the same coId, so the watch page shows them as one
    const co = l.coId ? costreams.get(l.coId) : undefined;
    return { id: l.id, title: l.title, host: l.host, startedAt: l.startedAt, viewers: [...l.viewers.values()].filter((v) => v.answer).length,
      coId: co && co.status === "active" ? co.id : undefined };
  }) });
});

router.post(both("/live-streams"), requireStudio, (req: Request, res: Response) => {
  sweep();
  const uid = String(req.user!.id);
  for (const [id, l] of lives) if (l.userId === uid) lives.delete(id); // one live stream per person
  const id = randomUUID();
  // the stream name the streamer chose (never their account name: they may be anonymous)
  const host = String(req.body?.host || "Streamer").slice(0, 40);
  lives.set(id, { id, userId: uid, title: String(req.body?.title || "").slice(0, 80), host, startedAt: Date.now(), beat: Date.now(), viewers: new Map(), coId: coFor(uid)?.id });
  res.json({ id });
});

// Streamer heartbeat: returns viewers waiting for an answer
router.post(both("/live-streams/:id/beat"), requireStudio, (req: Request, res: Response) => {
  const l = lives.get(String(req.params.id));
  if (!l || l.userId !== String(req.user!.id)) { res.status(404).json({ error: "Not live" }); return; }
  l.beat = Date.now();
  l.coId = coFor(l.userId)?.id; // joins / leaves a co-stream started after going live
  if (typeof req.body?.title === "string") l.title = req.body.title.slice(0, 80);
  sweep();
  res.json({
    pending: [...l.viewers.values()].filter((v) => !v.answer).map((v) => ({ id: v.id, offer: v.offer })),
    watching: [...l.viewers.values()].filter((v) => v.answer).length,
  });
});

router.post(both("/live-streams/:id/answer"), requireStudio, (req: Request, res: Response) => {
  const l = lives.get(String(req.params.id));
  if (!l || l.userId !== String(req.user!.id)) { res.status(404).json({ error: "Not live" }); return; }
  const v = l.viewers.get(String(req.body?.viewerId));
  if (!v) { res.status(404).json({ error: "Viewer gone" }); return; }
  v.answer = String(req.body?.answer || "").slice(0, 100_000);
  v.at = Date.now();
  res.json({ ok: true });
});

router.delete(both("/live-streams/:id"), requireStudio, (req: Request, res: Response) => {
  const l = lives.get(String(req.params.id));
  if (l && l.userId === String(req.user!.id)) lives.delete(l.id);
  res.json({ ok: true });
});

router.post(both("/live-streams/:id/join"), requireMember, (req: Request, res: Response) => {
  sweep();
  const l = lives.get(String(req.params.id));
  if (!l) { res.status(404).json({ error: "This stream has ended." }); return; }
  if (l.viewers.size >= 25) { res.status(429).json({ error: "This stream is full right now." }); return; }
  const offer = String(req.body?.offer || "");
  if (!offer || offer.length > 100_000) { res.status(400).json({ error: "Bad offer" }); return; }
  const id = randomUUID();
  l.viewers.set(id, { id, offer, answer: null, at: Date.now(), userId: String(req.user!.id) });
  res.json({ viewerId: id });
});

router.get(both("/live-streams/:id/viewers/:vid"), requireMember, (req: Request, res: Response) => {
  const l = lives.get(String(req.params.id));
  if (!l) { res.json({ ended: true, answer: null }); return; }
  const v = l.viewers.get(String(req.params.vid));
  if (v) v.at = Date.now();
  res.json({ ended: false, answer: v?.answer ?? null });
});

// ── Co-streams: the two players of a live game streaming their match together ────────
// One invites from the studio, the other accepts in theirs. Their studios then connect
// to each other directly (WebRTC: each sends the other its camera panel and voice); this
// server only relays the connection messages, through a mailbox each side polls.
interface CoStream {
  id: string; gameId: string; status: "invited" | "active";
  from: string; to: string; fromName: string; toName: string;
  mail: Map<string, unknown[]>; seen: Map<string, number>; at: number;
  /** Started by the admin (any member, no game needed). */
  byAdmin?: boolean;
}
const costreams = new Map<string, CoStream>();
const CO_GONE_MS = 45_000;
function coSweep() {
  const now = Date.now();
  for (const [id, c] of costreams) {
    const quiet = [c.from, c.to].some((u) => now - (c.seen.get(u) ?? c.at) > CO_GONE_MS);
    if ((c.status === "invited" && now - c.at > 10 * 60_000) || (c.status === "active" && quiet)) costreams.delete(id);
  }
}
function coFor(userId: string): CoStream | undefined {
  coSweep();
  for (const c of costreams.values()) if (c.status === "active" && (c.from === userId || c.to === userId)) return c;
  return undefined;
}
const otherOf = (c: CoStream, uid: string) => (c.from === uid ? c.to : c.from);
const nameOf = (c: CoStream, uid: string) => (c.from === uid ? c.fromName : c.toName);

// Invite your opponent in the live game you're playing now.
router.post("/costream/invite", requireStudio, async (req: Request, res: Response) => {
  coSweep();
  const uid = String(req.user!.id);
  const { getActiveGameForUser } = await import("../lib/liveServer");
  const g = getActiveGameForUser(uid);
  if (!g || g.state.status !== "active") { res.status(400).json({ error: "Start a live game first: you can co-stream with the player you're facing." }); return; }
  const opp = g.color === "w" ? g.state.black : g.state.white;
  if (opp.isBot || !opp.userId) { res.status(400).json({ error: "You're playing a bot: co-streaming is for games against people." }); return; }
  // They need the studio too (Pro), or they'd never see the invite
  const { hasFullAccess } = await import("../lib/accessControl");
  const them = await hasFullAccess(opp.userId).catch(() => ({ full: false }));
  if (!them.full) { res.status(400).json({ error: `${opp.username} doesn't have Streamer Studio (it's part of Pro), so you can't co-stream with them.` }); return; }
  for (const [id, c] of costreams) if (c.from === uid || c.to === uid) costreams.delete(id); // one at a time
  const id = randomUUID();
  const name = String(req.body?.name || "Streamer").slice(0, 40);
  costreams.set(id, { id, gameId: g.state.id, status: "invited", from: uid, to: opp.userId, fromName: name, toName: opp.username,
    mail: new Map(), seen: new Map([[uid, Date.now()]]), at: Date.now() });
  res.json({ id, partner: opp.username });
});

// Admin: invite any member to stream together, by their ChessScout, Chess.com or Lichess
// name (or email). No game needed, and they don't need Pro: the studio opens for it.
router.post("/costream/invite-user", requireStudio, async (req: Request, res: Response) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admins only" }); return; }
  coSweep();
  const uid = String(req.user!.id);
  const who = String(req.body?.username ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!who || who.length > 80) { res.status(400).json({ error: "Enter their username." }); return; }
  const rows = await db.execute(sql`SELECT id, COALESCE(NULLIF(scout_username, ''), NULLIF(chesscom_username, ''), NULLIF(lichess_username, ''), first_name, 'Player') AS name
    FROM users WHERE lower(scout_username) = ${who} OR lower(chesscom_username) = ${who} OR lower(lichess_username) = ${who} OR lower(email) = ${who}
    ORDER BY last_login_at DESC NULLS LAST LIMIT 1`).catch(() => ({ rows: [] }));
  const [them] = ((rows as { rows?: { id: string; name: string }[] }).rows ?? []);
  if (!them) { res.status(404).json({ error: `No ChessScout member called ${who}.` }); return; }
  if (String(them.id) === uid) { res.status(400).json({ error: "That's you." }); return; }
  for (const [id, c] of costreams) if (c.from === uid || c.to === uid || c.from === String(them.id) || c.to === String(them.id)) costreams.delete(id);
  const id = randomUUID();
  const name = String(req.body?.name || "ChessScout").slice(0, 40);
  costreams.set(id, { id, gameId: "", status: "invited", from: uid, to: String(them.id), fromName: name, toName: String(them.name).slice(0, 40),
    mail: new Map(), seen: new Map([[uid, Date.now()]]), at: Date.now(), byAdmin: true });
  try {
    const { notifyUser } = await import("../lib/notify");
    await notifyUser(String(them.id), { title: "Stream together?", body: `${name} invited you to live stream together on ChessScout. Open Streamer Studio to answer.`, url: "/studio", kind: "costream" });
  } catch { /* the studio shows it anyway */ }
  res.json({ id, partner: them.name });
});

// The studio page asks whether it's open to this member (Pro, admin, or invited by the admin).
router.get("/studio/access", requireMember, async (req: Request, res: Response) => {
  if (isAdmin(req)) { res.json({ open: true }); return; }
  try {
    const { hasFullAccess } = await import("../lib/accessControl");
    if ((await hasFullAccess(String(req.user!.id))).full) { res.json({ open: true }); return; }
  } catch { /* fall through */ }
  res.json({ open: adminGuest(String(req.user!.id)) });
});

// Your co-stream (or an invite to you), and any messages from your partner. Polled ~1/s.
router.get("/costream/mine", requireStudio, (req: Request, res: Response) => {
  coSweep();
  const uid = String(req.user!.id);
  const c = [...costreams.values()].find((x) => x.from === uid || x.to === uid);
  if (!c) { res.json({ costream: null }); return; }
  c.seen.set(uid, Date.now());
  const messages = c.mail.get(uid) ?? [];
  c.mail.set(uid, []);
  const partner = otherOf(c, uid);
  const partnerLive = [...lives.values()].some((l) => l.userId === partner && Date.now() - l.beat < LIVE_TIMEOUT);
  res.json({ costream: {
    id: c.id, gameId: c.gameId, status: c.status, invitedByMe: c.from === uid,
    partner: nameOf(c, partner), partnerLive, messages,
  } });
});

router.post("/costream/:id/accept", requireStudio, (req: Request, res: Response) => {
  const c = costreams.get(String(req.params.id));
  const uid = String(req.user!.id);
  if (!c || c.to !== uid) { res.status(404).json({ error: "That invite has gone." }); return; }
  for (const [id, x] of costreams) if (id !== c.id && (x.from === uid || x.to === uid)) costreams.delete(id);
  c.status = "active";
  c.toName = String(req.body?.name || c.toName).slice(0, 40);
  c.seen.set(uid, Date.now());
  // the inviter's studio starts the connection when it sees this
  c.mail.set(c.from, [...(c.mail.get(c.from) ?? []), { type: "accepted" }]);
  res.json({ ok: true, partner: c.fromName });
});

router.post("/costream/:id/signal", requireStudio, (req: Request, res: Response) => {
  const c = costreams.get(String(req.params.id));
  const uid = String(req.user!.id);
  if (!c || c.status !== "active" || (c.from !== uid && c.to !== uid)) { res.status(404).json({ error: "Co-stream ended" }); return; }
  const msg = req.body?.message;
  if (!msg || JSON.stringify(msg).length > 200_000) { res.status(400).json({ error: "Bad message" }); return; }
  const to = otherOf(c, uid);
  const box = c.mail.get(to) ?? [];
  if (box.length < 200) box.push(msg);
  c.mail.set(to, box);
  res.json({ ok: true });
});

// Decline an invite, cancel yours, or end the co-stream (either player).
router.post("/costream/:id/end", requireStudio, (req: Request, res: Response) => {
  const c = costreams.get(String(req.params.id));
  const uid = String(req.user!.id);
  if (c && (c.from === uid || c.to === uid)) costreams.delete(c.id);
  res.json({ ok: true });
});

export default router;
