// Content Studio: MP4s with sound. A phone can't record a web page with its sound, so
// a GitHub Actions runner does it (.github/workflows/studio-render.yml): it opens the
// clip in a headless browser signed in as the admin who asked, records the picture and
// the clip's own soundtrack, joins them with ffmpeg, and puts the MP4 on a GitHub
// release. The app then downloads it (or hands it to the phone's share sheet).
//
// Needs GH_RENDER_TOKEN on the server: a GitHub token for the repo with Actions
// (read and write) and Contents (read and write). GH_RENDER_REPO overrides the repo.
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { Readable } from "stream";
import { db, sessionsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authMiddleware";
import { createSession, type SessionData } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const GH = process.env.GH_RENDER_TOKEN || "";
const REPO = process.env.GH_RENDER_REPO || "smagooding-eng/ChessCoach";
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

let ready: Promise<void> | null = null;
const ensureTable = () => (ready ??= db.execute(sql`CREATE TABLE IF NOT EXISTS studio_renders (
  id varchar PRIMARY KEY, user_id varchar NOT NULL, payload jsonb NOT NULL, status varchar(16) NOT NULL DEFAULT 'queued',
  secret varchar NOT NULL, sid varchar, asset_id bigint, file_name varchar, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`).then(() => undefined).catch((e) => { ready = null; throw e; }));

type Row = { id: string; user_id: string; payload: unknown; status: string; secret: string; sid: string | null; asset_id: string | null; file_name: string | null; error: string | null; created_at: string; updated_at: string };
const getJob = async (id: string) => rowsOf<Row>(await db.execute(sql`SELECT * FROM studio_renders WHERE id = ${id}`))[0] ?? null;

router.get("/admin/studio/render/status", requireAdmin, (_req: Request, res: Response) => { res.json({ configured: !!GH }); });

// Start one: { source, queue?, title?, prefs }.
router.post("/admin/studio/render", requireAdmin, async (req: Request, res: Response) => {
  if (!GH) { res.status(503).json({ error: "MP4 downloads aren't set up yet: add GH_RENDER_TOKEN on Render (see the Studio note)." }); return; }
  const { source, queue, title, prefs, fileName } = req.body ?? {};
  if (!source || typeof source !== "object") { res.status(400).json({ error: "Nothing to render" }); return; }
  try {
    await ensureTable();
    const busy = rowsOf<{ n: string }>(await db.execute(sql`SELECT COUNT(*) AS n FROM studio_renders WHERE user_id = ${req.user!.id} AND status IN ('queued','rendering') AND created_at > now() - interval '30 minutes'`))[0];
    if (Number(busy?.n ?? 0) >= 3) { res.status(429).json({ error: "Three videos are already being made. Wait for one to finish." }); return; }
    const id = crypto.randomBytes(8).toString("hex");
    const secret = crypto.randomBytes(24).toString("hex");
    // A short-lived sign-in for the runner's browser (removed once the video is done).
    const sid = await createSession({ user: req.user! } as unknown as SessionData);
    await db.update(sessionsTable).set({ expire: new Date(Date.now() + 2 * 3600_000) }).where(eq(sessionsTable.sid, sid));
    const safeName = typeof fileName === "string" ? fileName.replace(/[^a-z0-9_-]/gi, "").slice(0, 80) : "";
    await db.execute(sql`INSERT INTO studio_renders (id, user_id, payload, secret, sid, file_name)
      VALUES (${id}, ${req.user!.id}, ${JSON.stringify({ source, queue: Array.isArray(queue) ? queue : undefined, title: typeof title === "string" ? title : undefined, prefs: prefs ?? {} })}::jsonb, ${secret}, ${sid}, ${safeName || "chessscout-clip"})`);
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/studio-render.yml/dispatches`, {
      method: "POST", headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { job: id, secret, token: sid } }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      logger.warn({ status: r.status, t: t.slice(0, 300) }, "[render] dispatch failed");
      await db.execute(sql`UPDATE studio_renders SET status = 'failed', error = ${`GitHub said ${r.status}`}, updated_at = now() WHERE id = ${id}`);
      res.status(502).json({ error: r.status === 401 || r.status === 403 || r.status === 404 ? "GitHub refused the token (check GH_RENDER_TOKEN's permissions)." : "Couldn't start the video maker." });
      return;
    }
    res.json({ id });
  } catch (err) {
    logger.error({ err }, "[render] start failed");
    res.status(500).json({ error: "Couldn't start the video maker." });
  }
});

// The latest videos (for the "Your videos" list in the Studio).
// The app footage in promo videos shows the ChessScout.net account, not yours: a
// short-lived, non-admin session for it, used only inside the video's frames.
router.post("/admin/studio/showcase-session", requireAdmin, async (req: Request, res: Response) => {
  const want = String(req.body?.username ?? "chessscout").trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9._-]{2,40}$/.test(want)) { res.status(400).json({ error: "Bad username" }); return; }
  try {
    const rows = await db.execute(sql`SELECT * FROM users WHERE LOWER(scout_username) = ${want} OR LOWER(chesscom_username) = ${want} OR LOWER(lichess_username) = ${want} OR LOWER(email) = ${want} ORDER BY (LOWER(scout_username) = ${want}) DESC LIMIT 1`);
    const u = ((rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (rows as unknown as Record<string, unknown>[]))[0];
    if (!u) { res.status(404).json({ error: `No account called "${want}"` }); return; }
    const user = {
      id: u.id, email: u.email, firstName: u.first_name ?? null, lastName: u.last_name ?? null, profileImageUrl: u.profile_image_url ?? null,
      chesscomUsername: u.chesscom_username ?? null, lichessUsername: u.lichess_username ?? null, scoutUsername: u.scout_username ?? null,
      emailOptOut: true, isAdmin: false, inviteCode: u.invite_code ?? null, emailVerified: true,
    };
    // The showcase account is the brand's own: it gets Pro so the footage shows the real Pro pages.
    if (!u.is_premium_override) await db.execute(sql`UPDATE users SET is_premium_override = true WHERE id = ${u.id as string}`);
    const sid = await createSession({ user } as unknown as SessionData);
    await db.update(sessionsTable).set({ expire: new Date(Date.now() + 2 * 3600_000) }).where(eq(sessionsTable.sid, sid));
    const [g] = ((await db.execute(sql`SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE review_data IS NOT NULL) AS reviewed FROM games WHERE user_id = ${u.id as string}`)) as unknown as { rows: { n: string; reviewed: string }[] }).rows;
    // The username its games and weaknesses are stored under (the pages look it up by name).
    const [top] = ((await db.execute(sql`SELECT username, COUNT(*) AS n FROM games WHERE user_id = ${u.id as string} AND platform <> 'chessscout' GROUP BY username ORDER BY n DESC LIMIT 1`)) as unknown as { rows: { username: string }[] }).rows;
    const username = (top?.username ?? u.chesscom_username ?? u.lichess_username ?? null) as string | null;
    res.json({ games: Number(g?.n ?? 0), reviewed: Number(g?.reviewed ?? 0), linked: (u.chesscom_username ?? u.lichess_username ?? top?.username ?? null) as string | null, username, token: sid, name: (u.scout_username ?? u.chesscom_username ?? want) as string });
  } catch (err) { logger.error({ err }, "[studio] showcase session"); res.status(500).json({ error: "Couldn't start it" }); }
});

router.get("/admin/studio/renders", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const rows = rowsOf<Row>(await db.execute(sql`SELECT id, status, error, file_name, created_at FROM studio_renders WHERE user_id = ${req.user!.id} AND created_at > now() - interval '14 days' ORDER BY created_at DESC LIMIT 12`));
    res.json({ renders: rows.map((r) => ({ id: r.id, status: r.status, error: r.error, fileName: r.file_name, createdAt: r.created_at })) });
  } catch { res.json({ renders: [] }); }
});

// The job (status for the app; the clip itself for the runner's page).
router.get("/admin/studio/render/:id", requireAdmin, async (req: Request, res: Response) => {
  await ensureTable().catch(() => {});
  const j = await getJob(String(req.params.id)).catch(() => null);
  if (!j || j.user_id !== req.user!.id) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: j.id, status: j.status, error: j.error, payload: j.payload, ready: j.status === "done", fileName: j.file_name });
});

// The runner: started / finished (with the release asset) / failed.
router.post("/studio/render/:id/report", async (req: Request, res: Response) => {
  const { secret, status, assetId, error } = req.body ?? {};
  await ensureTable().catch(() => {});
  const j = await getJob(String(req.params.id)).catch(() => null);
  if (!j || typeof secret !== "string" || secret.length !== j.secret.length || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(j.secret))) { res.status(403).json({ error: "No" }); return; }
  const st = status === "rendering" || status === "done" || status === "failed" ? status : null;
  if (!st) { res.status(400).json({ error: "Bad status" }); return; }
  await db.execute(sql`UPDATE studio_renders SET status = ${st}, asset_id = ${st === "done" && Number(assetId) ? Number(assetId) : null}, error = ${typeof error === "string" ? error.slice(0, 500) : null}, updated_at = now() WHERE id = ${j.id}`);
  if (st !== "rendering" && j.sid) await db.delete(sessionsTable).where(eq(sessionsTable.sid, j.sid)).catch(() => {});
  if (st === "done") {
    const { notifyUser } = await import("../lib/notify");
    await notifyUser(j.user_id, { title: "Your video is ready 🎬", body: "The MP4 with sound is ready to download or share.", url: `/admin/studio?render=${j.id}`, kind: "studio" }).catch(() => {});
  }
  res.json({ ok: true });
});

// The MP4 itself, streamed through (so the app can download it or share it as a file).
router.get("/admin/studio/render/:id/file", requireAdmin, async (req: Request, res: Response) => {
  const j = await getJob(String(req.params.id)).catch(() => null);
  if (!j || j.user_id !== req.user!.id || j.status !== "done" || !j.asset_id) { res.status(404).json({ error: "Not ready" }); return; }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${j.asset_id}`, { headers: { Authorization: `Bearer ${GH}`, Accept: "application/octet-stream" } });
    if (!r.ok || !r.body) { res.status(502).json({ error: "Couldn't fetch the video" }); return; }
    res.setHeader("Content-Type", "video/mp4");
    const len = r.headers.get("content-length"); if (len) res.setHeader("Content-Length", len);
    res.setHeader("Content-Disposition", `attachment; filename="${j.file_name || "chessscout-clip"}.mp4"`);
    Readable.fromWeb(r.body as never).pipe(res);
  } catch (err) {
    logger.warn({ err }, "[render] file failed");
    if (!res.headersSent) res.status(502).json({ error: "Couldn't fetch the video" });
  }
});

export default router;
