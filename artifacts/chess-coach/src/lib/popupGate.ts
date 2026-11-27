// Popups are kept rare: none in a member's first 3 days (they're still finding their way
// around), and after that at most one per visit, so they never stack. Each one shown and
// closed is counted (the traffic export's landing funnel), to see what they do.
import { trackFunnelEvent } from '@/lib/funnelTracking';

export type PopupName = 'pro_offer' | 'board_setup' | 'review_alerts';
const NEW_DAYS = 3;
const VISIT_KEY = 'cs_popup_this_visit';

/** Joined less than 3 days ago (by the server's join date; this device's first sight as a fallback). */
export function isNewMember(user: { id?: string; joinedAt?: string | null } | null | undefined): boolean {
  if (!user) return false;
  let joined = user.joinedAt ? Date.parse(user.joinedAt) : NaN;
  if (isNaN(joined) && user.id) {
    try {
      const k = `cs_first_seen_${user.id}`;
      joined = Number(localStorage.getItem(k)) || Date.now();
      localStorage.setItem(k, String(joined));
    } catch { return false; }
  }
  return !isNaN(joined) && Date.now() - joined < NEW_DAYS * 86400_000;
}

/** May this popup open now? Claims the visit's one popup when it says yes. */
export function claimPopup(name: PopupName, user: { id?: string; joinedAt?: string | null } | null | undefined, opts: { allowNew?: boolean } = {}): boolean {
  if (isNewMember(user) && !opts.allowNew) return false;
  try {
    const taken = sessionStorage.getItem(VISIT_KEY);
    if (taken && taken !== name) return false;
    sessionStorage.setItem(VISIT_KEY, name);
  } catch { /* storage off: allow */ }
  trackFunnelEvent(`popup_shown_${name}`);
  return true;
}

export function popupClosed(name: PopupName) { trackFunnelEvent(`popup_closed_${name}`); }
