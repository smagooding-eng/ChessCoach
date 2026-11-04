// PC or mobile, for analytics: from the browser's user agent, plus a hint from the
// page (iPads report themselves as a Mac, so the page says how many touch points
// the screen has).
export type DeviceKind = "desktop" | "mobile" | "tablet";
export type AppMode = "android_app" | "installed" | "browser";

export function deviceKind(ua: string, touchPoints?: unknown): DeviceKind {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini|BlackBerry/i.test(ua)) return "mobile";
  if (/Macintosh/i.test(ua) && Number(touchPoints) > 1) return "tablet";
  return "desktop";
}

export const appMode = (v: unknown): AppMode => (v === "android_app" || v === "installed" ? v : "browser");
