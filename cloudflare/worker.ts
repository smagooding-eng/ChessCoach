// ChessScout.net on Cloudflare Workers (static assets + this small Worker).
//
// It does what vercel.json and the api/ functions do on Vercel, in the same order:
//   1. redirects (/ig, /tt, /yt, /fb, /blog, one-letter campaign links)
//   2. rewrites  (SEO pages, link previews for bots, sitemap, API pass-throughs)
//   3. everything else: the built app (static files, index.html for app routes)
// The page/og/sitemap/geo handlers are the same files Vercel runs (api/*.ts),
// called through a tiny stand-in for Vercel's req/res.
//
// Static files never reach this Worker (wrangler.jsonc `run_worker_first` lists
// only the paths below), so they stay free and unlimited on Cloudflare.

import geo from '../api/geo';
import og from '../api/og';
import page from '../api/page';
import sitemap from '../api/sitemap';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  STRIPE_SECRET_KEY?: string;
  API_URL?: string;
}
type Ctx = { waitUntil: (p: Promise<unknown>) => void };
type Handler = (req: any, res: any) => unknown;

const RENDER = 'https://chesscoach-api-kbf8.onrender.com';
const BOT = /.*(bot|Bot|BOT|crawler|spider|facebookexternalhit|Facebot|WhatsApp|Slack|Discord|Telegram|Twitter|LinkedIn|Pinterest|Embedly|Iframely|Quora|Skype|redditbot|Applebot|vkShare|Google-PageRenderer|Snapchat|Viber|Line\/|KakaoTalk|Mastodon|preview|Preview).*/;
const LANGS = 'es|pt|fr|de|it|nl|pl|ru|uk|tr|ro|cs|hu|el|sv|ar|fa|hi|bn|id|vi|th|tl|zh-cn|zh-tw|ja|ko';
const SEO_KEYS = 'play-chess-online|chess-for-kids|learn-chess|chess-puzzles|chess-tournaments|chess-game-analysis|scout-chess-opponent';

// ── Redirects (vercel.json "redirects", all temporary) ──────────────────────
function redirectFor(path: string): string | null {
  const bio: Record<string, string> = { '/ig': 'instagram', '/tt': 'tiktok', '/yt': 'youtube', '/fb': 'facebook' };
  if (bio[path]) return `/?utm_source=${bio[path]}&utm_medium=bio&utm_campaign=bio_link`;
  let m = path.match(/^\/blog\/([^/]+)$/);
  if (m) return `/learn/${m[1]}`;
  if (path === '/blog') return '/learn';
  m = path.match(/^\/([a-z0-9])$/);
  if (m) return `/?utm_source=heycatch&utm_campaign=${m[1]}`;
  return null;
}

