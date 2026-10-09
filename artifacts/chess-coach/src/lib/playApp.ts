// Is this session running inside the ChessScout Android app from Google Play?
//
// The Play app is a Trusted Web Activity: Android opens the site with
// document.referrer = "android-app://net.chessscout.app". That's only set on
// the very first page load, so we remember it for the rest of the session
// (sessionStorage -- the app's session is separate from the person's normal
// Chrome tabs, so this never leaks into the browser).

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=net.chessscout.app';
const PACKAGE = 'net.chessscout.app';
const KEY = 'cs_play_app';

export function rememberPlayAppLaunch(): void {
  try {
    if (document.referrer.startsWith(`android-app://${PACKAGE}`)) sessionStorage.setItem(KEY, '1');
  } catch { /* storage blocked */ }
}

export function isInPlayApp(): boolean {
  try {
    if (sessionStorage.getItem(KEY) === '1') return true;
  } catch { /* ignore */ }
  try {
    return document.referrer.startsWith(`android-app://${PACKAGE}`);
  } catch { return false; }
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Show the Google Play badge / link: everyone except people already in the
 *  Play app, and iPhone/iPad users (the app is Android-only for now). */
export function shouldShowPlayBadge(): boolean {
  if (typeof window === 'undefined') return false;
  return !isInPlayApp() && !isIOS();
}
