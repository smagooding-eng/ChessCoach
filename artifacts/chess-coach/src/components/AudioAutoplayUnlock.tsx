import { useEffect } from "react";

// Most browsers block any audio.play() call that isn't directly tied to
// a user gesture (a click/tap) -- this is a platform security policy,
// not something fixable by restructuring React effects or adding
// setTimeout delays, since a React effect (even one that runs
// synchronously-ish after a click) is never itself considered a user
// gesture by the browser's autoplay policy.
//
// The standard, practical workaround: play a silent clip on the FIRST
// real gesture anywhere in the app -- this one call IS tied to an actual
// click/tap, so the browser allows it, and doing so unlocks audio
// playback for the rest of that page/tab session. Every subsequent
// programmatic audio.play() call, including ones triggered from React
// effects with no direct gesture of their own (like auto-reading a
// lesson's first step on mount), is then allowed too.
//
// Mounted once, at the top of the whole app (see App.tsx) -- not inside
// CourseDetail specifically -- because by the time someone reaches a
// lesson page, the click that navigated them there has already
// happened and its gesture window has already closed. Registering this
// at the app root means it's armed from the very first interaction
// anywhere (logging in, opening a course from a list, tapping a nav
// icon), well before anyone reaches a lesson that tries to auto-read.
const SILENT_AUDIO_DATA_URI =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function AudioAutoplayUnlock() {
  useEffect(() => {
    function unlock() {
      try {
        const audio = new Audio(SILENT_AUDIO_DATA_URI);
        audio.play().catch(() => {
          // If even this fails, there's nothing more to do here --
          // readAloud's own existing error handling covers the rest.
        });
      } catch {
        // Best-effort only; never let this break the app.
      }
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
    }

    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });

    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, []);

  return null;
}
