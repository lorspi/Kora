const CACHE_NAME = 'kora-cache-1.2.0';
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

  // Only handle http/https requests. Browser extensions issue requests with
  // schemes like chrome-extension:// that the Cache API cannot store, which
  // otherwise throws "Request scheme 'chrome-extension' is unsupported".
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Only cache requests to our own origin. Cross-origin responses (CDNs, etc.)
  // are left to the browser's own HTTP cache to avoid opaque-response issues.
  if (url.origin !== self.location.origin) return;

  // Never cache version.txt — always go to network for update checks
  if (event.request.url.includes('version.txt')) return;

  // For navigation requests: network-first, cache the fresh response for offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' }).then((response) => {
        // Cache the fresh page so offline fallback always has the latest version
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) =>
          cache.put('/', clone)
        ).catch(() => {});
        return response;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  // For hashed assets (Vite chunks): network-first to avoid serving stale chunks
  // The hash in the filename already provides cache-busting at the HTTP level
  if (event.request.url.includes('/assets/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' }).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, clone)
          ).catch(() => {});
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
      return fetch(event.request, { cache: 'no-cache' }).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, clone)
          ).catch(() => {});
        }
        return response;
      });
    })
  );
});
