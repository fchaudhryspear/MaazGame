/* MaazGame service worker — offline-capable app shell.
 *
 * Strategy:
 *  - Precache the whole (self-contained) app shell on install: index.html,
 *    the vendored Phaser build, the manifest, and the icons. Everything the
 *    game needs is same-origin, so no cross-origin/opaque handling is needed.
 *  - Runtime: NETWORK-FIRST for same-origin GETs, falling back to the cache
 *    when the network fails. Every successful response refreshes the cache,
 *    so the game still starts and runs with no network at all.
 *
 * Why network-first: this was cache-first, which meant a `git pull` changed
 * the files on disk and the browser never asked for them — the game kept
 * running last week's code until the cache version happened to be bumped.
 * Silently serving stale code is a worse failure than a few milliseconds of
 * revalidation on a local server, and offline still works because every
 * fetch falls back to the cache.
 *
 * Bump CACHE_VERSION whenever the shell changes, to retire old caches.
 */
const CACHE_VERSION = 'maazgame-v7';

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

  // ES modules — every one must be listed, since the browser requests them
  // individually and a missing entry would break offline boot.
  './src/main.js',
  './src/config.js',
  './src/assets.js',
  './src/data/monsters.js',
  './src/data/trainers.js',
  './src/entities/collision.js',
  './src/entities/player.js',
  './src/entities/npc.js',
  './src/systems/maploader.js',
  './src/systems/monster.js',
  './src/systems/status.js',
  './src/systems/encounters.js',
  './src/systems/save.js',
  './src/systems/audio.js',
  './src/ui/widgets.js',
  './src/ui/touch.js',
  './src/ui/dialogue.js',
  './src/ui/shop.js',
  './src/ui/prompt.js',
  './src/scenes/TitleScene.js',
  './src/scenes/WorldScene.js',
  './src/scenes/BattleScene.js',
  './src/scenes/EndingScene.js',

  // Tiled map data. Precached so the world is fully explorable offline —
  // warping to an uncached area would otherwise fail with no network.
  './maps/index.json',
  './maps/tileset.json',
  './maps/town.json',
  './maps/route1.json',
  './maps/cave.json',
  './maps/hall.json',
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

  // Network-first with a cache fallback: fresh code when there is a network,
  // the last known-good copy when there isn't.
  event.respondWith(
    (async () => {
      const url = new URL(request.url);
      const sameOrigin = url.origin === self.location.origin;

      try {
        const res = await fetch(request);
        if (res && res.status === 200 && sameOrigin) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, res.clone());
        }
        return res;
      } catch (e) {
        const cached = await caches.match(request);
        if (cached) return cached;
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
