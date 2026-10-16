import type { VercelRequest, VercelResponse } from '@vercel/node';

// Link previews for shared links.
//
// The app is a single-page site, so every URL serves the same index.html with
// the same generic title and picture, and link-preview bots (iMessage,
// WhatsApp, Facebook, X, Discord, Slack, Telegram...) don't run JavaScript.
// vercel.json sends those bots -- only those bots -- here for /challenge/<code>
// and /share/<card>; we serve the normal index.html with the title,
// description and picture swapped for ones about what's being shared, e.g.
// "Shann challenges you to a game of chess".

const SITE = 'https://chessscout.net';
const API = (process.env.VITE_API_URL || process.env.API_URL || 'https://chesscoach-api-kbf8.onrender.com').replace(/\/+$/, '');

interface Meta { title: string; description: string; image: string; url: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The function's TypeScript setup has no browser "Response" type, so describe
// just the bits of a fetch response we use.
interface FetchRes { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }

async function fetchWithTimeout(url: string, ms: number): Promise<FetchRes | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return (await fetch(url, { signal: c.signal })) as unknown as FetchRes; } catch { return null; } finally { clearTimeout(t); }
}

interface Challenge {
  kind: 'live' | 'daily'; timeControlLabel: string | null; mode: string; status: string;
  creatorUsername: string; open?: boolean; isRequest?: boolean;
}

async function challengeMeta(code: string): Promise<Meta | null> {
  const r = await fetchWithTimeout(`${API}/api/challenges/${encodeURIComponent(code)}`, 3500);
  if (!r || !r.ok) return null;
  const d = await r.json().catch(() => null) as { challenge?: Challenge } | null;
  const c = d?.challenge;
  if (!c) return null;
  const name = c.creatorUsername || 'A player';
  const daily = c.kind === 'daily';
  const what = daily ? `daily game (${c.timeControlLabel ?? ''} per move)` : `${c.timeControlLabel ?? ''} live game`;
  const mode = c.mode === 'ranked' ? 'Ranked' : 'Casual';
  const image = `${SITE}/${daily ? 'og-challenge-daily.jpg' : 'og-challenge.jpg'}`;
  const url = `${SITE}/challenge/${code}`;
  if (c.isRequest) {
    return { title: `Chess challenge for ${name}`, description: 'A challenge request on ChessScout.net.', image, url };
  }
  if (c.open) {
    return {
      title: `Challenge ${name} to a game of chess`,
      description: `${name} is up for a ${what} on ChessScout.net (${mode}). Send a challenge and play.`,
      image, url,
    };
  }
  if (c.status !== 'open') {
    return { title: `${name}'s chess challenge`, description: 'This challenge has already been played or has expired. Play your own game on ChessScout.net.', image, url };
  }
  return {
    title: `${name} challenges you to a game of chess`,
    description: `${daily ? 'Daily' : 'Live'} · ${c.timeControlLabel ?? ''} · ${mode}. Tap to accept and play on ChessScout.net.`,
    image, url,
  };
}

type Card =
  | { type: 'course'; username: string; courseName: string }
  | { type: 'milestone'; username: string; newRating: number }
  | { type: 'streak'; username: string; streakDays: number }
  | { type: 'puzzle'; username: string; rating: number }
  | { type: 'puzzle_position'; rating: number };

function shareMeta(data: string): Meta | null {
  let card: Card;
  try {
    card = JSON.parse(decodeURIComponent(escape(Buffer.from(decodeURIComponent(data), 'base64').toString('binary'))));
  } catch { return null; }
  const url = `${SITE}/share/${data}`;
  const ach = `${SITE}/og-achievement.jpg`;
  switch (card?.type) {
    case 'milestone': return { title: `${card.username} reached a ${card.newRating} Scout rating`, description: 'Tracking real progress on ChessScout.net. See how they did it.', image: ach, url };
    case 'streak': return { title: `${card.username} is on a ${card.streakDays}-day chess streak`, description: 'Training every day on ChessScout.net.', image: ach, url };
    case 'course': return { title: `${card.username} completed "${card.courseName}"`, description: 'A course built from their own games on ChessScout.net.', image: ach, url };
    case 'puzzle': return { title: `${card.username} is solving chess puzzles at ${card.rating}`, description: 'Can you beat their puzzle rating? Try on ChessScout.net.', image: `${SITE}/og-puzzle.jpg`, url };
    case 'puzzle_position': return { title: `Can you solve this ${card.rating}-rated chess puzzle?`, description: 'Find the best move on ChessScout.net.', image: `${SITE}/og-puzzle.jpg`, url };
    default: return null;
  }
}

