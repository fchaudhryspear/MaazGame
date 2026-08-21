// =========================================================================
//  BUILD MAPS — compiles the ASCII definitions in mapsrc.mjs into
//  Tiled-format JSON under maps/.
//
//    node tools/build-maps.mjs
//
//  Output is standard Tiled 1.10 JSON, so the maps can also be opened and
//  edited in the Tiled editor. Validation is strict: ragged rows, unknown
//  legend characters, warps pointing at missing maps, and warps or spawns
//  landing on blocked tiles all fail the build rather than shipping a map
//  the player can get stuck in.
// =========================================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGEND, TILE_ORDER, MAPS, START } from './mapsrc.mjs';
import { NPCS, TRAINERS } from '../src/data/trainers.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'maps');
const TILE = 32;

const NAME_TO_ID = new Map(TILE_ORDER.map((t, i) => [t.name, i]));
const errors = [];
const fail = (map, msg) => errors.push(`[${map}] ${msg}`);

// ---- shared tileset ------------------------------------------------------
// One external tileset every map references, so tile behaviour has a single
// source of truth instead of being duplicated per map.
function buildTileset() {
  return {
    columns: 0,               // image collection: our textures are generated
    grid: { height: TILE, orientation: 'orthogonal', width: TILE },
    margin: 0,
    name: 'maaz',
    spacing: 0,
    tilecount: TILE_ORDER.length,
    tiledversion: '1.10.2',
    tileheight: TILE,
    tilewidth: TILE,
    type: 'tileset',
    version: '1.10',
    tiles: TILE_ORDER.map((t, id) => ({
      id,
      // `textureKey` is what the game's asset factory generates.
      properties: [
        { name: 'textureKey', type: 'string', value: t.key },
        { name: 'name', type: 'string', value: t.name },
        { name: 'walkable', type: 'bool', value: t.walkable },
        { name: 'encounter', type: 'bool', value: t.encounter },
      ],
    })),
  };
}

// ---- per-map -------------------------------------------------------------
function parseGrid(mapName, rows) {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = [];

  rows.forEach((row, r) => {
    if (row.length !== width) {
      fail(mapName, `row ${r} is ${row.length} chars, expected ${width}`);
    }
    for (const ch of row) {
      const tileName = LEGEND[ch];
      if (tileName === undefined) {
        fail(mapName, `unknown legend character ${JSON.stringify(ch)} on row ${r}`);
        data.push(0);
        continue;
      }
      // Tiled GIDs are 1-based; 0 means an empty cell.
      data.push(NAME_TO_ID.get(tileName) + 1);
    }
  });

  return { width, height, data };
}

function prop(name, value) {
  const type = typeof value === 'boolean' ? 'bool'
    : Number.isInteger(value) ? 'int' : 'string';
  return { name, type, value };
}

function buildObjects(mapName, objects) {
  let id = 1;
  return objects.map((o) => {
    const props = [];
    if (o.type === 'warp') {
      props.push(prop('toMap', o.toMap), prop('toCol', o.toCol), prop('toRow', o.toRow));
      if (o.facing) props.push(prop('facing', o.facing));
    } else if (o.type === 'sign') {
      props.push(prop('text', o.text));
    } else if (o.type === 'npc') {
      props.push(prop('npc', o.npc), prop('facing', o.facing || 'down'));
    } else if (o.type === 'trainer') {
      props.push(prop('trainer', o.trainer), prop('facing', o.facing || 'down'));
    }
    return {
      id: id++,
      name: o.name,
      type: o.type,
      x: o.col * TILE,
      y: o.row * TILE,
      width: (o.w ?? 1) * TILE,
      height: (o.h ?? 1) * TILE,
      rotation: 0,
      visible: true,
      properties: props,
    };
  });
}

function buildMap(mapName, def) {
  const { width, height, data } = parseGrid(mapName, def.ground);

  const mapProps = [prop('displayName', def.displayName)];
  if (def.encounters) {
    mapProps.push(
      prop('encounterPool', def.encounters.pool.join(',')),
      prop('encounterMin', def.encounters.min),
      prop('encounterMax', def.encounters.max),
    );
  }
  mapProps.push(
    prop('spawnCol', def.spawn.col),
    prop('spawnRow', def.spawn.row),
    prop('spawnFacing', def.spawn.facing || 'down'),
  );

  return {
    compressionlevel: -1,
    height,
    infinite: false,
    layers: [
      {
        data, height, width,
        id: 1, name: 'ground', opacity: 1, type: 'tilelayer',
        visible: true, x: 0, y: 0,
      },
      {
        draworder: 'topdown',
        id: 2, name: 'objects', type: 'objectgroup',
        objects: buildObjects(mapName, def.objects || []),
        opacity: 1, visible: true, x: 0, y: 0,
      },
    ],
    nextlayerid: 3,
    nextobjectid: (def.objects?.length ?? 0) + 1,
    orientation: 'orthogonal',
    properties: mapProps,
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: TILE,
    tilesets: [{ firstgid: 1, source: 'tileset.json' }],
    tilewidth: TILE,
    type: 'map',
    version: '1.10',
    width,
  };
}

