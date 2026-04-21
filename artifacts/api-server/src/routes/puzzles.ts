import { Router, type IRouter, type Request, type Response } from "express";
import { db, puzzlesTable, puzzleAttemptsTable, gamesTable } from "@workspace/db";
import { eq, count, desc, sql, and, gte, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { Chess } from "chess.js";

const router: IRouter = Router();
const FREE_DAILY_LIMIT = 5;

async function checkPremiumStatus(userId: string): Promise<boolean> {
  try {
    const { storage } = await import("../lib/storage");
    const user = await storage.getUser(userId);
    if (!user) return false;

    const adminEmails = ["smagooding@gmail.com", "goodingsls@live.com"];
    if (user.isAdmin || adminEmails.includes(user.email?.toLowerCase() ?? "")) return true;

    if (user.stripeCustomerId) {
      let sub: any = null;
      try {
        sub = await storage.getSubscriptionByCustomerId(user.stripeCustomerId);
      } catch {
        const { getUncachableStripeClient } = await import("../lib/stripeClient");
        const stripe = await getUncachableStripeClient();
        const subs = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 1 });
        if (subs.data.length > 0) sub = subs.data[0];
      }
      if (sub && ["active", "trialing"].includes(sub.status)) return true;
    }

    if (user.createdAt) {
      const elapsed = Date.now() - new Date(user.createdAt).getTime();
      if (elapsed < 3 * 86400000) return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function getTodayAttemptCount(userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [result] = await db
    .select({ count: count() })
    .from(puzzleAttemptsTable)
    .where(and(
      eq(puzzleAttemptsTable.userId, userId),
      gte(puzzleAttemptsTable.attemptedAt, todayStart),
    ));
  return result?.count ?? 0;
}

router.get("/puzzles/next", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const premium = await checkPremiumStatus(userId);

    const todayCount = await getTodayAttemptCount(userId);
    if (!premium && todayCount >= FREE_DAILY_LIMIT) {
      res.status(403).json({
        error: "daily_limit",
        message: `Free users can solve ${FREE_DAILY_LIMIT} puzzles per day. Upgrade to Pro for unlimited puzzles!`,
        used: todayCount,
        limit: FREE_DAILY_LIMIT,
      });
      return;
    }

    const attempted = await db
      .select({ puzzleId: puzzleAttemptsTable.puzzleId })
      .from(puzzleAttemptsTable)
      .where(eq(puzzleAttemptsTable.userId, userId));

    const attemptedIds = attempted.map(a => a.puzzleId);

    const excludeParam = typeof req.query.exclude === "string" ? req.query.exclude : "";
    const sessionExclude = excludeParam
      .split(",")
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n));

    const allExcluded = [...new Set([...attemptedIds, ...sessionExclude])];

    let puzzle;
    if (allExcluded.length > 0) {
      const result = await db
        .select()
        .from(puzzlesTable)
        .where(and(
          eq(puzzlesTable.archived, false),
          sql`${puzzlesTable.id} NOT IN (${sql.join(allExcluded.map(id => sql`${id}`), sql`, `)})`,
        ))
        .orderBy(sql`RANDOM()`)
        .limit(1);
      puzzle = result[0];
    }

    if (!puzzle) {
      const result = await db
        .select()
        .from(puzzlesTable)
        .where(eq(puzzlesTable.archived, false))
        .orderBy(sql`RANDOM()`)
        .limit(1);
      puzzle = result[0];
    }

    if (!puzzle) {
      const fetched = await fetchAndStoreLichessPuzzle();
      if (fetched) puzzle = fetched;
    }

    if (!puzzle) {
      res.status(404).json({ error: "No puzzles available" });
      return;
    }

    try {
      const validationChess = new Chess(puzzle.fen);
      const firstMove = puzzle.moves.split(" ")[0];
      const from = firstMove.slice(0, 2);
      const to = firstMove.slice(2, 4);
      const promo = firstMove.length > 4 ? firstMove[4] : undefined;
      const result = validationChess.move({ from, to, promotion: promo });
      if (!result) {
        req.log.warn({ puzzleId: puzzle.id }, "Skipping invalid puzzle - first move illegal");
        await db.delete(puzzlesTable).where(eq(puzzlesTable.id, puzzle.id));
        res.redirect(307, `/api/puzzles/next${req.url.includes("?") ? "&" + req.url.split("?")[1] : ""}`);
        return;
      }
    } catch (e) {
      req.log.warn({ puzzleId: puzzle.id }, "Skipping invalid puzzle - validation error");
      await db.delete(puzzlesTable).where(eq(puzzlesTable.id, puzzle.id));
      res.redirect(307, `/api/puzzles/next${req.url.includes("?") ? "&" + req.url.split("?")[1] : ""}`);
      return;
    }

    res.json({
      puzzle: {
        id: puzzle.id,
        fen: puzzle.fen,
        moves: puzzle.moves,
        rating: puzzle.rating,
        themes: puzzle.themes?.split(",").filter(Boolean) ?? [],
        source: puzzle.source,
        lichessId: puzzle.lichessId,
        explanation: puzzle.explanation ?? null,
      },
      daily: {
        used: todayCount,
        limit: premium ? null : FREE_DAILY_LIMIT,
        premium,
      },
    });
  } catch (err: any) {
    req.log.error({ error: err.message }, "Failed to get next puzzle");
    res.status(500).json({ error: "Failed to get puzzle" });
  }
});

