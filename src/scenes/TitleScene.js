// =========================================================================
//  TITLE SCENE — the front door: new game, or continue a save.
//  Also where a new player names their trainer.
// =========================================================================
import { VIEW_W, VIEW_H, UI } from '../config.js';
import { panel, label, button, UIGroup } from '../ui/widgets.js';
import { NamePrompt } from '../ui/prompt.js';
import { loadGame, hasSave, clearSave, newGameState, saveGame } from '../systems/save.js';
import { buildTiles, buildPlayerSheet, buildMonster } from '../assets.js';
import { SPECIES } from '../data/monsters.js';
import { SFX, unlock as unlockAudio } from '../systems/audio.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  preload() {
    buildTiles(this);
    buildPlayerSheet(this);
  }

  create() {
    this.group = new UIGroup();
    this.prompt = new NamePrompt(this);

    // Grass backdrop, so the title looks like the world it opens into.
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x57a44b).setOrigin(0).setDepth(0);
    for (let x = 0; x < VIEW_W; x += 32) {
      for (let y = 0; y < VIEW_H; y += 32) {
        const col = x / 32, row = y / 32;
        this.add.image(x + 16, y + 16, 'tile_grass', (col * 3 + row * 7) % 4).setDepth(0);
        // Same sparse scatter as the overworld, so the title screen is made
        // of the world rather than a flat green sheet.
        if ((col * 5 + row * 11) % 9 === 0) {
          this.add.image(x + 16, y + 16, 'decor_grass', (col + row) % 4).setDepth(0);
        }
      }
    }

    // A sheep and the starter flank the title.
    buildMonster(this, 'title_sheep', SPECIES.lamblet.color, 'sheep');
    buildMonster(this, 'title_starter', SPECIES.maaz.color, SPECIES.maaz.shape, 1);
    const sheep = this.add.image(96, 150, 'title_sheep').setDepth(2).setScale(1.6);
    const starter = this.add.image(VIEW_W - 96, 150, 'title_starter').setDepth(2).setScale(1.6);
    // Gentle bob, so the screen isn't static.
    [sheep, starter].forEach((s, i) => this.tweens.add({
      targets: s, y: s.y - 6, duration: 1300, yoyo: true, repeat: -1,
      ease: 'Sine.inOut', delay: i * 400,
    }));

    this._buildMenu();

    // Any first interaction unlocks audio (iOS requires a gesture).
    this.input.on('pointerdown', () => unlockAudio());
    this.input.keyboard.on('keydown', () => unlockAudio());

    this.ready = true;
  }

  _buildMenu(message = '') {
    const g = this.group;
    g.destroy();

    g.add(panel(this, VIEW_W / 2 - 130, 34, 260, 62, 100));
    g.add(label(this, VIEW_W / 2, 46, 'MaazGame', {
      size: '22px', originX: 0.5, color: '#f5d76e', depth: 101,
    }));
    g.add(label(this, VIEW_W / 2, 74, 'a monster-catching adventure', {
      size: '9px', originX: 0.5, color: '#cfd8e3', depth: 101,
    }));

    const save = loadGame();
    let y = 214;

    if (save) {
      const lead = save.party[0];
      const b = button(this, VIEW_W / 2, y, 250, 28,
        `CONTINUE — ${save.playerName || 'TRAINER'}`, () => this._continue(), {
          size: '11px', depth: 102,
        });
      g.add(b.rect, b.txt);
      g.add(label(this, VIEW_W / 2, y + 20,
        `${lead.name} Lv${lead.level} · ${save.party.length} in party · ${save.money} coins`, {
          size: '9px', originX: 0.5, color: '#cfd8e3', depth: 101,
        }));
      y += 46;
    }

    const nb = button(this, VIEW_W / 2, y, 250, 28,
      save ? 'NEW GAME (erases save)' : 'NEW GAME', () => this._newGame(!!save), {
        size: '11px', depth: 102,
      });
    g.add(nb.rect, nb.txt);

    if (message) {
      g.add(label(this, VIEW_W / 2, y + 30, message, {
        size: '10px', originX: 0.5, color: '#ffb4b4', depth: 101,
      }));
    }
  }

  _continue() {
    SFX.select();
    this.scene.start('WorldScene');
  }

  async _newGame(hadSave) {
    SFX.select();
    if (hadSave && !this._confirmed) {
      this._confirmed = true;
      this._buildMenu('Tap NEW GAME again to erase your save.');
      return;
    }

    // Name the trainer. Blank keeps the default.
    const name = await this.prompt.ask('What is your name?', 'MAAZ', 10);
    const state = newGameState();
    state.playerName = name;
    // The starter arrives already nicknamed, so it feels like his from turn one.
    const nick = await this.prompt.ask(`Nickname for your ${state.party[0].name}?`, 'Maazu', 10);
    if (nick) {
      state.party[0].nickname = nick;
      state.party[0].name = nick;
    }

    clearSave();
    saveGame(state);
    this.scene.start('WorldScene');
  }
}
