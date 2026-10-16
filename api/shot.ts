import type { VercelRequest, VercelResponse } from '@vercel/node';

// Link-preview picture = a real screenshot of the page being shared.
//
// og:image on shareable pages points here (/api/shot?path=/players). We ask
// Microlink (the same screenshot service the admin Share Kit uses) to render
// the live page at 1200x630 and pass the image through. Vercel's CDN keeps
// each one for a day, so Microlink is asked about once a day per page and
// previews stay current. If the screenshot can't be made in time, we send the
// page's designed fallback image instead (briefly cached, so the next request
// tries again).

export const config = { maxDuration: 30 };

const SITE = 'https://chessscout.net';

// Only our own public pages can be screenshotted.
const PATH_RE = /^\/(?:|pricing|raffle|download|players|learn|tournaments)(?:\/[A-Za-z0-9_-]{1,120})?$/;

function fallbackFor(path: string): string {
  if (path.startsWith('/players')) return '/og-players.jpg';
  if (path.startsWith('/learn')) return '/og-learn.jpg';
  if (path.startsWith('/tournaments')) return '/og-tournaments.jpg';
  if (path.startsWith('/pricing')) return '/og-pricing.jpg';
  return '/og-default.jpg';
}

interface FetchRes { ok: boolean; status: number; headers: { get(n: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = String(req.query.path ?? '/');
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : '/';
  if (!PATH_RE.test(path) || path === '/tournaments/new') {
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    res.redirect(302, `${SITE}/og-default.jpg`);
    return;
  }
  const q = new URLSearchParams({
    url: `${SITE}${path}`,
    screenshot: 'true', meta: 'false', embed: 'screenshot.url',
    'viewport.width': '1200', 'viewport.height': '630', 'viewport.deviceScaleFactor': '1',
    // past the loading splash and the page's own fade-ins
    waitForTimeout: '4500',
    type: 'jpeg',
  });
  const key = process.env.MICROLINK_API_KEY;
  const host = key ? 'https://pro.microlink.io' : 'https://api.microlink.io';
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 25_000);
  try {
    const r = (await fetch(`${host}/?${q.toString()}`, { signal: c.signal, headers: key ? { 'x-api-key': key } : {} })) as unknown as FetchRes;
    const type = r.headers.get('content-type') || '';
    if (r.ok && type.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 5000) {
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
        res.status(200).send(buf);
        return;
      }
    }
  } catch { /* fall through to the designed image */ } finally { clearTimeout(timer); }
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  res.redirect(302, `${SITE}${fallbackFor(path)}`);
}
