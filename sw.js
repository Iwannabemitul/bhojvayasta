/**
 * BhojVayasta - Mobile Courier PWA Service Worker (T3.1)
 * File: sw.js
 *
 * Implements:
 * 1. Pre-caching and instant activation (skipWaiting & clients.claim)
 * 2. Cache-First strategy for Leaflet map tiles (arcgisonline.com, openstreetmap.org)
 * 3. Cache-First strategy for external vendor CDNs (unpkg.com, cdn.tailwindcss.com, cdn.jsdelivr.net)
 * 4. Stale-While-Revalidate strategy for core application shell and store logic
 * 5. Offline fallback handling for highway transit without connectivity
 */

const SHELL_CACHE = 'bhojvayasta-shell-v1';
const VENDOR_CACHE = 'bhojvayasta-vendor-v1';
const MAPS_CACHE = 'bhojvayasta-maps-v1';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './volunteer.html',
  './donate.html',
  './manifest.json',
  './css/styles.css',
  './js/store.js',
  './js/volunteer.js',
  './js/donate.js',
  './js/dashboard.js',
  './js/navbar.js',
  './js/foodSafety.js',
  './js/pwa.js',
  './js/transitSimulator.js',
  './js/qrPass.js'
];

// 1. INSTALL LIFECYCLE: Pre-cache app shell and skip waiting
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (cache) {
        return cache.addAll(APP_SHELL_ASSETS);
      })
      .then(function () {
        return self.skipWaiting();
      })
      .catch(function (err) {
        console.warn('[SW] App shell pre-cache failed:', err);
      })
  );
});

// 2. ACTIVATE LIFECYCLE: Invalidate stale caches and claim clients immediately
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== SHELL_CACHE && key !== VENDOR_CACHE && key !== MAPS_CACHE) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// 3. FETCH LIFECYCLE: Multi-tiered caching strategies
self.addEventListener('fetch', function (event) {
  const req = event.request;
  const url = req.url;

  // Strategy A: Cache-First for Leaflet map tiles (ArcGIS & OpenStreetMap)
  if (url.includes('arcgisonline.com') || url.includes('tile.openstreetmap.org') || url.includes('maps-')) {
    event.respondWith(
      caches.open(MAPS_CACHE).then(function (cache) {
        return cache.match(req).then(function (cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(req)
            .then(function (networkResponse) {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(req, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(function () {
              return cachedResponse || new Response('', { status: 408, statusText: 'Offline Map Tile' });
            });
        });
      })
    );
    return;
  }

  // Strategy B: Cache-First for Vendor CDN Assets (Tailwind, Leaflet, Chart.js, Lucide)
  if (url.includes('unpkg.com') || url.includes('cdn.jsdelivr.net') || url.includes('cdn.tailwindcss.com') || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(VENDOR_CACHE).then(function (cache) {
        return cache.match(req).then(function (cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(req)
            .then(function (networkResponse) {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(req, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(function () {
              return cachedResponse || new Response('', { status: 408, statusText: 'Offline Vendor Asset' });
            });
        });
      })
    );
    return;
  }

  // Strategy C: Stale-While-Revalidate for core application shell
  event.respondWith(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.match(req).then(function (cachedResponse) {
        const fetchPromise = fetch(event.request)
          .then(function (networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(function () {
            return cachedResponse || caches.match('./volunteer.html');
          });

        return cachedResponse || fetchPromise;
      }).catch(function () {
        return caches.match('./volunteer.html');
      });
    })
  );
});
