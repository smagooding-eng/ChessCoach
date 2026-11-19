import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { refreshBasicReview, markBookMoves } from "../lib/basicCoach";
import { notifyUser } from "../lib/notify";
import { logger as appLogger } from "../lib/logger";
import { db, gamesTable, backgroundJobsTable, usersTable } from "@workspace/db";
import { requireAuth, requirePremium, isUserPremium } from "../middlewares/authMiddleware";
import { eq, desc, count, isNull, and, or, ilike, asc, sql, gte, inArray, getTableColumns } from "drizzle-orm";
import {
  ImportGamesBody,
  ImportGamesResponse,
  ListGamesResponse,
  GetGameResponse,
  GetGameReplayResponse,
  ListGamesQueryParams,
  GetGameParams,
  GetGameReplayParams,
} from "@workspace/api-zod";
import { fetchChessComGames, extractGameMetadata, parsePgnMoves, extractOpeningFromPgn, extractStartFen, fetchChessComArchiveList, fetchChessComGamesForArchive } from "../lib/chesscom";
import { fetchLichessGames, extractLichessGameMetadata } from "../lib/lichess";
import { analyzeMoves, analyzeSingleMove, reviewFullGame, analyzeGamePgn, fillCoachGaps, type MoveReview } from "../lib/openaiAnalysis";
import { randomUUID } from "crypto";
import type { Logger } from "pino";
import { trackAiUsage, AI_FEATURES } from "../lib/aiUsageTracker";
import { Chess } from "chess.js";
import { ownerNames, sideFromNames } from "../lib/ownerSide";
import { findSameGame, adoptIds, removeSameGameCopies } from "../lib/sameGame";

const router: IRouter = Router();

type ImportJobOptions = {
  userId: string;
  platformUsername: string;
  platform: "chesscom" | "lichess";
  months: number;
  forceUpdate: boolean;
  log: Logger;
};

// Imports for the same member and site run one after another: two at once (the app's sync
// on opening and a background one) both saw a new game as missing and saved it twice.
const importChains = new Map<string, Promise<unknown>>();
function runImportJob(opts: ImportJobOptions): Promise<{ imported: number; updated: number; total: number; error?: string }> {
  const key = `${opts.userId}:${opts.platform}`;
  const run = (importChains.get(key) ?? Promise.resolve()).catch(() => {}).then(() => runImportJobNow(opts));
  importChains.set(key, run);
  void run.finally(() => { if (importChains.get(key) === run) importChains.delete(key); }).catch(() => {});
  return run;
}
async function runImportJobNow(opts: ImportJobOptions): Promise<{ imported: number; updated: number; total: number; error?: string }> {
  const { userId, platformUsername, platform, months, forceUpdate, log } = opts;
  const storedUsername = platformUsername.toLowerCase();
  let imported = 0;
  let updated = 0;

  // Game import has no per-call cost (just fetching PGNs from
  // Chess.com/Lichess's own free APIs), so it's no longer rate-limited
  // at all -- remainingImportSlots stays permanently Infinity, meaning
  // the "if (imported >= remainingImportSlots) break" checks further
  // down never trigger. Left in place rather than removed, since
  // touching every one of those break conditions individually would be
  // a bigger, riskier diff for the same end result.
  const remainingImportSlots = Infinity;

  if (platform === "lichess") {
    let lichessGames;
    try {
      lichessGames = await fetchLichessGames(platformUsername, months);
    } catch (err) {
      log.error({ err }, "Failed to fetch games from Lichess");
      return { imported, updated, total: 0, error: "Failed to fetch games from Lichess. Check the username and try again." };
    }

    for (const game of lichessGames) {
      if (imported >= remainingImportSlots) break;
      try {
        if (!game.pgn) continue;
        const meta = extractLichessGameMetadata(game, platformUsername);

        if (meta.lichessGameId) {
          const existing = await db
            .select({ id: gamesTable.id, pgn: gamesTable.pgn })
            .from(gamesTable)
            .where(and(eq(gamesTable.lichessGameId, meta.lichessGameId), eq(gamesTable.userId, userId)))
            .limit(1);
          if (existing.length > 0) {
            if (forceUpdate && existing[0].pgn !== game.pgn) {
              await db.update(gamesTable).set({ pgn: game.pgn!, reviewData: null, ...meta }).where(eq(gamesTable.id, existing[0].id));
              updated++;
            }
            continue;
          }
        }
        // Saved by another route without its Lichess id (e.g. from ChessScout's board)?
        const same = await findSameGame(userId, { pgn: game.pgn!, white: meta.whiteUsername, black: meta.blackUsername, playedAt: meta.playedAt }).catch(() => null);
        if (same) { await adoptIds(same, { lichessGameId: meta.lichessGameId }); continue; }
        const [row] = await db.insert(gamesTable).values({ userId, username: storedUsername, ...meta, pgn: game.pgn! }).onConflictDoNothing().returning({ id: gamesTable.id });
        if (row) imported++;
      } catch (err) {
        log.warn({ err }, "Failed to insert Lichess game");
      }
    }
  } else {
    // Month by month, saving each before fetching the next: a full history can be tens
    // of thousands of games, and a failed month doesn't lose the others.
    let archives: string[];
    try {
      archives = (await fetchChessComArchiveList(platformUsername)).slice(-Math.max(1, months));
    } catch (err) {
      log.error({ err }, "Failed to fetch games from chess.com");
      return { imported, updated, total: 0, error: "Failed to fetch games from chess.com. Check the username and try again." };
    }

    for (const archiveUrl of archives) {
    const games = await fetchChessComGamesForArchive(archiveUrl);
    for (const game of games) {
      if (imported >= remainingImportSlots) break;
      try {
        if (!game.pgn) continue;
        const meta = extractGameMetadata(game, platformUsername);
        if (meta.chesscomGameId) {
          const existing = await db
            .select({ id: gamesTable.id, pgn: gamesTable.pgn })
            .from(gamesTable)
            .where(and(eq(gamesTable.chesscomGameId, meta.chesscomGameId), eq(gamesTable.userId, userId)))
            .limit(1);
          if (existing.length > 0) {
            if (forceUpdate && existing[0].pgn !== game.pgn) {
              await db.update(gamesTable).set({ pgn: game.pgn, reviewData: null, ...meta }).where(eq(gamesTable.id, existing[0].id));
              updated++;
            }
            continue;
          }
        }
        const same = await findSameGame(userId, { pgn: game.pgn, white: meta.whiteUsername, black: meta.blackUsername, playedAt: meta.playedAt }).catch(() => null);
        if (same) { await adoptIds(same, { chesscomGameId: meta.chesscomGameId }); continue; }
        const [row] = await db.insert(gamesTable).values({ userId, username: storedUsername, platform: "chesscom", ...meta, pgn: game.pgn }).onConflictDoNothing().returning({ id: gamesTable.id });
        if (row) imported++;
      } catch (err) {
        log.warn({ err }, "Failed to insert game");
      }
    }
    }
  }

  const [{ value: total }] = await db.select({ value: count() }).from(gamesTable).where(eq(gamesTable.userId, userId));
  return { imported, updated, total: Number(total) };
}

router.post("/games/import-bg", requireAuth, async (req, res): Promise<void> => {
  const parsed = ImportGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username: platformUsername, months = 3 } = parsed.data;
  const platform: string = req.body?.platform || "chesscom";
  const forceUpdate = req.body?.forceUpdate === true;
  const userId = req.user!.id;
  if (platform !== "chesscom" && platform !== "lichess") {
    res.status(400).json({ error: "platform must be 'chesscom' or 'lichess'" });
    return;
  }

  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId,
    userId,
    type: "import-games",
    status: "pending",
    targetUsername: `${platform}:${platformUsername.toLowerCase()}`,
  });

  res.json({ jobId, status: "pending" });

  (async () => {
    const log = req.log;
    log.info({ jobId, platformUsername, platform, months, userId }, "Background import started");
    try {
      const result = await runImportJob({ userId, platformUsername, platform: platform as "chesscom" | "lichess", months, forceUpdate, log });
      if (result.error) {
        await db.update(backgroundJobsTable).set({ status: "error", error: result.error }).where(eq(backgroundJobsTable.id, jobId));
      } else {
        await db.update(backgroundJobsTable).set({ status: "done", result: { ...result, platform, username: platformUsername } }).where(eq(backgroundJobsTable.id, jobId));
      }
    } catch (err: any) {
      log.error({ err, jobId }, "Background import failed");
      await db.update(backgroundJobsTable).set({ status: "error", error: err?.message || "Import failed" }).where(eq(backgroundJobsTable.id, jobId)).catch(() => {});
    }
  })().catch(() => {});
});

router.get("/games/import-status/:jobId", requireAuth, async (req, res): Promise<void> => {
  const [job] = await db.select().from(backgroundJobsTable).where(eq(backgroundJobsTable.id, req.params.jobId as string));
  if (!job || job.userId !== req.user!.id) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: job.status, error: job.error ?? null, result: job.result ?? null });
});

router.post("/games/import", requireAuth, async (req, res): Promise<void> => {
  const parsed = ImportGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username: platformUsername, months = 3 } = parsed.data;
  const forceUpdate = req.body?.forceUpdate === true;
  const platform: string = req.body?.platform || "chesscom";
  const userId = req.user!.id;
  const storedUsername = platformUsername.toLowerCase();

  // Game import is free, no cap -- see the matching comment on the
  // other occurrence of this pattern earlier in this file.
  const remainingImportSlots = Infinity;

  if (platform !== "chesscom" && platform !== "lichess") {
    res.status(400).json({ error: "platform must be 'chesscom' or 'lichess'" });
    return;
  }

  req.log.info({ platformUsername, userId, months, forceUpdate, platform }, `Importing games from ${platform}`);

  let imported = 0;
  let updated = 0;

  if (platform === "lichess") {
    let lichessGames;
    try {
      lichessGames = await fetchLichessGames(platformUsername, months);
    } catch (err) {
      req.log.error({ err }, "Failed to fetch games from Lichess");
      res.status(400).json({ error: "Failed to fetch games from Lichess. Check the username and try again." });
      return;
    }

    for (const game of lichessGames) {
      if (imported >= remainingImportSlots) break;
      try {
        if (!game.pgn) continue;
        const meta = extractLichessGameMetadata(game, platformUsername);

        if (meta.lichessGameId) {
          const existing = await db
            .select({ id: gamesTable.id, pgn: gamesTable.pgn })
            .from(gamesTable)
            .where(and(
              eq(gamesTable.lichessGameId, meta.lichessGameId),
              eq(gamesTable.userId, userId)
            ))
            .limit(1);

          if (existing.length > 0) {
            if (forceUpdate && existing[0].pgn !== game.pgn) {
              await db.update(gamesTable)
                .set({ pgn: game.pgn!, reviewData: null, ...meta })
                .where(eq(gamesTable.id, existing[0].id));
              updated++;
            }
            continue;
          }
        }

        const [row] = await db.insert(gamesTable).values({
          userId,
          username: storedUsername,
          pgn: game.pgn!,
          ...meta,
        }).onConflictDoNothing().returning({ id: gamesTable.id });
        if (row) imported++;
      } catch (err) {
        req.log.warn({ err }, "Failed to insert Lichess game");
      }
    }
  } else {
    let games;
    try {
      games = await fetchChessComGames(platformUsername, months);
    } catch (err) {
      req.log.error({ err }, "Failed to fetch games from chess.com");
      res.status(400).json({ error: "Failed to fetch games from chess.com. Check the username and try again." });
      return;
    }

    for (const game of games) {
      if (imported >= remainingImportSlots) break;
      try {
        const meta = extractGameMetadata(game, platformUsername);

        if (meta.chesscomGameId) {
          const existing = await db
            .select({ id: gamesTable.id, pgn: gamesTable.pgn })
            .from(gamesTable)
            .where(and(
              eq(gamesTable.chesscomGameId, meta.chesscomGameId),
              eq(gamesTable.userId, userId)
            ))
            .limit(1);

          if (existing.length > 0) {
            if (forceUpdate && existing[0].pgn !== game.pgn) {
              await db.update(gamesTable)
                .set({ pgn: game.pgn, reviewData: null, ...meta })
                .where(eq(gamesTable.id, existing[0].id));
              updated++;
            }
            continue;
          }
        }

        const [row] = await db.insert(gamesTable).values({
          userId,
          username: storedUsername,
          pgn: game.pgn,
          platform: "chesscom",
          ...meta,
        }).onConflictDoNothing().returning({ id: gamesTable.id });
        if (row) imported++;
      } catch (err) {
        req.log.warn({ err }, "Failed to insert game");
      }
    }
  }

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(gamesTable)
    .where(eq(gamesTable.userId, userId));

  res.json({
    imported,
    updated,
    total: Number(total),
    username: platformUsername,
    platform,
  });
});

