// Streamer Studio (admin-only while in development):
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

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

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

async function getRec(id: string) {
  const r = rowsOf(await db.execute(sql`SELECT * FROM stream_recordings WHERE id = ${id}`));
  return r[0] as { id: string; user_id: string; object_key: string; upload_id: string | null; mime: string; status: string } | undefined;
}

// Start a recording upload
router.post("/admin/stream-recordings", requireAdmin, async (req: Request, res: Response) => {
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
router.put("/admin/stream-recordings/:id/parts/:n", requireAdmin, express.raw({ type: () => true, limit: "16mb" }), async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const rec = await getRec(String(req.params.id));
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

router.post("/admin/stream-recordings/:id/complete", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const rec = await getRec(String(req.params.id));
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

router.delete("/admin/stream-recordings/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const rec = await getRec(String(req.params.id));
    if (rec) await removeRec(rec);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "[streams] delete failed");
    res.status(500).json({ error: "Couldn't delete the recording." });
  }
});

router.get("/admin/stream-recordings", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    // uploads that never finished (closed tab, lost signal) are cleared after a day
    const stale = rowsOf(await db.execute(sql`SELECT id, object_key, upload_id FROM stream_recordings WHERE status = 'uploading' AND created_at < now() - interval '1 day'`));
    for (const r of stale) await removeRec(r as { id: string; object_key: string; upload_id: string | null });
    const rows = rowsOf(await db.execute(sql`SELECT r.id, r.title, r.mime, r.size_bytes, r.duration_ms, r.status, r.created_at, COALESCE(u.scout_username, u.lichess_username, u.chesscom_username, u.first_name) AS username
      FROM stream_recordings r LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC LIMIT 100`).catch(async () => db.execute(sql`SELECT id, title, mime, size_bytes, duration_ms, status, created_at FROM stream_recordings ORDER BY created_at DESC LIMIT 100`)));
    res.json({ recordings: rows });
  } catch (err) {
    req.log.error({ err }, "[streams] list failed");
    res.status(500).json({ error: "Couldn't load recordings." });
  }
});

// Short-lived link to play or download
router.get("/admin/stream-recordings/:id/url", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const rec = await getRec(String(req.params.id));
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
interface Live { id: string; userId: string; title: string; host: string; startedAt: number; beat: number; viewers: Map<string, Viewer> }
const lives = new Map<string, Live>();
const LIVE_TIMEOUT = 20_000;
function sweep() {
  const now = Date.now();
  for (const [id, l] of lives) {
    if (now - l.beat > LIVE_TIMEOUT) { lives.delete(id); continue; }
    for (const [vid, v] of l.viewers) if (now - v.at > 120_000) l.viewers.delete(vid);
  }
}

router.get("/admin/live-streams", requireAdmin, (_req: Request, res: Response) => {
  sweep();
  res.json({ streams: [...lives.values()].map((l) => ({ id: l.id, title: l.title, host: l.host, startedAt: l.startedAt, viewers: [...l.viewers.values()].filter((v) => v.answer).length })) });
});

router.post("/admin/live-streams", requireAdmin, (req: Request, res: Response) => {
  sweep();
  const uid = String(req.user!.id);
  for (const [id, l] of lives) if (l.userId === uid) lives.delete(id); // one live stream per person
  const id = randomUUID();
  // the stream name the streamer chose (never their account name: they may be anonymous)
  const host = String(req.body?.host || "Streamer").slice(0, 40);
  lives.set(id, { id, userId: uid, title: String(req.body?.title || "").slice(0, 80), host, startedAt: Date.now(), beat: Date.now(), viewers: new Map() });
  res.json({ id });
});

// Streamer heartbeat: returns viewers waiting for an answer
router.post("/admin/live-streams/:id/beat", requireAdmin, (req: Request, res: Response) => {
  const l = lives.get(String(req.params.id));
  if (!l || l.userId !== String(req.user!.id)) { res.status(404).json({ error: "Not live" }); return; }
  l.beat = Date.now();
  if (typeof req.body?.title === "string") l.title = req.body.title.slice(0, 80);
  sweep();
  res.json({
    pending: [...l.viewers.values()].filter((v) => !v.answer).map((v) => ({ id: v.id, offer: v.offer })),
    watching: [...l.viewers.values()].filter((v) => v.answer).length,
  });
});

router.post("/admin/live-streams/:id/answer", requireAdmin, (req: Request, res: Response) => {
  const l = lives.get(String(req.params.id));
  if (!l || l.userId !== String(req.user!.id)) { res.status(404).json({ error: "Not live" }); return; }
  const v = l.viewers.get(String(req.body?.viewerId));
  if (!v) { res.status(404).json({ error: "Viewer gone" }); return; }
  v.answer = String(req.body?.answer || "").slice(0, 100_000);
  v.at = Date.now();
  res.json({ ok: true });
});

router.delete("/admin/live-streams/:id", requireAdmin, (req: Request, res: Response) => {
  const l = lives.get(String(req.params.id));
  if (l && l.userId === String(req.user!.id)) lives.delete(l.id);
  res.json({ ok: true });
});

router.post("/admin/live-streams/:id/join", requireAdmin, (req: Request, res: Response) => {
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

router.get("/admin/live-streams/:id/viewers/:vid", requireAdmin, (req: Request, res: Response) => {
  const l = lives.get(String(req.params.id));
  if (!l) { res.json({ ended: true, answer: null }); return; }
  const v = l.viewers.get(String(req.params.vid));
  if (v) v.at = Date.now();
  res.json({ ended: false, answer: v?.answer ?? null });
});

export default router;
