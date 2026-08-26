import { db, gamesTable, puzzleAttemptsTable, puzzlesTable, backgroundJobsTable, coursesTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { storage } from "./storage";
import { ADMIN_EMAILS } from "./auth";

export const FREE_TIER_LIMITS = {
  puzzles: 10,
  opponentScouts: 1,
  courses: 5,
  initialGameImport: 20,
  scanPositionsPerDay: 2,
} as const;

/**
 * True if the user has full, unrestricted access — a paid or Stripe-trialing
 * subscription (meaning they've actually provided payment info) or an
 * admin-granted override. Deliberately does NOT give unlimited access just
 * for having a recent account — that would let anyone sign up and run
 * unlimited GPT-backed features for free with zero payment commitment.
 * New users are on the same usage-limited free tier as everyone else until
 * they actually subscribe.
 */
export async function hasFullAccess(userId: string): Promise<{ full: boolean; user: Awaited<ReturnType<typeof storage.getUser>> | null }> {
  const user = await storage.getUser(userId);
  if (!user) return { full: false, user: null };
  if (user.isAdmin || ADMIN_EMAILS.includes(user.email?.toLowerCase?.() ?? "")) return { full: true, user };
  if (user.isPremiumOverride) return { full: true, user };

  if (user.stripeCustomerId) {
    try {
      const subscription = await storage.getSubscriptionByCustomerId(user.stripeCustomerId);
      if (subscription && ["active", "trialing"].includes(subscription.status as string)) {
        return { full: true, user };
      }
    } catch { /* no subscription on file — falls through to free tier */ }
  }

  return { full: false, user };
}

/**
 * Checks a free-tier usage limit for a user who doesn't have full access.
 * Returns { allowed: true } if under the limit or if the user has full
 * access (in which case there's no limit to check).
 */
export async function checkUsageLimit(
  userId: string,
  feature: "puzzles" | "opponentScouts" | "courses",
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const { full, user } = await hasFullAccess(userId);
  if (full) return { allowed: true, used: 0, limit: Infinity };

  const limit = FREE_TIER_LIMITS[feature];
  let used = 0;

  if (feature === "puzzles") {
    const [row] = await db
      .select({ c: count() })
      .from(puzzleAttemptsTable)
      .innerJoin(puzzlesTable, eq(puzzleAttemptsTable.puzzleId, puzzlesTable.id))
      .where(and(eq(puzzleAttemptsTable.userId, userId), eq(puzzlesTable.source, "personal")));
    used = row?.c ?? 0;
  } else if (feature === "opponentScouts") {
    const [row] = await db
      .select({ c: count() })
      .from(backgroundJobsTable)
      .where(and(eq(backgroundJobsTable.userId, userId), eq(backgroundJobsTable.type, "scout")));
    used = row?.c ?? 0;
  } else if (feature === "courses") {
    const primaryUsername = (user?.chesscomUsername || user?.lichessUsername || "").toLowerCase();
    if (!primaryUsername) return { allowed: true, used: 0, limit };
    const [row] = await db
      .select({ c: count() })
      .from(coursesTable)
      .where(eq(coursesTable.username, primaryUsername));
    used = row?.c ?? 0;
  }

  return { allowed: used < limit, used, limit };
}

/**
 * True if importing more games would exceed the free-tier's initial
 * import allowance. Free-tier users can still review and view the games
 * they already have — this only blocks pulling in additional ones.
 */
export async function wouldExceedImportLimit(userId: string, username: string): Promise<boolean> {
  const { full } = await hasFullAccess(userId);
  if (full) return false;

  const [row] = await db
    .select({ c: count() })
    .from(gamesTable)
    .where(eq(gamesTable.username, username.toLowerCase()));

  return (row?.c ?? 0) >= FREE_TIER_LIMITS.initialGameImport;
}
