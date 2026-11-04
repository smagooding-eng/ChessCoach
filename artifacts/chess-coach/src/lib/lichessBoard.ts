// Play on Lichess: real Lichess games on ChessScout's board, through Lichess's
// official Board API. Everything runs in the browser:
//   - Connecting: Lichess's own sign-in (OAuth with PKCE, scope board:play). The
//     token stays on this device (localStorage); ChessScout's server never sees it.
//   - Finding a game: a seek (rapid / classical) that Lichess pairs from its own
//     player pool, or a direct challenge.
//   - Playing: the game streams from Lichess move by move; moves, resign, draw
//     and abort go straight back to Lichess.
// The game is a normal Lichess game: rated on Lichess and in their Lichess history.
// Fair play: nothing here ever shows an engine evaluation during a game.

const LICHESS = 'https://lichess.org';
const CLIENT_ID = 'chessscout.net';
const TOKEN_KEY = 'cs_lichess_token';
const PKCE_KEY = 'cs_lichess_pkce';

export interface LichessAuth { token: string; username: string; expiresAt: number | null }

export function lichessAuth(): LichessAuth | null {
  try {
    const a = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') as LichessAuth | null;
    if (!a?.token) return null;
    if (a.expiresAt && a.expiresAt < Date.now()) { localStorage.removeItem(TOKEN_KEY); return null; }
    return a;
  } catch { return null; }
}
const saveAuth = (a: LichessAuth | null) => { try { if (a) localStorage.setItem(TOKEN_KEY, JSON.stringify(a)); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

const redirectUri = () => `${window.location.origin}/lichess-callback`;
const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Send the player to Lichess to allow ChessScout to play games for them. */
export async function connectLichess(returnTo = '/lichess'): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  try { sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo })); localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo })); } catch { /* ignore */ }
  const p = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirectUri(), scope: 'board:play', code_challenge_method: 'S256', code_challenge: challenge, state });
  window.location.href = `${LICHESS}/oauth?${p}`;
}

/** Finish connecting (on /lichess-callback). Returns where to go next. */
export async function finishLichessConnect(search: string): Promise<{ ok: true; returnTo: string; username: string } | { ok: false; error: string }> {
  const q = new URLSearchParams(search);
  if (q.get('error')) return { ok: false, error: q.get('error') === 'access_denied' ? 'You chose not to connect Lichess.' : 'Lichess said no. Please try again.' };
  let saved: { verifier: string; state: string; returnTo: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || localStorage.getItem(PKCE_KEY) || 'null'); } catch { /* ignore */ }
  try { sessionStorage.removeItem(PKCE_KEY); localStorage.removeItem(PKCE_KEY); } catch { /* ignore */ }
  const code = q.get('code');
  if (!saved || !code || q.get('state') !== saved.state) return { ok: false, error: 'That connection link expired. Please connect again.' };
  try {
    const r = await fetch(`${LICHESS}/api/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: saved.verifier, redirect_uri: redirectUri(), client_id: CLIENT_ID }),
    });
    const d = await r.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
    if (!r.ok || !d?.access_token) return { ok: false, error: "Couldn't finish connecting to Lichess. Please try again." };
    const acc = await fetch(`${LICHESS}/api/account`, { headers: { Authorization: `Bearer ${d.access_token}` } }).then((x) => (x.ok ? x.json() : null)).catch(() => null) as { username?: string; title?: string } | null;
    if (!acc?.username) return { ok: false, error: "Couldn't read your Lichess account. Please try again." };
    if (acc.title === 'BOT') return { ok: false, error: 'That is a Lichess BOT account. Connect your own account instead.' };
    saveAuth({ token: d.access_token, username: acc.username, expiresAt: d.expires_in ? Date.now() + d.expires_in * 1000 : null });
    return { ok: true, returnTo: saved.returnTo || '/lichess', username: acc.username };
  } catch {
    return { ok: false, error: "Couldn't reach Lichess. Check your connection and try again." };
  }
}

/** Disconnect: revoke the token on Lichess and forget it here. */
export async function disconnectLichess(): Promise<void> {
  const a = lichessAuth();
  saveAuth(null);
  if (a) await fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${a.token}` } }).catch(() => {});
}

