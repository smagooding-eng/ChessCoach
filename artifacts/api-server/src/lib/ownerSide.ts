import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Who the member is: their own ChessScout, Chess.com and Lichess names, from the account.
export async function ownerNames(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  try {
    const [u] = await db.select({ a: usersTable.scoutUsername, b: usersTable.chesscomUsername, c: usersTable.lichessUsername }).from(usersTable).where(eq(usersTable.id, userId));
    return u ? [u.a, u.b, u.c].filter((n): n is string => !!n).map((n) => n.toLowerCase()) : [];
  } catch { return []; }
}

// Which side the member played: their own names first, then the account the game was saved under.
export function sideFromNames(game: { username?: string | null; whiteUsername: string; blackUsername: string }, names: string[]): "white" | "black" | undefined {
  const all = game.username ? [...names, game.username.toLowerCase()] : names;
  const w = game.whiteUsername.toLowerCase(), b = game.blackUsername.toLowerCase();
  for (const n of all) { if (n === w) return "white"; if (n === b) return "black"; }
  return undefined;
}