router.get("/games/elo-progress", async (req, res): Promise<void> => {
  const rawUsername = req.query.username;
  const platformFilter = req.query.platform as string | undefined;
  if (!rawUsername || typeof rawUsername !== "string") {
    res.status(400).json({ error: "username is required" });
    return;
  }
  const username = rawUsername.toLowerCase();

  try {
    const candidates = await db
      .select({
        createdAt: usersTable.createdAt,
        chesscomUsername: usersTable.chesscomUsername,
        lichessUsername: usersTable.lichessUsername,
      })
      .from(usersTable)
      .where(sql`lower(${usersTable.chesscomUsername}) = ${username} OR lower(${usersTable.lichessUsername}) = ${username}`);

    const user = candidates.find(u => u.chesscomUsername && u.lichessUsername) ?? candidates[0];

    const signupDate = user?.createdAt ?? null;
    const chesscomUser = user?.chesscomUsername?.toLowerCase() ?? null;
    const lichessUser = user?.lichessUsername?.toLowerCase() ?? null;

    const ownerNames = Array.from(new Set([chesscomUser, lichessUser, username].filter(Boolean) as string[]));
    const conditions = [inArray(gamesTable.username, ownerNames)];
    if (platformFilter && (platformFilter === "chesscom" || platformFilter === "lichess" || platformFilter === "chessscout")) {
      conditions.push(eq(gamesTable.platform, platformFilter));
    } else {
      // Games against bots don't belong in a rating history.
      conditions.push(sql`${gamesTable.platform} <> 'bot'`);
    }

    const allRatings = await db
      .select({
        playedAt: gamesTable.playedAt,
        whiteUsername: gamesTable.whiteUsername,
        whiteRating: gamesTable.whiteRating,
        blackRating: gamesTable.blackRating,
        platform: gamesTable.platform,
      })
      .from(gamesTable)
      .where(and(...conditions))
      .orderBy(asc(gamesTable.playedAt));

    if (allRatings.length === 0) {
      res.json({ hasData: false });
      return;
    }

    const playerNames = new Set<string>();
    if (chesscomUser) playerNames.add(chesscomUser);
    if (lichessUser) playerNames.add(lichessUser);
    playerNames.add(username);

    const getRating = (g: typeof allRatings[0]) => {
      const wu = g.whiteUsername.toLowerCase();
      if (playerNames.has(wu)) return g.whiteRating;
      return g.blackRating;
    };

    const firstRating = getRating(allRatings[0]);
    const currentRating = getRating(allRatings[allRatings.length - 1]);
    const delta = currentRating - firstRating;

    const totalGames = allRatings.length;
    const sampleSize = Math.min(totalGames, 30);
    const step = Math.max(1, Math.floor(totalGames / sampleSize));
    const sparkline: number[] = [];
    for (let i = 0; i < totalGames; i += step) {
      sparkline.push(getRating(allRatings[i]));
    }
    if (sparkline[sparkline.length - 1] !== currentRating) {
      sparkline.push(currentRating);
    }

    const peak = Math.max(...sparkline);
    const low = Math.min(...sparkline);

    res.json({
      hasData: true,
      firstRating,
      currentRating,
      delta,
      peak,
      low,
      sparkline,
      totalGames,
      signedUpAt: signupDate?.toISOString() ?? null,
      firstGameAt: allRatings[0].playedAt.toISOString(),
      lastGameAt: allRatings[allRatings.length - 1].playedAt.toISOString(),
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to fetch ELO progress");
    res.status(500).json({ error: "Failed to fetch ELO progress" });
  }
});

router.get("/games", requireAuth, async (req, res): Promise<void> => {
  const query = ListGamesQueryParams.safeParse(req.query);
  let limit = query.success ? (query.data.limit ?? 50) : 50;
  let offset = query.success ? (query.data.offset ?? 0) : 0;
  const platform = query.success ? query.data.platform : undefined;
  const opponent = query.success ? query.data.opponent?.trim() : undefined;

  // No view cap: listing stored games has no per-call cost (it's a plain
  // database read), so free users see everything they've imported. This
  // used to clamp free accounts to their latest 20 games, which quietly
  // undid the point of making import free. The response keeps its
  // isViewLimited/viewLimit fields (always false/null now) so existing
  // frontend code that reads them keeps working unchanged.

  const conditions = [eq(gamesTable.userId, req.user!.id)];
  // source (Games tab): chessscout | chesscom | lichess | bots | all.
  // Read straight from the query since it isn't in the generated schema.
  // Without one, games against bots stay out (they have their own tab).
  const source = typeof req.query.source === "string" ? req.query.source : "";
  if (source === "bots") {
    conditions.push(sql`(${gamesTable.platform} = 'bot' OR ${gamesTable.whiteUsername} ILIKE 'ChessScout Bot%' OR ${gamesTable.blackUsername} ILIKE 'ChessScout Bot%' OR ${gamesTable.whiteUsername} ILIKE '% (Bot)' OR ${gamesTable.blackUsername} ILIKE '% (Bot)')`);
  } else if (source === "chessscout") {
    conditions.push(sql`(${gamesTable.platform} = 'chessscout' OR via_chessscout = true OR (${gamesTable.platform} = 'lichess' AND ${gamesTable.lichessGameId} IN (SELECT game_id FROM lichess_cs_games WHERE user_id = ${req.user!.id})))`);
  } else if (source === "chesscom" || source === "lichess") {
    conditions.push(eq(gamesTable.platform, source));
  } else if (platform && (platform === "chesscom" || platform === "lichess" || platform === "chessscout")) {
    conditions.push(eq(gamesTable.platform, platform));
  } else {
    // All games: no bot games, including older ones saved before bots had their own tab.
    conditions.push(sql`${gamesTable.platform} <> 'bot'`);
    conditions.push(sql`NOT (${gamesTable.whiteUsername} ILIKE 'ChessScout Bot%' OR ${gamesTable.blackUsername} ILIKE 'ChessScout Bot%' OR ${gamesTable.whiteUsername} ILIKE '% (Bot)' OR ${gamesTable.blackUsername} ILIKE '% (Bot)')`);
  }
  if (opponent) {
    conditions.push(
      or(
        ilike(gamesTable.whiteUsername, opponent),
        ilike(gamesTable.blackUsername, opponent),
      )!
    );
  }

  let countQuery = db.select({ value: count() }).from(gamesTable);
  if (conditions.length > 0) {
    // @ts-ignore
    countQuery = countQuery.where(and(...conditions));
  }

  // The list leaves out each game's full review (it can be hundreds of KB a game,
  // and 50 of them at once was a big share of the server's memory); the review
  // page loads it on its own. "reviewed" says whether there is one.
  const { reviewData: _omitReview, ...listColumns } = getTableColumns(gamesTable);
  let dbQuery = db
    .select({ ...listColumns, hasReview: sql<boolean>`(${gamesTable.reviewData} IS NOT NULL AND jsonb_typeof(${gamesTable.reviewData}) = 'object')` })
    .from(gamesTable)
    .orderBy(desc(gamesTable.playedAt))
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    // @ts-ignore
    dbQuery = dbQuery.where(and(...conditions));
  }

  const [games, [{ value: total }], mine] = await Promise.all([dbQuery, countQuery, ownerNames(req.user!.id)]);

  res.json({
    games: games.map(({ hasReview, ...g }) => ({
      ...g,
      yourSide: sideFromNames(g, mine) ?? null,
      reviewed: !!hasReview,
      playedAt: g.playedAt.toISOString(),
      createdAt: g.createdAt.toISOString(),
      platform: g.platform || "chesscom",
    })),
    total: Number(total),
    isViewLimited: false,
    viewLimit: null,
  });

  triggerBackgroundReReviewForStaleReviews(req.user!.id, req.log).catch(() => {});
});

// One-time utility: re-extract opening names from PGN for all games with null opening
router.post("/games/fix-openings", async (req, res): Promise<void> => {
  const nullOpeningGames = await db
    .select({ id: gamesTable.id, pgn: gamesTable.pgn })
    .from(gamesTable)
    .where(isNull(gamesTable.opening));

  let updated = 0;
  for (const game of nullOpeningGames) {
    const { opening, eco } = extractOpeningFromPgn(game.pgn);
    if (opening) {
      await db
        .update(gamesTable)
        .set({ opening, eco })
        .where(eq(gamesTable.id, game.id));
      updated++;
    }
  }

  res.json({ total: nullOpeningGames.length, updated });
});

// Get sample games for a specific opening — used by the opening detail page
router.get("/games/openings/detail", requireAuth, async (req, res): Promise<void> => {
  const username = (req.query.username as string | undefined)?.toLowerCase();
  const opening  = req.query.opening as string | undefined;
  const eco      = req.query.eco as string | undefined;

  if (!opening && !eco) {
    res.status(400).json({ error: "opening or eco is required" });
    return;
  }

  // Find games matching this opening (by name or ECO code), scoped to the signed-in user
  const allGames = await db
    .select({
      id: gamesTable.id,
      pgn: gamesTable.pgn,
      result: gamesTable.result,
      opening: gamesTable.opening,
      eco: gamesTable.eco,
      whiteUsername: gamesTable.whiteUsername,
      blackUsername: gamesTable.blackUsername,
      whiteRating: gamesTable.whiteRating,
      blackRating: gamesTable.blackRating,
      playedAt: gamesTable.playedAt,
      username: gamesTable.username,
    })
    .from(gamesTable)
    .where(eq(gamesTable.userId, req.user!.id))
    .orderBy(desc(gamesTable.playedAt));

  const matched = allGames.filter(g => {
    if (eco && g.eco === eco) return true;
    if (opening && g.opening === opening) return true;
    return false;
  });

  // Extract opening moves by finding the most common prefix across all games
  const Chess = require("chess.js").Chess;
  const OPENING_HALF_MOVES = 14; // 7 full moves

  // Build a frequency table of moves at each position
  type MoveFreq = Map<string, number>;
  const movesByDepth: MoveFreq[] = Array.from({ length: OPENING_HALF_MOVES }, () => new Map());
  const fensByDepth: string[][] = Array.from({ length: OPENING_HALF_MOVES }, () => []);

  for (const g of matched.slice(0, 30)) {
    try {
      const chess = new Chess();
      chess.loadPgn(g.pgn);
      const history = chess.history({ verbose: true });
      const chess2 = new Chess();
      for (let i = 0; i < Math.min(OPENING_HALF_MOVES, history.length); i++) {
        const m = history[i];
        const key = m.san;
        movesByDepth[i].set(key, (movesByDepth[i].get(key) ?? 0) + 1);
        const fenBefore = chess2.fen();
        fensByDepth[i].push(fenBefore);
        chess2.move(m.san);
      }
    } catch { /* ignore parse errors */ }
  }

  // Build the main line: at each depth, pick the most-played move
  const mainLine: Array<{ san: string; fen: string; moveNumber: number; color: "white" | "black" }> = [];
  const chess = new Chess();
  for (let i = 0; i < OPENING_HALF_MOVES; i++) {
    const freq = movesByDepth[i];
    if (freq.size === 0) break;
    const bestSan = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    try {
      chess.move(bestSan);
      mainLine.push({
        san: bestSan,
        fen: chess.fen(),
        moveNumber: Math.floor(i / 2) + 1,
        color: i % 2 === 0 ? "white" : "black",
      });
    } catch { break; }
  }

  // Return top 10 sample games + main line
  const mine = await ownerNames(req.user!.id);
  const sampleGames = matched.slice(0, 10).map(g => ({
    id: g.id,
    username: g.username,
    yourSide: sideFromNames(g, mine) ?? null,
    result: g.result,
    whiteUsername: g.whiteUsername,
    blackUsername: g.blackUsername,
    whiteRating: g.whiteRating,
    blackRating: g.blackRating,
    playedAt: g.playedAt,
    opening: g.opening,
    eco: g.eco,
  }));

  res.json({
    totalGames: matched.length,
    sampleGames,
    mainLine,
    openingName: matched[0]?.opening ?? opening ?? eco ?? "Unknown Opening",
    eco: matched[0]?.eco ?? eco ?? null,
  });
});

router.get("/games/openings", requireAuth, async (req, res): Promise<void> => {
  const games = await db
    .select({
      result: gamesTable.result,
      opening: gamesTable.opening,
      eco: gamesTable.eco,
      whiteUsername: gamesTable.whiteUsername,
      blackUsername: gamesTable.blackUsername,
      username: gamesTable.username,
    })
    .from(gamesTable)
    .where(eq(gamesTable.userId, req.user!.id));
  const mine = await ownerNames(req.user!.id);

  const totalGames = games.length;

  type Stat = { games: number; wins: number; losses: number; draws: number };
  type OpeningStat = {
    eco: string | null;
    opening: string;
    total: Stat;
    white: Stat;
    black: Stat;
  };

  const map = new Map<string, OpeningStat>();

  for (const g of games) {
    const key = g.opening || "Unknown Opening";
    if (!map.has(key)) {
      const empty = (): Stat => ({ games: 0, wins: 0, losses: 0, draws: 0 });
      map.set(key, { eco: g.eco, opening: key, total: empty(), white: empty(), black: empty() });
    }
    const stat = map.get(key)!;
    if (!stat.eco && g.eco) stat.eco = g.eco;

    const isWhite = sideFromNames(g, mine) !== "black";
    const colorStat = isWhite ? stat.white : stat.black;

    stat.total.games++;
    colorStat.games++;

    if (g.result === "win") {
      stat.total.wins++;
      colorStat.wins++;
    } else if (g.result === "loss") {
      stat.total.losses++;
      colorStat.losses++;
    } else {
      stat.total.draws++;
      colorStat.draws++;
    }
  }

  const wr = (s: Stat) => (s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0);

  const openings = Array.from(map.values())
    .map((s) => ({
      eco: s.eco,
      opening: s.opening,
      totalGames: s.total.games,
      percentage: totalGames > 0 ? Math.round((s.total.games / totalGames) * 100) : 0,
      wins: s.total.wins,
      losses: s.total.losses,
      draws: s.total.draws,
      winRate: wr(s.total),
      white: { games: s.white.games, wins: s.white.wins, losses: s.white.losses, draws: s.white.draws, winRate: wr(s.white) },
      black: { games: s.black.games, wins: s.black.wins, losses: s.black.losses, draws: s.black.draws, winRate: wr(s.black) },
    }))
    .sort((a, b) => b.totalGames - a.totalGames);

  res.json({ openings, totalGames });
});

router.get("/games/recent-opponents", async (req, res): Promise<void> => {
  const username = (req.query.username as string || "").trim().toLowerCase();

  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  try {
    req.log.info({ username }, "Recent opponents: searching chess.com archives");
    const archives = await fetchChessComArchiveList(username);
    // Archives are ordered oldest-first; walk backward from the most
    // recent month so opponents come back in actual recency order.
    const orderedArchives = [...archives].reverse();

    const seen = new Set<string>();
    const opponents: { username: string; lastPlayedAt: string }[] = [];
    // Adaptive rather than a fixed lookback window: an inactive player
    // might not have 20 distinct opponents in 2 months, and an active
    // one might have them in 2 weeks. Search month by month, most
    // recent first, until there are 20 or a year's worth of archives
    // has been checked (whichever comes first) -- stopping as soon as
    // there's enough keeps this fast for the common case instead of
    // always paying for a fixed, possibly-unnecessary window.
    const MAX_ARCHIVES_TO_CHECK = 12;

    for (let i = 0; i < orderedArchives.length && i < MAX_ARCHIVES_TO_CHECK && opponents.length < 20; i++) {
      const games = await fetchChessComGamesForArchive(orderedArchives[i]);
      const sorted = [...games].sort((a, b) => b.end_time - a.end_time);
      for (const g of sorted) {
        const w = g.white.username;
        const b = g.black.username;
        const isUserWhite = w.toLowerCase() === username;
        const opponent = isUserWhite ? b : w;
        const opponentKey = opponent.toLowerCase();
        if (opponentKey === username || seen.has(opponentKey)) continue;
        seen.add(opponentKey);
        opponents.push({ username: opponent, lastPlayedAt: new Date(g.end_time * 1000).toISOString() });
        if (opponents.length >= 20) break;
      }
    }

    res.json({ username, opponents, monthsSearched: Math.min(orderedArchives.length, MAX_ARCHIVES_TO_CHECK) });
  } catch (err: any) {
    req.log.error({ err, username }, "Recent opponents lookup failed");
    res.status(500).json({ error: err.message || "Failed to fetch recent opponents" });
  }
});

router.get("/games/h2h-lookup", async (req, res): Promise<void> => {
  const player1 = (req.query.player1 as string || "").trim().toLowerCase();
  const player2 = (req.query.player2 as string || "").trim().toLowerCase();

  if (!player1 || !player2) {
    res.status(400).json({ error: "Both player1 and player2 are required" });
    return;
  }

  if (player1 === player2) {
    res.status(400).json({ error: "Players must be different" });
    return;
  }

  try {
    req.log.info({ player1, player2 }, "H2H lookup: fetching games from chess.com");
    const games = await fetchChessComGames(player1, 6);

    const h2hGames = games
      .filter(g => {
        const w = g.white.username.toLowerCase();
        const b = g.black.username.toLowerCase();
        return (w === player1 && b === player2) || (w === player2 && b === player1);
      })
      .sort((a, b) => b.end_time - a.end_time)
      .slice(0, 50);

    const results = h2hGames.map(g => {
      const { opening, eco } = extractOpeningFromPgn(g.pgn);
      const moves = parsePgnMoves(g.pgn);
      return {
        id: g.url?.split("/").pop() || String(g.end_time),
        whiteUsername: g.white.username,
        blackUsername: g.black.username,
        whiteRating: g.white.rating,
        blackRating: g.black.rating,
        whiteResult: g.white.result,
        blackResult: g.black.result,
        timeControl: g.time_control,
        playedAt: new Date(g.end_time * 1000).toISOString(),
        opening,
        eco,
        pgn: g.pgn,
        moves,
      };
    });

    res.json({
      player1,
      player2,
      totalGames: results.length,
      games: results,
    });
  } catch (err: any) {
    req.log.error({ err, player1, player2 }, "H2H lookup failed");
    res.status(500).json({ error: err.message || "Failed to fetch games" });
  }
});

router.get("/games/review-status/:jobId", async (req, res): Promise<void> => {
  const [job] = await db.select().from(backgroundJobsTable).where(eq(backgroundJobsTable.id, req.params.jobId as string));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.setHeader("Cache-Control", "no-store");

  if (job.status === "done") {
    const gameId = parseInt(job.targetUsername ?? "0", 10);
    const [game] = await db.select({ reviewData: gamesTable.reviewData, opening: gamesTable.opening }).from(gamesTable).where(eq(gamesTable.id, gameId));
    if (game?.reviewData) {
      const cached = game.reviewData as Record<string, unknown>;
      const moves = cached.moves ?? cached;
      const gameSummary = cached.gameSummary ?? null;
      const whiteAccuracy = cached.whiteAccuracy ?? null;
      const blackAccuracy = cached.blackAccuracy ?? null;
      res.json({ status: "done", reviewData: { moves: refreshBasicReview(markBookMoves(moves), aiFlag(cached), (game as { opening?: string | null }).opening ?? null), gameSummary, whiteAccuracy, blackAccuracy, aiCoach: aiFlag(cached) } });
      return;
    }
  }

  const progress = job.result as Record<string, unknown> | null;
  res.json({
    status: job.status,
    error: job.error ?? null,
    progress: progress?.progress ?? null,
    total: progress?.total ?? null,
    // the engine review, while the AI coach is still writing
    interim: job.status === "pending" ? progress?.interim ?? null : null,
    evals: job.status === "pending" && !progress?.interim ? progress?.evals ?? null : null,
  });
});

// ── PGN upload ───────────────────────────────────────────────────────────
// Adds games from a .pgn file (or pasted PGN text) to the user's library.
// Unlike /games/analyze-pgn (a one-off analysis of a single game that
// never touches the library), this inserts real rows, shaped exactly like
// the Chess.com/Lichess importers' rows so everything downstream (game
// list, reviews, analytics, puzzles) treats them the same.
//
// Which side is "you" is decided by matching the PGN's White/Black names
// against the account's linked Chess.com/Lichess usernames -- results are
// stored from the user's perspective, same as every other imported game.
// Games where neither player matches are skipped (and counted), because
// there's no way to know whose perspective to record them from.
function splitPgnGames(text: string): string[] {
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (!t) return [];
  return t.split(/\n\s*\n(?=\[Event\s)/).map((g) => g.trim()).filter(Boolean);
}
/** The game's outcome in plain words for the AI coach ("0-1 (Black won)"). The stored
 *  result is from the owner's side ("win"/"loss"), which alone reads as "White won". */
function outcomeLine(game: { pgn: string; result: string }, side?: "white" | "black"): string {
  const tag = pgnHeader(game.pgn, "Result");
  if (tag === "1-0") return "1-0 (White won)";
  if (tag === "0-1") return "0-1 (Black won)";
  if (tag === "1/2-1/2" || game.result === "draw") return "Draw";
  if (side && (game.result === "win" || game.result === "loss")) {
    const whiteWon = (game.result === "win") === (side === "white");
    return whiteWon ? "1-0 (White won)" : "0-1 (Black won)";
  }
  return game.result;
}

function pgnHeader(pgn: string, name: string): string | null {
  const m = pgn.match(new RegExp(`\\[${name}\\s+"([^"]*)"\\]`));
  return m ? m[1] : null;
}
function pgnPlayedAt(pgn: string): Date {
  const d = pgnHeader(pgn, "UTCDate") ?? pgnHeader(pgn, "Date");
  const tRaw = pgnHeader(pgn, "UTCTime") ?? pgnHeader(pgn, "Time") ?? "";
  const t = /^\d{2}:\d{2}:\d{2}$/.test(tRaw) ? tRaw : "00:00:00";
  if (d && /^\d{4}\.\d{2}\.\d{2}$/.test(d)) {
    const dt = new Date(`${d.replace(/\./g, "-")}T${t}Z`);
    if (!isNaN(dt.getTime())) return dt;
  }
  return new Date();
}

router.post("/games/import-pgn", requireAuth, async (req, res): Promise<void> => {
  const { pgn, viaChessScout } = req.body as { pgn?: string; viaChessScout?: boolean };
  // Played on ChessScout's board (or followed in the studio): the board knows which colour
  // they played, so that decides it (not a name match, which can miss or hit an older copy of the game).
  const side = req.body?.side === "white" || req.body?.side === "black" ? req.body.side as "white" | "black" : null;
  if (!pgn || typeof pgn !== "string" || !pgn.trim()) {
    res.status(400).json({ error: "Choose a PGN file or paste PGN text first." });
    return;
  }
  const userId = req.user!.id;
  const mine = [req.user!.chesscomUsername, req.user!.lichessUsername]
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase());
  if (mine.length === 0) {
    res.status(400).json({ error: "Link your Chess.com or Lichess username first, so we know which player in each game is you.", code: "no_linked_username" });
    return;
  }

  const games = splitPgnGames(pgn);
  const MAX_GAMES = 1000;
  if (games.length === 0) {
    res.status(400).json({ error: "No games found in that PGN." });
    return;
  }
  if (games.length > MAX_GAMES) {
    res.status(400).json({ error: `That file has ${games.length} games; the limit is ${MAX_GAMES} per upload. Split it into parts and upload each.` });
    return;
  }

  let imported = 0, duplicates = 0, notYours = 0, invalid = 0, unfinished = 0;
  // The ids of the games (new or already there), so a single game can be opened right after.
  const ids: number[] = [];
  for (const g of games) {
    try {
      const white = pgnHeader(g, "White");
      const black = pgnHeader(g, "Black");
      if (!white || !black) { invalid++; continue; }

      try {
        const c = new Chess();
        // strict:false matches puzzleVerifier.ts -- tolerate the small format
        // quirks PGNs exported from other tools commonly have.
        c.loadPgn(g, { strict: false });
        if (c.history().length === 0) { invalid++; continue; }
      } catch { invalid++; continue; }

      const sideKnown = side && games.length === 1;
      const whiteIsMe = sideKnown ? side === "white" : mine.includes(white.toLowerCase());
      const blackIsMe = sideKnown ? side === "black" : mine.includes(black.toLowerCase());
      if (!whiteIsMe && !blackIsMe) { notYours++; continue; }

      const tagResult = pgnHeader(g, "Result");
      let result: string;
      if (tagResult === "1-0") result = whiteIsMe ? "win" : "loss";
      else if (tagResult === "0-1") result = blackIsMe ? "win" : "loss";
      else if (tagResult === "1/2-1/2") result = "draw";
      else { unfinished++; continue; }

      const site = pgnHeader(g, "Link") ?? pgnHeader(g, "Site") ?? "";
      const isUrl = /^https?:\/\//i.test(site);
      let platform: "chesscom" | "lichess" | "chessscout" = "chessscout";
      let chesscomGameId: string | null = null;
      let lichessGameId: string | null = null;
      if (/chess\.com\//i.test(site)) {
        platform = "chesscom";
        chesscomGameId = site.split("?")[0].split("/").pop() || null;
      } else if (/lichess\.org\//i.test(site)) {
        platform = "lichess";
        lichessGameId = site.replace(/^https?:\/\/lichess\.org\//i, "").split(/[/?#]/)[0].slice(0, 8) || null;
      }

      const cols = { id: gamesTable.id, w: gamesTable.whiteUsername, b: gamesTable.blackUsername };
      let dupe = chesscomGameId
        ? await db.select(cols).from(gamesTable).where(and(eq(gamesTable.userId, userId), eq(gamesTable.chesscomGameId, chesscomGameId))).limit(1)
        : lichessGameId
          ? await db.select(cols).from(gamesTable).where(and(eq(gamesTable.userId, userId), eq(gamesTable.lichessGameId, lichessGameId))).limit(1)
          : await db.select(cols).from(gamesTable).where(and(eq(gamesTable.userId, userId), eq(gamesTable.pgn, g))).limit(1);
      // "Already saved" only if it's the same game: same two players. A saved game carrying
      // this game's id with other players is mislabelled (it opened a different game's
      // review): its wrong id is cleared and this game is saved as its own.
      if (dupe.length && ((dupe[0].w ?? '').toLowerCase() !== white.toLowerCase() || (dupe[0].b ?? '').toLowerCase() !== black.toLowerCase())) {
        await db.update(gamesTable).set(chesscomGameId ? { chesscomGameId: null } : { lichessGameId: null }).where(eq(gamesTable.id, dupe[0].id)).catch(() => {});
        dupe = [];
      }
      // Same players, same moves, already saved by another route (maybe without this id)
      if (dupe.length === 0) {
        const same = await findSameGame(userId, { pgn: g, white, black, playedAt: pgnPlayedAt(g) }).catch(() => null);
        if (same) { await adoptIds(same, { lichessGameId, chesscomGameId }); dupe = [{ id: same.id, w: white, b: black }]; }
      }
      if (dupe.length > 0) {
        // Already saved (e.g. by a sync): put it on their side if it was saved from the other
        // player's, and drop the review written for the wrong side so it's redone.
        if (sideKnown) {
          const myName = (whiteIsMe ? white : black).toLowerCase();
          await db.update(gamesTable).set({ result, username: myName, reviewData: null, analyzed: false })
            .where(and(eq(gamesTable.id, dupe[0].id), sql`(${gamesTable.result} IS DISTINCT FROM ${result} OR lower(${gamesTable.username}) IS DISTINCT FROM ${myName})`))
            .catch(() => {});
        }
        duplicates++; ids.push(dupe[0].id); continue;
      }

      const { opening, eco } = extractOpeningFromPgn(g);
      const [row] = await db.insert(gamesTable).values({
        userId,
        username: (whiteIsMe ? white : black).toLowerCase(),
        pgn: g,
        whiteUsername: white,
        blackUsername: black,
        whiteRating: parseInt(pgnHeader(g, "WhiteElo") ?? "", 10) || 0,
        blackRating: parseInt(pgnHeader(g, "BlackElo") ?? "", 10) || 0,
        result,
        timeControl: pgnHeader(g, "TimeControl") ?? "-",
        opening,
        eco,
        playedAt: pgnPlayedAt(g),
        url: isUrl ? site : null,
        chesscomGameId,
        lichessGameId,
        platform,
      }).onConflictDoNothing().returning({ id: gamesTable.id });
      if (row) { imported++; ids.push(row.id); } else duplicates++;
    } catch (err) {
      req.log.warn({ err }, "Failed to import one game from uploaded PGN");
      invalid++;
    }
  }

  // Played on Lichess from ChessScout's board: it belongs under the ChessScout tab too.
  if (viaChessScout === true && ids.length) {
    await db.execute(sql`UPDATE games SET via_chessscout = true WHERE user_id = ${userId} AND id IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`).catch(() => {});
  }
  res.json({ imported, duplicates, notYours, invalid, unfinished, total: games.length, ids: ids.slice(0, 50) });
});

router.post("/games/analyze-pgn", async (req, res): Promise<void> => {
  const { pgn } = req.body as { pgn?: string };
  if (!pgn || typeof pgn !== "string") {
    res.status(400).json({ error: "pgn is required" });
    return;
  }

  const crypto = await import("crypto");
  const pgnHash = crypto.createHash("sha256").update(pgn.trim()).digest("hex").slice(0, 32);

  const existing = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.type, "analyze-pgn"),
      eq(backgroundJobsTable.targetUsername, pgnHash),
    )
  );
  const activeJob = existing.find(j => j.status === "pending" || j.status === "done");
  if (activeJob) {
    if (activeJob.status === "done" && activeJob.result) {
      res.json({ status: "done", jobId: activeJob.id, result: activeJob.result });
    } else {
      const progress = activeJob.result as Record<string, unknown> | null;
      res.json({ status: "pending", jobId: activeJob.id, progress: progress?.progress ?? null, total: progress?.total ?? null });
    }
    return;
  }

  const userId = req.user?.id ?? "anonymous";
  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId,
    userId,
    type: "analyze-pgn",
    status: "pending",
    targetUsername: pgnHash,
  });

  res.json({ status: "pending", jobId });

  runAnalyzePgnJob(pgn, jobId, req.log).catch(() => {});
});