router.get("/puzzles/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const [totalResult] = await db
      .select({ count: count() })
      .from(puzzleAttemptsTable)
      .where(eq(puzzleAttemptsTable.userId, userId));

    const [solvedResult] = await db
      .select({ count: count() })
      .from(puzzleAttemptsTable)
      .where(and(
        eq(puzzleAttemptsTable.userId, userId),
        eq(puzzleAttemptsTable.solved, true),
      ));

    const todayCount = await getTodayAttemptCount(userId);

    const recent = await db
      .select({
        solved: puzzleAttemptsTable.solved,
        attemptedAt: puzzleAttemptsTable.attemptedAt,
      })
      .from(puzzleAttemptsTable)
      .where(eq(puzzleAttemptsTable.userId, userId))
      .orderBy(desc(puzzleAttemptsTable.attemptedAt))
      .limit(20);

    let streak = 0;
    for (const r of recent) {
      if (r.solved) streak++;
      else break;
    }

    const total = totalResult?.count ?? 0;
    const solved = solvedResult?.count ?? 0;
    const premium = await checkPremiumStatus(userId);

    res.json({
      total,
      solved,
      failed: total - solved,
      accuracy: total > 0 ? Math.round((solved / total) * 100) : 0,
      streak,
      todayCount,
      dailyLimit: premium ? null : FREE_DAILY_LIMIT,
      premium,
    });
  } catch {
    res.status(500).json({ error: "Failed to get puzzle stats" });
  }
});

