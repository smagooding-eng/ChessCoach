import { useEffect, useRef } from 'react';
import { vibrateFor } from '@/context/SettingsContext';
import { detectSingleMove, eventForMove } from '@/lib/sounds';

/**
 * Haptics for boards that don't use <ChessBoard> (lesson players): buzz when
 * the shown position advances by exactly one legal move. Jumps, resets and
 * stepping backwards stay silent, like the main board. Respects Settings >
 * Haptics.
 */
export function useMoveHaptics(fen: string | null | undefined): void {
  const prev = useRef(fen);
  useEffect(() => {
    const before = prev.current;
    prev.current = fen;
    if (!before || !fen || before === fen) return;
    const hit = detectSingleMove(before, fen);
    if (hit) vibrateFor(eventForMove(hit.move, hit.after));
  }, [fen]);
}
