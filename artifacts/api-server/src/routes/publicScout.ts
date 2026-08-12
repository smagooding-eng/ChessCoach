import { Router, type IRouter, type Request, type Response } from "express";
import { fetchChessComGames } from "../lib/chesscom";
import { fetchLichessGames } from "../lib/lichess";
import { quickAnalyzeGames, type QuickWeakness } from "../lib/quickScout";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Simple in-memory per-IP rate limit. This is a single-instance limiter —
// on a multi-instance deploy each instance tracks its own counts, which is
// an acceptable tradeoff for a soft abuse guard on a public, unauthenticated
// endpoint (not a security boundary on its own).
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const hitLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (hitLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  hitLog.set(ip, hits);
  // Opportunistic cleanup so this map doesn't grow unbounded over time.
  if (hitLog.size > 5000) {
    for (const [key, times] of hitLog) {
      if (times.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) hitLog.delete(key);
    }
  }
  return hits.length > RATE_LIMIT_MAX;
}

function getIp(req: Request): string {
  return req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip || "unknown";
}

interface ScoutResult {
  username: string;
  weaknesses: QuickWeakness[];
  gamesChecked: number;
}

async function fetchRecentPgnsAndOpponent(
  username: string,
  platform: "chesscom" | "lichess",
): Promise<{ pgns: string[]; opponentUsername: string | null }> {
  if (platform === "chesscom") {
    const games = await fetchChessComGames(username, 1);
    const recent = games.slice(-5).reverse();
    const pgns = recent.map((g) => g.pgn).filter((p): p is string => !!p);
    const lower = username.toLowerCase();
    const mostRecent = recent[0];
    const opponentUsername = mostRecent
      ? (mostRecent.white.username.toLowerCase() === lower ? mostRecent.black.username : mostRecent.white.username)
      : null;
    return { pgns, opponentUsername };
  } else {
    const games = await fetchLichessGames(username, 1);
    const recent = games.slice(0, 5);
    const pgns = recent.map((g) => g.pgn).filter((p): p is string => !!p);
    const lower = username.toLowerCase();
    const mostRecent = recent[0];
    const whiteName = mostRecent?.players.white.user?.name;
    const blackName = mostRecent?.players.black.user?.name;
    const opponentUsername = mostRecent && whiteName && blackName
      ? (whiteName.toLowerCase() === lower ? blackName : whiteName)
      : null;
    return { pgns, opponentUsername };
  }
}

router.post("/public/quick-scout", async (req: Request, res: Response) => {
  const ip = getIp(req);
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many requests. Please try again in a bit." });
    return;
  }

  const { username, platform } = req.body as { username?: string; platform?: string };
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    res.status(400).json({ error: "Username is required" });
    return;
  }
  const normalizedPlatform: "chesscom" | "lichess" = platform === "lichess" ? "lichess" : "chesscom";

  try {
    const { pgns: userPgns, opponentUsername } = await fetchRecentPgnsAndOpponent(username.trim(), normalizedPlatform);
    if (userPgns.length === 0) {
      res.status(404).json({ error: "No recent games found for that username. Check the spelling or try the other platform." });
      return;
    }

    const opponentPgnsPromise = opponentUsername
      ? fetchRecentPgnsAndOpponent(opponentUsername, normalizedPlatform).then((r) => r.pgns).catch(() => [])
      : Promise.resolve<string[]>([]);

    const [userWeaknesses, opponentPgns] = await Promise.all([
      quickAnalyzeGames(userPgns, username.trim()),
      opponentPgnsPromise,
    ]);

    const opponentWeaknesses = opponentUsername && opponentPgns.length > 0
      ? await quickAnalyzeGames(opponentPgns, opponentUsername)
      : [];

    const result: { user: ScoutResult; opponent: ScoutResult | null } = {
      user: { username: username.trim(), weaknesses: userWeaknesses, gamesChecked: userPgns.length },
      opponent: opponentUsername
        ? { username: opponentUsername, weaknesses: opponentWeaknesses, gamesChecked: opponentPgns.length }
        : null,
    };

    res.json(result);
  } catch (err) {
    logger.warn({ err, username, platform: normalizedPlatform }, "Quick scout failed");
    res.status(502).json({ error: "Couldn't fetch games right now — the platform may be temporarily unavailable. Please try again." });
  }
});

export default router;
