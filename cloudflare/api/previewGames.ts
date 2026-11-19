// /api/preview-games?platform=chesscom|lichess&username=NAME
// The Instagram page's "Show my games": a visitor's 10 latest games, answered right here at
// the edge, straight from Chess.com / Lichess. It doesn't go through the API server, whose
// own calls to Chess.com and Lichess are busy with background imports (and were timing out).
// Same shape as the server's /api/free-review/preview.

type Recent = { ref: string; white: string; black: string; whiteRating: number; blackRating: number; result: string; opening: string | null; playedAt: string; timeControl: string };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store' },
});
const get = (url: string, accept = 'application/json') => fetch(url, {
  headers: { Accept: accept, 'User-Agent': 'ChessScout.net (contact: chessscout.net)' }, signal: AbortSignal.timeout(9000),
});

function openingFromPgn(pgn: string): string | null {
  const o = pgn.match(/\[Opening "([^"]+)"\]/);
  if (o) return o[1];
  const u = pgn.match(/\[ECOUrl "https:\/\/www\.chess\.com\/openings\/([^"]+)"\]/);
  if (!u) return null;
  return u[1].split(/-\d/)[0].replace(/-/g, ' ').replace(/\.\.\./g, '').trim() || null;
}

async function chesscom(username: string): Promise<Recent[] | null> {
  const a = await get(`https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`);
  if (!a.ok) return null;
  const archives = ((await a.json()) as { archives?: string[] }).archives ?? [];
  const me = username.toLowerCase();
  const out: Recent[] = [];
  for (const url of archives.slice(-3).reverse()) {
    const r = await get(url);
    if (!r.ok) continue;
    type G = { url?: string; pgn?: string; end_time: number; time_control?: string; white: { username: string; rating: number; result: string }; black: { username: string; rating: number; result: string } };
    const games = (((await r.json()) as { games?: G[] }).games ?? []).filter((g) => g.pgn).sort((x, y) => y.end_time - x.end_time);
    for (const g of games) {
      const white = g.white.username.toLowerCase() === me;
      const mine = white ? g.white.result : g.black.result;
      const draws = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];
      const tc = g.time_control ?? '';
      const [base, inc] = tc.split('+').map(Number);
      out.push({
        ref: g.url?.split('/').pop() ?? String(g.end_time), white: g.white.username, black: g.black.username,
        whiteRating: g.white.rating, blackRating: g.black.rating,
        result: mine === 'win' ? 'win' : draws.includes(mine) ? 'draw' : 'loss',
        opening: openingFromPgn(g.pgn ?? ''), playedAt: new Date(g.end_time * 1000).toISOString(),
        timeControl: tc.includes('/') ? 'daily' : Number.isFinite(base) ? (inc ? `${Math.round(base / 60)}+${inc}` : `${Math.round(base / 60)}`) : tc,
      });
      if (out.length >= 10) return out;
    }
  }
  return out;
}

async function lichess(username: string): Promise<Recent[] | null> {
  const r = await get(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=10&opening=true&moves=false`, 'application/x-ndjson');
  if (!r.ok) return null;
  const me = username.toLowerCase();
  type P = { user?: { name?: string }; rating?: number };
  type G = { id: string; createdAt: number; lastMoveAt?: number; winner?: 'white' | 'black'; speed?: string; clock?: { initial: number; increment: number }; opening?: { name?: string }; players: { white: P; black: P } };
  return (await r.text()).trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) as G; } catch { return null; } })
    .filter((g): g is G => !!g).slice(0, 10).map((g) => {
      const w = g.players.white.user?.name ?? 'Anonymous', b = g.players.black.user?.name ?? 'Anonymous';
      const white = w.toLowerCase() === me;
      return {
        ref: g.id, white: w, black: b, whiteRating: g.players.white.rating ?? 0, blackRating: g.players.black.rating ?? 0,
        result: !g.winner ? 'draw' : (g.winner === 'white') === white ? 'win' : 'loss',
        opening: g.opening?.name ?? null, playedAt: new Date(g.lastMoveAt ?? g.createdAt).toISOString(),
        timeControl: g.clock ? (g.clock.increment ? `${Math.round(g.clock.initial / 60)}+${g.clock.increment}` : `${Math.round(g.clock.initial / 60)}`) : g.speed ?? 'unknown',
      };
    });
}

export async function previewGames(url: URL): Promise<Response> {
  const platform = url.searchParams.get('platform') === 'lichess' ? 'lichess' : 'chesscom';
  const username = (url.searchParams.get('username') ?? '').trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(username)) return json({ error: 'Enter your username.' }, 400);
  const notFound = platform === 'lichess' ? "We couldn't find that Lichess username." : "We couldn't find that Chess.com username.";
  try {
    const games = platform === 'lichess' ? await lichess(username) : await chesscom(username);
    return games ? json({ games }) : json({ error: notFound }, 404);
  } catch {
    return json({ error: `${platform === 'lichess' ? 'Lichess' : 'Chess.com'} took too long to answer. Try again in a moment.` }, 504);
  }
}
