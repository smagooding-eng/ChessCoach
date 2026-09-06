import { Router, type IRouter, type Request, type Response } from "express";
import { fetchChessComGames, parsePgnMoves as parseChessComPgnMoves, extractOpeningFromPgn } from "../lib/chesscom";
import { fetchLichessGames } from "../lib/lichess";
import { db, gamesTable, weaknessesTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { computePhaseAccuracy } from "../lib/phaseAccuracy";

const router: IRouter = Router();

// Real lifetime totals for the "go Pro" pitch -- fetched separately from
// the shared profile helpers so this route can't accidentally break
// anything else that calls fetchChessComProfile/fetchLichessProfile.
async function fetchTotals(username: string, platform: "chesscom" | "lichess"): Promise<{ total: number; wins: number; losses: number } | null> {
  try {
    if (platform === "chesscom") {
      const res = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}/stats`, {
        headers: { "User-Agent": "ChessCoach/1.0" },
      });
      if (!res.ok) return null;
      const stats = await res.json() as any;
      let wins = 0, losses = 0, draws = 0;
      for (const key of ["chess_bullet", "chess_blitz", "chess_rapid", "chess_daily"]) {
        const record = stats[key]?.record;
        if (record) {
          wins += record.win ?? 0;
          losses += record.loss ?? 0;
          draws += record.draw ?? 0;
        }
      }
      return { total: wins + losses + draws, wins, losses };
    } else {
      const res = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const profile = await res.json() as any;
      const count = profile?.count;
      if (!count) return null;
      return { total: count.all ?? 0, wins: count.win ?? 0, losses: count.loss ?? 0 };
    }
  } catch {
    return null;
  }
}

// Simple in-memory per-IP rate limit -- this endpoint is public/unauthenticated
// (no signup required, that's the whole point of the demo), so it needs its
// own limit independent of the app's normal per-user usage limits. No
// external dependency needed for this; a Map is enough for a single
// Node process. Resets on deploy/restart, which is fine for this purpose.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

// Games analyzed and half-moves per game sampled -- kept small so the
// client-side analysis (which runs a real, if shallow, minimax per move)
// stays fast for a visitor who hasn't signed up for anything yet.
const GAMES_TO_ANALYZE = 2;
const MAX_MOVES_PER_GAME = 20;

router.post("/demo/analyze", async (req: Request, res: Response) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      res.status(429).json({ error: "Too many demo requests. Try again in a bit, or sign up for unlimited analysis." });
      return;
    }

    const { username, platform } = req.body as { username?: string; platform?: "chesscom" | "lichess" };
    if (!username || typeof username !== "string" || username.length > 50) {
      res.status(400).json({ error: "A valid username is required" });
      return;
    }
    if (platform !== "chesscom" && platform !== "lichess") {
      res.status(400).json({ error: "platform must be 'chesscom' or 'lichess'" });
      return;
    }

    const games: { pgn: string; openingName: string | null }[] = [];

    if (platform === "chesscom") {
      const chessComGames = await fetchChessComGames(username, 3);
      if (chessComGames.length === 0) {
        res.status(404).json({ error: `No recent Chess.com games found for "${username}"` });
        return;
      }
      for (const g of chessComGames.slice(-GAMES_TO_ANALYZE)) {
        const { opening } = extractOpeningFromPgn(g.pgn);
        games.push({ pgn: g.pgn, openingName: opening });
      }
    } else {
      const lichessGames = await fetchLichessGames(username, 3);
      if (lichessGames.length === 0) {
        res.status(404).json({ error: `No recent Lichess games found for "${username}"` });
        return;
      }
      for (const g of lichessGames.slice(0, GAMES_TO_ANALYZE)) {
        if (!g.pgn) continue;
        games.push({ pgn: g.pgn, openingName: g.opening?.name ?? null });
      }
    }

    if (games.length === 0) {
      res.status(404).json({ error: "No usable games found" });
      return;
    }

    // No OpenAI call anywhere in this route -- this is deliberately free
    // to run. The actual move-quality analysis happens client-side using
    // the same engine that powers Practice Bots, not a paid API.
    const gameMoveSets = games.map((g) => {
      const moves = parseChessComPgnMoves(g.pgn).slice(0, MAX_MOVES_PER_GAME);
      return {
        openingName: g.openingName,
        moves: moves.map((m) => ({ fenBefore: m.fenBefore, san: m.san, color: m.color })),
      };
    });

    const totals = await fetchTotals(username, platform);

    res.json({
      username,
      platform,
      gamesAnalyzed: gameMoveSets.length,
      games: gameMoveSets,
      totals,
    });
  } catch (err: any) {
    console.error("Demo analyze error:", err.message);
    res.status(500).json({ error: "Couldn't fetch games right now. Try again shortly." });
  }
});

// Deliberately hardcoded, not a query param -- this route exists to show
// the landing page's "what Pro/Opponent Scout actually looks like"
// dropdowns a real, complete sample report, without letting a visitor
// pull up any arbitrary account's data through it. Only the username is
// shown to the visitor (already public knowledge by design here); no
// user ID, email, or other account info is ever included in the
// response.
const SAMPLE_USERNAME = "damnshazam";

router.get("/demo/sample-report", async (_req: Request, res: Response) => {
  try {
    const games = await db
      .select({
        whiteUsername: gamesTable.whiteUsername,
        blackUsername: gamesTable.blackUsername,
        whiteRating: gamesTable.whiteRating,
        blackRating: gamesTable.blackRating,
        result: gamesTable.result,
        opening: gamesTable.opening,
        reviewData: gamesTable.reviewData,
        playedAt: gamesTable.playedAt,
      })
      .from(gamesTable)
      .where(eq(gamesTable.username, SAMPLE_USERNAME));

    let wins = 0, losses = 0, draws = 0, totalRating = 0, ratedGames = 0;
    const openingMap = new Map<string, { games: number; wins: number }>();
    for (const g of games) {
      if (g.result === "win") wins++;
      else if (g.result === "loss") losses++;
      else draws++;
      const isWhite = g.whiteUsername.toLowerCase() === SAMPLE_USERNAME;
      const rating = isWhite ? g.whiteRating : g.blackRating;
      if (rating > 0) { totalRating += rating; ratedGames++; }

      const opening = g.opening || "Unknown Opening";
      const stat = openingMap.get(opening) ?? { games: 0, wins: 0 };
      stat.games++;
      if (g.result === "win") stat.wins++;
      openingMap.set(opening, stat);
    }
    const favoriteOpenings = Array.from(openingMap.entries())
      .map(([opening, s]) => ({ opening, games: s.games, winRate: Math.round((s.wins / s.games) * 100) }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 3);

    const phaseAccuracy = computePhaseAccuracy(games, SAMPLE_USERNAME);

    // All weaknesses for the count breakdown (cheap -- this account's
    // weakness table is small), separate from how many full detail
    // cards get shown below.
    const allWeaknesses = await db
      .select({ category: weaknessesTable.category, severity: weaknessesTable.severity, frequency: weaknessesTable.frequency })
      .from(weaknessesTable)
      .where(eq(weaknessesTable.username, SAMPLE_USERNAME));

    const severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 } as Record<string, number>;
    const categoryCounts = new Map<string, number>();
    for (const w of allWeaknesses) {
      severityCounts[w.severity] = (severityCounts[w.severity] ?? 0) + 1;
      categoryCounts.set(w.category, (categoryCounts.get(w.category) ?? 0) + 1);
    }
    const topWeaknessAreas = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const severityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const biggestOpportunity = [...allWeaknesses].sort((a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4) || b.frequency - a.frequency
    )[0]?.category ?? null;

    const weaknessRows = await db
      .select()
      .from(weaknessesTable)
      .where(eq(weaknessesTable.username, SAMPLE_USERNAME))
      .orderBy(desc(weaknessesTable.createdAt))
      .limit(8);

    // Same preview-FEN approach as the real /analysis/weaknesses route --
    // a real board position from partway through one of the actual
    // related games, not a placeholder.
    const firstGameIds = Array.from(new Set(
      weaknessRows.flatMap((w) => (w.relatedGameIds ?? []).slice(0, 1))
    ));
    const pgnById = new Map<number, string | null>();
    if (firstGameIds.length > 0) {
      const rows = await db.select({ id: gamesTable.id, pgn: gamesTable.pgn }).from(gamesTable).where(inArray(gamesTable.id, firstGameIds));
      for (const r of rows) pgnById.set(r.id, r.pgn);
    }
    function fenFromPgn(pgn: string | null): string | null {
      if (!pgn) return null;
      try {
        const Chess = require("chess.js").Chess;
        const c = new Chess();
        c.loadPgn(pgn);
        const history = c.history({ verbose: true });
        const mid = Math.min(Math.floor(history.length * 0.55), history.length);
        if (mid === 0) return null;
        const player = new Chess();
        for (let i = 0; i < mid; i++) player.move(history[i].san);
        return player.fen();
      } catch {
        return null;
      }
    }

    const weaknesses = weaknessRows.map((w) => {
      const firstId = (w.relatedGameIds ?? [])[0];
      return {
        category: w.category,
        severity: w.severity,
        description: w.description,
        frequency: w.frequency,
        examples: w.examples,
        previewFen: firstId != null ? fenFromPgn(pgnById.get(firstId) ?? null) : null,
      };
    });

    res.json({
      totalGames: games.length,
      wins, losses, draws,
      avgRating: ratedGames > 0 ? Math.round(totalRating / ratedGames) : null,
      biggestOpportunity,
      severityCounts,
      topWeaknessAreas,
      favoriteOpenings,
      phaseAccuracy,
      weaknesses,
    });
  } catch (err: any) {
    console.error("Demo sample report error:", err.message);
    res.status(500).json({ error: "Couldn't load the sample report right now." });
  }
});

export default router;
