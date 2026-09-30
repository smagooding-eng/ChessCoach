import { Router, type IRouter, type Request, type Response } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getVapidPublicKey, isPushConfigured, getRecipientCount, sendPushToAudience, type AudienceFilter, type PushPayload } from "../lib/pushNotifications";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// Public (but harmless) -- the public key is, by design, not a secret;
// the browser needs it client-side to create a subscription.
router.get("/push/vapid-public-key", (_req: Request, res: Response) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Push notifications are not configured on this server yet" });
    return;
  }
  res.json({ publicKey: key });
});

router.post("/push/subscribe", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Must be signed in to subscribe to notifications" });
    return;
  }
  try {
    const { subscription, userAgent } = req.body as {
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      userAgent?: string;
    };
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ error: "Invalid subscription object" });
      return;
    }

    // Same endpoint might already exist (re-subscribe, or another user
    // on a shared device) -- upsert on the unique endpoint rather than
    // erroring, and let the new userId win since that reflects who's
    // actually signed in on this device now.
    const existing = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
    if (existing.length > 0) {
      await db.update(pushSubscriptionsTable)
        .set({ userId: req.user!.id, p256dh, auth, userAgent: userAgent?.slice(0, 300) ?? null })
        .where(eq(pushSubscriptionsTable.endpoint, endpoint));
    } else {
      await db.insert(pushSubscriptionsTable).values({
        userId: req.user!.id,
        endpoint,
        p256dh,
        auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
      });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to save subscription", details: err.cause?.message ?? err.message });
  }
});

router.post("/push/unsubscribe", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Must be signed in" });
    return;
  }
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      res.status(400).json({ error: "endpoint is required" });
      return;
    }
    // Scoped to the signed-in user's own id too, not just the endpoint --
    // a user should only be able to remove their own subscription record,
    // even though endpoint alone is already unique.
    await db.delete(pushSubscriptionsTable).where(
      and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.userId, req.user!.id)),
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to remove subscription", details: err.cause?.message ?? err.message });
  }
});

function parseAudienceFilter(body: any): AudienceFilter {
  const filter: AudienceFilter = {};
  const dateFields: (keyof AudienceFilter)[] = [
    "lastLoginBefore", "lastLoginAfter", "signedUpBefore", "signedUpAfter",
    "hasImportedGameSince", "noImportedGameSince",
  ];
  for (const field of dateFields) {
    if (typeof body?.[field] === "string" && body[field].trim()) {
      filter[field] = body[field];
    }
  }
  return filter;
}

router.post("/admin/push/preview-count", requireAdmin, async (req: Request, res: Response) => {
  try {
    const filter = parseAudienceFilter(req.body);
    const count = await getRecipientCount(filter);
    res.json({ recipientCount: count });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to count recipients", details: err.cause?.message ?? err.message });
  }
});

router.post("/admin/push/send", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!isPushConfigured()) {
      res.status(503).json({ error: "Push notifications are not configured on this server (missing VAPID keys)." });
      return;
    }
    const { title, body, url, icon } = req.body as { title?: string; body?: string; url?: string; icon?: string };
    if (!title?.trim() || !body?.trim()) {
      res.status(400).json({ error: "title and body are required" });
      return;
    }
    const filter = parseAudienceFilter(req.body);
    const payload: PushPayload = { title: title.trim(), body: body.trim() };
    if (url?.trim()) payload.url = url.trim();
    if (icon?.trim()) payload.icon = icon.trim();

    const result = await sendPushToAudience(filter, payload);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to send push notification", details: err.cause?.message ?? err.message });
  }
});

export default router;