// ---- validation ----------------------------------------------------------
function tileIdAt(map, col, row) {
  const layer = map.layers.find((l) => l.name === 'ground');
  if (col < 0 || row < 0 || col >= layer.width || row >= layer.height) return null;
  return layer.data[row * layer.width + col] - 1;
}

function isWalkable(map, col, row) {
  const id = tileIdAt(map, col, row);
  if (id === null || id < 0) return false;
  return TILE_ORDER[id]?.walkable === true;
}

function validate(built) {
  for (const [name, map] of Object.entries(built)) {
    const objects = map.layers.find((l) => l.name === 'objects').objects;

    // Spawn must be standable.
    const sc = map.properties.find((p) => p.name === 'spawnCol').value;
    const sr = map.properties.find((p) => p.name === 'spawnRow').value;
    if (!isWalkable(map, sc, sr)) fail(name, `spawn (${sc},${sr}) is on a blocked tile`);

    for (const obj of objects) {
      const col = obj.x / TILE, row = obj.y / TILE;

      if (obj.type === 'warp') {
        // The warp pad itself must be steppable, or it can never fire.
        if (!isWalkable(map, col, row)) {
          fail(name, `warp "${obj.name}" sits on a blocked tile (${col},${row})`);
        }
        const toMap = obj.properties.find((p) => p.name === 'toMap').value;
        const toCol = obj.properties.find((p) => p.name === 'toCol').value;
        const toRow = obj.properties.find((p) => p.name === 'toRow').value;
        const dest = built[toMap];
        if (!dest) {
          fail(name, `warp "${obj.name}" targets unknown map "${toMap}"`);
        } else if (!isWalkable(dest, toCol, toRow)) {
          fail(name, `warp "${obj.name}" lands on a blocked tile ${toMap}(${toCol},${toRow})`);
        }
      }

      if (obj.type === 'sign') {
        // A sign must be readable from at least one adjacent walkable tile.
        const around = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([dc, dr]) => isWalkable(map, col + dc, row + dr));
        if (!around) fail(name, `sign "${obj.name}" at (${col},${row}) is unreachable`);
      }

      // People occupy their tile, so it must be standable ground, and they
      // must be reachable from at least one neighbouring tile to talk to.
      if (obj.type === 'npc' || obj.type === 'trainer') {
        if (!isWalkable(map, col, row)) {
          fail(name, `${obj.type} "${obj.name}" stands on a blocked tile (${col},${row})`);
        }
        const reachable = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([dc, dr]) => isWalkable(map, col + dc, row + dr));
        if (!reachable) fail(name, `${obj.type} "${obj.name}" is unreachable`);

        const key = obj.properties.find((p) => p.name === (obj.type === 'npc' ? 'npc' : 'trainer')).value;
        const table = obj.type === 'npc' ? NPCS : TRAINERS;
        if (!table[key]) fail(name, `${obj.type} "${obj.name}" references unknown id "${key}"`);
      }

      // A trainer's line of sight must not start inside a wall, or they can
      // never actually spot the player.
      if (obj.type === 'trainer') {
        const facing = obj.properties.find((p) => p.name === 'facing').value;
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[facing];
        if (!d) fail(name, `trainer "${obj.name}" has invalid facing "${facing}"`);
        else if (!isWalkable(map, col + d[0], row + d[1])) {
          fail(name, `trainer "${obj.name}" faces a wall — it can never see the player`);
        }
      }

      if (obj.type === 'heal') {
        for (let r = 0; r < obj.height / TILE; r++) {
          for (let c = 0; c < obj.width / TILE; c++) {
            if (!isWalkable(map, col + c, row + r)) {
              fail(name, `heal pad covers blocked tile (${col + c},${row + r})`);
            }
          }
        }
      }
    }
  }

  // The starting point must exist and be standable.
  const startMap = built[START.map];
  if (!startMap) fail('START', `unknown start map "${START.map}"`);
  else if (!isWalkable(startMap, START.col, START.row)) {
    fail('START', `start position (${START.col},${START.row}) is blocked`);
  }
}

// ---- run -----------------------------------------------------------------
mkdirSync(OUT, { recursive: true });

const built = {};
for (const [name, def] of Object.entries(MAPS)) built[name] = buildMap(name, def);
validate(built);

if (errors.length) {
  console.error('Map build FAILED:\n' + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}

writeFileSync(resolve(OUT, 'tileset.json'), JSON.stringify(buildTileset(), null, 2) + '\n');
console.log('wrote maps/tileset.json');

// An index so the game (and the service worker) know every available map.
const index = {
  start: START,
  maps: Object.fromEntries(
    Object.entries(built).map(([name, m]) => [name, {
      file: `${name}.json`,
      displayName: m.properties.find((p) => p.name === 'displayName').value,
      width: m.width, height: m.height,
    }]),
  ),
};
writeFileSync(resolve(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log('wrote maps/index.json');

for (const [name, map] of Object.entries(built)) {
  writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify(map, null, 2) + '\n');
  const objs = map.layers.find((l) => l.name === 'objects').objects.length;
  console.log(`wrote maps/${name}.json  (${map.width}x${map.height}, ${objs} objects)`);
}
console.log('\nAll maps valid.');
