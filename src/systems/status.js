// =========================================================================
//  STATUS CONDITIONS — burn, paralysis and poison.
//  Pure logic, no Phaser: the battle scene asks what happened and turns the
//  answers into messages and animations.
//
//  A monster carries at most one condition at a time (`mon.status`), matching
//  the source games. It persists out of battle and is cleared by healing.
// =========================================================================

export const STATUS = Object.freeze({
  burn: {
    name: 'BRN',
    color: '#f0803c',
    // Burn chips HP each turn and halves physical attack.
    tickFraction: 1 / 16,
    atkMultiplier: 0.5,
    tickText: (n) => `${n} is hurt by its burn!`,
    inflictText: (n) => `${n} was burned!`,
    blockedText: (n) => `${n} is already burned!`,
  },
  poison: {
    name: 'PSN',
    color: '#a86ec9',
    tickFraction: 1 / 8,
    tickText: (n) => `${n} is hurt by poison!`,
    inflictText: (n) => `${n} was poisoned!`,
    blockedText: (n) => `${n} is already poisoned!`,
  },
  paralysis: {
    name: 'PAR',
    color: '#e6c62e',
    // Paralysis quarters speed and sometimes costs the turn outright.
    spdMultiplier: 0.25,
    skipChance: 0.25,
    skipText: (n) => `${n} is paralysed! It can't move!`,
    inflictText: (n) => `${n} was paralysed!`,
    blockedText: (n) => `${n} is already paralysed!`,
  },
});

// Types that shrug off a condition thematically (fire can't burn, etc.).
const IMMUNE = { burn: ['fire'], poison: [], paralysis: ['electric'] };

export function statusName(key) {
  return STATUS[key]?.name ?? '';
}

export function statusColor(key) {
  return STATUS[key]?.color ?? '#ffffff';
}

// Try to apply a condition. Returns { applied, reason, text }.
export function inflictStatus(mon, key) {
  const def = STATUS[key];
  if (!def) return { applied: false, reason: 'unknown', text: null };

  if (mon.status === key) {
    return { applied: false, reason: 'same', text: def.blockedText(mon.name) };
  }
  if (mon.status) {
    return {
      applied: false, reason: 'other',
      text: `${mon.name} is already ${statusName(mon.status)}!`,
    };
  }
  if ((IMMUNE[key] || []).includes(mon.type)) {
    return {
      applied: false, reason: 'immune',
      text: `It doesn't affect ${mon.name}...`,
    };
  }

  mon.status = key;
  return { applied: true, reason: 'ok', text: def.inflictText(mon.name) };
}

export function cureStatus(mon) {
  const had = mon.status;
  mon.status = null;
  return had;
}

// Damage applied at the end of a turn. Returns { damage, text } or null.
export function statusTick(mon) {
  const def = STATUS[mon.status];
  if (!def || !def.tickFraction) return null;
  if (mon.hp <= 0) return null;

  const damage = Math.max(1, Math.floor(mon.maxHp * def.tickFraction));
  mon.hp = Math.max(0, mon.hp - damage);
  return { damage, text: def.tickText(mon.name) };
}

// Rolled before acting. Returns { skipped, text }.
export function rollStatusSkip(mon) {
  const def = STATUS[mon.status];
  if (!def || !def.skipChance) return { skipped: false, text: null };
  if (Math.random() < def.skipChance) {
    return { skipped: true, text: def.skipText(mon.name) };
  }
  return { skipped: false, text: null };
}

// Stat multipliers contributed by the current condition.
export function statusStatMultiplier(mon, stat) {
  const def = STATUS[mon.status];
  if (!def) return 1;
  if (stat === 'atk' && def.atkMultiplier) return def.atkMultiplier;
  if (stat === 'spd' && def.spdMultiplier) return def.spdMultiplier;
  return 1;
}
