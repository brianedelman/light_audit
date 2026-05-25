/**
 * Light Audit PWA Service Worker
 * Cache-first strategy with versioned cache key.
 * Old cache versions are cleaned up on activate.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `audit-pwa-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Install: pre-cache all known assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// Activate: delete caches from previous versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch: cache-first, fall back to network
self.addEventListener("fetch", (event) => {
  // Only handle GET requests for same-origin or CDN assets
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses for same-origin requests
        if (
          response.ok &&
          (event.request.url.startsWith(self.location.origin) ||
            event.request.url.startsWith("https://cdnjs.cloudflare.com"))
        ) {
          const responseClone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      });
    }),
  );
});
