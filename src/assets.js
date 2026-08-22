// =========================================================================
//  ASSET FACTORY
//  Generates every texture at runtime, so the game ships with no image
//  files. Each function writes a texture under a key; the rest of the game
//  only ever refers to keys, so swapping in real pixel art later means
//  replacing this module and nothing else.
//
//  Art direction, in short: GBA-era readability. Flat fills are the enemy —
//  every surface gets a base tone, mottling, and a light source from the
//  top-left, and every character sits on a shadow so nothing floats. Ground
//  tiles are generated as several variants and scattered by position, which
//  is what stops a 20x15 grid from looking like graph paper.
// =========================================================================
import { CONFIG } from './config.js';

// --- tiny pixel-art toolkit ----------------------------------------------

// Deterministic RNG. Texture detail must be identical on every boot and on
// every device, so Math.random is not an option here.
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Mix a colour toward white (amt > 0) or black (amt < 0). Saves hand-picking
// three hex values for every surface that needs a highlight and a shadow.
export function shade(color, amt) {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  const to = amt >= 0 ? 255 : 0;
  const k = Math.abs(amt);
  const mix = (c) => Math.round(c + (to - c) * k) & 0xff;
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

// Speckle a rectangle with lighter/darker dots of its own colour. This is the
// single biggest difference between "flat fill" and "surface".
function mottle(g, x, y, w, h, color, count, seed, spread = 0.1) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const px = x + Math.floor(rand() * w);
    const py = y + Math.floor(rand() * h);
    const size = rand() < 0.75 ? 1 : 2;
    const amt = (rand() < 0.5 ? -1 : 1) * spread * (0.4 + rand() * 0.6);
    g.fillStyle(shade(color, amt), 1).fillRect(px, py, size, size);
  }
}

// Build a horizontal strip of `count` frames under one key and index them,
// so callers can pick a variant with `add.image(x, y, key, n)`.
function sheet(scene, key, w, h, count, draw) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  for (let i = 0; i < count; i++) draw(g, i * w, 0, i);
  g.generateTexture(key, w * count, h);
  g.destroy();
  const tex = scene.textures.get(key);
  for (let i = 0; i < count; i++) tex.add(i, 0, i * w, 0, w, h);
}

// How many variants each ground texture has. WorldScene hashes the tile
// position against this to scatter them.
// Sparse scatter frames laid over grass (flowers, stones, clover).
export const DECOR_VARIANTS = 4;

export const TILE_VARIANTS = Object.freeze({
  tile_path: 4,
  tile_grass: 4,
  tile_tall: 4,
  tile_tree: 3,
  tile_wall: 3,
  tile_water: 4,     // these four are animation frames, not scatter variants
  tile_floor: 2,
  tile_sign: 1,
  tile_cave: 4,
  tile_rock: 3,
  tile_rubble: 2,
});

// Water is animated rather than scattered, so WorldScene treats it specially.
export const ANIMATED_TILES = Object.freeze({ tile_water: { frames: 4, fps: 3 } });

// --- tiles ---------------------------------------------------------------

const T = () => CONFIG.TILE;

// Grass: mottled turf, a few blade tufts, and the occasional flower or stone
// so a wide field has something to rest the eye on.
function makeGrass(scene) {
  const t = T();
  sheet(scene, 'tile_grass', t, t, TILE_VARIANTS.tile_grass, (g, ox, oy, v) => {
    const base = 0x57a44b;
    g.fillStyle(base, 1).fillRect(ox, oy, t, t);
    mottle(g, ox, oy, t, t, base, 60, 1000 + v, 0.09);

    // Blade tufts: a dark stroke with a lit tip. Kept low-contrast and away
    // from the tile edge, so a field of these reads as texture rather than a
    // repeating stamp.
    const rand = rng(2000 + v);
    for (let i = 0; i < 6; i++) {
      const x = ox + 3 + Math.floor(rand() * (t - 7));
      const y = oy + 5 + Math.floor(rand() * (t - 11));
      const lean = rand() < 0.5 ? -1 : 1;
      g.fillStyle(shade(base, -0.16), 1);
      g.fillRect(x, y, 1, 4);
      g.fillRect(x + lean, y - 1, 1, 2);
      g.fillStyle(shade(base, 0.13), 1).fillRect(x + lean, y - 2, 1, 1);
    }
  });
}

// Sparse scatter that sits on top of grass — flowers, a stone, a clover.
// Kept out of the tile textures themselves: at one-in-four a decoration
// becomes a visible repeating pattern, and at one-in-twelve it reads as a
// meadow. Transparent background, so it composites over any turf variant.
function makeGrassDecor(scene) {
  const t = T();
  sheet(scene, 'decor_grass', t, t, DECOR_VARIANTS, (g, ox, oy, v) => {
    const rand = rng(21000 + v);
    if (v === 0 || v === 1) {                          // flower cluster
      const petal = v === 0 ? 0xf6f3ea : 0xe4b7e8;
      const spots = v === 0 ? [[9, 18], [20, 12], [14, 24]] : [[12, 14], [21, 21]];
      for (const [fx, fy] of spots) {
        g.fillStyle(0x2f6b33, 1).fillRect(ox + fx, oy + fy + 1, 1, 3);
        g.fillStyle(petal, 1);
        g.fillRect(ox + fx, oy + fy - 2, 1, 3);
        g.fillRect(ox + fx - 1, oy + fy - 1, 3, 1);
        g.fillStyle(0xf5d76e, 1).fillRect(ox + fx, oy + fy - 1, 1, 1);
      }
    } else if (v === 2) {                              // half-buried stone
      g.fillStyle(0x6f7266, 1).fillEllipse(ox + 17, oy + 19, 11, 7);
      g.fillStyle(0x8f9285, 1).fillEllipse(ox + 17, oy + 18, 9, 5);
      g.fillStyle(0xa8ab9d, 1).fillEllipse(ox + 15, oy + 17, 5, 2);
    } else {                                           // clover patch
      g.fillStyle(0x3f8a3f, 1);
      for (let i = 0; i < 5; i++) {
        const x = ox + 8 + Math.floor(rand() * 16);
        const y = oy + 12 + Math.floor(rand() * 12);
        g.fillCircle(x, y, 2);
        g.fillStyle(0x6cbb5e, 1).fillCircle(x - 1, y - 1, 1);
        g.fillStyle(0x3f8a3f, 1);
      }
    }
  });
}

// Dirt path: warm sand, gravel, and stray grass creeping in at the edges.
function makePath(scene) {
  const t = T();
  sheet(scene, 'tile_path', t, t, TILE_VARIANTS.tile_path, (g, ox, oy, v) => {
    const base = 0xd6bd88;
    g.fillStyle(base, 1).fillRect(ox, oy, t, t);
    mottle(g, ox, oy, t, t, base, 85, 3000 + v, 0.12);

    const rand = rng(4000 + v);
    for (let i = 0; i < 4 + v; i++) {                 // gravel
      const x = ox + 2 + Math.floor(rand() * (t - 6));
      const y = oy + 2 + Math.floor(rand() * (t - 6));
      const w = 2 + Math.floor(rand() * 2);
      g.fillStyle(shade(base, -0.22), 1).fillRect(x, y, w, 2);
      g.fillStyle(shade(base, 0.16), 1).fillRect(x, y, w, 1);
    }
    if (v === 1) {                                    // grass tuft
      g.fillStyle(0x57a44b, 1);
      g.fillRect(ox + 5, oy + 24, 1, 4);
      g.fillRect(ox + 7, oy + 23, 1, 5);
      g.fillRect(ox + 6, oy + 26, 3, 2);
    }
  });
}

