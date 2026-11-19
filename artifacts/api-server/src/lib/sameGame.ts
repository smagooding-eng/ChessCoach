// The same game saved twice, whatever ids it came with: a member's two games with the same
// two players and exactly the same moves, played within a few days of each other, are one
// game. (Copies arrive by different routes: saved from ChessScout's board when it ends,
// then fetched again by the background imports; one route can lack the Lichess / Chess.com
// id the others match on.)
import { db, gamesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

/** The moves of a PGN, without move numbers, clocks, comments or the result. Starting
 *  position included, so a game from a set-up position only matches the same set-up. */
export function movesKey(pgn: string): string {
  const fen = /\[FEN\s+"([^"]*)"\]/.exec(pgn)?.[1] ?? "";
  const body = pgn
    .replace(/^\s*\[[^\]]*\]\s*$/gm, " ")       // headers
    .replace(/\{[^}]*\}/g, " ")                    // comments, clocks
    .replace(/;[^\n]*/g, " ")
    .replace(/\$\d+/g, " ")                        // NAGs
    .replace(/\d+\.(\.\.)?/g, " ")                 // move numbers
    .replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/g, " ")   // result
    .replace(/[!?]+/g, "")
    .trim().split(/\s+/).filter(Boolean);
  return (fen ? `${fen}|` : "") + body.join(" ");
}

const MIN_PLIES = 6; // shorter games are too easily alike to tell apart this way
const WINDOW_MS = 3 * 864e5;

export type SameGameRow = { id: number; lichessGameId: string | null; chesscomGameId: string | null };

/** This member's saved copy of this game, if any. */
export async function findSameGame(userId: string, g: { pgn: string; white: string; black: string; playedAt: Date }): Promise<SameGameRow | null> {
  const key = movesKey(g.pgn);
  if (key.split(" ").length < MIN_PLIES) return null;
  const at = g.playedAt.getTime();
  const rows = await db.select({ id: gamesTable.id, pgn: gamesTable.pgn, lichessGameId: gamesTable.lichessGameId, chesscomGameId: gamesTable.chesscomGameId })
    .from(gamesTable)
    .where(and(
      eq(gamesTable.userId, userId),
      sql`lower(${gamesTable.whiteUsername}) = ${g.white.toLowerCase()}`,
      sql`lower(${gamesTable.blackUsername}) = ${g.black.toLowerCase()}`,
      sql`${gamesTable.playedAt} BETWEEN ${new Date(at - WINDOW_MS).toISOString()} AND ${new Date(at + WINDOW_MS).toISOString()}`,
    ))
    .limit(50);
  const hit = rows.find((r) => movesKey(r.pgn) === key);
  return hit ? { id: hit.id, lichessGameId: hit.lichessGameId, chesscomGameId: hit.chesscomGameId } : null;
}

/** Give a saved copy the id it was missing, so later imports find it straight away. */
export async function adoptIds(row: SameGameRow, ids: { lichessGameId?: string | null; chesscomGameId?: string | null }): Promise<void> {
  const set: Record<string, string> = {};
  if (ids.lichessGameId && !row.lichessGameId) set.lichessGameId = ids.lichessGameId;
  if (ids.chesscomGameId && !row.chesscomGameId) set.chesscomGameId = ids.chesscomGameId;
  if (Object.keys(set).length) await db.update(gamesTable).set(set).where(eq(gamesTable.id, row.id)).catch(() => {});
}

/** Removes copies already saved (last 120 days), keeping the best copy of each game: the
 *  reviewed one, then the one saved from ChessScout's board, then the oldest. The kept copy
 *  takes over the others' ids and the "played on ChessScout" mark. */
export async function removeSameGameCopies(log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): Promise<void> {
  let removed = 0;
  try {
    // One member at a time (all at once read every repeated pairing's PGN into memory and
    // held the server up), with a breath between members.
    const users = (await db.execute(sql`
      SELECT DISTINCT user_id FROM (
        SELECT user_id FROM games WHERE played_at > now() - interval '120 days'
        GROUP BY user_id, lower(white_username), lower(black_username) HAVING count(*) > 1) x`)) as unknown as { rows?: Array<{ user_id: string }> } | Array<{ user_id: string }>;
    for (const u of (Array.isArray(users) ? users : users.rows ?? [])) {
      removed += await removeCopiesFor(u.user_id);
      await new Promise((r) => setTimeout(r, 50));
    }
    if (removed) log.info({ removed }, "[games] removed copies of the same game");
  } catch (err) {
    log.warn({ err }, "[games] same-game clean-up failed");
  }
}

async function removeCopiesFor(userId: string): Promise<number> {
  let removed = 0;
  {
    const rows = (await db.execute(sql`
      SELECT id, user_id, lower(white_username) AS w, lower(black_username) AS b, pgn, played_at,
        review_data IS NOT NULL AS reviewed, COALESCE(via_chessscout, false) AS via, lichess_game_id, chesscom_game_id
      FROM games
      WHERE user_id = ${userId} AND played_at > now() - interval '120 days'
        AND (lower(white_username), lower(black_username)) IN (
          SELECT lower(white_username), lower(black_username) FROM games
          WHERE user_id = ${userId} AND played_at > now() - interval '120 days'
          GROUP BY 1, 2 HAVING count(*) > 1)
      ORDER BY user_id, played_at`)) as unknown as { rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    const list = (Array.isArray(rows) ? rows : rows.rows ?? []) as Array<{
      id: number; user_id: string; w: string; b: string; pgn: string; played_at: string;
      reviewed: boolean; via: boolean; lichess_game_id: string | null; chesscom_game_id: string | null;
    }>;
    const groups = new Map<string, typeof list>();
    for (const r of list) {
      const k = movesKey(r.pgn);
      if (k.split(" ").length < MIN_PLIES) continue;
      const g = `${r.user_id}|${r.w}|${r.b}|${k}`;
      const arr = groups.get(g) ?? [];
      arr.push(r);
      groups.set(g, arr);
    }
    for (const copies of groups.values()) {
      if (copies.length < 2) continue;
      // within the time window of each other (one game, not a repeated short line)
      const t = copies.map((c) => new Date(c.played_at).getTime());
      if (Math.max(...t) - Math.min(...t) > WINDOW_MS) continue;
      copies.sort((a, b) => Number(b.reviewed) - Number(a.reviewed) || Number(b.via) - Number(a.via) || a.id - b.id);
      const [keep, ...drop] = copies;
      const li = keep.lichess_game_id ?? drop.find((d) => d.lichess_game_id)?.lichess_game_id ?? null;
      const cc = keep.chesscom_game_id ?? drop.find((d) => d.chesscom_game_id)?.chesscom_game_id ?? null;
      const via = copies.some((c) => c.via);
      await db.execute(sql`DELETE FROM games WHERE id IN (${sql.join(drop.map((d) => sql`${d.id}`), sql`, `)})`);
      await db.execute(sql`UPDATE games SET lichess_game_id = ${li}, chesscom_game_id = ${cc}, via_chessscout = ${via} WHERE id = ${keep.id}`).catch(() => {});
      removed += drop.length;
    }
  }
  return removed;
}
