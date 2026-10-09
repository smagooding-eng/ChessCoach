import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { getSession } from "../lib/auth";
import { addStream, notifyUser, setView, clearView } from "../lib/notify";
import { isPushConfigured } from "../lib/pushNotifications";

const router: IRouter = Router();

function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] })?.rows) ?? [];
}

// Real-time stream for the open app (Server-Sent Events). EventSource can't
// send an Authorization header, so the session token may also come as
// ?token= (same value the app uses as its Bearer token).
router.get("/events", async (req: Request, res: Response) => {
  let userId = req.user?.id;
  if (!userId && typeof req.query.token === "string" && req.query.token) {
    try { userId = (await getSession(req.query.token))?.user?.id; } catch { /* ignore */ }
  }
  if (!userId) { res.status(401).end(); return; }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`retry: 5000\n\nevent: ready\ndata: {}\n\n`);

  const remove = addStream(userId, res);
  const tabId = typeof req.query.tab === "string" ? req.query.tab.slice(0, 64) : "";
  const path = typeof req.query.path === "string" ? req.query.path.slice(0, 200) : "";
  if (tabId && path) setView(userId, tabId, path, req.query.visible !== "0");
  const heartbeat = setInterval(() => { try { res.write(`: ping\n\n`); } catch { /* closed */ } }, 25_000);
  req.on("close", () => { clearInterval(heartbeat); remove(); if (tabId) clearView(userId, tabId); });
});

// The open app tells us which page it's showing (and whether it's on screen)
// so notifyUser can skip alerts about a game you're already looking at.
// Opening a page also clears that page's unread alerts.
router.post("/events/view", requireAuth, async (req: Request, res: Response) => {
  const tabId = typeof req.body?.tab === "string" ? req.body.tab.slice(0, 64) : "";
  const path = typeof req.body?.path === "string" ? req.body.path.slice(0, 200) : "";
  const visible = req.body?.visible !== false;
  if (!tabId || !path) { res.status(400).json({ error: "tab and path required" }); return; }
  setView(req.user!.id, tabId, path, visible);
  let cleared = 0;
  if (visible) {
    try {
      const r = await db.execute(sql`
        UPDATE notifications SET read_at = now()
        WHERE user_id = ${req.user!.id} AND url = ${path} AND read_at IS NULL
        RETURNING id
      `);
      cleared = rowsOf(r).length;
    } catch { /* ignore */ }
  }
  res.json({ ok: true, cleared });
});

router.get("/notifications", requireAuth, async (req: Request, res: Response) => {
  try {
    const list = rowsOf<Record<string, unknown>>(await db.execute(sql`
      SELECT id, title, body, url, kind, read_at, created_at FROM notifications
      WHERE user_id = ${req.user!.id} ORDER BY created_at DESC LIMIT 40
    `));
    const unread = rowsOf<{ n: number | string }>(await db.execute(sql`
      SELECT COUNT(*) AS n FROM notifications WHERE user_id = ${req.user!.id} AND read_at IS NULL
    `))[0]?.n ?? 0;
    res.json({
      notifications: list.map((n) => ({
        id: n.id, title: n.title, body: n.body, url: n.url, kind: n.kind,
        read: n.read_at != null, createdAt: n.created_at,
      })),
      unread: Number(unread),
      pushConfigured: isPushConfigured(),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load notifications", details: err.cause?.message ?? err.message });
  }
});

router.post("/notifications/read-all", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE notifications SET read_at = now() WHERE user_id = ${req.user!.id} AND read_at IS NULL`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed", details: err.cause?.message ?? err.message });
  }
});

// Clear one notification, or all of them.
router.delete("/notifications/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM notifications WHERE user_id = ${req.user!.id} AND id::text = ${String(req.params.id)}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed", details: err.cause?.message ?? err.message });
  }
});

router.delete("/notifications", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM notifications WHERE user_id = ${req.user!.id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed", details: err.cause?.message ?? err.message });
  }
});

// "Send me a test" -- shows exactly what works: in-app always, push only if
// the server has VAPID keys and this account has a subscribed device.
router.post("/notifications/test", requireAuth, async (req: Request, res: Response) => {
  try {
    await notifyUser(req.user!.id, { title: "Test notification", body: "Notifications are working on this device.", url: "/notifications", kind: "test" });
    let push: { configured: boolean; sent: number; devices: number } = { configured: isPushConfigured(), sent: 0, devices: 0 };
    if (push.configured) {
      const devices = rowsOf<{ n: number | string }>(await db.execute(sql`SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ${req.user!.id}`))[0]?.n ?? 0;
      push.devices = Number(devices);
      // notifyUser already sent the push; count is informational
      push.sent = push.devices;
    }
    res.json({ inApp: true, push });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to send test", details: err.cause?.message ?? err.message });
  }
});

export default router;
