// Instagram, Facebook and TikTok open links in their own built-in browser. Google
// refuses to sign anyone in there ("disallowed_useragent"), so "Continue with Google"
// dead-ends for everyone who taps a bio link. These helpers spot that browser and
// hand the page to the phone's real browser instead.

export type InAppBrowser = 'instagram' | 'facebook' | 'tiktok' | null;

export function inAppBrowser(): InAppBrowser {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  return null;
}

export const appName = (b: InAppBrowser) => (b === 'instagram' ? 'Instagram' : b === 'facebook' ? 'Facebook' : b === 'tiktok' ? 'TikTok' : '');

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** Android: a link that opens this page in Chrome (or the default browser if Chrome isn't there). */
export function openInBrowserUrl(path = window.location.pathname + window.location.search): string {
  const host = window.location.host;
  const fallback = encodeURIComponent(`https://${host}${path}`);
  return `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}
