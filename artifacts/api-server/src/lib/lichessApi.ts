// Lichess's free public data, used across ChessScout: cloud evaluations, the
// 7-piece endgame tablebase, the opening explorer, head-to-head records, rating
// history, live broadcasts and the daily puzzle.
//
// Every call has a short timeout and a cache, and if Lichess says "slow down"
// (429) we leave it alone for a while. Nothing here is required: callers fall
// back to their own data when Lichess doesn't answer.
// LICHESS_API_TOKEN (optional): a personal token, sent where Lichess asks for one
// (the opening explorer).
import { logger } from "./logger";

const TOKEN = process.env.LICHESS_API_TOKEN || "";
let pausedUntil = 0;
const cache = new Map<string, { at: number; ttl: number; value: unknown }>();

async function get<T>(url: string, opts: { ttlMs: number; timeoutMs?: number; auth?: boolean; accept?: string; text?: boolean } ): Promise<T | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T | null;
  if (Date.now() < pausedUntil) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 4000);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: opts.accept ?? "application/json", "User-Agent": "ChessScout.net (https://chessscout.net)", ...(opts.auth && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    });
    if (r.status === 429) { pausedUntil = Date.now() + 90_000; logger.warn({ url }, "[lichess] rate limited, pausing"); return null; }
    if (r.status === 404) { cache.set(url, { at: Date.now(), ttl: opts.ttlMs, value: null }); return null; }
    if (!r.ok) return null;
    const value = (opts.text ? await r.text() : await r.json()) as T;
    cache.set(url, { at: Date.now(), ttl: opts.ttlMs, value });
    if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
    return value;
  } catch {
    return null;
  } finally { clearTimeout(t); }
}

// ── Cloud evaluation ──────────────────────────────────────────────────────
export interface CloudEval { fen: string; depth: number; knodes: number; pvs: { moves: string; cp?: number; mate?: number }[] }
/** Stored Stockfish analysis for a position (common positions only; scores are from White's side). */
export const cloudEval = (fen: string, multiPv = 2) =>
  get<CloudEval>(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`, { ttlMs: 24 * 3600_000, timeoutMs: 1500 });

// ── Endgame tablebase (7 pieces or fewer) ─────────────────────────────────
export interface TablebaseMove { uci: string; san: string; category: string; dtz: number | null; dtm: number | null }
export interface Tablebase { category: string; dtz: number | null; dtm: number | null; checkmate: boolean; stalemate: boolean; insufficient_material: boolean; moves: TablebaseMove[] }
export const pieceCount = (fen: string) => (fen.split(" ")[0].match(/[pnbrqk]/gi) ?? []).length;
export const tablebase = (fen: string) =>
  pieceCount(fen) <= 7 ? get<Tablebase>(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`, { ttlMs: 7 * 24 * 3600_000, timeoutMs: 3000 }) : Promise.resolve(null);

// ── Opening explorer ──────────────────────────────────────────────────────
export interface ExplorerMove { uci: string; san: string; white: number; draws: number; black: number; averageRating?: number }
export interface Explorer { white: number; draws: number; black: number; moves: ExplorerMove[]; opening?: { eco: string; name: string } | null }
/** Games played on Lichess (blitz, rapid and classical, rated 1600+) from a position. */
export const explorerLichess = (fen: string) =>
  get<Explorer>(`https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&moves=12&topGames=0&recentGames=0&fen=${encodeURIComponent(fen)}`, { ttlMs: 7 * 24 * 3600_000, timeoutMs: 5000, auth: true });

// ── Players ───────────────────────────────────────────────────────────────
export interface Crosstable { users: Record<string, number>; nbGames: number }
/** All-time head-to-head score between two Lichess accounts (wins count 1, draws 0.5). */
export const crosstable = (a: string, b: string) =>
  get<Crosstable>(`https://lichess.org/api/crosstable/${encodeURIComponent(a)}/${encodeURIComponent(b)}`, { ttlMs: 3600_000 });
export interface RatingSeries { name: string; points: [number, number, number, number][] }
/** Rating history per game type: points are [year, month (0-based), day, rating]. */
export const ratingHistory = (u: string) =>
  get<RatingSeries[]>(`https://lichess.org/api/user/${encodeURIComponent(u)}/rating-history`, { ttlMs: 6 * 3600_000 });

// ── Broadcasts ────────────────────────────────────────────────────────────
export interface BroadcastEntry { tour: { id: string; name: string; slug: string; description?: string; image?: string; info?: { format?: string; tc?: string; location?: string } }; round?: { id: string; name: string; slug: string; ongoing?: boolean; startsAt?: number; finished?: boolean } }
export const broadcastsTop = () =>
  get<{ active?: BroadcastEntry[]; upcoming?: BroadcastEntry[] }>(`https://lichess.org/api/broadcast/top`, { ttlMs: 60_000 });
/** Every game of a broadcast round as PGN (refreshes every 15s while it's on). */
export const broadcastRoundPgn = (roundId: string) =>
  get<string>(`https://lichess.org/api/broadcast/round/${encodeURIComponent(roundId)}.pgn`, { ttlMs: 15_000, accept: "application/x-chess-pgn", text: true, timeoutMs: 6000 });

// ── Daily puzzle ──────────────────────────────────────────────────────────
export interface DailyPuzzle { game: { id: string; pgn: string }; puzzle: { id: string; rating: number; plays: number; solution: string[]; themes: string[]; initialPly: number } }
export const dailyPuzzle = () => get<DailyPuzzle>(`https://lichess.org/api/puzzle/daily`, { ttlMs: 30 * 60_000 });
