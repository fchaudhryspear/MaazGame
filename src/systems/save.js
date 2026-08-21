// =========================================================================
//  SAVE SYSTEM — localStorage persistence.
//  Only the minimal state is stored (species/level/xp/hp, bag, position);
//  derived stats are recomputed by makeMonster on load, so a balance tweak
//  to the stat curves applies to existing saves instead of baking in stale
//  numbers.
// =========================================================================
import { CONFIG } from '../config.js';
import { SPECIES, HELD_ITEMS, STARTING_BAG, STARTING_HELD } from '../data/monsters.js';
import { STATUS } from './status.js';
import { makeMonster } from './monster.js';

// v2 added `mapId` for the multi-area world.
// v3 added status conditions, held items, money and beaten trainers.
// v4 added the player's name, nicknames, shop stock and the champion flag.
// Older saves are discarded rather than half-migrated.
const VERSION = 4;

export function newGameState() {
  const starter = makeMonster('maaz', 5);
  starter.held = STARTING_HELD;
  return {
    version: VERSION,
    party: [starter],
    bag: { ...STARTING_BAG },
    playerName: 'MAAZ',
    money: 500,
    heldStock: {},        // held items bought but not yet equipped
    defeatedTrainers: [],
    gifts: [],            // one-off scripted gifts already received
    championBeaten: false,
    mapId: null,        // null -> use the world's start map
    pos: null,          // null -> use that map's spawn point
    seen: [],           // species keys encountered (a mini pokédex)
    caught: [],         // species keys captured
    playtimeMs: 0,
  };
}

function serialize(state) {
  return JSON.stringify({
    version: VERSION,
    party: state.party.map((m) => ({
      speciesKey: m.speciesKey, level: m.level, xp: m.xp, hp: m.hp,
      moves: m.moves, status: m.status, held: m.held, nickname: m.nickname,
    })),
    bag: state.bag,
    playerName: state.playerName,
    money: state.money,
    heldStock: state.heldStock,
    defeatedTrainers: state.defeatedTrainers,
    gifts: state.gifts,
    championBeaten: state.championBeaten,
    mapId: state.mapId,
    pos: state.pos,
    seen: state.seen,
    caught: state.caught,
    playtimeMs: state.playtimeMs,
  });
}

// Rebuild live monsters from the stored minimum. Anything unrecognised is
// dropped rather than trusted, so an edited/stale save can't crash the game.
function deserialize(raw) {
  const data = JSON.parse(raw);
  if (!data || data.version !== VERSION) return null;

  const party = (data.party || [])
    .filter((p) => p && SPECIES[p.speciesKey])
    .map((p) => {
      const mon = makeMonster(p.speciesKey, Math.max(1, p.level | 0));
      mon.xp = Math.max(0, p.xp | 0);
      mon.hp = Math.max(0, Math.min(mon.maxHp, p.hp ?? mon.maxHp));
      if (Array.isArray(p.moves) && p.moves.length) mon.moves = p.moves.slice(0, 4);
      // Unknown conditions/items are dropped rather than trusted.
      mon.status = p.status && STATUS[p.status] ? p.status : null;
      mon.held = p.held && HELD_ITEMS[p.held] ? p.held : null;
      if (typeof p.nickname === 'string' && p.nickname.trim()) {
        mon.nickname = p.nickname.trim().slice(0, 10);
        mon.name = mon.nickname;
      }
      return mon;
    });
  if (!party.length) return null;

  return {
    version: VERSION,
    party,
    bag: { ...STARTING_BAG, ...(data.bag || {}) },
    playerName: typeof data.playerName === 'string' && data.playerName.trim()
      ? data.playerName.trim().slice(0, 10) : 'MAAZ',
    money: Number.isFinite(data.money) ? data.money : 500,
    heldStock: (data.heldStock && typeof data.heldStock === 'object') ? data.heldStock : {},
    defeatedTrainers: Array.isArray(data.defeatedTrainers) ? data.defeatedTrainers : [],
    gifts: Array.isArray(data.gifts) ? data.gifts : [],
    championBeaten: data.championBeaten === true,
    mapId: typeof data.mapId === 'string' ? data.mapId : null,
    pos: data.pos ?? null,
    seen: Array.isArray(data.seen) ? data.seen : [],
    caught: Array.isArray(data.caught) ? data.caught : [],
    playtimeMs: data.playtimeMs | 0,
  };
}

export function saveGame(state) {
  try {
    localStorage.setItem(CONFIG.SAVE_KEY, serialize(state));
    return true;
  } catch (e) {
    console.warn('Save failed:', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(CONFIG.SAVE_KEY);
    if (!raw) return null;
    return deserialize(raw);
  } catch (e) {
    console.warn('Load failed, starting a new game:', e);
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(CONFIG.SAVE_KEY);
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(CONFIG.SAVE_KEY);
  } catch (e) { /* ignore */ }
}
