// =========================================================================
//  TILE DICTIONARY + MAP DATA
//  The meaning of every integer used in the map arrays, and the world itself.
// =========================================================================

// `walkable: false` feeds the collision matrix. `encounter: true` flags tall
// grass, which the encounter system watches.
export const TILES = Object.freeze({
  0: { key: 'tile_path',  walkable: true,  encounter: false },
  1: { key: 'tile_grass', walkable: true,  encounter: false },
  2: { key: 'tile_tall',  walkable: true,  encounter: true  }, // tall grass
  3: { key: 'tile_tree',  walkable: false, encounter: false },
  4: { key: 'tile_wall',  walkable: false, encounter: false },
  5: { key: 'tile_water', walkable: false, encounter: false },
  6: { key: 'tile_floor', walkable: true,  encounter: false }, // building floor
  7: { key: 'tile_sign',  walkable: false, encounter: false }, // readable
});

// The world as arrays of tile indices: map[row][col] -> tile id.
//
// GROUND draws first (always present). DECOR draws on top and uses -1 for
// "no tile here". Collision is derived from BOTH layers: a tile is blocked
// if ground OR decor is non-walkable.
export const MAP = {
  cols: 20,
  rows: 15,
  ground: [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,1,1,1,1],
    [1,0,6,6,6,6,1,0,1,1,1,1,2,2,2,2,1,1,1,1],
    [1,0,6,6,6,6,1,0,1,1,1,1,2,2,2,2,2,2,1,1],
    [1,0,6,6,6,6,1,0,0,0,0,0,2,2,2,2,2,2,1,1],
    [1,0,1,1,0,1,1,1,1,1,1,0,1,1,2,2,2,2,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,5,5,5,1,1,1,0,0,0,0,1,1,1,1,1,1,1],
    [1,1,1,5,5,5,1,1,1,1,1,1,0,1,1,1,1,1,1,1],
    [1,1,1,5,5,5,1,1,1,1,1,1,0,0,0,0,0,1,1,1],
    [1,1,1,1,1,1,1,1,2,2,2,1,1,1,1,1,0,1,1,1],
    [1,1,1,1,1,1,1,1,2,2,2,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  decor: [
    [ 3, 3,-1,-1,-1,-1,-1, 3, 3, 3,-1,-1,-1,-1,-1,-1, 3, 3, 3, 3],
    [ 3,-1,-1,-1,-1,-1,-1,-1,-1, 3,-1,-1,-1,-1,-1,-1,-1,-1,-1, 3],
    [-1,-1, 4, 4, 4, 4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 3],
    [-1,-1, 4,-1,-1, 4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1, 4,-1,-1, 4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1, 7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 3],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 3],
    [ 3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 4, 4, 4, 4,-1,-1, 3],
    [ 3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 4,-1,-1, 4,-1,-1,-1],
    [ 3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 4,-1,-1, 4,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 4,-1,-1, 4,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 3],
    [ 3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 3],
    [ 3, 3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 3, 3],
    [ 3, 3, 3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 3, 3, 3, 3],
  ],
  spawn: { col: 3, row: 6 },
};

// Tiles the player can face and interact with (A button / tap-to-talk).
// Keyed by "col,row" so lookup during interaction is O(1).
export const SIGNS = Object.freeze({
  '1,5': 'MAAZ TOWN\nTall grass to the east.\nWatch your step!',
  '3,4': 'A cosy healing spot.\nYour party is restored.',
});

// Standing on one of these fully heals the party (a stand-in for a Pokécentre).
export const HEAL_TILES = Object.freeze(['3,3', '4,3']);
