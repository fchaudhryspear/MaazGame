// =========================================================================
//  ENCOUNTER MANAGER
//  Counts steps taken on tall-grass tiles and rolls for a random encounter.
//  A short grace period stops a battle firing the instant you touch grass.
// =========================================================================
import { CONFIG } from '../config.js';

export class EncounterManager {
  constructor(opts = {}) {
    this.chance = opts.chance ?? CONFIG.ENCOUNTER_CHANCE;
    this.minSteps = opts.minSteps ?? CONFIG.ENCOUNTER_MIN_STEPS;
    this.stepsSinceEncounter = 0;
    this.enabled = true;
    this.onEncounter = opts.onEncounter ?? null;
  }

  // Called once per completed step that lands on tall grass.
  // Returns true if an encounter fired.
  onGrassStep() {
    if (!this.enabled) return false;
    this.stepsSinceEncounter++;
    if (this.stepsSinceEncounter < this.minSteps) return false;
    if (Math.random() < this.chance) {
      this.stepsSinceEncounter = 0;
      if (this.onEncounter) this.onEncounter();
      return true;
    }
    return false;
  }

  // Reset the streak when the player leaves tall grass.
  resetStreak() {
    this.stepsSinceEncounter = 0;
  }
}
