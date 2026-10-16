// Tournament bots: clearly named computer players that keep tournaments going.
//
// - They sit in a tournament as players whose id starts with "bot:" and whose
//   name ends in "Bot", so they're always labeled as bots.
// - They never count toward a tournament's player count or the site stats,
//   and a game against a bot never changes anyone's rating (it's played as
//   casual even in a ranked tournament).
// - Live arenas: bots play each other so the arena keeps running even when
//   nobody's on, and a human who's waited TOURNAMENT_BOT_WAIT_MS without a
//   human opponent gets a bot close to their rating.
// - Live knockouts: empty places in the bracket (and a field with fewer than
//   two people) are filled with bots, so the bracket still runs.
// Only for tournaments with bots_enabled (all official ones; organizers
// choose when they create theirs). Daily tournaments don't use bots.
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface TBot { id: string; name: string; rating: number }

const ROSTER: [string, string, number][] = [
  ["pawnstorm", "Pawnstorm Bot", 700],
  ["en-passant", "En Passant Bot", 850],
  ["fianchetto", "Fianchetto Bot", 1000],
  ["zugzwang", "Zugzwang Bot", 1100],
  ["outpost", "Outpost Bot", 1200],
  ["castle", "Castle Bot", 1300],
  ["gambit", "Gambit Bot", 1400],
  ["skewer", "Skewer Bot", 1500],
  ["fork", "Fork Bot", 1600],
  ["pin", "Pin Bot", 1700],
  ["battery", "Battery Bot", 1800],
  ["zwischenzug", "Zwischenzug Bot", 1900],
  ["endgame", "Endgame Bot", 2000],
  ["tempo", "Tempo Bot", 2100],
  ["grandmaster-ish", "Almost-GM Bot", 2250],
  ["opening-book", "Opening Book Bot", 1250],
];
export const TOURNAMENT_BOTS: TBot[] = ROSTER.map(([slug, name, rating]) => ({ id: `bot:${slug}`, name, rating }));
const BY_ID = new Map(TOURNAMENT_BOTS.map((b) => [b.id, b]));

/** How many bots seat themselves when a live arena starts. */
export const ARENA_START_BOTS = 6;
/** Bots that play each other are picked from this range: the engine searches
 *  deeper above it, and these games run on the API server with nobody waiting
 *  on them. Stronger bots still come in for strong players who need one. */
export const BOT_VS_BOT_MAX_RATING = 1700;
/** At most this many bot-vs-bot games at once per tournament. */
export const MAX_BOT_VS_BOT_GAMES = 2;
/** A human waiting this long in a live arena with no human free gets a bot. */
export const TOURNAMENT_BOT_WAIT_MS = 15_000;

export const isBotId = (id: string | null | undefined): boolean => !!id && id.startsWith("bot:");
export const getTournamentBot = (id: string): TBot | undefined => BY_ID.get(id);

function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }

/** Bots currently seated in a tournament. */
export async function seatedBots(tid: string): Promise<TBot[]> {
  const rows = rowsOf<{ user_id: string }>(await db.execute(sql`
    SELECT user_id FROM tournament_players WHERE tournament_id = ${tid} AND user_id LIKE 'bot:%' AND NOT withdrawn`));
  return rows.map((r) => BY_ID.get(r.user_id)).filter((b): b is TBot => !!b);
}

/** Seat bots in a tournament (no-op for ones already in). */
export async function seatBots(tid: string, bots: TBot[]): Promise<void> {
  for (const b of bots) {
    await db.execute(sql`INSERT INTO tournament_players (tournament_id, user_id, username) VALUES (${tid}, ${b.id}, ${b.name}) ON CONFLICT DO NOTHING`);
  }
}

/** n bots spread across the rating range, skipping ones already used. */
export function spreadBots(n: number, exclude: Set<string> = new Set(), maxRating = Infinity): TBot[] {
  let pool = TOURNAMENT_BOTS.filter((b) => !exclude.has(b.id) && b.rating <= maxRating).sort((a, b) => a.rating - b.rating);
  if (pool.length < n) pool = TOURNAMENT_BOTS.filter((b) => !exclude.has(b.id)).sort((a, b) => a.rating - b.rating);
  if (n >= pool.length) return pool;
  const out: TBot[] = [];
  for (let i = 0; i < n; i++) out.push(pool[Math.round((i * (pool.length - 1)) / Math.max(1, n - 1))]);
  return [...new Map(out.map((b) => [b.id, b])).values()];
}

/** The unseated bot closest to a rating, if any are left. */
export function nearestFreeBot(rating: number, exclude: Set<string>): TBot | null {
  let best: TBot | null = null;
  for (const b of TOURNAMENT_BOTS) {
    if (exclude.has(b.id)) continue;
    if (!best || Math.abs(b.rating - rating) < Math.abs(best.rating - rating)) best = b;
  }
  return best;
}
