import { apiFetch, apiUrl } from '@/lib/api';
import { isRunningStandalone } from '@/hooks/use-pwa-install';
import { isInPlayApp } from '@/lib/playApp';
import { axonTrack } from '@/lib/axon';

function getVisitorId(): string {
  const key = 'chess_coach_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// 'app' = installed PWA (standalone display mode / iOS home-screen
// launch), 'web' = a regular browser tab. Computed once per page load --
// display-mode doesn't change mid-session, so no need to re-check per
// event.
// The Play app counts as 'app' too, including after the Google sign-in round
// trip (which can come back in a plain browser tab -- see appFlagFromSignin).
const platform = (): 'web' | 'app' => (isRunningStandalone() || isInPlayApp() ? 'app' : 'web');
/** For the Google sign-in link: tells the server to hand back "this was the app". */
export const appSigninParam = (): string => (platform() === 'app' ? 'app=1' : '');

// pillars + explore are the current landing page; the rest are from the older
// long landing page, kept so past data still reads.
export type LandingSectionId = 'hero' | 'pillars' | 'explore' | 'how_it_works' | 'differentiators' | 'features' | 'faq' | 'pricing' | 'final_cta';

export type LandingFunnelEvent =
  | 'landing_view' | 'mia_started' | 'mia_skipped' | 'onboarding_finished' | 'signup_clicked' | 'signup_completed'
  | 'signup_form_submitted' | 'signup_error' | 'opponent_scout_clicked'
  | 'google_oauth_clicked' | 'google_signup_completed' | 'google_signup_error' | 'google_login_completed'
  | 'guest_game_started' | 'guest_game_finished'
  | 'lichess_oauth_clicked' | 'lichess_signup_completed' | 'lichess_login_completed'
  | 'left_for_signin' | 'google_signin_cancelled' | 'google_signin_abandoned' | 'lichess_signin_abandoned'
  | 'ig_games_shown' | 'inapp_open_browser'
  | 'scroll_25' | 'scroll_50' | 'scroll_75' | 'scroll_100'
  | 'engaged_10s'
  | `popup_${'shown' | 'closed'}_${'pro_offer' | 'board_setup' | 'review_alerts'}`
  | 'pro_checkout_stripe' | 'pro_checkout_card' | 'pro_checkout_google_pay' | 'pro_checkout_apple_pay'
  | 'pro_checkout_link' | 'pro_checkout_amazon_pay' | 'pro_checkout_paypal' | 'pro_checkout_other'
  | `viewed_${LandingSectionId}`
  | `exit_${LandingSectionId}`;

// The trip out to Google / Lichess to sign in. Noted when it starts so that (1) leaving
// the page for it isn't counted as someone leaving the site, and (2) coming back without
// a sign-in is counted as "came back without finishing" rather than lost.
const SIGNIN_OUT = 'cs_signin_out';
export function noteLeavingToSignIn(provider: 'google' | 'lichess'): void {
  try { localStorage.setItem(SIGNIN_OUT, JSON.stringify({ provider, at: Date.now() })); } catch { /* storage off */ }
}
function signInTrip(): { provider: 'google' | 'lichess'; at: number } | null {
  try { const v = JSON.parse(localStorage.getItem(SIGNIN_OUT) || 'null'); return v && typeof v.at === 'number' ? v : null; } catch { return null; }
}
/** Leaving this page right now is the trip out to sign in (started in the last minute). */
export function leavingToSignIn(): boolean {
  const t = signInTrip();
  return !!t && Date.now() - t.at < 60_000;
}
/** Back on the site after the trip: signed in → done; not signed in (and it's been more
 *  than a few seconds, so this isn't the page that started it) → "came back without". */
export function settleSignInTrip(signedIn: boolean): void {
  const t = signInTrip();
  if (!t) return;
  const age = Date.now() - t.at;
  if (signedIn || age > 60 * 60_000) { try { localStorage.removeItem(SIGNIN_OUT); } catch { /* ignore */ } return; }
  if (age < 4000) return;
  try { localStorage.removeItem(SIGNIN_OUT); } catch { /* ignore */ }
  trackFunnelEvent(t.provider === 'lichess' ? 'lichess_signin_abandoned' : 'google_signin_abandoned');
}

export function trackFunnelEvent(eventType: LandingFunnelEvent, elapsedMs?: number) {
  if (eventType === 'signup_completed' || eventType === 'google_signup_completed' || eventType === 'lichess_signup_completed') axonTrack('sign_up');
  apiFetch('/api/landing-funnel/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: getVisitorId(), eventType, platform: platform(), elapsedMs, automated: typeof navigator !== "undefined" && navigator.webdriver === true }),
  }).catch(() => {});
}

// For events fired during page teardown (tab close, navigation away) --
// a regular fetch() can get cancelled mid-flight when the browser tears
// down the page before the request completes. sendBeacon is designed
// exactly for this: the browser guarantees the request is sent even as
// the page unloads, without blocking the unload itself.
export function trackFunnelEventBeacon(eventType: LandingFunnelEvent, elapsedMs?: number) {
  try {
    const blob = new Blob(
      [JSON.stringify({ visitorId: getVisitorId(), eventType, platform: platform(), elapsedMs, automated: typeof navigator !== "undefined" && navigator.webdriver === true })],
      { type: 'application/json' }
    );
    const sent = navigator.sendBeacon(apiUrl('/api/landing-funnel/track'), blob);
    if (!sent) trackFunnelEvent(eventType, elapsedMs); // fall back if sendBeacon itself refuses (e.g. payload queue full)
  } catch {
    trackFunnelEvent(eventType, elapsedMs);
  }
}
