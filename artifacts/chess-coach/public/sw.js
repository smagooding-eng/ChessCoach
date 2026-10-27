const CACHE_NAME = 'chessscout-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

// Fires when a push service delivers a message from the server (see
// api-server/src/lib/pushNotifications.ts, which sends a JSON payload
// shaped like { title, body, url?, icon? }). This only runs while the
// service worker is active, which is the whole point of push -- it can
// wake the worker even when no tab is open.
self.addEventListener('push', (event) => {
  let data = { title: 'ChessScout.net', body: 'You have a new notification.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Not JSON (shouldn't happen given how the server sends it) -- fall
    // back to the plain-text body rather than dropping the notification.
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil((async () => {
    const url = data.url || '/';
    // Don't notify about a page the player is already looking at (e.g. the
    // daily game whose opponent just moved) -- the open app updates itself.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const lookingAtIt = windows.some((c) => {
      try {
        return c.visibilityState === 'visible' && new URL(c.url).pathname === url;
      } catch { return false; }
    });
    if (lookingAtIt) return;
    await self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png?v=4',
      badge: '/icons/icon-192.png',
      // Same tag = replaces the previous notification for that game, so only
      // the latest one stays on the device; renotify still buzzes for it.
      tag: data.tag || undefined,
      renotify: !!data.tag,
      // Challenges: Accept / Decline buttons, stays until answered, buzzes.
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : undefined,
      requireInteraction: !!data.requireInteraction,
      vibrate: Array.isArray(data.vibrate) ? data.vibrate : undefined,
      data: { url, links: data.links || {} },
    });
  })());
});

// The push service replaced this device's subscription (token refresh, etc.):
// subscribe again with the same key and tell the server which one it replaces,
// so notifications keep arriving without the person turning them on again.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const old = event.oldSubscription;
      const key = old && old.options && old.options.applicationServerKey;
      const fresh = event.newSubscription || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
      if (!fresh || !old) return;
      await fetch('/push-rotate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: fresh.toJSON() }),
      });
    } catch (e) { /* the app re-checks its subscription next time it opens */ }
  })());
});

// Clicking the notification focuses an existing ChessScout tab if one is
// open (rather than always opening a new one), falling back to opening
// data.url in a new tab.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const links = event.notification.data?.links || {};
  // Decline straight from the notification, without opening the app.
  if (event.action === 'decline' && links.decline) {
    event.waitUntil(fetch(links.decline, { method: 'POST', mode: 'no-cors' }).catch(() => {}));
    return;
  }
  const targetUrl = (event.action === 'accept' && links.accept) || event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