// Tall grass: the same turf, then dense blade clusters that break the top
// edge of the tile so it reads as something you wade into.
function makeTallGrass(scene) {
  const t = T();
  sheet(scene, 'tile_tall', t, t, TILE_VARIANTS.tile_tall, (g, ox, oy, v) => {
    // Same turf as the surrounding field, only a shade cooler, so a patch
    // sits in the grass instead of looking like a hole cut out of it.
    const ground = 0x4e9744;
    g.fillStyle(ground, 1).fillRect(ox, oy, t, t);
    mottle(g, ox, oy, t, t, ground, 40, 5000 + v, 0.08);

    const rand = rng(6000 + v);
    // Clumps of blades, drawn back-to-front. The tops are ragged and the
    // gaps let the ground show through — that irregularity is what makes it
    // read as plants rather than a rectangle.
    const clumps = [
      { x: 5, y: 20, h: 13, tone: -0.3 },
      { x: 16, y: 18, h: 16, tone: -0.22 },
      { x: 26, y: 21, h: 12, tone: -0.3 },
      { x: 10, y: 27, h: 15, tone: 0.02 },
      { x: 22, y: 28, h: 14, tone: 0.02 },
    ];
    for (const cl of clumps) {
      const blades = 5;
      for (let i = 0; i < blades; i++) {
        const bx = ox + cl.x - 4 + i * 2;
        const h = cl.h - Math.abs(i - 2) * 3 - Math.floor(rand() * 3);
        if (h <= 2) continue;
        const lean = i < 2 ? -1 : i > 2 ? 1 : 0;
        g.fillStyle(shade(0x3f8a3f, cl.tone), 1);
        g.fillRect(bx, oy + cl.y - h, 2, h);
        g.fillRect(bx + lean, oy + cl.y - h - 2, 2, 3);
        g.fillStyle(shade(0x3f8a3f, cl.tone + 0.26), 1);
        g.fillRect(bx + lean, oy + cl.y - h - 2, 1, 2);
      }
      g.fillStyle(0x000000, 0.12);                     // shadow at the base
      g.fillEllipse(ox + cl.x, oy + cl.y, 14, 4);
    }
  });
}

// Trees: a clustered canopy with dappled light, a shaded trunk, and a shadow
// pooling at the base so they sit on the ground rather than hover over it.
function makeTree(scene) {
  const t = T();
  sheet(scene, 'tile_tree', t, t, TILE_VARIANTS.tile_tree, (g, ox, oy, v) => {
    const grass = 0x57a44b;
    g.fillStyle(grass, 1).fillRect(ox, oy, t, t);
    mottle(g, ox, oy, t, t, grass, 40, 7000 + v, 0.12);

    const cx = ox + t / 2;
    g.fillStyle(0x000000, 0.22).fillEllipse(cx, oy + t - 4, 22, 8);

    g.fillStyle(0x5b4029, 1).fillRect(cx - 3, oy + t - 12, 6, 10);   // trunk
    g.fillStyle(0x74522f, 1).fillRect(cx - 3, oy + t - 12, 2, 10);   // lit side

    const canopy = 0x2f7a38;
    const rand = rng(8000 + v);
    const puffs = [
      [-10, -3, 10], [10, -3, 10], [0, -10, 10], [-11, 5, 9], [11, 5, 9],
      [-5, 6, 10], [5, 6, 10], [0, -1, 12],
    ];
    g.fillStyle(shade(canopy, -0.35), 1);                            // outline
    for (const [dx, dy, r] of puffs) g.fillCircle(cx + dx, oy + 13 + dy, r + 1);
    g.fillStyle(canopy, 1);
    for (const [dx, dy, r] of puffs) g.fillCircle(cx + dx, oy + 13 + dy, r);
    g.fillStyle(shade(canopy, -0.2), 1);                             // underside
    g.fillCircle(cx + 6, oy + 20, 8);
    g.fillCircle(cx - 7, oy + 20, 8);
    g.fillCircle(cx, oy + 22, 8);
    g.fillStyle(shade(canopy, 0.2), 1);                              // dapples
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2, d = rand() * 8;
      g.fillCircle(cx - 3 + Math.cos(a) * d, oy + 9 + Math.sin(a) * d, 1 + rand() * 1.5);
    }
    g.fillStyle(shade(canopy, 0.32), 1).fillCircle(cx - 5, oy + 7, 3);
  });
}

// Stone wall: staggered brick courses, dark mortar, lit top edge.
function makeWall(scene) {
  const t = T();
  sheet(scene, 'tile_wall', t, t, TILE_VARIANTS.tile_wall, (g, ox, oy, v) => {
    const base = 0x8d8f97;
    g.fillStyle(shade(base, -0.4), 1).fillRect(ox, oy, t, t);        // mortar
    const rand = rng(9000 + v);
    const rowH = 8;
    for (let row = 0; row < t / rowH; row++) {
      const offset = (row + v) % 2 ? -8 : 0;
      for (let x = offset; x < t; x += 16) {
        const by = oy + row * rowH + 1;
        const bx = Math.max(ox + 1, ox + x + 1);
        const right = Math.min(ox + t - 1, ox + x + 15);
        const w = right - bx;
        if (w <= 1) continue;
        const tone = shade(base, (rand() - 0.5) * 0.14);
        g.fillStyle(tone, 1).fillRect(bx, by, w, rowH - 2);
        g.fillStyle(shade(tone, 0.22), 1).fillRect(bx, by, w, 1);     // lit top
        g.fillStyle(shade(tone, -0.2), 1).fillRect(bx, by + rowH - 3, w, 1);
        if (rand() < 0.3) {                                          // chip
          g.fillStyle(shade(tone, -0.28), 1)
            .fillRect(bx + 2 + Math.floor(rand() * (w - 4)), by + 2, 2, 2);
        }
      }
    }
  });
}

// Water: banded blue with wave crests that shift each frame, plus sparkles.
// Four frames played as a slow loop — the one bit of ambient motion in the
// overworld, and it makes the whole map feel alive.
function makeWater(scene) {
  const t = T();
  sheet(scene, 'tile_water', t, t, TILE_VARIANTS.tile_water, (g, ox, oy, f) => {
    // Flat base rather than a per-tile gradient: a gradient restarts at every
    // tile boundary, which turned a pond into a grid of squares.
    const base = 0x3a72c9;
    g.fillStyle(base, 1).fillRect(ox, oy, t, t);
    mottle(g, ox, oy, t, t, base, 55, 11000 + f, 0.07);

    const rand = rng(11000 + f);
    for (let i = 0; i < 5; i++) {                     // wave crests
      const y = oy + 3 + ((i * 7 + f * 2) % (t - 5));
      const x = ox + 2 + Math.floor(rand() * (t - 14));
      const w = 6 + Math.floor(rand() * 7);
      g.fillStyle(shade(base, 0.26), 0.85).fillRect(x, y, w, 1);
      g.fillStyle(shade(base, -0.18), 0.5).fillRect(x + 1, y + 1, w, 1);
    }
    g.fillStyle(0xffffff, 0.5);                       // sparkle
    const sx = ox + 6 + ((f * 9) % (t - 12));
    g.fillRect(sx, oy + 8 + ((f * 5) % 12), 2, 1);
    g.fillRect(sx + 1, oy + 7 + ((f * 5) % 12), 1, 1);
  });
}

