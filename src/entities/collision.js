// =========================================================================
//  COLLISION MATRIX
//  Precomputes a boolean[row][col] grid of blocked tiles from the map data,
//  so movement checks are O(1) lookups instead of re-reading tile configs.
// =========================================================================
import { TILES } from '../data/world.js';

export class CollisionMatrix {
  constructor(map) {
    this.cols = map.cols;
    this.rows = map.rows;
    this.blocked = [];

    for (let r = 0; r < map.rows; r++) {
      const row = [];
      for (let c = 0; c < map.cols; c++) {
        const groundId = map.ground[r][c];
        const decorId = map.decor[r][c];
        const groundBlocks = groundId >= 0 && !TILES[groundId].walkable;
        const decorBlocks = decorId >= 0 && !TILES[decorId].walkable;
        row.push(groundBlocks || decorBlocks);
      }
      this.blocked.push(row);
    }
  }

  // True if (col,row) is off-map or blocked — i.e. cannot be entered.
  isBlocked(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true;
    return this.blocked[row][col];
  }
}
