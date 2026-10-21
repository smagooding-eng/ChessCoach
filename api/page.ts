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

// Crawlers never run the page's JavaScript, so they're reported to the API
// here (Admin > Bots & Crawlers). Short timeout; never holds up the reply long.
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|meta-external|whatsapp|telegram|discord|slack|embedly|iframely|quora|skype|vkshare|google-pagerenderer|snapchat|viber|line\/|kakaotalk|mastodon|headless|lighthouse|curl|wget|python|go-http|okhttp|axios|node-fetch|scrapy/i;
async function reportBot(req: VercelRequest, path: string): Promise<void> {
  const ua = String(req.headers['user-agent'] ?? '');
  if (ua && !BOT_UA.test(ua)) return;
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 800);
  try {
    await fetch(`${API}/api/track-bot`, { method: 'POST', signal: c.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, ua, ip }) });
  } catch { /* stats only */ } finally { clearTimeout(t); }
}

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

// image: designed picture (public/og-*.jpg); the preview uses the section's
// real screenshot from public/shots/, re-taken daily by a GitHub workflow.
interface Page { title: string; description: string; path: string; body: string; jsonLd?: unknown; status?: number; image?: string; lang?: string; alternates?: { lang: string; path: string }[] }

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

// ── Search-friendly pages (/play-chess-online, /es/..., /pricing, /vs/...) ─
const MAIN = '<main style="max-width:760px;margin:0 auto;padding:16px;color:#F5F7F6;font-family:system-ui,sans-serif">';
const LANG_NAMES: Record<string, string> = { en: 'English', es: 'Español', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano', nl: 'Nederlands', pl: 'Polski', ru: 'Русский', uk: 'Українська', tr: 'Türkçe', ro: 'Română', cs: 'Čeština', hu: 'Magyar', el: 'Ελληνικά', sv: 'Svenska', ar: 'العربية', fa: 'فارسی', hi: 'हिन्दी', bn: 'বাংলা', id: 'Bahasa Indonesia', vi: 'Tiếng Việt', th: 'ไทย', tl: 'Filipino', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', ja: '日本語', ko: '한국어' };
interface SeoLink { label: string; href: string }
interface SeoData {
  key: string; lang: string; path: string; image?: string; title: string; description: string; h1: string; intro: string;
  sections: { h: string; p: string; links?: SeoLink[] }[]; faq: { q: string; a: string }[]; cta: SeoLink;
  alternates: { lang: string; path: string }[]; related: SeoLink[];
}
const link = (l: SeoLink) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`;

async function seoPage(key: string, lang: string): Promise<Page | null> {
  const d = await getJson<{ page: SeoData }>(`/api/public/seo/page/${encodeURIComponent(key)}?lang=${encodeURIComponent(lang)}`);
  const p = d?.page;
  if (!p) return null;
  // Asked for a language the page isn't translated into yet: don't serve English at that address.
  if (lang !== 'en' && p.lang !== lang) return null;
  const dir = p.lang === 'ar' || p.lang === 'fa' ? ' dir="rtl"' : '';
  const others = p.alternates.filter((a) => a.lang !== p.lang);
  const body = `<main lang="${esc(p.lang)}"${dir} style="max-width:760px;margin:0 auto;padding:16px;color:#F5F7F6;font-family:system-ui,sans-serif">
