// The natural moment for the board & play set-up: a game menu is on screen (picking a time
// control, a bot, local play) and no game is running. Game pages call this; the set-up
// prompt listens and slides up shortly after, once per member.
import { useEffect } from 'react';

export const SETUP_MOMENT = 'cs:setup-moment';

export function useBoardSetupMoment(active: boolean): void {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(SETUP_MOMENT, { detail: active }));
    return () => { if (active) window.dispatchEvent(new CustomEvent(SETUP_MOMENT, { detail: false })); };
  }, [active]);
}
