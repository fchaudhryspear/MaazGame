// =========================================================================
//  ASSET FACTORY
//  Generates every texture at runtime, so the game ships with no image
//  files. Each function writes a texture under a key; the rest of the game
//  only ever refers to keys, so swapping in real pixel art later means
//  replacing this module and nothing else.
// =========================================================================
import { CONFIG } from './config.js';

// --- tiles ---------------------------------------------------------------

function makeTile(scene, key, fill, border) {
  const t = CONFIG.TILE;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(fill, 1).fillRect(0, 0, t, t);
  g.lineStyle(1, border, 0.6).strokeRect(0.5, 0.5, t - 1, t - 1);
  g.generateTexture(key, t, t);
  g.destroy();
}

function makeTree(scene, key) {
  const t = CONFIG.TILE;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x2f7d3a, 1).fillRect(0, 0, t, t);
  g.fillStyle(0x6b4a2b, 1).fillRect(t / 2 - 3, t - 10, 6, 10);       // trunk
  g.fillStyle(0x1f5c2a, 1).fillCircle(t / 2, t / 2 - 2, t / 2 - 3);  // canopy
  g.fillStyle(0x2a7a38, 1).fillCircle(t / 2 - 4, t / 2 - 5, 6);      // highlight
  g.generateTexture(key, t, t);
  g.destroy();
}

function makeTallGrass(scene, key) {
  const t = CONFIG.TILE;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x3fa34d, 1).fillRect(0, 0, t, t);
  g.lineStyle(2, 0x2c6d37, 1);
  for (let x = 4; x < t; x += 6) {
    g.beginPath();
    g.moveTo(x, t);
    g.lineTo(x - 2, t - 12);
    g.strokePath();
  }
  g.generateTexture(key, t, t);
  g.destroy();
}

function makeSign(scene, key) {
  const t = CONFIG.TILE;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x54b35a, 1).fillRect(0, 0, t, t);          // grass base
  g.fillStyle(0x6b4a2b, 1).fillRect(t / 2 - 2, t - 12, 4, 12); // post
  g.fillStyle(0xc9a227, 1).fillRect(4, 6, t - 8, 14);     // board
  g.lineStyle(1, 0x7a6118, 1).strokeRect(4.5, 6.5, t - 9, 13);
  g.fillStyle(0x5c4a12, 1);
  g.fillRect(7, 10, t - 14, 2);
  g.fillRect(7, 15, t - 18, 2);
  g.generateTexture(key, t, t);
  g.destroy();
}

// The healing floor reads as an indoor tile so the spot is obvious.
function makeFloor(scene, key) {
  const t = CONFIG.TILE;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xe8d7b5, 1).fillRect(0, 0, t, t);
  g.lineStyle(1, 0xcbb692, 1).strokeRect(0.5, 0.5, t - 1, t - 1);
  g.fillStyle(0xd9c39a, 1).fillRect(t / 2, 0, t / 2, t / 2);
  g.fillStyle(0xd9c39a, 1).fillRect(0, t / 2, t / 2, t / 2);
  g.generateTexture(key, t, t);
  g.destroy();
}

export function buildTiles(scene) {
  makeTile(scene, 'tile_path',  0xcdae7a, 0xb89a68);
  makeTile(scene, 'tile_grass', 0x54b35a, 0x469a4c);
  makeTallGrass(scene, 'tile_tall');
  makeTree(scene, 'tile_tree');
  makeTile(scene, 'tile_wall',  0x8a8f99, 0x5f636b);
  makeTile(scene, 'tile_water', 0x3d7bd6, 0x2f61ab);
  makeFloor(scene, 'tile_floor');
  makeSign(scene, 'tile_sign');
}

// --- player --------------------------------------------------------------

