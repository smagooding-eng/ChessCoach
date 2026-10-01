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

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

// Clicking the notification focuses an existing ChessScout tab if one is
// open (rather than always opening a new one), falling back to opening
// data.url in a new tab.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

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
