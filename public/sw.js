/* SMPLR service worker — minimal app-shell + runtime cache for offline PWA.
 *
 * Path-portable: derives BASE from the SW's own location so the same file
 * works whether deployed at "/", "/audio-sampling-machine/", or any
 * other sub-path (e.g. GitHub Pages project site).
 */
const VERSION = 'smplr-v2';
const BASE = new URL('./', self.location.href).pathname; // e.g. "/audio-sampling-machine/"

const APP_SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.webmanifest',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  BASE + 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin GETs and only paths within our scope.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE)) return;

  // Network-first for navigation so new builds appear quickly online,
  // cache fallback when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(BASE + 'index.html').then((r) => r || Response.error()),
        ),
    );
    return;
  }

  // Stale-while-revalidate for everything else.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