// ── Rewrites (vercel.json "rewrites"): which handler, with which query ──────
type Target = { fn: 'og' | 'page' | 'sitemap'; q: Record<string, string> } | { proxy: string } | null;
function rewriteFor(path: string, ua: string): Target {
  let m: RegExpMatchArray | null;
  if (path === '/push-rotate') return { proxy: '/api/push/rotate' };
  if ((m = path.match(/^\/t\/(.*)$/))) return { proxy: `/api/t/${m[1]}` };
  const bot = BOT.test(ua);
  if (bot && (m = path.match(/^\/challenge\/([^/]+)$/))) return { fn: 'og', q: { kind: 'challenge', code: m[1] } };
  if (bot && (m = path.match(/^\/share\/([^/]+)$/))) return { fn: 'og', q: { kind: 'share', data: m[1] } };
  if (path === '/players') return { fn: 'page', q: { kind: 'players' } };
  if ((m = path.match(/^\/players\/([^/]+)$/))) return { fn: 'page', q: { kind: 'player', slug: m[1] } };
  if (path === '/learn') return { fn: 'page', q: { kind: 'learn' } };
  if ((m = path.match(/^\/learn\/([^/]+)$/))) return { fn: 'page', q: { kind: 'article', slug: m[1] } };
  if (path === '/sitemap.xml') return { fn: 'sitemap', q: {} };
  if (bot && (m = path.match(/^\/tournaments\/([^/]+)$/))) return { fn: 'og', q: { kind: 'tournament', id: m[1] } };
  if (bot && path === '/tournaments') return { fn: 'og', q: { kind: 'page', p: 'tournaments' } };
  if (bot && /^\/beginner(\/[^/]+\/[^/]+)?$/.test(path)) return { fn: 'og', q: { kind: 'page', p: 'beginner' } };
  if (bot && /^\/kids(\/[^/]+(\/[^/]+)?)?$/.test(path)) return { fn: 'og', q: { kind: 'page', p: 'kids' } };
  if (path === '/pricing') return { fn: 'page', q: { kind: 'seo', key: 'pricing' } };
  if ((m = path.match(new RegExp(`^/(${SEO_KEYS})$`)))) return { fn: 'page', q: { kind: 'seo', key: m[1] } };
  if ((m = path.match(new RegExp(`^/(${LANGS})$`)))) return { fn: 'page', q: { kind: 'seo', key: 'home', lang: m[1] } };
  if ((m = path.match(new RegExp(`^/(${LANGS})/(${SEO_KEYS}|pricing)$`)))) return { fn: 'page', q: { kind: 'seo', key: m[2], lang: m[1] } };
  if ((m = path.match(/^\/vs\/([^/]+)$/))) return { fn: 'page', q: { kind: 'vs', path: `/vs/${m[1]}` } };
  if (path === '/chess-openings') return { fn: 'page', q: { kind: 'openings' } };
  if ((m = path.match(/^\/chess-openings\/([^/]+)$/))) return { fn: 'page', q: { kind: 'opening', slug: m[1] } };
  if (path === '/chess-traps') return { fn: 'page', q: { kind: 'traps' } };
  if ((m = path.match(/^\/chess-traps\/([^/]+)$/))) return { fn: 'page', q: { kind: 'trap', slug: m[1] } };
  if (path === '/chess-tactics') return { fn: 'page', q: { kind: 'tactics' } };
  if ((m = path.match(/^\/chess-tactics\/([^/]+)$/))) return { fn: 'page', q: { kind: 'tactic', slug: m[1] } };
  return null;
}

// ── A stand-in for Vercel's req/res, so api/*.ts run unchanged ──────────────
function runVercel(fn: Handler, request: Request, query: Record<string, string>, url: string): Promise<Response> {
  const cf = ((request as unknown as { cf?: Record<string, unknown> }).cf ?? {}) as Record<string, string | undefined>;
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  headers['x-forwarded-for'] = request.headers.get('cf-connecting-ip') ?? headers['x-forwarded-for'] ?? '';
  // Vercel's location headers, from Cloudflare's own (same idea: worked out from the connection).
  if (cf.country) headers['x-vercel-ip-country'] = cf.country;
  if (cf.regionCode) headers['x-vercel-ip-country-region'] = cf.regionCode;
  if (cf.city) headers['x-vercel-ip-city'] = encodeURIComponent(cf.city);
  if (cf.timezone) headers['x-vercel-ip-timezone'] = cf.timezone;
  const req = { method: request.method, url, headers, query };

  return new Promise<Response>((resolve, reject) => {
    let code = 200;
    const out = new Headers();
    const finish = (body: BodyInit | null) => resolve(new Response(body, { status: code, headers: out }));
    const res = {
      status(n: number) { code = n; return res; },
      setHeader(k: string, v: string) { out.set(k, String(v)); return res; },
      json(o: unknown) { if (!out.has('Content-Type')) out.set('Content-Type', 'application/json; charset=utf-8'); finish(JSON.stringify(o)); return res; },
      send(b: unknown) { finish(typeof b === 'string' || b instanceof Uint8Array ? (b as BodyInit) : JSON.stringify(b)); return res; },
      end(b?: unknown) { finish((b as BodyInit) ?? null); return res; },
      redirect(a: number | string, b?: string) { const [c, to] = typeof a === 'number' ? [a, b!] : [302, a]; code = c; out.set('Location', to); finish(null); return res; },
    };
    Promise.resolve(fn(req, res)).catch(reject);
  });
}

