# MaazGame

A mobile-first, web-rendered Pokémon Emerald-style RPG built with Phaser 3,
targeting Mobile Safari on iPad and installable as a Progressive Web App.

## Playing

On a Mac (or any machine with Python 3 — macOS ships it):

```
git clone https://github.com/fchaudhryspear/MaazGame.git
cd MaazGame
./play.sh
```

That serves the folder and opens `http://localhost:8000` in your browser.
Pass a port if 8000 is taken (`./play.sh 9000`), or use `npm start`.

It has to be served over `http://` rather than opened as a file — ES modules
and the service worker are both blocked on the `file:` protocol.

| Input | Action |
| --- | --- |
| Arrow keys / WASD, or the on-screen D-Pad | Walk (tile by tile) |
| Hold Shift | Run |
| Space / Enter, or the **A** button | Talk to people and signs, advance dialogue |
| Esc, or the **☰** button | Pause menu (party, bag, pokédex, save, sound) |
| M | Mute / unmute |

On first run you name your trainer and nickname your starter, then you're in
MAAZ TOWN. Walk into tall grass to trigger a wild battle; weaken a monster
before throwing a ball to improve your odds, and you can nickname whatever you
catch. Standing on the cabin floor in town fully heals your party, and the game
autosaves after every battle.

**The goal:** beat the three road trainers, then the CHAMPION at the end of
MAAZ CAVE. Winning rolls a Hall of Fame — after that the save continues, so
there's still a pokédex to finish and monsters to raise.

The world has four connected areas — **MAAZ TOWN** (safe), **ROUTE 1**, **MAAZ
CAVE**, and the **CHAMPION'S HALL** deep inside it — each with its own wild
monsters. Step onto a road at the edge of an area to travel between them.

Talk to the townsfolk for hints — the **ranch hand gives you a LAMBLET**, a
sheep that grows into WOOLIE and then RAMBOLT. The **shopkeeper** sells potions,
balls and held items for the prize money trainers pay out.

**Trainers watch the tile ahead of them** and challenge you on sight, so walking
into a line of sight starts a battle you cannot flee — beat them once and they
stay beaten. Watch out for burn, poison and paralysis, and check what your
monster is holding.

To play on an iPad on the same network, serve with `./play.sh` and visit
`http://<your-mac-ip>:8000` in Safari. **Share → Add to Home Screen** makes an
icon for it. Note that the offline cache needs a secure context, so over a plain
`http://` LAN address the service worker won't register — the Mac has to be
serving. Installing it as a genuinely offline PWA needs an `https://` URL.

## Systems

- **Grid movement + collision matrix** — strict tile-by-tile motion, 4-way
  only, input locked during a step. Blocked tiles still turn you to face them.
- **Tiled JSON maps** — every area is a standard Tiled 1.10 map referencing a
  shared tileset, so tile behaviour (texture, walkability, whether it spawns
  encounters) has one source of truth and maps are self-describing.
- **Multi-area world with warps** — areas are loaded and cached at boot;
  stepping on a warp pad fades out, swaps the tiles and collision matrix in
  place, and fades back in. Each area carries its own encounter table, so town
  is safe while the cave has its own residents.
- **Touch controls** — a camera-pinned Phaser-UI D-Pad plus A/menu buttons, so
  it scales with the game instead of fighting the Scale Manager's letterboxing.
- **Encounters** — tall-grass step tracking with a grace period, then a
  per-step probability roll.
- **Turn-based battles** — type effectiveness and STAB, move priority, stat
  stages from status moves, accuracy/misses, speed-ordered turns, and an AI
  that usually picks its best matchup.
- **Status conditions** — burn (halves attack, chips HP), poison (chips harder)
  and paralysis (quarters speed, sometimes costs the turn). Types are immune to
  the obvious ones, conditions persist out of battle, and healing clears them.
- **Held items** — type boosters, a pinch-heal berry that fires once when HP
  runs low, a Quick Claw that jumps the turn order, and a status guard.
- **NPCs and trainers** — paged dialogue boxes, and trainers who watch a line
  of tiles, pop a "!", battle you with a full team, and pay out on defeat.
