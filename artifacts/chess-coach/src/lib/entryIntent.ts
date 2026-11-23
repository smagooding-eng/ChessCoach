// What a visitor came for, from the page they first landed on (a puzzle or traps page),
// so that after signing up they go straight there instead of the account-linking
// welcome. And the app pages a member can use before linking Chess.com / Lichess
// (everything that doesn't need their own games).
const KEY = 'cs_entry_intent';

/** Signed-out landing on a puzzle / traps page (any language): remember it. */
export function recordEntryIntent(path: string): void {
  const m = path.match(/^(?:\/[a-z]{2})?\/(chess-puzzles|chess-traps)(?:\/|$)/);
  if (!m) return;
  try { localStorage.setItem(KEY, JSON.stringify({ to: m[1] === 'chess-traps' ? '/traps' : '/puzzles', at: Date.now() })); } catch { /* storage off */ }
}

/** Where to send a brand-new member instead of the welcome screen (once, within a day). */
export function takeEntryIntent(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as { to?: string; at?: number } | null;
    localStorage.removeItem(KEY);
    if (v?.to && v.at && Date.now() - v.at < 24 * 3600_000) return v.to;
  } catch { /* ignore */ }
  return null;
}

/** App pages that work without a linked chess account (no welcome bounce). */
const OPEN = /^\/(puzzles|trail|analysis-board|tactics|traps|endgames|openings|learning|beginner|courses|practice|play-now|subscription|pricing|settings|kids)(\/|$|\?)/;
export const openBeforeLinking = (path: string) => OPEN.test(path);