// The fringe where a dirt path meets grass. One frame per side, overlaid on
// the path tile — cheap autotiling that removes the ruled-square look without
// a full 47-tile blob set.
function makePathEdges(scene) {
  const t = T();
  sheet(scene, 'edge_grass', t, t, 4, (g, ox, oy, side) => {
    const grass = 0x57a44b;
    const rand = rng(23000 + side);
    const depth = 6;
    for (let i = 0; i < t; i += 2) {
      const d = 2 + Math.floor(rand() * (depth - 1));
      if (side === 0) {                               // grass above
        g.fillStyle(grass, 1).fillRect(ox + i, oy, 2, d);
        g.fillStyle(shade(grass, -0.18), 1).fillRect(ox + i, oy + d - 1, 2, 1);
      } else if (side === 2) {                        // grass below
        g.fillStyle(grass, 1).fillRect(ox + i, oy + t - d, 2, d);
        g.fillStyle(shade(grass, 0.12), 1).fillRect(ox + i, oy + t - d, 2, 1);
      } else if (side === 3) {                        // grass to the left
        g.fillStyle(grass, 1).fillRect(ox, oy + i, d, 2);
        g.fillStyle(shade(grass, -0.15), 1).fillRect(ox + d - 1, oy + i, 1, 2);
      } else {                                        // grass to the right
        g.fillStyle(grass, 1).fillRect(ox + t - d, oy + i, d, 2);
        g.fillStyle(shade(grass, -0.15), 1).fillRect(ox + t - d, oy + i, 1, 2);
      }
    }
  });
}

// Cabin floorboards. The heal pad reads as indoors, so it is obvious that
// standing here is different from standing on grass.
function makeFloor(scene) {
  const t = T();
  sheet(scene, 'tile_floor', t, t, TILE_VARIANTS.tile_floor, (g, ox, oy, v) => {
    const base = 0xc9a271;
    g.fillStyle(base, 1).fillRect(ox, oy, t, t);
    const plank = 8;
    const rand = rng(12000 + v);
    for (let row = 0; row < t / plank; row++) {
      const y = oy + row * plank;
      const tone = shade(base, (rand() - 0.5) * 0.12);
      g.fillStyle(tone, 1).fillRect(ox, y, t, plank - 1);
      g.fillStyle(shade(tone, 0.16), 1).fillRect(ox, y, t, 1);        // lit edge
      g.fillStyle(shade(base, -0.32), 1).fillRect(ox, y + plank - 1, t, 1);
      for (let i = 0; i < 3; i++) {                                   // grain
        const gx = ox + Math.floor(rand() * (t - 8));
        g.fillStyle(shade(tone, -0.14), 0.8)
          .fillRect(gx, y + 2 + Math.floor(rand() * 4), 4 + Math.floor(rand() * 5), 1);
      }
      // Board joint, offset per row so it doesn't line up into a seam.
      const jx = ox + ((row + v) % 2 ? 10 : 22);
      g.fillStyle(shade(base, -0.3), 1).fillRect(jx, y, 1, plank - 1);
    }
  });
}

// Signpost: a carved board on a post, planted in the grass.
function makeSign(scene) {
  const t = T();
  sheet(scene, 'tile_sign', t, t, 1, (g, ox, oy) => {
    const grass = 0x57a44b;
    g.fillStyle(grass, 1).fillRect(ox, oy, t, t);
    mottle(g, ox, oy, t, t, grass, 40, 13000, 0.12);
    const cx = ox + t / 2;

    g.fillStyle(0x000000, 0.2).fillEllipse(cx, oy + t - 4, 16, 6);
    g.fillStyle(0x5b4029, 1).fillRect(cx - 2, oy + 16, 4, 13);       // post
    g.fillStyle(0x74522f, 1).fillRect(cx - 2, oy + 16, 1, 13);

    const board = 0xb98a45;
    g.fillStyle(shade(board, -0.4), 1).fillRect(ox + 3, oy + 5, t - 6, 14);
    g.fillStyle(board, 1).fillRect(ox + 4, oy + 6, t - 8, 12);
    g.fillStyle(shade(board, 0.18), 1).fillRect(ox + 4, oy + 6, t - 8, 1);
    g.fillStyle(shade(board, -0.3), 1);                              // carved text
    g.fillRect(ox + 7, oy + 9, t - 15, 2);
    g.fillRect(ox + 7, oy + 13, t - 19, 2);
  });
}

// Cave floor: damp stone with cracks and grit.
function makeCaveFloor(scene) {
  const t = T();
  sheet(scene, 'tile_cave', t, t, TILE_VARIANTS.tile_cave, (g, ox, oy, v) => {
    const base = 0x4d4639;
    g.fillStyle(base, 1).fillRect(ox, oy, t, t);
    mottle(g, ox, oy, t, t, base, 90, 14000 + v, 0.16);

    const rand = rng(15000 + v);
    if (v === 1 || v === 3) {                         // only some tiles crack
      let x = ox + 3 + Math.floor(rand() * 12);
      let y = oy + 5 + Math.floor(rand() * 14);
      const dir = v === 1 ? 1 : -1;                   // and they run both ways
      g.fillStyle(shade(base, -0.3), 1);
      for (let i = 0; i < 8; i++) {
        g.fillRect(x, y, 2, 1);
        x += dir * (1 + Math.floor(rand() * 3));
        y += rand() < 0.6 ? 1 : 0;
        if (x < ox + 1 || x > ox + t - 3 || y > oy + t - 2) break;
      }
    }
    if (v % 2 === 0) {                                // pebbles
      g.fillStyle(shade(base, 0.18), 1).fillRect(ox + 21, oy + 8, 3, 2);
      g.fillStyle(shade(base, 0.1), 1).fillRect(ox + 8, oy + 24, 2, 2);
    }
  });
}

// Rock wall: deliberately much darker and blockier than the cave floor. The
// player has to tell a wall from walkable rubble at a glance.
function makeRock(scene) {
  const t = T();
  sheet(scene, 'tile_rock', t, t, TILE_VARIANTS.tile_rock, (g, ox, oy, v) => {
    const base = 0x37312a;
    g.fillStyle(0x201c17, 1).fillRect(ox, oy, t, t);                 // deep gaps
    const rand = rng(16000 + v);
    const blocks = [
      [0, 0, 18, 13], [18, 0, 14, 13],
      [0, 13, 12, 11], [12, 13, 20, 11],
      [0, 24, 20, 8], [20, 24, 12, 8],
    ];
    for (const [bx, by, bw, bh] of blocks) {
      const tone = shade(base, (rand() - 0.5) * 0.18);
      g.fillStyle(tone, 1).fillRect(ox + bx + 1, oy + by + 1, bw - 2, bh - 2);
      g.fillStyle(shade(tone, 0.26), 1).fillRect(ox + bx + 1, oy + by + 1, bw - 2, 2);
      g.fillStyle(shade(tone, -0.35), 1).fillRect(ox + bx + 1, oy + by + bh - 3, bw - 2, 2);
      if (rand() < 0.5) {
        g.fillStyle(shade(tone, -0.22), 1)
          .fillRect(ox + bx + 3 + Math.floor(rand() * (bw - 7)), oy + by + 4, 2, 3);
      }
    }
  });
}

// Rubble: the cave's tall grass, where wild monsters hide. Pale crystal
// shards on the normal floor, so it never reads as a wall.
function makeRubble(scene) {
  const t = T();
  sheet(scene, 'tile_rubble', t, t, TILE_VARIANTS.tile_rubble, (g, ox, oy, v) => {
    const base = 0x4d4639;
    g.fillStyle(base, 1).fillRect(ox, oy, t, t);
    mottle(g, ox, oy, t, t, base, 60, 17000 + v, 0.16);

    const shard = (x, baseY, h, w, color) => {
      g.fillStyle(shade(color, -0.45), 1);                           // outline
      g.beginPath();
      g.moveTo(x, baseY + 1);
      g.lineTo(x - w - 1, baseY - h * 0.55);
      g.lineTo(x, baseY - h - 1);
      g.lineTo(x + w + 1, baseY - h * 0.55);
      g.closePath(); g.fillPath();

      g.fillStyle(color, 1);
      g.beginPath();
      g.moveTo(x, baseY);
      g.lineTo(x - w, baseY - h * 0.55);
      g.lineTo(x, baseY - h);
      g.lineTo(x + w, baseY - h * 0.55);
      g.closePath(); g.fillPath();

      g.fillStyle(shade(color, 0.4), 0.9);                           // facet
      g.beginPath();
      g.moveTo(x, baseY - 2);
      g.lineTo(x - w * 0.5, baseY - h * 0.5);
      g.lineTo(x, baseY - h + 2);
      g.closePath(); g.fillPath();
    };

    g.fillStyle(0x9dc4e0, 0.12).fillEllipse(ox + t / 2, oy + t - 8, 28, 14);
    if (v === 0) {
      shard(ox + 8, oy + t - 5, 15, 4, 0x7fa8c9);
      shard(ox + 17, oy + t - 3, 20, 5, 0x9dc4e0);
      shard(ox + 25, oy + t - 6, 12, 3, 0x6f96b5);
    } else {
      shard(ox + 7, oy + t - 4, 18, 5, 0x8fb6d4);
      shard(ox + 16, oy + t - 6, 12, 4, 0x6f96b5);
      shard(ox + 24, oy + t - 3, 17, 4, 0x9dc4e0);
    }
    g.fillStyle(0xeaf6ff, 0.9).fillRect(ox + 16, oy + t - 20, 1, 6); // glint
  });
}

