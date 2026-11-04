// Sign-in hand-off for the Android app. Signing in with Google or Lichess leaves the
// app for another site, and on Android the trip back can finish in a separate browser
// screen the app can't see, so the app still looked signed out. Now the app makes up a
// one-time code before it leaves; the server's sign-in callback leaves the result
// under that code (for 10 minutes); when the person comes back to the app, it asks
// for it and is signed in, wherever the sign-in actually finished.
const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const TTL = 10 * 60_000;
export interface Handoff { sid: string; newSignup: boolean; provider: "google" | "lichess"; at: number }
const store = new Map<string, Handoff>();

export const validHandoffCode = (c: unknown): c is string => typeof c === "string" && CODE_RE.test(c);

export function putHandoff(code: string | null | undefined, h: Omit<Handoff, "at">): void {
  if (!validHandoffCode(code)) return;
  for (const [k, v] of store) if (Date.now() - v.at > TTL) store.delete(k);
  store.set(code, { ...h, at: Date.now() });
}

/** Once only: the code is used up when it's read. */
export function takeHandoff(code: string): Handoff | null {
  const h = store.get(code);
  if (!h) return null;
  store.delete(code);
  return Date.now() - h.at > TTL ? null : h;
}