router.get("/puzzles/my-puzzles", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { storage } = await import("../lib/storage");
    const user = await storage.getUser(userId);

    if (!user?.chesscomUsername) {
      res.json({ puzzles: [] });
      return;
    }

    const userGames = await db
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(eq(gamesTable.username, user.chesscomUsername))
      .limit(200);

    const userGameIds = userGames.map(g => g.id);

    if (userGameIds.length === 0) {
      res.json({ puzzles: [] });
      return;
    }

    const gamePuzzles = await db
      .select()
      .from(puzzlesTable)
      .where(and(
        eq(puzzlesTable.source, "game"),
        eq(puzzlesTable.archived, false),
        inArray(puzzlesTable.gameId, userGameIds),
      ))
      .orderBy(desc(puzzlesTable.createdAt))
      .limit(50);

    const attempted = await db
      .select({ puzzleId: puzzleAttemptsTable.puzzleId, solved: puzzleAttemptsTable.solved })
      .from(puzzleAttemptsTable)
      .where(eq(puzzleAttemptsTable.userId, userId));

    const attemptMap = new Map<number, boolean>();
    for (const a of attempted) attemptMap.set(a.puzzleId, a.solved);

    res.json({
      puzzles: gamePuzzles.map(p => ({
        id: p.id,
        fen: p.fen,
        rating: p.rating,
        themes: p.themes?.split(",").filter(Boolean) ?? [],
        gameId: p.gameId,
        moveNumber: p.moveNumber,
        attempted: attemptMap.has(p.id),
        solved: attemptMap.get(p.id) ?? false,
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to get game puzzles" });
  }
});

router.get("/puzzles/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const puzzleId = parseInt(req.params.id as string);
    if (isNaN(puzzleId)) {
      res.status(400).json({ error: "Invalid puzzle ID" });
      return;
    }

    const [puzzle] = await db
      .select()
      .from(puzzlesTable)
      .where(and(eq(puzzlesTable.id, puzzleId), eq(puzzlesTable.archived, false)))
      .limit(1);

    if (!puzzle) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }

    res.json({
      id: puzzle.id,
      fen: puzzle.fen,
      moves: puzzle.moves,
      rating: puzzle.rating,
      themes: puzzle.themes?.split(",").filter(Boolean) ?? [],
      source: puzzle.source,
    });
  } catch {
    res.status(500).json({ error: "Failed to get puzzle" });
  }
});

router.post("/puzzles/:id/solve", requireAuth, async (req: Request, res: Response) => {
  try {
    const puzzleId = parseInt(req.params.id as string);
    const { move, moveIndex, timeMs } = req.body;

    if (!move || typeof move !== "string") {
      res.status(400).json({ error: "move (UCI string) is required" });
      return;
    }

    const [puzzle] = await db
      .select()
      .from(puzzlesTable)
      .where(and(eq(puzzlesTable.id, puzzleId), eq(puzzlesTable.archived, false)))
      .limit(1);

    if (!puzzle) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }

    const solutionMoves = puzzle.moves.split(" ");
    const idx = typeof moveIndex === "number" ? moveIndex : 0;
    const expectedMove = solutionMoves[idx]?.toLowerCase();
    const playedMove = move.toLowerCase();

    const isCorrect = playedMove === expectedMove ||
      (playedMove.length === 4 && expectedMove?.startsWith(playedMove));

    const isLastMove = idx >= solutionMoves.length - 1 ||
      (idx + 1 < solutionMoves.length && idx + 2 >= solutionMoves.length);

    const puzzleSolved = isCorrect && (idx + 2 >= solutionMoves.length);

    let opponentMove: string | null = null;
    if (isCorrect && idx + 1 < solutionMoves.length && !puzzleSolved) {
      opponentMove = solutionMoves[idx + 1];
    }

    if (puzzleSolved) {
      await db.insert(puzzleAttemptsTable).values({
        userId: req.user!.id,
        puzzleId,
        solved: true,
        timeMs: timeMs ?? null,
      });
    }

    res.json({
      correct: isCorrect,
      solved: puzzleSolved,
      opponentMove,
      nextMoveIndex: isCorrect ? idx + 2 : idx,
      solution: (!isCorrect || puzzleSolved) ? solutionMoves : undefined,
    });
  } catch (err: any) {
    req.log.error({ error: err.message }, "Failed to solve puzzle");
    res.status(500).json({ error: "Failed to submit solution" });
  }
});

router.post("/puzzles/:id/explain", requireAuth, async (req: Request, res: Response) => {
  try {
    const puzzleId = parseInt(req.params.id as string);
    const [puzzle] = await db
      .select()
      .from(puzzlesTable)
      .where(and(eq(puzzlesTable.id, puzzleId), eq(puzzlesTable.archived, false)))
      .limit(1);

    if (!puzzle) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }

    if (puzzle.explanation) {
      res.json({ explanation: puzzle.explanation });
      return;
    }

    const { generatePuzzleExplanation } = await import("../lib/puzzleSeed");
    const explanation = await generatePuzzleExplanation(puzzle);
    if (explanation) {
      await db.update(puzzlesTable).set({ explanation }).where(eq(puzzlesTable.id, puzzleId));
    }
    res.json({ explanation: explanation ?? "" });
  } catch (err: any) {
    req.log.error({ error: err.message }, "Failed to generate puzzle explanation");
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});

