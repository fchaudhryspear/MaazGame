# MaazGame

A mobile-first, web-rendered Pokémon Emerald-style RPG built with Phaser 3,
targeting Mobile Safari on iPad and installable as a Progressive Web App.

## Playing

Serve the folder and open it (a service worker needs an `http(s)` origin, so
`file://` won't work):

```
python3 -m http.server 8000
# then visit http://localhost:8000
```

| Input | Action |
| --- | --- |
| Arrow keys / WASD, or the on-screen D-Pad | Walk (tile by tile) |
| Hold Shift | Run |
| Space / Enter, or the **A** button | Talk to signs, confirm |
| Esc, or the **☰** button | Pause menu (party, bag, pokédex, save, sound) |
| M | Mute / unmute |

Walk into the tall grass to trigger a wild battle. Weaken a monster before
throwing a ball to improve your odds. Standing on the cabin floor in town
fully heals your party, and the game autosaves after every battle.

On iPad Safari: open the URL, then **Share → Add to Home Screen** to install.
Launch once online to prime the offline cache.

## Systems

- **Grid movement + collision matrix** — strict tile-by-tile motion, 4-way
  only, input locked during a step. Blocked tiles still turn you to face them.
- **Layered tilemap** — array-based ground/decor layers, depth-sorted, driven
  by a single tile dictionary that feeds both rendering and collision.
- **Touch controls** — a camera-pinned Phaser-UI D-Pad plus A/menu buttons, so
  it scales with the game instead of fighting the Scale Manager's letterboxing.
- **Encounters** — tall-grass step tracking with a grace period, then a
  per-step probability roll.
- **Turn-based battles** — type effectiveness and STAB, move priority, stat
  stages from status moves, accuracy/misses, speed-ordered turns, and an AI
  that usually picks its best matchup.
- **Progression** — XP, level-ups with stat growth and learnsets (4-move cap).
- **Catching & party** — throw balls to capture wild monsters, carry up to six,
  switch mid-battle, and heal with items from the bag.
- **Persistence** — localStorage save/load with autosave, plus a mini pokédex
  tracking what you've seen and caught.
- **Audio** — every sound effect is synthesised at runtime with WebAudio
  (no audio files), unlocked on first gesture as iOS requires.
- **PWA** — manifest + service worker precache the whole app shell, including
  the vendored Phaser build, so it installs and runs fully offline.

## Project layout

```
index.html                Shell: meta tags, canvas host, module entry point
src/main.js               Phaser boot + service worker registration
src/config.js             Tunables (tile size, speeds, encounter rates)
src/assets.js             Runtime texture generation (no image files)
src/data/world.js         Tile dictionary, map layers, signs, heal tiles
src/data/monsters.js      Types, type chart, moves, species, items
src/entities/             Collision matrix, grid-locked player
src/systems/              Battle maths, encounters, save/load, audio
src/ui/                   Shared widgets, touch controls
src/scenes/               WorldScene (overworld), BattleScene
tests/smoke.js            End-to-end headless browser test
vendor/phaser.min.js      Vendored Phaser 3.80.1 (offline-safe)
manifest.webmanifest      PWA metadata
sw.js                     Service worker (app-shell precache, cache-first)
icons/                    App icons (192, 512, apple-touch 180)
```

All art is generated at runtime in `src/assets.js`, so there are no image
assets to load. Swapping in real pixel art means replacing that module — the
rest of the game only refers to texture keys.

## Tests

```
npm install playwright
node tests/smoke.js
```

Boots the real game in headless Chromium and exercises movement/collision,
type effectiveness, a full battle with XP and level-ups, catching, party
switching, items, the pause menu, save/load across a page reload, blackout,
heal tiles and signs. Set `CHROMIUM` to use an existing browser binary.

## Roadmap

- Trainer battles and NPCs with dialogue trees.
- More status effects (burn/paralysis) and held items.
- Phaser Tilemap + Tiled JSON for larger multi-map worlds with warps.
