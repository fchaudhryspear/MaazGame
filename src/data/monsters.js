// =========================================================================
//  BATTLE DATA — types, moves, species, and the wild encounter table.
//  Everything the battle system needs is a plain object here, so adding
//  content means editing data, not code.
// =========================================================================

export const TYPES = Object.freeze(
  ['normal', 'fire', 'water', 'grass', 'electric', 'flying']
);

// Colour used for type badges in the battle UI.
export const TYPE_COLORS = Object.freeze({
  normal:   '#b9b9a8',
  fire:     '#f0803c',
  water:    '#5a90e0',
  grass:    '#68c05a',
  electric: '#e6c62e',
  flying:   '#a892e0',
});

// attacker type -> { defender type: multiplier }. Anything unlisted is 1x.
// This is what makes move `type` meaningful instead of decorative.
export const TYPE_CHART = Object.freeze({
  fire:     { grass: 2, water: 0.5, fire: 0.5 },
  water:    { fire: 2, grass: 0.5, water: 0.5 },
  grass:    { water: 2, fire: 0.5, grass: 0.5, flying: 0.5 },
  electric: { water: 2, flying: 2, grass: 0.5, electric: 0.5 },
  flying:   { grass: 2, electric: 0.5 },
  normal:   {},
});

export function typeMultiplier(moveType, defenderType) {
  const row = TYPE_CHART[moveType];
  if (!row) return 1;
  return row[defenderType] ?? 1;
}

// Moves. `power: 0` marks a status move, which uses `effect` instead.
// `priority` shifts turn order ahead of raw speed (Quick Attack).
export const MOVES = Object.freeze({
  tackle:      { name: 'Tackle',    type: 'normal',   power: 40, accuracy: 100, priority: 0 },
  scratch:     { name: 'Scratch',   type: 'normal',   power: 40, accuracy: 100, priority: 0 },
  quickatk:    { name: 'Quick Atk', type: 'normal',   power: 35, accuracy: 100, priority: 1 },
  bodyslam:    { name: 'Body Slam', type: 'normal',   power: 65, accuracy: 95,  priority: 0 },

  ember:       { name: 'Ember',     type: 'fire',     power: 45, accuracy: 100, priority: 0 },
  flamebite:   { name: 'Flamebite', type: 'fire',     power: 68, accuracy: 95,  priority: 0 },

  watergun:    { name: 'Water Gun', type: 'water',    power: 45, accuracy: 100, priority: 0 },
  aquajet:     { name: 'Aqua Jet',  type: 'water',    power: 40, accuracy: 100, priority: 1 },
  surge:       { name: 'Surge',     type: 'water',    power: 68, accuracy: 95,  priority: 0 },

  vinewhip:    { name: 'Vine Whip', type: 'grass',    power: 45, accuracy: 100, priority: 0 },
  leafblade:   { name: 'Leaf Blade',type: 'grass',    power: 68, accuracy: 95,  priority: 0 },

  spark:       { name: 'Spark',     type: 'electric', power: 45, accuracy: 100, priority: 0 },
  thunderjolt: { name: 'Thunderjolt',type:'electric', power: 68, accuracy: 95,  priority: 0 },

  gust:        { name: 'Gust',      type: 'flying',   power: 40, accuracy: 100, priority: 0 },
  wingbeat:    { name: 'Wingbeat',  type: 'flying',   power: 65, accuracy: 95,  priority: 0 },

  // Condition moves: inflict a status rather than dealing damage.
  emberflare:  { name: 'Ember Flare',type: 'fire',    power: 0,  accuracy: 85, priority: 0,
                 inflict: 'burn' },
  toxicspore:  { name: 'Toxic Spore',type: 'grass',   power: 0,  accuracy: 85, priority: 0,
                 inflict: 'poison' },
  staticshock: { name: 'Static',     type: 'electric',power: 0,  accuracy: 85, priority: 0,
                 inflict: 'paralysis' },

  // Damaging moves with a chance to inflict on hit.
  scald:       { name: 'Scald',      type: 'water',   power: 55, accuracy: 100, priority: 0,
                 inflictChance: { status: 'burn', chance: 0.3 } },
  thunderfang: { name: 'Thundrfang',type: 'electric', power: 55, accuracy: 95,  priority: 0,
                 inflictChance: { status: 'paralysis', chance: 0.3 } },

  // Status moves: no damage, they shift a stat stage instead.
  growl:       { name: 'Growl',     type: 'normal', power: 0, accuracy: 100, priority: 0,
                 effect: { stat: 'atk', stages: -1, target: 'foe' } },
  harden:      { name: 'Harden',    type: 'normal', power: 0, accuracy: 100, priority: 0,
                 effect: { stat: 'def', stages: +1, target: 'self' } },
  agility:     { name: 'Agility',   type: 'normal', power: 0, accuracy: 100, priority: 0,
                 effect: { stat: 'spd', stages: +2, target: 'self' } },
});

