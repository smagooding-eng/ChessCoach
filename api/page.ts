import type { VercelRequest, VercelResponse } from '@vercel/node';

// Readable-without-JavaScript versions of the public content pages.
//
// The app is a single-page site: every address returns the same index.html
// (the homepage's title and an empty page) until the JavaScript runs. Google
// copes, slowly; Bing, and the AI search tools built on it, often don't. For
// the pages people might search for -- /players, /players/<name>, /learn and
// /learn/<article> -- vercel.json sends the request here, and we return the
// normal index.html with that page's own title, description, canonical link
// and structured data, plus the page's text inside <div id="root">. Everyone
// gets the same HTML; the app then starts up and replaces that text with the
// interactive page. If anything fails, the plain index.html is served.

const SITE = 'https://chessscout.net';
const API = (process.env.VITE_API_URL || process.env.API_URL || 'https://chesscoach-api-kbf8.onrender.com').replace(/\/+$/, '');

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface FetchRes { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }
async function fetchWithTimeout(url: string, ms: number): Promise<FetchRes | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return (await fetch(url, { signal: c.signal })) as unknown as FetchRes; } catch { return null; } finally { clearTimeout(t); }
}
async function getJson<T>(path: string): Promise<T | null> {
  const r = await fetchWithTimeout(`${API}${path}`, 6000);
  if (!r || !r.ok) return null;
  return (await r.json().catch(() => null)) as T | null;
}

// image: designed fallback picture (public/); the preview itself is a live
// screenshot of the page from /api/shot, which falls back to that image.
interface Page { title: string; description: string; path: string; body: string; jsonLd?: unknown; status?: number; image?: string }

// ── Players ──────────────────────────────────────────────────────────────
type Res = { games: number; wins: number; draws: number; losses: number };
interface PlayerData {
  username: string; name: string | null; title: string | null; ratings: { bullet?: number; blitz?: number; rapid?: number };
  period: { from: string; to: string; games: number }; overall: { wins: number; draws: number; losses: number };
  asWhite: Res & { firstMoves: (Res & { move: string })[]; openings: (Res & { name: string })[] };
  asBlack: Res & { vsE4: (Res & { move: string })[]; vsD4: (Res & { move: string })[]; openings: (Res & { name: string })[] };
}
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const score = (r: Res) => (r.games ? Math.round(((r.wins + r.draws * 0.5) / r.games) * 100) : 0);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function list(rows: (Res & { name?: string; move?: string })[], total: number, prefix = ''): string {
  if (!rows.length) return '<p>Not enough games.</p>';
  return `<ul>${rows.map((r) => `<li><strong>${esc(r.move ? prefix + r.move : r.name ?? '')}</strong>: ${r.games} games (${pct(r.games, total)}%), scores ${score(r)}%</li>`).join('')}</ul>`;
}

