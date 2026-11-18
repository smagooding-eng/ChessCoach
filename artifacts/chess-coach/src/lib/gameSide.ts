import { useMemo } from 'react';
import { useUser } from '@/context/UserContext';

/** Who you are, from your signed-in account: your ChessScout, Chess.com and Lichess
 *  names. Never the name last typed into a lookup box: that can be anyone. */
export function useMyNames(): string[] {
  const { authUser } = useUser();
  const a = authUser as { scoutUsername?: string | null; chesscomUsername?: string | null; lichessUsername?: string | null } | null;
  return useMemo(
    () => [a?.scoutUsername, a?.chesscomUsername, a?.lichessUsername].filter((n): n is string => !!n).map((n) => n.toLowerCase()),
    [a?.scoutUsername, a?.chesscomUsername, a?.lichessUsername],
  );
}

type SideGame = { yourSide?: 'white' | 'black' | null; username?: string | null; whiteUsername?: string | null; blackUsername?: string | null };

/** Which side you played. In order: what the server says (it knows your account),
 *  your own account names, then the account the game was saved under. */
export function mySide(game: SideGame, mine: string[] = []): 'white' | 'black' | null {
  if (game.yourSide === 'white' || game.yourSide === 'black') return game.yourSide;
  const w = (game.whiteUsername ?? '').toLowerCase();
  const b = (game.blackUsername ?? '').toLowerCase();
  for (const n of mine) { if (n === w) return 'white'; if (n === b) return 'black'; }
  const saved = (game.username ?? '').toLowerCase();
  if (saved) { if (saved === w) return 'white'; if (saved === b) return 'black'; }
  return null;
}

/** Did you play White in this game? (White when it can't be told.) */
export function playedWhite(game: SideGame, mine: string[] = []): boolean {
  return mySide(game, mine) !== 'black';
}
