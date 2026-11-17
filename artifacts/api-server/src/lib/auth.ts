import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, sessionsTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";

export const SESSION_COOKIE = "sid";
// 90 days, renewed whenever the member uses the app (see touchSession), so members who
// come back now and then stay signed in. It used to be a fixed 7 days from sign-in.
export const SESSION_TTL = 90 * 24 * 60 * 60 * 1000;

export const ADMIN_EMAILS = ["smagooding@gmail.com", "goodingsls@live.com"];

export interface SessionUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  chesscomUsername: string | null;
  lichessUsername: string | null;
  scoutUsername?: string | null;
  emailOptOut?: boolean;
  isAdmin: boolean;
  inviteCode: string | null;
  emailVerified?: boolean;
}

export interface SessionData {
  user: SessionUser;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  return row.sess as unknown as SessionData;
}

/** Push a session's expiry out again (at most once a day per session). Returns true when it
 *  renewed, so the caller can refresh the cookie too. */
export async function touchSession(sid: string): Promise<boolean> {
  const r = await db.update(sessionsTable)
    .set({ expire: new Date(Date.now() + SESSION_TTL) })
    .where(and(eq(sessionsTable.sid, sid), lt(sessionsTable.expire, new Date(Date.now() + SESSION_TTL - 24 * 60 * 60 * 1000))))
    .returning({ sid: sessionsTable.sid });
  return r.length > 0;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(
  res: Response,
  sid?: string,
): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, {
    path: "/",
    secure: isCrossOrigin ? true : isSecure,
    sameSite: isCrossOrigin ? "none" : "lax",
  });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies?.[SESSION_COOKIE];
}

const isSecure = process.env.NODE_ENV !== "development";

const isCrossOrigin = !!process.env.CORS_ORIGIN;

export function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: isCrossOrigin ? true : isSecure,
    sameSite: isCrossOrigin ? "none" : "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}