router.get("/games/analyze-pgn-status/:jobId", async (req, res): Promise<void> => {
  const [job] = await db.select().from(backgroundJobsTable).where(eq(backgroundJobsTable.id, req.params.jobId as string));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.setHeader("Cache-Control", "no-store");

  if (job.status === "done" && job.result) {
    res.json({ status: "done", result: job.result });
    return;
  }
  if (job.status === "error") {
    res.json({ status: "error", error: job.error ?? "Analysis failed" });
    return;
  }

  const progress = job.result as Record<string, unknown> | null;
  res.json({
    status: job.status,
    progress: progress?.progress ?? null,
    total: progress?.total ?? null,
  });
});

router.get("/games/:id", async (req, res): Promise<void> => {
  const params = GetGameParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  res.json({
    ...GetGameResponse.parse({
      ...game,
      reviewed: !!(game.reviewData && typeof game.reviewData === 'object'),
      playedAt: game.playedAt.toISOString(),
      createdAt: game.createdAt.toISOString(),
    }),
    yourSide: (await coachSideFor(game)) ?? null,
  });
});

router.get("/games/:id/replay", async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const moves = parsePgnMoves(game.pgn);
  const startFen = extractStartFen(game.pgn);
  const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  res.json({
    ...GetGameReplayResponse.parse({
      id: game.id,
      pgn: game.pgn,
      startFen: startFen !== DEFAULT_FEN ? startFen : null,
      moves,
      whiteUsername: game.whiteUsername,
      blackUsername: game.blackUsername,
      whiteRating: game.whiteRating,
      blackRating: game.blackRating,
      result: game.result,
      opening: game.opening,
      eco: game.eco,
      analysisNotes: game.analysisNotes,
    }),
    // Which side is the owner's: their own accounts first, then the name it was saved under
    // (the same rule the coach uses). The page goes by this before anything else.
    yourSide: (await coachSideFor(game)) ?? null,
    username: game.username,
  });
});

