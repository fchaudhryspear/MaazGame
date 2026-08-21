// =========================================================================
//  MONSTER MODEL — creation, stats, levelling, damage and catch maths.
//  Pure logic: no Phaser, no rendering. That keeps it easy to reason about
//  (and to unit-test) independently of the battle UI.
// =========================================================================
import { SPECIES, MOVES, HELD_ITEMS, typeMultiplier } from '../data/monsters.js';
import { statusStatMultiplier } from './status.js';

// XP needed to go from `level` to `level + 1`.
export function xpToNext(level) {
  return Math.floor(8 * level * level + 12 * level);
}

// Stat growth is derived from base stats + level, so a monster's stats are
// always recomputable from (species, level) — nothing to drift out of sync.
function statsFor(speciesKey, level) {
  const b = SPECIES[speciesKey].base;
  return {
    maxHp: b.hp + level * 3,
    atk: b.atk + level,
    def: b.def + Math.floor(level / 2),
    spd: b.spd + level,
  };
}

// Every move the species knows by `level` (starting moves + learnset).
// Capped at the last 4, mirroring the classic 4-move limit.
function movesFor(speciesKey, level) {
  const s = SPECIES[speciesKey];
  const learned = [...s.moves];
  for (const [lvl, mv] of Object.entries(s.learnset || {})) {
    if (level >= Number(lvl) && !learned.includes(mv)) learned.push(mv);
  }
  return learned.slice(-4);
}

export function makeMonster(speciesKey, level) {
  const s = SPECIES[speciesKey];
  const st = statsFor(speciesKey, level);
  return {
    speciesKey,
    name: s.name,        // display name — a nickname replaces this
    nickname: null,
    type: s.type,
    color: s.color,
    level,
    xp: 0,
    status: null,      // burn / poison / paralysis, or null
    held: null,        // held item key, or null
    maxHp: st.maxHp,
    hp: st.maxHp,
    atk: st.atk,
    def: st.def,
    spd: st.spd,
    moves: movesFor(speciesKey, level),
  };
}

export const isFainted = (mon) => mon.hp <= 0;

// A full heal also clears any lingering condition.
export function healMonster(mon) {
  mon.hp = mon.maxHp;
  mon.status = null;
  return mon;
}

// Award XP and apply any level-ups. Returns a report the battle scene turns
// into messages: { gained, levels: [{level, learned}] }.
export function gainXp(mon, amount) {
  const report = { gained: amount, levels: [] };
  mon.xp += amount;
  while (mon.xp >= xpToNext(mon.level)) {
    mon.xp -= xpToNext(mon.level);
    mon.level++;

    // Keep the HP the monster had, then extend it by the new max.
    const before = statsFor(mon.speciesKey, mon.level - 1);
    const after = statsFor(mon.speciesKey, mon.level);
    const hpGain = after.maxHp - before.maxHp;
    mon.maxHp = after.maxHp;
    mon.hp = Math.min(mon.maxHp, mon.hp + hpGain);
    mon.atk = after.atk;
    mon.def = after.def;
    mon.spd = after.spd;

    // A move learned exactly at this level, if any.
    const learnAt = SPECIES[mon.speciesKey].learnset || {};
    const learned = learnAt[mon.level];
    if (learned && !mon.moves.includes(learned)) {
      mon.moves.push(learned);
      if (mon.moves.length > 4) mon.moves.shift(); // forget the oldest
    }
    report.levels.push({ level: mon.level, learned: learned || null });
  }
  return report;
}

// XP a defeated wild monster is worth.
export function xpFromDefeat(enemy) {
  const base = SPECIES[enemy.speciesKey].xpYield;
  return Math.max(1, Math.floor((base * enemy.level) / 7));
}

