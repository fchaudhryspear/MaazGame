// =========================================================================
//  MAP LOADER — fetches and parses Tiled JSON maps.
//
//  Maps are authored in maps/*.json (Tiled 1.10 format) and reference a
//  shared external tileset, so tile behaviour — texture key, walkability,
//  whether it spawns encounters — lives in exactly one place.
//
//  Everything is cached after first fetch: walking back and forth between
//  two areas re-parses nothing, and the service worker has the files
//  precached so it works offline too.
// =========================================================================

const MAPS_DIR = 'maps';

const mapCache = new Map();
let tilesetCache = null;
let indexCache = null;

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// Tiled stores custom properties as [{name, type, value}]; flatten to an object.
function propsToObject(props) {
  const out = {};
  for (const p of props || []) out[p.name] = p.value;
  return out;
}

export async function loadIndex() {
  if (indexCache) return indexCache;
  indexCache = await fetchJson(`${MAPS_DIR}/index.json`);
  return indexCache;
}

// The shared tileset: tile id -> { key, walkable, encounter }.
export async function loadTileset() {
  if (tilesetCache) return tilesetCache;
  const raw = await fetchJson(`${MAPS_DIR}/tileset.json`);
  const tiles = {};
  for (const t of raw.tiles || []) {
    const p = propsToObject(t.properties);
    tiles[t.id] = {
      key: p.textureKey,
      name: p.name,
      walkable: p.walkable === true,
      encounter: p.encounter === true,
    };
  }
  tilesetCache = tiles;
  return tilesetCache;
}

// Parse a Tiled map into the shape the game works with.
export async function loadMap(name) {
  if (mapCache.has(name)) return mapCache.get(name);

  const [raw, tileset] = await Promise.all([
    fetchJson(`${MAPS_DIR}/${name}.json`),
    loadTileset(),
  ]);

  const groundLayer = raw.layers.find((l) => l.name === 'ground' && l.type === 'tilelayer');
  if (!groundLayer) throw new Error(`Map ${name} has no ground layer`);
  const decorLayer = raw.layers.find((l) => l.name === 'decor' && l.type === 'tilelayer');
  const objectLayer = raw.layers.find((l) => l.type === 'objectgroup');

  // Tiled GIDs are 1-based with 0 meaning empty; our tile ids are 0-based.
  const firstgid = raw.tilesets?.[0]?.firstgid ?? 1;
  const toGrid = (layer) => {
    if (!layer) return null;
    const rows = [];
    for (let r = 0; r < layer.height; r++) {
      const row = [];
      for (let c = 0; c < layer.width; c++) {
        const gid = layer.data[r * layer.width + c];
        row.push(gid === 0 ? -1 : gid - firstgid);
      }
      rows.push(row);
    }
    return rows;
  };

  const props = propsToObject(raw.properties);
  const tileSize = raw.tilewidth;

  // Objects carry pixel coordinates; convert to tile coordinates and index
  // warps/heals by "col,row" so lookups during movement stay O(1).
  const warps = {};
  const signs = {};
  const heals = new Set();
  const people = [];   // NPCs and trainers, in map order

  for (const obj of objectLayer?.objects || []) {
    const p = propsToObject(obj.properties);
    const col = Math.round(obj.x / tileSize);
    const row = Math.round(obj.y / tileSize);
    const wTiles = Math.max(1, Math.round(obj.width / tileSize));
    const hTiles = Math.max(1, Math.round(obj.height / tileSize));

    if (obj.type === 'warp') {
      warps[`${col},${row}`] = {
        name: obj.name, toMap: p.toMap, toCol: p.toCol, toRow: p.toRow,
        facing: p.facing || null,
      };
    } else if (obj.type === 'sign') {
      signs[`${col},${row}`] = p.text || '';
    } else if (obj.type === 'npc' || obj.type === 'trainer') {
      people.push({
        kind: obj.type,
        name: obj.name,
        id: obj.type === 'npc' ? p.npc : p.trainer,
        col, row,
        facing: p.facing || 'down',
      });
    } else if (obj.type === 'heal') {
      // Heal pads may span several tiles.
      for (let r = 0; r < hTiles; r++) {
        for (let c = 0; c < wTiles; c++) heals.add(`${col + c},${row + r}`);
      }
    }
  }

  const encounters = props.encounterPool
    ? {
        pool: String(props.encounterPool).split(',').map((s) => s.trim()).filter(Boolean),
        min: props.encounterMin ?? 2,
        max: props.encounterMax ?? 5,
      }
    : null;

  const map = {
    name,
    displayName: props.displayName || name,
    cols: groundLayer.width,
    rows: groundLayer.height,
    tileSize,
    ground: toGrid(groundLayer),
    decor: toGrid(decorLayer),
    tiles: tileset,
    warps,
    signs,
    heals,
    people,
    encounters,
    spawn: {
      col: props.spawnCol ?? 0,
      row: props.spawnRow ?? 0,
      facing: props.spawnFacing || 'down',
    },
  };

  mapCache.set(name, map);
  return map;
}

// Preload every map named in the index, so walking through a warp never
// stalls on a fetch.
export async function preloadAllMaps() {
  const index = await loadIndex();
  await Promise.all(Object.keys(index.maps).map((n) => loadMap(n)));
  return index;
}

export function getCachedMap(name) {
  return mapCache.get(name) || null;
}
