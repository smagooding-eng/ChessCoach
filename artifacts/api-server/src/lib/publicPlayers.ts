import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { pingIndexNow } from "./indexNow";
import { fetchChessComProfile, fetchChessComArchiveList, fetchChessComGamesForArchive, extractOpeningFromPgn, type ChessComGame } from "./chesscom";

// Public player pages (chessscout.net/players/<username>): what well-known
// Chess.com players actually play, worked out from their real recent games.
// The list comes from Chess.com's public leaderboards plus a few well-known
// streamers; each profile is rebuilt about once a week by a slow background
// job (one player at a time, spaced out, so we stay polite to Chess.com).

const UA = { headers: { "User-Agent": "ChessScout/1.0 (chessscout.net)" } };
const STREAMERS = ["hikaru", "magnuscarlsen", "gothamchess", "fabianocaruana", "firouzja2003", "annacramling", "alexandrabotez", "imrosen", "chessbrah"];
const MAX_GAMES = 600;
const REFRESH_DAYS = 7;
const DELAY_MS = 2500;

export interface OpeningRow { name: string; games: number; wins: number; draws: number; losses: number }
export interface MoveRow { move: string; games: number; wins: number; draws: number; losses: number }
export interface PlayerData {
  username: string; name: string | null; title: string | null; avatar: string | null; country: string | null; url: string | null;
  ratings: { bullet?: number; blitz?: number; rapid?: number };
  period: { from: string; to: string; games: number };
  overall: { wins: number; draws: number; losses: number };
  asWhite: { games: number; wins: number; draws: number; losses: number; firstMoves: MoveRow[]; openings: OpeningRow[] };
  asBlack: { games: number; wins: number; draws: number; losses: number; vsE4: MoveRow[]; vsD4: MoveRow[]; openings: OpeningRow[] };
  timeClasses: { name: string; games: number }[];
  recent: ("W" | "D" | "L")[];
}

export async function ensurePublicPlayersTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS public_players (
    slug VARCHAR PRIMARY KEY,
    username VARCHAR NOT NULL,
    source VARCHAR NOT NULL DEFAULT 'leaderboard',
    data JSONB,
    games INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "Sicilian Defense Old Sicilian 3.Bc4" -> "Sicilian Defense" */
export function openingFamily(name: string | null): string | null {
  if (!name) return null;
  const words = name.replace(/\s+/g, " ").trim().split(" ");
  const enders = new Set(["Defense", "Defence", "Opening", "Game", "Gambit", "Attack", "System"]);
  const out: string[] = [];
  for (const w of words) {
    if (/\d/.test(w) || w.includes(".")) break;
    out.push(w);
    if (enders.has(w) && out.length >= 2) break;
    if (out.length >= 4) break;
  }
  return out.length ? out.join(" ") : null;
}

function firstPlies(pgn: string): string[] {
  const body = pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, " ").replace(/\{[^}]*\}/g, " ").replace(/\$\d+/g, " ");
  const toks = body.split(/\s+/).filter((t) => t && !/^\d+\.(\.\.)?$/.test(t) && !/^\d+\.\.\.$/.test(t));
  return toks.map((t) => t.replace(/^\d+\.(\.\.)?/, "")).filter(Boolean).slice(0, 2);
}

function bump<T extends { games: number; wins: number; draws: number; losses: number }>(row: T, r: "W" | "D" | "L") {
  row.games++; if (r === "W") row.wins++; else if (r === "D") row.draws++; else row.losses++;
}

function top<K extends string>(m: Map<string, { games: number; wins: number; draws: number; losses: number }>, key: K, n: number) {
  return [...m.entries()].sort((a, b) => b[1].games - a[1].games).slice(0, n).map(([k, v]) => ({ [key]: k, ...v })) as unknown as (Record<K, string> & { games: number; wins: number; draws: number; losses: number })[];
}