export function buildTiles(scene) {
  makePath(scene);
  makeGrass(scene);
  makeGrassDecor(scene);
  makePathEdges(scene);
  makeTallGrass(scene);
  makeTree(scene);
  makeWall(scene);
  makeWater(scene);
  makeFloor(scene);
  makeSign(scene);
  makeCaveFloor(scene);
  makeRock(scene);
  makeRubble(scene);
}

// --- people --------------------------------------------------------------

// One shared character renderer for the player, NPCs and trainers, so
// everyone in the world is built to the same proportions and lighting.
//
//   dir   'down' | 'left' | 'right' | 'up'
//   step  -1 | 0 | 1  — left foot forward, standing, right foot forward
const SKIN = 0xf0c493;
const SKIN_SHADE = 0xd8a274;

function drawPerson(g, ox, oy, t, dir, step, pal) {
  const cx = ox + t / 2;
  const bob = step === 0 ? 0 : -1;         // tiny lift mid-stride
  const groundY = oy + t - 3;
  const outline = 0x1a1720;

  // Shadow first — the thing that stops characters floating on the tile.
  g.fillStyle(0x000000, 0.25).fillEllipse(cx, groundY, 17, 6);

  const hipY = groundY - 7 + bob;
  const swing = step * 2;

  // Legs and boots.
  for (const side of [-1, 1]) {
    const lx = cx + (side < 0 ? -5 : 1) + (side < 0 ? swing : -swing);
    g.fillStyle(outline, 1).fillRect(lx - 1, hipY - 1, 6, 9);
    g.fillStyle(pal.pants, 1).fillRect(lx, hipY, 4, 5);
    g.fillStyle(pal.shoes, 1).fillRect(lx, hipY + 5, 4, 3);
  }

  const bodyTop = oy + 14 + bob;
  const bodyBot = hipY + 1;

  // Torso, outlined so a character never disappears against similar terrain
  // (a green camper standing on grass was exactly that bug).
  g.fillStyle(outline, 1).fillRect(cx - 7, bodyTop - 1, 14, bodyBot - bodyTop + 2);
  g.fillStyle(pal.shirt, 1).fillRect(cx - 6, bodyTop, 12, bodyBot - bodyTop);
  g.fillStyle(shade(pal.shirt, 0.2), 1).fillRect(cx - 6, bodyTop, 12, 2);
  g.fillStyle(shade(pal.shirt, -0.25), 1).fillRect(cx - 6, bodyBot - 2, 12, 2);

  // Arms swing opposite the legs.
  for (const side of [-1, 1]) {
    const ax = side < 0 ? cx - 8 : cx + 5;
    const ay = bodyTop + 2 + (side < 0 ? -swing : swing) * 0.5;
    g.fillStyle(outline, 1).fillRect(ax - 1, ay - 1, 5, 8);
    g.fillStyle(shade(pal.shirt, -0.12), 1).fillRect(ax, ay, 3, 5);
    g.fillStyle(SKIN, 1).fillRect(ax, ay + 5, 3, 2);      // hand
  }

  // Head.
  const hy = bodyTop - 6;
  g.fillStyle(outline, 1).fillCircle(cx, hy, 8);
  g.fillStyle(SKIN, 1).fillCircle(cx, hy, 7);
  g.fillStyle(SKIN_SHADE, 1).fillRect(cx - 7, hy + 4, 14, 3);   // jaw shadow
  g.fillStyle(SKIN, 1).fillCircle(cx, hy, 6);

  // Hair, shaped per facing so the direction is readable at a glance.
  g.fillStyle(pal.hair, 1);
  if (dir === 'up') {
    g.fillCircle(cx, hy, 7);
    g.fillStyle(shade(pal.hair, 0.22), 1).fillCircle(cx - 2, hy - 2, 3);
  } else {
    g.fillRect(cx - 7, hy - 8, 14, 5);                    // fringe
    g.fillCircle(cx, hy - 3, 7);
    if (dir === 'left') g.fillRect(cx - 8, hy - 4, 5, 7);
    if (dir === 'right') g.fillRect(cx + 3, hy - 4, 5, 7);
    g.fillStyle(shade(pal.hair, 0.25), 1).fillRect(cx - 5, hy - 7, 5, 2);
  }

  // Eyes. Facing away, there are none to draw.
  if (dir !== 'up') {
    g.fillStyle(0xffffff, 1);
    g.fillStyle(0x241f2b, 1);
    if (dir === 'left') {
      g.fillRect(cx - 5, hy, 2, 3);
    } else if (dir === 'right') {
      g.fillRect(cx + 3, hy, 2, 3);
    } else {
      g.fillRect(cx - 4, hy, 2, 3);
      g.fillRect(cx + 2, hy, 2, 3);
    }
  }
}

const PLAYER_PAL = {
  shirt: 0xd23b3b, pants: 0x2c3d57, shoes: 0x241f2b, hair: 0x3a2718,
};

// Build a 3x4 walk sheet (cols: step-left, idle, step-right; rows: the four
// facings) and slice it into indexed frames.
export function buildPlayerSheet(scene) {
  if (scene.textures.exists('player')) return;
  const t = T();
  const cols = 3, rows = 4;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const dirs = ['down', 'left', 'right', 'up'];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      drawPerson(g, c * t, r * t, t, dirs[r], c - 1, PLAYER_PAL);
    }
  }
  g.generateTexture('player', t * cols, t * rows);
  g.destroy();

  const tex = scene.textures.get('player');
  let frame = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tex.add(frame++, 0, c * t, r * t, t, t);
    }
  }
}

// NPCs and trainers: one standing frame per facing, in their own colours.
// Hair colour is derived from the shirt so nobody comes out looking like a
// palette swap of the player.
export function buildPerson(scene, key, color) {
  if (scene.textures.exists(key)) return;
  const t = T();
  const dirs = ['down', 'left', 'right', 'up'];
  const pal = {
    shirt: color,
    pants: shade(color, -0.55),
    shoes: 0x241f2b,
    hair: shade(color, -0.72),
  };
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  dirs.forEach((dir, i) => drawPerson(g, i * t, 0, t, dir, 0, pal));
  g.generateTexture(key, t * dirs.length, t);
  g.destroy();

  const tex = scene.textures.get(key);
  dirs.forEach((_, i) => tex.add(i, 0, i * t, 0, t, t));
}

// The "!" a trainer pops when it spots you.
export function buildAlert(scene) {
  if (scene.textures.exists('alert')) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x1a1720, 1).fillRoundedRect(0, 0, 16, 20, 4);
  g.fillStyle(0xfff6d8, 1).fillRoundedRect(1, 1, 14, 17, 3);
  g.fillStyle(0xd23b3b, 1);
  g.fillRect(7, 4, 3, 7);
  g.fillRect(7, 13, 3, 3);
  g.fillStyle(0x1a1720, 1);                       // speech-bubble tail
  g.fillTriangle(5, 17, 11, 17, 7, 20);
  g.generateTexture('alert', 16, 20);
  g.destroy();
}