<p><a href="${p.lang === 'en' ? '/' : `/${p.lang.toLowerCase()}`}">ChessScout.net</a></p>
<h1>${esc(p.h1)}</h1>
<p>${esc(p.intro)}</p>
<p>${link(p.cta)}</p>
${p.sections.map((x) => `<h2>${esc(x.h)}</h2>\n<p>${esc(x.p)}</p>${x.links?.length ? `\n<p>${x.links.map(link).join(' · ')}</p>` : ''}`).join('\n')}
${p.faq.length ? `${p.faq.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}` : ''}
${p.related.length ? `<nav><p>${p.related.map(link).join(' · ')}</p></nav>` : ''}
${others.length ? `<nav><p>${others.map((a) => `<a href="${esc(a.path)}" hreflang="${esc(a.lang)}">${esc(LANG_NAMES[a.lang] ?? a.lang)}</a>`).join(' · ')}</p></nav>` : ''}
</main>`;
  const jsonLd = p.faq.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: p.lang, mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) } : undefined;
  return { title: p.title, description: p.description, path: p.path, body, image: p.image, lang: p.lang, alternates: p.alternates, jsonLd };
}

interface VsData { path: string; title: string; description: string; competitor: string; intro: string; rows: { feature: string; us: string; them: string }[]; note: string }
async function vsPage(path: string): Promise<Page | null> {
  const d = await getJson<{ page: VsData }>(`/api/public/seo/vs?path=${encodeURIComponent(path)}`);
  const v = d?.page;
  if (!v) return null;
  const body = `${MAIN}
<p><a href="/">ChessScout.net</a></p>
<h1>${esc(v.title)}</h1>
<p>${esc(v.intro)}</p>
<table><thead><tr><th>Feature</th><th>ChessScout.net</th><th>${esc(v.competitor)}</th></tr></thead><tbody>
${v.rows.map((r) => `<tr><td>${esc(r.feature)}</td><td>${esc(r.us)}</td><td>${esc(r.them)}</td></tr>`).join('\n')}
</tbody></table>
<h2>The honest take</h2>
<p>${esc(v.note)}</p>
<p><a href="/setup?signup=1">Try ChessScout.net free</a> · <a href="/pricing">Pricing</a></p>
</main>`;
  return { title: v.title, description: v.description, path: v.path, body, image: 'og-pricing.jpg' };
}

// ── Openings and traps ───────────────────────────────────────────────────
type Tally = { games: number; wins: number; draws: number; losses: number };
interface OpeningSummary { slug: string; name: string; games: number; players: number; asWhite: Tally; asBlack: Tally; moves: string | null }
interface OpeningDetail extends OpeningSummary { note: string | null; topPlayers: { slug: string; name: string; title: string | null; color: 'white' | 'black'; games: number; score: number }[] }

async function openingsIndex(): Promise<Page> {
  const d = await getJson<{ openings: OpeningSummary[] }>('/api/public/openings');
  const list = d?.openings ?? [];
  return {
    title: 'Chess Openings: What Top Players Play & How They Score | ChessScout', path: '/chess-openings', image: 'og-players.jpg',
    description: 'The chess openings top Chess.com players and grandmasters choose most, and how they score with each as White and Black, from their real games.',
    body: `${MAIN}<p><a href="/">ChessScout.net</a></p><h1>Chess openings top players actually play</h1>
<p>Built from the real recent games of top Chess.com players and grandmasters: how often each opening is chosen, and how they score with it as White and as Black. Score means wins plus half the draws.</p>
<ul>${list.map((o) => `<li><a href="/chess-openings/${esc(o.slug)}">${esc(o.name)}</a>${o.moves ? ` (${esc(o.moves)})` : ''}: ${o.games} games by ${o.players} players; White scores ${score(o.asWhite)}%, Black scores ${score(o.asBlack)}%</li>`).join('')}</ul>
<p><a href="/setup?signup=1">Train your openings free on ChessScout.net</a></p></main>`,
  };
}

async function openingPage(slug: string): Promise<Page | null> {
  const d = await getJson<{ opening: OpeningDetail }>(`/api/public/openings/${encodeURIComponent(slug)}`);
  const o = d?.opening;
  if (!o) return null;
  const side = (label: string, t: Tally) => t.games ? `<p><strong>${label}:</strong> ${score(t)}% score in ${t.games} games (${t.wins} wins, ${t.draws} draws, ${t.losses} losses).</p>` : '';
  const description = `${o.name}${o.moves ? ` (${o.moves})` : ''}: how top Chess.com players and grandmasters score with it as White and Black, and who plays it most, from ${o.games} real games.`;
  return {
    title: `${o.name}: How Top Players Score With It | ChessScout`, description, path: `/chess-openings/${o.slug}`, image: 'og-players.jpg',
    body: `${MAIN}<p><a href="/chess-openings">Chess openings</a></p><h1>${esc(o.name)}</h1>
