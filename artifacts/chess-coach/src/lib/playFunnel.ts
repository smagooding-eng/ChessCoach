// The live-play path, for the admin Lichess report: searched → nobody here → what happened
// next (a Lichess game, the connect card, the bot offer...). Members only; once per search.
import { apiFetch } from '@/lib/api';

export type PlayEvent = 'queued' | 'nobody_here' | 'lichess_search' | 'lichess_game' | 'connect_shown' | 'connect_clicked' | 'bot_offer_shown' | 'bot_chosen' | 'cancelled' | 'matched_here';

let sent = new Set<PlayEvent>();
/** A new search: each event can be sent once again. */
export function newPlaySearch(): void { sent = new Set(); }
export function trackPlay(event: PlayEvent): void {
  if (sent.has(event)) return;
  sent.add(event);
  void apiFetch('/api/play-funnel/track', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) }).catch(() => {});
}
