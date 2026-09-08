import { db, gamesTable, backgroundJobsTable, bulkCrawlQueueTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { fetchChessComGames, extractGameMetadata, parsePgnMoves } from "./chesscom";
import { reviewGameEngineOnly, destroyBulkEngine } from "./bulkStockfish";
import { logger } from "./logger";

const CHESSCOM_REQUEST_DELAY_MS = 1500; // respectful pace against Chess.com's public API
const CHESSCOM_USER_AGENT = "ChessCoach/1.0";
const FETCH_TIMEOUT_MS = 20000;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Neither the Chess.com fetch nor the bulk Stockfish engine call had any
// timeout at all -- if either one ever stalls (a hung network request, a
// dead engine process that never rejects), the loop below would freeze
// on that single await forever. Since the stop-check only happens
// between loop iterations, a stuck await here is exactly what made the
// job look "stopped working" and made clicking Stop hang indefinitely --
// there was no way to ever get back around to checking the stop flag.
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// Seeds the crawl queue from Chess.com's public leaderboards the first
// time this runs. After that, the queue grows on its own -- every
// opponent found in a fetched game gets added too, so the crawl keeps
// expanding outward without needing a bigger seed list.
async function seedQueueFromLeaderboards(): Promise<number> {
  const categories = ["live_rapid", "live_blitz", "live_bullet", "daily"];
  const usernames = new Set<string>();
  for (const category of categories) {
    try {
      const res = await fetch(`https://api.chess.com/pub/leaderboards`, { headers: { "User-Agent": CHESSCOM_USER_AGENT } });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, { username?: string }[]>;
      for (const entry of data[category] ?? []) {
        if (entry.username) usernames.add(entry.username.toLowerCase());
      }
    } catch (err) {
      logger.warn({ err, category }, "Failed to fetch Chess.com leaderboard");
    }
    await sleep(CHESSCOM_REQUEST_DELAY_MS);
  }
  if (usernames.size === 0) return 0;
  await db.insert(bulkCrawlQueueTable)
    .values(Array.from(usernames).map((username) => ({ username, platform: "chesscom" as const })))
    .onConflictDoNothing();
  return usernames.size;
}

async function updateJobProgress(jobId: string, patch: Record<string, unknown>) {
  const [job] = await db.select({ result: backgroundJobsTable.result }).from(backgroundJobsTable).where(eq(backgroundJobsTable.id, jobId));
  const current = (job?.result as Record<string, unknown>) ?? {};
  await db.update(backgroundJobsTable).set({ result: { ...current, ...patch } }).where(eq(backgroundJobsTable.id, jobId));
}

// The whole point of running this as a detached loop instead of one big
// request handler: it's designed to run for a very long time (weeks to
// months, by the admin's own choice), checking in on its own stop flag
// between every game rather than trying to do everything in one shot.
export async function runBulkCrawlJob(jobId: string, targetGames: number, depth: number, engineDelayMs: number): Promise<void> {
  try {
    const [queueCount] = await db.select({ c: sql<number>`count(*)` }).from(bulkCrawlQueueTable);
    if (Number(queueCount?.c ?? 0) === 0) {
      const seeded = await seedQueueFromLeaderboards();
      logger.info({ jobId, seeded }, "Bulk crawl: seeded queue from leaderboards");
    }

    let gamesImported = 0;
    let gamesReviewed = 0;
    let usernamesProcessed = 0;

    while (gamesImported < targetGames) {
      const [job] = await db.select({ status: backgroundJobsTable.status }).from(backgroundJobsTable).where(eq(backgroundJobsTable.id, jobId));
      if (!job || job.status === "stopping") {
        logger.info({ jobId }, "Bulk crawl: stop requested, exiting cleanly");
        break;
      }

      const [next] = await db.select().from(bulkCrawlQueueTable)
        .where(eq(bulkCrawlQueueTable.status, "pending"))
        .limit(1);

      if (!next) {
        // Queue exhausted -- try reseeding once more before giving up
        // for this run; the admin can just start it again later, and
        // by then the leaderboards may look different anyway.
        const seeded = await seedQueueFromLeaderboards();
        if (seeded === 0) {
          logger.info({ jobId }, "Bulk crawl: queue exhausted and reseed found nothing new, stopping");
          break;
        }
        continue;
      }

      try {
        const games = await withTimeout(fetchChessComGames(next.username, 1), FETCH_TIMEOUT_MS, `fetchChessComGames(${next.username})`);
        await sleep(CHESSCOM_REQUEST_DELAY_MS);

        for (const game of games) {
          if (gamesImported >= targetGames) break;

          // Checking the stop flag here too, not just once per username --
          // a single username's games can take a while to get through
          // (especially with several games each needing an engine pass),
          // and only checking between usernames meant Stop could take a
          // very long time to actually take effect.
          const [jobNow] = await db.select({ status: backgroundJobsTable.status }).from(backgroundJobsTable).where(eq(backgroundJobsTable.id, jobId));
          if (!jobNow || jobNow.status === "stopping") {
            logger.info({ jobId }, "Bulk crawl: stop requested mid-username, exiting cleanly");
            await updateJobProgress(jobId, { gamesImported, gamesReviewed, usernamesProcessed });
            await db.update(backgroundJobsTable).set({ status: "done", completedAt: new Date() }).where(eq(backgroundJobsTable.id, jobId));
            return;
          }

          const meta = extractGameMetadata(game, next.username);
          if (meta.chesscomGameId) {
            const [existing] = await db.select({ id: gamesTable.id }).from(gamesTable)
              .where(and(isNull(gamesTable.userId), eq(gamesTable.chesscomGameId, meta.chesscomGameId)));
            if (existing) continue; // already have this exact game from a previous run
          }

          const moves = parsePgnMoves(game.pgn);
          if (moves.length === 0) continue;

          const [inserted] = await db.insert(gamesTable).values({
            userId: null,
            username: next.username,
            pgn: game.pgn,
            whiteUsername: meta.whiteUsername,
            blackUsername: meta.blackUsername,
            whiteRating: meta.whiteRating,
            blackRating: meta.blackRating,
            result: meta.result,
            timeControl: meta.timeControl,
            opening: meta.opening,
            eco: meta.eco,
            playedAt: meta.playedAt,
            url: meta.url,
            chesscomGameId: meta.chesscomGameId,
            platform: "chesscom",
          }).returning({ id: gamesTable.id });
          gamesImported++;

          // Real Stockfish review, no OpenAI call anywhere in this path.
          // Timeout is proportional to move count (generous -- this is
          // meant to catch a genuinely stuck/dead engine process, not
          // penalize a long game that's legitimately still working) so a
          // hung engine gets torn down and rebuilt instead of blocking
          // the whole crawl loop indefinitely.
          try {
            const fens = [moves[0].fenBefore, ...moves.map((m) => m.fen).filter((f): f is string => !!f)];
            const colors = moves.map((m) => m.color as "white" | "black");
            const sans = moves.map((m) => m.san);
            const reviewTimeoutMs = Math.max(60000, moves.length * 5000);
            const review = await withTimeout(
              reviewGameEngineOnly(fens, colors, sans, depth, engineDelayMs),
              reviewTimeoutMs,
              `reviewGameEngineOnly(gameId=${inserted.id}, ${moves.length} moves)`,
            );
            await db.update(gamesTable)
              .set({ reviewData: review, analyzed: true })
              .where(eq(gamesTable.id, inserted.id));
            gamesReviewed++;
          } catch (err) {
            logger.warn({ err, gameId: inserted.id }, "Bulk crawl: engine review failed or timed out for one game -- tearing down the bulk engine and continuing");
            destroyBulkEngine();
          }

          // Crawl expansion: queue up whichever side wasn't the username
          // we just processed, so the frontier grows on its own.
          const opponent = meta.whiteUsername.toLowerCase() === next.username.toLowerCase() ? meta.blackUsername : meta.whiteUsername;
          if (opponent) {
            await db.insert(bulkCrawlQueueTable).values({ username: opponent.toLowerCase(), platform: "chesscom" }).onConflictDoNothing();
          }

          if (gamesImported % 25 === 0) {
            await updateJobProgress(jobId, { gamesImported, gamesReviewed, usernamesProcessed });
          }
        }

        await db.update(bulkCrawlQueueTable).set({ status: "done" }).where(eq(bulkCrawlQueueTable.id, next.id));
      } catch (err) {
        logger.warn({ err, username: next.username }, "Bulk crawl: failed to process username, marking failed and continuing");
        await db.update(bulkCrawlQueueTable).set({ status: "failed" }).where(eq(bulkCrawlQueueTable.id, next.id));
        await sleep(CHESSCOM_REQUEST_DELAY_MS);
      }

      usernamesProcessed++;
    }

    await updateJobProgress(jobId, { gamesImported, gamesReviewed, usernamesProcessed });
    await db.update(backgroundJobsTable).set({ status: "done", completedAt: new Date() }).where(eq(backgroundJobsTable.id, jobId));
  } catch (err: any) {
    logger.error({ err, jobId }, "Bulk crawl job failed");
    await db.update(backgroundJobsTable).set({ status: "error", error: err?.message || "Unknown error", completedAt: new Date() }).where(eq(backgroundJobsTable.id, jobId)).catch(() => {});
  }
}