// --- monsters ------------------------------------------------------------

const MON = 48;

// Every monster is drawn the same way: a dark silhouette one pixel proud of
// the body, the body itself, a lit top and shaded underside, then eyes with a
// catchlight. That recipe is what makes a flat blob look like a creature.
function monBase(color) {
  return {
    dark: shade(color, -0.5),
    mid: color,
    lit: shade(color, 0.22),
    shadow: shade(color, -0.2),
  };
}

function monEyes(g, lx, rx, y, r = 3.4) {
  g.fillStyle(0xffffff, 1);
  g.fillCircle(lx, y, r);
  g.fillCircle(rx, y, r);
  g.fillStyle(0x1a1720, 1);
  g.fillCircle(lx, y + 0.5, r * 0.55);
  g.fillCircle(rx, y + 0.5, r * 0.55);
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(lx - r * 0.35, y - r * 0.4, r * 0.22);
  g.fillCircle(rx - r * 0.35, y - r * 0.4, r * 0.22);
}

function monShadow(g, cx, y, w) {
  g.fillStyle(0x000000, 0.2).fillEllipse(cx, y, w, w * 0.28);
}

// Round-bodied default, used by anything without its own silhouette.
function drawBlob(g, color, stage) {
  const c = monBase(color);
  const cx = MON / 2, cy = MON / 2 + 2;
  const r = stage > 1 ? 18 : 15;

  monShadow(g, cx, MON - 4, r * 2.1);
  g.fillStyle(c.dark, 1);
  g.fillCircle(cx - r * 0.8, cy + 2, r * 0.5);
  g.fillCircle(cx + r * 0.8, cy + 2, r * 0.5);
  g.fillCircle(cx, cy, r + 1);
  g.fillStyle(c.mid, 1);
  g.fillCircle(cx - r * 0.8, cy + 2, r * 0.42);
  g.fillCircle(cx + r * 0.8, cy + 2, r * 0.42);
  g.fillCircle(cx, cy, r);
  g.fillStyle(c.shadow, 1).fillEllipse(cx, cy + r * 0.55, r * 1.5, r * 0.8);
  g.fillStyle(c.mid, 1).fillCircle(cx, cy, r - 1);
  g.fillStyle(c.lit, 1).fillEllipse(cx - r * 0.3, cy - r * 0.45, r, r * 0.7);
  g.fillStyle(0xffffff, 0.3).fillEllipse(cx, cy + r * 0.5, r * 0.9, r * 0.5);

  monEyes(g, cx - r * 0.42, cx + r * 0.42, cy - r * 0.1, stage > 1 ? 4 : 3.4);
  g.fillStyle(0x1a1720, 1);
  g.fillEllipse(cx, cy + r * 0.42, 5, 2.5);        // mouth
  g.fillStyle(c.dark, 1);
  g.fillRect(cx - r * 0.7, MON - 8, 7, 6);         // feet
  g.fillRect(cx + r * 0.7 - 7, MON - 8, 7, 6);
}

// Four-legged prowler — the fire line. Ears, snout, and a flame-tipped tail.
function drawBeast(g, color, stage) {
  const c = monBase(color);
  const cx = MON / 2 + 1, cy = MON / 2 + 4;
  const bw = stage > 1 ? 26 : 22, bh = stage > 1 ? 16 : 14;

  monShadow(g, MON / 2, MON - 4, bw * 1.5);

  // Tail: a tapering curve that starts inside the body, so it reads as
  // attached rather than as a shape parked next to the animal.
  g.fillStyle(c.dark, 1);
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const tx = cx - bw * 0.45 - k * 8;
    const ty = cy - 2 - k * k * 9;
    g.fillCircle(tx, ty, 4.2 - k * 1.8);
  }
  g.fillStyle(c.mid, 1);
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    g.fillCircle(cx - bw * 0.45 - k * 8, cy - 3 - k * k * 9, 3.2 - k * 1.4);
  }
  const flx = cx - bw * 0.45 - 9, fly = cy - 13;     // flame at the tip
  g.fillStyle(0xd9541f, 1).fillCircle(flx, fly, 5);
  g.fillStyle(0xf5a623, 1).fillCircle(flx, fly - 1, 3.6);
  g.fillStyle(0xffe08a, 1).fillCircle(flx - 0.5, fly - 2, 1.8);

  // Legs start inside the body outline so there is no floating gap.
  g.fillStyle(c.dark, 1);
  for (const dx of [-bw * 0.36, -bw * 0.08, bw * 0.28, bw * 0.5]) {
    g.fillRect(cx + dx, cy + bh * 0.1, 5, 13);
    g.fillRect(cx + dx - 1, cy + bh * 0.1 + 11, 7, 3);   // paw
  }
  g.fillStyle(c.shadow, 1);
  for (const dx of [-bw * 0.36, bw * 0.28]) g.fillRect(cx + dx + 1, cy + bh * 0.1, 3, 11);

  g.fillStyle(c.dark, 1).fillEllipse(cx, cy, bw + 2, bh + 2);   // body
  g.fillStyle(c.mid, 1).fillEllipse(cx, cy, bw, bh);
  g.fillStyle(c.lit, 1).fillEllipse(cx - 2, cy - bh * 0.28, bw * 0.7, bh * 0.45);
  g.fillStyle(0xffffff, 0.22).fillEllipse(cx, cy + bh * 0.3, bw * 0.6, bh * 0.35);

  const hx = cx + bw * 0.62, hy = cy - bh * 0.5;     // head
  g.fillStyle(c.dark, 1);
  g.fillTriangle(hx - 6, hy - 6, hx - 2, hy - 15, hx + 1, hy - 5);   // ears
  g.fillTriangle(hx + 3, hy - 6, hx + 8, hy - 14, hx + 9, hy - 4);
  g.fillCircle(hx, hy, 10);
  g.fillStyle(0xffb4a2, 1);
  g.fillTriangle(hx - 4, hy - 7, hx - 2, hy - 12, hx, hy - 6);
  g.fillTriangle(hx + 4, hy - 7, hx + 7, hy - 11, hx + 8, hy - 6);
  g.fillStyle(c.mid, 1).fillCircle(hx, hy, 9);
  g.fillStyle(c.lit, 1).fillEllipse(hx - 1, hy - 4, 11, 6);
  if (stage > 1) {                                   // mane on the evolution
    g.fillStyle(0xf5a623, 1);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.62 + i * 0.13);
      g.fillTriangle(
        hx + Math.cos(a) * 7, hy + Math.sin(a) * 7,
        hx + Math.cos(a) * 17, hy + Math.sin(a) * 17,
        hx + Math.cos(a + 0.16) * 7, hy + Math.sin(a + 0.16) * 7,
      );
    }
    g.fillStyle(0xd9541f, 1);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.7 + i * 0.13);
      g.fillTriangle(
        hx + Math.cos(a) * 7, hy + Math.sin(a) * 7,
        hx + Math.cos(a) * 13, hy + Math.sin(a) * 13,
        hx + Math.cos(a + 0.12) * 7, hy + Math.sin(a + 0.12) * 7,
      );
    }
  }
  g.fillStyle(shade(color, -0.15), 1).fillEllipse(hx + 4, hy + 4, 11, 8);  // snout
  monEyes(g, hx - 3, hx + 6, hy - 1, 3);
  g.fillStyle(0x1a1720, 1).fillEllipse(hx + 8, hy + 3, 4, 3);              // nose
}