router.post("/puzzles/generate-from-games", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { storage } = await import("../lib/storage");
    const user = await storage.getUser(userId);
    if (!user?.chesscomUsername) {
      res.status(400).json({ error: "No Chess.com username set" });
      return;
    }

    const reviewedGames = await db
      .select()
      .from(gamesTable)
      .where(and(
        eq(gamesTable.username, user.chesscomUsername),
        eq(gamesTable.analyzed, true),
        sql`${gamesTable.reviewData} IS NOT NULL`,
      ))
      .orderBy(desc(gamesTable.playedAt))
      .limit(20);

    let generated = 0;

    for (const game of reviewedGames) {
      const reviewData = game.reviewData as any;
      if (!reviewData?.moves) continue;

      const playerColor = game.whiteUsername?.toLowerCase() === user.chesscomUsername.toLowerCase() ? "white" : "black";
      const colorChar = playerColor === "white" ? "w" : "b";

      const candidateMoves = reviewData.moves.filter((m: any) =>
        (m.color === colorChar || m.color === playerColor) &&
        ["blunder", "mistake"].includes(m.classification) &&
        m.bestMove && m.fen,
      );

      const { verifyWithRetry } = await import("../lib/puzzleVerifier");
      for (let mi = 0; mi < candidateMoves.length; mi++) {
        const move = candidateMoves[mi];

        const existingPuzzle = await db
          .select({ id: puzzlesTable.id })
          .from(puzzlesTable)
          .where(and(
            eq(puzzlesTable.gameId, game.id),
            eq(puzzlesTable.fen, move.fen),
          ))
          .limit(1);

        if (existingPuzzle.length > 0) continue;

        // Retry-with-feedback: if first candidate move fails, try later
        // alternative moves from the same game as the puzzle source.
        const result = await verifyWithRetry(async (attempt) => {
          const candidate = attempt === 0 ? move : candidateMoves[mi + attempt];
          if (!candidate || !candidate.bestMove || !candidate.fen) return null;
          return {
            fen: candidate.fen,
            solutionUci: String(candidate.bestMove).trim().split(/\s+/),
            _src: candidate,
          };
        }, { attempts: 3, claims: { themes: [move.classification] } });

        if (!result) {
          req.log.debug({ gameId: game.id, fen: move.fen }, "All retries exhausted for game-puzzle candidate");
          continue;
        }

        const verdict = result.verdict;
        const src = (result.candidate as any)._src ?? move;
        const detected = verdict.detectedThemes.slice();
        const claimed = src.classification === "blunder" ? ["blunder"] : ["mistake"];
        const themesCsv = Array.from(new Set([...claimed, ...detected, "tactical"])).join(",");

        await db.insert(puzzlesTable).values({
          fen: result.candidate.fen,
          moves: result.candidate.solutionUci.join(" "),
          rating: game.whiteRating || game.blackRating || 1200,
          themes: themesCsv,
          source: "game",
          gameId: game.id,
          moveNumber: src.moveNumber ?? null,
        });
        generated++;
      }
    }

    res.json({ generated, message: `Generated ${generated} puzzles from your games` });
  } catch (err: any) {
    req.log.error({ error: err.message }, "Failed to generate game puzzles");
    res.status(500).json({ error: "Failed to generate puzzles" });
  }
});

