import { apiFetch, apiUrl } from '@/lib/api';

function getVisitorId(): string {
  const key = 'chess_coach_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export type LandingSectionId = 'hero' | 'how_it_works' | 'differentiators' | 'features' | 'faq' | 'pricing' | 'final_cta';

export type LandingFunnelEvent =
  | 'landing_view' | 'mia_started' | 'mia_skipped' | 'signup_clicked' | 'signup_completed'
  | 'signup_form_submitted' | 'signup_error' | 'opponent_scout_clicked'
  | 'scroll_25' | 'scroll_50' | 'scroll_75' | 'scroll_100'
  | 'engaged_10s'
  | `viewed_${LandingSectionId}`
  | `exit_${LandingSectionId}`;

export function trackFunnelEvent(eventType: LandingFunnelEvent) {
  apiFetch('/api/landing-funnel/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: getVisitorId(), eventType }),
  }).catch(() => {});
}

// For events fired during page teardown (tab close, navigation away) --
// a regular fetch() can get cancelled mid-flight when the browser tears
// down the page before the request completes. sendBeacon is designed
// exactly for this: the browser guarantees the request is sent even as
// the page unloads, without blocking the unload itself.
export function trackFunnelEventBeacon(eventType: LandingFunnelEvent) {
  try {
    const blob = new Blob(
      [JSON.stringify({ visitorId: getVisitorId(), eventType })],
      { type: 'application/json' }
    );
    const sent = navigator.sendBeacon(apiUrl('/api/landing-funnel/track'), blob);
    if (!sent) trackFunnelEvent(eventType); // fall back if sendBeacon itself refuses (e.g. payload queue full)
  } catch {
    trackFunnelEvent(eventType);
  }
}
