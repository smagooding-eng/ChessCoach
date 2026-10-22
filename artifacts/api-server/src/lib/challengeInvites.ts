// Declining a challenge someone was sent directly (e.g. from Admin > Online
// now), from the app or straight from the phone notification's Decline
// button. The notification button works without the app being open, so it
// uses a signed link instead of the login session.
import { db, gameChallengesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { unsubToken, verifyUnsubToken } from "./emailPrefs";
import { notifyUser } from "./notify";
import { logger } from "./logger";

const API_BASE = (process.env.RENDER_EXTERNAL_URL || process.env.API_PUBLIC_URL || "https://chesscoach-api-kbf8.onrender.com").replace(/\/$/, "");
const key = (userId: string, code: string) => `decline:${userId}:${code}`;

export function declineUrl(userId: string, code: string): string {
  return `${API_BASE}/api/challenges/${encodeURIComponent(code)}/decline-signed?u=${encodeURIComponent(userId)}&t=${unsubToken(key(userId, code))}`;
}
export function verifyDecline(userId: string, code: string, token: string): boolean {
  return verifyUnsubToken(key(userId, code), token);
}

const rowsOf = <T>(r: unknown): T[] => ((r as unknown as { rows?: T[] }).rows ?? []);

/**
 * Removes the challenge from this person's dashboard. If it was sent to them
 * directly, it's also closed and the sender is told. Returns false if there
 * was nothing to decline.
 */
export async function declineInvite(userId: string, code: string, declinerName?: string | null): Promise<boolean> {
  const inv = rowsOf<{ invited_by: string | null; dismissed_at: string | null }>(await db.execute(sql`
    SELECT invited_by, dismissed_at FROM challenge_invites WHERE user_id = ${userId} AND code = ${code}`))[0];
  if (!inv) return false;
  await db.execute(sql`UPDATE challenge_invites SET dismissed_at = now() WHERE user_id = ${userId} AND code = ${code}`);
  if (!inv.invited_by) return true;
  const [ch] = await db.select().from(gameChallengesTable).where(eq(gameChallengesTable.code, code));
  if (!ch || ch.open || ch.parentCode || ch.status !== "open") return true;
  await db.update(gameChallengesTable).set({ status: "declined" }).where(eq(gameChallengesTable.code, code));
  let name = declinerName ?? null;
  if (!name) {
    const u = rowsOf<{ scout_username: string | null; chesscom_username: string | null; lichess_username: string | null; first_name: string | null }>(
      await db.execute(sql`SELECT scout_username, chesscom_username, lichess_username, first_name FROM users WHERE id = ${userId}`))[0];
    name = u?.scout_username || u?.chesscom_username || u?.lichess_username || u?.first_name || "They";
  }
  await notifyUser(ch.creatorUserId, { title: `${name} declined your challenge`, body: "Maybe another time.", url: `/challenge/${code}`, kind: "challenge_declined" })
    .catch((err) => logger.warn({ err }, "[challenge] decline notify failed"));
  return true;
}
