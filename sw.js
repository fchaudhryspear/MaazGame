/* MaazGame service worker — offline-capable app shell.
 *
 * Strategy:
 *  - Precache the whole (self-contained) app shell on install: index.html,
 *    the vendored Phaser build, the manifest, and the icons. Everything the
 *    game needs is same-origin, so no cross-origin/opaque handling is needed.
 *  - Runtime: cache-first for GETs, falling back to network and caching new
 *    same-origin responses. Navigations fall back to the cached shell offline.
 *
 * Bump CACHE_VERSION whenever the shell changes to retire old caches.
 */
const CACHE_VERSION = 'maazgame-v2';

// Relative paths so the PWA works under a subpath (e.g. GitHub Pages
// project sites like user.github.io/MaazGame/).
const SHELL_ASSETS = [
  './',
  './index.html',
  './vendor/phaser.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(SHELL_ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop stale caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Cache-first: serve from cache, otherwise fetch and cache same-origin GETs.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const res = await fetch(request);
        const url = new URL(request.url);
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, res.clone());
        }
        return res;
      } catch (e) {
        // Offline navigation fallback -> app shell.
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        throw e;
      }
    })()
  );
});
