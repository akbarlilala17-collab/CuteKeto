/* Service worker: caches the app shell so it works offline.
   Bump CACHE_VERSION whenever you change any file, so phones
   pick up the new version. */
const CACHE_VERSION = 'keto-v1';
const APP_SHELL = [
  '.',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/data.js',
  'js/storage.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first, falling back to cache when offline.
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
