// IndexNow (Bing, Yandex, Seznam, Naver...): tells search engines the moment
// a public page is added, changed or removed, instead of waiting for a crawl.
// The key file is served from the site root (chess-coach/public/<key>.txt),
// which is how the engines confirm we own chessscout.net.
import { db, seoArticlesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "985c0c450ba0b8561853a545f751bb50";
const HOST = "chessscout.net";
const SITE = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

// Public pages (same list as the sitemap's static entries).
const STATIC_PATHS = ["/", "/pricing", "/learn", "/players", "/tournaments", "/vs/aimchess", "/vs/improve-my-chess", "/vs/free-chess-analysis", "/privacy", "/terms",
  "/play-chess-online", "/chess-for-kids", "/learn-chess", "/chess-puzzles", "/chess-tournaments", "/chess-game-analysis", "/scout-chess-opponent", "/chess-openings", "/chess-traps"];

function enabled(): boolean {
  if (process.env.INDEXNOW_ENABLED === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function siteUrl(path: string): string {
  return path.startsWith("http") ? path : `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface IndexNowResult { submitted: number; status: number | null; skipped?: string }

/** Submit up to 10,000 URLs per call (IndexNow's limit); larger lists are split. */
export async function submitToIndexNow(paths: string[], opts: { force?: boolean } = {}): Promise<IndexNowResult> {
  const urls = [...new Set(paths.map(siteUrl))].filter(u => u.startsWith(SITE));
  if (!urls.length) return { submitted: 0, status: null, skipped: "no urls" };
  if (!enabled() && !opts.force) return { submitted: 0, status: null, skipped: "disabled outside production" };
  let submitted = 0;
  let status: number | null = null;
  for (let i = 0; i < urls.length; i += 10_000) {
    const batch = urls.slice(i, i + 10_000);
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: batch }),
        signal: AbortSignal.timeout(15_000),
      });
      status = r.status;
      // 200 = accepted, 202 = accepted, key validation pending.
      if (r.status === 200 || r.status === 202) submitted += batch.length;
      else logger.warn({ status: r.status, body: (await r.text().catch(() => "")).slice(0, 300) }, "[indexnow] submission rejected");
    } catch (err) {
      logger.warn({ err }, "[indexnow] submission failed");
    }
  }
  if (submitted) logger.info({ submitted, status }, "[indexnow] submitted");
  return { submitted, status };
}

/** Fire-and-forget helper for content changes. */
export function pingIndexNow(paths: string[]): void {
  void submitToIndexNow(paths).catch(() => {});
}

/** Every public URL: static pages, published articles, player pages. */
export async function allPublicPaths(): Promise<string[]> {
  const paths = [...STATIC_PATHS];
  try {
    const articles = await db.select({ slug: seoArticlesTable.slug }).from(seoArticlesTable).where(eq(seoArticlesTable.published, true));
    paths.push(...articles.map(a => `/learn/${a.slug}`));
  } catch (err) { logger.warn({ err }, "[indexnow] articles query failed"); }
  try {
    const r: any = await db.execute(sql`SELECT slug FROM public_players WHERE data IS NOT NULL`);
    const rows: { slug: string }[] = Array.isArray(r) ? r : r?.rows ?? [];
    paths.push(...rows.map(p => `/players/${encodeURIComponent(p.slug)}`));
  } catch (err) { logger.warn({ err }, "[indexnow] players query failed"); }
  return paths;
}

/**
 * Submit everything at most once a week (checked on boot and daily), so a
 * fresh deploy or a quiet week still keeps the engines current.
 */
export async function weeklyFullSubmission(): Promise<void> {
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS indexnow_state (id VARCHAR PRIMARY KEY, last_full_at TIMESTAMPTZ, last_count INTEGER)`);
    const r: any = await db.execute(sql`SELECT last_full_at FROM indexnow_state WHERE id = 'main'`);
    const rows: { last_full_at: string | null }[] = Array.isArray(r) ? r : r?.rows ?? [];
    const last = rows[0]?.last_full_at ? new Date(rows[0].last_full_at).getTime() : 0;
    if (Date.now() - last < 7 * 86_400_000) return;
    const result = await submitToIndexNow(await allPublicPaths());
    if (result.submitted) {
      await db.execute(sql`INSERT INTO indexnow_state (id, last_full_at, last_count) VALUES ('main', now(), ${result.submitted})
        ON CONFLICT (id) DO UPDATE SET last_full_at = now(), last_count = ${result.submitted}`);
    }
  } catch (err) {
    logger.warn({ err }, "[indexnow] weekly submission failed");
  }
}

export function startIndexNow(): void {
  setTimeout(() => { void weeklyFullSubmission(); }, 5 * 60_000);
  setInterval(() => { void weeklyFullSubmission(); }, 24 * 60 * 60_000);
}
