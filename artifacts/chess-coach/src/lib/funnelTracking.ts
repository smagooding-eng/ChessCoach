import { apiFetch } from '@/lib/api';

function getVisitorId(): string {
  const key = 'chess_coach_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export type LandingFunnelEvent = 'landing_view' | 'mia_started' | 'mia_skipped' | 'signup_clicked' | 'signup_completed';

export function trackFunnelEvent(eventType: LandingFunnelEvent) {
  apiFetch('/api/landing-funnel/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: getVisitorId(), eventType }),
  }).catch(() => {});
}
