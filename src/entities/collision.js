// =========================================================================
//  COLLISION MATRIX
//  Precomputes a boolean[row][col] grid of blocked tiles for a loaded map,
//  so movement checks are O(1) lookups instead of re-reading tile configs.
//
//  Walkability comes from the map's own tileset, so a map is fully
//  self-describing — nothing here needs to know what a "tree" is.
// =========================================================================

export class CollisionMatrix {
  constructor(map) {
    this.cols = map.cols;
    this.rows = map.rows;
    this.blocked = [];

    const blocks = (id) => id >= 0 && map.tiles[id] && !map.tiles[id].walkable;

    for (let r = 0; r < map.rows; r++) {
      const row = [];
      for (let c = 0; c < map.cols; c++) {
        const ground = map.ground[r][c];
        const decor = map.decor ? map.decor[r][c] : -1;
        row.push(blocks(ground) || blocks(decor));
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