// Species. `learnset` maps level -> move key, taught on level-up.
// `catchRate` is 0..1 (higher = easier). `xpYield` scales battle rewards.
export const SPECIES = Object.freeze({
  maaz: {
    name: 'MAAZ', type: 'fire', color: 0xd23b3b,
    base: { hp: 26, atk: 12, def: 10, spd: 12 },
    moves: ['scratch', 'ember'],
    learnset: { 7: 'quickatk', 12: 'flamebite', 14: 'emberflare', 16: 'bodyslam' },
    catchRate: 0.35, xpYield: 62,
    evolvesTo: 'maazflare', evolvesAt: 16,
  },
  maazflare: {
    name: 'MAAZFLARE', type: 'fire', color: 0xff6b35,
    base: { hp: 40, atk: 20, def: 16, spd: 19 },
    moves: ['flamebite', 'quickatk'],
    learnset: { 22: 'emberflare', 28: 'bodyslam' },
    catchRate: 0.2, xpYield: 158,
  },
  aqua: {
    name: 'AQUABIT', type: 'water', color: 0x3d7bd6,
    base: { hp: 28, atk: 10, def: 12, spd: 10 },
    moves: ['tackle', 'watergun'],
    learnset: { 8: 'aquajet', 12: 'scald', 14: 'surge', 18: 'harden' },
    catchRate: 0.5, xpYield: 58,
    evolvesTo: 'aquadon', evolvesAt: 18,
  },
  aquadon: {
    name: 'AQUADON', type: 'water', color: 0x2a5fb0,
    base: { hp: 44, atk: 17, def: 20, spd: 15 },
    moves: ['surge', 'aquajet'],
    learnset: { 24: 'scald', 30: 'bodyslam' },
    catchRate: 0.2, xpYield: 155,
  },
  leaflet: {
    name: 'LEAFLET', type: 'grass', color: 0x3fa34d,
    base: { hp: 30, atk: 10, def: 11, spd: 9 },
    moves: ['scratch', 'vinewhip'],
    learnset: { 8: 'growl', 12: 'toxicspore', 14: 'leafblade', 18: 'bodyslam' },
    catchRate: 0.5, xpYield: 58,
    evolvesTo: 'leafgore', evolvesAt: 18,
  },
  leafgore: {
    name: 'LEAFGORE', type: 'grass', color: 0x1f7a35,
    base: { hp: 46, atk: 17, def: 19, spd: 13 },
    moves: ['leafblade', 'toxicspore'],
    learnset: { 24: 'bodyslam', 30: 'harden' },
    catchRate: 0.2, xpYield: 155,
  },
  zapmo: {
    name: 'ZAPMO', type: 'electric', color: 0xe6c62e,
    base: { hp: 22, atk: 11, def: 9, spd: 15 },
    moves: ['tackle', 'spark'],
    learnset: { 9: 'quickatk', 12: 'staticshock', 15: 'thunderjolt', 19: 'agility' },
    catchRate: 0.45, xpYield: 60,
  },
  birbo: {
    name: 'BIRBO', type: 'flying', color: 0x9b6bd0,
    base: { hp: 24, atk: 11, def: 9, spd: 14 },
    moves: ['tackle', 'gust'],
    learnset: { 9: 'quickatk', 15: 'wingbeat', 19: 'agility' },
    catchRate: 0.5, xpYield: 56,
  },
  emberling: {
    name: 'EMBERLING', type: 'fire', color: 0xf0803c,
    base: { hp: 25, atk: 13, def: 9, spd: 11 },
    moves: ['scratch', 'ember'],
    learnset: { 10: 'flamebite', 16: 'bodyslam' },
    catchRate: 0.4, xpYield: 61,
  },
  lamblet: {
    shape: 'sheep',
    name: 'LAMBLET', type: 'normal', color: 0xf2ead9,
    base: { hp: 30, atk: 9, def: 12, spd: 8 },
    moves: ['tackle', 'growl'],
    learnset: { 8: 'bodyslam', 12: 'harden', 16: 'staticshock' },
    catchRate: 0.55, xpYield: 58,
    evolvesTo: 'woolie', evolvesAt: 12,
  },
  woolie: {
    shape: 'sheep',
    name: 'WOOLIE', type: 'normal', color: 0xe8dcc0,
    base: { hp: 38, atk: 13, def: 16, spd: 10 },
    moves: ['tackle', 'bodyslam'],
    learnset: { 18: 'staticshock', 22: 'thunderfang' },
    catchRate: 0.35, xpYield: 92,
    evolvesTo: 'rambolt', evolvesAt: 24,
  },
  rambolt: {
    shape: 'sheep',
    name: 'RAMBOLT', type: 'electric', color: 0xf5d76e,
    base: { hp: 46, atk: 18, def: 19, spd: 14 },
    moves: ['bodyslam', 'thunderjolt'],
    learnset: { 28: 'thunderfang', 32: 'agility' },
    catchRate: 0.2, xpYield: 150,
  },

  pebbo: {
    name: 'PEBBO', type: 'normal', color: 0x9a8f7a,
    base: { hp: 34, atk: 11, def: 15, spd: 6 },
    moves: ['tackle', 'harden'],
    learnset: { 11: 'bodyslam', 17: 'growl' },
    catchRate: 0.55, xpYield: 54,
  },
});

