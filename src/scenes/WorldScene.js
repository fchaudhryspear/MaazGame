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
import { SPECIES, ITEMS, HELD_ITEMS, MOVES } from '../data/monsters.js';
import { CollisionMatrix } from '../entities/collision.js';
import { Player } from '../entities/player.js';
import { Npc, buildTrainerTeam } from '../entities/npc.js';
import { DialogueBox } from '../ui/dialogue.js';
import { buildAlert } from '../assets.js';
import { TouchControls } from '../ui/touch.js';
import { EncounterManager } from '../systems/encounters.js';
import {
  makeMonster, isFainted, healMonster, xpToNext, setNickname,
  levelUpOnce, pendingEvolution, evolveMonster,
} from '../systems/monster.js';
import { newGameState, loadGame, saveGame } from '../systems/save.js';
import { preloadAllMaps, loadMap, getCachedMap } from '../systems/maploader.js';
import {
  buildTiles, buildPlayerSheet, TILE_VARIANTS, ANIMATED_TILES, DECOR_VARIANTS,
} from '../assets.js';
import { TRAINERS, CHAMPION_ID, candyLevelCap } from '../data/trainers.js';
import { Shop } from '../ui/shop.js';
import { NamePrompt } from '../ui/prompt.js';
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
    this._registerTileAnims();
  }

  // Async because maps are real files. Phaser does not await create(), so
  // update() guards on `this.ready` until the first area is in place.
  async create() {
    this.mapIndex = await preloadAllMaps();

    // The title screen creates and saves the initial state, so a missing save
    // here means the player somehow skipped it — fall back rather than crash.
    this.state = loadGame() || newGameState();

    this.tileLayer = this.add.group();
    this.menuOpen = false;
    this.encounterActive = false;
    this.warping = false;
    this.busy = false;          // a conversation or cutscene owns input
    this.npcs = [];
    this.menuGroup = new UIGroup();
    buildAlert(this);

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
    this._spawnPeople(first);
    this._setupCamera(first);
    this._setupInput();

    this.touch = new TouchControls(this, {
      onAction: () => this.interact(),
      onMenu: () => this.toggleMenu(),
    });

    this.encounters = new EncounterManager({
      onEncounter: () => this.startBattle(),
    });

    this.dialogue = new DialogueBox(this);
    this.shop = new Shop(this, this.state);
    this.prompt = new NamePrompt(this);
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

  // ---- people ----------------------------------------------------------
  // Spawn the map's NPCs and trainers, skipping trainers already beaten so
  // they don't re-challenge, and marking their tiles as blocked.
  _spawnPeople(map) {
    this.npcs.forEach((n) => n.destroy());
    this.npcs = [];

    for (const spec of map.people || []) {
      if (spec.kind === 'trainer' && this.isTrainerDefeated(map.name, spec.name)) {
        // Beaten trainers stay put as ordinary talkers.
        this.npcs.push(new Npc(this, spec));
      } else {
        this.npcs.push(new Npc(this, spec));
      }
    }

    // People block their tile — walking through someone would look wrong.
    for (const npc of this.npcs) {
      if (npc.row < this.matrix.rows && npc.col < this.matrix.cols) {
        this.matrix.blocked[npc.row][npc.col] = true;
      }
    }
  }

  npcAt(col, row) {
    return this.npcs.find((n) => n.col === col && n.row === row) || null;
  }

  trainerKey(mapName, objName) {
    return `${mapName}:${objName}`;
  }

  isTrainerDefeated(mapName, objName) {
    return this.state.defeatedTrainers.includes(this.trainerKey(mapName, objName));
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
          const key = map.tiles[gId].key;
          this.tileLayer.add(this._placeTile(key, c, r, t, 0));
          // Where a path or the water meets grass, fringe that tile on the
          // shared side, so the two surfaces interlock instead of butting
          // into a ruled edge. Grass overhanging water reads as a bank.
          if (key === 'tile_path' || key === 'tile_water') {
            const sides = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];
            for (const [dc, dr, frame] of sides) {
              if (this._groundKey(map, c + dc, r + dr) !== 'tile_grass') continue;
              this.tileLayer.add(
                this.add.image(c * t + t / 2, r * t + t / 2, 'edge_grass', frame)
                  .setDepth(0.4)
              );
            }
          }
          // Roughly one grass tile in eight gets a flower, stone or clover.
          // Sparse on purpose: any denser and the eye picks out the pattern.
          if (key === 'tile_grass') {
            const h = this._tileHash(c + 977, r + 311);
            if (h % 100 < 13) {
              this.tileLayer.add(
                this.add.image(c * t + t / 2, r * t + t / 2, 'decor_grass',
                  (h >>> 8) % DECOR_VARIANTS).setDepth(0.5)
              );
            }
          }
        }
        const dId = map.decor ? map.decor[r][c] : -1;
        if (dId >= 0 && map.tiles[dId]) {
          // Decor sits above ground but below the player.
          this.tileLayer.add(this._placeTile(map.tiles[dId].key, c, r, t, 1));
        }
      }
    }
  }

  // Texture key of a ground tile, or null off the edge of the map.
  _groundKey(map, col, row) {
    if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) return null;
    const id = map.ground[row][col];
    return id >= 0 && map.tiles[id] ? map.tiles[id].key : null;
  }

  // Ground textures are generated as several variants; which one a tile gets
  // is hashed from its position, so a field of grass is varied but identical
  // on every load. Water is the exception: its frames are an animation.
  _placeTile(key, col, row, t, depth) {
    const x = col * t + t / 2, y = row * t + t / 2;

    if (ANIMATED_TILES[key]) {
      const spr = this.add.sprite(x, y, key, 0).setDepth(depth);
      // Stagger the start frame so the whole pond doesn't pulse in unison.
      spr.play({ key: `anim_${key}`, startFrame: (col + row) % ANIMATED_TILES[key].frames });
      return spr;
    }

    const variants = TILE_VARIANTS[key] || 1;
    const frame = variants > 1 ? this._tileHash(col, row) % variants : 0;
    return this.add.image(x, y, key, frame).setDepth(depth);
  }

  // Cheap spatial hash — stable per tile, and scattered enough that variants
  // don't fall into visible diagonal stripes.
  _tileHash(col, row) {
    let h = (col * 73856093) ^ (row * 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  // Register the looping animations for animated ground tiles.
  _registerTileAnims() {
    for (const [key, cfg] of Object.entries(ANIMATED_TILES)) {
      const animKey = `anim_${key}`;
      if (this.anims.exists(animKey)) continue;
      this.anims.create({
        key: animKey,
        frames: Array.from({ length: cfg.frames }, (_, i) => ({ key, frame: i })),
        frameRate: cfg.fps,
        repeat: -1,
      });
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
    this._spawnPeople(map);
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
    this.hudObjects = [...this.hudGroup.items];
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
    this.toastPanel = panel(this, 8, 42, VIEW_W - 16, 32, 220).setVisible(false);
    this.toastText = label(this, 20, 50, '', {
      size: '12px', wrapWidth: VIEW_W - 44, lineSpacing: 3, depth: 221,
    }).setVisible(false);
    this.toastTimer = null;
  }

  // Full-screen overlays (menu, shop, prompts) sit inside the panel, but the
  // HUD is anchored top-left and pokes out past its edge — hide it with them.
  setHudVisible(visible) {
    for (const o of this.hudObjects || []) o.setVisible(visible);
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
    if (this.menuOpen || this.encounterActive || this.warping || this.busy) return;

    const { col, row } = this.player.facingTile();

    // People first — they stand on tiles a sign never would.
    const npc = this.npcAt(col, row);
    if (npc) { this.talkTo(npc); return; }

    const sign = this.map.signs[`${col},${row}`];
    if (sign) {
      SFX.select();
      this.toast(sign, 3200);
      return;
    }
    // Nothing to talk to — a small acknowledgement still feels responsive.
    SFX.cancel();
  }

  // Face the player and run the character's dialogue. A trainer who has not
  // yet been beaten challenges instead of chatting.
  async talkTo(npc) {
    this.busy = true;
    this.touch.setVisible(false);
    this.setHudVisible(false);
    this.hideToast();
    this.pressedDir = null;
    npc.faceTowards(this.player.col, this.player.row);
    SFX.select();

    // The champion is locked until every road trainer has been beaten.
    if (npc.kind === 'trainer' && npc.def.requires
        && !this.isTrainerDefeated(this.map.name, npc.name)) {
      const missing = npc.def.requires.filter((k) => !this.state.defeatedTrainers.includes(k));
      if (missing.length) {
        await this.dialogue.show(
          [...npc.def.lockedLine, `You still need ${missing.length} more win(s).`],
          npc.displayName);
        this._endConversation();
        return;
      }
    }

    if (npc.kind === 'trainer' && !this.isTrainerDefeated(this.map.name, npc.name)) {
      await this.dialogue.show(npc.def.intro, npc.displayName);
      this.startTrainerBattle(npc);
      return;
    }

    // Shopkeeper: talk, then open the shop.
    if (npc.def.shop) {
      await this.dialogue.show(npc.def.lines, npc.displayName);
      await this.shop.open();
      this.persist();
      this._refreshHud();
      this._endConversation();
      return;
    }

    // One-off gift (the ranch hand's sheep).
    if (npc.def.gift && !this.state.gifts.includes(npc.id)) {
      await this.dialogue.show(npc.def.lines, npc.displayName);
      if (this.state.party.length >= CONFIG.PARTY_MAX) {
        await this.dialogue.show(['...but your party is full!'], npc.displayName);
        this._endConversation();
        return;
      }
      const mon = makeMonster(npc.def.gift.species, npc.def.gift.level);
      this.state.gifts.push(npc.id);
      this.state.party.push(mon);
      SFX.caught();
      await this.dialogue.show([`You received a ${mon.name}!`], npc.displayName);

      const nick = await this.prompt.ask(`Nickname for your ${mon.name}?`, '', 10);
      if (nick) setNickname(mon, nick);
      this._refreshHud();
      this.persist();
      this._endConversation();
      return;
    }

    const lines = npc.kind === 'trainer'
      ? [npc.def.afterLine]
      : (npc.def.gift ? npc.def.afterGift : npc.def.lines);
    await this.dialogue.show(lines, npc.displayName);
    this._endConversation();
  }

  // Hand control back after any conversation, shop visit or prompt.
  _endConversation() {
    this.busy = false;
    this.touch.setVisible(true);
    this.setHudVisible(true);
  }

  // Any undefeated trainer watching the tile the player just stepped onto
  // challenges them. Returns true if a challenge started.
  _checkTrainerSight() {
    if (this.busy || this.encounterActive || this.warping) return false;

    for (const npc of this.npcs) {
      if (npc.kind !== 'trainer') continue;
      if (this.isTrainerDefeated(this.map.name, npc.name)) continue;
      if (!npc.sees(this.player.col, this.player.row, this.matrix)) continue;

      this._playAlert(npc);
      return true;
    }
    return false;
  }

  // "!" pops over the trainer, then the challenge dialogue runs.
  async _playAlert(npc) {
    this.busy = true;
    this.touch.setVisible(false);
    this.setHudVisible(false);
    this.pressedDir = null;
    npc.faceTowards(this.player.col, this.player.row);
    SFX.encounter();

    const t = this.map.tileSize;
    const mark = this.add
      .image(npc.col * t + t / 2, npc.row * t + t / 2 - 22, 'alert')
      .setDepth(50);
    mark.setScale(0.4);
    this.tweens.add({ targets: mark, scale: 1, duration: 220, ease: 'Back.out' });

    await new Promise((res) => this.time.delayedCall(700, res));
    mark.destroy();

    await this.dialogue.show(npc.def.intro, npc.displayName);
    this.startTrainerBattle(npc);
  }

  // ---- pause menu ------------------------------------------------------
  toggleMenu() {
    unlockAudio();
    if (this.encounterActive || this.warping || this.busy) return;
    this.menuOpen ? this.closeMenu() : this.openMenu();
  }

  openMenu() {
    this.menuOpen = true;
    // The D-Pad lives at a higher depth than the menu, so hide it outright
    // instead of letting it draw over the panel.
    this.touch.setVisible(false);
    this.setHudVisible(false);
    this.hideToast();
    this.pressedDir = null;
    SFX.select();

    const g = this.menuGroup;
    g.destroy();
    g.add(panel(this, 60, 24, VIEW_W - 120, VIEW_H - 60, 300));
    g.add(label(this, VIEW_W / 2, 34,
      this.state.championBeaten ? 'MENU  ★ CHAMPION' : 'MENU', {
        size: '13px', originX: 0.5, depth: 301,
      }));
    // Money has somewhere to go now, so it belongs on screen.
    g.add(label(this, VIEW_W / 2, 50,
      `${this.state.playerName || 'TRAINER'}   ${this.state.money} coins`, {
        size: '10px', originX: 0.5, color: '#f5d76e', depth: 301,
      }));

    const mk = (y, text, cb) => {
      const b = button(this, VIEW_W / 2, y, 260, 26, text, cb, { size: '11px', depth: 302 });
      g.add(b.rect, b.txt);
    };

    mk(80, 'PARTY', () => this.showParty());
    mk(112, 'BAG', () => this.showBag());
    mk(144, 'POKéDEX', () => this.showDex());
    mk(176, 'SAVE', () => {
      const ok = this.persist();
      if (ok) SFX.save();
      this.closeMenu();
      this.toast(ok ? 'Game saved.' : 'Could not save (storage blocked).');
    });
    mk(208, isMuted() ? 'SOUND: OFF' : 'SOUND: ON', () => { this.toggleMute(); this.openMenu(); });
    mk(252, 'CLOSE', () => { SFX.cancel(); this.closeMenu(); });
  }

  closeMenu() {
    this.menuOpen = false;
    this.menuGroup.destroy();
    this.touch.setVisible(true);
    this.setHudVisible(true);
    this._refreshHud();
  }

  _listScreen(title, lines, emptyText, opts = {}) {
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

    if (opts.footer) {
      g.add(label(this, VIEW_W / 2, VIEW_H - 108, opts.footer, {
        size: '9px', originX: 0.5, color: '#9fd0ff', depth: 301,
      }));
    }
    if (opts.action) {
      const a = button(this, VIEW_W / 2, VIEW_H - 78, 260, 24, opts.action.text,
        opts.action.cb, { size: '10px', depth: 302 });
      g.add(a.rect, a.txt);
    }

    const b = button(this, VIEW_W / 2, VIEW_H - 50, 260, 26, 'BACK', () => {
      SFX.cancel();
      this.openMenu();
    }, { size: '11px', depth: 302 });
    g.add(b.rect, b.txt);
  }

  showParty() {
    const lines = this.state.party.map((m, i) => {
      const tag = isFainted(m) ? ' FAINTED' : (m.status ? ` ${m.status.toUpperCase().slice(0,3)}` : '');
      const held = m.held && HELD_ITEMS[m.held] ? ` ◆${HELD_ITEMS[m.held].name}` : '';
      // Show the species too when a nickname hides it.
      const species = m.nickname ? ` (${SPECIES[m.speciesKey].name})` : '';
      return `${i + 1}. ${m.name}${species} Lv${m.level} ${m.hp}/${m.maxHp}${tag}${held}`;
    });
    this._listScreen('PARTY', lines, 'No monsters.');
  }

  showBag() {
    const lines = Object.entries(this.state.bag)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${ITEMS[k].name}  x${n}`);
    // Held items bought at the shop live in their own stock.
    for (const [k, n] of Object.entries(this.state.heldStock || {})) {
      if (n > 0 && HELD_ITEMS[k]) lines.push(`◆ ${HELD_ITEMS[k].name}  x${n}`);
    }
    lines.push(`${ITEMS.rarecandy.name}  x∞`);
    this._listScreen('BAG', lines, '', {
      action: { text: 'USE RARE CANDY', cb: () => this.showCandyTargets() },
      footer: `Rare Candy raises one level, up to Lv${candyLevelCap()}.`,
    });
  }

  // Pick who eats the candy. Party members already at the cap are listed but
  // disabled, so it is obvious the ceiling exists rather than a tap silently
  // doing nothing.
  showCandyTargets() {
    SFX.select();
    const g = this.menuGroup;
    g.destroy();
    const cap = candyLevelCap();

    g.add(panel(this, 40, 24, VIEW_W - 80, VIEW_H - 60, 300));
    g.add(label(this, VIEW_W / 2, 34, 'RARE CANDY', {
      size: '13px', originX: 0.5, depth: 301,
    }));
    g.add(label(this, VIEW_W / 2, 52, `Raises one level. Cap is Lv${cap}.`, {
      size: '9px', originX: 0.5, color: '#9fd0ff', depth: 301,
    }));

    this.state.party.slice(0, 6).forEach((mon, i) => {
      const atCap = mon.level >= cap;
      const b = button(this, VIEW_W / 2, 76 + i * 28, 300, 24,
        `${mon.name}  Lv${mon.level}${atCap ? '  (MAX)' : ''}`,
        () => this._useCandy(mon),
        { size: '10px', depth: 302, enabled: !atCap });
      g.add(b.rect, b.txt);
    });

    const back = button(this, VIEW_W / 2, VIEW_H - 50, 260, 26, 'BACK', () => {
      SFX.cancel();
      this.showBag();
    }, { size: '11px', depth: 302 });
    g.add(back.rect, back.txt);
  }

  // Feed the candy: one level, then evolve if that level was the trigger.
  _useCandy(mon) {
    const cap = candyLevelCap();
    if (mon.level >= cap) {
      this.closeMenu();
      this.toast(`${mon.name} is already at the Lv${cap} candy cap.`);
      return;
    }

    const before = mon.name;
    const report = levelUpOnce(mon);
    SFX.levelUp();

    let msg = `${before} grew to Lv${report.level}!`;
    if (report.learned) msg += `\nIt learned ${MOVES[report.learned].name}!`;

    const evo = pendingEvolution(mon);
    if (evo) {
      evolveMonster(mon);
      msg += `\n${before} evolved into ${SPECIES[evo].name}!`;
    }

    this.persist();
    this._refreshHud();
    this.closeMenu();
    this.toast(msg);
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

  // Launch a trainer battle: a full team, no catching and no running.
  startTrainerBattle(npc) {
    // Set here rather than only on sight: a trainer can also be challenged by
    // walking up and talking, and that path must still get the defeat line
    // (and, for the champion, the ending).
    this.challengedBy = npc;
    this.encounterActive = true;
    this.busy = false;          // the battle scene owns input from here
    this.touch.setVisible(false);
    this.hideToast();
    this.pressedDir = null;

    const team = buildTrainerTeam(npc.id, makeMonster);

    this.cameras.main.flash(300, 255, 255, 255);
    this.time.delayedCall(320, () => {
      this.input.enabled = false;
      this.scene.launch('BattleScene', {
        state: this.state,
        trainer: {
          key: this.trainerKey(this.map.name, npc.name),
          id: npc.id,
          name: npc.displayName,
          team,
          reward: npc.def.reward ?? 0,
          defeatLine: npc.def.defeatLine,
        },
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
    this.setHudVisible(true);

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

    // A beaten trainer has a parting line; losing to one just returns you home.
    if (result === 'trainerWin' && this.challengedBy
        && this.challengedBy.id === CHAMPION_ID) {
      const npc = this.challengedBy;
      this.challengedBy = null;
      this.state.championBeaten = true;
      this.persist();
      this.time.delayedCall(400, async () => {
        this.busy = true;
        this.touch.setVisible(false);
        await this.dialogue.show([npc.def.defeatLine], npc.displayName);
        this.scene.launch('EndingScene', { state: this.state });
        this.scene.pause();
      });
      return;
    }

    if (result === 'trainerWin' && this.challengedBy) {
      const npc = this.challengedBy;
      this.challengedBy = null;
      this.time.delayedCall(400, async () => {
        this.busy = true;
        this.touch.setVisible(false);
        await this.dialogue.show([npc.def.defeatLine], npc.displayName);
        this.busy = false;
        this.touch.setVisible(true);
      });
    } else {
      this.challengedBy = null;
    }
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

    // A watching trainer interrupts before any wild encounter can roll.
    if (this._checkTrainerSight()) return;

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
    if (this.encounterActive || this.menuOpen || this.warping || this.busy) return;

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
