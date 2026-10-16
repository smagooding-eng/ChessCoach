import type { VercelRequest, VercelResponse } from '@vercel/node';

// chessscout.net/sitemap.xml
//
// The full sitemap (every published /learn article) is built by the API server
// on Render. Proxying straight to it failed whenever Render was asleep or slow
// -- Google then got an error page instead of XML and called the sitemap
// invalid. This function fetches it with a generous timeout, checks it really
// is a sitemap, and otherwise serves the core pages so Google always gets
// valid XML. Responses are cached at the edge for an hour.

const SITE = 'https://chessscout.net';
const API = (process.env.VITE_API_URL || process.env.API_URL || 'https://chesscoach-api-kbf8.onrender.com').replace(/\/+$/, '');

const CORE: [string, string, string][] = [
  ['/', 'weekly', '1.0'],
  ['/pricing', 'monthly', '0.8'],
  ['/learn', 'weekly', '0.7'],
  ['/tournaments', 'daily', '0.7'],
  ['/vs/aimchess', 'monthly', '0.6'],
  ['/vs/improve-my-chess', 'monthly', '0.6'],
  ['/vs/free-chess-analysis', 'monthly', '0.6'],
  ['/privacy', 'yearly', '0.3'],
  ['/terms', 'yearly', '0.3'],
];

function fallbackXml(): string {
  const urls = CORE.map(([p, f, pr]) => `  <url>\n    <loc>${SITE}${p}</loc>\n    <changefreq>${f}</changefreq>\n    <priority>${pr}</priority>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

interface FetchRes { ok: boolean; status: number; text(): Promise<string> }

async function fetchWithTimeout(url: string, ms: number): Promise<FetchRes | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return (await fetch(url, { signal: c.signal })) as unknown as FetchRes; } catch { return null; } finally { clearTimeout(t); }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  let xml = '';
  const r = await fetchWithTimeout(`${API}/sitemap.xml`, 8000);
  if (r && r.ok) {
    const body = (await r.text().catch(() => '')).trim();
    if (body.startsWith('<?xml') && body.includes('<urlset') && body.includes('</urlset>')) xml = body + '\n';
  }
  const full = !!xml;
  if (!xml) xml = fallbackXml();
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Full sitemap: cache an hour. Fallback: cache briefly so the full one is retried soon.
  res.setHeader('Cache-Control', full ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'public, s-maxage=120');
  res.status(200).send(xml);
}