// Finned swimmer — the water line.
function drawAqua(g, color, stage) {
  const c = monBase(color);
  const cx = MON / 2 + 5, cy = MON / 2 + 2;
  const r = stage > 1 ? 17 : 14;

  monShadow(g, MON / 2, MON - 5, r * 2);

  g.fillStyle(c.dark, 1);                            // tail fin, rooted in the body
  g.fillTriangle(cx - r + 4, cy, cx - r - 12, cy - 11, cx - r - 11, cy + 10);
  g.fillStyle(shade(color, 0.12), 1);
  g.fillTriangle(cx - r + 4, cy, cx - r - 9, cy - 8, cx - r - 8, cy + 8);

  // Pectoral fin, behind the body and low, so it never crosses the face.
  g.fillStyle(c.dark, 1);
  g.fillTriangle(cx - 2, cy + r * 0.35, cx - 14, cy + r * 1.15, cx + 4, cy + r * 1.05);
  g.fillStyle(shade(color, 0.12), 1);
  g.fillTriangle(cx - 3, cy + r * 0.45, cx - 12, cy + r * 1.05, cx + 2, cy + r * 0.98);

  g.fillStyle(c.dark, 1).fillCircle(cx, cy, r + 1);  // body
  g.fillStyle(c.mid, 1).fillCircle(cx, cy, r);
  g.fillStyle(c.shadow, 1).fillEllipse(cx, cy + r * 0.5, r * 1.5, r * 0.8);
  g.fillStyle(c.mid, 1).fillCircle(cx, cy, r - 1);
  g.fillStyle(c.lit, 1).fillEllipse(cx - r * 0.3, cy - r * 0.4, r, r * 0.65);
  g.fillStyle(0xffffff, 0.35).fillEllipse(cx - r * 0.35, cy - r * 0.5, r * 0.5, r * 0.3);

  g.fillStyle(c.dark, 1);                            // dorsal fin
  g.fillTriangle(cx - 2, cy - r, cx + 6, cy - r - 9, cx + 8, cy - r + 2);
  g.fillStyle(shade(color, 0.16), 1);
  g.fillTriangle(cx - 1, cy - r + 1, cx + 5, cy - r - 6, cx + 6, cy - r + 2);

  monEyes(g, cx + r * 0.15, cx + r * 0.72, cy - r * 0.15, stage > 1 ? 3.6 : 3.2);
  g.fillStyle(0x1a1720, 1).fillEllipse(cx + r * 0.55, cy + r * 0.42, 5, 2.5);
  if (stage > 1) {                                   // crest
    g.fillStyle(0x9fe8ff, 1);
    g.fillTriangle(cx - 6, cy - r + 1, cx - 2, cy - r - 8, cx + 1, cy - r + 1);
  }
}

// Bulb with leaves — the grass line.
function drawLeaf(g, color, stage) {
  const c = monBase(color);
  const cx = MON / 2, cy = MON / 2 + 5;
  const r = stage > 1 ? 17 : 14;

  monShadow(g, cx, MON - 4, r * 2.1);

  const leaf = (dx, dy, w, h, rot) => {              // leaves behind the body
    g.fillStyle(0x1d5c28, 1);
    g.save(); g.translateCanvas(cx + dx, cy + dy); g.rotateCanvas(rot);
    g.fillEllipse(0, 0, w + 2, h + 2);
    g.fillStyle(0x3fa34d, 1); g.fillEllipse(0, 0, w, h);
    g.fillStyle(0x66c96f, 1); g.fillEllipse(-w * 0.1, -h * 0.15, w * 0.5, h * 0.4);
    g.restore();
  };
  leaf(-r * 0.9, -r * 0.9, 18, 9, -0.9);
  leaf(r * 0.9, -r * 0.9, 18, 9, 0.9);
  if (stage > 1) leaf(0, -r * 1.35, 16, 8, 0);

  g.fillStyle(c.dark, 1);                            // feet
  g.fillEllipse(cx - r * 0.6, MON - 6, 11, 7);
  g.fillEllipse(cx + r * 0.6, MON - 6, 11, 7);
  g.fillStyle(c.mid, 1);
  g.fillEllipse(cx - r * 0.6, MON - 7, 9, 5);
  g.fillEllipse(cx + r * 0.6, MON - 7, 9, 5);

  g.fillStyle(c.dark, 1).fillCircle(cx, cy, r + 1);  // body
  g.fillStyle(c.mid, 1).fillCircle(cx, cy, r);
  g.fillStyle(c.shadow, 1).fillEllipse(cx, cy + r * 0.5, r * 1.5, r * 0.8);
  g.fillStyle(c.mid, 1).fillCircle(cx, cy, r - 1);
  g.fillStyle(c.lit, 1).fillEllipse(cx - r * 0.3, cy - r * 0.4, r, r * 0.65);
  g.fillStyle(0xd8f0a8, 0.45).fillEllipse(cx, cy + r * 0.45, r * 0.9, r * 0.5);

  monEyes(g, cx - r * 0.4, cx + r * 0.4, cy - r * 0.1, stage > 1 ? 3.8 : 3.3);
  g.fillStyle(0x1a1720, 1);                          // small smile
  g.fillRect(cx - 3, cy + r * 0.44, 6, 1);
  g.fillRect(cx - 4, cy + r * 0.44 - 1, 1, 1);
  g.fillRect(cx + 3, cy + r * 0.44 - 1, 1, 1);
  g.fillStyle(0x8fdc6a, 1).fillRect(cx - 1, cy - r - 5, 2, 6);      // sprout
}

// Round sparker with a bolt tail — electric.
function drawSpark(g, color, stage) {
  const c = monBase(color);
  const cx = MON / 2 + 4, cy = MON / 2 + 3;
  const r = stage > 1 ? 16 : 13;

  monShadow(g, cx, MON - 5, r * 2);

  g.fillStyle(0x8a6d12, 1);                          // bolt tail, rooted in the body
  g.fillTriangle(cx - r + 3, cy - 1, cx - r - 12, cy - 13, cx - r - 2, cy + 1);
  g.fillTriangle(cx - r - 6, cy - 4, cx - r - 15, cy + 7, cx - r - 1, cy + 3);
  g.fillStyle(0xf7e06a, 1);
  g.fillTriangle(cx - r + 3, cy - 2, cx - r - 10, cy - 11, cx - r - 3, cy);
  g.fillTriangle(cx - r - 5, cy - 3, cx - r - 13, cy + 5, cx - r - 2, cy + 2);

  g.fillStyle(c.dark, 1);                            // ears
  g.fillTriangle(cx - 10, cy - r + 2, cx - 6, cy - r - 12, cx - 1, cy - r + 1);
  g.fillTriangle(cx + 2, cy - r + 1, cx + 8, cy - r - 11, cx + 11, cy - r + 3);
  g.fillStyle(c.mid, 1);
  g.fillTriangle(cx - 9, cy - r + 1, cx - 6, cy - r - 9, cx - 2, cy - r);
  g.fillTriangle(cx + 3, cy - r, cx + 7, cy - r - 8, cx + 10, cy - r + 2);
  g.fillStyle(0x2b2418, 1);                          // dark ear tips
  g.fillTriangle(cx - 7, cy - r - 5, cx - 6, cy - r - 10, cx - 4, cy - r - 5);
  g.fillTriangle(cx + 5, cy - r - 4, cx + 7, cy - r - 9, cx + 9, cy - r - 3);

  g.fillStyle(c.dark, 1).fillCircle(cx, cy, r + 1);  // body
  g.fillStyle(c.mid, 1).fillCircle(cx, cy, r);
  g.fillStyle(c.shadow, 1).fillEllipse(cx, cy + r * 0.5, r * 1.5, r * 0.75);
  g.fillStyle(c.mid, 1).fillCircle(cx, cy, r - 1);
  g.fillStyle(c.lit, 1).fillEllipse(cx - r * 0.3, cy - r * 0.4, r, r * 0.6);

  g.fillStyle(0xe06a4a, 0.85);                       // cheek sparks
  g.fillCircle(cx - r * 0.75, cy + 2, 3);
  g.fillCircle(cx + r * 0.75, cy + 2, 3);
  monEyes(g, cx - r * 0.36, cx + r * 0.36, cy - r * 0.15, 3.2);
  g.fillStyle(0x1a1720, 1);
  g.fillTriangle(cx - 3, cy + r * 0.35, cx + 3, cy + r * 0.35, cx, cy + r * 0.62);

  g.fillStyle(c.dark, 1);                            // feet
  g.fillEllipse(cx - r * 0.55, MON - 6, 10, 6);
  g.fillEllipse(cx + r * 0.55, MON - 6, 10, 6);
}

