// "Something worth having just happened": the end of a game review, a game played on
// ChessScout (live or against a practice bot). The Pro trial offer waits for one of these
// instead of appearing on its own (see TrialPromo).
export type ValueMoment = 'review' | 'live_game' | 'bot_game';
export const VALUE_EVENT = 'cs:value-moment';
export function markValueMoment(kind: ValueMoment): void {
  try { window.dispatchEvent(new CustomEvent(VALUE_EVENT, { detail: kind })); } catch { /* ignore */ }
}
