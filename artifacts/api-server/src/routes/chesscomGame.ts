// One Chess.com game, by its id: what the ChessScout extension's "Review" button (and
// /cc/<id> links) open. Finds the game in the member's games, or in the current and
// last month's Chess.com archive of the players given (the member's own Chess.com
// name first), saves it to their games and returns its id. Chess.com publishes a
// finished game to its archive a little after it ends, so until then the answer is
// { pending: true } and the page asks again.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, gamesTable, usersTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { extractGameMetadata, type ChessComGame } from "../lib/chesscom";

const router: IRouter = Router();
const UA = "ChessScout.net/1.0 (+https://chessscout.net)";
const NAME = /^[A-Za-z0-9_-]{3,25}$/;

async function archive(name: string, ym: string): Promise<ChessComGame[]> {
  try {
    const r = await fetch(`https://api.chess.com/pub/player/${name.toLowerCase()}/games/${ym}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return [];
    return ((await r.json()) as { games?: ChessComGame[] }).games ?? [];
  } catch { return []; }
}
const months = (): string[] => {
  const now = new Date(), prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const f = (d: Date) => `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return now.getUTCDate() <= 2 ? [f(now), f(prev)] : [f(now)];
};

router.post("/games/from-chesscom", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const latest = req.body?.gameId === "latest";
  // "latest" from the extension: only a game that ended around when the button showed
  const since = Number(req.body?.since) || 0;
  const gameId = String(req.body?.gameId ?? "");
  if (!latest && !/^\d{4,15}$/.test(gameId)) { res.status(400).json({ error: "Bad game id" }); return; }

  if (!latest) {
    const [have] = await db.select({ id: gamesTable.id }).from(gamesTable)
      .where(and(eq(gamesTable.userId, userId), eq(gamesTable.chesscomGameId, gameId))).limit(1);
    if (have) { res.json({ id: have.id }); return; }
  }

  const [me] = await db.select({ cc: usersTable.chesscomUsername }).from(usersTable).where(eq(usersTable.id, userId));
  const given = (Array.isArray(req.body?.players) ? req.body.players : []).map(String).filter((n: string) => NAME.test(n)).slice(0, 2);
  const names = [...new Set([me?.cc, ...given].filter((n): n is string => !!n).map((n) => n.toLowerCase()))];
  if (names.length === 0) { res.status(400).json({ error: "no_chesscom", message: "Link your Chess.com username on ChessScout first." }); return; }

  for (const name of latest ? names.slice(0, 1) : names) {
    for (const ym of months()) {
      const games = await archive(name, ym);
      const g = latest
        ? games.filter((x) => x.pgn && (!since || (x.end_time ?? 0) * 1000 >= since - 3 * 60_000)).sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))[0]
        : games.find((x) => x.url?.split("/").pop() === gameId);
      if (!g?.pgn) continue;
      const meta = extractGameMetadata(g, name);
      if (meta.chesscomGameId) {
        const [have] = await db.select({ id: gamesTable.id }).from(gamesTable)
          .where(and(eq(gamesTable.userId, userId), eq(gamesTable.chesscomGameId, meta.chesscomGameId))).limit(1);
        if (have) { res.json({ id: have.id }); return; }
      }
      const [row] = await db.insert(gamesTable).values({ userId, username: name, platform: "chesscom", ...meta, pgn: g.pgn })
        .onConflictDoNothing().returning({ id: gamesTable.id });
      if (row) { res.json({ id: row.id }); return; }
      const [again] = await db.select({ id: gamesTable.id }).from(gamesTable)
        .where(and(eq(gamesTable.userId, userId), eq(gamesTable.chesscomGameId, meta.chesscomGameId ?? ""))).orderBy(desc(gamesTable.id)).limit(1);
      if (again) { res.json({ id: again.id }); return; }
    }
  }
  res.json({ pending: true });
});

export default router;