async function playerPage(slug: string): Promise<Page | null> {
  const d = await getJson<{ data: PlayerData }>(`/api/public/players/${encodeURIComponent(slug)}`);
  const p = d?.data;
  if (!p) return null;
  const name = p.name || p.username;
  const who = `${p.title ? `${p.title} ` : ''}${name}`;
  const top = p.asWhite.firstMoves[0];
  const description = `What ${name} plays on Chess.com: ${top ? `1.${top.move} in ${pct(top.games, p.asWhite.games)}% of White games, ` : ''}top openings as White and Black, and results from ${p.period.games} recent games.`;
  const ratings = [p.ratings.blitz && `Blitz ${p.ratings.blitz}`, p.ratings.bullet && `Bullet ${p.ratings.bullet}`, p.ratings.rapid && `Rapid ${p.ratings.rapid}`].filter(Boolean).join(' · ');
  const body = `<main style="max-width:760px;margin:0 auto;padding:16px;color:#F5F7F6;font-family:system-ui,sans-serif">
<p><a href="/players">Players</a> / ${esc(p.username)}</p>
<h1>${esc(who)}'s openings</h1>
<p>Chess.com: ${esc(p.username)}${ratings ? ` · ${esc(ratings)}` : ''}</p>
<p>From ${p.period.games} games played on Chess.com between ${fmtDate(p.period.from)} and ${fmtDate(p.period.to)}: ${esc(name)} scored ${score({ games: p.period.games, ...p.overall })}% (${p.overall.wins} wins, ${p.overall.draws} draws, ${p.overall.losses} losses).${top ? ` With White, ${esc(name)} opens 1.${esc(top.move)} in ${pct(top.games, p.asWhite.games)}% of games.` : ''}</p>
<h2>As White: first move</h2>${list(p.asWhite.firstMoves, p.asWhite.games, '1.')}
<h2>As White: openings</h2>${list(p.asWhite.openings, p.asWhite.games)}
<h2>As Black: against 1.e4</h2>${list(p.asBlack.vsE4, p.asBlack.vsE4.reduce((n, r) => n + r.games, 0), '1...')}
<h2>As Black: against 1.d4</h2>${list(p.asBlack.vsD4, p.asBlack.vsD4.reduce((n, r) => n + r.games, 0), '1...')}
<h2>As Black: openings</h2>${list(p.asBlack.openings, p.asBlack.games)}
<p><a href="/setup">Scout any Chess.com or Lichess player free on ChessScout</a></p>
</main>`;
  return {
    title: `${who} — Openings & Repertoire | ChessScout`, description, path: `/players/${p.username}`, body, image: 'og-players.jpg',
    jsonLd: { '@context': 'https://schema.org', '@type': 'ProfilePage', name: `${who}'s chess openings`, url: `${SITE}/players/${p.username}`, description,
      mainEntity: { '@type': 'Person', name: p.name || p.username, alternateName: p.username } },
  };
}

async function playersIndex(): Promise<Page> {
  const d = await getJson<{ players: { slug: string; name: string | null; title: string | null }[] }>('/api/public/players');
  const players = d?.players ?? [];
  const body = `<main style="max-width:760px;margin:0 auto;padding:16px;color:#F5F7F6;font-family:system-ui,sans-serif">
<h1>What top players play</h1>
<p>Openings, first moves and recent results for top Chess.com players and streamers, from their real games.</p>
<ul>${players.map((p) => `<li><a href="/players/${esc(p.slug)}">${esc(`${p.title ? `${p.title} ` : ''}${p.name || p.slug}`)}</a></li>`).join('')}</ul>
</main>`;
  return { title: 'Top Chess Players’ Openings & Repertoires | ChessScout', description: 'See what the world’s top Chess.com players and streamers actually play: first moves, favorite openings as White and Black, and recent results.', path: '/players', body, image: 'og-players.jpg' };
}

// ── Articles ─────────────────────────────────────────────────────────────
function inline(t: string): string {
  return esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g, (_m, txt, href) => `<a href="${href}">${txt}</a>`);
}
function markdown(md: string): string {
  return md.split(/\n\n+/).map((b) => b.trim()).filter(Boolean).map((b) => {
    if (b.startsWith('## ')) return `<h2>${inline(b.slice(3))}</h2>`;
    if (b.startsWith('# ')) return `<h2>${inline(b.slice(2))}</h2>`;
    if (/^[-*]\s/.test(b)) return `<ul>${b.split('\n').map((l) => `<li>${inline(l.replace(/^[-*]\s*/, ''))}</li>`).join('')}</ul>`;
    return `<p>${inline(b)}</p>`;
  }).join('\n');
}

