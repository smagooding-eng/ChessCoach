// Weekly progress report, Monday morning: for members with reviewed games from the last
// 7 days, what the week looked like from their own reviewed games only: games and
// results, accuracy against the week before, rating change, where their mistakes came
// (which stretch of the game), and one thing to practise for that. Email (opted-out
// members skipped) and a push for members with notifications on. Once per member per
// week (email_drip_log "weekly_report:<monday>"); Shann's own accounts are left out.
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { emailLayout, emailP, emailFeatures, escapeHtml, EMAIL } from "./emailTheme";
import { unsubscribeHeaders, unsubscribeUrl } from "./emailPrefs";
import { trackHtml } from "./emailTracking";
import { sendEmail } from "./email";
import { sendPushToUser, isPushConfigured } from "./pushNotifications";
import { logger } from "./logger";

const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_EMAILS = 70; // Resend's daily limit is shared with the other emails

interface RM { moveIndex: number; color: string; classification: string }
interface G { id: number; username: string; white_username: string; black_username: string; white_rating: number | null; black_rating: number | null;
  result: string | null; platform: string | null; played_at: string; review_data: unknown; this_week: boolean }

type Stretch = { key: "opening" | "middle" | "late"; text: string; practise: { title: string; text: string; url: string } };
const STRETCH: Record<Stretch["key"], Stretch> = {
  opening: { key: "opening", text: "in the first 12 moves", practise: { title: "Practise your openings", text: "Drill the lines you play, so you come out of the opening comfortable.", url: "/openings" } },
  middle: { key: "middle", text: "between moves 13 and 35", practise: { title: "Do a few puzzles a day", text: "Most middlegame mistakes are missed tactics. Ten minutes of puzzles a day trains your eye.", url: "/puzzles" } },
  late: { key: "late", text: "after move 35", practise: { title: "Practise endgames", text: "Play out won and drawn endings against the practice bots until they're automatic.", url: "/practice" } },
};

export interface WeekReport {
  games: number; wins: number; losses: number; draws: number;
  accNow: number | null; accBefore: number | null; rating: { from: number; to: number; platform: string } | null;
  mistakes: number; blundersPerGame: number; stretch: Stretch | null; bestId: number | null;
}

