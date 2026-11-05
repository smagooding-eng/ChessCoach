// Lichess data for the app: tablebase verdicts, head-to-head and rating history
// for Opponent Scout, live broadcasts, and the daily puzzle. See lib/lichessApi.ts.
import { Router, type IRouter, type Request, type Response } from "express";
import { Chess } from "chess.js";
import { db, puzzlesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authMiddleware";
import { tablebase, pieceCount, crosstable, ratingHistory, broadcastsTop, broadcastRoundPgn, dailyPuzzle } from "../lib/lichessApi";

const router: IRouter = Router();
const USER_RE = /^[A-Za-z0-9_-]{2,30}$/;

// The perfect-play verdict for a position with 7 pieces or fewer.
router.get("/lichess/tablebase", async (req: Request, res: Response) => {
  const fen = String(req.query.fen ?? "");
  try { new Chess(fen); } catch { res.status(400).json({ error: "Bad position" }); return; }
  if (pieceCount(fen) > 7) { res.json({ available: false }); return; }
  const tb = await tablebase(fen);
  if (!tb) { res.json({ available: false }); return; }
  const best = tb.moves[0];
  res.json({ available: true, category: tb.category, dtm: tb.dtm, dtz: tb.dtz, checkmate: tb.checkmate, stalemate: tb.stalemate, best: best ? { san: best.san, uci: best.uci } : null });
});

// Head-to-head between two Lichess players, plus each one's rating history.
router.get("/lichess/h2h", async (req: Request, res: Response) => {
  const a = String(req.query.a ?? ""), b = String(req.query.b ?? "");
  if (!USER_RE.test(a) || !USER_RE.test(b)) { res.status(400).json({ error: "Two Lichess usernames are needed" }); return; }
  const ct = await crosstable(a, b);
  if (!ct) { res.json({ available: false }); return; }
  const key = (u: string) => Object.keys(ct.users).find((k) => k.toLowerCase() === u.toLowerCase());
  const sa = ct.users[key(a) ?? ""] ?? 0, sb = ct.users[key(b) ?? ""] ?? 0;
  // Scores: a win counts 1 and a draw half a point, as Lichess shows them.
  res.json({ available: true, games: ct.nbGames, a: { name: key(a) ?? a, score: sa }, b: { name: key(b) ?? b, score: sb } });
});

router.get("/lichess/rating-history/:user", async (req: Request, res: Response) => {
  const u = String(req.params.user);
  if (!USER_RE.test(u)) { res.status(400).json({ error: "Bad username" }); return; }
  const h = await ratingHistory(u);
  if (!h) { res.json({ available: false, series: [] }); return; }
  // The main game types, the last 12 months, one point per month.
  const since = Date.now() - 365 * 24 * 3600_000;
  const series = h.filter((s) => ["Bullet", "Blitz", "Rapid", "Classical"].includes(s.name)).map((s) => {
    const byMonth = new Map<string, number>();
    for (const [y, m, d, r] of s.points) { const t = Date.UTC(y, m, d); if (t >= since) byMonth.set(`${y}-${m}`, r); }
    return { name: s.name, points: [...byMonth.entries()].map(([k, r]) => ({ month: k, rating: r })) };
  }).filter((s) => s.points.length >= 2);
  res.json({ available: true, series });
});

// An event's official video (YouTube / Twitch link), set by an admin from Watch Live.
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];
let streamsReady: Promise<void> | null = null;
const ensureStreams = () => (streamsReady ??= db.execute(sql`CREATE TABLE IF NOT EXISTS broadcast_streams (
  tour_id varchar(8) PRIMARY KEY, url text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
)`).then(() => undefined).catch((e) => { streamsReady = null; throw e; }));
async function eventStreams(): Promise<Map<string, string>> {
  try { await ensureStreams(); return new Map(rowsOf<{ tour_id: string; url: string }>(await db.execute(sql`SELECT tour_id, url FROM broadcast_streams`)).map((r) => [r.tour_id, r.url])); }
  catch { return new Map(); }
}
router.post("/admin/broadcast-stream", requireAdmin, async (req: Request, res: Response) => {
  const tourId = String(req.body?.tourId ?? ""), url = String(req.body?.url ?? "").trim();
  if (!/^[A-Za-z0-9]{8}$/.test(tourId)) { res.status(400).json({ error: "Bad event" }); return; }
  if (url && !/^https:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|twitch\.tv)\//i.test(url)) { res.status(400).json({ error: "Use a YouTube or Twitch link" }); return; }
  try {
    await ensureStreams();
    if (url) await db.execute(sql`INSERT INTO broadcast_streams (tour_id, url) VALUES (${tourId}, ${url}) ON CONFLICT (tour_id) DO UPDATE SET url = EXCLUDED.url, updated_at = now()`);
    else await db.execute(sql`DELETE FROM broadcast_streams WHERE tour_id = ${tourId}`);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Couldn't save it" }); }
});

// Lichess streamers live right now (Twitch / YouTube), with the game each is playing.
let streamersCache: { at: number; data: unknown } | null = null;
router.get("/lichess/streamers", async (_req: Request, res: Response) => {
  if (streamersCache && Date.now() - streamersCache.at < 45_000) { res.json(streamersCache.data); return; }
  const get = async (u: string) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000);
    try { const r = await fetch(u, { signal: ac.signal, headers: { Accept: "application/json" } }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
  };
  type S = { id: string; name: string; title?: string; stream?: { service?: string; status?: string; lang?: string }; streamer?: { name?: string; headline?: string; image?: string; twitch?: string; youTube?: string } };
  const live = (await get("https://lichess.org/api/streamer/live")) as S[] | null;
  if (!live) { res.json({ streamers: [] }); return; }
  const ids = live.slice(0, 40).map((s) => s.id);
  const status = ids.length ? ((await get(`https://lichess.org/api/users/status?ids=${ids.join(",")}&withGameIds=true`)) as { id: string; playing?: boolean; playingId?: string }[] | null) ?? [] : [];
  const playing = new Map(status.map((s) => [s.id, s.playingId ?? null]));
  const streamers = live.slice(0, 40).map((s) => ({
    id: s.id, name: s.name, title: s.title ?? null,
    service: s.stream?.service ?? null, status: s.stream?.status ?? null, lang: s.stream?.lang ?? null,
    headline: s.streamer?.headline ?? null, image: s.streamer?.image ?? null,
    twitch: s.streamer?.twitch ?? null, youTube: s.streamer?.youTube ?? null,
    gameId: playing.get(s.id) ?? null,
  }));
  // Those in a game first.
  streamers.sort((a, b) => Number(!!b.gameId) - Number(!!a.gameId));
  const data = { streamers };
  streamersCache = { at: Date.now(), data };
  res.json(data);
});

// Live top events (Lichess broadcasts) and their games.
router.get("/lichess/broadcasts", async (_req: Request, res: Response) => {
  const top = await broadcastsTop();
  const streams = await eventStreams();
  const pick = (e: NonNullable<NonNullable<typeof top>["active"]>[number]) => ({
    id: e.tour.id, name: e.tour.name, image: e.tour.image ?? null, info: e.tour.info ?? null, stream: streams.get(e.tour.id) ?? null,
    round: e.round ? { id: e.round.id, name: e.round.name, ongoing: !!e.round.ongoing, startsAt: e.round.startsAt ?? null, finished: !!e.round.finished } : null,
  });
  res.json({ active: (top?.active ?? []).slice(0, 12).map(pick), upcoming: (top?.upcoming ?? []).slice(0, 6).map(pick) });
});

function splitPgn(all: string): string[] {
  return all.split(/\n\s*\n(?=\[Event )/).map((s) => s.trim()).filter(Boolean);
}
const tag = (pgn: string, k: string) => pgn.match(new RegExp(`\\[${k} "([^"]*)"\\]`))?.[1] ?? null;

router.get("/lichess/broadcast/:roundId", async (req: Request, res: Response) => {
  const id = String(req.params.roundId);
  if (!/^[A-Za-z0-9]{8}$/.test(id)) { res.status(400).json({ error: "Bad round" }); return; }
  const pgn = await broadcastRoundPgn(id);
  if (!pgn) { res.json({ games: [] }); return; }
  const games = splitPgn(pgn).slice(0, 64).map((g) => {
    let fen = new Chess().fen(); let sans: string[] = []; let last: { from: string; to: string } | null = null;
    try {
      const c = new Chess(); c.loadPgn(g, { strict: false });
      const h = c.history({ verbose: true }); sans = h.map((m) => m.san); const lm = h[h.length - 1];
      fen = c.fen(); last = lm ? { from: lm.from, to: lm.to } : null;
    } catch { /* keep the start */ }
    return {
      white: tag(g, "White"), black: tag(g, "Black"), whiteElo: tag(g, "WhiteElo"), blackElo: tag(g, "BlackElo"),
      whiteTitle: tag(g, "WhiteTitle"), blackTitle: tag(g, "BlackTitle"), result: tag(g, "Result"), round: tag(g, "Round"),
      url: tag(g, "GameURL") ?? tag(g, "Site"), fen, last, moves: sans.length, lastSan: sans[sans.length - 1] ?? null, pgn: g,
      // Every move, so the game can be stepped back through.
      sans, startFen: tag(g, "FEN"),
    };
  });
  res.json({ games });
});

// Lichess's puzzle of the day, added to ChessScout's puzzles (same format) so it
// plays in the normal puzzle trainer. Returns its puzzle id here.
router.get("/lichess/daily-puzzle", async (_req: Request, res: Response) => {
  const d = await dailyPuzzle();
  if (!d) { res.json({ available: false }); return; }
  try {
    const [found] = await db.select({ id: puzzlesTable.id }).from(puzzlesTable).where(eq(puzzlesTable.lichessId, d.puzzle.id)).limit(1);
    if (found) { res.json({ available: true, id: found.id, rating: d.puzzle.rating, themes: d.puzzle.themes, lichessId: d.puzzle.id }); return; }
    // The game up to the puzzle: the last move is the opponent's, which the puzzle starts with.
    const c = new Chess(); c.loadPgn(d.game.pgn, { strict: false });
    const h = c.history({ verbose: true }); const lastMove = h[h.length - 1];
    if (!lastMove) throw new Error("no moves");
    const fenBefore = lastMove.before;
    // The first solution move must be legal after it, or it isn't the shape we expect.
    const check = new Chess(c.fen()); const s0 = d.puzzle.solution[0];
    check.move({ from: s0.slice(0, 2), to: s0.slice(2, 4), promotion: s0[4] });
    const moves = [`${lastMove.from}${lastMove.to}${lastMove.promotion ?? ""}`, ...d.puzzle.solution].join(" ");
    const [row] = await db.insert(puzzlesTable).values({ lichessId: d.puzzle.id, fen: fenBefore, moves, rating: d.puzzle.rating, themes: d.puzzle.themes.join(","), source: "lichess" })
      .onConflictDoNothing().returning({ id: puzzlesTable.id });
    const id = row?.id ?? (await db.select({ id: puzzlesTable.id }).from(puzzlesTable).where(eq(puzzlesTable.lichessId, d.puzzle.id)).limit(1))[0]?.id;
    res.json({ available: !!id, id: id ?? null, rating: d.puzzle.rating, themes: d.puzzle.themes, lichessId: d.puzzle.id });
  } catch {
    res.json({ available: false });
  }
});

export default router;
