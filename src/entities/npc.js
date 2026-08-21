// =========================================================================
//  NPC / TRAINER — a static character standing on a tile.
//  Blocks movement, can be talked to, and (for trainers) watches a straight
//  line ahead and challenges the player who steps into it.
// =========================================================================
import { CONFIG, DIR, ANIMS } from '../config.js';
import { NPCS, TRAINERS } from '../data/trainers.js';
import { buildPerson } from '../assets.js';

export class Npc {
  constructor(scene, spec) {
    this.scene = scene;
    this.kind = spec.kind;            // 'npc' | 'trainer'
    this.id = spec.id;
    this.name = spec.name;
    this.col = spec.col;
    this.row = spec.row;
    this.facing = spec.facing;

    this.def = spec.kind === 'trainer' ? TRAINERS[spec.id] : NPCS[spec.id];

    const key = `person_${spec.kind}_${spec.id}`;
    buildPerson(scene, key, this.def.color);

    const t = CONFIG.TILE;
    this.sprite = scene.add
      .sprite(spec.col * t + t / 2, spec.row * t + t / 2, key, ANIMS[spec.facing].row)
      .setDepth(9);
  }

  get displayName() {
    return this.def.name;
  }

  // Turn to face a tile (used when the player talks from the side).
  faceTowards(col, row) {
    const dc = col - this.col;
    const dr = row - this.row;
    let dir = this.facing;
    if (Math.abs(dc) > Math.abs(dr)) dir = dc > 0 ? 'right' : 'left';
    else if (dr !== 0) dir = dr > 0 ? 'down' : 'up';
    this.facing = dir;
    this.sprite.setFrame(ANIMS[dir].row);
  }

  // Tiles this trainer is watching, in order, stopping at the first blocked
  // tile so it can't see through walls.
  sightTiles(matrix) {
    if (this.kind !== 'trainer') return [];
    const d = DIR[this.facing];
    const range = this.def.sightRange ?? 3;
    const tiles = [];
    for (let i = 1; i <= range; i++) {
      const col = this.col + d.dx * i;
      const row = this.row + d.dy * i;
      if (matrix.isBlocked(col, row)) break;
      tiles.push({ col, row });
    }
    return tiles;
  }

  sees(col, row, matrix) {
    return this.sightTiles(matrix).some((t) => t.col === col && t.row === row);
  }

  destroy() {
    this.sprite.destroy();
  }
}

// Build a live monster team for a trainer from its data entry.
export function buildTrainerTeam(trainerId, makeMonster) {
  const def = TRAINERS[trainerId];
  return def.team.map((entry) => {
    const mon = makeMonster(entry.species, entry.level);
    if (entry.held) mon.held = entry.held;
    return mon;
  });
}
