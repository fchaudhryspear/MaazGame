# MaazGame

A mobile-first, web-rendered Pokémon Emerald-style RPG built with Phaser 3,
targeting Mobile Safari on iPad and installable as a Progressive Web App.

## Status

Playable foundation. The game logic lives in a single, well-structured
`index.html`; Phaser is vendored under `vendor/` so the app runs fully offline
once installed. All character/tile/monster art is generated at runtime, so
there are no image assets to load.

Controls: arrow keys / WASD on desktop, or the on-screen D-Pad on touch.
Walk through the tall grass to trigger a wild battle.

### Core systems

1. **Grid movement + collision matrix** — strict tile-by-tile motion, 4-way
   only, input locked during a step.
2. **Layered tilemap + animation** — array-based ground/decor layers and
   4-directional walk cycles.
3. **Touch D-Pad overlay** — Phaser UI D-Pad pinned to the camera, iPad-ready.
4. **Encounter system** — tall-grass step tracking with a grace period and a
   per-step random-encounter roll.
5. **Turn-based battle** — data-driven moves/species, speed-based turn order,
   HP bars, damage/faint/run, win & lose handling. Launches over a paused
   overworld and returns to it.
6. **PWA** — `manifest.webmanifest` + `sw.js` service worker precache the app
   shell (including the vendored Phaser) for offline play and home-screen
   install on iPad.

## Run

A service worker requires an `http(s)` origin (it won't register on
`file://`), so serve the folder:

```
python3 -m http.server 8000
# then visit http://localhost:8000
```

On iPad Safari: open the URL, then **Share → Add to Home Screen** to install
it. Launch once online to prime the offline cache.

## Project layout

```
index.html               Game shell + all game code (scenes, systems, data)
vendor/phaser.min.js      Vendored Phaser 3.80.1 (offline-safe)
manifest.webmanifest      PWA metadata (name, icons, standalone, theme)
sw.js                     Service worker (app-shell precache, cache-first)
icons/                    App icons (192, 512, apple-touch 180)
```

## Roadmap

- Battle depth: types/effectiveness, status moves, items, multi-monster party
  and switching.
- Real pixel-art assets swapped in for the generated placeholders.
- Phaser Tilemap + Tiled JSON for larger, multi-map worlds with warps.
