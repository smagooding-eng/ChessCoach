// The Lichess game last finished on ChessScout's board (also inside the streaming studio's
// board panel, which is the same site), so "review my last game" opens that exact game.
import { apiFetch } from '@/lib/api';
import { exportPgn } from '@/lib/lichessBoard';

const KEY = 'cs_last_lichess_game';
export type LastLichessGame = { id: string; side?: 'white' | 'black'; at: number; savedId?: number };

export function rememberLichessGame(v: LastLichessGame): void {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage off */ }
}

/** The last game finished here, if it ended within maxAgeMs. */
export function lastLichessGame(maxAgeMs = 6 * 3600_000): LastLichessGame | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LastLichessGame | null;
    return v && typeof v.id === 'string' && Date.now() - v.at < maxAgeMs ? v : null;
  } catch { return null; }
}

/** Put a finished Lichess game into their games and return its id. Waits for Lichess to hand
 *  out the finished game (right after the end it can still say Result "*"). */
export async function saveLichessGame(id: string, side?: 'white' | 'black', viaChessScout = false): Promise<number> {
  let pgn: string | null = null;
  for (let k = 0; k < 8; k++) {
    const p = await exportPgn(id);
    if (p && !/\[Result\s+"\*"\]/.test(p)) { pgn = p; break; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!pgn) throw new Error('Lichess hasn’t finished that game yet. Try again in a moment.');
  const r = await apiFetch('/api/games/import-pgn', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pgn, viaChessScout, side }) });
  const d = await r.json().catch(() => ({})) as { ids?: number[]; notYours?: number; error?: string };
  if (!r.ok) throw new Error(d.error || 'Couldn’t add the game to your account.');
  const saved = d.ids?.[0];
  if (typeof saved !== 'number') throw new Error(d.notYours ? 'That game isn’t yours (link this Lichess username to your account first).' : 'Couldn’t add the game to your account.');
  return saved;
}

// Any game finished on ChessScout's own board (other players, and bots, whose games are
// kept out of "All games"), so "review my last game" can open it.
const PLAYED = 'cs_last_played_game';
export type LastPlayedGame = { savedId: number; at: number };
export function rememberPlayedGame(savedId: number): void {
  try {
    const cur = lastPlayedGame();
    if (cur?.savedId === savedId) return;
    localStorage.setItem(PLAYED, JSON.stringify({ savedId, at: Date.now() }));
  } catch { /* storage off */ }
}
export function lastPlayedGame(maxAgeMs = 6 * 3600_000): LastPlayedGame | null {
  try {
    const v = JSON.parse(localStorage.getItem(PLAYED) ?? 'null') as LastPlayedGame | null;
    return v && typeof v.savedId === 'number' && Date.now() - v.at < maxAgeMs ? v : null;
  } catch { return null; }
}
