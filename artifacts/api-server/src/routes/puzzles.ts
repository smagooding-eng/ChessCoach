import { Router, type IRouter, type Request, type Response } from "express";
import { db, puzzlesTable, puzzleAttemptsTable, gamesTable } from "@workspace/db";
import { eq, count, desc, sql, and, gte, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { Chess } from "chess.js";

const router: IRouter = Router();
const FREE_DAILY_LIMIT = 5;

// Maps a weakness category / theme group to the actual Lichess theme tags
// to match against. Mirrors the grouping used when curating the imported
// puzzle set, so "targeted" puzzles genuinely correspond to what's in the
// database. Matched via ILIKE substring against the comma-separated themes
// column, so e.g. "endgame" alone also correctly catches rookEndgame,
// pawnEndgame, bishopEndgame, etc. (they all contain that substring).
const THEME_GROUP_KEYWORDS: Record<string, string[]> = {
  opening: ["opening"],
  endgame: ["endgame"],
  tactics: [
    "fork", "pin", "skewer", "discoveredAttack", "discoveredCheck", "doubleCheck",
    "deflection", "attraction", "sacrifice", "hangingPiece", "trappedPiece",
    "xRayAttack", "zwischenzug", "intermezzo", "clearance", "interference",
    "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5", "backRankMate",
    "smotheredMate",
  ],
  positional: [
    "middlegame", "advantage", "positionalSacrifice", "quietMove",
    "defensiveMove", "exposedKing", "kingsideAttack", "queensideAttack", "advancedPawn",
  ],
};

// Maps the weakness category labels used elsewhere in the app (Analysis
// page, opponent scouting) to a theme group above.
const WEAKNESS_CATEGORY_TO_GROUP: Record<string, string> = {
  "opening preparation": "opening",
  "endgame technique": "endgame",
  "tactical awareness": "tactics",
  "positional play": "positional",
  "defensive play": "positional",
};

function themeGroupCondition(group: string) {
  const keywords = THEME_GROUP_KEYWORDS[group];
  if (!keywords) return null;
  const conditions = keywords.map((kw) => sql`${puzzlesTable.themes} ILIKE ${"%" + kw + "%"}`);
  return sql`(${sql.join(conditions, sql` OR `)})`;
}

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
    const { hasFullAccess } = await import("../lib/accessControl");
    const { full: premium } = await hasFullAccess(userId);

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

    // Optional weakness-targeted mode: ?theme=opening|endgame|tactics|positional
    // or ?weakness=Opening%20Preparation (matches the category labels used
    // on the Analysis page directly).
    const themeParam = typeof req.query.theme === "string" ? req.query.theme : null;
    const weaknessParam = typeof req.query.weakness === "string" ? req.query.weakness.toLowerCase() : null;
    const targetGroup = themeParam && THEME_GROUP_KEYWORDS[themeParam]
      ? themeParam
      : weaknessParam && WEAKNESS_CATEGORY_TO_GROUP[weaknessParam]
        ? WEAKNESS_CATEGORY_TO_GROUP[weaknessParam]
        : null;
    const themeCondition = targetGroup ? themeGroupCondition(targetGroup) : null;

    // Optional exact puzzle-type filter: ?puzzleTheme=mateIn2 (or fork, pin,
    // etc). Distinct from the broad ?theme= groups above -- this matches a
    // single specific Lichess theme tag exactly, for the "Puzzle Type"
    // picker on the Puzzles page (e.g. Mate in 1/2/3).
    const puzzleThemeParam = typeof req.query.puzzleTheme === "string" ? req.query.puzzleTheme : null;
    const exactThemeCondition = puzzleThemeParam
      ? sql`${puzzlesTable.themes} ILIKE ${"%" + puzzleThemeParam + "%"}`
      : null;

    let puzzle;
    if (allExcluded.length > 0) {
      const result = await db
        .select()
        .from(puzzlesTable)
        .where(and(
          eq(puzzlesTable.archived, false),
          sql`${puzzlesTable.id} NOT IN (${sql.join(allExcluded.map(id => sql`${id}`), sql`, `)})`,
          ...(themeCondition ? [themeCondition] : []),
          ...(exactThemeCondition ? [exactThemeCondition] : []),
        ))
        .orderBy(sql`RANDOM()`)
        .limit(1);
      puzzle = result[0];
    } else {
      // Nothing to exclude yet (brand new user) — any non-archived puzzle
      // is fair game.
      const result = await db
        .select()
        .from(puzzlesTable)
        .where(and(
          eq(puzzlesTable.archived, false),
          ...(themeCondition ? [themeCondition] : []),
          ...(exactThemeCondition ? [exactThemeCondition] : []),
        ))
        .orderBy(sql`RANDOM()`)
        .limit(1);
      puzzle = result[0];
    }

    if (!puzzle) {
      // Themed requests fall back to the general pool rather than hitting
      // Lichess's live API for a specific theme (which would need its own
      // query support) — better to serve something than nothing.
      const fetched = await fetchAndStoreLichessPuzzle(allExcluded);
      if (fetched) puzzle = fetched;
    }

    if (!puzzle) {
      res.status(404).json({ error: "No puzzles available" });
      return;
    }

    // IMPORTANT: this puzzle data follows the standard Lichess export
    // format, where the FIRST move in `moves` is the historical blunder
    // move that was actually played in-game (not something to "solve") --
    // the real puzzle begins at the second move. We auto-apply that first
    // move server-side and serve the resulting position + the remaining
    // moves as "the puzzle", so the side shown as "to move" is always the
    // side that actually finds the tactic / delivers the mate, matching
    // what a player expects and what filters like "Mate in 2" imply.
    let solverFen: string;
    let solverMoves: string;
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
      solverFen = validationChess.fen();
      solverMoves = puzzle.moves.split(" ").slice(1).join(" ");
      if (!solverMoves) {
        // Nothing left to solve after stripping the setup move -- skip.
        req.log.warn({ puzzleId: puzzle.id }, "Skipping puzzle - no solver moves after setup move");
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
        fen: solverFen,
        moves: solverMoves,
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
    const { hasFullAccess } = await import("../lib/accessControl");
    const { full: premium } = await hasFullAccess(userId);

    res.json({
      total,
      solved,
      failed: total - solved,
      accuracy: total > 0 ? Math.round((solved / total) * 100) : 0,
      streak,
      todayCount,
      dailyLimit: premium ? null : FREE_DAILY_LIMIT,
      used: todayCount,
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
    const primaryUsername = user?.chesscomUsername || user?.lichessUsername;

    if (!primaryUsername) {
      res.json({ puzzles: [] });
      return;
    }

    const userGames = await db
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(eq(gamesTable.username, primaryUsername.toLowerCase()))
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

    // Same fix as /puzzles/next: strip the historical setup move so the
    // fen shown and moves returned always start from the actual solver's
    // turn, not the opponent's blunder move.
    let solverFen = puzzle.fen;
    let solverMoves = puzzle.moves;
    try {
      const validationChess = new Chess(puzzle.fen);
      const rawMoves = puzzle.moves.split(" ");
      const firstMove = rawMoves[0];
      const from = firstMove.slice(0, 2);
      const to = firstMove.slice(2, 4);
      const promo = firstMove.length > 4 ? firstMove[4] : undefined;
      const result = validationChess.move({ from, to, promotion: promo });
      if (result && rawMoves.length > 1) {
        solverFen = validationChess.fen();
        solverMoves = rawMoves.slice(1).join(" ");
      }
    } catch {
      // Fall back to raw fen/moves if the setup move can't be applied for
      // any reason -- better to serve something than a 500 here.
    }

    res.json({
      id: puzzle.id,
      fen: solverFen,
      moves: solverMoves,
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

    // Matches what /puzzles/next now serves: the stored `moves` still
    // includes the historical setup move at index 0, so it must be
    // stripped here too, or move indices would be off by one relative to
    // what the client is tracking.
    const solutionMoves = puzzle.moves.split(" ").slice(1);
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
      await db.insert(puzzleAttemptsTable)
        .values({ userId: req.user!.id, puzzleId, solved: true, timeMs: timeMs ?? null })
        .onConflictDoUpdate({
          target: [puzzleAttemptsTable.userId, puzzleAttemptsTable.puzzleId],
          set: { solved: true, timeMs: timeMs ?? null, attemptedAt: new Date() },
        });
    } else if (!isCorrect) {
      // Record the struggle even without a solve, so this puzzle isn't
      // served back indefinitely — but never downgrade an already-solved
      // puzzle back to unsolved if the user is just replaying it.
      await db.insert(puzzleAttemptsTable)
        .values({ userId: req.user!.id, puzzleId, solved: false, timeMs: timeMs ?? null })
        .onConflictDoNothing();
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
    const { checkUsageLimit } = await import("../lib/accessControl");
    const limitCheck = await checkUsageLimit(userId, "puzzles");
    if (!limitCheck.allowed) {
      res.status(403).json({
        error: "usage_limit",
        message: `Free plan includes ${limitCheck.limit} game-derived puzzles. Upgrade to Pro for unlimited puzzles!`,
        used: limitCheck.used,
        limit: limitCheck.limit,
      });
      return;
    }

    const { storage } = await import("../lib/storage");
    const user = await storage.getUser(userId);
    const primaryUsername = user?.chesscomUsername || user?.lichessUsername;
    if (!primaryUsername) {
      res.status(400).json({ error: "Link a Chess.com or Lichess username to your account first." });
      return;
    }

    const reviewedGames = await db
      .select()
      .from(gamesTable)
      .where(and(
        eq(gamesTable.username, primaryUsername.toLowerCase()),
        eq(gamesTable.analyzed, true),
        sql`${gamesTable.reviewData} IS NOT NULL`,
      ))
      .orderBy(desc(gamesTable.playedAt))
      .limit(20);

    let generated = 0;

    interface ReviewMove {
      color?: string;
      classification?: string;
      betterMove?: string;
      fen?: string;
      moveNumber?: number;
    }
    interface ReviewData { moves?: ReviewMove[] }

    for (const game of reviewedGames) {
      const rd = game.reviewData as ReviewData | ReviewMove[] | null;
      const moves: ReviewMove[] | undefined = Array.isArray(rd) ? rd : rd?.moves;
      if (!moves || moves.length === 0) continue;

      const playerColor = game.whiteUsername?.toLowerCase() === primaryUsername.toLowerCase() ? "white" : "black";
      const colorChar = playerColor === "white" ? "w" : "b";

      type FullMove = ReviewMove & { betterMove: string; fen: string };
      const candidateMoves: FullMove[] = moves.filter((m): m is FullMove =>
        (m.color === colorChar || m.color === playerColor) &&
        ["blunder", "mistake"].includes(m.classification ?? "") &&
        typeof m.betterMove === "string" && m.betterMove.length > 0 &&
        typeof m.fen === "string" && m.fen.length > 0,
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
        type Candidate = { fen: string; solutionUci: string[]; _src: ReviewMove };
        const result = await verifyWithRetry<Candidate>(async (attempt) => {
          const candidate = attempt === 0 ? move : candidateMoves[mi + attempt];
          if (!candidate || !candidate.betterMove || !candidate.fen) return null;
          return {
            fen: candidate.fen,
            solutionUci: String(candidate.betterMove).trim().split(/\s+/),
            _src: candidate,
          };
        }, { attempts: 3, claims: { themes: [move.classification ?? "blunder"] } });

        if (!result) {
          req.log.debug({ gameId: game.id, fen: move.fen }, "All retries exhausted for game-puzzle candidate");
          continue;
        }

        const verdict = result.verdict;
        const src: ReviewMove = result.candidate._src ?? move;
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

// NOTE: lichess.org/api/puzzle/daily returns Lichess's single "Puzzle of the
// Day" — identical for every visitor to lichess.org until the next calendar
// day. Using it here as a per-request "give me a new puzzle" fallback meant
// this app could only ever gain ~1 new puzzle system-wide per day, and once
// a user had solved it, they'd cycle back to the same handful of daily
// puzzles collected across days. puzzle/next is Lichess's actual "serve a
// puzzle for training" endpoint and should return varied puzzles per call —
// worth confirming this behaves as expected once deployed (I can't make
// outbound network calls to verify from this environment). If Lichess ever
// changes or rate-limits this, the real fix is a one-time bulk import from
// Lichess's public puzzle database (database.lichess.org/#puzzles, several
// million puzzles as a CSV) rather than fetching one at a time at runtime.
async function fetchAndStoreLichessPuzzle(excludeIds: number[] = []) {
  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch("https://lichess.org/api/puzzle/next", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        if (res.status === 429) await new Promise(r => setTimeout(r, 300 + attempt * 200));
        continue;
      }
      const data: any = await res.json();

      if (!data.puzzle?.fen || !data.puzzle?.solution?.length) continue;

      const fen = data.puzzle.fen;
      const solutionUci = data.puzzle.solution.join(" ");

      const validationChess = new Chess(fen);
      const firstMove = data.puzzle.solution[0];
      const testResult = validationChess.move({
        from: firstMove.slice(0, 2),
        to: firstMove.slice(2, 4),
        promotion: firstMove.length > 4 ? firstMove[4] : undefined,
      });
      if (!testResult) continue;

      const [existing] = await db
        .select()
        .from(puzzlesTable)
        .where(eq(puzzlesTable.lichessId, data.puzzle.id))
        .limit(1);

      if (existing) {
        if (excludeIds.includes(existing.id)) continue; // already attempted — try again
        return existing;
      }

      const { verifyPuzzle } = await import("../lib/puzzleVerifier");
      const verdict = await verifyPuzzle(fen, data.puzzle.solution, {
        claims: { themes: Array.isArray(data.puzzle.themes) ? data.puzzle.themes : [] },
      });
      if (!verdict.ok) continue;

      const [inserted] = await db.insert(puzzlesTable).values({
        lichessId: data.puzzle.id,
        fen,
        moves: solutionUci,
        rating: data.puzzle.rating,
        themes: data.puzzle.themes.join(","),
        source: "lichess",
      }).onConflictDoNothing().returning();

      if (inserted) return inserted;

      // Lost a race with a concurrent request that inserted the same
      // puzzle first — just return their row instead of erroring out.
      const [raceWinner] = await db
        .select()
        .from(puzzlesTable)
        .where(eq(puzzlesTable.lichessId, data.puzzle.id))
        .limit(1);
      if (raceWinner && !excludeIds.includes(raceWinner.id)) return raceWinner;
      continue;
    } catch {
      continue;
    }
  }
  return null;
}

export default router;
