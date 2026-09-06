// Runs automatically before every `vite build` (see the "prebuild" script
// in package.json -- npm/pnpm run this on their own before "build").
// Previously public/sitemap.xml was a hand-written static file with 8
// fixed URLs and no awareness of the SEO articles the app generates on
// its own over time -- meaning every auto-generated article was
// essentially invisible to the sitemap, and had to rely purely on
// crawlers discovering it by following links from /learn. This fetches
// the live list of published articles at build time and writes them all
// into the sitemap alongside the fixed pages, so each new deploy's
// sitemap reflects however many articles actually exist by then.
//
// This is a static site with no server-side rendering (see
// src/lib/pageMeta.ts), so there's no way to regenerate the sitemap
// per-request -- it's only ever as fresh as the last deploy. That's an
// acceptable tradeoff for a sitemap (Google re-fetches it periodically
// regardless), but worth knowing: an article published between deploys
// won't show up in the sitemap until the next build runs.

const SITE_URL = "https://chessscout.net";
const STATIC_PAGES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pricing", changefreq: "monthly", priority: "0.8" },
  { path: "/learn", changefreq: "weekly", priority: "0.7" },
  { path: "/vs/aimchess", changefreq: "monthly", priority: "0.6" },
  { path: "/vs/improve-my-chess", changefreq: "monthly", priority: "0.6" },
  { path: "/vs/free-chess-analysis", changefreq: "monthly", priority: "0.6" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
];

function xmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const apiUrl = process.env.VITE_API_URL;
  let articles = [];
  if (apiUrl) {
    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/articles`);
      if (res.ok) {
        const data = await res.json();
        articles = Array.isArray(data.articles) ? data.articles : [];
      } else {
        console.warn(`[sitemap] /api/articles returned ${res.status}, sitemap will only include static pages`);
      }
    } catch (err) {
      console.warn("[sitemap] Failed to fetch articles, sitemap will only include static pages:", err.message);
    }
  } else {
    console.warn("[sitemap] VITE_API_URL not set, sitemap will only include static pages");
  }

  const urls = [
    ...STATIC_PAGES.map((p) => `  <url>\n    <loc>${SITE_URL}${p.path}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`),
    ...articles.map((a) => {
      const lastmod = a.createdAt ? `\n    <lastmod>${new Date(a.createdAt).toISOString().slice(0, 10)}</lastmod>` : "";
      return `  <url>\n    <loc>${SITE_URL}/learn/${xmlEscape(a.slug)}</loc>${lastmod}\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`;
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  const outPath = path.join(process.cwd(), "public", "sitemap.xml");
  await fs.writeFile(outPath, xml, "utf-8");
  console.log(`[sitemap] Wrote ${STATIC_PAGES.length} static pages + ${articles.length} articles to ${outPath}`);
}

main().catch((err) => {
  // Never fail the build over this -- a stale sitemap is much better
  // than a broken deploy.
  console.warn("[sitemap] Generation failed, leaving existing sitemap.xml in place:", err);
});
