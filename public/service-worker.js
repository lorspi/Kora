const CACHE_NAME = 'kora-cache-0.1.24-beta';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/desktop-icon.png',
  '/mobile-icon.png',
  '/icon.svg',
  '/logo-light.svg',
  '/logo-dark.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Never cache version.txt — always go to network for update checks
  if (event.request.url.includes('version.txt')) return;

  // For navigation requests: network-first, fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For hashed assets (Vite chunks): network-first to avoid serving stale chunks
  // The hash in the filename already provides cache-busting at the HTTP level
  if (event.request.url.includes('/assets/')) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try { cache.put(event.request, clone); } catch (e) {}
          });
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // For static assets (icons, manifest, etc.): cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try { cache.put(event.request, clone); } catch (e) {}
          });
        }
        return response;
      });
    })
  );
});
