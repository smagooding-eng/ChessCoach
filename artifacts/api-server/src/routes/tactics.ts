// Tactics: learn one pattern at a time (fork, pin, back-rank mate, promotion…).
// Drills come from the puzzles table by Lichess theme tag; progress, mastery and
// spaced review are kept per motif. "Missed in your games", speed rounds and
// review are Pro; the motif map, demos, guided puzzles and drills are free.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, puzzlesTable, puzzleAttemptsTable, gamesTable } from "@workspace/db";
import { and, eq, sql, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { Chess } from "chess.js";

const router: IRouter = Router();
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];
const TAG = /^[A-Za-z0-9]{2,40}$/;
const MOTIF = /^[a-z0-9-]{2,40}$/;

let ready: Promise<void> | null = null;
const ensure = () => (ready ??= (async () => {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS tactics_progress (
    user_id varchar NOT NULL, motif varchar(40) NOT NULL,
    solved integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
    best_session integer NOT NULL DEFAULT 0, sessions integer NOT NULL DEFAULT 0,
    mastered_at timestamptz, review_due timestamptz, review_step integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, motif))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS tactics_speed (
    id serial PRIMARY KEY, user_id varchar NOT NULL, motif varchar(40) NOT NULL,
    score integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS tactics_speed_motif_idx ON tactics_speed (motif, score DESC)`);
})().catch((e) => { ready = null; throw e; }));

const isPro = async (userId: string) => {
  const { hasFullAccess } = await import("../lib/accessControl");
  return (await hasFullAccess(userId)).full;
};
const tagsOf = (q: unknown) => String(q ?? "").split(",").map((s) => s.trim()).filter((s) => TAG.test(s)).slice(0, 8);
const hasTag = (t: string) => sql`(',' || ${puzzlesTable.themes} || ',') ILIKE ${"%," + t + ",%"}`;
// Lichess themes are space-separated in some imports and comma-separated in others.
const hasTagAny = (t: string) => sql`(${hasTag(t)} OR (' ' || ${puzzlesTable.themes} || ' ') ILIKE ${"% " + t + " %"})`;

type PuzzleOut = { id: number; fen: string; moves: string[]; rating: number; themes: string[]; setup: boolean };
const out = (p: typeof puzzlesTable.$inferSelect): PuzzleOut => ({
  id: p.id, fen: p.fen, moves: p.moves.trim().split(/\s+/), rating: p.rating,
  themes: (p.themes ?? "").split(/[,\s]+/).filter(Boolean),
  // Lichess puzzles start with the opponent's move; puzzles made from your games don't.
  setup: p.source !== "game",
});

async function pick(opts: { any: string[]; all: string[]; n: number; minRating?: number; maxRating?: number; exclude: number[]; userId?: string }) {
  const conds = [eq(puzzlesTable.archived, false), sql`${puzzlesTable.source} <> 'game'`];
  if (opts.any.length) conds.push(sql`(${sql.join(opts.any.map(hasTagAny), sql` OR `)})`);
  for (const t of opts.all) conds.push(hasTagAny(t));
  if (opts.minRating) conds.push(sql`${puzzlesTable.rating} >= ${opts.minRating}`);
  if (opts.maxRating) conds.push(sql`${puzzlesTable.rating} <= ${opts.maxRating}`);
  if (opts.exclude.length) conds.push(sql`${puzzlesTable.id} NOT IN (${sql.join(opts.exclude.map((x) => sql`${x}`), sql`, `)})`);
  const fresh = opts.userId
    ? sql`${puzzlesTable.id} NOT IN (SELECT puzzle_id FROM puzzle_attempts WHERE user_id = ${opts.userId})`
    : null;
  let rows = await db.select().from(puzzlesTable).where(and(...conds, ...(fresh ? [fresh] : []))).orderBy(sql`RANDOM()`).limit(opts.n);
  // Seen them all: serve ones already tried rather than nothing.
  if (rows.length < opts.n && fresh) {
    const more = await db.select().from(puzzlesTable).where(and(...conds, ...(rows.length ? [sql`${puzzlesTable.id} NOT IN (${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)})`] : []))).orderBy(sql`RANDOM()`).limit(opts.n - rows.length);
    rows = [...rows, ...more];
  }
  return rows.map(out);
}

const num = (v: unknown) => { const n = parseInt(String(v ?? ""), 10); return Number.isFinite(n) ? n : undefined; };

// Puzzles for one motif: ?any=fork&all=&n=10&minRating=&maxRating=&exclude=1,2
router.get("/tactics/batch", requireAuth, async (req: Request, res: Response) => {
  try {
    const any = tagsOf(req.query.any), all = tagsOf(req.query.all);
    if (!any.length && !all.length) { res.status(400).json({ error: "Pick a motif" }); return; }
    const n = Math.min(40, Math.max(1, num(req.query.n) ?? 10));
    const exclude = String(req.query.exclude ?? "").split(",").map((s) => parseInt(s, 10)).filter((x) => Number.isFinite(x)).slice(0, 200);
    res.json({ puzzles: await pick({ any, all, n, minRating: num(req.query.minRating), maxRating: num(req.query.maxRating), exclude, userId: req.user!.id }) });
  } catch (e) { req.log?.error?.({ err: (e as Error).message }, "tactics batch"); res.status(500).json({ error: "Couldn't load puzzles" }); }
});

// The kids version: easy puzzles only, no account needed.
router.get("/tactics/kids-batch", async (req: Request, res: Response) => {
  try {
    const any = tagsOf(req.query.any);
    if (!any.length) { res.status(400).json({ error: "Pick a trick" }); return; }
    res.json({ puzzles: await pick({ any, all: [], n: Math.min(15, num(req.query.n) ?? 8), maxRating: 1150, exclude: [] }) });
  } catch { res.status(500).json({ error: "Couldn't load puzzles" }); }
});

// One sample position per motif, for the card thumbnails (the puzzle position,
// after the opponent's first move). Cached for a day.
const sampleCache = new Map<string, { at: number; fen: string | null; last: { from: string; to: string } | null; side: "w" | "b" | null }>();
router.get("/tactics/sample", async (req: Request, res: Response) => {
  const any = tagsOf(req.query.any), all = tagsOf(req.query.all);
  if (!any.length && !all.length) { res.status(400).json({ error: "Pick a motif" }); return; }
  const key = `${any.join(",")}|${all.join(",")}`;
  const hit = sampleCache.get(key);
  if (hit && Date.now() - hit.at < 86400_000) { res.json(hit); return; }
  try {
    const [p] = await pick({ any, all, n: 1, maxRating: 1600, exclude: [] });
    let fen: string | null = null, last: { from: string; to: string } | null = null;
    if (p) {
      const c = new Chess(p.fen);
      if (p.setup && p.moves[0]) { try { const m = c.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] as "q" | undefined }); last = { from: m.from, to: m.to }; } catch { /* keep start */ } }
      fen = c.fen();
    }
    const v = { at: Date.now(), fen, last, side: fen ? (fen.split(" ")[1] as "w" | "b") : null };
    sampleCache.set(key, v);
    res.json(v);
  } catch { res.json({ fen: null, last: null, side: null }); }
});

// How many puzzles each motif has (so empty motifs can say so).
let countsCache: { at: number; data: Record<string, number> } | null = null;
router.get("/tactics/counts", requireAuth, async (req: Request, res: Response) => {
  try {
    const tags = tagsOf(req.query.tags);
    if (countsCache && Date.now() - countsCache.at < 3600_000 && tags.every((t) => t in countsCache!.data)) { res.json({ counts: countsCache.data }); return; }
    const data: Record<string, number> = { ...(countsCache?.data ?? {}) };
    for (const t of tags) {
      const [r] = rowsOf<{ n: string }>(await db.execute(sql`SELECT COUNT(*) AS n FROM puzzles WHERE archived = false AND source <> 'game' AND ${hasTagAny(t)}`));
      data[t] = Number(r?.n ?? 0);
    }
    countsCache = { at: Date.now(), data };
    res.json({ counts: data });
  } catch { res.json({ counts: {} }); }
});

// One puzzle finished (keeps it out of future drills, like the Puzzles page).
router.post("/tactics/result", requireAuth, async (req: Request, res: Response) => {
  const puzzleId = num(req.body?.puzzleId), solved = !!req.body?.solved, timeMs = num(req.body?.timeMs) ?? null;
  const motif = String(req.body?.motif ?? "");
  if (!puzzleId || !MOTIF.test(motif)) { res.status(400).json({ error: "Bad result" }); return; }
  try {
    await ensure();
    const ins = db.insert(puzzleAttemptsTable).values({ userId: req.user!.id, puzzleId, solved, timeMs });
    await (solved ? ins.onConflictDoUpdate({ target: [puzzleAttemptsTable.userId, puzzleAttemptsTable.puzzleId], set: { solved: true, timeMs, attemptedAt: new Date() } }) : ins.onConflictDoNothing());
    await db.execute(sql`INSERT INTO tactics_progress (user_id, motif, solved, attempts) VALUES (${req.user!.id}, ${motif}, ${solved ? 1 : 0}, 1)
      ON CONFLICT (user_id, motif) DO UPDATE SET solved = tactics_progress.solved + ${solved ? 1 : 0}, attempts = tactics_progress.attempts + 1, updated_at = now()`);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Couldn't save it" }); }
});

// A drill (10 puzzles) finished. 8+ right masters the motif; mastered motifs come
// back for review after 3, 7, 14, 30, then 60 days. A review under 7/10 comes back tomorrow.
const STEPS = [3, 7, 14, 30, 60];
router.post("/tactics/session", requireAuth, async (req: Request, res: Response) => {
  const motif = String(req.body?.motif ?? ""), correct = num(req.body?.correct) ?? 0, total = num(req.body?.total) ?? 0;
  if (!MOTIF.test(motif) || total < 1) { res.status(400).json({ error: "Bad session" }); return; }
  try {
    await ensure();
    const uid = req.user!.id;
    const [p] = rowsOf<{ mastered_at: string | null; review_due: string | null; review_step: number }>(await db.execute(sql`SELECT mastered_at, review_due, review_step FROM tactics_progress WHERE user_id = ${uid} AND motif = ${motif}`));
    const pct = correct / total;
    let mastered = !!p?.mastered_at, step = p?.review_step ?? 0, due: Date | null = p?.review_due ? new Date(p.review_due) : null, newly = false;
    const isReview = mastered && !!due && due.getTime() <= Date.now();
    if (!mastered && total >= 10 && pct >= 0.8) { mastered = true; newly = true; step = 0; due = new Date(Date.now() + STEPS[0] * 86400_000); }
    else if (isReview) {
      if (pct >= 0.7) { step = Math.min(STEPS.length - 1, step + 1); due = new Date(Date.now() + STEPS[step] * 86400_000); }
      else { step = Math.max(0, step - 1); due = new Date(Date.now() + 86400_000); }
    }
    await db.execute(sql`INSERT INTO tactics_progress (user_id, motif, sessions, best_session, mastered_at, review_due, review_step)
      VALUES (${uid}, ${motif}, 1, ${correct}, ${mastered ? new Date() : null}, ${due}, ${step})
      ON CONFLICT (user_id, motif) DO UPDATE SET sessions = tactics_progress.sessions + 1,
        best_session = GREATEST(tactics_progress.best_session, ${correct}),
        mastered_at = COALESCE(tactics_progress.mastered_at, ${mastered ? new Date() : null}),
        review_due = ${due}, review_step = ${step}, updated_at = now()`);
    res.json({ mastered, newlyMastered: newly, reviewed: isReview, reviewDue: due });
  } catch { res.status(500).json({ error: "Couldn't save it" }); }
});

router.get("/tactics/progress", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensure();
    const rows = rowsOf<{ motif: string; solved: number; attempts: number; best_session: number; sessions: number; mastered_at: string | null; review_due: string | null }>(
      await db.execute(sql`SELECT motif, solved, attempts, best_session, sessions, mastered_at, review_due FROM tactics_progress WHERE user_id = ${req.user!.id}`));
    const best = rowsOf<{ motif: string; best: number }>(await db.execute(sql`SELECT motif, MAX(score) AS best FROM tactics_speed WHERE user_id = ${req.user!.id} GROUP BY motif`));
    const bestBy = new Map(best.map((b) => [b.motif, Number(b.best)]));
    const progress = Object.fromEntries(rows.map((r) => [r.motif, {
      solved: Number(r.solved), attempts: Number(r.attempts), bestSession: Number(r.best_session), sessions: Number(r.sessions),
      masteredAt: r.mastered_at, reviewDue: r.review_due, speedBest: bestBy.get(r.motif) ?? null,
    }]));
    res.json({ progress, pro: await isPro(req.user!.id) });
  } catch { res.json({ progress: {}, pro: false }); }
});

// Missed in your games (Pro): positions from your reviewed games where you missed a tactic.
router.get("/tactics/missed", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!(await isPro(req.user!.id))) { res.status(402).json({ error: "Pro", pro: false }); return; }
    const { storage } = await import("../lib/storage");
    const user = await storage.getUser(req.user!.id);
    const name = (user?.chesscomUsername || user?.lichessUsername || "").toLowerCase();
    const scoutGames = user?.scoutUsername ? user.scoutUsername.toLowerCase() : null;
    const names = [name, scoutGames].filter((x): x is string => !!x);
    if (!names.length) { res.json({ puzzles: [], linked: false }); return; }
    const games = await db.select({ id: gamesTable.id, playedAt: gamesTable.playedAt }).from(gamesTable)
      .where(inArray(gamesTable.username, names)).orderBy(desc(gamesTable.playedAt)).limit(300);
    if (!games.length) { res.json({ puzzles: [], linked: true }); return; }
    const playedAt = new Map(games.map((g) => [g.id, g.playedAt]));
    const rows = await db.select().from(puzzlesTable)
      .where(and(eq(puzzlesTable.source, "game"), eq(puzzlesTable.archived, false), inArray(puzzlesTable.gameId, games.map((g) => g.id))))
      .orderBy(desc(puzzlesTable.createdAt)).limit(200);
    const tried = rowsOf<{ puzzle_id: number; solved: boolean }>(await db.execute(sql`SELECT puzzle_id, solved FROM puzzle_attempts WHERE user_id = ${req.user!.id}`));
    const t = new Map(tried.map((x) => [Number(x.puzzle_id), x.solved]));
    res.json({
      linked: true,
      puzzles: rows.map((p) => ({ ...out(p), gameId: p.gameId, moveNumber: p.moveNumber, playedAt: p.gameId ? playedAt.get(p.gameId) ?? null : null, solved: t.get(p.id) ?? null })),
    });
  } catch (e) { req.log?.error?.({ err: (e as Error).message }, "tactics missed"); res.status(500).json({ error: "Couldn't load them" }); }
});

// Speed rounds (Pro): save a score, and the top scores per motif.
router.post("/tactics/speed", requireAuth, async (req: Request, res: Response) => {
  const motif = String(req.body?.motif ?? ""), score = num(req.body?.score) ?? -1;
  if (!MOTIF.test(motif) || score < 0 || score > 200) { res.status(400).json({ error: "Bad score" }); return; }
  try {
    if (!(await isPro(req.user!.id))) { res.status(402).json({ error: "Pro" }); return; }
    await ensure();
    await db.execute(sql`INSERT INTO tactics_speed (user_id, motif, score) VALUES (${req.user!.id}, ${motif}, ${score})`);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Couldn't save it" }); }
});
router.get("/tactics/speed/leaders", requireAuth, async (req: Request, res: Response) => {
  const motif = String(req.query.motif ?? "");
  if (!MOTIF.test(motif)) { res.status(400).json({ error: "Bad motif" }); return; }
  try {
    await ensure();
    const rows = rowsOf<{ name: string | null; best: number; me: boolean }>(await db.execute(sql`
      SELECT COALESCE(u.scout_username, u.lichess_username, u.chesscom_username, 'Player') AS name, MAX(s.score) AS best, (s.user_id = ${req.user!.id}) AS me
      FROM tactics_speed s LEFT JOIN users u ON u.id = s.user_id
      WHERE s.motif = ${motif} GROUP BY s.user_id, u.scout_username, u.lichess_username, u.chesscom_username ORDER BY best DESC LIMIT 10`));
    res.json({ leaders: rows.map((r) => ({ name: r.name ?? "Player", best: Number(r.best), me: !!r.me })) });
  } catch { res.json({ leaders: [] }); }
});

export default router;
