// Official ChessScout.net tournaments on a fixed schedule, so there's always
// something real to play in:
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

const SERIES: Series[] = [
  {
    key: "nightly-blitz", name: "Nightly Blitz Arena",
    description: "ChessScout's nightly 5-minute arena. Play as many games as you can in an hour; most points wins. Ranked: you're paired with players near your rating.",
    weekday: null, hour: 20, minute: 0, format: "arena", kind: "live", timeControl: "blitz_5_0", mode: "ranked", durationMinutes: 60,
  },
  {
    key: "weekend-rapid-ko", name: "Weekend Rapid Knockout",
    description: "Saturday knockout, 10-minute games. Register before the start; the bracket is drawn by rating.",
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

export async function ensureOfficialTournaments(): Promise<void> {
  await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS official_key VARCHAR`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_official_key ON tournaments (official_key) WHERE official_key IS NOT NULL`);
  // Tournament bots were tried and removed (too heavy on the API server):
  // take any seated bots out of unfinished tournaments, and cancel the
  // hourly arenas that only existed to be kept alive by them.
  await db.execute(sql`DELETE FROM tournament_players WHERE user_id LIKE 'bot:%'
    AND tournament_id IN (SELECT id FROM tournaments WHERE status IN ('scheduled', 'running'))`);
  await db.execute(sql`UPDATE tournaments SET status = 'cancelled' WHERE official_key LIKE 'hourly-blitz:%' AND status IN ('scheduled', 'running')`);
  const now = Date.now();
  for (let i = 0; i <= AHEAD_DAYS; i++) {
    const day = nyDate(new Date(now + i * 86_400_000));
    for (const s of SERIES) {
      if (s.weekday !== null && s.weekday !== day.weekday) continue;
      const starts = nyTime(day.y, day.m, day.d, s.hour, s.minute);
      if (starts.getTime() < now) continue;
      const key = `${s.key}:${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
      const ends = s.format === "arena" ? new Date(starts.getTime() + (s.durationMinutes ?? 60) * 60_000) : null;
      const id = crypto.randomBytes(5).toString("hex");
      try {
        const ins = rowsOf(await db.execute(sql`
          INSERT INTO tournaments (id, name, description, time_control, mode, starts_at, ends_at, status, created_by, format, kind, eligibility,
            max_players, visibility, created_by_name, club_name, official_key)
          VALUES (${id}, ${s.name}, ${s.description}, ${s.timeControl}, ${s.mode}, ${starts.toISOString()}, ${ends ? ends.toISOString() : null},
            'scheduled', 'chessscout', ${s.format}, ${s.kind}, 'all', ${s.maxPlayers ?? null}, 'public', 'ChessScout.net', 'ChessScout.net', ${key})
          ON CONFLICT DO NOTHING RETURNING id`));
        if (ins.length) logger.info({ key, starts }, "[official] tournament scheduled");
      } catch (err) {
        logger.warn({ err, key }, "[official] schedule failed");
      }
    }
  }
}

// Live Hour: about 10 minutes before the Nightly Blitz Arena starts, everyone
// with notifications on (or the app open) gets one reminder, so the people
// who want a live game turn up at the same time.
async function remindLiveHour(): Promise<void> {
  await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS live_hour_reminded_at TIMESTAMPTZ`);
  const due = rowsOf<{ id: string; name: string }>(await db.execute(sql`
    UPDATE tournaments SET live_hour_reminded_at = now()
    WHERE official_key LIKE 'nightly-blitz:%' AND status = 'scheduled' AND live_hour_reminded_at IS NULL
      AND starts_at > now() + interval '4 minutes' AND starts_at <= now() + interval '11 minutes'
    RETURNING id, name`));
  if (!due.length) return;
  const t = due[0];
  const { everyoneReachable } = await import("./seekBroadcast");
  const { notifyUser } = await import("./notify");
  const ids = await everyoneReachable();
  for (const uid of ids) {
    await db.execute(sql`DELETE FROM notifications WHERE user_id = ${uid} AND kind = 'live_hour'`).catch(() => {});
    notifyUser(uid, {
      kind: "live_hour", title: "Live Hour starts in 10 minutes ⚡",
      body: `${t.name}: 5-minute games for an hour, most points wins. Tap to join.`,
      url: `/tournaments/${t.id}`, tag: "cs:live-hour",
    }).catch(() => {});
  }
  logger.info({ tournament: t.id, sent: ids.length }, "[official] Live Hour reminder sent");
}

/** The next (or current) Live Hour, for the "next Live Hour" line on Play / Home. */
export async function nextLiveHour(): Promise<{ id: string; name: string; startsAt: string; endsAt: string | null; status: string } | null> {
  const r = rowsOf<{ id: string; name: string; starts_at: string; ends_at: string | null; status: string }>(await db.execute(sql`
    SELECT id, name, starts_at, ends_at, status FROM tournaments
    WHERE official_key LIKE 'nightly-blitz:%' AND status IN ('scheduled', 'running') AND (ends_at IS NULL OR ends_at > now())
    ORDER BY starts_at LIMIT 1`));
  const t = r[0];
  return t ? { id: t.id, name: t.name, startsAt: new Date(t.starts_at).toISOString(), endsAt: t.ends_at ? new Date(t.ends_at).toISOString() : null, status: t.status } : null;
}

export function startOfficialTournaments(): void {
  const run = () => { void ensureOfficialTournaments().catch((err) => logger.warn({ err }, "[official] run failed")); };
  setTimeout(run, 60_000);
  setInterval(run, 6 * 60 * 60_000).unref();
  setInterval(() => { void remindLiveHour().catch((err) => logger.warn({ err }, "[official] Live Hour reminder failed")); }, 60_000).unref();
}
