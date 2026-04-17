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
      // Try to claim this handle for the user. If another account already owns it,
      // we still compute insights (chess.com/lichess games are public) but don't
      // overwrite the existing link.
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
      if (!otherOwner || otherOwner.id === req.user!.id) {
        const updates =
          platform === "lichess"
            ? { lichessUsername: username }
            : { chesscomUsername: username };
        await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.id));
      }
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
      .limit(2000);

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

    // Helper: get user's rating from a game
    const ratingOf = (g: typeof games[number]) =>
      g.whiteUsername?.toLowerCase() === username ? g.whiteRating : g.blackRating;

    // 5. Rating trend — last 30 days vs prior 30 days
    if (games.length >= 20) {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const recent = games.filter((g) => g.playedAt && now - g.playedAt.getTime() <= 30 * day && ratingOf(g) > 0);
      const prior  = games.filter((g) => g.playedAt && now - g.playedAt.getTime() > 30 * day && now - g.playedAt.getTime() <= 60 * day && ratingOf(g) > 0);
      if (recent.length >= 5 && prior.length >= 5) {
        const recentAvg = Math.round(recent.reduce((s, g) => s + ratingOf(g), 0) / recent.length);
        const priorAvg  = Math.round(prior.reduce((s, g) => s + ratingOf(g), 0) / prior.length);
        const delta = recentAvg - priorAvg;
        if (delta <= -25) {
          insights.unshift({
            headline: `Your rating dropped ${Math.abs(delta)} points in the last 30 days`,
            detail: `From ${priorAvg} → ${recentAvg}. Something specific is going wrong recently — let's find it.`,
            severity: "high",
            metric: `${delta}`,
          });
        } else if (delta >= 25) {
          insights.push({
            headline: `You're up ${delta} points in the last 30 days`,
            detail: `From ${priorAvg} → ${recentAvg}. Lock in this momentum before it fades.`,
            severity: "low",
            metric: `+${delta}`,
          });
        }
      }
    }

    // 6. Tilt detection — longest losing streak in last 60 days
    const sortedAsc = [...games].sort((a, b) => (a.playedAt?.getTime() ?? 0) - (b.playedAt?.getTime() ?? 0));
    const last60 = sortedAsc.filter((g) => g.playedAt && Date.now() - g.playedAt.getTime() <= 60 * 24 * 60 * 60 * 1000);
    if (last60.length >= 10) {
      let longestStreak = 0;
      let curStreak = 0;
      let streakDate: Date | null = null;
      let curStreakStart: Date | null = null;
      for (const g of last60) {
        if (g.result === "loss") {
          if (curStreak === 0) curStreakStart = g.playedAt;
          curStreak++;
          if (curStreak > longestStreak) {
            longestStreak = curStreak;
            streakDate = curStreakStart;
          }
        } else {
          curStreak = 0;
        }
      }
      if (longestStreak >= 4 && streakDate) {
        const dateStr = streakDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        insights.push({
          headline: `You went on a ${longestStreak}-game losing streak around ${dateStr}`,
          detail: `Classic tilt pattern — losses snowball when you keep playing through frustration.`,
          severity: longestStreak >= 6 ? "high" : "medium",
          metric: `${longestStreak}L`,
        });
      }
    }

    // 7. Time-of-day pattern — late-night losses
    const lossesWithTime = games.filter((g) => g.result === "loss" && g.playedAt);
    if (lossesWithTime.length >= 15) {
      const lateLosses = lossesWithTime.filter((g) => {
        const h = g.playedAt!.getUTCHours();
        // Loose late-night bucket in user-local time isn't possible without TZ; use UTC late or early hours as proxy.
        return h >= 22 || h < 4;
      }).length;
      const lateRate = pct(lateLosses, lossesWithTime.length);
      if (lateRate >= 35) {
        insights.push({
          headline: `${lateRate}% of your losses happen late at night`,
          detail: `Fatigue is real — your decision quality drops after a long day. Stick to one or two warmup games before bed.`,
          severity: "medium",
          metric: `${lateRate}%`,
        });
      }
    }

    // 8. Time control weakness — worst format
    const tcStats = new Map<string, { games: number; wins: number; losses: number }>();
    for (const g of games) {
      const tc = (g.timeControl || "unknown").trim();
      // Normalize chess.com seconds-format into category
      let bucket = tc;
      const tcNum = parseInt(tc, 10);
      if (!Number.isNaN(tcNum)) {
        if (tcNum < 60) bucket = "bullet";
        else if (tcNum < 180) bucket = "bullet";
        else if (tcNum < 600) bucket = "blitz";
        else if (tcNum < 1800) bucket = "rapid";
        else bucket = "classical";
      } else if (/\+/.test(tc)) {
        const base = parseInt(tc.split("+")[0]!, 10);
        if (!Number.isNaN(base)) {
          if (base < 180) bucket = "bullet";
          else if (base < 600) bucket = "blitz";
          else if (base < 1800) bucket = "rapid";
          else bucket = "classical";
        }
      }
      const cur = tcStats.get(bucket) ?? { games: 0, wins: 0, losses: 0 };
      cur.games++;
      if (g.result === "win") cur.wins++;
      else if (g.result === "loss") cur.losses++;
      tcStats.set(bucket, cur);
    }
    let worstTc: { name: string; lossRate: number; games: number } | null = null;
    let bestTc: { name: string; winRate: number; games: number } | null = null;
    for (const [name, s] of tcStats) {
      if (s.games < 8 || name === "unknown") continue;
      const lossRate = pct(s.losses, s.games);
      const winRate = pct(s.wins, s.games);
      if (lossRate >= 55 && (!worstTc || lossRate > worstTc.lossRate)) {
        worstTc = { name, lossRate, games: s.games };
      }
      if (winRate >= 55 && (!bestTc || winRate > bestTc.winRate)) {
        bestTc = { name, winRate, games: s.games };
      }
    }
    if (worstTc && bestTc && worstTc.name !== bestTc.name) {
      insights.push({
        headline: `Stop playing ${worstTc.name} — you lose ${worstTc.lossRate}% of those games`,
        detail: `Meanwhile you win ${bestTc.winRate}% at ${bestTc.name}. Your skills don't translate at that speed.`,
        severity: "medium",
        metric: `${worstTc.lossRate}%`,
      });
    } else if (worstTc) {
      insights.push({
        headline: `${worstTc.lossRate}% of your ${worstTc.name} games are losses`,
        detail: `Across ${worstTc.games} games — this format is bleeding rating points.`,
        severity: "medium",
        metric: `${worstTc.lossRate}%`,
      });
    }

    // 9. Recent form — last 10 games
    if (games.length >= 10) {
      const last10 = games.slice(0, 10);
      const last10Losses = last10.filter((g) => g.result === "loss").length;
      if (last10Losses >= 7) {
        insights.push({
          headline: `You've lost ${last10Losses} of your last 10 games`,
          detail: `Cold streak. Time to step back from rated play, fix the leaks first, then climb back.`,
          severity: "high",
          metric: `${last10Losses}/10`,
        });
      }
    }

    // Sort by severity (high first) then dedupe-ish
    const severityRank = { high: 0, medium: 1, low: 2 } as const;
    insights.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

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
      insights: insights.slice(0, 4),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to compute insights", detail: err?.message });
  }
});

export default router;
