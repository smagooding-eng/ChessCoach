// In-app notifications + real-time events.
//
// notifyUser() is the one call features use to tell someone something:
//   1. saves it in the notifications table (the bell / inbox),
//   2. pushes it instantly to any open app tab over Server-Sent Events,
//   3. sends a web push to their devices (if VAPID keys are configured and
//      they've allowed notifications) for when the app isn't open.
// emitToUser() sends a silent real-time event (e.g. "daily game updated") to
// open tabs only, so boards refresh the moment the opponent moves.

import type { Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendPushToUser, isPushConfigured } from "./pushNotifications";
import { logger } from "./logger";

const streams = new Map<string, Set<Response>>(); // userId -> open SSE responses

export function addStream(userId: string, res: Response): () => void {
  let set = streams.get(userId);
  if (!set) { set = new Set(); streams.set(userId, set); }
  set.add(res);
  return () => {
    const s = streams.get(userId);
    if (!s) return;
    s.delete(res);
    if (s.size === 0) streams.delete(userId);
  };
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  const set = streams.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch { /* closed; cleaned up on 'close' */ }
  }
}

export interface NotifyInput { title: string; body: string; url?: string; kind?: string; tag?: string }

export async function notifyUser(userId: string, n: NotifyInput): Promise<void> {
  let id: string | null = null;
  try {
    const rows = await db.execute(sql`
      INSERT INTO notifications (user_id, title, body, url, kind)
      VALUES (${userId}, ${n.title}, ${n.body}, ${n.url ?? null}, ${n.kind ?? "general"})
      RETURNING id, created_at
    `);
    const list: unknown[] = Array.isArray(rows) ? rows : ((rows as unknown as { rows?: unknown[] }).rows ?? []);
    const r = list[0] as { id: string } | undefined;
    id = r?.id ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "[notify] save failed");
  }
  emitToUser(userId, "notification", { id, title: n.title, body: n.body, url: n.url ?? null, kind: n.kind ?? "general", createdAt: new Date().toISOString() });
  if (isPushConfigured()) {
    // Tagged by page (e.g. one tag per daily game) so a newer alert about the
    // same game replaces the older one on the device instead of stacking.
    sendPushToUser(userId, { title: n.title, body: n.body, url: n.url, tag: n.tag ?? (n.url ? `cs:${n.url}` : undefined) })
      .catch((err) => logger.warn({ err, userId }, "[notify] push failed"));
  }
}