export function computePlayerData(username: string, profile: Awaited<ReturnType<typeof fetchChessComProfile>>, games: ChessComGame[]): PlayerData {
  const u = username.toLowerCase();
  const std = games.filter((g) => (g.rules ?? "chess") === "chess" && g.pgn).sort((a, b) => b.end_time - a.end_time).slice(0, MAX_GAMES);
  const blank = () => ({ games: 0, wins: 0, draws: 0, losses: 0 });
  const overall = { wins: 0, draws: 0, losses: 0 };
  const W = { ...blank(), first: new Map<string, ReturnType<typeof blank>>(), open: new Map<string, ReturnType<typeof blank>>() };
  const B = { ...blank(), e4: new Map<string, ReturnType<typeof blank>>(), d4: new Map<string, ReturnType<typeof blank>>(), open: new Map<string, ReturnType<typeof blank>>() };
  const tc = new Map<string, number>();
  const recent: ("W" | "D" | "L")[] = [];
  for (const g of std) {
    const white = g.white.username.toLowerCase() === u;
    const me = white ? g.white : g.black;
    const r: "W" | "D" | "L" = me.result === "win" ? "W" : ["checkmated", "timeout", "resigned", "abandoned", "lose"].includes(me.result) ? "L" : "D";
    if (r === "W") overall.wins++; else if (r === "D") overall.draws++; else overall.losses++;
    if (recent.length < 20) recent.push(r);
    const cls = (g as unknown as { time_class?: string }).time_class ?? "other";
    tc.set(cls, (tc.get(cls) ?? 0) + 1);
    const fam = openingFamily(extractOpeningFromPgn(g.pgn).opening);
    const [m1, m2] = firstPlies(g.pgn);
    const get = (m: Map<string, ReturnType<typeof blank>>, k: string) => { let v = m.get(k); if (!v) { v = blank(); m.set(k, v); } return v; };
    if (white) {
      bump(W, r);
      if (m1) bump(get(W.first, m1), r);
      if (fam) bump(get(W.open, fam), r);
    } else {
      bump(B, r);
      if (m1 === "e4" && m2) bump(get(B.e4, m2), r);
      if (m1 === "d4" && m2) bump(get(B.d4, m2), r);
      if (fam) bump(get(B.open, fam), r);
    }
  }
  const times = std.map((g) => g.end_time * 1000);
  return {
    username: u,
    name: profile?.name ?? null, title: profile?.title ?? null, avatar: profile?.avatar ?? null, country: profile?.country ?? null, url: profile?.url ?? null,
    ratings: profile?.ratings ?? {},
    period: { from: new Date(times.length ? Math.min(...times) : Date.now()).toISOString(), to: new Date(times.length ? Math.max(...times) : Date.now()).toISOString(), games: std.length },
    overall,
    asWhite: { games: W.games, wins: W.wins, draws: W.draws, losses: W.losses, firstMoves: top(W.first, "move", 5), openings: top(W.open, "name", 8) },
    asBlack: { games: B.games, wins: B.wins, draws: B.draws, losses: B.losses, vsE4: top(B.e4, "move", 4), vsD4: top(B.d4, "move", 4), openings: top(B.open, "name", 8) },
    timeClasses: [...tc.entries()].sort((a, b) => b[1] - a[1]).map(([name, games]) => ({ name, games })),
    recent,
  };
}

async function buildPlayer(username: string): Promise<PlayerData | null> {
  const profile = await fetchChessComProfile(username);
  if (!profile) return null;
  const archives = await fetchChessComArchiveList(username);
  const games: ChessComGame[] = [];
  for (const url of archives.slice(-3).reverse()) {
    games.push(...(await fetchChessComGamesForArchive(url)));
    if (games.length >= MAX_GAMES) break;
    await sleep(800);
  }
  if (games.length < 20) return null; // too few recent games to say anything real
  return computePlayerData(username, profile, games);
}

