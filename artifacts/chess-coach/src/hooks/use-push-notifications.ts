import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

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

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!supported) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as PushPermissionState);
    navigator.serviceWorker.ready.then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      setIsSubscribed(!!existing);
    }).catch(() => {});
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
        setError('Notification permission was not granted.');
        return false;
      }

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
  }, [supported]);

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
    } catch {
      setError('Something went wrong while unsubscribing.');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { permission, isSubscribed, loading, error, supported, subscribe, unsubscribe };
}
