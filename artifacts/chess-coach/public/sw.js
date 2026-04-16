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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.includes('/api/')) return;
  // Never cache HTML, JS, CSS bundles — always fetch fresh from network.
  // Only the SW itself benefits from caching here, but we keep it minimal.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