// What appears in tall grass, and at what levels.
export const WILD_POOL = ['aqua', 'leaflet', 'zapmo', 'birbo', 'emberling', 'pebbo', 'lamblet'];
export const WILD_LEVELS = { min: 2, max: 6 };

// Held items. One per monster, applied passively during battle.
//   typeBoost  — multiplies damage of moves of that type
//   pinchHeal  — restores HP once when the holder drops below `threshold`
//   quickClaw  — chance to act first regardless of speed
//   statusGuard— blocks a condition from being inflicted
export const HELD_ITEMS = Object.freeze({
  charcoal:    { name: 'Charcoal',    kind: 'typeBoost', type: 'fire',     multiplier: 1.2 },
  mysticwater: { name: 'Mystic Water',kind: 'typeBoost', type: 'water',    multiplier: 1.2 },
  miracleseed: { name: 'Miracle Seed',kind: 'typeBoost', type: 'grass',    multiplier: 1.2 },
  magnet:      { name: 'Magnet',      kind: 'typeBoost', type: 'electric', multiplier: 1.2 },
  oranberry:   { name: 'Oran Berry',  kind: 'pinchHeal', threshold: 0.25, amount: 20 },
  quickclaw:   { name: 'Quick Claw',  kind: 'quickClaw', chance: 0.2 },
  burnguard:   { name: 'Burn Guard',  kind: 'statusGuard', blocks: 'burn' },
});

// Bag items. `use` describes what happens; the battle scene interprets it.
export const ITEMS = Object.freeze({
  potion:      { name: 'Potion',      kind: 'heal',  amount: 20 },
  superpotion: { name: 'Super Potion',kind: 'heal',  amount: 50 },
  antidote:    { name: 'Antidote',    kind: 'cure' },
  ball:        { name: 'Maaz Ball',   kind: 'ball',  bonus: 1.0 },
  greatball:   { name: 'Great Ball',  kind: 'ball',  bonus: 1.5 },
});

// Shop stock. Held items are sold too, so prize money has somewhere to go.
export const SHOP_STOCK = Object.freeze([
  { key: 'potion',      price: 200,  kind: 'bag' },
  { key: 'superpotion', price: 450,  kind: 'bag' },
  { key: 'antidote',    price: 150,  kind: 'bag' },
  { key: 'ball',        price: 180,  kind: 'bag' },
  { key: 'greatball',   price: 500,  kind: 'bag' },
  { key: 'oranberry',   price: 300,  kind: 'held' },
  { key: 'charcoal',    price: 700,  kind: 'held' },
  { key: 'magnet',      price: 700,  kind: 'held' },
  { key: 'quickclaw',   price: 900,  kind: 'held' },
]);

// What the player starts a fresh game with.
export const STARTING_BAG = Object.freeze({
  potion: 3, superpotion: 1, antidote: 2, ball: 5, greatball: 1,
});

// What the starter is holding on a fresh game.
export const STARTING_HELD = 'oranberry';