let lastTitledFetch = 0;
async function seedList() {
  const names = new Map<string, string>();
  for (const s of STREAMERS) names.set(s, "streamer");
  try {
    const r = await fetch("https://api.chess.com/pub/leaderboards", UA);
    if (r.ok) {
      const d = (await r.json()) as Record<string, { username?: string }[]>;
      for (const cat of ["live_blitz", "live_bullet", "live_rapid", "daily", "live_blitz960"]) {
        for (const p of (d[cat] ?? []).slice(0, 50)) if (p.username) names.set(p.username.toLowerCase(), names.get(p.username.toLowerCase()) ?? "leaderboard");
      }
    }
  } catch (err) { logger.warn({ err }, "[players] leaderboard fetch failed"); }
  // Every titled grandmaster on Chess.com (refreshed once a day). Players
  // without enough recent games never get a page, so inactive accounts cost
  // one look a week and nothing else.
  if (Date.now() - lastTitledFetch > 24 * 60 * 60 * 1000) {
    for (const title of ["GM", "WGM"]) {
      try {
        const r = await fetch(`https://api.chess.com/pub/titled/${title}`, UA);
        if (r.ok) {
          const d = (await r.json()) as { players?: string[] };
          for (const u of d.players ?? []) if (u && !names.has(u.toLowerCase())) names.set(u.toLowerCase(), `titled_${title.toLowerCase()}`);
        }
      } catch (err) { logger.warn({ err, title }, "[players] titled list fetch failed"); }
      await sleep(1500);
    }
    lastTitledFetch = Date.now();
  }
  for (const [slug, source] of names) {
    await db.execute(sql`INSERT INTO public_players (slug, username, source) VALUES (${slug}, ${slug}, ${source}) ON CONFLICT (slug) DO NOTHING`);
  }
}

let running = false;
async function refreshPass(limit: number) {
  if (running) return;
  running = true;
  const updated: string[] = [];
  try {
    await seedList();
    const due = await db.execute(sql`SELECT slug FROM public_players
      WHERE updated_at IS NULL OR updated_at < now() - make_interval(days => ${REFRESH_DAYS})
      ORDER BY updated_at NULLS FIRST LIMIT ${limit}`);
    for (const row of due.rows as { slug: string }[]) {
      try {
        const data = await buildPlayer(row.slug);
        if (data) {
          await db.execute(sql`UPDATE public_players SET data = ${JSON.stringify(data)}::jsonb, games = ${data.period.games}, updated_at = now() WHERE slug = ${row.slug}`);
          updated.push(`/players/${encodeURIComponent(row.slug)}`);
        } else {
          // Not found or not enough games: try again next week rather than every pass.
          await db.execute(sql`UPDATE public_players SET updated_at = now() WHERE slug = ${row.slug}`);
        }
      } catch (err) { logger.warn({ err, slug: row.slug }, "[players] build failed"); }
      await sleep(DELAY_MS);
    }
  } finally {
    running = false;
    // Tell Bing & co. about the refreshed pages (and the index that lists them).
    if (updated.length) pingIndexNow(["/players", ...updated]);
  }
}

/** Starts the slow background refresher: a first pass shortly after boot, then every 6 hours (about 360 players a day, enough to refresh the full list weekly). */
export function startPublicPlayersRefresher() {
  setTimeout(() => { void refreshPass(80).catch((err) => logger.warn({ err }, "[players] pass failed")); }, 90_000);
  setInterval(() => { void refreshPass(90).catch((err) => logger.warn({ err }, "[players] pass failed")); }, 6 * 60 * 60 * 1000);
}

export interface PlayerSummary { slug: string; name: string | null; title: string | null; avatar: string | null; ratings: PlayerData["ratings"]; games: number }

export async function listPublicPlayers(): Promise<PlayerSummary[]> {
  const r = await db.execute(sql`SELECT slug, data, games FROM public_players WHERE data IS NOT NULL ORDER BY games DESC`);
  return (r.rows as { slug: string; data: PlayerData; games: number }[]).map((x) => ({
    slug: x.slug, name: x.data?.name ?? null, title: x.data?.title ?? null, avatar: x.data?.avatar ?? null, ratings: x.data?.ratings ?? {}, games: x.games,
  })).sort((a, b) => (Math.max(b.ratings.blitz ?? 0, b.ratings.bullet ?? 0, b.ratings.rapid ?? 0)) - (Math.max(a.ratings.blitz ?? 0, a.ratings.bullet ?? 0, a.ratings.rapid ?? 0)));
}

export async function getPublicPlayer(slug: string): Promise<{ data: PlayerData; updatedAt: string } | null> {
  const r = await db.execute(sql`SELECT data, updated_at FROM public_players WHERE slug = ${slug.toLowerCase()} AND data IS NOT NULL`);
  const row = r.rows[0] as { data: PlayerData; updated_at: string } | undefined;
  return row ? { data: row.data, updatedAt: new Date(row.updated_at).toISOString() } : null;
}
