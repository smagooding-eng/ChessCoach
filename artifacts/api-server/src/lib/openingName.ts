// Names the opening of a game played on ChessScout (live, daily and bot
// games are saved without one, so lists showed "Unknown opening").
// The ECO code comes from the deepest standard ECO line whose position the
// game reaches (transpositions count), the name from the ECO family it's in.
import { Chess } from "chess.js";
import { ECO_LINES } from "./openingBook";

const key = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
let byPosition: Map<string, { eco: string; depth: number }> | null = null;
function build() {
  byPosition = new Map();
  for (const [eco, line] of Object.entries(ECO_LINES)) {
    const moves = line.replace(/\d+\.\.\./g, "").replace(/\d+\./g, "").trim().split(/\s+/).filter(Boolean);
    const c = new Chess();
    let ok = true;
    for (const san of moves) { try { c.move(san); } catch { ok = false; break; } }
    if (!ok || !moves.length) continue;
    const k = key(c.fen());
    const cur = byPosition.get(k);
    if (!cur || moves.length > cur.depth) byPosition.set(k, { eco: eco.slice(0, 3), depth: moves.length });
  }
}

// ECO families: [last code in the range, name].
const FAMILIES: [string, string][] = [
  ["A00", "Uncommon Opening"], ["A01", "Nimzo-Larsen Attack"], ["A03", "Bird's Opening"], ["A09", "Réti Opening"],
  ["A39", "English Opening"], ["A41", "Queen's Pawn Game"], ["A42", "Modern Defense"], ["A44", "Old Benoni Defense"],
  ["A46", "Indian Defense"], ["A47", "Queen's Indian Defense"], ["A49", "Indian Defense"], ["A50", "Indian Defense"],
  ["A52", "Budapest Gambit"], ["A55", "Old Indian Defense"], ["A56", "Benoni Defense"], ["A59", "Benko Gambit"],
  ["A79", "Benoni Defense"], ["A99", "Dutch Defense"],
  ["B00", "Uncommon King's Pawn Opening"], ["B01", "Scandinavian Defense"], ["B05", "Alekhine's Defense"], ["B06", "Modern Defense"],
  ["B09", "Pirc Defense"], ["B19", "Caro-Kann Defense"], ["B99", "Sicilian Defense"],
  ["C19", "French Defense"], ["C20", "King's Pawn Game"], ["C22", "Center Game"], ["C24", "Bishop's Opening"], ["C29", "Vienna Game"],
  ["C39", "King's Gambit"], ["C40", "King's Knight Opening"], ["C41", "Philidor Defense"], ["C43", "Petrov's Defense"],
  ["C44", "King's Pawn Game"], ["C45", "Scotch Game"], ["C46", "Three Knights Opening"], ["C49", "Four Knights Game"],
  ["C50", "Italian Game"], ["C52", "Evans Gambit"], ["C54", "Italian Game"], ["C59", "Two Knights Defense"], ["C99", "Ruy Lopez"],
  ["D00", "Queen's Pawn Game"], ["D01", "Richter-Veresov Attack"], ["D02", "Queen's Pawn Game"], ["D03", "Torre Attack"],
  ["D05", "Queen's Pawn Game"], ["D06", "Queen's Gambit"], ["D07", "Chigorin Defense"], ["D09", "Albin Countergambit"],
  ["D19", "Slav Defense"], ["D29", "Queen's Gambit Accepted"], ["D42", "Queen's Gambit Declined"], ["D49", "Semi-Slav Defense"],
  ["D69", "Queen's Gambit Declined"], ["D99", "Grünfeld Defense"],
  ["E00", "Indian Defense"], ["E09", "Catalan Opening"], ["E10", "Indian Defense"], ["E11", "Bogo-Indian Defense"],
  ["E19", "Queen's Indian Defense"], ["E59", "Nimzo-Indian Defense"], ["E99", "King's Indian Defense"],
];
const familyOf = (eco: string) => FAMILIES.find(([last]) => eco <= last)?.[1] ?? "Uncommon Opening";

/** SAN moves from a PGN (headers, comments, variations and move numbers stripped). */
function pgnSans(pgn: string): string[] {
  return pgn.replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/\([^)]*\)/g, " ").replace(/\$\d+/g, " ")
    .split(/\s+/).map((t) => t.replace(/^\d+\.+/, "")).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

/** The opening of a game from its moves (or PGN), or null if it can't be told. */
export function openingFromMoves(movesOrPgn: string[] | string): { eco: string; name: string } | null {
  if (!byPosition) build();
  const sans = typeof movesOrPgn === "string" ? pgnSans(movesOrPgn) : movesOrPgn;
  if (!sans.length) return null;
  const c = new Chess();
  let best: { eco: string; depth: number } | null = null;
  const whiteMoves: string[] = [];
  for (let i = 0; i < Math.min(sans.length, 30); i++) {
    try { c.move(sans[i]); } catch { break; }
    if (i % 2 === 0) whiteMoves.push(sans[i]);
    const hit = byPosition!.get(key(c.fen()));
    if (hit && (!best || hit.depth >= best.depth)) best = hit;
  }
  // The London System isn't its own ECO code: d4 and an early Bf4, no c4.
  const early = whiteMoves.slice(0, 6);
  if (early[0] === "d4" && early.includes("Bf4") && !early.includes("c4")) return { eco: best?.eco ?? "D02", name: "London System" };
  if (!best) {
    const first = sans[0];
    const generic: Record<string, [string, string]> = { e4: ["C20", "King's Pawn Game"], d4: ["A40", "Queen's Pawn Game"], c4: ["A10", "English Opening"], Nf3: ["A04", "Réti Opening"] };
    const g = generic[first];
    return g ? { eco: g[0], name: g[1] } : { eco: "A00", name: "Uncommon Opening" };
  }
  return { eco: best.eco, name: familyOf(best.eco) };
}

/** Once per start: name the openings of ChessScout / bot games saved without one. */
export async function backfillChessScoutOpenings(): Promise<void> {
  const { db } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");
  const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];
  for (let pass = 0; pass < 200; pass++) {
    const rows = rowsOf<{ id: number; pgn: string }>(await db.execute(sql`
      SELECT id, pgn FROM games WHERE opening IS NULL AND platform IN ('chessscout', 'bot') AND pgn IS NOT NULL AND pgn <> '' ORDER BY id DESC LIMIT 200`));
    if (!rows.length) return;
    for (const r of rows) {
      const o = openingFromMoves(r.pgn);
      // "" marks games that can't be named, so they aren't picked again.
      await db.execute(sql`UPDATE games SET opening = ${o?.name ?? ""}, eco = COALESCE(eco, ${o?.eco ?? null}) WHERE id = ${r.id}`);
    }
    await new Promise((res) => setTimeout(res, 200));
  }
}
