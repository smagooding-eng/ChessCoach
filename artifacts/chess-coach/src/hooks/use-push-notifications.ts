import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { isInPlayApp } from '@/lib/playApp';

// Converts the VAPID public key (base64url, no padding -- the format
// generated for this project and returned by /api/push/vapid-public-key)
// into the raw Uint8Array PushManager.subscribe's applicationServerKey
// option actually requires. This exact conversion is standard
// boilerplate for the Web Push API; the browser gives no built-in helper
// for it.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

// Set when the person turns notifications off in the app, so we never turn them back on by ourselves.
const OFF_KEY = 'cs_push_off';

let ensuredAt = 0;
/**
 * Keeps notifications working once someone has allowed them. Android/Chrome can
 * drop or rotate a device's push subscription (app updates, the push service
 * refreshing its token, storage cleanup), and the server removes ones the push
 * service says are gone -- either way notifications silently stop and the app
 * shows them as off. On every app start, if permission is still granted, this
 * makes sure the device has a subscription and the server has it too. No prompt
 * is shown (permission is already granted). At most every 6 hours.
 */
export async function ensurePushSubscription(): Promise<void> {
  if (Date.now() - ensuredAt < 6 * 60 * 60_000) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;
  try { if (localStorage.getItem(OFF_KEY) === '1') return; } catch { /* ignore */ }
  ensuredAt = Date.now();
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sw timeout')), 15_000)),
    ]);
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const keyRes = await apiFetch('/api/push/vapid-public-key');
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json() as { publicKey: string };
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }
    await apiFetch('/api/push/subscribe', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), userAgent: navigator.userAgent }),
    });
    window.dispatchEvent(new Event('cs:push-changed'));
  } catch {
    ensuredAt = 0; // try again next time
  }
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  // In the Google Play app, notifications belong to the app (Android's own switch for
  // ChessScout), not to a browser site setting.
  const inApp = typeof window !== 'undefined' && isInPlayApp();
  const blockedHelp = inApp
    ? 'Notifications are off for the ChessScout app. Open Android Settings › Apps › ChessScout › Notifications and turn them on. If they already show as allowed there, close ChessScout completely (App info › Force stop) and open it again: the app only re-checks on a fresh start. Still off after that? In Chrome: Settings › Site settings › All sites › chessscout.net › Clear & reset, then open ChessScout and sign in again.'
    : 'Notifications are blocked for chessscout.net. Allow them in your browser\'s site settings (the icon left of the address bar), then tap again.';

  useEffect(() => {
    if (!supported) {
      setPermission('unsupported');
      return;
    }
    const read = () => {
      setPermission(Notification.permission as PushPermissionState);
      navigator.serviceWorker.ready.then(async (registration) => {
        const existing = await registration.pushManager.getSubscription();
        setIsSubscribed(!!existing);
      }).catch(() => {});
    };
    read();
    window.addEventListener('cs:push-changed', read);
    return () => window.removeEventListener('cs:push-changed', read);
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) {
      setError('Push notifications are not supported in this browser.');
      return false;
    }
    setLoading(true);
    setError('');
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermissionState);
      if (perm !== 'granted') {
        setError(perm === 'denied' ? blockedHelp : 'Notification permission was not granted.');
        try { sessionStorage.setItem('cs_push_wanted', '1'); } catch { /* ignore */ }
        return false;
      }
      try { sessionStorage.removeItem('cs_push_wanted'); localStorage.removeItem(OFF_KEY); } catch { /* ignore */ }

      const keyRes = await apiFetch('/api/push/vapid-public-key');
      if (!keyRes.ok) {
        setError('Push notifications are not set up on the server yet.');
        return false;
      }
      const { publicKey } = await keyRes.json() as { publicKey: string };

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        });
      }

      const res = await apiFetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!res.ok) {
        setError('Failed to save your subscription on the server.');
        return false;
      }
      setIsSubscribed(true);
      return true;
    } catch {
      setError('Something went wrong while subscribing to notifications.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported, blockedHelp]);

  // Coming back from Android / browser settings: pick up the new permission, and finish
  // turning notifications on if that's what the person was trying to do.
  useEffect(() => {
    if (!supported) return;
    const onShow = () => {
      if (document.visibilityState !== 'visible') return;
      const p = Notification.permission as PushPermissionState;
      setPermission(p);
      let wanted = false;
      try { wanted = sessionStorage.getItem('cs_push_wanted') === '1'; } catch { /* ignore */ }
      if (p === 'granted') { setError(''); if (wanted) { try { sessionStorage.removeItem('cs_push_wanted'); } catch { /* ignore */ } void subscribe(); } }
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => { document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onShow); };
  }, [supported, subscribe]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiFetch('/api/push/unsubscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      try { localStorage.setItem(OFF_KEY, '1'); } catch { /* ignore */ }
    } catch {
      setError('Something went wrong while unsubscribing.');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { permission, isSubscribed, loading, error, supported, inApp, subscribe, unsubscribe };
}
