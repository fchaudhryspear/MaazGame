// =========================================================================
//  GLOBAL CONFIG — one place to tune the whole game.
// =========================================================================

export const CONFIG = Object.freeze({
  TILE: 32,            // logical tile size in pixels
  MOVE_MS: 180,        // ms per one-tile step tween (lower = faster walk)
  RUN_MS: 110,         // ms per step while running (hold the B / Shift key)

  // Internal render resolution. The Scale Manager stretches this to fit the
  // iPad screen while keeping pixels crisp. A whole number of tiles.
  VIEW_COLS: 15,       // visible columns  -> 15 * 32 = 480 px
  VIEW_ROWS: 11,       // visible rows     -> 11 * 32 = 352 px

  // Encounter tuning.
  ENCOUNTER_CHANCE: 0.12, // per-step probability once past the grace period
  ENCOUNTER_MIN_STEPS: 2, // grace steps in grass before rolls can trigger

  PARTY_MAX: 6,        // monsters carried at once
  SAVE_KEY: 'maazgame.save.v1',
});

export const VIEW_W = CONFIG.VIEW_COLS * CONFIG.TILE; // 480
export const VIEW_H = CONFIG.VIEW_ROWS * CONFIG.TILE; // 352

// Directions as {dx,dy} deltas. Diagonals are intentionally absent — the grid
// mover only accepts these four, which is what enforces 4-way movement.
export const DIR = Object.freeze({
  up:    { dx:  0, dy: -1 },
  down:  { dx:  0, dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 },
});

// Frame layout of the generated player sheet (3 cols x 4 rows).
// Sheet frame index = row * 3 + col.
export const ANIMS = Object.freeze({
  down:  { row: 0 },
  left:  { row: 1 },
  right: { row: 2 },
  up:    { row: 3 },
});

// Shared UI palette so panels/menus look consistent across scenes.
export const UI = Object.freeze({
  panelFill: 0x10131a,
  panelAlpha: 0.94,
  panelStroke: 0xffffff,
  btnFill: 0x1b2a3a,
  btnFillActive: 0x2f4a63,
  font: 'monospace',
});
