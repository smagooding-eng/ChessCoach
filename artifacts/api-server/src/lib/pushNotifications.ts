import webpush from "web-push";
import { db, pushSubscriptionsTable, usersTable, gamesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { logger } from "./logger";

// VAPID identifies this server to push services (Chrome/Firefox/etc) so
// they know who's sending and can rate-limit/block abuse at the sender
// level rather than the subscription level. Required env vars -- see the
// delivery notes for the actual generated keypair and the mailto: this
// needs. Throws at import time if missing rather than failing silently
// on the first real send, same reasoning as @workspace/db's own
// DATABASE_URL check.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@chessscout.net";

let vapidConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
} else {
  logger.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set -- push notifications are disabled until these are configured.");
}

export function isPushConfigured(): boolean {
  return vapidConfigured;
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  /** Notifications with the same tag replace each other on the device
   *  (e.g. one per daily game: only the latest "your move" stays). */
  tag?: string;
}

// Segment filters for the admin "send to a targeted group" tool. Every
// field is optional and combines with AND semantics (e.g. lastLoginBefore
// + hasImportedGameSince together means "inactive users who still have
// game history" -- a natural re-engagement segment). Built only from
// fields that genuinely exist in the schema (usersTable.lastLoginAt,
// usersTable.createdAt, gamesTable.playedAt) -- nothing invented.
export interface AudienceFilter {
  lastLoginBefore?: string;   // ISO date -- "hasn't logged in since X" (inactive/re-engagement)
  lastLoginAfter?: string;    // ISO date -- "logged in recently"
  signedUpBefore?: string;    // ISO date
  signedUpAfter?: string;     // ISO date
  hasImportedGameSince?: string;  // ISO date -- at least one game with playedAt >= this
  noImportedGameSince?: string;   // ISO date -- zero games with playedAt >= this (inverse of above)
}

// Resolves a filter down to the list of userIds that actually have at
// least one push subscription -- there's no point matching a user by
// segment if they have no device to receive anything on. Both this and
// getRecipientCount below share this logic so the admin preview count
// and the actual send always agree.
async function resolveRecipientUserIds(filter: AudienceFilter): Promise<string[]> {
  const conditions = [];
  if (filter.lastLoginBefore) conditions.push(lte(usersTable.lastLoginAt, new Date(filter.lastLoginBefore)));
  if (filter.lastLoginAfter) conditions.push(gte(usersTable.lastLoginAt, new Date(filter.lastLoginAfter)));
  if (filter.signedUpBefore) conditions.push(lte(usersTable.createdAt, new Date(filter.signedUpBefore)));
  if (filter.signedUpAfter) conditions.push(gte(usersTable.createdAt, new Date(filter.signedUpAfter)));

  // Users who imported at least one game since a given date -- used
  // both as a positive filter (hasImportedGameSince: must be in this
  // set) and a negative one (noImportedGameSince: must NOT be in this
  // set). Computed once per date value actually requested.
  async function userIdsWithGameSince(isoDate: string): Promise<Set<string>> {
    const rows = await db.selectDistinct({ userId: gamesTable.userId })
      .from(gamesTable)
      .where(gte(gamesTable.playedAt, new Date(isoDate)));
    return new Set(rows.map(r => r.userId).filter((id): id is string => !!id));
  }

  const mustHaveGameIds = filter.hasImportedGameSince ? await userIdsWithGameSince(filter.hasImportedGameSince) : null;
  const mustNotHaveGameIds = filter.noImportedGameSince ? await userIdsWithGameSince(filter.noImportedGameSince) : null;

  const userRows = await db.select({ id: usersTable.id }).from(usersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  let userIds = userRows.map(r => r.id);

  if (mustHaveGameIds) userIds = userIds.filter(id => mustHaveGameIds.has(id));
  if (mustNotHaveGameIds) userIds = userIds.filter(id => !mustNotHaveGameIds.has(id));

  if (userIds.length === 0) return [];

  // Narrow to users who actually have at least one subscription.
  const subRows = await db.selectDistinct({ userId: pushSubscriptionsTable.userId })
    .from(pushSubscriptionsTable)
    .where(inArray(pushSubscriptionsTable.userId, userIds));
  return subRows.map(r => r.userId);
}

export async function getRecipientCount(filter: AudienceFilter): Promise<number> {
  const ids = await resolveRecipientUserIds(filter);
  return ids.length;
}

// Sends to every subscribed device for every matching user. Dead
// subscriptions (410 Gone / 404 Not Found -- the push service telling us
// this endpoint will never work again, e.g. the user uninstalled the
// app or cleared site data) are deleted automatically rather than
// retried forever. Other failures are logged and skipped, not retried
// synchronously, since a slow/failing push service shouldn't block the
// rest of the batch.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number; pruned: number }> {
  if (!vapidConfigured) {
    throw new Error("Push notifications are not configured (missing VAPID keys)");
  }
  if (userIds.length === 0) return { sent: 0, failed: 0, pruned: 0 };

  const subs = await db.select().from(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.userId, userIds));

  let sent = 0, failed = 0, pruned = 0;
  const payloadJson = JSON.stringify(payload);

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payloadJson,
      );
      sent++;
      await db.update(pushSubscriptionsTable).set({ lastSuccessAt: new Date() }).where(eq(pushSubscriptionsTable.id, sub.id));
    } catch (err: any) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id));
        pruned++;
      } else {
        failed++;
        logger.warn({ err, subscriptionId: sub.id }, "[push] send failed");
      }
    }
  }));

  return { sent, failed, pruned };
}

export async function sendPushToAudience(filter: AudienceFilter, payload: PushPayload): Promise<{ sent: number; failed: number; pruned: number; recipientCount: number }> {
  const userIds = await resolveRecipientUserIds(filter);
  const result = await sendPushToUsers(userIds, payload);
  return { ...result, recipientCount: userIds.length };
}

// For feature-triggered pushes (e.g. "it's your move" for correspondence
// games) -- a single user, not a filtered audience.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number; pruned: number }> {
  return sendPushToUsers([userId], payload);
}
