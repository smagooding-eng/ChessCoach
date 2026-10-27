// Opening positions that are common in real games: any position in the first
// 20 plies that at least MIN_GAMES different games reached. Together with the
// named opening lines this is close to what players think of as "book"
// (e.g. 3...Qa5 4.Bc4 in the Scandinavian). Rebuilt from the games table at
// startup and once a day, in small slices so it never blocks requests.
import { Chess } from "chess.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { setPopularBookPositions } from "./openingBook";

const MAX_PLIES = 20;
const MIN_GAMES = 12;
const MAX_GAMES_SCANNED = 40_000;
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function sanTokens(pgn: string): string[] {
  const body = pgn.replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/\([^)]*\)/g, " ");
  return body.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)).map((t) => t.replace(/^\d+\.+/, "")).filter(Boolean);
}
const pause = () => new Promise((r) => setImmediate(r));

export async function rebuildPopularBook(): Promise<number> {
  const counts = new Map<string, number>();
  let scanned = 0;
  let lastId = 2_147_483_647;
  while (scanned < MAX_GAMES_SCANNED) {
    const r = await db.execute(sql`SELECT id, pgn FROM games WHERE id < ${lastId} AND pgn IS NOT NULL AND pgn NOT LIKE '%[FEN %' AND platform IS DISTINCT FROM 'bot' ORDER BY id DESC LIMIT 400`);
    const rows = ((r as unknown as { rows?: { id: number; pgn: string }[] }).rows ?? []);
    if (!rows.length) break;
    for (const row of rows) {
      lastId = row.id;
      scanned++;
      const seen = new Set<string>();
      try {
        const c = new Chess(START);
        for (const san of sanTokens(row.pgn).slice(0, MAX_PLIES)) {
          c.move(san);
          const key = c.fen().split(" ").slice(0, 4).join(" ");
          if (!seen.has(key)) { seen.add(key); counts.set(key, (counts.get(key) ?? 0) + 1); }
        }
      } catch { /* stop at the first bad token */ }
      if (scanned % 50 === 0) await pause();
    }
  }
  const keep = [...counts].filter(([, n]) => n >= MIN_GAMES).map(([k]) => k);
  setPopularBookPositions(keep);
  logger.info({ scanned, positions: keep.length }, "[book] popular opening positions rebuilt");
  return keep.length;
}

export function startPopularBook(): void {
  const run = () => { rebuildPopularBook().catch((err) => logger.warn({ err }, "[book] rebuild failed")); };
  setTimeout(run, 90_000);
  setInterval(run, 24 * 60 * 60 * 1000).unref?.();
}