${o.moves ? `<p><strong>${esc(o.moves)}</strong></p>` : ''}${o.note ? `<p>${esc(o.note)}</p>` : ''}
${side('As White', o.asWhite)}${side('As Black', o.asBlack)}
<h2>Who plays it most</h2>
<ul>${o.topPlayers.map((p) => `<li><a href="/players/${esc(p.slug)}">${esc(`${p.title ? `${p.title} ` : ''}${p.name}`)}</a>: ${p.games} games as ${p.color === 'white' ? 'White' : 'Black'}, scores ${p.score}%</li>`).join('')}</ul>
<p>From the recent public Chess.com games of ${o.players} players on the <a href="/players">top players list</a>, updated about once a week. Score = wins plus half the draws.</p>
<p><a href="/scout-chess-opponent">Scout your opponent</a> · <a href="/setup?signup=1">Drill your openings free</a></p></main>`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: `${o.name}: how top players score with it`, description, mainEntityOfPage: `${SITE}/chess-openings/${o.slug}`, publisher: { '@type': 'Organization', name: 'ChessScout.net' } },
  };
}

interface PublicTrap { id?: number; slug: string; name: string; category: string; difficulty: string; trapSide: string; summary: string; explanation?: string; startingFen?: string; moves?: string[]; moveNotes?: string[]; criticalMoveIndex?: number; safeMoves?: string[] }

async function trapsIndex(): Promise<Page> {
  const d = await getJson<{ traps: PublicTrap[] }>('/api/public/traps');
  const list = d?.traps ?? [];
  return {
    title: 'Chess Opening Traps: Learn, Set & Avoid Them | ChessScout', path: '/chess-traps', image: 'og-learn.jpg',
    description: 'Classic chess opening traps explained move by move: how each one works, the move that falls for it, and the safe reply. Practice them free.',
    body: `${MAIN}<p><a href="/">ChessScout.net</a></p><h1>Chess opening traps</h1>
<p>The traps players fall into most, explained move by move: how each one works, the move that falls for it, and the safe reply.</p>
<ul>${list.map((t) => `<li><a href="/chess-traps/${esc(t.slug)}">${esc(t.name)}</a> (${esc(t.category)}, ${esc(t.difficulty)}): ${esc(t.summary)}</li>`).join('')}</ul></main>`,
  };
}

function numbered(fen: string, moves: string[]): string[] {
  const parts = fen.split(' ');
  let n = parseInt(parts[5] || '1', 10) || 1;
  let white = (parts[1] || 'w') === 'w';
  return moves.map((san) => { const label = white ? `${n}.` : `${n}...`; if (!white) n++; white = !white; return `${label} ${san}`; });
}

async function trapPage(slug: string): Promise<Page | null> {
  const d = await getJson<{ trap: PublicTrap }>(`/api/public/traps/${encodeURIComponent(slug)}`);
  const t = d?.trap;
  if (!t) return null;
  const moves = numbered(t.startingFen ?? '', t.moves ?? []);
  const description = `${t.summary} How the ${t.name} works, the move that falls for it, and how to avoid it.`.slice(0, 300);
  return {
    title: `${t.name}: Chess Trap Explained Move by Move | ChessScout`, description, path: `/chess-traps/${t.slug}`, image: 'og-learn.jpg',
    body: `${MAIN}<p><a href="/chess-traps">Chess traps</a></p><h1>${esc(t.name)}</h1>