router.post("/games/:id/analyze-moves", async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const moves = parsePgnMoves(game.pgn);
  const classifications = await analyzeMoves({
    pgn: game.pgn,
    moves,
    opening: game.opening,
    eco: game.eco,
    result: outcomeLine(game),
    whiteUsername: game.whiteUsername,
    blackUsername: game.blackUsername,
  });

  res.json({ classifications });
});

router.post("/games/:id/analyze-move", requireAuth, requirePremium, async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { moveIndex } = req.body as { moveIndex?: number };
  if (typeof moveIndex !== "number" || moveIndex < 0) {
    res.status(400).json({ error: "moveIndex is required and must be a non-negative number" });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const moves = parsePgnMoves(game.pgn);

  if (moveIndex >= moves.length) {
    res.status(400).json({ error: "moveIndex out of range" });
    return;
  }

  try {
    const analysis = await analyzeSingleMove({
      moves,
      moveIndex,
      opening: game.opening,
      eco: game.eco,
      result: outcomeLine(game),
      whiteUsername: game.whiteUsername,
      blackUsername: game.blackUsername,
      userId: req.user?.id,
    });
    res.json(analysis);
  } catch (err) {
    req.log.error({ err }, "Failed to analyze single move");
    res.status(500).json({ error: "Analysis failed" });
  }
});

async function runAnalyzePgnJob(pgn: string, jobId: string, log: Logger): Promise<void> {
  try {
    log.info({ jobId }, "Starting PGN analysis background job");

    await db.update(backgroundJobsTable).set({
      result: { progress: 0, total: 0 } as unknown as Record<string, unknown>,
    }).where(eq(backgroundJobsTable.id, jobId));

    const result = await analyzeGamePgn(pgn, (done, total) => {
      db.update(backgroundJobsTable).set({
        result: { progress: done, total } as unknown as Record<string, unknown>,
      }).where(eq(backgroundJobsTable.id, jobId)).catch(() => {});
    });

    await db.update(backgroundJobsTable).set({
      status: "done",
      result: result as unknown as Record<string, unknown>,
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));

    log.info({ jobId }, "PGN analysis background job complete");
  } catch (err: any) {
    log.error({ err, jobId }, "PGN analysis background job failed");
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: err?.message ?? "Analysis failed",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  }
}

// The OpenAI coach is a Pro feature. A review runs it only when the game's
// OWNER is Pro / admin / complimentary Pro -- whoever happens to trigger the
// review (bulk job, stale re-review, a page view). Everyone else gets the
// Stockfish-only review. Never throws: on any lookup error it says "no AI".
/** Does a saved review hold the AI coach's work (per-move pros/cons or a game summary)? */
function hasAiText(rd: unknown): boolean {
  if (!rd || typeof rd !== "object") return false;
  const r = rd as { aiCoach?: boolean; gameSummary?: unknown; moves?: unknown };
  if (r.aiCoach === false) return false;
  const moves = Array.isArray(r.moves) ? r.moves : Array.isArray(rd) ? (rd as unknown[]) : [];
  return !!r.gameSummary || moves.some((m) => {
    const x = m as { pros?: unknown[]; cons?: unknown[] };
    return (Array.isArray(x?.pros) && x.pros.length > 0) || (Array.isArray(x?.cons) && x.cons.length > 0);
  });
}
/** What a saved review tells the app about the AI coach: only true when its text is really there. */
function aiFlag(cached: Record<string, unknown>): boolean {
  return cached.aiCoach !== false && hasAiText(cached);
}

/**
 * Saves a review, but never replaces one that has the AI coach's text with one
 * that doesn't (a re-review while OpenAI is failing would otherwise wipe it).
 * Reviews are kept permanently; this is the only place they're written.
 */
async function saveReview(gameId: number, reviewResult: unknown): Promise<"saved" | "kept"> {
  const [cur] = await db.select({ reviewData: gamesTable.reviewData }).from(gamesTable).where(eq(gamesTable.id, gameId));
  if (cur?.reviewData && hasAiText(cur.reviewData) && !hasAiText(reviewResult)) {
    await db.update(gamesTable).set({ analyzed: true }).where(eq(gamesTable.id, gameId));
    return "kept";
  }
  await db.update(gamesTable)
    .set({ reviewData: { ...(reviewResult as Record<string, unknown>), _v2: true } as unknown as Record<string, unknown>, analyzed: true })
    .where(eq(gamesTable.id, gameId));
  return "saved";
}

/** The side the coach's summary is written for: the owner's own account names first
 *  (an imported game can be stored under another name), then the name it was imported under. */
async function coachSideFor(game: typeof gamesTable.$inferSelect): Promise<"white" | "black" | undefined> {
  return sideFromNames(game, await ownerNames(game.userId));
}

async function aiCoachForOwner(ownerId: string | null | undefined): Promise<boolean> {
  if (!ownerId) return false;
  try { return await isUserPremium(ownerId); } catch { return false; }
}

// Reviews a single game and writes its reviewData — the same core logic
// runReviewJob uses for a single manually-triggered review, factored out so
// bulk review can reuse it without creating a backgroundJobsTable row per
// game (which would be hundreds of rows for a large backlog).
async function reviewOneGame(
  game: typeof gamesTable.$inferSelect,
  onProgress?: (done: number, total: number) => void,
  userId?: string,
  aiCoachOverride?: boolean,
): Promise<void> {
  const moves = parsePgnMoves(game.pgn);
  const startFen = extractStartFen(game.pgn);
  const side = await coachSideFor(game);
  const reviewResult = await reviewFullGame({
    moves,
    opening: game.opening,
    eco: game.eco,
    result: outcomeLine(game, side),
    whiteUsername: game.whiteUsername,
    blackUsername: game.blackUsername,
    startFen: startFen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" ? startFen : undefined,
    onProgress,
    userId,
    aiCoach: aiCoachOverride ?? await aiCoachForOwner(game.userId),
    coachSide: side,
  });

  await saveReview(game.id, reviewResult);
}

// Bulk review processes games strictly one at a time — the Stockfish engine
// queue (see engineAnalysis.ts) would keep this safe even if run
// concurrently, but sequential is deliberate here too: it avoids piling up
// dozens of simultaneous OpenAI calls and database writes, and keeps CPU
// contention with normal site traffic bounded rather than spiking all at
// once. `maxGames` caps how many this specific invocation processes —
// the auto/background trigger uses a small cap; the manual "Review All"
// button uses a much larger one.
//
// Manual jobs ("Review all") run entirely on the server, so they keep going
// when the app is closed; if the server restarts mid-way they're resumed on
// boot (resumeBulkReviews). They push "your games are reviewed" at the end.
// coachCatchUp (after upgrading to Pro from the review prompt) also redoes
// games that were reviewed without the Coach.
export interface BulkReviewOpts { notify?: boolean; coachCatchUp?: boolean; manual?: boolean; offset?: number }

export async function runBulkReviewJob(
  userId: string,
  jobId: string,
  log: Logger,
  maxGames: number,
  opts: BulkReviewOpts = {},
): Promise<void> {
  const base = { manual: !!opts.manual, coachCatchUp: !!opts.coachCatchUp };
  const offset = opts.offset ?? 0;
  try {
    // Same owner for every game in a bulk job, so look the plan up once.
    const aiCoach = await aiCoachForOwner(userId);
    const catchUp = !!opts.coachCatchUp && aiCoach;
    const todo = await db
      .select()
      .from(gamesTable)
      .where(and(
        eq(gamesTable.userId, userId),
        catchUp
          ? or(isNull(gamesTable.reviewData), sql`${gamesTable.reviewData}->>'aiCoach' = 'false'`)
          : isNull(gamesTable.reviewData),
      ))
      .orderBy(sql`(${gamesTable.reviewData} IS NULL) DESC`, desc(gamesTable.playedAt))
      .limit(maxGames);

    const total = offset + todo.length;
    let reviewedSoFar = offset;

    if (todo.length === 0) {
      await db.update(backgroundJobsTable).set({
        status: "done",
        result: { ...base, reviewedSoFar, total, heartbeat: Date.now() } as unknown as Record<string, unknown>,
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, jobId));
      if (opts.notify && reviewedSoFar > 0) await notifyReviewed(userId, reviewedSoFar, aiCoach);
      return;
    }

    await db.update(backgroundJobsTable).set({
      result: { ...base, reviewedSoFar, total, heartbeat: Date.now() } as unknown as Record<string, unknown>,
    }).where(eq(backgroundJobsTable.id, jobId));

    for (const game of todo) {
      try {
        await reviewOneGame(game, undefined, userId, aiCoach);
        reviewedSoFar++;
      } catch (err) {
        log.warn({ err, gameId: game.id }, "Bulk review: one game failed, continuing with the rest");
      }
      await db.update(backgroundJobsTable).set({
        result: { ...base, reviewedSoFar, total, currentGameId: game.id, heartbeat: Date.now() } as unknown as Record<string, unknown>,
      }).where(eq(backgroundJobsTable.id, jobId));
    }

    await db.update(backgroundJobsTable).set({
      status: "done",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));

    if (opts.notify && reviewedSoFar > 0) await notifyReviewed(userId, reviewedSoFar, aiCoach);
    log.info({ jobId, userId, reviewedSoFar, total }, "Bulk review job complete");
  } catch (err) {
    log.error({ err, jobId, userId }, "Bulk review job failed");
    const msg = err instanceof Error ? err.message : "Bulk review failed";
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: msg,
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  }
}

async function notifyReviewed(userId: string, n: number, coach: boolean) {
  await notifyUser(userId, {
    kind: "review",
    title: n === 1 ? "Your game is reviewed" : `All ${n} games reviewed`,
    body: coach ? "Your coach has gone through every game. See what to work on." : "Every move checked by Stockfish. See your mistakes and best moves.",
    url: "/games",
  }).catch(() => {});
}

const MANUAL_BULK_REVIEW_MAX = 100;
// A job counts as running while it's made progress recently (each game
// updates the heartbeat); one that's gone quiet this long was cut off.
const BULK_REVIEW_STALE_MS = 15 * 60 * 1000;

type JobRow = typeof backgroundJobsTable.$inferSelect;
const jobResult = (j: JobRow) => (j.result ?? {}) as { manual?: boolean; coachCatchUp?: boolean; reviewedSoFar?: number; heartbeat?: number };
const lastActivity = (j: JobRow) => Math.max(new Date(j.createdAt!).getTime(), Number(jobResult(j).heartbeat ?? 0));

/** The player's pending "Review all" job, if one is still running. */
async function activeManualReview(userId: string): Promise<JobRow | null> {
  const pending = await db.select().from(backgroundJobsTable).where(and(
    eq(backgroundJobsTable.userId, userId),
    eq(backgroundJobsTable.type, "bulk_review"),
    eq(backgroundJobsTable.status, "pending"),
  ));
  let live: JobRow | null = null;
  for (const j of pending) {
    if (!jobResult(j).manual) continue;
    if (Date.now() - lastActivity(j) <= BULK_REVIEW_STALE_MS) { live = j; continue; }
    await db.update(backgroundJobsTable).set({ status: "error", error: "Timed out (server restart or crash)", completedAt: new Date() })
      .where(eq(backgroundJobsTable.id, j.id));
  }
  return live;
}

/** Start (or join) a player's "Review all". Runs on the server; notifies when done. */
export async function startManualBulkReview(userId: string, log: Logger, opts: { coachCatchUp?: boolean } = {}): Promise<string> {
  const live = await activeManualReview(userId);
  if (live) return live.id;
  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId, userId, type: "bulk_review", status: "pending",
    result: { manual: true, coachCatchUp: !!opts.coachCatchUp, reviewedSoFar: 0, total: 0, heartbeat: Date.now() } as unknown as Record<string, unknown>,
  });
  runBulkReviewJob(userId, jobId, log, MANUAL_BULK_REVIEW_MAX, { notify: true, manual: true, coachCatchUp: opts.coachCatchUp }).catch(() => {});
  return jobId;
}

/** Is a manual "Review all" running for this player? (Used to skip the auto reviewer.) */
export async function hasActiveManualReview(userId: string): Promise<boolean> {
  return !!(await activeManualReview(userId));
}

