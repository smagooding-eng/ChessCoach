import { Router, type IRouter, type Request, type Response } from "express";
import { db, gamesTable, usersTable } from "@workspace/db";
import { and, eq, desc, or, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();

interface Insight {
  headline: string;
  detail: string;
  severity: "high" | "medium" | "low";
  metric?: string;
}

function countPlies(pgn: string): number {
  if (!pgn) return 0;
  const movesText = pgn.split(/\n\n/).slice(-1)[0] || pgn;
  const cleaned = movesText.replace(/\{[^}]*\}/g, "").replace(/\([^)]*\)/g, "");
  const tokens = cleaned.split(/\s+/).filter((t) => {
    if (!t) return false;
    if (/^\d+\.{1,3}$/.test(t)) return false;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) return false;
    return /^[a-hKQRBNO]/.test(t);
  });
  return tokens.length;
}

function pct(num: number, denom: number): number {
  if (!denom) return 0;
  return Math.round((num / denom) * 100);
}

router.get("/onboarding/insights", requireAuth, async (req: Request, res: Response) => {
  try {
    const username = (req.query.username as string | undefined)?.toLowerCase();
    const platform = req.query.platform as string | undefined;
    if (!username) {
      res.status(400).json({ error: "username required" });
      return;
    }

    // Authorization: requested username must be one of the authenticated user's linked handles
    const [user] = await db
      .select({
        chesscomUsername: usersTable.chesscomUsername,
        lichessUsername: usersTable.lichessUsername,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id))
      .limit(1);
    const ownedHandles = [user?.chesscomUsername, user?.lichessUsername]
      .filter((h): h is string => !!h)
      .map((h) => h.toLowerCase());
    if (!ownedHandles.includes(username)) {
      // First-time import: claim this handle for the user, unless another account already owns it.
      const [otherOwner] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          or(
            eq(sql`lower(${usersTable.chesscomUsername})`, username),
            eq(sql`lower(${usersTable.lichessUsername})`, username),
          ),
        )
        .limit(1);
      if (otherOwner && otherOwner.id !== req.user!.id) {
        res.status(403).json({ error: "Username is linked to a different account" });
        return;
      }
      const updates =
        platform === "lichess"
          ? { lichessUsername: username }
          : { chesscomUsername: username };
      await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.id));
    }

    const conditions = [eq(gamesTable.username, username)];
    if (platform === "chesscom" || platform === "lichess") {
      conditions.push(eq(gamesTable.platform, platform));
    }

    const games = await db
      .select()
      .from(gamesTable)
      .where(and(...conditions))
      .orderBy(desc(gamesTable.playedAt))
      .limit(500);

    if (games.length === 0) {
      res.json({
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        insights: [
          {
            headline: "No games yet",
            detail: "Import your games to see personalized insights.",
            severity: "low",
          },
        ],
      });
      return;
    }

    const wins = games.filter((g) => g.result === "win").length;
    const losses = games.filter((g) => g.result === "loss").length;
    const draws = games.filter((g) => g.result === "draw").length;

    const insights: Insight[] = [];

    // 1. Worst opening (lowest win rate, min 3 games as that color/opening)
    const openingStats = new Map<string, { games: number; wins: number; losses: number }>();
    for (const g of games) {
      if (!g.opening) continue;
      const key = g.opening;
      const cur = openingStats.get(key) ?? { games: 0, wins: 0, losses: 0 };
      cur.games++;
      if (g.result === "win") cur.wins++;
      else if (g.result === "loss") cur.losses++;
      openingStats.set(key, cur);
    }
    let worstOpening: { name: string; lossRate: number; games: number } | null = null;
    for (const [name, s] of openingStats) {
      if (s.games < 3) continue;
      const lossRate = pct(s.losses, s.games);
      if (lossRate >= 50 && (!worstOpening || lossRate > worstOpening.lossRate)) {
        worstOpening = { name, lossRate, games: s.games };
      }
    }
    if (worstOpening) {
      insights.push({
        headline: `You lose ${worstOpening.lossRate}% of games in the ${worstOpening.name}`,
        detail: `Across ${worstOpening.games} games — your weakest opening by far.`,
        severity: "high",
        metric: `${worstOpening.lossRate}%`,
      });
    }

    // 2. Quick losses (under 25 plies = 12 full moves)
    const lossGames = games.filter((g) => g.result === "loss");
    if (lossGames.length >= 4) {
      const quickLosses = lossGames.filter((g) => countPlies(g.pgn) > 0 && countPlies(g.pgn) <= 25).length;
      const quickRate = pct(quickLosses, lossGames.length);
      if (quickRate >= 20) {
        insights.push({
          headline: `${quickRate}% of your losses end in under 12 moves`,
          detail: `That's an opening or early-middlegame blunder pattern showing up game after game.`,
          severity: "high",
          metric: `${quickRate}%`,
        });
      }
    }

    // 3. Long endgame losses (over 60 plies = 30+ full moves)
    if (lossGames.length >= 4) {
      const longGames = games.filter((g) => countPlies(g.pgn) >= 60);
      const longLosses = longGames.filter((g) => g.result === "loss").length;
      const longRate = pct(longLosses, longGames.length);
      if (longGames.length >= 5 && longRate >= 50) {
        insights.push({
          headline: `You lose ${longRate}% of your endgames`,
          detail: `Long games (30+ moves) are slipping away — endgame technique is costing you points.`,
          severity: "medium",
          metric: `${longRate}%`,
        });
      }
    }

    // 4. Color weakness — sharper of the two if asymmetric
    const whiteGames = games.filter((g) => g.whiteUsername?.toLowerCase() === username);
    const blackGames = games.filter((g) => g.blackUsername?.toLowerCase() === username);
    const whiteWinRate = pct(whiteGames.filter((g) => g.result === "win").length, whiteGames.length);
    const blackWinRate = pct(blackGames.filter((g) => g.result === "win").length, blackGames.length);
    if (whiteGames.length >= 5 && blackGames.length >= 5) {
      const diff = Math.abs(whiteWinRate - blackWinRate);
      if (diff >= 15) {
        const weakerColor = whiteWinRate < blackWinRate ? "white" : "black";
        const weakerRate = Math.min(whiteWinRate, blackWinRate);
        insights.push({
          headline: `You only win ${weakerRate}% of games as ${weakerColor}`,
          detail: `That's ${diff} points worse than your other color — you have a clear color preference.`,
          severity: "medium",
          metric: `${weakerRate}%`,
        });
      }
    }

    // Fallback insights if no patterns triggered
    if (insights.length === 0) {
      const overallLossRate = pct(losses, games.length);
      insights.push({
        headline: `You lose ${overallLossRate}% of your games`,
        detail: `We've imported ${games.length} games — let's dig into where you're leaking points.`,
        severity: "medium",
        metric: `${overallLossRate}%`,
      });
    }

    res.json({
      totalGames: games.length,
      wins,
      losses,
      draws,
      insights: insights.slice(0, 3),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to compute insights", detail: err?.message });
  }
});

export default router;