<p>${esc(t.category)} · ${esc(t.difficulty)} · set by ${t.trapSide === 'white' ? 'White' : 'Black'}</p>
<p>${esc(t.summary)}</p>${t.explanation ? `<p>${esc(t.explanation)}</p>` : ''}
<h2>Move by move</h2>
<ol>${moves.map((m, i) => `<li><strong>${esc(m)}</strong>${i === t.criticalMoveIndex ? ' (the mistake)' : ''}${t.moveNotes?.[i] ? `: ${esc(t.moveNotes[i])}` : ''}</li>`).join('')}</ol>
${t.safeMoves?.length ? `<p><strong>Safe instead:</strong> ${esc(t.safeMoves.join(', '))}</p>` : ''}
<p><a href="/setup?signup=1">Practice the ${esc(t.name)} free on ChessScout.net</a></p></main>`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: `${t.name}: chess trap explained`, description, mainEntityOfPage: `${SITE}/chess-traps/${t.slug}`, publisher: { '@type': 'Organization', name: 'ChessScout.net' } },
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
    const img = esc(p.image ? `${SITE}/${p.image}` : `${SITE}/shots/${p.path.startsWith('/learn') ? 'learn' : 'players'}.jpg`);
    out = setTag(out, 'property', 'og:image', img);
    out = setTag(out, 'name', 'twitter:image', img);
  }
  out = /<link\s+rel="canonical"[^>]*>/i.test(out)
    ? out.replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${u}" />`)
    : out.replace('</head>', `<link rel="canonical" href="${u}" />\n</head>`);
  if (p.lang) {
    out = out.replace(/<html lang="[^"]*"/i, `<html lang="${esc(p.lang)}"`);
    out = setTag(out, 'property', 'og:locale', esc(p.lang.replace('-', '_')));
  }
  if (p.alternates && p.alternates.length > 1) {
    const tags = [...p.alternates.map((a) => `<link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(`${SITE}${a.path}`)}" />`),
      `<link rel="alternate" hreflang="x-default" href="${esc(`${SITE}${p.alternates.find((a) => a.lang === 'en')?.path ?? p.path}`)}" />`];
    out = out.replace('</head>', `${tags.join('\n')}\n</head>`);
  }
  if (p.jsonLd) out = out.replace('</head>', `<script type="application/ld+json">${JSON.stringify(p.jsonLd).replace(/</g, '\\u003c')}</script>\n</head>`);
  // index.html carries the home page's text inside #root between these
  // markers; other pages replace it with their own.
  out = /<!--seo-->[\s\S]*<!--\/seo-->/.test(out)
    ? out.replace(/<!--seo-->[\s\S]*<!--\/seo-->/, () => `<!--seo-->${p.body}<!--/seo-->`)
    : out.replace(/<div id="root">\s*<\/div>/i, () => `<div id="root">${p.body}</div>`);
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
    else if (kind === 'seo' && /^[a-z-]{2,40}$/.test(String(req.query.key ?? ''))) {
      const lang = String(req.query.lang ?? 'en');
      page = await seoPage(String(req.query.key), /^[a-z]{2}(-[a-z]{2})?$/i.test(lang) ? lang : 'en');
    }
    else if (kind === 'vs' && /^\/vs\/[a-z-]{2,40}$/.test(String(req.query.path ?? ''))) page = await vsPage(String(req.query.path));
    else if (kind === 'openings') page = await openingsIndex();
    else if (kind === 'opening' && /^[a-z0-9-]{1,80}$/.test(slug)) page = await openingPage(slug);
    else if (kind === 'traps') page = await trapsIndex();
    else if (kind === 'trap' && /^[a-z0-9-]{1,80}$/.test(slug)) page = await trapPage(slug);
  } catch { page = null; }

  // A language this page isn't translated into yet: send people (and crawlers)
  // to the English page rather than show English at a translated address.
  if (!page && kind === 'seo' && String(req.query.lang ?? 'en') !== 'en' && /^[a-z-]{2,40}$/.test(String(req.query.key ?? ''))) {
    const key = String(req.query.key);
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.redirect(302, key === 'home' ? '/' : `/${key}`);
    return;
  }

  const [pageRes] = await Promise.all([
    fetchWithTimeout(`${SITE}/index.html`, 3500),
    reportBot(req, page?.path ?? `/${kind}`),
  ]);
  let html = pageRes && pageRes.ok ? await pageRes.text() : '';
  if (!html) html = `<!doctype html><html><head><meta charset="utf-8" /><title>ChessScout.net</title></head><body><div id="root"></div></body></html>`;
  if (page) html = apply(html, page);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', page ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'public, s-maxage=60');
  res.status(200).send(html);
}
