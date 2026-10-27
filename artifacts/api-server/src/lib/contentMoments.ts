// Content Studio (admin): notable moments from every reviewed game on the
// site, tagged so they can be found by type — brilliant and great moves,
// blunders and missed wins, forks / pins / skewers / discovered attacks,
// sacrifices, checkmates, promotions, the classic traps, endgames — and by
// opening. A slow background scanner walks the reviewed games (newest first)
// and records one row per notable move; it never re-reads a game it has done.

import { db, chessTrapsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { contentTags } from "./basicCoach";

export const MOMENT_TAGS = [
  "brilliant", "great", "blunder", "missed_win", "checkmate", "sacrifice", "fork", "pin", "skewer", "discovered", "promotion", "trap", "endgame", "opening",
] as const;

const SCORE: Record<string, number> = {
  brilliant: 100, trap: 85, checkmate: 80, great: 70, sacrifice: 60, fork: 50, skewer: 45, discovered: 45, pin: 40, missed_win: 35, promotion: 30, blunder: 30,
};
const GOOD = new Set(["best", "excellent", "great", "brilliant"]);

type Row = Record<string, unknown>;
const rowsOf = <T = Row>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []));

export async function ensureContentTables(): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS content_moments (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL,
    move_index INTEGER NOT NULL,
    tags TEXT[] NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    classification VARCHAR,
    san VARCHAR NOT NULL,
    fen_before TEXT NOT NULL,
    eval_after INTEGER,
    trap_name VARCHAR,
    opening VARCHAR,
    white VARCHAR, black VARCHAR, white_rating INTEGER, black_rating INTEGER,
    platform VARCHAR, played_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (game_id, move_index)
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_content_moments_tags ON content_moments USING GIN (tags)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_content_moments_score ON content_moments (score DESC, id DESC)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS content_scanned (game_id INTEGER PRIMARY KEY, scanned_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

let trapCache: { at: number; list: { name: string; line: string[] }[] } | null = null;
async function traps() {
  if (trapCache && Date.now() - trapCache.at < 60 * 60 * 1000) return trapCache.list;
  const rows = await db.select({ name: chessTrapsTable.name, line: chessTrapsTable.trapLineSan, archived: chessTrapsTable.archived }).from(chessTrapsTable);
  trapCache = { at: Date.now(), list: rows.filter((r) => !r.archived && Array.isArray(r.line) && r.line.length >= 3).map((r) => ({ name: r.name, line: r.line as string[] })) };
  return trapCache.list;
}

interface ReviewMove { moveIndex?: number; san?: string; color?: "white" | "black"; classification?: string; fen?: string; evalAfterCp?: number }

/** Tags and stores the notable moves of one reviewed game. */
async function scanGame(g: Row, trapList: { name: string; line: string[] }[]): Promise<number> {
  const rd = g.review_data as { moves?: ReviewMove[] } | ReviewMove[] | null;
  const moves: ReviewMove[] = Array.isArray(rd) ? rd : rd?.moves ?? [];
  if (!moves.length) return 0;
  const sans = moves.map((m) => m.san ?? "");
  // A classic trap: the game follows the whole trap line from move one.
  const trapHit = trapList.find((t) => t.line.length <= sans.length && t.line.every((s, i) => s.replace(/[+#]/g, "") === sans[i].replace(/[+#]/g, "")));
  let saved = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m.san || !m.fen || !m.color) continue;
    const tags = new Set<string>();
    const cls = m.classification ?? "";
    if (["brilliant", "great", "blunder", "missed_win"].includes(cls)) tags.add(cls);
    let board: string[] = [];
    // Board tactics only where they can matter (captures, checks and good moves), to keep the scan light.
    if (GOOD.has(cls) || m.san.includes("x") || m.san.includes("+") || m.san.includes("#") || m.san.includes("=")) {
      try { board = contentTags(m.fen, m.san, m.color, i > 0 ? sans[i - 1] : null); } catch { board = []; }
    }
    for (const t of board) {
      if (t === "checkmate" || t === "promotion") tags.add(t);
      else if (["fork", "pin", "skewer", "discovered", "sacrifice"].includes(t) && GOOD.has(cls)) tags.add(t);
    }
    if (trapHit && i === trapHit.line.length - 1) tags.add("trap");
    const notable = [...tags].some((t) => SCORE[t]);
    if (!notable) continue;
    if (board.includes("endgame")) tags.add("endgame");
    if (i < 16) tags.add("opening");
    const score = Math.max(...[...tags].map((t) => SCORE[t] ?? 0));
    await db.execute(sql`INSERT INTO content_moments (game_id, move_index, tags, score, classification, san, fen_before, eval_after, trap_name, opening, white, black, white_rating, black_rating, platform, played_at)
      VALUES (${g.id as number}, ${i}, ${`{${[...tags].join(",")}}`}::text[], ${score}, ${cls || null}, ${m.san}, ${m.fen}, ${typeof m.evalAfterCp === "number" ? Math.round(m.evalAfterCp) : null},
        ${tags.has("trap") ? trapHit!.name : null}, ${(g.opening as string) ?? null}, ${(g.white_username as string) ?? null}, ${(g.black_username as string) ?? null},
        ${(g.white_rating as number) ?? null}, ${(g.black_rating as number) ?? null}, ${(g.platform as string) ?? null}, ${(g.played_at as Date) ?? null})
      ON CONFLICT (game_id, move_index) DO NOTHING`);
    saved++;
  }
  return saved;
}

let scanning = false;
/** Scans up to `limit` reviewed games not seen yet (newest first). */
export async function scanContentBatch(limit = 25): Promise<{ games: number; moments: number }> {
  if (scanning) return { games: 0, moments: 0 };
  scanning = true;
  try {
    const r = await db.execute(sql`SELECT g.id, g.review_data, g.opening, g.white_username, g.black_username, g.white_rating, g.black_rating, g.platform, g.played_at
      FROM games g LEFT JOIN content_scanned s ON s.game_id = g.id
      WHERE g.review_data IS NOT NULL AND s.game_id IS NULL AND g.platform IS DISTINCT FROM 'bot'
      ORDER BY g.id DESC LIMIT ${limit}`);
    const games = rowsOf(r);
    const trapList = await traps();
    let moments = 0;
    for (const g of games) {
      try { moments += await scanGame(g, trapList); } catch (err) { logger.warn({ err, gameId: g.id }, "[studio] scan failed for game"); }
      await db.execute(sql`INSERT INTO content_scanned (game_id) VALUES (${g.id as number}) ON CONFLICT DO NOTHING`);
      await new Promise((res) => setImmediate(res));
    }
    return { games: games.length, moments };
  } finally {
    scanning = false;
  }
}

export async function contentScanProgress(): Promise<{ scanned: number; reviewed: number; moments: number }> {
  const [r] = rowsOf<Record<string, string>>(await db.execute(sql`SELECT
    (SELECT COUNT(*) FROM content_scanned) AS scanned,
    (SELECT COUNT(*) FROM games WHERE review_data IS NOT NULL AND platform IS DISTINCT FROM 'bot') AS reviewed,
    (SELECT COUNT(*) FROM content_moments) AS moments`));
  return { scanned: Number(r?.scanned ?? 0), reviewed: Number(r?.reviewed ?? 0), moments: Number(r?.moments ?? 0) };
}

/** Background: a small batch every 20 seconds while there's work, then every 10 minutes. */
export function startContentScanner(): void {
  let next = 60_000;
  const tick = async () => {
    try {
      await ensureContentTables();
      const done = await scanContentBatch(25);
      next = done.games > 0 ? 20_000 : 10 * 60_000;
    } catch (err) {
      logger.warn({ err }, "[studio] content scan tick failed");
      next = 10 * 60_000;
    }
    setTimeout(tick, next).unref?.();
  };
  setTimeout(tick, next).unref?.();
}

export interface MomentQuery { tags?: string[]; opening?: string; minRating?: number; platform?: string; limit?: number; offset?: number; sort?: "best" | "new" | "random" }

export async function listMoments(q: MomentQuery) {
  const conds = [sql`TRUE`];
  const tags = (q.tags ?? []).filter((t) => (MOMENT_TAGS as readonly string[]).includes(t));
  if (tags.length) conds.push(sql`tags @> ${`{${tags.join(",")}}`}::text[]`);
  if (q.opening) conds.push(sql`opening ILIKE ${"%" + q.opening + "%"}`);
  if (q.minRating) conds.push(sql`GREATEST(COALESCE(white_rating,0), COALESCE(black_rating,0)) >= ${q.minRating}`);
  if (q.platform) conds.push(sql`platform = ${q.platform}`);
  const where = sql.join(conds, sql` AND `);
  const order = q.sort === "new" ? sql`played_at DESC NULLS LAST, id DESC` : q.sort === "random" ? sql`random()` : sql`score DESC, played_at DESC NULLS LAST`;
  const limit = Math.min(120, Math.max(1, q.limit ?? 48));
  const rows = rowsOf(await db.execute(sql`SELECT id, game_id AS "gameId", move_index AS "moveIndex", tags, score, classification, san, fen_before AS "fenBefore", eval_after AS "evalAfter",
      trap_name AS "trapName", opening, white, black, white_rating AS "whiteRating", black_rating AS "blackRating", platform, played_at AS "playedAt"
    FROM content_moments WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${Math.max(0, q.offset ?? 0)}`));
  return rows;
}

export async function tagCounts(): Promise<Record<string, number>> {
  const rows = rowsOf<{ tag: string; n: string }>(await db.execute(sql`SELECT unnest(tags) AS tag, COUNT(*) AS n FROM content_moments GROUP BY 1`));
  return Object.fromEntries(rows.map((r) => [r.tag, Number(r.n)]));
}

/** Any game's moves and review, for the Studio player (admins only). */
export async function studioGame(id: number) {
  const r = await db.execute(sql`SELECT id, pgn, review_data, opening, white_username, black_username, white_rating, black_rating, result, platform, played_at FROM games WHERE id = ${id}`);
  const g = rowsOf(r)[0];
  if (!g) return null;
  const rd = g.review_data as { moves?: unknown[] } | unknown[] | null;
  return {
    id: g.id, pgn: g.pgn, opening: g.opening, white: g.white_username, black: g.black_username,
    whiteRating: g.white_rating, blackRating: g.black_rating, result: g.result, platform: g.platform, playedAt: g.played_at,
    moves: Array.isArray(rd) ? rd : rd?.moves ?? [],
  };
}
