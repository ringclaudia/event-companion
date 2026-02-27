/*
 * Service Worker — Event Companion PWA
 *
 * Strategy: Cache-first with background revalidation.
 *   1. First visit → fetch from network, populate cache, serve.
 *   2. Repeat visits → serve instantly from cache.
 *   3. Background fetch updates the cache silently.
 *   4. When sw.js itself changes (CACHE_VERSION bump), a new SW installs,
 *      re-caches everything, activates, and notifies the page so it can
 *      show an "Update available" banner.
 *
 * To deploy an update: bump CACHE_VERSION below and redeploy.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `event-companion-${CACHE_VERSION}`;

// Assets to precache on install — add any future static files here
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

/* ── Install: precache shell assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

/* ── Activate: purge old caches, take control ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('event-companion-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // take over open tabs
  );
});

/* ── Fetch: stale-while-revalidate ── */
self.addEventListener('fetch', event => {
  const request = event.request;

  // Only handle GET requests and same-origin
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      // Fire off a background fetch to update the cache
      const fetchPromise = fetch(request).then(networkResponse => {
        // Only cache successful responses
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Network failed — cachedResponse (if any) is already being returned
        return cachedResponse;
      });

      // Return cached immediately, or wait for network if nothing cached
      return cachedResponse || fetchPromise;
    })
  );
});

/* ── Message channel: page can ask SW to skipWaiting ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