// Vercel cached these at its edge (s-maxage); do the same with Cloudflare's cache so
// SEO pages and previews don't ask the API server on every visit.
async function cached(request: Request, ctx: Ctx, make: () => Promise<Response>): Promise<Response> {
  if (request.method !== 'GET') return make();
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(request.url, { method: 'GET', headers: { 'x-ua-kind': BOT.test(request.headers.get('user-agent') ?? '') ? 'bot' : 'human' } });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await make();
  const cc = res.headers.get('Cache-Control') ?? '';
  const s = cc.match(/s-maxage=(\d+)/);
  if (res.status === 200 && s && !/no-store|private/.test(cc)) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('Cache-Control', `public, max-age=${s[1]}`);
    ctx.waitUntil(cache.put(key, copy));
  }
  return res;
}

// Stripe products for the Subscription page (Vercel had this to dodge a Render
// network issue). Same reply shape: { data: [{ id, name, description, active, prices: [...] }] }.
async function stripeProducts(env: Env): Promise<Response> {
  const key = env.STRIPE_SECRET_KEY;
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  if (!key) return json({ error: 'STRIPE_SECRET_KEY is not set on Cloudflare' }, 500);
  const get = async (path: string) => {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2025-08-27.basil' } });
    if (!r.ok) throw new Error(`Stripe ${r.status}`);
    return r.json() as Promise<{ data: any[] }>;
  };
  try {
    const products = await get('products?active=true&limit=10');
    const data = [];
    for (const p of products.data) {
      const prices = await get(`prices?product=${encodeURIComponent(p.id)}&active=true&limit=10`);
      data.push({
        id: p.id, name: p.name, description: p.description, active: p.active,
        prices: prices.data.map((x) => ({ id: x.id, unit_amount: x.unit_amount, currency: x.currency, recurring: x.recurring, active: x.active })),
      });
    }
    return json({ data });
  } catch (err) {
    return json({ error: 'Failed to list products', _debug: { message: err instanceof Error ? err.message : String(err) } }, 500);
  }
}

const FNS: Record<'og' | 'page' | 'sitemap', Handler> = { og, page, sitemap };

// The page/og handlers fetch https://chessscout.net/index.html to fill in. Here that
// file comes straight from the static assets (no trip out and back in).
let assets: Env['ASSETS'] | null = null;
const outFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (assets && /^(www\.)?chessscout\.net$/.test(u.hostname) && u.pathname === '/index.html') {
    return assets.fetch(new Request(u.toString(), init));
  }
  return outFetch(input as RequestInfo, init);
}) as typeof fetch;

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    assets = env.ASSETS;
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;

    // The functions Vercel ran under /api
    if (path === '/api/geo') return runVercel(geo, request, {}, url.pathname + url.search);
    if (path === '/api/stripe/products') return request.method === 'GET' ? stripeProducts(env) : new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    if (path === '/api/og' || path === '/api/page' || path === '/api/sitemap') {
      const q = Object.fromEntries(url.searchParams);
      return cached(request, ctx, () => runVercel(FNS[path.slice(5) as 'og' | 'page' | 'sitemap'], request, q, url.pathname + url.search));
    }

    const to = redirectFor(path);
    if (to) return Response.redirect(new URL(to, url).toString(), 307);

    const rw = rewriteFor(path, request.headers.get('user-agent') ?? '');
    if (rw && 'proxy' in rw) {
      const target = new URL(rw.proxy + url.search, env.API_URL || RENDER);
      return fetch(new Request(target.toString(), request));
    }
    if (rw) {
      const q = { ...Object.fromEntries(url.searchParams), ...rw.q };
      const fakeUrl = `/api/${rw.fn}?${new URLSearchParams(q)}`;
      return cached(request, ctx, () => runVercel(FNS[rw.fn], request, q, fakeUrl));
    }

    // Everything else: the app itself (index.html for app routes; see wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },
};
