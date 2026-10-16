// The Pro subscriber sweepstakes. Keep in sync with the official rules page
// (chess-coach/src/pages/RaffleRules.tsx).
export const RAFFLE = {
  /** Last day to enter (11:59 PM Eastern) and the drawing date. */
  drawingDateIso: '2026-11-17',
  drawingDateLabel: 'November 17, 2026',
  prize: 'ChessNut Air electronic chessboard',
  minSubs: 500,
  referralCode: 'CHESSEDITZ',
  contactEmail: 'chessscout.net@gmail.com',
} as const;

/** Today's date in New York (the entry period ends 11:59 PM Eastern). */
function easternToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Whole days from today (Eastern) to the drawing date: 0 on the last day, negative once it's over. */
export function raffleDaysLeft(): number {
  const [y1, m1, d1] = easternToday().split('-').map(Number);
  const [y2, m2, d2] = RAFFLE.drawingDateIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * The countdown stage due now from a list of milestones (days left, any
 * order): the smallest milestone that is >= daysLeft, so a missed run still
 * sends that stage while it's current, but never an older one.
 */
export function dueStage(milestones: number[], daysLeft: number): number | null {
  if (daysLeft < 0) return null;
  const sorted = [...milestones].sort((a, b) => a - b);
  for (const m of sorted) if (daysLeft <= m) return m;
  return null;
}
