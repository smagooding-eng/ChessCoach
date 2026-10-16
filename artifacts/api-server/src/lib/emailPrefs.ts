// Email preferences: signed one-click unsubscribe links for the optional
// emails (win-back, reminders, upgrade nudges, admin broadcasts). Account
// emails (verify, welcome) are always sent.
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { sql, inArray } from "drizzle-orm";

const API_BASE = (process.env.RENDER_EXTERNAL_URL || process.env.API_PUBLIC_URL || "https://chesscoach-api-kbf8.onrender.com").replace(/\/$/, "");

function secret(): string {
  return process.env.EMAIL_UNSUB_SECRET || process.env.RESEND_API_KEY || process.env.DATABASE_URL || "chessscout-unsub";
}

export function unsubToken(userId: string): string {
  return crypto.createHmac("sha256", secret()).update(`unsub:${userId}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubToken(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  const a = Buffer.from(unsubToken(userId));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function unsubscribeUrl(userId: string): string {
  return `${API_BASE}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubToken(userId)}`;
}

/** List-Unsubscribe headers so Gmail/Apple Mail show their own one-click unsubscribe. */
export function unsubscribeHeaders(userId: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(userId)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export async function setEmailOptOut(userId: string, optOut: boolean): Promise<boolean> {
  const r: any = await db.execute(sql`UPDATE users SET email_opt_out = ${optOut} WHERE id = ${userId} RETURNING id`);
  const rows = Array.isArray(r) ? r : r?.rows ?? [];
  return rows.length > 0;
}

/** Map of lower-cased email -> user id, for the given emails, skipping anyone who opted out. */
export async function optedInUsersByEmail(emails: string[]): Promise<{ allowed: Map<string, string>; optedOut: Set<string> }> {
  const allowed = new Map<string, string>();
  const optedOut = new Set<string>();
  if (!emails.length) return { allowed, optedOut };
  const lower = emails.map(e => e.toLowerCase());
  const rows = await db.select({ id: usersTable.id, email: usersTable.email, optOut: usersTable.emailOptOut })
    .from(usersTable).where(inArray(sql<string>`LOWER(${usersTable.email})`, lower));
  for (const row of rows) {
    const email = (row.email || '').toLowerCase();
    if (row.optOut) optedOut.add(email);
    else allowed.set(email, row.id);
  }
  return { allowed, optedOut };
}