// --- stat stages (status moves) -----------------------------------------
// Stages run -6..+6 and scale a stat multiplicatively, like the classic games.
export function stageMultiplier(stage) {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

// `stages` is a per-battle { atk, def, spd } map owned by the battle scene,
// so buffs vanish when the battle ends without touching the saved monster.
export function effectiveStat(mon, stat, stages) {
  const staged = mon[stat] * stageMultiplier(stages?.[stat] ?? 0);
  return Math.max(1, Math.floor(staged * statusStatMultiplier(mon, stat)));
}

// Damage with type effectiveness folded in. Returns { damage, multiplier }
// so the UI can say "It's super effective!".
export function computeDamage(attacker, defender, move, atkStages, defStages) {
  const atk = effectiveStat(attacker, 'atk', atkStages);
  const def = effectiveStat(defender, 'def', defStages);
  const lvl = attacker.level;

  const base = Math.floor(((2 * lvl) / 5 + 2) * move.power * (atk / def) / 50) + 2;
  const multiplier = typeMultiplier(move.type, defender.type);
  // Same-type attack bonus, as in the source games.
  const stab = move.type === attacker.type ? 1.5 : 1;
  const held = heldTypeBoost(attacker, move.type);
  const roll = 0.85 + Math.random() * 0.15;

  return {
    damage: Math.max(1, Math.floor(base * multiplier * stab * held * roll)),
    multiplier,
  };
}

// --- nicknames and evolution --------------------------------------------

export function setNickname(mon, nickname) {
  const clean = (nickname || '').trim().slice(0, 10);
  mon.nickname = clean || null;
  mon.name = clean || SPECIES[mon.speciesKey].name;
  return mon;
}

// The species this monster would become at its current level, or null.
export function pendingEvolution(mon) {
  const s = SPECIES[mon.speciesKey];
  if (!s.evolvesTo || !SPECIES[s.evolvesTo]) return null;
  if (mon.level < s.evolvesAt) return null;
  return s.evolvesTo;
}

// Evolve in place: stats recompute from the new species, HP keeps the gain,
// and a nickname is kept (only an un-nicknamed monster takes the new name).
export function evolveMonster(mon) {
  const toKey = pendingEvolution(mon);
  if (!toKey) return null;

  const fromName = mon.name;
  const before = statsFor(mon.speciesKey, mon.level);
  const after = statsFor(toKey, mon.level);
  const next = SPECIES[toKey];

  mon.speciesKey = toKey;
  mon.type = next.type;
  mon.color = next.color;
  if (!mon.nickname) mon.name = next.name;

  const hpGain = after.maxHp - before.maxHp;
  mon.maxHp = after.maxHp;
  mon.hp = Math.min(mon.maxHp, mon.hp + Math.max(0, hpGain));
  mon.atk = after.atk;
  mon.def = after.def;
  mon.spd = after.spd;

  return { fromName, toName: next.name, speciesKey: toKey };
}

// --- held items ----------------------------------------------------------

export function heldItem(mon) {
  return mon.held ? HELD_ITEMS[mon.held] || null : null;
}

// Damage multiplier from a type-boosting held item.
export function heldTypeBoost(mon, moveType) {
  const item = heldItem(mon);
  if (item?.kind === 'typeBoost' && item.type === moveType) return item.multiplier;
  return 1;
}

// True if a held item blocks this condition being inflicted.
export function heldBlocksStatus(mon, statusKey) {
  const item = heldItem(mon);
  return item?.kind === 'statusGuard' && item.blocks === statusKey;
}

// A pinch-heal berry fires once when HP drops below its threshold, and is
// consumed. Returns { healed, itemName } or null.
export function tryPinchHeal(mon) {
  const item = heldItem(mon);
  if (item?.kind !== 'pinchHeal') return null;
  if (mon.hp <= 0 || mon.hp / mon.maxHp > item.threshold) return null;

  const healed = Math.min(item.amount, mon.maxHp - mon.hp);
  if (healed <= 0) return null;
  mon.hp += healed;
  mon.held = null;                       // berries are eaten
  return { healed, itemName: item.name };
}

// Wording for an effectiveness multiplier (null when it's neutral).
export function effectivenessText(multiplier) {
  if (multiplier === 0) return "It doesn't affect it...";
  if (multiplier >= 2) return "It's super effective!";
  if (multiplier <= 0.5) return "It's not very effective...";
  return null;
}

// Turn order: higher move priority wins, then higher effective speed.
// Ties are broken randomly. Returns the actions sorted first-to-act.
export function orderActions(actions) {
  return [...actions].sort((a, b) => {
    const pa = MOVES[a.move]?.priority ?? 0;
    const pb = MOVES[b.move]?.priority ?? 0;
    if (a.kind !== 'move' || b.kind !== 'move') {
      // Switching and item use always resolve before attacks.
      const rank = (x) => (x.kind === 'move' ? 1 : 0);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
    }
    if (pa !== pb) return pb - pa;
    // Quick Claw is rolled once per action by the caller and cached on it.
    if (!!a.quickClaw !== !!b.quickClaw) return a.quickClaw ? -1 : 1;
    const sa = effectiveStat(a.user, 'spd', a.stages);
    const sb = effectiveStat(b.user, 'spd', b.stages);
    if (sa !== sb) return sb - sa;
    return Math.random() < 0.5 ? -1 : 1;
  });
}

// Roll a held Quick Claw. Call once per action, before ordering.
export function rollQuickClaw(mon) {
  const item = heldItem(mon);
  if (item?.kind !== 'quickClaw') return false;
  return Math.random() < item.chance;
}

// Catch chance: weaker targets are easier, scaled by species rate and ball.
// Returns { caught, shakes } — shakes drives the wobble animation.
export function rollCatch(target, ballBonus) {
  const hpFactor = 1 - (target.hp / target.maxHp) * 0.65;
  const levelFactor = Math.max(0.45, 1 - target.level * 0.03);
  const rate = SPECIES[target.speciesKey].catchRate;
  const chance = Math.max(0.05, Math.min(0.95, rate * hpFactor * levelFactor * ballBonus));

  const caught = Math.random() < chance;
  // Near-misses wobble more, which reads as "that was close".
  let shakes = 0;
  while (shakes < 3 && Math.random() < chance + 0.15) shakes++;
  return { caught, shakes: caught ? 3 : Math.min(shakes, 2) };
}
