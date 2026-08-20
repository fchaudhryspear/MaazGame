// =========================================================================
//  WORLD SCENE — the overworld: renders the current area, drives the
//  player, handles warps between areas, watches for encounters, and hosts
//  the pause menu.
//
//  Areas are Tiled JSON maps loaded at boot; switching between them swaps
//  the rendered tiles and collision matrix in place rather than restarting
//  the scene, so the camera, HUD and touch controls survive a transition.
// =========================================================================
import { CONFIG, VIEW_W, VIEW_H } from '../config.js';
import { SPECIES, ITEMS } from '../data/monsters.js';
import { CollisionMatrix } from '../entities/collision.js';
import { Player } from '../entities/player.js';
import { TouchControls } from '../ui/touch.js';
import { EncounterManager } from '../systems/encounters.js';
import { makeMonster, isFainted, healMonster, xpToNext } from '../systems/monster.js';
import { newGameState, loadGame, saveGame } from '../systems/save.js';
import { preloadAllMaps, loadMap, getCachedMap } from '../systems/maploader.js';
import { buildTiles, buildPlayerSheet } from '../assets.js';
import { panel, label, button, UIGroup } from '../ui/widgets.js';
import { SFX, unlock as unlockAudio, setMuted, isMuted } from '../systems/audio.js';

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
  }

  preload() {
    // All art is procedurally generated — nothing to load from disk.
    buildTiles(this);
    buildPlayerSheet(this);
  }

  // Async because maps are real files. Phaser does not await create(), so
  // update() guards on `this.ready` until the first area is in place.
  async create() {
    this.mapIndex = await preloadAllMaps();

    this.state = loadGame() || newGameState();

    this.tileLayer = this.add.group();
    this.menuOpen = false;
    this.encounterActive = false;
    this.warping = false;
    this.menuGroup = new UIGroup();

    // Place the player before the first map render so the camera has a
    // target to follow immediately.
    const startMap = getCachedMap(this.state.mapId) ? this.state.mapId : this.mapIndex.start.map;
    const first = await loadMap(startMap);
    this.map = first;
    this.matrix = new CollisionMatrix(first);

    const pos = this._resolveStart(first);
    this.player = new Player(this, this.matrix, pos.col, pos.row);
    this.player.facing = pos.facing;
    this.player.faceIdle();

    this._renderMap(first);
    this._setupCamera(first);
    this._setupInput();

    this.touch = new TouchControls(this, {
      onAction: () => this.interact(),
      onMenu: () => this.toggleMenu(),
    });

    this.encounters = new EncounterManager({
      onEncounter: () => this.startBattle(),
    });

    this._buildHud();
    this._buildToast();
    this._refreshHud();
    this.toast(first.displayName, 1800);

    // Autosave when the tab is hidden (iOS may kill a backgrounded PWA).
    this._onHide = () => { if (!this.encounterActive) this.persist(); };
    document.addEventListener('visibilitychange', this._onHide);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', this._onHide);
    });

    this.ready = true;
  }

  // Prefer the saved position, but fall back to the map's own spawn if it
  // is missing or has become invalid (e.g. the map was edited since saving).
  _resolveStart(map) {
    const saved = this.state.pos;
    const matrix = this.matrix;
    if (saved && this.state.mapId === map.name
        && !matrix.isBlocked(saved.col, saved.row)) {
      return { col: saved.col, row: saved.row, facing: saved.facing || map.spawn.facing };
    }
    return { col: map.spawn.col, row: map.spawn.row, facing: map.spawn.facing };
  }

  // ---- map rendering ---------------------------------------------------
  // Tiles are plain images pooled in a group; switching areas clears and
  // redraws it. At these map sizes that is far simpler than a Tilemap and
  // costs a couple of milliseconds.
  _renderMap(map) {
    this.tileLayer.clear(true, true);
    const t = map.tileSize;

    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const gId = map.ground[r][c];
        if (gId >= 0 && map.tiles[gId]) {
          const img = this.add
            .image(c * t + t / 2, r * t + t / 2, map.tiles[gId].key)
            .setDepth(0);
          this.tileLayer.add(img);
        }
        const dId = map.decor ? map.decor[r][c] : -1;
        if (dId >= 0 && map.tiles[dId]) {
          // Decor sits above ground but below the player.
          const img = this.add
            .image(c * t + t / 2, r * t + t / 2, map.tiles[dId].key)
            .setDepth(1);
          this.tileLayer.add(img);
        }
      }
    }
  }

  _setupCamera(map) {
    const t = map.tileSize;
    this.cameras.main.setBounds(0, 0, map.cols * t, map.rows * t);
    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    this.cameras.main.setRoundPixels(true);
  }

  // Swap to another area: fade out, rebuild everything, fade back in.
  async warpTo(mapName, col, row, facing) {
    if (this.warping) return;
    this.warping = true;
    this.touch.setVisible(false);
    this.hideToast();
    this.pressedDir = null;
    SFX.select();

    await new Promise((res) => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', res);
    });

    const map = await loadMap(mapName);
    this.map = map;
    this.matrix = new CollisionMatrix(map);
    this.player.matrix = this.matrix;

    this._renderMap(map);
    this._setupCamera(map);
    this.placePlayer(col, row, facing);

    this.state.mapId = map.name;
    this.encounters.resetStreak();
    this.persist();

    this.cameras.main.fadeIn(220, 0, 0, 0);
    this.touch.setVisible(true);
    this.warping = false;
    this.toast(map.displayName, 1600);
  }

  // Move the player without a transition (spawns, blackouts, warps).
  placePlayer(col, row, facing) {
    const t = this.map.tileSize;
    this.player.col = col;
    this.player.row = row;
    this.player.isMoving = false;
    this.player.sprite.x = col * t + t / 2;
    this.player.sprite.y = row * t + t / 2;
    if (facing) this.player.facing = facing;
    this.player.faceIdle();
    this.cameras.main.centerOn(this.player.sprite.x, this.player.sprite.y);
  }

  _setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      run: Phaser.Input.Keyboard.KeyCodes.SHIFT,
    });

    // Set by the touch D-Pad; the keyboard path falls through to it.
    this.pressedDir = null;

    this.input.keyboard.on('keydown-SPACE', () => this.interact());
    this.input.keyboard.on('keydown-ENTER', () => this.interact());
    this.input.keyboard.on('keydown-ESC', () => this.toggleMenu());
    this.input.keyboard.on('keydown-M', () => this.toggleMute());

    // iOS refuses to start audio outside a user gesture, so unlock on the
    // first interaction of any kind.
    const unlock = () => unlockAudio();
    this.input.on('pointerdown', unlock);
    this.input.keyboard.on('keydown', unlock);
  }

  // A compact status strip: lead monster, HP, party count and area name.
  _buildHud() {
    this.hudGroup = new UIGroup();
    this.hudGroup.add(panel(this, 6, 6, 168, 30, 200));
    this.hudName = label(this, 12, 10, '', { size: '10px', depth: 201 });
    this.hudHp = label(this, 12, 22, '', { size: '9px', depth: 201 });
    this.hudGroup.add(this.hudName, this.hudHp);
  }

  _refreshHud() {
    const lead = this.state.party.find((m) => !isFainted(m)) || this.state.party[0];
    this.hudName.setText(`${lead.name}  Lv${lead.level}`);
    this.hudHp.setText(
      `HP ${lead.hp}/${lead.maxHp}  Party ${this.state.party.length}/${CONFIG.PARTY_MAX}`
    );
  }

  // Transient text for signs, healing and saving. It sits just under the HUD
  // rather than at the bottom, where it would collide with the D-Pad.
  _buildToast() {
    this.toastPanel = panel(this, 8, 42, VIEW_W - 16, 70, 220).setVisible(false);
    this.toastText = label(this, 20, 50, '', {
      size: '12px', wrapWidth: VIEW_W - 44, lineSpacing: 3, depth: 221,
    }).setVisible(false);
    this.toastTimer = null;
  }

  hideToast() {
    if (this.toastTimer) { this.toastTimer.remove(false); this.toastTimer = null; }
    this.toastPanel.setVisible(false);
    this.toastText.setVisible(false);
  }

  toast(text, ms = 2200) {
    this.toastPanel.setVisible(true);
    this.toastText.setVisible(true).setText(text);
    if (this.toastTimer) this.toastTimer.remove(false);
    this.toastTimer = this.time.delayedCall(ms, () => this.hideToast());
  }

  // ---- interaction -----------------------------------------------------
  interact() {
    unlockAudio();
    if (this.menuOpen || this.encounterActive || this.warping) return;

    const { col, row } = this.player.facingTile();
    const sign = this.map.signs[`${col},${row}`];
    if (sign) {
      SFX.select();
      this.toast(sign, 3200);
      return;
    }
    // Nothing to talk to — a small acknowledgement still feels responsive.
    SFX.cancel();
  }

  // ---- pause menu ------------------------------------------------------
  toggleMenu() {
    unlockAudio();
    if (this.encounterActive || this.warping) return;
    this.menuOpen ? this.closeMenu() : this.openMenu();
  }

  openMenu() {
    this.menuOpen = true;
    // The D-Pad lives at a higher depth than the menu, so hide it outright
    // instead of letting it draw over the panel.
    this.touch.setVisible(false);
    this.hideToast();
    this.pressedDir = null;
    SFX.select();

    const g = this.menuGroup;
    g.destroy();
    g.add(panel(this, 60, 24, VIEW_W - 120, VIEW_H - 60, 300));
    g.add(label(this, VIEW_W / 2, 34, 'MENU', { size: '13px', originX: 0.5, depth: 301 }));

    const mk = (y, text, cb) => {
      const b = button(this, VIEW_W / 2, y, 260, 26, text, cb, { size: '11px', depth: 302 });
      g.add(b.rect, b.txt);
    };

    mk(70, 'PARTY', () => this.showParty());
    mk(104, 'BAG', () => this.showBag());
    mk(138, 'POKéDEX', () => this.showDex());
    mk(172, 'SAVE', () => {
      const ok = this.persist();
      if (ok) SFX.save();
      this.closeMenu();
      this.toast(ok ? 'Game saved.' : 'Could not save (storage blocked).');
    });
    mk(206, isMuted() ? 'SOUND: OFF' : 'SOUND: ON', () => { this.toggleMute(); this.openMenu(); });
    mk(250, 'CLOSE', () => { SFX.cancel(); this.closeMenu(); });
  }

  closeMenu() {
    this.menuOpen = false;
    this.menuGroup.destroy();
    this.touch.setVisible(true);
    this._refreshHud();
  }

  _listScreen(title, lines, emptyText) {
    const g = this.menuGroup;
    g.destroy();
    g.add(panel(this, 40, 24, VIEW_W - 80, VIEW_H - 60, 300));
    g.add(label(this, VIEW_W / 2, 34, title, { size: '13px', originX: 0.5, depth: 301 }));

    if (!lines.length) {
      g.add(label(this, VIEW_W / 2, 120, emptyText, {
        size: '11px', originX: 0.5, depth: 301,
      }));
    } else {
      lines.slice(0, 7).forEach((line, i) => {
        g.add(label(this, 60, 62 + i * 24, line, { size: '11px', depth: 301 }));
      });
    }

    const b = button(this, VIEW_W / 2, VIEW_H - 50, 260, 26, 'BACK', () => {
      SFX.cancel();
      this.openMenu();
    }, { size: '11px', depth: 302 });
    g.add(b.rect, b.txt);
  }

  showParty() {
    const lines = this.state.party.map((m, i) => {
      const tag = isFainted(m) ? ' FAINTED' : '';
      const xpPct = Math.floor((m.xp / xpToNext(m.level)) * 100);
      return `${i + 1}. ${m.name} Lv${m.level}  ${m.hp}/${m.maxHp}  XP ${xpPct}%${tag}`;
    });
    this._listScreen('PARTY', lines, 'No monsters.');
  }

  showBag() {
    const lines = Object.entries(this.state.bag)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${ITEMS[k].name}  x${n}`);
    this._listScreen('BAG', lines, 'Your bag is empty.');
  }

  showDex() {
    const total = Object.keys(SPECIES).length;
    const lines = Object.keys(SPECIES).map((k) => {
      const caught = this.state.caught.includes(k);
      const seen = this.state.seen.includes(k);
      const mark = caught ? '[*]' : seen ? '[-]' : '[ ]';
      return `${mark} ${caught || seen ? SPECIES[k].name : '???'}`;
    });
    lines.unshift(`Seen ${this.state.seen.length}/${total}  Caught ${this.state.caught.length}/${total}`);
    this._listScreen('POKéDEX', lines, '');
  }

  toggleMute() {
    setMuted(!isMuted());
    if (!isMuted()) SFX.select();
  }

  // ---- battles ---------------------------------------------------------
  // Start a battle. With no argument it rolls a wild monster from the
  // current area's encounter table and does nothing in a safe area; passing
  // a monster forces the battle regardless (scripted/trainer encounters).
  startBattle(forcedMon = null) {
    let wild = forcedMon;
    if (!wild) {
      const table = this.map.encounters;
      if (!table || !table.pool.length) return false;   // safe area
      const key = table.pool[Math.floor(Math.random() * table.pool.length)];
      wild = makeMonster(key, Phaser.Math.Between(table.min, table.max));
    }

    this.encounterActive = true;
    this.touch.setVisible(false);
    this.hideToast();
    this.pressedDir = null;
    SFX.encounter();

    this.cameras.main.flash(300, 255, 255, 255);
    this.time.delayedCall(320, () => {
      this.input.enabled = false;   // stop the paused world eating touches
      this.scene.launch('BattleScene', {
        state: this.state,
        enemyMon: wild,
        onEnd: (result) => this.onBattleEnd(result),
      });
      this.scene.pause();
    });
    return true;
  }

  onBattleEnd(result) {
    this.encounterActive = false;
    this.pressedDir = null;
    this.input.enabled = true;
    if (this.touch) this.touch.setVisible(true);

    if (result === 'lose') {
      // Blackout: heal up and return to the start of the world.
      this.state.party.forEach(healMonster);
      const start = this.mapIndex.start;
      this.warpTo(start.map, start.col, start.row, start.facing);
      this.toast('Your party was healed at MAAZ TOWN.');
      SFX.heal();
    }

    this._refreshHud();
    this.persist();   // autosave after every battle
  }

  // ---- steps -----------------------------------------------------------
  // Called by Player when a step tween finishes.
  onStepComplete(col, row) {
    const key = `${col},${row}`;

    // Warps take priority: stepping onto the pad leaves the area.
    const warp = this.map.warps[key];
    if (warp) {
      this.warpTo(warp.toMap, warp.toCol, warp.toRow, warp.facing);
      return;
    }

    // Standing on a healing pad restores the party — a mini Pokécentre.
    if (this.map.heals.has(key)) {
      const hurt = this.state.party.some((m) => m.hp < m.maxHp);
      if (hurt) {
        this.state.party.forEach(healMonster);
        SFX.heal();
        this.toast('Your party was fully healed!');
        this._refreshHud();
        this.persist();
      }
    }

    const gId = this.map.ground[row][col];
    const tile = gId >= 0 ? this.map.tiles[gId] : null;
    if (tile && tile.encounter) this.encounters.onGrassStep();
    else this.encounters.resetStreak();
  }

  persist() {
    if (!this.player || !this.map) return false;
    this.state.mapId = this.map.name;
    this.state.pos = {
      col: this.player.col, row: this.player.row, facing: this.player.facing,
    };
    return saveGame(this.state);
  }

  // ---- main loop -------------------------------------------------------
  update() {
    // create() is async, so guard until the first map is in place.
    if (!this.ready) return;
    // Freeze the overworld while a battle, menu or transition owns the screen.
    if (this.encounterActive || this.menuOpen || this.warping) return;

    this.player.running = this.keys.run.isDown;

    let dir = this.pressedDir;   // set by the touch D-Pad
    if (!dir) {
      if (this.cursors.left.isDown || this.keys.left.isDown) dir = 'left';
      else if (this.cursors.right.isDown || this.keys.right.isDown) dir = 'right';
      else if (this.cursors.up.isDown || this.keys.up.isDown) dir = 'up';
      else if (this.cursors.down.isDown || this.keys.down.isDown) dir = 'down';
    }

    if (dir) this.player.tryMove(dir);
  }
}
