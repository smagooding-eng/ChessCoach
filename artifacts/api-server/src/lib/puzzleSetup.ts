// Every stored puzzle uses Lichess's shape: `fen` is the position BEFORE the
// opponent's move that sets the puzzle up, and `moves` starts with that move,
// then the solver's moves. Everything that serves puzzles strips that first move.
//
// Puzzles made from members' own games were stored without it (fen = the
// solver's turn, moves = the solution), so the serving code stripped the
// solver's first move instead: the board came up from the wrong side, showing
// the opponent to move, with the answer one move off. This adds the real setup
// move from the game, and fixes the ones already stored (once, at startup).
import { Chess } from "chess.js";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

const key = (fen: string) => fen.split(" ").slice(0, 2).join(" ");

/** The puzzle in Lichess's shape, using the game's move that led to `fen`. Null if not found. */
export function withSetupMove(pgn: string, fen: string, moves: string): { fen: string; moves: string } | null {
  const c = new Chess();
  try { c.loadPgn(pgn, { strict: false }); } catch { return null; }
  const h = c.history({ verbose: true });
  for (let i = 1; i <= h.length; i++) {
    const at = i < h.length ? h[i].before : c.fen();
    if (key(at) !== key(fen)) continue;
    const prev = h[i - 1];
    return { fen: prev.before, moves: `${prev.from}${prev.to}${prev.promotion ?? ""} ${moves}`.trim() };
  }
  return null;
}

type Row = { id: number; fen: string; moves: string; pgn: string | null };
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

let tableReady: Promise<unknown> | null = null;
const ensureTable = () => (tableReady ??= db.execute(sql`CREATE TABLE IF NOT EXISTS puzzle_setup_fixed (puzzle_id INTEGER PRIMARY KEY, fixed_at TIMESTAMPTZ NOT NULL DEFAULT now())`));
/** Record that a puzzle already has its setup move (so the startup fix leaves it alone). */
export async function markSetupFixed(id: number): Promise<void> {
  await ensureTable();
  await db.execute(sql`INSERT INTO puzzle_setup_fixed (puzzle_id) VALUES (${id}) ON CONFLICT DO NOTHING`);
}

/** One-time fix for puzzles from members' games stored before this. */
export async function fixGamePuzzleSetups(): Promise<void> {
  await ensureTable();
  let fixed = 0, removed = 0;
  for (;;) {
    const rows = rowsOf<Row>(await db.execute(sql`
      SELECT p.id, p.fen, p.moves, g.pgn FROM puzzles p LEFT JOIN games g ON g.id = p.game_id
      WHERE p.source = 'game' AND NOT EXISTS (SELECT 1 FROM puzzle_setup_fixed f WHERE f.puzzle_id = p.id)
      ORDER BY p.id LIMIT 200`));
    if (!rows.length) break;
    for (const r of rows) {
      const next = r.pgn ? withSetupMove(r.pgn, r.fen, r.moves) : null;
      if (next) {
        await db.execute(sql`UPDATE puzzles SET fen = ${next.fen}, moves = ${next.moves} WHERE id = ${r.id}`);
        fixed++;
      } else {
        // No way to tell which move set it up: take it out rather than serve it upside down.
        await db.execute(sql`DELETE FROM puzzle_attempts WHERE puzzle_id = ${r.id}`).catch(() => {});
        await db.execute(sql`DELETE FROM puzzles WHERE id = ${r.id}`).catch(() => {});
        removed++;
      }
      await db.execute(sql`INSERT INTO puzzle_setup_fixed (puzzle_id) VALUES (${r.id}) ON CONFLICT DO NOTHING`);
    }
  }
  if (fixed || removed) logger.info({ fixed, removed }, "[puzzles] game puzzles given their setup move");
}

/** A puzzle from Lichess's puzzle API in the stored shape: the game (its PGN ends where the
 *  puzzle starts) gives the opponent's setup move; `solverFen` is the position to solve. */
export function fromLichessApi(data: { game?: { pgn?: string }; puzzle?: { solution?: string[] } }): { fen: string; moves: string; solverFen: string } | null {
  const pgn = data.game?.pgn, solution = data.puzzle?.solution;
  if (!pgn || !solution?.length) return null;
  const c = new Chess();
  try { c.loadPgn(pgn, { strict: false }); } catch { return null; }
  const h = c.history({ verbose: true });
  const last = h[h.length - 1];
  if (!last) return null;
  const s0 = solution[0];
  try { if (!new Chess(c.fen()).move({ from: s0.slice(0, 2), to: s0.slice(2, 4), promotion: s0[4] })) return null; } catch { return null; }
  return { fen: last.before, moves: [`${last.from}${last.to}${last.promotion ?? ""}`, ...solution].join(" "), solverFen: c.fen() };
}

/** Lichess puzzles fetched one at a time used to be stored from the solver's move with no
 *  setup move, so they were served with the opponent to move. Lichess solutions end on the
 *  solver's move, so a stored Lichess puzzle always has an even number of moves; those with
 *  an odd number (not the hand-made tac_ ones) are those, and are taken out (Lichess has
 *  plenty more). Runs at startup; finds nothing once they're gone. */
export async function removeSetuplessLichessPuzzles(): Promise<void> {
  try {
    const bad = `SELECT id FROM puzzles WHERE source = 'lichess' AND (lichess_id IS NULL OR lichess_id NOT LIKE 'tac\\_%')
      AND array_length(string_to_array(trim(moves), ' '), 1) % 2 = 1`;
    await db.execute(sql.raw(`DELETE FROM puzzle_attempts WHERE puzzle_id IN (${bad})`)).catch(() => {});
    const r = rowsOf<{ id: number }>(await db.execute(sql.raw(`DELETE FROM puzzles WHERE id IN (${bad}) RETURNING id`)));
    if (r.length) logger.info({ removed: r.length }, "[puzzles] removed Lichess puzzles stored without their setup move");
  } catch (e) { logger.warn({ err: e }, "[puzzles] setup-less puzzle cleanup failed"); }
}