- **Progression** — XP, level-ups with stat growth and learnsets (4-move cap),
  and **evolution**: five lines evolve at set levels, with an animation and
  recomputed stats. Nicknames survive evolving.
- **A goal and an ending** — a CHAMPION locked behind the three road trainers,
  a Hall of Fame roll for the party, and free play afterwards.
- **Shop and money** — trainers pay prize money; the town shop turns it into
  potions, balls and held items.
- **Title screen and naming** — new game or continue, name your trainer and
  nickname every monster you catch, via an in-canvas keyboard (a DOM input
  fights the Scale Manager on iPad).
- **Catching & party** — throw balls to capture wild monsters, carry up to six,
  switch mid-battle, and heal with items from the bag.
- **Persistence** — localStorage save/load with autosave, plus a mini pokédex
  tracking what you've seen and caught.
- **Runtime pixel art** — no image files anywhere. Terrain is generated as
  several variants per surface and scattered by tile position, so a field of
  grass never repeats into graph paper; paths and ponds fringe into the grass
  they touch, water animates, and every species has its own silhouette
  (four-legged, finned, winged, faceted, fleeced) rather than a recoloured
  blob. Battles are fought against a painted backdrop of sky, hills and
  treeline.
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
src/data/monsters.js      Types, type chart, moves, species, items
src/data/trainers.js      NPC dialogue and trainer teams
maps/*.json               Areas in Tiled 1.10 format (+ shared tileset.json)
tools/mapsrc.mjs          ASCII source for every area (edit maps here)
tools/build-maps.mjs      Compiles + validates ASCII into maps/*.json
src/entities/             Collision matrix, grid-locked player, NPCs
play.sh                   One-command local server
src/systems/              Battle maths, encounters, save/load, audio, maps
src/ui/                   Widgets, touch controls, dialogue, shop, name prompt
src/scenes/               Title, World (overworld), Battle, Ending
tests/smoke.cjs           End-to-end headless browser test
vendor/phaser.min.js      Vendored Phaser 3.80.1 (offline-safe)
manifest.webmanifest      PWA metadata
sw.js                     Service worker (app-shell precache, cache-first)
icons/                    App icons (192, 512, apple-touch 180)
```

All art is generated at runtime in `src/assets.js`, so there are no image
assets to load. Swapping in real pixel art means replacing that module — the
rest of the game only refers to texture keys.

## Editing the world

Areas are authored as ASCII grids in `tools/mapsrc.mjs` — far easier to read
and diff than raw tile arrays — and compiled to Tiled JSON:

```
node tools/build-maps.mjs
```

The build is strict and fails rather than shipping a broken world. Ragged rows,
unknown legend characters, warps pointing at a missing map, warps/spawns/heal
pads on blocked tiles, people standing in walls or unreachable, unknown NPC and
trainer ids, and trainers facing a wall (so they could never spot you) are all
build errors. Regenerating is idempotent.

NPC dialogue and trainer teams live in `src/data/trainers.js`; maps reference
them by id, so a typo fails the build instead of appearing in game.

The generated `maps/*.json` are valid Tiled files, so they can also be opened
and edited directly in the [Tiled](https://www.mapeditor.org/) editor; if you
go that route, treat the JSON as the source of truth and stop running the
compiler.

## Tests

```
npm install playwright
node tests/smoke.cjs
```

Boots the real game in headless Chromium and runs the full suite: movement and
collision, warps and multi-area travel, type effectiveness, a full battle with
XP and level-ups, catching, party switching, items, NPC dialogue, trainer line
of sight and team battles, status conditions, held items, the pause menu,
save/load across a page reload, blackout, heal tiles and signs, plus the title
screen and naming, the sheep gift, the shop, evolution, the champion gate and
the ending. Set `CHROMIUM` to point at an existing browser binary.

## Roadmap

- Type-effectiveness hints in the move menu, so matchups are learnable without
  prior Pokémon knowledge.
- More areas and species; decor layers on the existing maps.
- Equipping held items from the bag (they can currently be bought and are shown,
  but are assigned in data).
- Sleep/freeze conditions and multi-turn moves.
