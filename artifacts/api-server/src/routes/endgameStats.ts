// Endgame stats: for each of a member's games, where the endgame began (if it did),
// what kind it was and the material balance there; then results by kind, and how
// often a winning endgame was won and a losing one saved.
// Each game is worked out once and kept in game_endgames, so the page stays quick.
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { parsePgnMoves, extractStartFen } from "../lib/chesscom";
import { ownerNames, sideFromNames } from "../lib/ownerSide";

const router: IRouter = Router();
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  return (ready ??= (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS game_endgames (
      game_id INTEGER PRIMARY KEY, user_id VARCHAR NOT NULL,
      kind VARCHAR(12), entry_ply INTEGER, white_balance INTEGER)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS game_endgames_user ON game_endgames (user_id)`);
  })().catch((e) => { ready = null; throw e; }));
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
export type EndgameKind = "pawn" | "minor" | "rook" | "rook_minor" | "queen";
const LABEL: Record<EndgameKind, string> = {
  pawn: "King & pawn",
  minor: "Minor piece",
  rook: "Rook",
  rook_minor: "Rook & minor piece",
  queen: "Queen",
};
const ORDER: EndgameKind[] = ["pawn", "rook", "minor", "rook_minor", "queen"];

function material(fen: string) {
  const board = fen.split(" ")[0] ?? "";
  let wPieces = 0, bPieces = 0, wAll = 0, bAll = 0;
  const kinds = new Set<string>();
  for (const ch of board) {
    const lower = ch.toLowerCase();
    const v = VALUE[lower];
    if (v === undefined) continue;
    const white = ch !== lower;
    if (white) wAll += v; else bAll += v;
    if (lower !== "p") { if (white) wPieces += v; else bPieces += v; kinds.add(lower); }
  }
  return { wPieces, bPieces, balance: wAll - bAll, kinds };
}

function kindOf(kinds: Set<string>): EndgameKind {
  if (kinds.has("q")) return "queen";
  const minor = kinds.has("n") || kinds.has("b");
  if (kinds.has("r")) return minor ? "rook_minor" : "rook";
  return minor ? "minor" : "pawn";
}

/** The endgame starts at the first position where each side has at most 13 points of
 *  pieces (pawns not counted): e.g. a rook and a minor piece, or a queen and a pawn army. */
export function findEndgame(pgn: string): { kind: EndgameKind; ply: number; whiteBalance: number } | null {
  let fens: string[];
  try { fens = [extractStartFen(pgn), ...parsePgnMoves(pgn).map((m) => m.fen ?? "")]; } catch { return null; }
  for (let ply = 1; ply < fens.length; ply++) {
    const f = fens[ply];
    if (!f) continue;
    const m = material(f);
    if (m.wPieces <= 13 && m.bPieces <= 13) return { kind: kindOf(m.kinds), ply, whiteBalance: m.balance };
  }
  return null;
}

async function fillMissing(userId: string, budgetMs: number): Promise<number> {
  const start = Date.now();
  for (;;) {
    const batch = rowsOf<{ id: number; pgn: string }>(await db.execute(sql`
      SELECT g.id, g.pgn FROM games g LEFT JOIN game_endgames e ON e.game_id = g.id
      WHERE g.user_id = ${userId} AND e.game_id IS NULL ORDER BY g.played_at DESC LIMIT 150`));
    if (batch.length === 0) return 0;
    const values = batch.map((g) => {
      const e = findEndgame(g.pgn ?? "");
      return sql`(${g.id}, ${userId}, ${e?.kind ?? null}, ${e?.ply ?? null}, ${e?.whiteBalance ?? null})`;
    });
    await db.execute(sql`INSERT INTO game_endgames (game_id, user_id, kind, entry_ply, white_balance)
      VALUES ${sql.join(values, sql`, `)} ON CONFLICT (game_id) DO NOTHING`);
    if (Date.now() - start > budgetMs) {
      const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`
        SELECT count(*)::int AS n FROM games g LEFT JOIN game_endgames e ON e.game_id = g.id
        WHERE g.user_id = ${userId} AND e.game_id IS NULL`));
      return Number(n) || 0;
    }
  }
}

type Row = {
  id: number; result: string; username: string | null; white_username: string; black_username: string;
  played_at: string; kind: string | null; white_balance: number | null;
};

router.get("/endgame-stats", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  try {
    await ensureTable();
    const pending = await fillMissing(userId, 6000);
    const mine = await ownerNames(userId);
    // Bot games stay out, as on "All games".
    const rows = rowsOf<Row>(await db.execute(sql`
      SELECT g.id, g.result, g.username, g.white_username, g.black_username, g.played_at, e.kind, e.white_balance
      FROM games g JOIN game_endgames e ON e.game_id = g.id
      WHERE g.user_id = ${userId} AND g.platform <> 'bot'
        AND NOT (g.white_username ILIKE 'ChessScout Bot%' OR g.black_username ILIKE 'ChessScout Bot%'
                 OR g.white_username ILIKE '% (Bot)' OR g.black_username ILIKE '% (Bot)')
      ORDER BY g.played_at DESC`));

    type Tally = { games: number; wins: number; draws: number; losses: number };
    const empty = (): Tally => ({ games: 0, wins: 0, draws: 0, losses: 0 });
    const add = (t: Tally, r: string) => { t.games++; if (r === "win") t.wins++; else if (r === "loss") t.losses++; else t.draws++; };
    const overall = empty(), allGames = empty();
    const ahead = empty(), equal = empty(), behind = empty();
    const byKind = new Map<EndgameKind, Tally & { recent: Array<{ id: number; opponent: string; result: string; playedAt: string }> }>();

    for (const r of rows) {
      add(allGames, r.result);
      if (!r.kind) continue;
      const kind = r.kind as EndgameKind;
      const side = sideFromNames({ username: r.username, whiteUsername: r.white_username, blackUsername: r.black_username }, mine);
      const youWhite = side !== "black";
      const bal = (r.white_balance ?? 0) * (youWhite ? 1 : -1);
      add(overall, r.result);
      add(bal >= 2 ? ahead : bal <= -2 ? behind : equal, r.result);
      if (!byKind.has(kind)) byKind.set(kind, { ...empty(), recent: [] });
      const k = byKind.get(kind)!;
      add(k, r.result);
      if (k.recent.length < 5) k.recent.push({ id: r.id, opponent: youWhite ? r.black_username : r.white_username, result: r.result, playedAt: new Date(r.played_at).toISOString() });
    }

    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
    const score = (t: Tally) => pct(t.wins + t.draws / 2, t.games);
    res.json({
      totalGames: allGames.games,
      endgameGames: overall.games,
      reachedPct: pct(overall.games, allGames.games),
      overall: { ...overall, winRate: pct(overall.wins, overall.games), score: score(overall) },
      allScore: score(allGames),
      byKind: ORDER.filter((k) => byKind.has(k)).map((k) => {
        const t = byKind.get(k)!;
        return { kind: k, label: LABEL[k], games: t.games, wins: t.wins, draws: t.draws, losses: t.losses, winRate: pct(t.wins, t.games), score: score(t), recent: t.recent };
      }),
      conversion: {
        ahead: { games: ahead.games, won: ahead.wins, pct: pct(ahead.wins, ahead.games) },
        equal: { games: equal.games, wins: equal.wins, draws: equal.draws, losses: equal.losses, score: score(equal) },
        behind: { games: behind.games, saved: behind.wins + behind.draws, pct: pct(behind.wins + behind.draws, behind.games) },
      },
      pending,
    });
  } catch (e) {
    req.log?.error({ err: e }, "endgame stats failed");
    res.status(500).json({ error: "Couldn't load endgame stats" });
  }
});

export default router;
