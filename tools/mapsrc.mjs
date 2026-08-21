// =========================================================================
//  MAP SOURCE — human-editable ASCII definitions for every area.
//  `tools/build-maps.mjs` compiles these into Tiled-format JSON in maps/.
//
//  Editing an area here and re-running the build is the intended workflow;
//  the generated JSON is also valid Tiled, so it can be opened in the editor.
// =========================================================================

// One character per tile. The index into TILE_ORDER below is the tile id,
// and the Tiled GID is that id + 1 (GID 0 means "empty").
export const LEGEND = {
  '.': 'path',
  ',': 'grass',
  '"': 'tallgrass',
  'T': 'tree',
  '#': 'wall',
  '~': 'water',
  '_': 'floor',
  'S': 'sign',
  'c': 'cavefloor',
  'R': 'rock',
  '*': 'rubble',
};

// Tile id order. Must stay stable — the generated maps store these indices.
export const TILE_ORDER = [
  { name: 'path',      key: 'tile_path',  walkable: true,  encounter: false },
  { name: 'grass',     key: 'tile_grass', walkable: true,  encounter: false },
  { name: 'tallgrass', key: 'tile_tall',  walkable: true,  encounter: true  },
  { name: 'tree',      key: 'tile_tree',  walkable: false, encounter: false },
  { name: 'wall',      key: 'tile_wall',  walkable: false, encounter: false },
  { name: 'water',     key: 'tile_water', walkable: false, encounter: false },
  { name: 'floor',     key: 'tile_floor', walkable: true,  encounter: false },
  { name: 'sign',      key: 'tile_sign',  walkable: false, encounter: false },
  { name: 'cavefloor', key: 'tile_cave',  walkable: true,  encounter: false },
  { name: 'rock',      key: 'tile_rock',  walkable: false, encounter: false },
  { name: 'rubble',    key: 'tile_rubble',walkable: true,  encounter: true  },
];

// Every area. `ground` is the base layer; `decor` is optional and drawn on
// top (a space means "nothing here").
export const MAPS = {
  town: {
    displayName: 'MAAZ TOWN',
    // No wild encounters in town.
    encounters: null,
    ground: [
      'TTTTTTTTTTTTTTTTTTTT',
      'T,,,,,,,,,,,,,,,,,,T',
      'T,,####,,,,,,,,,,,,T',
      'T,,#__#,,,,,,,,,,,,T',
      'T,,#__#,,,,,,,,,,,,T',
      'T,,#..#,,,,,,,,,,,,T',
      'T,,,..,,,,,,,,,,,,,T',
      'T,S,................',
      'T,,,,,,,,,,,,,,,,,,T',
      'T,,~~~,,,,,,,,,,,,,T',
      'T,,~~~,,,,,,,,,,,,,T',
      'T,,~~~,,,,,,,,,,,,,T',
      'T,,,,,,,,,,,,,,,,,,T',
      'T,,,,,,,,,,,,,,,,,,T',
      'TTTTTTTTTTTTTTTTTTTT',
    ],
    spawn: { col: 4, row: 7, facing: 'down' },
    objects: [
      { type: 'warp', name: 'to_route1', col: 19, row: 7,
        toMap: 'route1', toCol: 1, toRow: 7, facing: 'right' },
      { type: 'heal', name: 'rest_house', col: 4, row: 3, w: 2, h: 2 },
      { type: 'sign', name: 'town_sign', col: 2, row: 7,
        text: 'MAAZ TOWN\nThe road east leads to ROUTE 1.' },
      { type: 'npc', name: 'town_kid', npc: 'townkid', col: 8, row: 6, facing: 'down' },
      { type: 'npc', name: 'rest_helper', npc: 'nurse', col: 4, row: 4, facing: 'down' },
    ],
  },

  route1: {
    displayName: 'ROUTE 1',
    encounters: { pool: ['aqua', 'leaflet', 'birbo', 'emberling'], min: 2, max: 6 },
    ground: [
      'TTTTTTTTTTTTTTTTTTTT',
      'T,,,,,,,,,,,,,,,,,,T',
      'T,""""",,,,,""""",,T',
      'T,""""",,,,,""""",,T',
      'T,""""",,,,,""""",,T',
      'T,,,,,,,,,,,,,,,,,,T',
      'T,S,,,,,,,,,,,,,,,,T',
      '....................',
      'T,,,,,,,,,,,,,,,,,,T',
      'T,,"""""",,,,,,,,,,T',
      'T,,"""""",,,,,,,,,,T',
      'T,,,,,,,,,,,,,,,,,,T',
      'T,,,,,,,,,,,,,,,,,,T',
      'T,,,,,,,,,,,,,,,,,,T',
      'TTTTTTTTTTTTTTTTTTTT',
    ],
    spawn: { col: 1, row: 7, facing: 'right' },
    objects: [
      { type: 'warp', name: 'to_town', col: 0, row: 7,
        toMap: 'town', toCol: 18, toRow: 7, facing: 'left' },
      { type: 'warp', name: 'to_cave', col: 19, row: 7,
        toMap: 'cave', toCol: 1, toRow: 5, facing: 'right' },
      { type: 'sign', name: 'route_sign', col: 2, row: 6,
        text: 'ROUTE 1\nTall grass ahead.\nWild monsters live there!' },
      { type: 'trainer', name: 'joey', trainer: 'youngster_joey',
        col: 8, row: 6, facing: 'down' },
      { type: 'trainer', name: 'rae', trainer: 'camper_rae',
        col: 14, row: 8, facing: 'up' },
    ],
  },

  cave: {
    displayName: 'MAAZ CAVE',
    encounters: { pool: ['pebbo', 'zapmo'], min: 4, max: 8 },
    ground: [
      'RRRRRRRRRRRRRRR',
      'RcccccccccccccR',
      'Rc*****cccccccR',
      'Rc*****cccccccR',
      'RcccccccccccccR',
      'ccccccccccccccR',
      'RcccccccccccccR',
      'Rcccccc****cccR',
      'Rcccccc****cccR',
      'RcccccccccccccR',
      'RcccccccccccccR',
      'RRRRRRRRRRRRRRR',
    ],
    spawn: { col: 1, row: 5, facing: 'right' },
    objects: [
      { type: 'warp', name: 'to_route1', col: 0, row: 5,
        toMap: 'route1', toCol: 18, toRow: 7, facing: 'left' },
      { type: 'npc', name: 'cave_hiker', npc: 'hiker', col: 3, row: 4, facing: 'down' },
      { type: 'trainer', name: 'dell', trainer: 'miner_dell',
        col: 9, row: 5, facing: 'left' },
    ],
  },
};

// Where a brand-new game begins.
export const START = { map: 'town', col: 4, row: 7, facing: 'down' };
