// =========================================================================
//  WORLD SCENE — the overworld: renders both tile layers, drives the
//  player, watches for encounters, and hosts the pause menu.
// =========================================================================
import { CONFIG, VIEW_W, VIEW_H } from '../config.js';
import { MAP, TILES, SIGNS, HEAL_TILES } from '../data/world.js';
import { WILD_POOL, WILD_LEVELS, SPECIES, ITEMS } from '../data/monsters.js';
import { CollisionMatrix } from '../entities/collision.js';
import { Player } from '../entities/player.js';
import { TouchControls } from '../ui/touch.js';
import { EncounterManager } from '../systems/encounters.js';
import { makeMonster, isFainted, healMonster, xpToNext } from '../systems/monster.js';
import { newGameState, loadGame, saveGame } from '../systems/save.js';
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

  create() {
    // Continue from a save if there is one, otherwise start fresh.
    this.state = loadGame() || newGameState();

    this.matrix = new CollisionMatrix(MAP);
    this._renderMap();

    const start = this.state.pos || MAP.spawn;
    const spawnOk = !this.matrix.isBlocked(start.col, start.row);
    this.player = new Player(
      this, this.matrix,
      spawnOk ? start.col : MAP.spawn.col,
      spawnOk ? start.row : MAP.spawn.row,
    );

    // Camera follows the player, clamped to the map so we never scroll past
    // the edge of the world.
    const t = CONFIG.TILE;
    this.cameras.main.setBounds(0, 0, MAP.cols * t, MAP.rows * t);
    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    this.cameras.main.setRoundPixels(true);

    this._setupInput();

    this.touch = new TouchControls(this, {
      onAction: () => this.interact(),
      onMenu: () => this.toggleMenu(),
    });

    this.encounterActive = false;
    this.menuOpen = false;
    this.menuGroup = new UIGroup();
    this.encounters = new EncounterManager({
      onEncounter: () => this.startBattle(),
    });

    this._buildHud();
    this._buildToast();

    // Autosave when the tab is hidden (iOS may kill a backgrounded PWA).
    this._onHide = () => { if (!this.encounterActive) this.persist(); };
    document.addEventListener('visibilitychange', this._onHide);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', this._onHide);
    });
  }

  // Draw ground first, then decor on top. Static images are fine at this
  // map size; a much larger world would want a real Phaser Tilemap.
  _renderMap() {
    const t = CONFIG.TILE;
    this.groundLayer = this.add.group();
    this.decorLayer = this.add.group();

    for (let r = 0; r < MAP.rows; r++) {
      for (let c = 0; c < MAP.cols; c++) {
        const gId = MAP.ground[r][c];
        if (gId >= 0) {
          const img = this.add.image(c * t + t / 2, r * t + t / 2, TILES[gId].key).setDepth(0);
          this.groundLayer.add(img);
        }
        const dId = MAP.decor[r][c];
        if (dId >= 0) {
          // Decor sits above ground but below the player.
          const img = this.add.image(c * t + t / 2, r * t + t / 2, TILES[dId].key).setDepth(1);
          this.decorLayer.add(img);
        }
      }
    }
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

  // A compact status strip: lead monster, HP, and party count.
  _buildHud() {
    this.hudGroup = new UIGroup();
    this.hudGroup.add(panel(this, 6, 6, 150, 30, 200));
    this.hudName = label(this, 12, 10, '', { size: '10px', depth: 201 });
    this.hudHp = label(this, 12, 22, '', { size: '9px', depth: 201 });
    this.hudGroup.add(this.hudName, this.hudHp);
    this._refreshHud();
  }

  _refreshHud() {
    const lead = this.state.party.find((m) => !isFainted(m)) || this.state.party[0];
    this.hudName.setText(`${lead.name}  Lv${lead.level}`);
    this.hudHp.setText(`HP ${lead.hp}/${lead.maxHp}   Party ${this.state.party.length}/${CONFIG.PARTY_MAX}`);
  }

  // Transient text for signs, healing and saving. It sits just under the HUD
  // rather than at the bottom, where it would collide with the D-Pad.
  _buildToast() {
    // Sized for three wrapped lines, which is the longest sign text.
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
    this.toastTimer = this.time.delayedCall(ms, () => {
      this.toastPanel.setVisible(false);
      this.toastText.setVisible(false);
    });
  }

  // ---- interaction -----------------------------------------------------
  interact() {
    unlockAudio();
    if (this.menuOpen || this.encounterActive) return;

    const { col, row } = this.player.facingTile();
    const sign = SIGNS[`${col},${row}`];
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
    if (this.encounterActive) return;
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
      if (this.persist()) { SFX.save(); this.toast('Game saved.'); }
      else this.toast('Could not save (storage blocked).');
      this.closeMenu();
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

  // A scrollable-free list view reused by the party / bag / dex screens.
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
  startBattle() {
    this.encounterActive = true;
    this.touch.setVisible(false);
    this.hideToast();
    this.pressedDir = null;
    SFX.encounter();

    const key = WILD_POOL[Math.floor(Math.random() * WILD_POOL.length)];
    const level = Phaser.Math.Between(WILD_LEVELS.min, WILD_LEVELS.max);
    const wild = makeMonster(key, level);

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
  }

  onBattleEnd(result) {
    this.encounterActive = false;
    this.pressedDir = null;
    this.input.enabled = true;
    if (this.touch) this.touch.setVisible(true);

    if (result === 'lose') {
      // Blackout: heal up and return to the start point.
      this.state.party.forEach(healMonster);
      this.warpTo(MAP.spawn.col, MAP.spawn.row);
      this.toast('Your party was healed at MAAZ TOWN.');
      SFX.heal();
    }

    this._refreshHud();
    this.persist();   // autosave after every battle
  }

  warpTo(col, row) {
    const t = CONFIG.TILE;
    this.player.col = col;
    this.player.row = row;
    this.player.isMoving = false;
    this.player.sprite.x = col * t + t / 2;
    this.player.sprite.y = row * t + t / 2;
    this.player.faceIdle();
    this.encounters.resetStreak();
  }

  // ---- steps -----------------------------------------------------------
  // Called by Player when a step tween finishes.
  onStepComplete(col, row) {
    const key = `${col},${row}`;

    // Standing on a healing tile restores the party — a mini Pokécentre.
    if (HEAL_TILES.includes(key)) {
      const hurt = this.state.party.some((m) => m.hp < m.maxHp);
      if (hurt) {
        this.state.party.forEach(healMonster);
        SFX.heal();
        this.toast('Your party was fully healed!');
        this._refreshHud();
        this.persist();
      }
    }

    const gId = MAP.ground[row][col];
    const onTallGrass = gId >= 0 && TILES[gId].encounter;
    if (onTallGrass) this.encounters.onGrassStep();
    else this.encounters.resetStreak();
  }

  persist() {
    this.state.pos = { col: this.player.col, row: this.player.row };
    return saveGame(this.state);
  }

  // ---- main loop -------------------------------------------------------
  update() {
    // Freeze the overworld while a battle or menu owns the screen.
    if (this.encounterActive || this.menuOpen) return;

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
