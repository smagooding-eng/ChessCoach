import { Chess } from 'chess.js';
import { apiFetch } from '@/lib/api';
import type { StudioLine } from '@/components/studio/StudioPlayer';

// Content Studio "Analyzer games": the server's Stockfish plays a whole game
// (each side its best or its worst move) and every move comes back with the
// scores of all the moves in that position, so each one can be graded.

type EngineMove = { uci: string; san: string; from: string; to: string; cp: number | null; mate: number | null };
type Analysis = { fen: string; turn: 'w' | 'b'; depth: number; moves: EngineMove[] };
export type EngineSide = 'best' | 'worst';

const value = (m: EngineMove) => (m.mate != null ? (m.mate > 0 ? 100000 - m.mate : -100000 - m.mate) : (m.cp ?? -99999));
const capped = (m: EngineMove) => (m.mate != null ? (m.mate > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, m.cp ?? 0)));
const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

function gradeFor(swing: number, isBest: boolean, bestWasMate: boolean, san: string): string {
  if (san.includes('#')) return 'checkmate';
  if (isBest) return 'best';
  if (bestWasMate && swing < -2) return 'missed_win';
  if (swing >= -0.2) return 'excellent';
  if (swing >= -0.5) return 'good';
  if (swing >= -1) return 'inaccuracy';
  if (swing >= -2) return 'mistake';
  return 'blunder';
}

export const SIDE_NAME: Record<EngineSide, string> = { best: 'Stockfish (best moves)', worst: 'Worst moves' };

export function titleFor(w: EngineSide, b: EngineSide): string {
  if (w === 'best' && b === 'worst') return 'Perfect play vs the worst possible moves 😂';
  if (w === 'worst' && b === 'best') return 'The worst moves vs perfect play 😂';
  if (w === 'worst' && b === 'worst') return 'The worst chess game ever played 💀';
  return 'Stockfish vs Stockfish 🤖';
}

/** Has Stockfish play the game, then grades every move. */
export async function generateAnalyzerGame(startFen: string, white: EngineSide, black: EngineSide, maxMoves: number): Promise<StudioLine> {
  const r = await apiFetch('/api/explore/auto-game', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen: startFen, white, black, maxPlies: maxMoves * 2 }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The engine couldn't play this game right now.");
  const sans = (d.sans ?? []) as string[];
  const analyses = (d.analyses ?? []) as Analysis[];
  if (!sans.length) throw new Error('No moves were played from this position.');
  const c = new Chess(startFen);
  const moves: StudioLine['moves'] = [];
  sans.forEach((san, i) => {
    const a = analyses[i];
    const m = c.move(san);
    const played = m?.san ?? san;
    const scored = a ? a.moves.filter((x) => x.cp != null || x.mate != null) : [];
    const top = scored.length ? scored.reduce((x, y) => (value(y) > value(x) ? y : x)) : null;
    const mine = a?.moves.find((x) => x.san === played);
    if (!a || !top || !mine || (mine.cp == null && mine.mate == null)) { moves.push({ san: played, classification: 'good', evalAfterCp: null, betterMove: null }); return; }
    const sideW = a.turn === 'w';
    const swing = (capped(mine) - capped(top)) / 100;
    const isBest = value(mine) >= value(top);
    const evalAfterCp = mine.mate != null ? (sideW ? 1 : -1) * (mine.mate > 0 ? 10000 - mine.mate : -10000 - mine.mate) : (sideW ? 1 : -1) * (mine.cp ?? 0);
    moves.push({
      san: played, classification: gradeFor(swing, isBest, top.mate != null && top.mate > 0, played), evalAfterCp,
      betterMove: isBest ? null : top.san, loss: Math.max(0, winPct(capped(top)) - winPct(capped(mine))),
    });
  });
  return { startFen, title: titleFor(white, black), white: SIDE_NAME[white], black: SIDE_NAME[black], moves };
}
