// "Someone is looking for a game": when a player starts searching for a live
// or daily game, everyone with notifications on (or the app open) hears about
// it. The first to tap in gets the game; anyone later is offered to send that
// player a challenge instead (handled by the Live / Daily screens).

import { db, pushSubscriptionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { notifyUser, listOpenApps } from "./notify";
import { logger } from "./logger";

export interface Seek {
  kind: "live" | "daily";
  seekerId: string;
  seekerName: string;
  timeControl: string;
  label: string;
  mode: "casual" | "ranked";
  rating?: number;
}

// Leaving and re-entering the queue shouldn't buzz everyone again.
const lastAnnounced = new Map<string, number>();
const REPEAT_MS = { live: 3 * 60_000, daily: 30 * 60_000 } as const;

export function seekUrl(s: Pick<Seek, "kind" | "seekerId" | "seekerName" | "timeControl" | "mode">): string {
  const q = new URLSearchParams({ seek: s.seekerId, n: s.seekerName, tc: s.timeControl, mode: s.mode });
  return `/${s.kind === "live" ? "live" : "daily"}?${q.toString()}`;
}

/** Everyone with notifications on or the app open (minus `exclude`). */
export async function everyoneReachable(exclude?: string): Promise<string[]> {
  const subs = await db.selectDistinct({ userId: pushSubscriptionsTable.userId }).from(pushSubscriptionsTable);
  const ids = new Set<string>(subs.map((r) => r.userId));
  for (const a of listOpenApps()) ids.add(a.userId);
  if (exclude) ids.delete(exclude);
  return [...ids];
}

export function announceSeek(s: Seek, skip?: (userId: string) => boolean): void {
  const key = `${s.kind}:${s.seekerId}`;
  const prev = lastAnnounced.get(key) ?? 0;
  if (Date.now() - prev < REPEAT_MS[s.kind]) return;
  lastAnnounced.set(key, Date.now());
  void (async () => {
    try {
      const subs = await db.selectDistinct({ userId: pushSubscriptionsTable.userId }).from(pushSubscriptionsTable);
      const ids = new Set<string>(subs.map((r) => r.userId));
      for (const a of listOpenApps()) ids.add(a.userId);
      ids.delete(s.seekerId);
      const who = s.rating ? `${s.seekerName} (${Math.round(s.rating)})` : s.seekerName;
      const title = `${who} is looking for a game`;
      const body = s.kind === "live"
        ? `${s.label} ${s.mode === "ranked" ? "ranked" : "casual"} live game. First to accept plays!`
        : `Daily game, ${s.label} per move${s.mode === "ranked" ? ", ranked" : ""}. First to accept plays!`;
      const url = seekUrl(s);
      let sent = 0;
      for (const uid of ids) {
        if (skip?.(uid)) continue;
        // Only the newest "looking for a game" stays in the inbox.
        await db.execute(sql`DELETE FROM notifications WHERE user_id = ${uid} AND kind = 'seek'`).catch(() => {});
        notifyUser(uid, { kind: "seek", title, body, url, tag: "cs:seek" })
          .catch((err) => logger.warn({ err, uid }, "[seek] notify failed"));
        sent++;
      }
      logger.info({ kind: s.kind, seeker: s.seekerId, sent }, "[seek] announced");
    } catch (err) {
      logger.warn({ err }, "[seek] announce failed");
    }
  })();
}
