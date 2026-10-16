// Official ChessScout.net tournaments on a fixed schedule, so there's always
// something real to play in (bots fill in when no one's free, see
// tournamentBots.ts):
//   Hourly Blitz Arena      every hour on the hour (not 8 PM), 5 min, 50-minute ranked arena
//   Nightly Blitz Arena     every day 8:00 PM New York, 5 min, 60-minute ranked arena
//   Weekend Rapid Knockout  Saturdays 2:00 PM New York, 10 min, ranked knockout, 32 players
//   Weekly Daily Arena      Mondays 12:00 PM New York, 1 day per move, one-week casual arena
// Created a few days ahead (once each, keyed by date) and listed publicly.
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const TZ = "America/New_York";
const AHEAD_DAYS = 4;

interface Series {
  key: string; name: string; description: string;
  weekday: number | null; hour: number; minute: number;   // weekday 0=Sun..6=Sat, null = every day
  format: "arena" | "bracket"; kind: "live" | "daily"; timeControl: string; mode: "ranked" | "casual";
  durationMinutes?: number; maxPlayers?: number;
}

// Every hour, on the hour: always something running. Only the next few are
// created, so the list isn't flooded; the one for the current hour is created
// on the spot (starting now) if it's missing and there's time left to play.
const HOURLY = {
  key: "hourly-blitz", name: "Hourly Blitz Arena",
  description: "A 5-minute arena every hour. Join any time and play as many games as you like before it ends; most points wins. When no one's free, a ChessScout bot steps in (bot games don't change your rating).",
  minutes: 50, timeControl: "blitz_5_0", mode: "ranked" as const, ahead: 3,
};

const SERIES: Series[] = [
  {
    key: "nightly-blitz", name: "Nightly Blitz Arena",
    description: "ChessScout's nightly 5-minute arena. Play as many games as you can in an hour; most points wins. Ranked: you're paired with players near your rating. When no one's free, a ChessScout bot steps in (bot games don't change your rating).",
    weekday: null, hour: 20, minute: 0, format: "arena", kind: "live", timeControl: "blitz_5_0", mode: "ranked", durationMinutes: 60,
  },
  {
    key: "weekend-rapid-ko", name: "Weekend Rapid Knockout",
    description: "Saturday knockout, 10-minute games. Register before the start; the bracket is drawn by rating, and empty places are filled by ChessScout bots.",
    weekday: 6, hour: 14, minute: 0, format: "bracket", kind: "live", timeControl: "rapid_10_0", mode: "ranked", maxPlayers: 32,
  },
  {
    key: "weekly-daily-arena", name: "Weekly Daily Arena",
    description: "A week-long arena at one day per move. Play at your own pace; we pair you whenever you're free.",
    weekday: 1, hour: 12, minute: 0, format: "arena", kind: "daily", timeControl: "corr_1d", mode: "casual", durationMinutes: 7 * 24 * 60,
  },
];

function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }

/** Offset (minutes) of New York from UTC at a given instant. */
function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(at).reduce<Record<string, string>>((m, p) => { m[p.type] = p.value; return m; }, {});
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** A wall-clock time in New York, as a real instant. */
function nyTime(y: number, m: number, d: number, h: number, min: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const off = tzOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60_000);
}

function nyDate(at: Date): { y: number; m: number; d: number; weekday: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const p = f.formatToParts(at).reduce<Record<string, string>>((acc, x) => { acc[x.type] = x.value; return acc; }, {});
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), weekday: wd };
}

async function insertOfficial(key: string, s: { name: string; description: string; timeControl: string; mode: string; format: string; kind: string; maxPlayers?: number },
  starts: Date, ends: Date | null) {
  const id = crypto.randomBytes(5).toString("hex");
  try {
    const ins = rowsOf(await db.execute(sql`
      INSERT INTO tournaments (id, name, description, time_control, mode, starts_at, ends_at, status, created_by, format, kind, eligibility,
        max_players, visibility, created_by_name, club_name, official_key, bots_enabled)
      VALUES (${id}, ${s.name}, ${s.description}, ${s.timeControl}, ${s.mode}, ${starts.toISOString()}, ${ends ? ends.toISOString() : null},
        'scheduled', 'chessscout', ${s.format}, ${s.kind}, 'all', ${s.maxPlayers ?? null}, 'public', 'ChessScout.net', 'ChessScout.net', ${key}, true)
      ON CONFLICT DO NOTHING RETURNING id`));
    if (ins.length) logger.info({ key, starts }, "[official] tournament scheduled");
  } catch (err) {
    logger.warn({ err, key }, "[official] schedule failed");
  }
}

/** The Nightly Blitz Arena has 8 PM New York; the hourly one skips that hour. */
const nyHour = (at: number) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date(at)));
const NIGHTLY_HOUR = 20;

async function ensureHourly(now: number) {
  const HOUR = 3_600_000;
  const thisHour = Math.floor(now / HOUR) * HOUR;
  const s = { ...HOURLY, format: "arena", kind: "live" };
  // The current hour's arena, starting now, if there are 15+ minutes left.
  const curEnd = thisHour + HOURLY.minutes * 60_000;
  if (curEnd - now >= 15 * 60_000 && nyHour(thisHour) !== NIGHTLY_HOUR) await insertOfficial(`${HOURLY.key}:${new Date(thisHour).toISOString().slice(0, 13)}`, s, new Date(now), new Date(curEnd));
  for (let i = 1; i <= HOURLY.ahead; i++) {
    const st = thisHour + i * HOUR;
    if (nyHour(st) === NIGHTLY_HOUR) continue;
    await insertOfficial(`${HOURLY.key}:${new Date(st).toISOString().slice(0, 13)}`, s, new Date(st), new Date(st + HOURLY.minutes * 60_000));
  }
}

export async function ensureOfficialTournaments(): Promise<void> {
  await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS official_key VARCHAR`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_official_key ON tournaments (official_key) WHERE official_key IS NOT NULL`);
  await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS bots_enabled BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`UPDATE tournaments SET bots_enabled = true WHERE official_key IS NOT NULL AND NOT bots_enabled AND status IN ('scheduled', 'running')`);
  const now = Date.now();
  await ensureHourly(now);
  for (let i = 0; i <= AHEAD_DAYS; i++) {
    const day = nyDate(new Date(now + i * 86_400_000));
    for (const s of SERIES) {
      if (s.weekday !== null && s.weekday !== day.weekday) continue;
      const starts = nyTime(day.y, day.m, day.d, s.hour, s.minute);
      if (starts.getTime() < now) continue;
      const key = `${s.key}:${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
      const ends = s.format === "arena" ? new Date(starts.getTime() + (s.durationMinutes ?? 60) * 60_000) : null;
      await insertOfficial(key, s, starts, ends);
    }
  }
}

export function startOfficialTournaments(): void {
  const run = () => { void ensureOfficialTournaments().catch((err) => logger.warn({ err }, "[official] run failed")); };
  setTimeout(run, 20_000);
  // Every 20 minutes: keeps the next few hourly arenas queued.
  setInterval(run, 20 * 60_000).unref();
}
