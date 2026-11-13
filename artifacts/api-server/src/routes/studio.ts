// Content Studio (admin only): find notable moments in any reviewed game and
// open them in the Studio player. See lib/contentMoments.ts.
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { listMoments, tagCounts, contentScanProgress, scanContentBatch, studioGame, ensureContentTables, studioTraps, studioPuzzles, puzzleThemes, studioReviews, reviewGameForStudio, studioScouts, studioScout, studioLessons, studioScans } from "../lib/contentMoments";

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { Chess } from "chess.js";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

router.get("/admin/studio/moments", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureContentTables();
    const q = req.query;
    const moments = await listMoments({
      tags: typeof q.tags === "string" && q.tags ? q.tags.split(",") : [],
      opening: typeof q.opening === "string" ? q.opening.slice(0, 80) : undefined,
      minRating: q.minRating ? Number(q.minRating) || undefined : undefined,
      platform: typeof q.platform === "string" && q.platform ? q.platform : undefined,
      sort: q.sort === "new" || q.sort === "random" ? q.sort : "best",
      limit: q.limit ? Number(q.limit) : 48,
      offset: q.offset ? Number(q.offset) : 0,
      sinceDays: q.sinceDays ? Number(q.sinceDays) || undefined : undefined,
    });
    res.json({ moments });
  } catch (err) {
    req.log.error({ err }, "[studio] moments failed");
    res.status(500).json({ error: "Couldn't load moments" });
  }
});

router.get("/admin/studio/summary", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await ensureContentTables();
    const [counts, progress] = await Promise.all([tagCounts(), contentScanProgress()]);
    res.json({ counts, progress });
  } catch {
    res.json({ counts: {}, progress: { scanned: 0, reviewed: 0, moments: 0, analyzed: 0, unreviewed: 0, reviewer: null } });
  }
});

/** Scan more games now (also runs on its own in the background). */
router.post("/admin/studio/scan", requireAdmin, async (_req: Request, res: Response) => {
  await ensureContentTables();
  const done = await scanContentBatch(150);
  res.json({ ...done, progress: await contentScanProgress() });
});

/** Review more games (engine only, isolated engine) so the scanner can find clips in them. */
router.post("/admin/studio/review-more", requireAdmin, async (req: Request, res: Response) => {
  await ensureContentTables();
  const { startStudioReviews } = await import("../lib/contentMoments");
  const count = Math.max(1, Math.min(500, Number(req.body?.count) || 50));
  const r = await startStudioReviews(count);
  if (!r.started) { res.status(409).json({ error: r.error }); return; }
  res.json({ ok: true, progress: await contentScanProgress() });
});
router.post("/admin/studio/review-more/stop", requireAdmin, async (_req: Request, res: Response) => {
  const { stopStudioReviews } = await import("../lib/contentMoments");
  stopStudioReviews();
  res.json({ ok: true });
});

router.get("/admin/studio/game/:id", requireAdmin, async (req: Request, res: Response) => {
  const g = await studioGame(Number(req.params.id));
  if (!g) { res.status(404).json({ error: "Game not found" }); return; }
  res.json(g);
});

router.get("/admin/studio/traps", requireAdmin, async (_req: Request, res: Response) => {
  res.json({ traps: await studioTraps() });
});

router.get("/admin/studio/puzzles", requireAdmin, async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const puzzles = await studioPuzzles({
      theme: typeof q.theme === "string" && /^[A-Za-z0-9_]{1,40}$/.test(q.theme) ? q.theme : undefined,
      minRating: q.minRating ? Number(q.minRating) || undefined : undefined,
      maxRating: q.maxRating ? Number(q.maxRating) || undefined : undefined,
      source: typeof q.source === "string" && q.source ? q.source.slice(0, 20) : undefined,
      sort: q.sort === "hard" || q.sort === "easy" || q.sort === "new" ? q.sort : "random",
      limit: q.limit ? Number(q.limit) : 48, offset: q.offset ? Number(q.offset) : 0,
    });
    res.json({ puzzles });
  } catch (err) {
    req.log.error({ err }, "[studio] puzzles failed");
    res.status(500).json({ error: "Couldn't load puzzles" });
  }
});