function authed(init: RequestInit = {}): RequestInit {
  const a = lichessAuth();
  return { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...(a ? { Authorization: `Bearer ${a.token}` } : {}) } };
}
async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${LICHESS}${path}`, authed(init));
  if (r.status === 401) saveAuth(null);
  return r;
}

/** Reads a Lichess NDJSON stream, one object per line, until it ends or is aborted. */
export async function readStream<T>(path: string, onLine: (x: T) => void, signal: AbortSignal, init: RequestInit = {}): Promise<number> {
  const r = await fetch(`${LICHESS}${path}`, authed({ ...init, signal }));
  if (r.status === 401) saveAuth(null);
  if (!r.ok || !r.body) return r.status;
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (line) { try { onLine(JSON.parse(line) as T); } catch { /* keep-alive or partial */ } }
    }
  }
  return r.status;
}

// ── Events, seeks and games ───────────────────────────────────────────────
export type LichessEvent =
  | { type: 'gameStart' | 'gameFinish'; game: { gameId: string; fullId?: string; color: 'white' | 'black'; opponent?: { username?: string; rating?: number }; speed?: string } }
  | { type: 'challenge' | 'challengeCanceled' | 'challengeDeclined'; challenge: { id: string } };

/** Seek a game. Resolves when the seek ends (paired, cancelled or refused). Abort the signal to cancel. */
export function seek(o: { minutes: number; increment: number; rated: boolean }, signal: AbortSignal): Promise<number> {
  const body = new URLSearchParams({ rated: String(o.rated), time: String(o.minutes), increment: String(o.increment), variant: 'standard', color: 'random' });
  return readStream('/api/board/seek', () => {}, signal, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
}

export interface LichessPlayer { id?: string; name?: string; title?: string | null; rating?: number; provisional?: boolean; aiLevel?: number }
export interface LichessState { type: 'gameState'; moves: string; wtime: number; btime: number; winc: number; binc: number; status: string; winner?: 'white' | 'black'; wdraw?: boolean; bdraw?: boolean; wtakeback?: boolean; btakeback?: boolean }
export interface LichessGameFull { type: 'gameFull'; id: string; rated: boolean; speed: string; clock?: { initial: number; increment: number } | null; white: LichessPlayer; black: LichessPlayer; initialFen: string; state: LichessState }
export type LichessGameLine = LichessGameFull | LichessState | { type: 'chatLine'; username: string; text: string; room: string } | { type: 'opponentGone'; gone: boolean; claimWinInSeconds?: number };

export const streamGame = (id: string, onLine: (x: LichessGameLine) => void, signal: AbortSignal) => readStream<LichessGameLine>(`/api/board/game/stream/${id}`, onLine, signal);
export const streamEvents = (onLine: (x: LichessEvent) => void, signal: AbortSignal) => readStream<LichessEvent>('/api/stream/event', onLine, signal);

export async function playMove(id: string, uci: string, offerDraw = false): Promise<{ ok: boolean; error?: string }> {
  const r = await call(`/api/board/game/${id}/move/${uci}${offerDraw ? '?offeringDraw=true' : ''}`, { method: 'POST' });
  if (r.ok) return { ok: true };
  const d = await r.json().catch(() => null) as { error?: string } | null;
  return { ok: false, error: d?.error };
}
export const resign = (id: string) => call(`/api/board/game/${id}/resign`, { method: 'POST' });
export const abort = (id: string) => call(`/api/board/game/${id}/abort`, { method: 'POST' });
export const draw = (id: string, yes: boolean) => call(`/api/board/game/${id}/draw/${yes ? 'yes' : 'no'}`, { method: 'POST' });
export const claimVictory = (id: string) => call(`/api/board/game/${id}/claim-victory`, { method: 'POST' });

/** Games this account is in right now (to pick up one already going). */
export async function nowPlaying(): Promise<{ gameId: string; color: 'white' | 'black'; opponent?: { username?: string } }[]> {
  const r = await call('/api/account/playing');
  if (!r.ok) return [];
  const d = await r.json().catch(() => null) as { nowPlaying?: { gameId: string; color: 'white' | 'black'; opponent?: { username?: string } }[] } | null;
  return d?.nowPlaying ?? [];
}

/** The finished game's PGN, from Lichess. */
export async function exportPgn(id: string): Promise<string | null> {
  const r = await fetch(`${LICHESS}/game/export/${id}?clocks=true&evals=false&opening=true`, { headers: { Accept: 'application/x-chess-pgn' } }).catch(() => null);
  if (!r?.ok) return null;
  return r.text();
}

export const LICHESS_STATUS_TEXT: Record<string, string> = {
  mate: 'by checkmate', resign: 'by resignation', stalemate: 'by stalemate', timeout: 'opponent left', draw: 'by agreement',
  outoftime: 'on time', cheat: 'cheat detected', noStart: 'game never started', aborted: 'game aborted', variantEnd: 'variant end',
};
export const isOver = (status: string) => !['created', 'started'].includes(status);