// Plain app pages (no server-side content): just their own title and picture.
const PAGES: Record<string, Omit<Meta, 'url'> & { path: string }> = {
  pricing: { path: '/pricing', title: 'Pricing — ChessScout.net', description: 'Free forever, or $5/month for everything: AI coach on every game, personalized courses, scouting reports and Pro tournaments.', image: `${SITE}/shots/pricing.jpg` },
  tournaments: { path: '/tournaments', title: 'Online Chess Tournaments | ChessScout.net', description: 'Free online chess tournaments: nightly arenas, weekend knockouts, live or daily. Join one, or create one for your club.', image: `${SITE}/shots/tournaments.jpg` },
};

function pageMeta(key: string): Meta | null {
  const p = PAGES[key];
  return p ? { title: p.title, description: p.description, image: p.image, url: `${SITE}${p.path}` } : null;
}

interface TournamentInfo {
  name: string; format: string; kind: string; mode: string; timeControlLabel: string; status: string;
  startsAt: string; players: number; clubName: string | null; createdByName: string | null; winner: string | null;
}

async function tournamentMeta(id: string): Promise<Meta | null> {
  const r = await fetchWithTimeout(`${API}/api/tournaments/${encodeURIComponent(id)}`, 3500);
  if (!r || !r.ok) return null;
  const d = await r.json().catch(() => null) as { tournament?: TournamentInfo } | null;
  const t = d?.tournament;
  if (!t) return null;
  const what = `${t.format === 'bracket' ? 'Knockout' : 'Arena'} · ${t.kind === 'daily' ? `${t.timeControlLabel} per move` : t.timeControlLabel} · ${t.mode === 'ranked' ? 'Ranked' : 'Casual'}`;
  const host = t.clubName || t.createdByName || 'ChessScout.net';
  const state = t.status === 'finished'
    ? (t.winner ? `Won by ${t.winner}. See the final standings.` : 'See the final standings.')
    : t.status === 'running' ? 'Live now. Tap to join and play.' : 'Free to join. Tap to sign up.';
  return {
    title: `${t.name} | Chess tournament on ChessScout.net`,
    description: `${what}. Hosted by ${host}. ${state}`,
    image: `${SITE}/shots/tournaments.jpg`,
    url: `${SITE}/tournaments/${id}`,
  };
}

function setMeta(html: string, m: Meta): string {
  const t = esc(m.title), d = esc(m.description), i = esc(m.image), u = esc(m.url);
  const tag = (attr: string, key: string, value: string) => {
    const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i');
    return (h: string) => re.test(h) ? h.replace(re, `$1${value}$2`) : h.replace('</head>', `<meta ${attr}="${key}" content="${value}" />\n</head>`);
  };
  const steps = [
    tag('property', 'og:title', t), tag('property', 'og:description', d), tag('property', 'og:image', i), tag('property', 'og:url', u),
    tag('name', 'twitter:title', t), tag('name', 'twitter:description', d), tag('name', 'twitter:image', i),
    tag('name', 'description', d),
  ];
  let out = steps.reduce((h, f) => f(h), html);
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`);
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const kind = String(req.query.kind ?? '');
  const key = String(req.query.code ?? req.query.data ?? '');
  let meta: Meta | null = null;
  try {
    if (kind === 'challenge' && key) meta = await challengeMeta(key);
    else if (kind === 'share' && key) meta = shareMeta(key);
    else if (kind === 'page') meta = pageMeta(String(req.query.p ?? ''));
    else if (kind === 'tournament' && /^[a-z0-9]{4,40}$/i.test(String(req.query.id ?? ''))) meta = await tournamentMeta(String(req.query.id));
  } catch { meta = null; }

  const pageRes = await fetchWithTimeout(`${SITE}/index.html`, 3500);
  let html = pageRes && pageRes.ok ? await pageRes.text() : '';
  if (!html) {
    html = `<!doctype html><html><head><meta charset="utf-8" /><title>ChessScout.net</title></head><body><a href="${SITE}">ChessScout.net</a></body></html>`;
  }
  if (meta) html = setMeta(html, meta);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
}
