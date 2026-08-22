// =========================================================================
//  ENDING SCENE — the payoff for beating the champion.
//  A Hall of Fame roll of the player's party, then credits, then back to
//  the world so the save can carry on afterwards.
// =========================================================================
import { VIEW_W, VIEW_H } from '../config.js';
import { SPECIES } from '../data/monsters.js';
import { panel, label, button, UIGroup } from '../ui/widgets.js';
import { buildMonster } from '../assets.js';
import { SFX } from '../systems/audio.js';

export class EndingScene extends Phaser.Scene {
  constructor() {
    super('EndingScene');
  }

  init(data) {
    this.state = data.state;
    this.group = new UIGroup();
  }

  create() {
    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x10131a).setOrigin(0).setDepth(0);

    // Slow starfield sweep behind the roll of honour.
    for (let i = 0; i < 40; i++) {
      const star = this.add.circle(
        Phaser.Math.Between(0, VIEW_W), Phaser.Math.Between(0, VIEW_H),
        Phaser.Math.Between(1, 2), 0xffffff, Phaser.Math.FloatBetween(0.2, 0.7),
      ).setDepth(1);
      this.tweens.add({
        targets: star, alpha: 0.1, duration: Phaser.Math.Between(900, 2200),
        yoyo: true, repeat: -1,
      });
    }

    this.run();
  }

  wait(ms) {
    return new Promise((res) => this.time.delayedCall(ms, res));
  }

  async run() {
    SFX.victory();
    const name = this.state.playerName || 'TRAINER';

    const title = label(this, VIEW_W / 2, 40, 'HALL OF FAME', {
      size: '20px', originX: 0.5, color: '#f5d76e', depth: 10,
    });
    this.group.add(title);
    // Avoid "MAAZ, CHAMPION of MAAZ" when the player keeps the default name.
    const sub = label(this, VIEW_W / 2, 66, `${name} is the CHAMPION!`, {
      size: '12px', originX: 0.5, color: '#ffffff', depth: 10,
    });
    this.group.add(sub);
    await this.wait(900);

    // Each party member walks on in turn.
    const party = this.state.party.slice(0, 6);
    for (let i = 0; i < party.length; i++) {
      const mon = party[i];
      const key = 'mon_' + mon.speciesKey;
      const spec = SPECIES[mon.speciesKey];
      buildMonster(this, key, mon.color, spec.shape || 'blob', spec.stage || 1);

      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = VIEW_W / 2 + (col - 1) * 110;
      const y = 130 + row * 92;

      const spr = this.add.image(x, y - 20, key).setDepth(10).setScale(0).setAlpha(0);
      const cap = label(this, x, y + 22, `${mon.name}  Lv${mon.level}`, {
        size: '10px', originX: 0.5, depth: 10,
      }).setAlpha(0);
      this.group.add(spr, cap);

      SFX.select();
      this.tweens.add({ targets: spr, scale: 1.3, alpha: 1, duration: 380, ease: 'Back.out' });
      this.tweens.add({ targets: cap, alpha: 1, duration: 380 });
      await this.wait(430);
    }

    await this.wait(700);
    SFX.levelUp();
    const congrats = label(this, VIEW_W / 2, VIEW_H - 74,
      'Thank you for playing MaazGame!', {
        size: '12px', originX: 0.5, color: '#9fd0ff', depth: 10,
      });
    this.group.add(congrats);

    const b = button(this, VIEW_W / 2, VIEW_H - 40, 220, 26, 'CONTINUE ADVENTURE',
      () => this.finish(), { size: '11px', depth: 12 });
    this.group.add(b.rect, b.txt);
  }

  // Returning to the world leaves the save intact, so he can keep playing,
  // re-battle the champion, and finish filling the pokédex.
  finish() {
    SFX.select();
    this.cameras.main.fadeOut(320, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const world = this.scene.get('WorldScene');
      this.scene.stop();
      this.scene.resume('WorldScene');
      world.busy = false;
      world.encounterActive = false;
      world.input.enabled = true;
      if (world.touch) world.touch.setVisible(true);
      world.toast('You are the CHAMPION! Free play continues.', 3000);
    });
  }
}
