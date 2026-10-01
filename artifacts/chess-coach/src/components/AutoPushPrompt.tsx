import { useEffect, useRef } from 'react';
import { useUser } from '@/hooks/use-user';
import { usePushNotifications } from '@/hooks/use-push-notifications';

const PROMPTED_KEY = 'chessCoachPushPrompted';

// Fires the browser's native notification-permission prompt automatically
// on load, instead of waiting for someone to find the toggle in Profile.
// This is the closest a website can legitimately get to "notifications on
// by default" -- no browser (Chrome, Safari, Firefox, Edge) allows a site
// to grant itself permission without the user personally clicking Allow
// on that native dialog. This component can get everyone asked; it can't
// get everyone to say yes, and it shouldn't try to work around that.
//
// Only ever attempts this once per browser (tracked in localStorage, not
// per-session) -- re-triggering the prompt on every single page load for
// someone who dismissed it or hasn't decided would just be annoying.
// Someone who wants to reconsider can still use the manual toggle in
// Profile at any time; this only covers the first, automatic nudge.
export function AutoPushPrompt() {
  const { authUser } = useUser();
  const push = usePushNotifications();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (!authUser) return;
    if (!push.supported) return;
    if (push.permission !== 'default') return; // already decided (granted or denied) -- nothing to prompt
    if (push.isSubscribed) return;
    if (localStorage.getItem(PROMPTED_KEY)) return;

    attempted.current = true;
    localStorage.setItem(PROMPTED_KEY, '1');
    // A short delay so this doesn't fire in the same instant as the page
    // paint, which reads as more jarring than a prompt that shows up a
    // beat after the app is actually visible.
    const timer = setTimeout(() => {
      push.subscribe().catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [authUser, push.supported, push.permission, push.isSubscribed]);

  return null;
}
