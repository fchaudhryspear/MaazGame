// =========================================================================
//  PLAYER — tile-locked grid mover with tween-based smooth stepping.
//  Owns its animation state and blocks new input while a step is in flight,
//  which is what keeps movement strictly one tile at a time.
// =========================================================================
import { CONFIG, DIR, ANIMS } from '../config.js';
import { SFX } from '../systems/audio.js';

export class Player {
  constructor(scene, matrix, startCol, startRow) {
    this.scene = scene;
    this.matrix = matrix;
    this.col = startCol;
    this.row = startRow;
    this.facing = 'down';
    this.isMoving = false;   // input lock while a step tween runs
    this.running = false;

    const t = CONFIG.TILE;
    this.sprite = scene.add.sprite(
      startCol * t + t / 2,
      startRow * t + t / 2,
      'player',
      1 // idle-down
    );
    this.sprite.setDepth(10);

    this._buildAnimations();
  }

  _buildAnimations() {
    const anims = this.scene.anims;
    for (const [dir, info] of Object.entries(ANIMS)) {
      const base = info.row * 3;
      const key = `walk_${dir}`;
      if (anims.exists(key)) continue;
      anims.create({
        key,
        // step-left, idle, step-right, idle -> one full cycle
        frames: [base + 0, base + 1, base + 2, base + 1].map((f) => ({ key: 'player', frame: f })),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  // Idle frame for the current facing = middle column of that row.
  _idleFrame() {
    return ANIMS[this.facing].row * 3 + 1;
  }

  faceIdle() {
    this.sprite.anims.stop();
    this.sprite.setFrame(this._idleFrame());
  }

  // The tile directly in front of the player, for interactions.
  facingTile() {
    const d = DIR[this.facing];
    return { col: this.col + d.dx, row: this.row + d.dy };
  }

  // Attempt to move one tile. Returns true if a step actually started.
  // Blocked tiles still turn the player to face that way, as in the source
  // games, so you can talk to signs and walls you're standing against.
  tryMove(dirName) {
    if (this.isMoving) return false;
    const d = DIR[dirName];
    if (!d) return false;

    const turning = this.facing !== dirName;
    this.facing = dirName;

    const targetCol = this.col + d.dx;
    const targetRow = this.row + d.dy;

    if (this.matrix.isBlocked(targetCol, targetRow)) {
      this.faceIdle();
      // Only thump when we were already facing the obstacle, so simply
      // turning towards a wall doesn't sound like a collision.
      if (!turning) SFX.bump();
      return false;
    }

    this._stepTo(targetCol, targetRow, dirName);
    return true;
  }

  _stepTo(targetCol, targetRow, dirName) {
    const t = CONFIG.TILE;
    this.isMoving = true;
    this.col = targetCol;
    this.row = targetRow;

    this.sprite.anims.play(`walk_${dirName}`, true);
    SFX.step();

    this.scene.tweens.add({
      targets: this.sprite,
      x: targetCol * t + t / 2,
      y: targetRow * t + t / 2,
      duration: this.running ? CONFIG.RUN_MS : CONFIG.MOVE_MS,
      ease: 'Linear',
      onComplete: () => {
        this.isMoving = false;
        this.faceIdle();
        this.scene.onStepComplete(this.col, this.row);
      },
    });
  }
}
