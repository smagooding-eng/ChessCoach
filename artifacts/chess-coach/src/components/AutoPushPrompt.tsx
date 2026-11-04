import { useEffect } from 'react';
import { useUser } from '@/hooks/use-user';
import { usePushNotifications, ensurePushSubscription } from '@/hooks/use-push-notifications';


// Keeps notifications working for people who've allowed them: on every app start (and
// on coming back to the app), the device's push subscription is checked and re-saved.
// It no longer opens the "Allow notifications?" box by itself (see below).
export function AutoPushPrompt() {
  const { authUser } = useUser();
  const push = usePushNotifications();

  // Already allowed: make sure this device is still subscribed (and the server knows it).
  useEffect(() => {
    if (!authUser || push.permission !== 'granted') return;
    void ensurePushSubscription();
    // The Play app can stay open in the background for days: check again on return.
    const onShow = () => { if (document.visibilityState === 'visible') void ensurePushSubscription(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [authUser, push.permission]);

  // The automatic "Allow notifications?" box on load is gone: browsers hide or ignore a
  // prompt nobody tapped for, and a quick "Block" can't be asked again. People are asked
  // with a Turn on button where notifications matter instead (NotifyPrompt).

  return null;
}
