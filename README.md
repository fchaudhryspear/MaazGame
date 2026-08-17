# MaazGame

A mobile-first, web-rendered Pokémon Emerald-style RPG built with Phaser 3,
targeting Mobile Safari on iPad (and installable as a PWA).

## Status

Foundation in progress. The whole game currently lives in a single
self-contained `index.html` — open it in a browser to play (arrow keys / WASD,
or the on-screen D-Pad on touch devices). All placeholder art is generated at
runtime, so there are no external assets to load.

### Core systems

1. **Grid movement + collision matrix** — strict tile-by-tile motion, 4-way
   only, input locked during a step.
2. **Layered tilemap + animation** — array-based ground/decor layers and
   4-directional walk cycles.
3. **Touch D-Pad overlay** — Phaser UI D-Pad pinned to the camera, iPad-ready.
4. **Encounter hook** — tall-grass step tracking with a random-encounter
   callback, ready for a future turn-based battle scene.

## Run

Open `index.html` directly, or serve the folder:

```
python3 -m http.server 8000
# then visit http://localhost:8000
```
