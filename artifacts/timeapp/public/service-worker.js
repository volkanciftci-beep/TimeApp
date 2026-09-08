const CACHE_NAME = 'zeitapp-pwa-v3';
const APP_SHELL = [
  './',
  './manifest.json',
  './icons/timeapp-icon-192.png',
  './icons/timeapp-icon-512.png',
  './icons/timeapp-icon-180.png',
  './icons/timeapp-splash.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(async (keys) => {
        const oldZeitAppCaches = keys.filter(
          (key) => key.startsWith('zeitapp-pwa-') && key !== CACHE_NAME,
        );
        await Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        );
        await self.clients.claim();
        if (oldZeitAppCaches.length > 0) {
          const clients = await self.clients.matchAll({ type: 'window' });
          await Promise.all(
            clients.map((client) => client.navigate(client.url)),
          );
        }
      }),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
            cache.put('./', response.clone());
          });
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match('./')),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});