import { Router, type IRouter, type Request, type Response } from "express";
import { db, seoArticlesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SITE = "https://chessscout.net";

// Static pages worth indexing. Deliberately does NOT include anything
// behind ProtectedRoute (Openings, Traps, Endgames, Puzzles, etc.) --
// a crawler can't reach real content behind the login wall, so listing
// those would just waste crawl budget and could look like cloaking.
const STATIC_URLS: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pricing", changefreq: "monthly", priority: "0.8" },
  { path: "/learn", changefreq: "weekly", priority: "0.7" },
  { path: "/tournaments", changefreq: "daily", priority: "0.7" },
  { path: "/vs/aimchess", changefreq: "monthly", priority: "0.6" },
  { path: "/vs/improve-my-chess", changefreq: "monthly", priority: "0.6" },
  { path: "/vs/free-chess-analysis", changefreq: "monthly", priority: "0.6" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
];

function urlEntry(loc: string, changefreq: string, priority: string, lastmod?: string): string {
  const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  return `  <url>\n    <loc>${loc}</loc>${lastmodTag}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

// Dynamically generated so every new /learn article the weekly SEO cron
// publishes shows up here automatically -- the old static sitemap.xml
// never included articles at all, which meant the whole content-generation
// pipeline was invisible to crawlers except via internal links from the
// /learn index. Falls back to just the static entries if the DB query
// fails, rather than taking the whole sitemap down.
router.get("/sitemap.xml", async (_req: Request, res: Response) => {
  const staticXml = STATIC_URLS.map((u) => urlEntry(`${SITE}${u.path}`, u.changefreq, u.priority));

  let articleXml: string[] = [];
  try {
    const articles = await db.select({
      slug: seoArticlesTable.slug,
      createdAt: seoArticlesTable.createdAt,
    }).from(seoArticlesTable).where(eq(seoArticlesTable.published, true)).orderBy(desc(seoArticlesTable.createdAt));

    articleXml = articles.map((a) =>
      urlEntry(`${SITE}/learn/${a.slug}`, "monthly", "0.6", new Date(a.createdAt).toISOString().split("T")[0]),
    );
  } catch (err) {
    logger.error({ err }, "[sitemap] Failed to load articles, serving static entries only");
  }

  // Public player pages (/players and /players/<username>).
  let playerXml: string[] = [];
  try {
    const rows = await db.execute(sql`SELECT slug, updated_at FROM public_players WHERE data IS NOT NULL ORDER BY games DESC`);
    const list = rows.rows as { slug: string; updated_at: string }[];
    if (list.length) {
      playerXml = [urlEntry(`${SITE}/players`, "weekly", "0.7"),
        ...list.map((p) => urlEntry(`${SITE}/players/${encodeURIComponent(p.slug)}`, "weekly", "0.6", new Date(p.updated_at).toISOString().split("T")[0]))];
    }
  } catch (err) {
    logger.warn({ err }, "[sitemap] Failed to load players");
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticXml, ...articleXml, ...playerXml].join("\n")}\n</urlset>\n`;

  res.set("Content-Type", "application/xml");
  res.send(xml);
});

export default router;