// Draw one character frame into `g` at offset (ox,oy).
function drawChar(g, ox, oy, t, dir, legPhase) {
  const cx = ox + t / 2;
  const bodyTop = oy + 12;
  const bodyBot = oy + t - 4;

  // Legs swing with legPhase to sell the walk cycle.
  g.fillStyle(0x27364a, 1);
  const swing = legPhase * 3;
  g.fillRect(cx - 5 + swing, bodyBot - 6, 4, 6);
  g.fillRect(cx + 1 - swing, bodyBot - 6, 4, 6);

  g.fillStyle(0xd23b3b, 1);
  g.fillRect(cx - 6, bodyTop, 12, bodyBot - bodyTop - 4);   // torso

  g.fillStyle(0xf0c98a, 1);
  g.fillCircle(cx, bodyTop - 2, 6);                          // head

  // Hair/cap, nudged to hint the facing direction.
  g.fillStyle(0x3a2a1a, 1);
  if (dir === 'up') g.fillCircle(cx, bodyTop - 2, 6);
  else if (dir === 'down') g.fillRect(cx - 6, bodyTop - 8, 12, 4);
  else if (dir === 'left') g.fillRect(cx - 6, bodyTop - 8, 8, 4);
  else if (dir === 'right') g.fillRect(cx - 2, bodyTop - 8, 8, 4);

  if (dir !== 'up') {
    g.fillStyle(0x1a1a1a, 1);
    if (dir === 'left') g.fillRect(cx - 4, bodyTop - 3, 2, 2);
    else if (dir === 'right') g.fillRect(cx + 2, bodyTop - 3, 2, 2);
    else { g.fillRect(cx - 4, bodyTop - 3, 2, 2); g.fillRect(cx + 2, bodyTop - 3, 2, 2); }
  }
}

// Build a 3x4 walk sheet (cols: step-left, idle, step-right; rows: the four
// facings) and slice it into indexed frames.
export function buildPlayerSheet(scene) {
  const t = CONFIG.TILE;
  const cols = 3, rows = 4;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const dirs = ['down', 'left', 'right', 'up'];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      drawChar(g, c * t, r * t, t, dirs[r], c - 1);
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

// --- battle --------------------------------------------------------------

// A placeholder battle monster: a coloured blob with eyes and feet.
// One texture per species colour, built lazily.
export function buildMonster(scene, key, color) {
  if (scene.textures.exists(key)) return;
  const S = 48;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(color, 1);
  g.fillCircle(S / 2 - 11, S / 2, 8);      // limbs
  g.fillCircle(S / 2 + 11, S / 2, 8);
  g.fillCircle(S / 2, S / 2 + 3, 16);      // body
  g.fillStyle(0xffffff, 0.28);
  g.fillCircle(S / 2, S / 2 + 7, 9);       // belly
  g.fillStyle(0xffffff, 1);
  g.fillCircle(S / 2 - 6, S / 2 + 1, 4);   // eye whites
  g.fillCircle(S / 2 + 6, S / 2 + 1, 4);
  g.fillStyle(0x111111, 1);
  g.fillCircle(S / 2 - 6, S / 2 + 2, 2);   // pupils
  g.fillCircle(S / 2 + 6, S / 2 + 2, 2);
  g.fillStyle(0x1c1c1c, 1);
  g.fillRect(S / 2 - 11, S - 8, 7, 6);     // feet
  g.fillRect(S / 2 + 4, S - 8, 7, 6);
  g.generateTexture(key, S, S);
  g.destroy();
}

// The capture device: red top, white bottom, dark band and button.
export function buildBall(scene) {
  if (scene.textures.exists('ball')) return;
  const S = 16;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xd23b3b, 1).slice(S / 2, S / 2, 7, Math.PI, 0, false).fillPath();
  g.fillStyle(0xf2f2f2, 1).slice(S / 2, S / 2, 7, 0, Math.PI, false).fillPath();
  g.fillStyle(0x1c1c1c, 1).fillRect(S / 2 - 7, S / 2 - 1, 14, 2);
  g.fillStyle(0xdddddd, 1).fillCircle(S / 2, S / 2, 2.5);
  g.fillStyle(0x1c1c1c, 1).lineStyle(1, 0x1c1c1c, 1).strokeCircle(S / 2, S / 2, 2.5);
  g.generateTexture('ball', S, S);
  g.destroy();
}