// Read-only check for an already-running bulk review, so any page that
// shows a "review your games" prompt can find out first whether one's
// already in flight (e.g. kicked off during onboarding) instead of
// offering to start a second one or showing a stale "not reviewed yet"
// count while one's already working through the list.
router.get("/games/review-all-active", requireAuth, async (req, res): Promise<void> => {
  const live = await activeManualReview(req.user!.id);
  res.json({ jobId: live?.id ?? null });
});

router.post("/games/review-all", requireAuth, async (req, res): Promise<void> => {
  const jobId = await startManualBulkReview(req.user!.id, req.log);
  res.json({ jobId });
});

// "Review with Coach" for a free player: they're sent to upgrade, and the
// moment they're Pro (whichever way checkout finishes, even if they never
// come back to the app) every game is reviewed with the Coach. See
// startReviewServices.
router.post("/games/review-after-upgrade", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  if (await isUserPremium(userId)) {
    const jobId = await startManualBulkReview(userId, req.log, { coachCatchUp: true });
    res.json({ jobId, started: true });
    return;
  }
  await db.execute(sql`INSERT INTO review_after_upgrade (user_id) VALUES (${userId})
    ON CONFLICT (user_id) DO UPDATE SET created_at = now()`);
  res.json({ queued: true });
});

let reviewServicesStarted = false;
/** Boot: resume interrupted "Review all" jobs; watch for upgrades that asked for a Coach review. */
/** Duplicate copies of the same Chess.com / Lichess game for a member are removed (keeping
 *  the reviewed copy, else the oldest; "played on ChessScout" carries over), then the
 *  database is made to refuse a second copy. The schema always declared this, but the
 *  live database never had the rule. */
