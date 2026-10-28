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
import { isBookPosition } from "./openingBook";
import { OPENING_POSITIONS } from "./openingPositions";
import { Chess } from "chess.js";

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
  // Engine reviews made just for the Studio (games nobody had reviewed yet). Kept apart from
  // games.review_data so a player's own game page is never changed by them.
  await db.execute(sql`CREATE TABLE IF NOT EXISTS content_reviews (game_id INTEGER PRIMARY KEY, review JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS content_fixes (id VARCHAR PRIMARY KEY, done_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  // Engine-only reviews (bulk job, older reviews) didn't carry each move's position, so the scan
  // skipped every move of those games. Scan the games that gave no moments again, once.
  const fixed = rowsOf(await db.execute(sql`INSERT INTO content_fixes (id) VALUES ('rescan_no_fen_v1') ON CONFLICT DO NOTHING RETURNING id`));
  if (fixed.length) {
    await db.execute(sql`DELETE FROM content_scanned s WHERE NOT EXISTS (SELECT 1 FROM content_moments m WHERE m.game_id = s.game_id)`);
  }
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
  const moves: ReviewMove[] = (Array.isArray(rd) ? rd : rd?.moves ?? []).map((m) => ({ ...m }));
  if (!moves.length) return 0;
  // Reviews without each move's position (engine-only ones): rebuild them from the moves.
  if (moves.some((m) => !m.fen || !m.color)) {
    try {
      const startFen = typeof g.pgn === "string" ? (g.pgn.match(/\[FEN "([^"]+)"\]/)?.[1] ?? undefined) : undefined;
      const c = startFen ? new Chess(startFen) : new Chess();
      for (const m of moves) {
        if (!m.san) break;
        const before = c.fen();
        const mv = c.move(m.san);
        if (!mv) break;
        m.fen ??= before;
        m.color ??= mv.color === "w" ? "white" : "black";
      }
    } catch { /* keep the moves that played */ }
  }
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
    const r = await db.execute(sql`SELECT g.id, COALESCE(g.review_data, cr.review) AS review_data, g.pgn, g.opening, g.white_username, g.black_username, g.white_rating, g.black_rating, g.platform, g.played_at
      FROM games g LEFT JOIN content_scanned s ON s.game_id = g.id LEFT JOIN content_reviews cr ON cr.game_id = g.id
      WHERE (g.review_data IS NOT NULL OR cr.game_id IS NOT NULL) AND s.game_id IS NULL AND g.platform IS DISTINCT FROM 'bot'
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

export async function contentScanProgress(): Promise<{ scanned: number; reviewed: number; moments: number; analyzed: number; unreviewed: number; reviewer: ReviewerState }> {
  const [r] = rowsOf<Record<string, string>>(await db.execute(sql`SELECT
    (SELECT COUNT(*) FROM content_scanned) AS scanned,
    (SELECT COUNT(*) FROM games g WHERE (g.review_data IS NOT NULL OR EXISTS (SELECT 1 FROM content_reviews cr WHERE cr.game_id = g.id)) AND g.platform IS DISTINCT FROM 'bot') AS reviewed,
    (SELECT COUNT(*) FROM games WHERE analyzed = true AND platform IS DISTINCT FROM 'bot') AS analyzed,
    (SELECT COUNT(*) FROM games g WHERE g.review_data IS NULL AND g.pgn IS NOT NULL AND g.platform IS DISTINCT FROM 'bot' AND NOT EXISTS (SELECT 1 FROM content_reviews cr WHERE cr.game_id = g.id)) AS unreviewed,
    (SELECT COUNT(*) FROM content_moments) AS moments`));
  return {
    scanned: Number(r?.scanned ?? 0), reviewed: Number(r?.reviewed ?? 0), moments: Number(r?.moments ?? 0),
    analyzed: Number(r?.analyzed ?? 0), unreviewed: Number(r?.unreviewed ?? 0), reviewer: { ...reviewer },
  };
}

// ── Reviewing more games for the Studio ────────────────────────────────────
// Clips need a move-by-move engine review. Most imported games only have the
// lighter analysis, so this reviews more of them with the isolated bulk
// Stockfish (never the engine players' reviews use), newest first, and keeps
// the result in content_reviews. The scanner then picks them up.
export interface ReviewerState { running: boolean; target: number; done: number; failed: number; error: string | null }
const reviewer: ReviewerState = { running: false, target: 0, done: 0, failed: 0, error: null };
let stopReviewer = false;
export function stopStudioReviews(): void { stopReviewer = true; }
export async function startStudioReviews(count: number): Promise<{ started: boolean; error?: string }> {
  if (reviewer.running) return { started: false, error: "Already reviewing" };
  const busy = rowsOf(await db.execute(sql`SELECT 1 FROM background_jobs WHERE type = 'bulk_game_crawl' AND status = 'pending' LIMIT 1`));
  if (busy.length) return { started: false, error: "The bulk review job (Admin › Tools) is running and uses the same engine. Stop it first, or let it finish." };
  Object.assign(reviewer, { running: true, target: count, done: 0, failed: 0, error: null });
  stopReviewer = false;
  void (async () => {
    const { reviewGameEngineOnly, destroyBulkEngine } = await import("./bulkStockfish");
    const { parsePgnMoves } = await import("./chesscom");
    try {
      while (!stopReviewer && reviewer.done + reviewer.failed < reviewer.target) {
        const [g] = rowsOf<{ id: number; pgn: string }>(await db.execute(sql`
          SELECT g.id, g.pgn FROM games g
          WHERE g.review_data IS NULL AND g.pgn IS NOT NULL AND g.platform IS DISTINCT FROM 'bot'
            AND NOT EXISTS (SELECT 1 FROM content_reviews cr WHERE cr.game_id = g.id)
          ORDER BY g.id DESC LIMIT 1`));
        if (!g) break;
        try {
          const moves = parsePgnMoves(g.pgn);
          if (moves.length < 10) throw new Error("too short");
          const fens = [moves[0].fenBefore, ...moves.map((m) => m.fen).filter((f): f is string => !!f)];
          const review = await Promise.race([
            reviewGameEngineOnly(fens, moves.map((m) => m.color as "white" | "black"), moves.map((m) => m.san), 12, 60),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timed out")), Math.max(60_000, moves.length * 5000))),
          ]);
          await db.execute(sql`INSERT INTO content_reviews (game_id, review) VALUES (${g.id}, ${JSON.stringify(review)}::jsonb) ON CONFLICT (game_id) DO NOTHING`);
          reviewer.done++;
        } catch (err) {
          // Mark it so the next pass doesn't pick it again.
          await db.execute(sql`INSERT INTO content_reviews (game_id, review) VALUES (${g.id}, '{"moves":[]}'::jsonb) ON CONFLICT (game_id) DO NOTHING`).catch(() => {});
          reviewer.failed++;
          if (err instanceof Error && /timed out/.test(err.message)) destroyBulkEngine();
        }
      }
    } catch (err) {
      reviewer.error = err instanceof Error ? err.message : String(err);
    } finally {
      reviewer.running = false;
    }
  })();
  return { started: true };
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

export interface MomentQuery { tags?: string[]; opening?: string; minRating?: number; platform?: string; limit?: number; offset?: number; sort?: "best" | "new" | "random"; sinceDays?: number }

export async function listMoments(q: MomentQuery) {
  const conds = [sql`TRUE`];
  const tags = (q.tags ?? []).filter((t) => (MOMENT_TAGS as readonly string[]).includes(t));
  if (tags.length) conds.push(sql`tags @> ${`{${tags.join(",")}}`}::text[]`);
  if (q.opening) conds.push(sql`opening ILIKE ${"%" + q.opening + "%"}`);
  if (q.minRating) conds.push(sql`GREATEST(COALESCE(white_rating,0), COALESCE(black_rating,0)) >= ${q.minRating}`);
  if (q.platform) conds.push(sql`platform = ${q.platform}`);
  if (q.sinceDays) conds.push(sql`played_at >= now() - make_interval(days => ${Math.round(q.sinceDays)})`);
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
  const r = await db.execute(sql`SELECT id, pgn, COALESCE(review_data, (SELECT review FROM content_reviews cr WHERE cr.game_id = games.id)) AS review_data, opening, white_username, black_username, white_rating, black_rating, result, platform, played_at FROM games WHERE id = ${id}`);
  const g = rowsOf(r)[0];
  if (!g) return null;
  const rd = g.review_data as { moves?: unknown[]; whiteAccuracy?: number; blackAccuracy?: number; gameSummary?: { overview?: string } | null } | unknown[] | null;
  const obj = rd && !Array.isArray(rd) ? rd : null;
  return {
    id: g.id, pgn: g.pgn, opening: g.opening, white: g.white_username, black: g.black_username,
    whiteRating: g.white_rating, blackRating: g.black_rating, result: g.result, platform: g.platform, playedAt: g.played_at,
    moves: Array.isArray(rd) ? rd : rd?.moves ?? [],
    whiteAccuracy: typeof obj?.whiteAccuracy === "number" ? obj.whiteAccuracy : null,
    blackAccuracy: typeof obj?.blackAccuracy === "number" ? obj.blackAccuracy : null,
    overview: typeof obj?.gameSummary?.overview === "string" ? obj.gameSummary.overview : null,
  };
}

// Most trap lessons start from a position a few moves into the opening. For the
// Studio, find the opening moves that lead there (through known book positions),
// so a clip can show the whole game from move 1.
const leadInCache = new Map<string, string[] | null>();
let warming = false;
let named: Set<string> | null = null;
function findLeadIn(target: string): string[] | null {
  const parts = target.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const fullmove = Number(parts[5]) || 0;
  const plies = fullmove ? (fullmove - 1) * 2 + (parts[1] === "b" ? 1 : 0) : 0;
  if (plies <= 0 || plies > 24) return null;
  // Board as 64 chars, to count how many squares still differ from the target.
  const grid = (fen: string) => fen.split(" ")[0].replace(/\d/g, (n) => ".".repeat(Number(n))).replace(/\//g, "");
  const goal = grid(target), goalTurn = parts[1];
  const diff = (fen: string) => { const g = grid(fen); let d = 0; for (let i = 0; i < 64; i++) if (g[i] !== goal[i]) d++; return d; };
  const key4 = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
  // The most natural move order: through named opening lines where possible, then pawn moves early
  // and knights before bishops (1.e4 e5 2.Nf3 Nc6 3.Bc4).
  named ??= new Set(OPENING_POSITIONS.split("\n"));
  const cost = (san: string, i: number, fen: string) => (named!.has(key4(fen)) ? -10 : 0) + (/^[a-h]/.test(san) ? i : 0) + (san.startsWith("N") ? i * 0.1 : 0);
  type Node = { fen: string; path: string[]; score: number };
  let frontier: Node[] = [{ fen: new Chess().fen(), path: [], score: 0 }];
  const seen = new Set<string>([key4(frontier[0].fen)]);
  const found: Node[] = [];
  for (let d = 0; d < plies; d++) {
    const left = plies - d - 1;
    const next: Node[] = [];
    const atLevel = new Map<string, number>();
    for (const node of frontier) {
      const c = new Chess(node.fen);
      for (const m of c.moves({ verbose: true })) {
        c.move(m);
        const f = c.fen();
        c.undo();
        const dd = diff(f);
        const score = node.score + cost(m.san, d, f);
        if (left === 0) { if (dd === 0 && f.split(" ")[1] === goalTurn) found.push({ fen: f, path: [...node.path, m.san], score }); continue; }
        // A move changes at most two squares (castling four): prune what can't reach the target in time.
        if (dd > 2 * left + 2) continue;
        const k = key4(f);
        // Reached again this level by a more natural order: keep that one.
        const at = atLevel.get(k);
        if (at !== undefined) { if (score < next[at].score) next[at] = { fen: f, path: [...node.path, m.san], score }; continue; }
        if (seen.has(k) || !isBookPosition(f)) continue;
        seen.add(k);
        atLevel.set(k, next.length);
        next.push({ fen: f, path: [...node.path, m.san], score });
      }
    }
    if (left === 0) break;
    if (!next.length || next.length > 30000) return null;
    frontier = next;
  }
  if (!found.length) return null;
  return found.sort((a, b) => a.score - b.score)[0].path;
}

/** The app's trap lessons, as Studio clips (opening lead-in, moves, a note per move, the critical move). */
export async function studioTraps() {
  const rows = (await db.select().from(chessTrapsTable)).filter((r) => !r.archived);
  const fenOf = (t: { startingFen: string }) => (t.startingFen && t.startingFen !== "startpos" ? t.startingFen : "");
  const solve = async (fen: string) => {
    if (!fen || leadInCache.has(fen)) return;
    try { leadInCache.set(fen, findLeadIn(fen)); } catch { leadInCache.set(fen, null); }
    await new Promise((res) => setImmediate(res));
  };
  // A few seconds now; anything left is worked out in the background for the next visit.
  const started = Date.now();
  for (const t of rows) { if (Date.now() - started > 3000) break; await solve(fenOf(t)); }
  if (rows.some((t) => fenOf(t) && !leadInCache.has(fenOf(t))) && !warming) {
    warming = true;
    void (async () => { try { for (const t of rows) await solve(fenOf(t)); } finally { warming = false; } })();
  }
  const out = [];
  for (const t of rows) {
    const fen = fenOf(t);
    const leadIn: string[] = fen ? leadInCache.get(fen) ?? [] : [];
    out.push({
      id: t.id, name: t.name, category: t.category, difficulty: t.difficulty, trapSide: t.trapSide, summary: t.summary,
      startingFen: t.startingFen, moves: (t.trapLineSan ?? []) as string[], notes: (t.moveNotes ?? []) as string[], critical: t.criticalMoveIndex,
      leadIn,
    });
  }
  return out;
}

// ── Puzzles: the app's puzzle library as Studio clips ─────────────────────
export interface PuzzleQuery { theme?: string; minRating?: number; maxRating?: number; sort?: "random" | "hard" | "easy" | "new"; limit?: number; offset?: number; source?: string }
export async function studioPuzzles(q: PuzzleQuery) {
  const conds = [sql`archived = false`];
  // Themes are stored space- or comma-separated (Lichess imports vs. our own puzzles).
  if (q.theme) conds.push(sql`COALESCE(themes,'') ~* ${"(^|[ ,])" + q.theme + "([ ,]|$)"}`);
  if (q.minRating) conds.push(sql`rating >= ${q.minRating}`);
  if (q.maxRating) conds.push(sql`rating <= ${q.maxRating}`);
  if (q.source) conds.push(sql`source = ${q.source}`);
  const order = q.sort === "hard" ? sql`rating DESC, id DESC` : q.sort === "easy" ? sql`rating ASC, id DESC` : q.sort === "new" ? sql`id DESC` : sql`random()`;
  const limit = Math.min(120, Math.max(1, q.limit ?? 48));
  return rowsOf(await db.execute(sql`SELECT id, fen, moves, rating, themes, explanation, source, game_id AS "gameId"
    FROM puzzles WHERE ${sql.join(conds, sql` AND `)} ORDER BY ${order} LIMIT ${limit} OFFSET ${Math.max(0, q.offset ?? 0)}`));
}

let themeCache: { at: number; list: { theme: string; n: number }[] } | null = null;
export async function puzzleThemes() {
  if (themeCache && Date.now() - themeCache.at < 6 * 60 * 60 * 1000) return themeCache.list;
  const rows = rowsOf<{ theme: string; n: string }>(await db.execute(sql`SELECT t AS theme, COUNT(*) AS n
    FROM (SELECT regexp_split_to_table(themes, '[ ,]+') AS t FROM puzzles WHERE archived = false AND themes IS NOT NULL) x
    WHERE t <> '' GROUP BY t ORDER BY COUNT(*) DESC LIMIT 40`));
  themeCache = { at: Date.now(), list: rows.map((r) => ({ theme: r.theme, n: Number(r.n) })) };
  return themeCache.list;
}

// ── Game reviews: whole reviewed games, ranked by how much happened ─────
export interface ReviewQuery { q?: string; minRating?: number; platform?: string; sort?: "drama" | "new" | "accuracy"; limit?: number; offset?: number; sinceDays?: number }
export async function studioReviews(q: ReviewQuery) {
  const conds = [sql`g.review_data IS NOT NULL`, sql`g.platform IS DISTINCT FROM 'bot'`];
  if (q.q) conds.push(sql`(g.opening ILIKE ${"%" + q.q + "%"} OR g.white_username ILIKE ${"%" + q.q + "%"} OR g.black_username ILIKE ${"%" + q.q + "%"})`);
  if (q.minRating) conds.push(sql`GREATEST(COALESCE(g.white_rating,0), COALESCE(g.black_rating,0)) >= ${q.minRating}`);
  if (q.platform) conds.push(sql`g.platform = ${q.platform}`);
  if (q.sinceDays) conds.push(sql`g.played_at >= now() - make_interval(days => ${Math.round(q.sinceDays)})`);
  const order = q.sort === "new" ? sql`g.played_at DESC NULLS LAST, g.id DESC`
    : q.sort === "accuracy" ? sql`GREATEST(COALESCE((g.review_data->>'whiteAccuracy')::float,0), COALESCE((g.review_data->>'blackAccuracy')::float,0)) DESC, g.id DESC`
    : sql`COALESCE(m.score, 0) DESC, g.id DESC`;
  const limit = Math.min(120, Math.max(1, q.limit ?? 48));
  return rowsOf(await db.execute(sql`SELECT g.id, g.opening, g.white_username AS white, g.black_username AS black, g.white_rating AS "whiteRating", g.black_rating AS "blackRating",
      g.result, g.platform, g.played_at AS "playedAt",
      CASE WHEN jsonb_typeof(g.review_data) = 'object' THEN (g.review_data->>'whiteAccuracy')::float END AS "whiteAccuracy",
      CASE WHEN jsonb_typeof(g.review_data) = 'object' THEN (g.review_data->>'blackAccuracy')::float END AS "blackAccuracy",
      COALESCE(m.n, 0)::int AS moments, COALESCE(m.brilliant, 0)::int AS brilliant, COALESCE(m.blunder, 0)::int AS blunders, COALESCE(m.mate, 0)::int AS mate,
      m.last_fen AS "lastFen"
    FROM games g
    LEFT JOIN (SELECT game_id, COUNT(*) AS n, SUM(score) AS score,
        COUNT(*) FILTER (WHERE 'brilliant' = ANY(tags)) AS brilliant, COUNT(*) FILTER (WHERE 'blunder' = ANY(tags)) AS blunder,
        COUNT(*) FILTER (WHERE 'checkmate' = ANY(tags)) AS mate, (array_agg(fen_before ORDER BY move_index DESC))[1] AS last_fen
      FROM content_moments GROUP BY game_id) m ON m.game_id = g.id
    WHERE ${sql.join(conds, sql` AND `)} ORDER BY ${order} LIMIT ${limit} OFFSET ${Math.max(0, q.offset ?? 0)}`));
}

// ── Opponent Scout reports, as Studio clips ─────────────────────────────
/** Latest finished scout per player (newest first), without the game PGNs. */
export async function studioScouts(q?: string) {
  const cond = q ? sql`AND lower(target_username) LIKE ${"%" + q.toLowerCase() + "%"}` : sql``;
  const rows = rowsOf(await db.execute(sql`SELECT DISTINCT ON (lower(target_username)) id, target_username AS "username", completed_at AS "completedAt",
      result - 'gamePgns' AS result
    FROM background_jobs WHERE type = 'scout' AND status = 'done' AND result IS NOT NULL ${cond}
    ORDER BY lower(target_username), completed_at DESC NULLS LAST LIMIT 200`));
  return rows.sort((a, b) => new Date(String(b.completedAt ?? 0)).getTime() - new Date(String(a.completedAt ?? 0)).getTime()).slice(0, 60);
}
/** One scout with a few of the player's games (to play their favourite opening behind the stats). */
export async function studioScout(id: string) {
  const r = rowsOf(await db.execute(sql`SELECT id, target_username AS "username", result FROM background_jobs WHERE id = ${id} AND type = 'scout' AND status = 'done'`))[0];
  if (!r) return null;
  const result = (r.result ?? {}) as Record<string, unknown>;
  const pgns = Array.isArray(result.gamePgns) ? (result.gamePgns as string[]).slice(0, 40) : [];
  return { id: r.id, username: r.username, result: { ...result, gamePgns: pgns } };
}

// ── Beginner and kids lessons ───────────────────────────────────────────
export async function studioLessons() {
  const courses = rowsOf(await db.execute(sql`SELECT id, title, description, icon_emoji AS "icon" FROM beginner_courses WHERE archived = false ORDER BY order_index, id`));
  const lessons = rowsOf(await db.execute(sql`SELECT id, course_id AS "courseId", title, summary, steps FROM beginner_lessons WHERE archived = false ORDER BY course_id, order_index, id`));
  return courses.map((c) => ({ ...c, lessons: lessons.filter((l) => l.courseId === c.id) }));
}

// ── Scanned positions (FEN only, no photos or owners) ───────────────────
export async function studioScans() {
  return rowsOf(await db.execute(sql`SELECT id, fen, label, created_at AS "createdAt" FROM scanned_positions ORDER BY id DESC LIMIT 60`));
}