async function articlePage(slug: string): Promise<Page | null> {
  const d = await getJson<{ article: { slug: string; title: string; metaDescription: string; content: string; createdAt: string } }>(`/api/articles/${encodeURIComponent(slug)}`);
  const a = d?.article;
  if (!a) return null;
  return {
    title: `${a.title} — ChessScout.net`, description: a.metaDescription, path: `/learn/${a.slug}`, image: 'og-learn.jpg',
    body: `<main style="max-width:720px;margin:0 auto;padding:16px;color:#F5F7F6;font-family:system-ui,sans-serif"><p><a href="/learn">Articles</a></p><h1>${esc(a.title)}</h1>\n${markdown(a.content || '')}</main>`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.metaDescription, datePublished: a.createdAt,
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/learn/${a.slug}` }, author: { '@type': 'Organization', name: 'ChessScout.net' }, publisher: { '@type': 'Organization', name: 'ChessScout.net' } },
  };
}

async function articlesIndex(): Promise<Page> {
  const d = await getJson<{ articles: { slug: string; title: string; metaDescription: string }[] }>('/api/articles');
  const articles = d?.articles ?? [];
  return {
    title: 'Chess Improvement Articles — ChessScout.net', description: 'Practical chess improvement articles on blunders, time trouble, and opening mistakes.', path: '/learn', image: 'og-learn.jpg',
    body: `<main style="max-width:720px;margin:0 auto;padding:16px;color:#F5F7F6;font-family:system-ui,sans-serif"><h1>Chess improvement articles</h1><ul>${articles.map((a) => `<li><a href="/learn/${esc(a.slug)}">${esc(a.title)}</a> — ${esc(a.metaDescription)}</li>`).join('')}</ul></main>`,
  };
}

// ── HTML assembly ────────────────────────────────────────────────────────
function apply(html: string, p: Page): string {
  const t = esc(p.title), d = esc(p.description), u = esc(`${SITE}${p.path}`);
  const setTag = (h: string, attr: string, key: string, value: string) => {
    const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i');
    return re.test(h) ? h.replace(re, `$1${value}$2`) : h.replace('</head>', `<meta ${attr}="${key}" content="${value}" />\n</head>`);
  };
  let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`);
  out = setTag(out, 'name', 'description', d);
  out = setTag(out, 'property', 'og:title', t);
  out = setTag(out, 'property', 'og:description', d);
  out = setTag(out, 'property', 'og:url', u);
  out = setTag(out, 'name', 'twitter:title', t);
  out = setTag(out, 'name', 'twitter:description', d);
  {
    const img = esc(`${SITE}/api/shot?path=${encodeURIComponent(p.path)}`);
    out = setTag(out, 'property', 'og:image', img);
    out = setTag(out, 'name', 'twitter:image', img);
  }
  out = /<link\s+rel="canonical"[^>]*>/i.test(out)
    ? out.replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${u}" />`)
    : out.replace('</head>', `<link rel="canonical" href="${u}" />\n</head>`);
  if (p.jsonLd) out = out.replace('</head>', `<script type="application/ld+json">${JSON.stringify(p.jsonLd).replace(/</g, '\\u003c')}</script>\n</head>`);
  out = out.replace(/<div id="root">\s*<\/div>/i, `<div id="root">${p.body}</div>`);
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const kind = String(req.query.kind ?? '');
  const slug = String(req.query.slug ?? '').toLowerCase().slice(0, 120);
  let page: Page | null = null;
  try {
    if (kind === 'players') page = await playersIndex();
    else if (kind === 'player' && /^[a-z0-9_-]{2,40}$/.test(slug)) page = await playerPage(slug);
    else if (kind === 'learn') page = await articlesIndex();
    else if (kind === 'article' && /^[a-z0-9-]{1,120}$/.test(slug)) page = await articlePage(slug);
  } catch { page = null; }

  const pageRes = await fetchWithTimeout(`${SITE}/index.html`, 3500);
  let html = pageRes && pageRes.ok ? await pageRes.text() : '';
  if (!html) html = `<!doctype html><html><head><meta charset="utf-8" /><title>ChessScout.net</title></head><body><div id="root"></div></body></html>`;
  if (page) html = apply(html, page);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', page ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'public, s-maxage=60');
  res.status(200).send(html);
}
