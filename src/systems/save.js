// =========================================================================
//  SAVE SYSTEM — localStorage persistence.
//  Only the minimal state is stored (species/level/xp/hp, bag, position);
//  derived stats are recomputed by makeMonster on load, so a balance tweak
//  to the stat curves applies to existing saves instead of baking in stale
//  numbers.
// =========================================================================
import { CONFIG } from '../config.js';
import { SPECIES, STARTING_BAG } from '../data/monsters.js';
import { makeMonster } from './monster.js';

const VERSION = 1;

export function newGameState() {
  return {
    version: VERSION,
    party: [makeMonster('maaz', 5)],
    bag: { ...STARTING_BAG },
    pos: null,          // null -> use the map's spawn point
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
      moves: m.moves,
    })),
    bag: state.bag,
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
      return mon;
    });
  if (!party.length) return null;

  return {
    version: VERSION,
    party,
    bag: { ...STARTING_BAG, ...(data.bag || {}) },
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
