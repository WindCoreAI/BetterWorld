const CACHE_NAME = 'betterworld-v2';
// Bumped from v1: the v1 API cache held responses to signed-in requests keyed
// by URL alone. Changing the name makes the activate handler below delete it.
const API_CACHE = 'betterworld-api-v2';

// Install: pre-cache shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch
//  - navigation:           network, falling back to a cached page when offline
//  - anonymous API reads:  network first; the cached copy is used ONLY when the
//                          network fails, so public pages still open offline
//  - signed-in API reads:  never intercepted and never cached
//  - health probes:        never intercepted and never cached
//  - everything else:      not intercepted
//
// API reads used to be answered from the cache first. The cache is keyed by URL
// and ignores the Authorization header, so (1) every screen was one step stale —
// claim a mission and the page still offered "Claim Mission" — and (2) on a
// shared device the next person to sign in was shown the previous person's
// cached profile, dashboard and balance.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then(cached =>
          cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'text/html' } })
        )
      )
    );
    return;
  }

  if (request.url.includes('/api/v1/') && request.method === 'GET') {
    // Personal data: straight to the network, nothing stored.
    if (request.headers.has('Authorization')) return;

    // A health probe has to describe the network now; a cached "ok" would
    // report a healthy system while offline.
    if (new URL(request.url).pathname.endsWith('/api/v1/health')) return;

    event.respondWith(
      caches.open(API_CACHE).then(cache =>
        fetch(request)
          .then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() =>
            cache.match(request).then(cached => {
              if (cached) return cached;
              // Same outcome as an un-intercepted request with no network
              return Response.error();
            })
          )
      )
    );
    return;
  }

  // Let non-GET requests pass through to the browser without interception.
  // Wrapping them in respondWith(fetch(request)) converts network errors into
  // opaque FetchEvent failures, hiding the real error from the application.
});

// Background sync for queued observations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-observations') {
    event.waitUntil(syncObservations());
  }
});

async function syncObservations() {
  // Notify the app that sync has started so the offline-queue module
  // can replay queued observations via its syncQueuedObservations function
  const channel = new BroadcastChannel('sw-sync');
  channel.postMessage({ type: 'sync-start' });
  channel.close();
}