router.get("/admin/studio/puzzle-themes", requireAdmin, async (_req: Request, res: Response) => {
  try { res.json({ themes: await puzzleThemes() }); } catch { res.json({ themes: [] }); }
});

router.get("/admin/studio/reviews", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureContentTables();
    const q = req.query;
    const reviews = await studioReviews({
      q: typeof q.q === "string" && q.q.trim() ? q.q.trim().slice(0, 60) : undefined,
      minRating: q.minRating ? Number(q.minRating) || undefined : undefined,
      platform: typeof q.platform === "string" && q.platform ? q.platform : undefined,
      sort: q.sort === "new" || q.sort === "accuracy" || q.sort === "comeback" ? q.sort : "drama",
      limit: q.limit ? Number(q.limit) : 48, offset: q.offset ? Number(q.offset) : 0,
      sinceDays: q.sinceDays ? Number(q.sinceDays) || undefined : undefined,
      player: typeof q.player === "string" && q.player.trim() ? q.player.trim().slice(0, 60) : undefined,
      gameNo: typeof q.gameNo === "string" && q.gameNo.trim() ? q.gameNo.trim().slice(0, 200) : undefined,
      bots: q.bots === "1",
      all: q.all === "1",
    });
    res.json({ reviews });
  } catch (err) {
    req.log.error({ err }, "[studio] reviews failed");
    res.status(500).json({ error: "Couldn't load reviews" });
  }
});

// Review one chosen game (any game, bots included) so it can be made into a clip.
router.post("/admin/studio/review-game/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureContentTables();
    const r = await reviewGameForStudio(Number(req.params.id));
    if (!r.ok) { res.status(409).json({ error: r.error }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "[studio] review-game failed");
    res.status(500).json({ error: "Could not review that game." });
  }
});

// Opening clips: the list, then one opening with its lines, real-game numbers and Stockfish.
router.get("/admin/studio/openings", requireAdmin, async (_req: Request, res: Response) => {
  const { studioOpeningList, warmStudioOpenings } = await import("../lib/studioOpenings");
  res.json({ openings: studioOpeningList() });
  // Opening the list starts building every opening, so picking one is instant.
  warmStudioOpenings();
});
router.get("/admin/studio/opening/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { studioOpening } = await import("../lib/studioOpenings");
    const o = await studioOpening(String(req.params.id));
    if (!o) { res.status(404).json({ error: "Unknown opening" }); return; }
    res.json(o);
  } catch (err) {
    req.log.error({ err }, "[studio] opening failed");
    res.status(500).json({ error: "Couldn't build that opening" });
  }
});

router.get("/admin/studio/scouts", requireAdmin, async (req: Request, res: Response) => {
  try { res.json({ scouts: await studioScouts(typeof req.query.q === "string" ? req.query.q.slice(0, 40) : undefined) }); }
  catch (err) { req.log.error({ err }, "[studio] scouts failed"); res.json({ scouts: [] }); }
});
router.get("/admin/studio/scout/:id", requireAdmin, async (req: Request, res: Response) => {
  const s = await studioScout(String(req.params.id));
  if (!s) { res.status(404).json({ error: "Scout not found" }); return; }
  res.json(s);
});
router.get("/admin/studio/lessons", requireAdmin, async (req: Request, res: Response) => {
  try { res.json({ courses: await studioLessons() }); } catch (err) { req.log.error({ err }, "[studio] lessons failed"); res.json({ courses: [] }); }
});
router.get("/admin/studio/scans", requireAdmin, async (req: Request, res: Response) => {
  try { res.json({ scans: await studioScans() }); } catch (err) { req.log.error({ err }, "[studio] scans failed"); res.json({ scans: [] }); }
});
/** The engine's best move and line for any position (scanned boards, lesson positions). */
router.post("/admin/studio/best-line", requireAdmin, async (req: Request, res: Response) => {
  const fen = typeof req.body?.fen === "string" ? req.body.fen.trim() : "";
  try {
    const { Chess } = await import("chess.js");
    new Chess(fen);
  } catch { res.status(400).json({ error: "That isn't a legal position." }); return; }
  try {
    const { evaluateAllPositions } = await import("../lib/engineAnalysis");
    const [ev] = await evaluateAllPositions([fen], 18);
    res.json({ bestLineSan: ev?.bestLineSan ?? [], bestMoveSan: ev?.bestMoveSan ?? null, cpWhite: ev?.cpWhite ?? 0 });
  } catch (err) {
    req.log.error({ err }, "[studio] best line failed");
    res.status(500).json({ error: "The engine couldn't look at this position right now." });
  }
});