async function dedupeExternalGames(): Promise<void> {
  for (const col of ["lichess_game_id", "chesscom_game_id"] as const) {
    const c = sql.raw(col);
    const rank = sql`ROW_NUMBER() OVER (PARTITION BY user_id, ${c} ORDER BY (review_data IS NOT NULL) DESC, COALESCE(via_chessscout, false) DESC, id ASC)`;
    try {
      await db.execute(sql`UPDATE games g SET via_chessscout = true FROM (
          SELECT id, ${rank} AS rn, BOOL_OR(COALESCE(via_chessscout, false)) OVER (PARTITION BY user_id, ${c}) AS any_cs
          FROM games WHERE ${c} IS NOT NULL) r
        WHERE g.id = r.id AND r.rn = 1 AND r.any_cs AND NOT COALESCE(g.via_chessscout, false)`);
      const del = await db.execute(sql`DELETE FROM games WHERE id IN (
          SELECT id FROM (SELECT id, ${rank} AS rn FROM games WHERE ${c} IS NOT NULL) x WHERE rn > 1)`);
      const n = (del as unknown as { rowCount?: number }).rowCount ?? 0;
      if (n) appLogger.info({ col, removed: n }, "[games] removed duplicate copies of games");
      const idx = sql.raw(col === "lichess_game_id" ? "games_user_lichess_unique" : "games_user_chesscom_unique");
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS ${idx} ON games (user_id, ${c}) WHERE ${c} IS NOT NULL`);
    } catch (err) { appLogger.warn({ err, col }, "[games] duplicate clean-up failed"); }
  }
  // Copies that lost their Lichess id but are the same game (same link, same players)
  try {
    await db.execute(sql`DELETE FROM games n USING games k
      WHERE n.user_id = k.user_id AND n.id <> k.id AND n.platform = 'lichess' AND n.lichess_game_id IS NULL
        AND k.lichess_game_id IS NOT NULL AND n.pgn LIKE '%lichess.org/' || k.lichess_game_id || '%'
        AND lower(n.white_username) = lower(k.white_username) AND lower(n.black_username) = lower(k.black_username)`);
  } catch (err) { appLogger.warn({ err }, "[games] id-less duplicate clean-up failed"); }
}

export async function startReviewServices(): Promise<void> {
  if (reviewServicesStarted) return;
  reviewServicesStarted = true;
  // Copies sharing a Lichess / Chess.com id first, then copies of the same game with different
  // ids or none (same players, same moves)
  void dedupeExternalGames().then(() => removeSameGameCopies(appLogger));
  void startCatchupReviews().catch((err) => appLogger.warn({ err }, "catch-up reviews failed to start"));
  void startSamedayReviews().catch((err) => appLogger.warn({ err }, "same-day reviews failed to start"));
  await db.execute(sql`CREATE TABLE IF NOT EXISTS review_after_upgrade (
    user_id VARCHAR PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // Nothing is running yet at boot, so every pending job was cut off by the
  // restart: pick manual ones back up where they left off; drop the rest.
  const pending = await db.select().from(backgroundJobsTable).where(and(
    eq(backgroundJobsTable.type, "bulk_review"), eq(backgroundJobsTable.status, "pending")));
  for (const j of pending) {
    const r = jobResult(j);
    if (r.manual && j.userId && Date.now() - lastActivity(j) < 6 * 3600_000) {
      await db.update(backgroundJobsTable).set({ result: { ...r, heartbeat: Date.now() } as unknown as Record<string, unknown> })
        .where(eq(backgroundJobsTable.id, j.id));
      appLogger.info({ jobId: j.id, userId: j.userId }, "Resuming bulk review after restart");
      runBulkReviewJob(j.userId, j.id, appLogger, MANUAL_BULK_REVIEW_MAX, {
        notify: true, manual: true, coachCatchUp: r.coachCatchUp, offset: r.reviewedSoFar ?? 0,
      }).catch(() => {});
    } else {
      await db.update(backgroundJobsTable).set({ status: "error", error: "Interrupted by a server restart", completedAt: new Date() })
        .where(eq(backgroundJobsTable.id, j.id));
    }
  }

  const sweep = async () => {
    try {
      await db.execute(sql`DELETE FROM review_after_upgrade WHERE created_at < now() - interval '3 days'`);
      const rows = await db.execute(sql`SELECT user_id FROM review_after_upgrade`);
      const list = (Array.isArray(rows) ? rows : ((rows as unknown as { rows?: unknown[] }).rows ?? [])) as { user_id: string }[];
      for (const { user_id } of list) {
        if (!(await isUserPremium(user_id).catch(() => false))) continue;
        await db.execute(sql`DELETE FROM review_after_upgrade WHERE user_id = ${user_id}`);
        appLogger.info({ userId: user_id }, "Upgraded from the review prompt: starting Coach review");
        await startManualBulkReview(user_id, appLogger, { coachCatchUp: true });
      }
    } catch (err) {
      appLogger.warn({ err }, "review-after-upgrade sweep failed");
    }
  };
  setInterval(() => { void sweep(); }, 30_000).unref();
  void sweep();
}

// ── Weekly catch-up reviews for members who've been away ──────────────────
// Once a week per person: anyone who hasn't been on the app for 7 days gets their
// recent games brought in (if they linked Chess.com / Lichess), their latest
// CATCHUP_GAMES unreviewed games reviewed with Stockfish (no AI, so no cost), and,
// if any games were reviewed, one "we reviewed your games" email with links
// straight to the reviews (lib/firstReviewEmail.ts). People using the app are
// left alone. One game at a time with a pause between, so live play and people's
// own reviews always get the engine first. catchup_reviews keeps when each person
// was last done, so a restart carries on. CATCHUP_REVIEWS=0 turns it off.
const CATCHUP_GAMES = Math.max(1, parseInt(process.env.CATCHUP_REVIEW_GAMES || "") || 5);
const CATCHUP_GAP_MS = 20_000;
let catchupRunning = false;
// The latest month, plus the one before on the 1st and 2nd: a game finished just before
// midnight on the last day can reach Chess.com's archive after the new month starts.
const recentMonths = (): number => (new Date().getUTCDate() <= 2 ? 2 : 1);
const rowsOfAny = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];
const LAST_SEEN = sql`GREATEST(u.created_at, COALESCE(u.last_login_at, 'epoch'::timestamptz), COALESCE(u.last_active_at, 'epoch'::timestamptz),
  COALESCE((SELECT MAX(pv.created_at) FROM page_views pv WHERE pv.user_id = u.id), 'epoch'::timestamptz))`;

export async function catchupReviewStatus() {
  const [r] = rowsOfAny<Record<string, number>>(await db.execute(sql`SELECT
      (SELECT COUNT(*)::int FROM users) AS members,
      (SELECT COUNT(*)::int FROM users u WHERE ${LAST_SEEN} < now() - interval '7 days') AS "awayAWeek",
      COUNT(*) FILTER (WHERE last_run_at >= now() - interval '7 days')::int AS "doneThisWeek",
      COUNT(*) FILTER (WHERE last_emailed_at >= now() - interval '7 days')::int AS "emailedThisWeek",
      COALESCE(SUM(reviewed), 0)::int AS "gamesReviewedAllTime"
    FROM catchup_reviews`));
  return { running: catchupRunning, ...r };
}

async function catchupOne(u: { id: string; chesscom_username: string | null; lichess_username: string | null }): Promise<void> {
  // Their latest games from Chess.com / Lichess (already-imported ones are skipped).
  for (const [platform, name] of [["chesscom", u.chesscom_username], ["lichess", u.lichess_username]] as const) {
    if (!name) continue;
    try { await runImportJob({ userId: u.id, platformUsername: name, platform, months: recentMonths(), forceUpdate: false, log: appLogger }); }
    catch (err) { appLogger.warn({ err, userId: u.id, platform }, "[catchup] import failed"); }
  }
  const todo = await db.select().from(gamesTable)
    .where(and(eq(gamesTable.userId, u.id), sql`${gamesTable.platform} IS DISTINCT FROM 'bot'`))
    .orderBy(desc(gamesTable.playedAt)).limit(CATCHUP_GAMES);
  let reviewed = 0;
  for (const g of todo) {
    if (g.reviewData) continue;
    if (await hasActiveManualReview(u.id)) break; // their own "Review all" is on it
    try { await reviewOneGame(g, undefined, u.id, false); reviewed++; }
    catch (err) { appLogger.warn({ err, gameId: g.id }, "[catchup] review failed"); }
    await db.execute(sql`UPDATE catchup_reviews SET reviewed = reviewed + 1, updated_at = now() WHERE user_id = ${u.id}`);
    await new Promise((r) => setTimeout(r, CATCHUP_GAP_MS));
  }
  // Email only when there were games waiting for a review, at most once a week.
  let emailed = false;
  if (reviewed > 0) {
    try { emailed = await (await import("../lib/firstReviewEmail")).sendGamesReviewedEmail(u.id, reviewed); }
    catch (err) { appLogger.warn({ err, userId: u.id }, "[catchup] email failed"); }
  }
  await db.execute(sql`UPDATE catchup_reviews SET status = 'done', last_run_at = now(), updated_at = now()
    ${emailed ? sql`, last_emailed_at = now()` : sql``} WHERE user_id = ${u.id}`);
  appLogger.info({ userId: u.id, reviewed, emailed }, "[catchup] member done");
}

async function catchupTick(): Promise<void> {
  if (catchupRunning) return;
  catchupRunning = true;
  try {
    for (;;) {
      // Next member away for 7+ days who hasn't been done in the last week (longest away first).
      const [u] = rowsOfAny<{ id: string; chesscom_username: string | null; lichess_username: string | null }>(await db.execute(sql`
        SELECT u.id, u.chesscom_username, u.lichess_username FROM users u
        LEFT JOIN catchup_reviews c ON c.user_id = u.id
        WHERE ${LAST_SEEN} < now() - interval '7 days'
          AND u.id NOT IN (SELECT id FROM analytics_excluded_users)
          AND (c.user_id IS NULL OR c.last_run_at IS NULL OR c.last_run_at < now() - interval '7 days')
          AND (c.user_id IS NULL OR c.status <> 'working' OR c.updated_at < now() - interval '30 minutes')
        ORDER BY c.last_run_at ASC NULLS FIRST LIMIT 1`));
      if (!u) break;
      await db.execute(sql`INSERT INTO catchup_reviews (user_id, status) VALUES (${u.id}, 'working')
        ON CONFLICT (user_id) DO UPDATE SET status = 'working', updated_at = now()`);
      try { await catchupOne(u); }
      catch (err) {
        appLogger.warn({ err, userId: u.id }, "[catchup] member failed");
        // Counted as this week's turn, so one bad account can't hold up the rest.
        await db.execute(sql`UPDATE catchup_reviews SET status = 'error', last_run_at = now(), updated_at = now() WHERE user_id = ${u.id}`).catch(() => {});
      }
    }
  } finally { catchupRunning = false; }
}

export async function startCatchupReviews(): Promise<void> {
  if (process.env.CATCHUP_REVIEWS === "0") return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS catchup_reviews (
    user_id VARCHAR PRIMARY KEY, status VARCHAR(16) NOT NULL DEFAULT 'working', reviewed INTEGER NOT NULL DEFAULT 0,
    emailed BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.execute(sql`ALTER TABLE catchup_reviews ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE catchup_reviews ADD COLUMN IF NOT EXISTS last_emailed_at TIMESTAMPTZ`);
  // A few minutes after boot (once the server has settled), then hourly for whoever comes due.
  setTimeout(() => { void catchupTick(); }, 5 * 60_000).unref();
  setInterval(() => { void catchupTick(); }, 60 * 60_000).unref();
}

// ── Same-day reviews ───────────────────────────────────────────────────────
// For members who've used ChessScout in the last 30 days and linked Chess.com or
// Lichess: every few hours their new games are brought in and reviewed with Stockfish
// (no AI, so no cost), and once a day at most they're told the move that decided their
// latest game: a push when they have notifications on, otherwise an email at most every
// 3 days (never alongside the weekly catch-up email). Skipped when they've already been
// on ChessScout since the game. One game at a time with a pause between, so live play and
// people's own reviews get the engine first. SAMEDAY_REVIEWS=0 turns it off.
const SAMEDAY_GAMES = 3;
let samedayRunning = false;

async function samedayOne(u: { id: string; chesscom_username: string | null; lichess_username: string | null }): Promise<void> {
  for (const [platform, name] of [["chesscom", u.chesscom_username], ["lichess", u.lichess_username]] as const) {
    if (!name) continue;
    try { await runImportJob({ userId: u.id, platformUsername: name, platform, months: recentMonths(), forceUpdate: false, log: appLogger }); }
    catch (err) { appLogger.warn({ err, userId: u.id, platform }, "[sameday] import failed"); }
  }
  // Their games from the last day and a half on Chess.com / Lichess, newest first
  const fresh = await db.select().from(gamesTable)
    .where(and(eq(gamesTable.userId, u.id), sql`${gamesTable.platform} IN ('chesscom', 'lichess')`,
      sql`${gamesTable.playedAt} > now() - interval '36 hours'`))
    .orderBy(desc(gamesTable.playedAt)).limit(SAMEDAY_GAMES);
  for (const g of fresh) {
    if (g.reviewData) continue;
    if (await hasActiveManualReview(u.id)) break;
    try { await reviewOneGame(g, undefined, u.id, false); }
    catch (err) { appLogger.warn({ err, gameId: g.id }, "[sameday] review failed"); }
    await new Promise((r) => setTimeout(r, CATCHUP_GAP_MS));
  }
  await samedayNotify(u.id).catch((err) => appLogger.warn({ err, userId: u.id }, "[sameday] notify failed"));
}

async function samedayNotify(userId: string, opts: { minGapMs?: number; quietMs?: number } = {}): Promise<boolean> {
  const minGapMs = opts.minGapMs ?? 20 * 3600_000;
  const [st] = rowsOfAny<{ notified_at: string | null; game_id: number | null; emailed_at: string | null; catchup_emailed: string | null; seen: string; has_push: boolean;
    email: string | null; first_name: string | null; email_opt_out: boolean }>(await db.execute(sql`
    SELECT s.last_notified_at AS notified_at, s.last_game_id AS game_id, s.last_emailed_at AS emailed_at,
      (SELECT c.last_emailed_at FROM catchup_reviews c WHERE c.user_id = u.id) AS catchup_emailed,
      ${LAST_SEEN} AS seen, EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id) AS has_push,
      u.email, u.first_name, u.email_opt_out
    FROM users u LEFT JOIN sameday_reviews s ON s.user_id = u.id WHERE u.id = ${userId}`));
  if (!st) return false;
  if (st.notified_at && Date.now() - new Date(st.notified_at).getTime() < minGapMs) return false; // spacing
  // Their newest freshly reviewed game, if they haven't been on ChessScout since playing it
  const [g] = await db.select().from(gamesTable)
    .where(and(eq(gamesTable.userId, userId), sql`${gamesTable.platform} IN ('chesscom', 'lichess')`,
      sql`${gamesTable.playedAt} > now() - interval '36 hours'`, sql`${gamesTable.reviewData} IS NOT NULL`))
    .orderBy(desc(gamesTable.playedAt)).limit(1);
  if (!g || g.id === st.game_id) return false;
  if (g.playedAt && new Date(st.seen).getTime() > new Date(g.playedAt).getTime()) return false;
  // Still playing? Wait until they've stopped, then tell them about their latest game.
  if (opts.quietMs && g.playedAt && Date.now() - new Date(g.playedAt).getTime() < opts.quietMs) return false;
  const side = await coachSideFor(g);
  const { gameMessage } = await import("../lib/gameNotify");
  const msg = gameMessage({ id: g.id, result: g.result, username: g.username, white_username: g.whiteUsername, black_username: g.blackUsername, review_data: g.reviewData }, side ?? null);
  if (!msg) return false;
  let pushed = false, emailed = false;
  if (st.has_push) {
    const { sendPushToUser, isPushConfigured } = await import("../lib/pushNotifications");
    if (isPushConfigured()) pushed = ((await sendPushToUser(userId, { title: msg.title, body: msg.body, url: msg.url, tag: "cs:sameday" }).catch(() => ({ sent: 0 }))).sent ?? 0) > 0;
  }
  const recent = (t: string | null, days: number) => !!t && Date.now() - new Date(t).getTime() < days * 864e5;
  if (!pushed && st.email && !st.email_opt_out && !recent(st.emailed_at, 3) && !recent(st.catchup_emailed, 3)) {
    const { sendEmail } = await import("../lib/email");
    const { unsubscribeHeaders, unsubscribeUrl } = await import("../lib/emailPrefs");
    const { trackHtml } = await import("../lib/emailTracking");
    const name = (st.first_name || "").trim().split(/\s+/)[0] || null;
    const html = await trackHtml(msg.html(name, unsubscribeUrl(userId)), { kind: "drip", template: "sameday_review", email: st.email, userId, subject: msg.subject });
    await sendEmail({ to: st.email, subject: msg.subject, html, headers: unsubscribeHeaders(userId) });
    emailed = true;
  }
  if (!pushed && !emailed) return false;
  await db.execute(sql`INSERT INTO sameday_reviews (user_id, last_notified_at, last_game_id ${emailed ? sql`, last_emailed_at` : sql``})
    VALUES (${userId}, now(), ${g.id} ${emailed ? sql`, now()` : sql``})
    ON CONFLICT (user_id) DO UPDATE SET last_notified_at = now(), last_game_id = ${g.id} ${emailed ? sql`, last_emailed_at = now()` : sql``}`);
  appLogger.info({ userId, gameId: g.id, pushed, emailed }, "[sameday] told them about their game");
  await db.execute(sql`UPDATE quick_detect SET notified_at = now(), via = ${pushed ? "push" : "email"} WHERE game_id = ${g.id}`).catch(() => {});
  return true;
}

async function samedayTick(): Promise<void> {
  if (samedayRunning) return;
  samedayRunning = true;
  try {
    for (;;) {
      // Next linked member, active in the last 30 days, not checked in the last 3 hours
      const [u] = rowsOfAny<{ id: string; chesscom_username: string | null; lichess_username: string | null }>(await db.execute(sql`
        SELECT u.id, u.chesscom_username, u.lichess_username FROM users u
        LEFT JOIN sameday_reviews s ON s.user_id = u.id
        WHERE (u.chesscom_username IS NOT NULL OR u.lichess_username IS NOT NULL)
          AND ${LAST_SEEN} > now() - interval '30 days'
          AND u.id NOT IN (SELECT id FROM analytics_excluded_users)
          AND (s.last_check_at IS NULL OR s.last_check_at < now() - interval '3 hours')
        ORDER BY s.last_check_at ASC NULLS FIRST LIMIT 1`));
      if (!u) break;
      await db.execute(sql`INSERT INTO sameday_reviews (user_id, last_check_at) VALUES (${u.id}, now())
        ON CONFLICT (user_id) DO UPDATE SET last_check_at = now()`);
      try { await samedayOne(u); }
      catch (err) { appLogger.warn({ err, userId: u.id }, "[sameday] member failed"); }
    }
  } finally { samedayRunning = false; }
}

export async function startSamedayReviews(): Promise<void> {
  if (process.env.SAMEDAY_REVIEWS === "0") return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS sameday_reviews (
    user_id VARCHAR PRIMARY KEY, last_check_at TIMESTAMPTZ, last_notified_at TIMESTAMPTZ,
    last_game_id INTEGER, last_emailed_at TIMESTAMPTZ)`);
  setTimeout(() => { void samedayTick(); }, 8 * 60_000).unref();
  setInterval(() => { void samedayTick(); }, 30 * 60_000).unref();
  await startQuickReviews();
  await startHistoryBackfill();
}

// ── Full history, for every member who's ever signed up ───────────────────────────────
// Sign-up imports 3 months and the background checks keep the latest month current;
// this brings in everything older, once per linked account (all of Chess.com's monthly
// archives, Lichess page by page). One account at a time with a pause between, so
// Chess.com and Lichess see one steady stream of requests. history_backfill keeps who's
// done (and redoes an account if its username changes). HISTORY_BACKFILL=0 turns it off.
// Full histories add a lot of data, and a database that reaches its plan's storage limit
// stops taking writes (the whole site). So the job pauses once the database reaches
// HISTORY_BACKFILL_MAX_MB, or, if that isn't set, 300 MB more than it was when the job
// first ran. Raise the limit to match the Neon plan and it carries on.
let backfillRunning = false;
let backfillPaused: string | null = null;
async function dbSizeMb(): Promise<number> {
  const [r] = rowsOfAny<{ mb: number }>(await db.execute(sql`SELECT (pg_database_size(current_database()) / 1048576)::int AS mb`));
  return Number(r?.mb ?? 0);
}
async function backfillLimitMb(): Promise<number> {
  const env = Number(process.env.HISTORY_BACKFILL_MAX_MB);
  if (Number.isFinite(env) && env > 0) return env;
  const [r] = rowsOfAny<{ v: string }>(await db.execute(sql`SELECT v FROM history_backfill_meta WHERE k = 'baseline_mb'`));
  return Number(r?.v ?? 0) + 300;
}
async function backfillTick(): Promise<void> {
  if (backfillRunning) return;
  backfillRunning = true;
  const until = Date.now() + 9 * 60_000;
  try {
    while (Date.now() < until) {
      const [size, limit] = [await dbSizeMb(), await backfillLimitMb()];
      if (size >= limit) {
        if (!backfillPaused) appLogger.warn({ size, limit }, "[history] paused: database size limit");
        backfillPaused = `Database is ${size} MB; the history import stops at ${limit} MB (HISTORY_BACKFILL_MAX_MB).`;
        break;
      }
      backfillPaused = null;
      const [next] = rowsOfAny<{ id: string; platform: "chesscom" | "lichess"; name: string }>(await db.execute(sql`
        SELECT a.id, a.platform, a.name FROM (
          SELECT id, 'chesscom' AS platform, chesscom_username AS name, created_at FROM users WHERE chesscom_username IS NOT NULL
          UNION ALL
          SELECT id, 'lichess', lichess_username, created_at FROM users WHERE lichess_username IS NOT NULL
        ) a
        LEFT JOIN history_backfill h ON h.user_id = a.id AND h.platform = a.platform
        WHERE h.user_id IS NULL OR lower(h.username) <> lower(a.name)
          OR (h.status = 'error' AND h.finished_at < now() - interval '1 day')
          OR (h.status = 'working' AND h.started_at < now() - interval '2 hours')
        ORDER BY (h.user_id IS NOT NULL), a.created_at DESC LIMIT 1`));
      if (!next) break;
      await db.execute(sql`INSERT INTO history_backfill (user_id, platform, username, status, started_at)
        VALUES (${next.id}, ${next.platform}, ${next.name}, 'working', now())
        ON CONFLICT (user_id, platform) DO UPDATE SET username = EXCLUDED.username, status = 'working', started_at = now(), error = NULL`);
      try {
        const r = await runImportJob({ userId: next.id, platformUsername: next.name, platform: next.platform, months: 600, forceUpdate: false, log: appLogger });
        await db.execute(sql`UPDATE history_backfill SET status = ${r.error ? "error" : "done"}, imported = ${r.imported}, error = ${r.error ?? null}, finished_at = now()
          WHERE user_id = ${next.id} AND platform = ${next.platform}`);
        appLogger.info({ userId: next.id, platform: next.platform, imported: r.imported }, "[history] account done");
      } catch (err) {
        await db.execute(sql`UPDATE history_backfill SET status = 'error', error = ${String((err as Error)?.message ?? err).slice(0, 300)}, finished_at = now()
          WHERE user_id = ${next.id} AND platform = ${next.platform}`).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
  } finally { backfillRunning = false; }
}

export async function historyBackfillStatus() {
  const [r] = rowsOfAny<Record<string, number>>(await db.execute(sql`SELECT
      (SELECT count(*)::int FROM users WHERE chesscom_username IS NOT NULL) + (SELECT count(*)::int FROM users WHERE lichess_username IS NOT NULL) AS accounts,
      (SELECT count(*)::int FROM users WHERE chesscom_username IS NULL AND lichess_username IS NULL) AS "noLinkedAccount",
      count(*) FILTER (WHERE status = 'done')::int AS done,
      count(*) FILTER (WHERE status = 'error')::int AS errors,
      COALESCE(sum(imported) FILTER (WHERE status = 'done'), 0)::int AS "gamesAdded"
    FROM history_backfill`));
  const [sizeMb, limitMb] = await Promise.all([dbSizeMb().catch(() => null), backfillLimitMb().catch(() => null)]);
  return { running: backfillRunning, paused: backfillPaused, sizeMb, limitMb, ...r };
}

async function startHistoryBackfill(): Promise<void> {
  if (process.env.HISTORY_BACKFILL === "0") return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS history_backfill (
    user_id VARCHAR NOT NULL, platform VARCHAR(12) NOT NULL, username VARCHAR(64) NOT NULL,
    status VARCHAR(12) NOT NULL, imported INTEGER, error TEXT,
    started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, PRIMARY KEY (user_id, platform))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS history_backfill_meta (k VARCHAR(32) PRIMARY KEY, v TEXT)`);
  await db.execute(sql`INSERT INTO history_backfill_meta (k, v) VALUES ('baseline_mb', ${String(await dbSizeMb())}) ON CONFLICT (k) DO NOTHING`);
  setTimeout(() => { void backfillTick(); }, 4 * 60_000).unref();
  setInterval(() => { void backfillTick(); }, 10 * 60_000).unref();
}

// ── Quick reviews: minutes after a Chess.com / Lichess game, not hours ─────────────────
// Every member who's ever signed up with a linked account (test accounts too) is checked
// on their own schedule: every 3 min while they're in a playing session (a game in the
// last 2 h), every 15 min if they've been around lately, hourly if seen or played this
// month, every 6 h otherwise. A check is one cheap request: Chess.com answers "304 Not Modified"
// to the current month's archive when nothing has changed (ETag), Lichess is asked for
// games since the last one we have. Requests go one at a time, as both sites ask.
// When a new game shows up it's imported and reviewed straight away (engine only), and
// once they've stopped playing for 8 minutes they get one message about their latest
// game: at most one every 3 hours. quick_detect records how long each step took.
const QUICK_HOT_MS = 3 * 60_000, QUICK_WARM_MS = 15 * 60_000, QUICK_COLD_MS = 60 * 60_000, QUICK_AWAY_MS = 6 * 3600_000;
const QUICK_QUIET_MS = 8 * 60_000, QUICK_GAP_MS = 3 * 3600_000;
const QUICK_UA = "ChessScout.net/1.0 (+https://chessscout.net)";
let quickRunning = false;
let quickPauseUntil = 0;

async function newestPlayed(userId: string, platform: "chesscom" | "lichess"): Promise<number> {
  const [r] = rowsOfAny<{ t: string | null }>(await db.execute(sql`
    SELECT max(played_at) AS t FROM games WHERE user_id = ${userId} AND platform = ${platform}`));
  return r?.t ? new Date(r.t).getTime() : 0;
}

/** Has a Chess.com game finished since the newest one we have? (one request, usually a 304) */
async function chesscomHasNew(userId: string, name: string, etag: string | null, month: string | null):
  Promise<{ changed: boolean; etag: string | null; month: string }> {
  const now = new Date();
  const m = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const headers: Record<string, string> = { "User-Agent": QUICK_UA };
  if (etag && month === m) headers["If-None-Match"] = etag;
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(name.toLowerCase())}/games/${m}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (res.status === 304) return { changed: false, etag, month: m };
  if (res.status === 429) { quickPauseUntil = Date.now() + 5 * 60_000; return { changed: false, etag, month: month ?? m }; }
  if (!res.ok) return { changed: false, etag: null, month: m };
  const body = (await res.json().catch(() => null)) as { games?: Array<{ end_time?: number }> } | null;
  const newest = Math.max(0, ...(body?.games ?? []).map((g) => (g.end_time ?? 0) * 1000));
  const have = await newestPlayed(userId, "chesscom");
  return { changed: newest > have + 1000, etag: res.headers.get("etag"), month: m };
}

async function lichessHasNew(userId: string, name: string): Promise<boolean> {
  const since = (await newestPlayed(userId, "lichess")) + 1000;
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(name)}?since=${since}&max=1&moves=false`, {
    headers: { Accept: "application/x-ndjson", "User-Agent": QUICK_UA }, signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) { quickPauseUntil = Date.now() + 2 * 60_000; return false; }
  if (!res.ok) return false;
  return (await res.text()).trim().length > 0;
}

type QuickMember = { id: string; chesscom_username: string | null; lichess_username: string | null; cc_etag: string | null; cc_month: string | null; recent_seen: boolean; month_seen: boolean };

async function quickOne(u: QuickMember): Promise<void> {
  const started = new Date();
  let etag = u.cc_etag, month = u.cc_month, found = false;
  if (u.chesscom_username) {
    try {
      const c = await chesscomHasNew(u.id, u.chesscom_username, u.cc_etag, u.cc_month);
      etag = c.etag; month = c.month;
      if (c.changed) { found = true; await runImportJob({ userId: u.id, platformUsername: u.chesscom_username, platform: "chesscom", months: recentMonths(), forceUpdate: false, log: appLogger }); }
    } catch (err) { appLogger.warn({ err, userId: u.id }, "[quick] chess.com check failed"); }
  }
  if (u.lichess_username) {
    try {
      if (await lichessHasNew(u.id, u.lichess_username)) { found = true; await runImportJob({ userId: u.id, platformUsername: u.lichess_username, platform: "lichess", months: recentMonths(), forceUpdate: false, log: appLogger }); }
    } catch (err) { appLogger.warn({ err, userId: u.id }, "[quick] lichess check failed"); }
  }
  if (found) {
    // What just came in, newest first: note when we caught it, then review it
    const fresh = await db.select().from(gamesTable)
      .where(and(eq(gamesTable.userId, u.id), sql`${gamesTable.platform} IN ('chesscom', 'lichess')`,
        sql`${gamesTable.createdAt} >= ${started.toISOString()}`, sql`${gamesTable.playedAt} > now() - interval '6 hours'`))
      .orderBy(desc(gamesTable.playedAt)).limit(SAMEDAY_GAMES);
    for (const g of fresh) {
      await db.execute(sql`INSERT INTO quick_detect (game_id, user_id, platform, ended_at, detected_at)
        VALUES (${g.id}, ${u.id}, ${g.platform}, ${g.playedAt.toISOString()}, now()) ON CONFLICT (game_id) DO NOTHING`).catch(() => {});
    }
    for (const g of fresh) {
      if (g.reviewData) continue;
      if (await hasActiveManualReview(u.id)) break;
      try {
        await reviewOneGame(g, undefined, u.id, false);
        await db.execute(sql`UPDATE quick_detect SET reviewed_at = now() WHERE game_id = ${g.id}`).catch(() => {});
      } catch (err) { appLogger.warn({ err, gameId: g.id }, "[quick] review failed"); }
    }
  }
  await samedayNotify(u.id, { minGapMs: QUICK_GAP_MS, quietMs: QUICK_QUIET_MS }).catch((err) => appLogger.warn({ err, userId: u.id }, "[quick] notify failed"));

  // When to look again
  const newest = Math.max(await newestPlayed(u.id, "chesscom"), await newestPlayed(u.id, "lichess"));
  const inSession = Date.now() - newest < 2 * 3600_000;
  const wait = inSession ? QUICK_HOT_MS
    : u.recent_seen || Date.now() - newest < 7 * 864e5 ? QUICK_WARM_MS
    : u.month_seen || Date.now() - newest < 30 * 864e5 ? QUICK_COLD_MS
    : QUICK_AWAY_MS;
  await db.execute(sql`INSERT INTO sameday_reviews (user_id, next_quick_at, cc_etag, cc_month)
    VALUES (${u.id}, ${new Date(Date.now() + wait).toISOString()}, ${etag}, ${month})
    ON CONFLICT (user_id) DO UPDATE SET next_quick_at = EXCLUDED.next_quick_at, cc_etag = EXCLUDED.cc_etag, cc_month = EXCLUDED.cc_month`);
}

async function quickTick(): Promise<void> {
  if (quickRunning || Date.now() < quickPauseUntil) return;
  quickRunning = true;
  try {
    const due = rowsOfAny<QuickMember>(await db.execute(sql`
      SELECT u.id, u.chesscom_username, u.lichess_username, s.cc_etag, s.cc_month,
        (${LAST_SEEN} > now() - interval '14 days') AS recent_seen,
        (${LAST_SEEN} > now() - interval '30 days') AS month_seen
      FROM users u LEFT JOIN sameday_reviews s ON s.user_id = u.id
      WHERE (u.chesscom_username IS NOT NULL OR u.lichess_username IS NOT NULL)
        AND (s.next_quick_at IS NULL OR s.next_quick_at <= now())
      ORDER BY s.next_quick_at ASC NULLS FIRST LIMIT 40`));
    for (const u of due) {
      if (Date.now() < quickPauseUntil) break;
      try { await quickOne(u); }
      catch (err) { appLogger.warn({ err, userId: u.id }, "[quick] member failed"); }
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally { quickRunning = false; }
}

async function startQuickReviews(): Promise<void> {
  if (process.env.QUICK_REVIEWS === "0") return;
  await db.execute(sql`ALTER TABLE sameday_reviews ADD COLUMN IF NOT EXISTS next_quick_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE sameday_reviews ADD COLUMN IF NOT EXISTS cc_etag TEXT`);
  await db.execute(sql`ALTER TABLE sameday_reviews ADD COLUMN IF NOT EXISTS cc_month VARCHAR(8)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS quick_detect (
    game_id INTEGER PRIMARY KEY, user_id VARCHAR NOT NULL, platform VARCHAR(12),
    ended_at TIMESTAMPTZ, detected_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ, notified_at TIMESTAMPTZ, via VARCHAR(8),
    opened_at TIMESTAMPTZ)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS quick_detect_ended ON quick_detect (ended_at)`);
  setTimeout(() => { void quickTick(); }, 3 * 60_000).unref();
  setInterval(() => { void quickTick(); }, 60_000).unref();
}


// Mend a saved AI review where some moves have no coach notes: ask the coach about
// just those moves and save them. Only for the game's owner with the AI coach.
const coachGapRuns = new Set<number>();
router.post("/games/:id/coach-gaps", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [game] = Number.isFinite(id) ? await db.select().from(gamesTable).where(eq(gamesTable.id, id)) : [];
  if (!game || game.userId !== req.user!.id) { res.status(404).json({ error: "Not found" }); return; }
  const rd = game.reviewData as Record<string, unknown> | null;
  const moves = rd && Array.isArray(rd.moves) ? (rd.moves as MoveReview[]) : null;
  // One try per review: moves the coach still can't cover aren't asked about on every visit
  // coachGapsDone: gaps filled (the first version could leave some, marked coachGapsTried)
  if (!rd || !moves || !aiFlag(rd) || rd.coachGapsDone || !(await aiCoachForOwner(game.userId))) { res.json({ filled: 0 }); return; }
  if (coachGapRuns.has(id)) { res.json({ filled: 0, busy: true }); return; }
  coachGapRuns.add(id);
  try {
    const filled = await fillCoachGaps({
      moves, whiteUsername: game.whiteUsername, blackUsername: game.blackUsername,
      opening: game.opening ?? null, result: game.result ?? "", userId: game.userId ?? undefined,
    });
    await db.update(gamesTable).set({ reviewData: { ...rd, moves, coachGapsDone: true } as unknown as Record<string, unknown> }).where(eq(gamesTable.id, id));
    res.json({
      filled,
      reviewData: filled > 0 ? {
        moves: refreshBasicReview(markBookMoves(moves), true, game.opening ?? null),
        gameSummary: rd.gameSummary ?? null, whiteAccuracy: rd.whiteAccuracy ?? null, blackAccuracy: rd.blackAccuracy ?? null, aiCoach: true,
      } : undefined,
    });
  } catch (err) {
    req.log.warn({ err, gameId: id }, "coach gap fill failed");
    res.json({ filled: 0 });
  } finally { coachGapRuns.delete(id); }
});

// The member opened a game from its quick-review message
router.post("/games/:id/quick-opened", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isFinite(id)) {
    await db.execute(sql`UPDATE quick_detect SET opened_at = COALESCE(opened_at, now()) WHERE game_id = ${id} AND user_id = ${req.user!.id}`).catch(() => {});
  }
  res.json({ ok: true });
});

router.get("/games/review-all-status/:jobId", requireAuth, async (req, res): Promise<void> => {
  const [job] = await db.select().from(backgroundJobsTable).where(
    and(eq(backgroundJobsTable.id, req.params.jobId as string), eq(backgroundJobsTable.userId, req.user!.id))
  );
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: job.status, error: job.error, ...(job.result as object ?? {}) });
});

async function runReviewJob(gameId: number, jobId: string, log: Logger): Promise<void> {
  try {
    const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId));
    if (!game) {
      await db.update(backgroundJobsTable).set({
        status: "error",
        error: "Game not found",
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, jobId));
      return;
    }

    const moves = parsePgnMoves(game.pgn);
    const startFen = extractStartFen(game.pgn);
    let engineBasic: unknown[] | null = null;
    let engineAcc = { whiteAccuracy: 0, blackAccuracy: 0 };
    const writeInterim = (ms: unknown[], coached: number) => {
      const interim = { moves: ms, ...engineAcc, coached, total: ms.length };
      db.execute(sql`UPDATE background_jobs SET result = COALESCE(result, '{}'::jsonb) || ${JSON.stringify({ interim })}::jsonb
        WHERE id = ${jobId}`).catch(() => {});
    };
    const reviewResult = await reviewFullGame({
      moves,
      opening: game.opening,
      eco: game.eco,
      result: outcomeLine(game),
      whiteUsername: game.whiteUsername,
      blackUsername: game.blackUsername,
      startFen: startFen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" ? startFen : undefined,
      onProgress: (done, total, evals) => {
        // the evaluations so far go along, so the review page's bar moves while it waits
        db.execute(sql`UPDATE background_jobs SET result = COALESCE(result, '{}'::jsonb) || ${JSON.stringify({ progress: done, total, ...(evals ? { evals } : {}) })}::jsonb
          WHERE id = ${jobId}`).catch(() => {});
      },
      // Stockfish is done long before the AI coach: the engine review is shown meanwhile.
      onEngineReady: (r) => {
        engineBasic = refreshBasicReview(markBookMoves(r.moves), false, game.opening ?? null) as unknown[];
        engineAcc = { whiteAccuracy: r.whiteAccuracy, blackAccuracy: r.blackAccuracy };
        writeInterim(engineBasic, 0);
      },
      // Each part of the coach's notes goes in as it's written; moves it hasn't reached
      // yet keep the engine review's explanations.
      onCoachProgress: (r) => {
        if (!engineBasic) return;
        const covered = new Set(r.covered);
        const merged = markBookMoves(r.moves) as unknown[];
        writeInterim(engineBasic.map((m, i) => (covered.has(i) && merged[i] ? merged[i] : m)), covered.size);
      },
      userId: game.userId ?? undefined,
      aiCoach: await aiCoachForOwner(game.userId),
      coachSide: await coachSideFor(game),
    });

    await saveReview(gameId, reviewResult);

    await db.update(backgroundJobsTable).set({
      status: "done",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));

    log.info({ jobId, gameId }, "Review job complete");
  } catch (err) {
    log.error({ err, jobId, gameId }, "Review job failed");
    const msg = err instanceof Error ? err.message : "Review failed";
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: msg,
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  }
}

const STALE_JOB_MS = 5 * 60 * 1000;

const RE_REVIEW_COOLDOWN_MS = 5 * 60 * 1000;
const RE_REVIEW_PER_TRIGGER = 2;
const lastReReviewTriggerByUser = new Map<string, number>();

const STALE_REVIEW_BAD_FILTER = sql`(
  jsonb_path_exists(${gamesTable.reviewData}, '$.moves[*] ? (@.classification == "blunder" || @.classification == "mistake" || @.classification == "inaccuracy" || @.classification == "missed_win")'::jsonpath)
  OR jsonb_path_exists(${gamesTable.reviewData}, '$[*] ? (@.classification == "blunder" || @.classification == "mistake" || @.classification == "inaccuracy" || @.classification == "missed_win")'::jsonpath)
)`;

const STALE_REVIEW_NO_BEST_LINE_FILTER = sql`NOT (
  jsonb_path_exists(${gamesTable.reviewData}, '$.moves[*].bestLineSan[0]'::jsonpath)
  OR jsonb_path_exists(${gamesTable.reviewData}, '$[*].bestLineSan[0]'::jsonpath)
)`;

async function triggerBackgroundReReviewForStaleReviews(userId: string, log: Logger): Promise<void> {
  const now = Date.now();
  const last = lastReReviewTriggerByUser.get(userId) ?? 0;
  if (now - last < RE_REVIEW_COOLDOWN_MS) return;
  lastReReviewTriggerByUser.set(userId, now);

  try {
    const [{ value: pendingCount }] = await db
      .select({ value: count() })
      .from(backgroundJobsTable)
      .where(and(
        eq(backgroundJobsTable.userId, userId),
        eq(backgroundJobsTable.type, "review"),
        eq(backgroundJobsTable.status, "pending"),
      ));

    if (Number(pendingCount) > 0) return;

    const stale = await db
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(and(
        eq(gamesTable.userId, userId),
        sql`${gamesTable.reviewData} IS NOT NULL`,
        STALE_REVIEW_BAD_FILTER,
        STALE_REVIEW_NO_BEST_LINE_FILTER,
        // Only engine reviews get redone in the background; AI reviews are kept as they are.
        sql`COALESCE(${gamesTable.reviewData}->>'aiCoach', 'true') = 'false'`,
      ))
      .orderBy(asc(gamesTable.playedAt))
      .limit(RE_REVIEW_PER_TRIGGER);

    if (stale.length === 0) return;

    log.info({ userId, count: stale.length }, "Auto-queueing background re-review for stale (older) game reviews");

    for (const g of stale) {
      const active = await findActiveReviewJob(g.id);
      if (active) continue;

      const jobId = randomUUID();
      await db.insert(backgroundJobsTable).values({
        id: jobId,
        userId,
        type: "review",
        status: "pending",
        targetUsername: String(g.id),
      });
      runReviewJob(g.id, jobId, log).catch(() => {});
    }
  } catch (err) {
    log.warn({ err, userId }, "Failed to schedule background re-review for stale reviews");
  }
}

async function findActiveReviewJob(gameId: number) {
  const [job] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.type, "review"),
      eq(backgroundJobsTable.targetUsername, String(gameId)),
      eq(backgroundJobsTable.status, "pending"),
    )
  );
  if (!job) return null;
  const age = Date.now() - new Date(job.createdAt!).getTime();
  if (age > STALE_JOB_MS) {
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: "Timed out (server restart or crash)",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, job.id));
    return null;
  }
  return job;
}

router.get("/games/:id/review", async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select({ reviewData: gamesTable.reviewData, opening: gamesTable.opening })
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  if (game.reviewData) {
    const cached = game.reviewData as Record<string, unknown>;
    let moves = cached.moves ?? cached;
    const gameSummary = cached.gameSummary ?? null;
    const whiteAccuracy = cached.whiteAccuracy ?? null;
    const blackAccuracy = cached.blackAccuracy ?? null;
    if (Array.isArray(moves) && moves.length > 0 && !cached._v2) {
      moves = (moves as Record<string, unknown>[]).map(m => {
        const { cpLoss, engineAvailable, ...rest } = m;
        return rest;
      });
    }
    res.json({ status: "done", reviewData: { moves: refreshBasicReview(markBookMoves(moves), aiFlag(cached), (game as { opening?: string | null }).opening ?? null), gameSummary, whiteAccuracy, blackAccuracy, aiCoach: aiFlag(cached) } });
    return;
  }

  const activeJob = await findActiveReviewJob(params.data.id);

  if (activeJob) {
    res.json({ status: "pending", jobId: activeJob.id });
    return;
  }

  res.json({ status: "none", reviewData: null });
});

router.post("/games/:id/review", async (req, res): Promise<void> => {
  const params = GetGameReplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, params.data.id));

  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  // A forced re-review (e.g. a Pro member adding the AI coach to a review
  // that was done while they were on the free plan) is only for the game's
  // owner or an admin -- otherwise anyone could re-run reviews on any game.
  let forceReview = req.query.force === "true";
  if (forceReview) {
    const requesterId = req.user?.id;
    let allowed = !!requesterId && requesterId === game.userId;
    if (!allowed && requesterId) {
      const [u] = await db.select({ isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.id, requesterId));
      allowed = !!u?.isAdmin;
    }
    if (!allowed) forceReview = false;
  }

  if (game.reviewData && !forceReview) {
    const cached = game.reviewData as Record<string, unknown>;
    let moves = cached.moves ?? cached;
    const gameSummary = cached.gameSummary ?? null;
    const whiteAccuracy = cached.whiteAccuracy ?? null;
    const blackAccuracy = cached.blackAccuracy ?? null;
    if (Array.isArray(moves) && moves.length > 0 && !cached._v2) {
      moves = (moves as Record<string, unknown>[]).map(m => {
        const { cpLoss, engineAvailable, ...rest } = m;
        return rest;
      });
    }
    res.json({ status: "done", reviewData: { moves: refreshBasicReview(markBookMoves(moves), aiFlag(cached), (game as { opening?: string | null }).opening ?? null), gameSummary, whiteAccuracy, blackAccuracy, aiCoach: aiFlag(cached) } });
    return;
  }

  const existingJob = await findActiveReviewJob(params.data.id);

  if (existingJob) {
    res.json({ status: "pending", jobId: existingJob.id });
    return;
  }

  if (forceReview) {
    await db.update(gamesTable)
      .set({ reviewData: null })
      .where(eq(gamesTable.id, params.data.id));
  }

  const userId = req.user?.id ?? "anonymous";
  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId,
    userId,
    type: "review",
    status: "pending",
    targetUsername: String(params.data.id),
  });

  res.json({ status: "pending", jobId });
  runReviewJob(params.data.id, jobId, req.log).catch(() => {});
});

// ── One free AI game review (the Instagram link: chessscout.net/review) ─────────
// A signed-up player picks one of their recent Chess.com / Lichess games and gets the
// full AI coach review once, free. Pro players can use it any time. A daily cap keeps
// the OpenAI cost bounded.
const FREE_REVIEW_DAILY_CAP = 300;
type FreeRecent = { ref: string; white: string; black: string; whiteRating: number; blackRating: number; result: string; opening: string | null; playedAt: string; timeControl: string };

async function ensureFreeReviewTable(): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS free_ai_reviews (user_id varchar PRIMARY KEY, game_id integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
}

/** The player's 10 most recent finished games, newest first, with the metadata and PGN. */
async function recentForFreeReview(platform: "chesscom" | "lichess", username: string) {
  if (platform === "lichess") {
    // Just the 10 most recent (it used to pull a whole month or six, which for an active
    // player is thousands of games: the page timed out with "Failed to fetch").
    const list = (await fetchLichessGames(username, 120, 10, true)).filter((g) => !!g.pgn).slice(0, 10);
    return list.map((g) => ({ meta: extractLichessGameMetadata(g, username), pgn: g.pgn!, ref: g.id }));
  }
  const archives = await fetchChessComArchiveList(username);
  const out: { meta: ReturnType<typeof extractGameMetadata>; pgn: string; ref: string }[] = [];
  for (const a of archives.slice(-3).reverse()) {
    const games = (await fetchChessComGamesForArchive(a)).filter((g) => !!g.pgn).sort((x, y) => y.end_time - x.end_time);
    for (const g of games) { const meta = extractGameMetadata(g, username); out.push({ meta, pgn: g.pgn, ref: meta.chesscomGameId ?? g.url }); if (out.length >= 10) break; }
    if (out.length >= 10) break;
  }
  return out;
}

router.get("/free-review/status", requireAuth, async (req, res): Promise<void> => {
  await ensureFreeReviewTable();
  const [used] = rowsOfAny<{ game_id: number }>(await db.execute(sql`SELECT game_id FROM free_ai_reviews WHERE user_id = ${req.user!.id}`));
  const pro = await isUserPremium(req.user!.id).catch(() => false);
  res.json({ used: !!used, gameId: used?.game_id ?? null, pro });
});

router.get("/free-review/recent", requireAuth, async (req, res): Promise<void> => {
  const platform = req.query.platform === "lichess" ? "lichess" : "chesscom";
  const username = String(req.query.username ?? "").trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(username)) { res.status(400).json({ error: "Enter your username." }); return; }
  try {
    const list = await recentForFreeReview(platform, username);
    const games: FreeRecent[] = list.map(({ meta, ref }) => ({
      ref, white: meta.whiteUsername, black: meta.blackUsername, whiteRating: meta.whiteRating, blackRating: meta.blackRating,
      result: meta.result, opening: meta.opening, playedAt: new Date(meta.playedAt).toISOString(), timeControl: meta.timeControl,
    }));
    res.json({ games });
  } catch {
    res.status(404).json({ error: platform === "lichess" ? "We couldn't find that Lichess username." : "We couldn't find that Chess.com username." });
  }
});

// The Instagram page (chessscout.net/ig): a visitor sees their own recent games before
// signing up. No account needed, so it's capped per visitor address.
const previewHits = new Map<string, { n: number; at: number }>();
router.get("/free-review/preview", async (req, res): Promise<void> => {
  const ip = String(req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"] ?? req.ip ?? "").split(",")[0].trim();
  const now = Date.now();
  const h = previewHits.get(ip);
  if (h && now - h.at < 10 * 60_000) { if (++h.n > 20) { res.status(429).json({ error: "Too many lookups. Try again in a few minutes." }); return; } }
  else previewHits.set(ip, { n: 1, at: now });
  if (previewHits.size > 5000) for (const [k, v] of previewHits) if (now - v.at > 10 * 60_000) previewHits.delete(k);
  const platform = req.query.platform === "lichess" ? "lichess" : "chesscom";
  const username = String(req.query.username ?? "").trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(username)) { res.status(400).json({ error: "Enter your username." }); return; }
  try {
    const list = await recentForFreeReview(platform, username);
    const games: FreeRecent[] = list.map(({ meta, ref }) => ({
      ref, white: meta.whiteUsername, black: meta.blackUsername, whiteRating: meta.whiteRating, blackRating: meta.blackRating,
      result: meta.result, opening: meta.opening, playedAt: new Date(meta.playedAt).toISOString(), timeControl: meta.timeControl,
    }));
    res.json({ games });
  } catch {
    res.status(404).json({ error: platform === "lichess" ? "We couldn't find that Lichess username." : "We couldn't find that Chess.com username." });
  }
});

router.post("/free-review", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const platform = req.body?.platform === "lichess" ? "lichess" : "chesscom";
  const username = String(req.body?.username ?? "").trim();
  const ref = String(req.body?.ref ?? "");
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(username) || !ref) { res.status(400).json({ error: "Pick a game first." }); return; }
  await ensureFreeReviewTable();
  const pro = await isUserPremium(userId).catch(() => false);
  if (!pro) {
    const [used] = rowsOfAny<{ game_id: number }>(await db.execute(sql`SELECT game_id FROM free_ai_reviews WHERE user_id = ${userId}`));
    if (used) { res.status(409).json({ error: "You've already used your free AI review.", gameId: used.game_id }); return; }
    const [{ n } = { n: 0 }] = rowsOfAny<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM free_ai_reviews WHERE created_at > now() - interval '1 day'`));
    if (n >= FREE_REVIEW_DAILY_CAP) { res.status(429).json({ error: "Today's free reviews are all taken. Come back tomorrow." }); return; }
  }
  let picked: Awaited<ReturnType<typeof recentForFreeReview>>[number] | undefined;
  try { picked = (await recentForFreeReview(platform, username)).find((g) => g.ref === ref); } catch { /* below */ }
  if (!picked) { res.status(404).json({ error: "We couldn't load that game. Try another one." }); return; }

  // Link the username to the account if it isn't yet (it's how "you" is found in the game).
  try {
    const [u] = await db.select({ c: usersTable.chesscomUsername, l: usersTable.lichessUsername }).from(usersTable).where(eq(usersTable.id, userId));
    if (platform === "chesscom" && !u?.c) await db.update(usersTable).set({ chesscomUsername: username }).where(eq(usersTable.id, userId));
    if (platform === "lichess" && !u?.l) await db.update(usersTable).set({ lichessUsername: username }).where(eq(usersTable.id, userId));
  } catch { /* the review still works */ }

  // The game in their games (an existing copy if they already imported it).
  const meta = picked.meta as Record<string, unknown> & { chesscomGameId?: string | null; lichessGameId?: string | null };
  let gameId: number | undefined;
  const existing = meta.chesscomGameId
    ? await db.select({ id: gamesTable.id }).from(gamesTable).where(and(eq(gamesTable.userId, userId), eq(gamesTable.chesscomGameId, meta.chesscomGameId))).limit(1)
    : meta.lichessGameId
      ? await db.select({ id: gamesTable.id }).from(gamesTable).where(and(eq(gamesTable.userId, userId), eq(gamesTable.lichessGameId, meta.lichessGameId))).limit(1)
      : [];
  gameId = existing[0]?.id;
  if (!gameId) {
    const [row] = await db.insert(gamesTable).values({
      userId, username: username.toLowerCase(), pgn: picked.pgn,
      ...(platform === "chesscom" ? { platform: "chesscom" as const } : {}),
      ...(picked.meta as object),
    } as typeof gamesTable.$inferInsert).onConflictDoNothing().returning({ id: gamesTable.id });
    gameId = row?.id;
  }
  if (!gameId) { res.status(500).json({ error: "Couldn't save that game. Try again." }); return; }

  if (!pro) await db.execute(sql`INSERT INTO free_ai_reviews (user_id, game_id) VALUES (${userId}, ${gameId}) ON CONFLICT (user_id) DO NOTHING`);

  // Already reviewed by the AI coach: nothing to do.
  const [g] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId));
  if (g?.reviewData && hasAiText(g.reviewData)) { res.json({ gameId }); return; }
  const active = await findActiveReviewJob(gameId);
  if (active) { res.json({ gameId }); return; }
  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({ id: jobId, userId, type: "review", status: "pending", targetUsername: String(gameId) });
  res.json({ gameId });
  void (async () => {
    try {
      await db.update(gamesTable).set({ reviewData: null }).where(eq(gamesTable.id, gameId!));
      const [fresh] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId!));
      await reviewOneGame(fresh, (done, total) => {
        db.update(backgroundJobsTable).set({ result: { progress: done, total } as unknown as Record<string, unknown> }).where(eq(backgroundJobsTable.id, jobId)).catch(() => {});
      }, userId, true);
      await db.update(backgroundJobsTable).set({ status: "done", completedAt: new Date() }).where(eq(backgroundJobsTable.id, jobId));
    } catch (err) {
      req.log.error({ err, gameId }, "Free AI review failed");
      await db.update(backgroundJobsTable).set({ status: "error", error: "Review failed", completedAt: new Date() }).where(eq(backgroundJobsTable.id, jobId));
      if (!pro) await db.execute(sql`DELETE FROM free_ai_reviews WHERE user_id = ${userId} AND game_id = ${gameId}`).catch(() => {}); // give the free review back
    }
  })();
});

export default router;