// Winged flyer.
function drawBird(g, color, stage) {
  const c = monBase(color);
  const cx = MON / 2 + 3, cy = MON / 2 + 2;
  const r = stage > 1 ? 15 : 12;

  monShadow(g, cx, MON - 4, r * 2.3);

  g.fillStyle(c.dark, 1);                            // tail feathers
  g.fillTriangle(cx - r, cy + 2, cx - r - 13, cy - 4, cx - r - 11, cy + 9);
  g.fillStyle(shade(color, -0.28), 1);
  g.fillTriangle(cx - r, cy + 2, cx - r - 10, cy - 2, cx - r - 9, cy + 7);

  g.fillStyle(c.dark, 1).fillEllipse(cx, cy, r * 2 + 2, r * 1.7 + 2);  // body
  g.fillStyle(c.mid, 1).fillEllipse(cx, cy, r * 2, r * 1.7);
  g.fillStyle(0xf7f2e4, 0.85).fillEllipse(cx + 2, cy + r * 0.45, r * 1.1, r * 0.8);

  g.fillStyle(c.dark, 1);                            // wing
  g.fillEllipse(cx - 3, cy - 1, r * 1.5, r * 1.0);
  g.fillStyle(shade(color, 0.12), 1);
  g.fillEllipse(cx - 3, cy - 2, r * 1.3, r * 0.85);
  g.fillStyle(shade(color, -0.3), 1);
  for (let i = 0; i < 3; i++) g.fillRect(cx - 10 + i * 5, cy + 1, 4, 1);

  const hx = cx + r * 0.85, hy = cy - r * 0.85;      // head
  g.fillStyle(c.dark, 1).fillCircle(hx, hy, 9);
  g.fillStyle(c.mid, 1).fillCircle(hx, hy, 8);
  g.fillStyle(c.lit, 1).fillEllipse(hx - 1, hy - 3, 9, 5);
  if (stage > 1) {                                   // crest
    g.fillStyle(shade(color, 0.3), 1);
    g.fillTriangle(hx - 2, hy - 7, hx + 2, hy - 16, hx + 5, hy - 6);
  }
  g.fillStyle(0xf5a623, 1);                          // beak
  g.fillTriangle(hx + 5, hy - 1, hx + 15, hy + 2, hx + 5, hy + 5);
  g.fillStyle(0xd88a12, 1).fillTriangle(hx + 5, hy + 2, hx + 13, hy + 2, hx + 5, hy + 5);
  monEyes(g, hx - 1, hx + 4, hy - 1, 2.8);

  g.fillStyle(0xd88a12, 1);                          // legs, tucked under the body
  g.fillRect(cx - 4, cy + r * 1.2, 3, 4);
  g.fillRect(cx + 3, cy + r * 1.2, 3, 4);
  g.fillStyle(0xf5a623, 1);                          // toes
  g.fillRect(cx - 6, cy + r * 1.2 + 3, 7, 2);
  g.fillRect(cx + 1, cy + r * 1.2 + 3, 7, 2);
}

// Boulder with a face — the cave dweller.
function drawRock(g, color, stage) {
  const c = monBase(color);
  const cx = MON / 2, cy = MON / 2 + 4;
  const r = stage > 1 ? 18 : 16;

  monShadow(g, cx, MON - 4, r * 2.2);

  // Faceted body: a polygon rather than a circle, so it reads as stone.
  const pts = [
    [-r, 2], [-r * 0.7, -r * 0.7], [0, -r], [r * 0.72, -r * 0.66],
    [r, 4], [r * 0.6, r * 0.75], [-r * 0.62, r * 0.78],
  ];
  const poly = (scale, color2) => {
    g.fillStyle(color2, 1);
    g.beginPath();
    pts.forEach(([dx, dy], i) => {
      const x = cx + dx * scale, y = cy + dy * scale;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    });
    g.closePath(); g.fillPath();
  };
  poly(1.06, c.dark);
  poly(1, c.mid);

  g.fillStyle(c.lit, 1);                             // lit facet
  g.beginPath();
  g.moveTo(cx - r * 0.7, cy - r * 0.7);
  g.lineTo(cx, cy - r);
  g.lineTo(cx + r * 0.2, cy - r * 0.2);
  g.lineTo(cx - r * 0.55, cy - r * 0.1);
  g.closePath(); g.fillPath();
  g.fillStyle(c.shadow, 1);                          // shaded facet
  g.beginPath();
  g.moveTo(cx + r * 0.2, cy + r * 0.1);
  g.lineTo(cx + r, cy + 4);
  g.lineTo(cx + r * 0.6, cy + r * 0.75);
  g.lineTo(cx - r * 0.1, cy + r * 0.7);
  g.closePath(); g.fillPath();

  g.fillStyle(shade(color, -0.35), 1);               // cracks
  g.fillRect(cx - r * 0.5, cy + 2, 8, 1);
  g.fillRect(cx + 2, cy - r * 0.55, 1, 6);
  if (stage > 1) {
    g.fillStyle(0x9dc4e0, 1);                        // crystal growths
    g.fillTriangle(cx - r * 0.8, cy - r * 0.5, cx - r * 0.6, cy - r - 4, cx - r * 0.3, cy - r * 0.45);
  }

  monEyes(g, cx - r * 0.36, cx + r * 0.36, cy - r * 0.1, 3.2);
  g.fillStyle(0x1a1720, 1).fillRect(cx - 4, cy + r * 0.4, 8, 2);    // grim mouth
}

// A sheep: fluffy cloud-shaped fleece with a dark face, ears and hooves.
// Drawn as overlapping circles so the wool reads as wool at 48px.
function drawSheep(g, color, stage) {
  const S = MON;
  monShadow(g, S / 2, S - 4, 38);

  g.fillStyle(0x4a3b2a, 1);                          // legs
  g.fillRect(S / 2 - 12, S - 12, 5, 10);
  g.fillRect(S / 2 + 7, S - 12, 5, 10);
  g.fillStyle(0x2f2418, 1);                          // hooves
  g.fillRect(S / 2 - 12, S - 4, 5, 2);
  g.fillRect(S / 2 + 7, S - 4, 5, 2);

  const puffs = stage > 2
    ? [[-15, 2, 9], [-9, -8, 9], [0, -11, 10], [9, -8, 9], [15, 2, 9],
       [-10, 9, 9], [0, 11, 9], [10, 9, 9]]
    : [[-13, 2, 8], [-8, -6, 8], [0, -9, 9], [8, -6, 8], [13, 2, 8],
       [-9, 8, 8], [0, 10, 8], [9, 8, 8]];

  g.fillStyle(shade(color, -0.42), 1);               // fleece outline
  for (const [dx, dy, r] of puffs) g.fillCircle(S / 2 + dx, S / 2 + dy, r + 1.5);
  g.fillCircle(S / 2, S / 2, 14.5);

  g.fillStyle(color, 1);
  for (const [dx, dy, r] of puffs) g.fillCircle(S / 2 + dx, S / 2 + dy, r);
  g.fillCircle(S / 2, S / 2, 13);

  g.fillStyle(shade(color, -0.14), 1);               // underside shading
  for (const [dx, dy, r] of puffs) {
    if (dy > 4) g.fillCircle(S / 2 + dx, S / 2 + dy + 2, r * 0.8);
  }
  g.fillStyle(shade(color, 0.35), 1);                // top light
  for (const [dx, dy, r] of puffs) {
    if (dy < -3) g.fillCircle(S / 2 + dx - 1, S / 2 + dy - 2, r * 0.55);
  }

  const fx = S / 2 + 12, fy = S / 2 + 1;             // face, turned to camera
  g.fillStyle(0x2f2820, 1);
  g.fillEllipse(fx - 6, fy - 9, 8, 6);               // ears
  g.fillEllipse(fx + 5, fy - 8, 8, 6);
  g.fillStyle(0x3a3028, 1).fillEllipse(fx, fy, 18, 16);
  g.fillStyle(0x54473a, 1).fillEllipse(fx, fy - 1, 16, 14);
  g.fillStyle(0x67584a, 1).fillEllipse(fx - 1, fy - 4, 11, 6);

  monEyes(g, fx - 3, fx + 4, fy - 2, 3);

  if (stage > 2) {                                   // ram horns, above the eyes
    for (const side of [-1, 1]) {
      const hxp = fx + side * 10, hyp = fy - 10;
      g.fillStyle(0x8f7d55, 1).fillCircle(hxp, hyp, 5.5);
      g.fillStyle(0xd8c69a, 1).fillCircle(hxp, hyp, 4.5);
      g.fillStyle(0x8f7d55, 1).fillCircle(hxp + side * 1.5, hyp + 1, 2.4);
      g.fillStyle(0xefe0bb, 1).fillCircle(hxp - 1, hyp - 2, 1.6);
    }
  }
  g.fillStyle(0x241d18, 1).fillEllipse(fx + 1, fy + 5, 7, 4);       // nose
  g.fillStyle(0x3a2f26, 1).fillRect(fx - 2, fy + 7, 6, 1);          // mouth
}