router.get("/puzzles/quality", async (_req: Request, res: Response) => {
  try {
    const [totalRow] = await db.select({ c: count() }).from(puzzlesTable);
    const [archivedRow] = await db.select({ c: count() }).from(puzzlesTable).where(eq(puzzlesTable.archived, true));
    const total = totalRow?.c ?? 0;
    const archived = archivedRow?.c ?? 0;
    const valid = total - archived;
    const passRate = total > 0 ? valid / total : 1;

    // Rolling-window: last 200 puzzles by id (proxy for "fresh batch").
    const recent = await db
      .select({ id: puzzlesTable.id, archived: puzzlesTable.archived })
      .from(puzzlesTable)
      .orderBy(desc(puzzlesTable.id))
      .limit(200);
    const recentTotal = recent.length;
    const recentArchived = recent.filter(r => r.archived).length;
    const recentValid = recentTotal - recentArchived;
    const passRateRecent = recentTotal > 0 ? recentValid / recentTotal : 1;

    res.json({
      total,
      valid,
      archived,
      passRate,
      window: recentTotal,
      passRateRecent,
    });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

router.post("/admin/puzzles/cleanup-sweep", requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  try {
    const useEngine = req.body?.useEngine !== false;
    const limit = Math.min(parseInt(req.body?.limit ?? "500"), 5000);
    const { verifyPuzzle } = await import("../lib/puzzleVerifier");

    const all = await db
      .select()
      .from(puzzlesTable)
      .where(eq(puzzlesTable.archived, false))
      .limit(limit);

    const stats: Record<string, { total: number; passed: number; archived: number }> = {};
    let archivedCount = 0;
    for (const p of all) {
      const source = p.source ?? "unknown";
      stats[source] ??= { total: 0, passed: 0, archived: 0 };
      stats[source].total++;
      const verdict = await verifyPuzzle(p.fen, p.moves.split(" "), { useEngine, engineDepth: 12 });
      if (verdict.ok) {
        stats[source].passed++;
      } else {
        stats[source].archived++;
        archivedCount++;
        await db.update(puzzlesTable).set({ archived: true }).where(eq(puzzlesTable.id, p.id));
      }
    }

    res.json({ scanned: all.length, archived: archivedCount, byCategory: stats });
  } catch (err: any) {
    req.log.error({ error: err.message }, "puzzle cleanup sweep failed");
    res.status(500).json({ error: err.message });
  }
});

router.post("/puzzles/seed", requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  try {
    const { seedPuzzlesIfNeeded } = await import("../lib/puzzleSeed");
    seedPuzzlesIfNeeded(300).catch(err => console.error("[puzzles] Seed error:", err));
    res.json({ message: "Puzzle seeding started in background" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function fetchAndStoreLichessPuzzle() {
  try {
    const res = await fetch("https://lichess.org/api/puzzle/daily", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data: any = await res.json();

    if (!data.puzzle?.fen || !data.puzzle?.solution?.length) return null;

    const fen = data.puzzle.fen;
    const solutionUci = data.puzzle.solution.join(" ");

    const validationChess = new Chess(fen);
    const firstMove = data.puzzle.solution[0];
    const testResult = validationChess.move({
      from: firstMove.slice(0, 2),
      to: firstMove.slice(2, 4),
      promotion: firstMove.length > 4 ? firstMove[4] : undefined,
    });
    if (!testResult) return null;

    const { verifyPuzzle } = await import("../lib/puzzleVerifier");
    const verdict = await verifyPuzzle(fen, data.puzzle.solution, {
      claims: { themes: Array.isArray(data.puzzle.themes) ? data.puzzle.themes : [] },
    });
    if (!verdict.ok) return null;

    const [existing] = await db
      .select()
      .from(puzzlesTable)
      .where(eq(puzzlesTable.lichessId, data.puzzle.id))
      .limit(1);

    if (existing) return existing;

    const [inserted] = await db.insert(puzzlesTable).values({
      lichessId: data.puzzle.id,
      fen,
      moves: solutionUci,
      rating: data.puzzle.rating,
      themes: data.puzzle.themes.join(","),
      source: "lichess",
    }).returning();

    return inserted;
  } catch {
    return null;
  }
}

export default router;