// ── Crowd chess: the followers' running game (one current game, kept on the server
// so it's the same on every device). The app works out positions from the moves.
let crowdReady: Promise<unknown> | null = null;
const crowdTable = () => (crowdReady ??= db.execute(sql`CREATE TABLE IF NOT EXISTS studio_crowd (id VARCHAR(32) PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`));
router.get("/admin/studio/crowd", requireAdmin, async (req: Request, res: Response) => {
  try {
    await crowdTable();
    const r = await db.execute(sql`SELECT data FROM studio_crowd WHERE id = 'current'`);
    const rows = (Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as { data: unknown }[];
    res.json({ game: rows[0]?.data ?? null });
  } catch (err) { req.log.error({ err }, "[studio] crowd load failed"); res.status(500).json({ error: "Couldn't load the crowd game." }); }
});
router.put("/admin/studio/crowd", requireAdmin, async (req: Request, res: Response) => {
  try {
    const game = req.body?.game ?? null;
    if (game !== null && (typeof game !== "object" || JSON.stringify(game).length > 50_000)) { res.status(400).json({ error: "Bad game" }); return; }
    await crowdTable();
    if (game === null) await db.execute(sql`DELETE FROM studio_crowd WHERE id = 'current'`);
    else await db.execute(sql`INSERT INTO studio_crowd (id, data) VALUES ('current', ${JSON.stringify(game)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`);
    res.json({ ok: true });
  } catch (err) { req.log.error({ err }, "[studio] crowd save failed"); res.status(500).json({ error: "Couldn't save the crowd game." }); }
});

// ── Puzzle reels I've made, with their answers, so comments can be answered days later ──
let prReady: Promise<unknown> | null = null;
const prTable = () => (prReady ??= db.execute(sql`CREATE TABLE IF NOT EXISTS studio_puzzle_reels (
  puzzle_id INTEGER NOT NULL, mode VARCHAR(8) NOT NULL, theme VARCHAR(40), fen TEXT NOT NULL, moves TEXT NOT NULL,
  rating INTEGER, answer TEXT NOT NULL DEFAULT '', letter VARCHAR(2), headline TEXT, choices JSONB,
  rendered BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (puzzle_id, mode))`).catch((e) => { prReady = null; throw e; }));
const prRows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];
// Puzzle reels rendered before this list existed: recover them (and their answers) from past MP4 renders.
let prBackfilled = false;
async function backfillPuzzleReels() {
  if (prBackfilled) return;
  prBackfilled = true;
  try {
    const rows = prRows(await db.execute(sql`SELECT payload, created_at FROM studio_renders WHERE payload->'source'->>'kind' = 'puzzleReel' ORDER BY created_at ASC LIMIT 2000`));
    for (const row of rows) {
      const o = ((row.payload as { source?: { opts?: Record<string, unknown> } })?.source?.opts ?? {}) as {
        mode?: string; theme?: string; headline?: string; puzzle?: { id: number; fen: string; moves: string; rating?: number } | null;
        choices?: { uci: string; san: string; correct: boolean }[];
      };
      const pz = o.puzzle;
      if (!pz || !Number.isInteger(pz.id) || !pz.fen || !pz.moves) continue;
      const mode = o.mode === "abc" ? "abc" : "mate2";
      let answer = "", letter = "";
      if (mode === "abc" && o.choices?.length) {
        const i = o.choices.findIndex((c) => c.correct);
        letter = i >= 0 ? "ABC"[i] : ""; answer = o.choices[i]?.san ?? "";
      } else {
        try {
          const c = new Chess(pz.fen);
          answer = pz.moves.split(" ").filter(Boolean).map((u) => { try { return c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }).san; } catch { return null; } }).filter(Boolean).join(" ");
        } catch { /* leave blank */ }
      }
      await db.execute(sql`INSERT INTO studio_puzzle_reels (puzzle_id, mode, theme, fen, moves, rating, answer, letter, headline, choices, rendered, created_at, updated_at)
        VALUES (${pz.id}, ${mode}, ${String(o.theme ?? "").slice(0, 40)}, ${pz.fen}, ${pz.moves}, ${Number(pz.rating) || null}, ${answer}, ${letter},
          ${String(o.headline ?? "").slice(0, 200)}, ${o.choices ? JSON.stringify(o.choices) : null}::jsonb, true, ${row.created_at as string}::timestamptz, ${row.created_at as string}::timestamptz)
        ON CONFLICT (puzzle_id, mode) DO NOTHING`);
    }
  } catch (err) { prBackfilled = false; void err; }
}
router.get("/admin/studio/puzzle-reels", requireAdmin, async (req: Request, res: Response) => {
  try {
    await prTable();
    await backfillPuzzleReels();
    const q = String(req.query.q ?? "").trim().replace(/^#/, "");
    const r = /^\d+$/.test(q)
      ? await db.execute(sql`SELECT * FROM studio_puzzle_reels WHERE puzzle_id::text LIKE ${q + "%"} ORDER BY updated_at DESC LIMIT 300`)
      : q ? await db.execute(sql`SELECT * FROM studio_puzzle_reels WHERE answer ILIKE ${"%" + q + "%"} OR headline ILIKE ${"%" + q + "%"} ORDER BY updated_at DESC LIMIT 300`)
        : await db.execute(sql`SELECT * FROM studio_puzzle_reels ORDER BY updated_at DESC LIMIT 300`);
    res.json({ reels: prRows(r) });
  } catch (err) { req.log.error({ err }, "[studio] puzzle reels load failed"); res.status(500).json({ error: "Couldn't load your puzzle reels." }); }
});
router.post("/admin/studio/puzzle-reels", requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    const id = Number(b.puzzleId), mode = String(b.mode || "mate2").slice(0, 8);
    if (!Number.isInteger(id) || !b.fen || !b.moves) { res.status(400).json({ error: "Bad puzzle" }); return; }
    await prTable();
    await db.execute(sql`INSERT INTO studio_puzzle_reels (puzzle_id, mode, theme, fen, moves, rating, answer, letter, headline, choices, rendered)
      VALUES (${id}, ${mode}, ${String(b.theme ?? "").slice(0, 40)}, ${String(b.fen).slice(0, 120)}, ${String(b.moves).slice(0, 400)}, ${Number(b.rating) || null},
        ${String(b.answer ?? "").slice(0, 200)}, ${String(b.letter ?? "").slice(0, 2)}, ${String(b.headline ?? "").slice(0, 200)},
        ${b.choices ? JSON.stringify(b.choices).slice(0, 4000) : null}::jsonb, ${!!b.rendered})
      ON CONFLICT (puzzle_id, mode) DO UPDATE SET answer = EXCLUDED.answer, letter = EXCLUDED.letter, headline = EXCLUDED.headline,
        choices = EXCLUDED.choices, rendered = studio_puzzle_reels.rendered OR EXCLUDED.rendered, updated_at = now()`);
    res.json({ ok: true });
  } catch (err) { req.log.error({ err }, "[studio] puzzle reel save failed"); res.status(500).json({ error: "Couldn't save the puzzle reel." }); }
});
router.delete("/admin/studio/puzzle-reels/:id/:mode", requireAdmin, async (req: Request, res: Response) => {
  try {
    await prTable();
    await db.execute(sql`DELETE FROM studio_puzzle_reels WHERE puzzle_id = ${Number(req.params.id)} AND mode = ${String(req.params.mode)}`);
    res.json({ ok: true });
  } catch (err) { req.log.error({ err }, "[studio] puzzle reel delete failed"); res.status(500).json({ error: "Couldn't delete it." }); }
});

export default router;
