import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';

export interface BrowsePosition { fen: string; lastMove: { from: string; to: string } | null }

/** Positions after each move of a game played from `startFen` (index 0 = the start). */
export function positionsFromSan(sanMoves: string[], startFen?: string): BrowsePosition[] {
  const out: BrowsePosition[] = [];
  try {
    const c = startFen ? new Chess(startFen) : new Chess();
    out.push({ fen: c.fen(), lastMove: null });
    for (const san of sanMoves) {
      const m = c.move(san);
      if (!m) break;
      out.push({ fen: c.fen(), lastMove: { from: m.from, to: m.to } });
    }
  } catch { /* keep what we have */ }
  return out;
}

/**
 * Look back through a game in progress without leaving it. `positions[i]` is
 * the board after i moves (positions[0] = start). `view` is null while showing
 * the live position; stepping back sets it, and returning to the latest move
 * (or calling toLive) snaps back. New moves arriving don't pull you out.
 */
export function useMoveBrowser(positions: BrowsePosition[], resetKey?: string | number) {
  const [view, setView] = useState<number | null>(null);
  const last = Math.max(0, positions.length - 1);
  useEffect(() => { setView(null); }, [resetKey]);
  // Reaching the latest move by stepping forward = back to the live game.
  useEffect(() => { if (view !== null && view >= last) setView(null); }, [view, last]);

  const index = view ?? last;
  const viewing = view !== null && view < last;
  const back = useCallback(() => setView((v) => Math.max(0, (v ?? last) - 1)), [last]);
  const forward = useCallback(() => setView((v) => (v === null ? null : v + 1 >= last ? null : v + 1)), [last]);
  const first = useCallback(() => setView(0), []);
  const toLive = useCallback(() => setView(null), []);

  // Arrow keys on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
      else if (e.key === 'ArrowUp' || e.key === 'Home') { e.preventDefault(); first(); }
      else if (e.key === 'ArrowDown' || e.key === 'End') { e.preventDefault(); toLive(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, forward, first, toLive]);

  const pos = useMemo(() => positions[Math.min(index, last)] ?? null, [positions, index, last]);
  return {
    viewing,
    index,
    total: last,
    fen: pos?.fen ?? null,
    lastMove: pos?.lastMove ?? null,
    canBack: index > 0,
    canForward: viewing,
    back, forward, first, toLive,
  };
}
export type MoveBrowser = ReturnType<typeof useMoveBrowser>;