/** The week's report for one member, from their reviewed games (null when there's nothing to say). */
export async function weekReport(userId: string): Promise<WeekReport | null> {
  const games = rowsOf<G>(await db.execute(sql`
    SELECT id, username, white_username, black_username, white_rating, black_rating, result, platform, played_at, review_data,
      played_at > now() - interval '7 days' AS this_week
    FROM games WHERE user_id = ${userId} AND platform IS DISTINCT FROM 'bot'
      AND played_at > now() - interval '14 days' AND review_data IS NOT NULL
    ORDER BY played_at ASC`));
  const now = games.filter((g) => g.this_week);
  if (!now.length) return null;
  const sideOf = (g: G) => { const me = (g.username ?? "").toLowerCase(); return g.white_username.toLowerCase() === me ? "white" : g.black_username.toLowerCase() === me ? "black" : null; };
  const accOf = (g: G) => { const rd = g.review_data as { whiteAccuracy?: number; blackAccuracy?: number } | null; const s = sideOf(g); const a = s === "white" ? rd?.whiteAccuracy : s === "black" ? rd?.blackAccuracy : undefined; return typeof a === "number" && a > 0 ? a : null; };
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

  // Where their mistakes came (their own moves only)
  const counts = { opening: 0, middle: 0, late: 0 };
  let mistakes = 0, blunders = 0, bestId: number | null = null, bestAcc = -1;
  for (const g of now) {
    const s = sideOf(g); if (!s) continue;
    const rd = g.review_data as { moves?: RM[] } | RM[] | null;
    const moves = Array.isArray(rd) ? rd : rd?.moves ?? [];
    for (const m of moves) {
      if (m.color !== s || !["mistake", "blunder", "missed_win"].includes(m.classification)) continue;
      mistakes++; if (m.classification !== "mistake") blunders++;
      const n = Math.floor(m.moveIndex / 2) + 1;
      counts[n <= 12 ? "opening" : n <= 35 ? "middle" : "late"]++;
    }
    const a = accOf(g); if (a != null && a > bestAcc) { bestAcc = a; bestId = g.id; }
  }
  const top = (Object.entries(counts) as [Stretch["key"], number][]).sort((a, b) => b[1] - a[1])[0];

  // Rating change on the platform they played most this week
  const byPlat = new Map<string, G[]>();
  for (const g of now) if (g.platform) byPlat.set(g.platform, [...(byPlat.get(g.platform) ?? []), g]);
  const [plat, pg] = [...byPlat.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [null, []];
  const ratingOf = (g: G) => { const s = sideOf(g); return s === "white" ? g.white_rating : s === "black" ? g.black_rating : null; };
  const first = pg.map(ratingOf).find((r) => !!r) ?? null, last = [...pg].reverse().map(ratingOf).find((r) => !!r) ?? null;

  return {
    games: now.length,
    wins: now.filter((g) => g.result === "win").length, losses: now.filter((g) => g.result === "loss").length, draws: now.filter((g) => g.result === "draw").length,
    accNow: avg(now.map(accOf)), accBefore: avg(games.filter((g) => !g.this_week).map(accOf)),
    rating: plat && first != null && last != null && pg.length > 1 ? { from: first, to: last, platform: plat === "chesscom" ? "Chess.com" : plat === "lichess" ? "Lichess" : "ChessScout" } : null,
    mistakes, blundersPerGame: Math.round((blunders / now.length) * 10) / 10,
    stretch: top && top[1] > 0 ? STRETCH[top[0]] : null, bestId,
  };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function weekHeadline(r: WeekReport): string {
  if (r.accNow != null && r.accBefore != null && r.accNow !== r.accBefore) return `Your accuracy ${r.accNow > r.accBefore ? "went up" : "went down"} to ${r.accNow}%`;
  if (r.rating && r.rating.to !== r.rating.from) return `${signed(r.rating.to - r.rating.from)} rating on ${r.rating.platform} this week`;
  return `${plural(r.games, "game")} reviewed this week`;
}

export function weekReportHtml(name: string | null, r: WeekReport, unsubUrl: string): string {
  const items: { glyph: string; title: string; text: string }[] = [];
  items.push({ glyph: "&#9823;", title: `${plural(r.games, "game")}: ${r.wins} won, ${r.losses} lost${r.draws ? `, ${r.draws} drawn` : ""}`, text: r.bestId ? `<a href="${EMAIL.site}/games/${r.bestId}" style="color:${EMAIL.green};font-weight:700;">Your best game of the week &rarr;</a>` : "Every one reviewed move by move." });
  if (r.accNow != null) items.push({ glyph: "&#9819;", title: `Accuracy: ${r.accNow}%`, text: r.accBefore != null ? (r.accNow === r.accBefore ? `Same as the week before.` : `${r.accNow > r.accBefore ? "Up" : "Down"} from ${r.accBefore}% the week before.`) : "Your average across this week's games." });
  if (r.rating) items.push({ glyph: "&#9814;", title: `Rating on ${r.rating.platform}: ${r.rating.to} (${signed(r.rating.to - r.rating.from)})`, text: `From ${r.rating.from} at the start of the week.` });
  if (r.stretch) items.push({ glyph: "&#9822;", title: `Most of your mistakes came ${r.stretch.text}`, text: `${plural(r.mistakes, "mistake")} this week, ${r.blundersPerGame} serious one${r.blundersPerGame === 1 ? "" : "s"} a game on average.` });
  const p = r.stretch?.practise;
  return emailLayout({
    preheader: weekHeadline(r),
    badge: "Your week in chess",
    title: name ? `${escapeHtml(name)}, here's your week` : "Here's your week",
    subtitle: weekHeadline(r),
    body: [
      emailFeatures(items),
      p ? emailP(`<strong style="color:${EMAIL.text};">This week: ${escapeHtml(p.title.toLowerCase())}.</strong> ${escapeHtml(p.text)}`, { center: true, mb: 22 }) : "",
    ].join(""),
    cta: p ? { label: `${escapeHtml(p.title)} &rarr;`, href: `${EMAIL.site}${p.url}` } : { label: "See your games &rarr;", href: `${EMAIL.site}/games` },
    footerNote: "You're getting this because you played reviewed games on ChessScout.net this week. Every Monday, only in weeks you played.",
    unsubscribeUrl: unsubUrl,
  });
}

/** Monday: the report for everyone who had reviewed games in the last 7 days. */
export async function runWeeklyReports(): Promise<void> {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const key = `weekly_report:${d.toISOString().slice(0, 10)}`;
  const users = rowsOf<{ id: string; email: string | null; first_name: string | null; email_opt_out: boolean; has_push: boolean }>(await db.execute(sql`
    SELECT u.id, u.email, u.first_name, u.email_opt_out, EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id) AS has_push
    FROM users u
    WHERE u.id NOT IN (SELECT id FROM analytics_excluded_users)
      AND NOT EXISTS (SELECT 1 FROM email_drip_log l WHERE l.user_id = u.id AND l.drip_type = ${key})
      AND EXISTS (SELECT 1 FROM games g WHERE g.user_id = u.id AND g.platform IS DISTINCT FROM 'bot'
        AND g.played_at > now() - interval '7 days' AND g.review_data IS NOT NULL)`));
  let emails = 0, pushes = 0;
  for (const u of users) {
    try {
      const r = await weekReport(u.id);
      if (!r) continue;
      let sent = false;
      if (u.email && !u.email_opt_out && emails < MAX_EMAILS) {
        const name = (u.first_name || "").trim().split(/\s+/)[0] || null;
        const subject = name ? `${name}, your week in chess: ${weekHeadline(r).toLowerCase()}` : `Your week in chess: ${weekHeadline(r).toLowerCase()}`;
        const html = await trackHtml(weekReportHtml(name, r, unsubscribeUrl(u.id)), { kind: "drip", template: "weekly_report", email: u.email, userId: u.id, subject });
        await sendEmail({ to: u.email, subject, html, headers: unsubscribeHeaders(u.id) });
        emails++; sent = true;
      }
      if (u.has_push && isPushConfigured()) {
        const p = await sendPushToUser(u.id, { title: "Your week in chess", body: `${weekHeadline(r)}.${r.stretch ? ` Most mistakes came ${r.stretch.text}.` : ""}`, url: r.stretch?.practise.url ?? "/games", tag: "cs:weekly" }).catch(() => ({ sent: 0 }));
        if ((p.sent ?? 0) > 0) { pushes++; sent = true; }
      }
      if (sent) await db.execute(sql`INSERT INTO email_drip_log (user_id, drip_type) VALUES (${u.id}, ${key}) ON CONFLICT DO NOTHING`);
      await pause(600);
    } catch (err) { logger.warn({ err, userId: u.id }, "[weekly-report] failed"); }
  }
  logger.info({ members: users.length, emails, pushes }, "[weekly-report] done");
}
