import { Router, type IRouter, type Request, type Response } from "express";
import { fetchChessComGames, parsePgnMoves as parseChessComPgnMoves, extractOpeningFromPgn } from "../lib/chesscom";
import { fetchLichessGames } from "../lib/lichess";

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
      const stats = await res.json();
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
      const profile = await res.json();
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

export default router;
