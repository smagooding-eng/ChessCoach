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

// What each open app is looking at, so we never alert someone about the game
// they already have open (on any of their devices). Keyed by a per-tab id the
// app sends with its event stream; it reports its page + visibility on every
// navigation / visibility change and every 30s. Entries go stale after 75s
// and are dropped when the stream closes -- so if anything is unknown we err
// on the side of notifying.
interface View { path: string; visible: boolean; at: number }
const views = new Map<string, Map<string, View>>(); // userId -> tabId -> view
const VIEW_TTL_MS = 75_000;

export function setView(userId: string, tabId: string, path: string, visible: boolean): void {
  let m = views.get(userId);
  if (!m) { m = new Map(); views.set(userId, m); }
  // /correspondence/:id is an older alias of /daily/:id
  m.set(tabId, { path: path.replace(/^\/correspondence\//, "/daily/"), visible, at: Date.now() });
}

export function clearView(userId: string, tabId: string): void {
  const m = views.get(userId);
  if (!m) return;
  m.delete(tabId);
  if (m.size === 0) views.delete(userId);
}

export function isViewing(userId: string, path: string): boolean {
  const m = views.get(userId);
  if (!m) return false;
  const now = Date.now();
  for (const v of m.values()) {
    if (v.visible && v.path === path && now - v.at < VIEW_TTL_MS) return true;
  }
  return false;
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
  // Already looking at that game? The board updates by itself -- keep a
  // (read) record in the inbox but don't buzz any device or pop a banner.
  const watching = !!n.url && isViewing(userId, n.url);
  let id: string | null = null;
  try {
    // One entry per game in the inbox: a newer alert about the same game
    // replaces the older ones ("Your move" after "Your move"...).
    if (n.url && /^\/(daily|correspondence)\//.test(n.url)) {
      await db.execute(sql`DELETE FROM notifications WHERE user_id = ${userId} AND url = ${n.url}`);
    }
    const rows = await db.execute(sql`
      INSERT INTO notifications (user_id, title, body, url, kind, read_at)
      VALUES (${userId}, ${n.title}, ${n.body}, ${n.url ?? null}, ${n.kind ?? "general"}, ${watching ? sql`now()` : sql`NULL`})
      RETURNING id, created_at
    `);
    const list: unknown[] = Array.isArray(rows) ? rows : ((rows as unknown as { rows?: unknown[] }).rows ?? []);
    const r = list[0] as { id: string } | undefined;
    id = r?.id ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "[notify] save failed");
  }
  if (watching) return;
  emitToUser(userId, "notification", { id, title: n.title, body: n.body, url: n.url ?? null, kind: n.kind ?? "general", createdAt: new Date().toISOString() });
  if (isPushConfigured()) {
    // Tagged by page (e.g. one tag per daily game) so a newer alert about the
    // same game replaces the older one on the device instead of stacking.
    sendPushToUser(userId, { title: n.title, body: n.body, url: n.url, tag: n.tag ?? (n.url ? `cs:${n.url}` : undefined) })
      .catch((err) => logger.warn({ err, userId }, "[notify] push failed"));
  }
}
