/** Fired whenever you send a challenge (link, open link, to a friend, or a request). */
export const CHALLENGE_SENT = 'cs:challenge-sent';
export function announceChallengeSent(who?: string | null): void {
  try { window.dispatchEvent(new CustomEvent(CHALLENGE_SENT, { detail: { who: who ?? undefined } })); } catch { /* ignore */ }
}
