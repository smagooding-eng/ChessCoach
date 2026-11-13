import { useEffect } from 'react';

// Game pages tell the app whether a game is actually being played, so a new release
// can load between games (on the result screen, the lobby, while searching) and never
// in the middle of one. Pages that say nothing are treated as busy.
let state: 'busy' | 'idle' | null = null;
export const gameState = () => state;
export function useGameBusy(busy: boolean) {
  useEffect(() => { state = busy ? 'busy' : 'idle'; }, [busy]);
}