const SHAPES = {
  blob: drawBlob,
  beast: drawBeast,
  aqua: drawAqua,
  leaf: drawLeaf,
  spark: drawSpark,
  bird: drawBird,
  rock: drawRock,
  sheep: drawSheep,
};

// One texture per species, built lazily the first time it appears.
export function buildMonster(scene, key, color, shape = 'blob', stage = 1) {
  if (scene.textures.exists(key)) return;
  const draw = SHAPES[shape] || drawBlob;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  draw(g, color, stage);
  g.generateTexture(key, MON, MON);
  g.destroy();
}

// The capture device: red top, white bottom, dark band and button.
export function buildBall(scene) {
  if (scene.textures.exists('ball')) return;
  const S = 16;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x1a1720, 1).fillCircle(S / 2, S / 2, 8);
  g.fillStyle(0xd23b3b, 1).slice(S / 2, S / 2, 7, Math.PI, 0, false).fillPath();
  g.fillStyle(0xf2f2f2, 1).slice(S / 2, S / 2, 7, 0, Math.PI, false).fillPath();
  g.fillStyle(0xe8695f, 1).slice(S / 2, S / 2 - 1, 5, Math.PI * 1.15, Math.PI * 1.6, false).fillPath();
  g.fillStyle(0x1c1c1c, 1).fillRect(S / 2 - 7, S / 2 - 1, 14, 2);
  g.fillStyle(0x1c1c1c, 1).fillCircle(S / 2, S / 2, 3);
  g.fillStyle(0xdddddd, 1).fillCircle(S / 2, S / 2, 2);
  g.fillStyle(0xffffff, 0.8).fillCircle(S / 2 - 2.5, S / 2 - 3.5, 1.5);
  g.generateTexture('ball', S, S);
  g.destroy();
}

// --- battle backdrop -----------------------------------------------------

// A layered scene instead of two flat rectangles: banded sky, distant hills,
// a treeline, textured turf, and a lit platform for each combatant to stand
// on. Built once per size and reused.
export function buildBattleBackdrop(scene, w, h) {
  if (scene.textures.exists('battle_bg')) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const horizon = Math.round(h * 0.58);

  // Sky: banded gradient (Graphics gradients don't survive generateTexture,
  // and bands suit the era anyway).
  const skyTop = 0x6fa8dc, skyLow = 0xcfe6f5;
  for (let y = 0; y < horizon; y++) {
    const k = y / horizon;
    const col = (
      (Math.round(((skyTop >> 16) & 0xff) + (((skyLow >> 16) & 0xff) - ((skyTop >> 16) & 0xff)) * k) << 16) |
      (Math.round(((skyTop >> 8) & 0xff) + (((skyLow >> 8) & 0xff) - ((skyTop >> 8) & 0xff)) * k) << 8) |
      Math.round((skyTop & 0xff) + ((skyLow & 0xff) - (skyTop & 0xff)) * k)
    );
    g.fillStyle(col, 1).fillRect(0, y, w, 1);
  }

  // Clouds.
  const rand = rng(31337);
  for (let i = 0; i < 5; i++) {
    const cxp = rand() * w, cyp = 12 + rand() * (horizon * 0.5);
    const s = 0.7 + rand() * 0.8;
    g.fillStyle(0xffffff, 0.75);
    g.fillEllipse(cxp, cyp, 34 * s, 12 * s);
    g.fillEllipse(cxp - 12 * s, cyp + 3 * s, 22 * s, 9 * s);
    g.fillEllipse(cxp + 13 * s, cyp + 3 * s, 24 * s, 9 * s);
  }

  // Distant hills, two ranges for depth.
  g.fillStyle(0x7fae86, 1);
  for (let x = -20; x < w + 40; x += 70) g.fillEllipse(x, horizon + 4, 130, 60);
  g.fillStyle(0x5f9468, 1);
  for (let x = -50; x < w + 40; x += 90) g.fillEllipse(x, horizon + 12, 150, 56);

  // Treeline along the horizon.
  for (let x = -6; x < w + 10; x += 13) {
    const th = 10 + Math.floor(rand() * 8);
    g.fillStyle(0x2f6b39, 1).fillTriangle(x, horizon + 2, x + 7, horizon - th, x + 14, horizon + 2);
    g.fillStyle(0x3f8447, 1).fillTriangle(x + 3, horizon + 2, x + 7, horizon - th + 4, x + 11, horizon + 2);
  }

  // Turf.
  const turf = 0x63b155;
  g.fillStyle(turf, 1).fillRect(0, horizon, w, h - horizon);
  g.fillStyle(shade(turf, 0.12), 1).fillRect(0, horizon, w, 2);
  for (let i = 0; i < 260; i++) {
    const x = rand() * w, y = horizon + rand() * (h - horizon);
    const k = (y - horizon) / (h - horizon);
    g.fillStyle(shade(turf, (rand() < 0.5 ? -1 : 1) * (0.08 + k * 0.12)), 1);
    g.fillRect(x, y, 2, 1 + Math.floor(rand() * 2));
  }
  // Ground darkens toward the bottom, which pushes the player's side forward.
  for (let y = horizon; y < h; y++) {
    const k = (y - horizon) / (h - horizon);
    g.fillStyle(0x1d3a1f, 0.16 * k).fillRect(0, y, w, 1);
  }

  g.generateTexture('battle_bg', w, h);
  g.destroy();
}

// The disc a combatant stands on. Drawn separately so both sides can share it
// at different scales.
export function buildPlatform(scene) {
  if (scene.textures.exists('platform')) return;
  const W = 120, H = 40;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x000000, 0.18).fillEllipse(W / 2, H / 2 + 3, W - 6, H - 10);
  g.fillStyle(0x4f9448, 1).fillEllipse(W / 2, H / 2, W - 8, H - 12);
  g.fillStyle(0x6cbb5e, 1).fillEllipse(W / 2, H / 2 - 2, W - 16, H - 20);
  g.fillStyle(0x87d16f, 0.6).fillEllipse(W / 2 - 8, H / 2 - 5, W * 0.4, H * 0.25);
  g.generateTexture('platform', W, H);
  g.destroy();
}
