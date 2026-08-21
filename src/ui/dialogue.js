// =========================================================================
//  DIALOGUE BOX — paged conversation text with a tap-to-advance prompt.
//
//  `show()` resolves once the player has read every page, so callers can
//  simply `await` a conversation before doing anything else.
// =========================================================================
import { VIEW_W, VIEW_H } from '../config.js';
import { panel, label } from './widgets.js';
import { SFX } from '../systems/audio.js';

export class DialogueBox {
  constructor(scene) {
    this.scene = scene;
    this.open = false;

    // Built once and reused — dialogue happens constantly.
    this.panel = panel(scene, 8, VIEW_H - 92, VIEW_W - 16, 84, 400).setVisible(false);
    this.speaker = label(scene, 20, VIEW_H - 84, '', {
      size: '10px', color: '#9fd0ff', depth: 401,
    }).setVisible(false);
    this.text = label(scene, 20, VIEW_H - 68, '', {
      size: '12px', wrapWidth: VIEW_W - 60, lineSpacing: 4, depth: 401,
    }).setVisible(false);
    // Blinking "there's more" arrow, like the source games.
    this.more = label(scene, VIEW_W - 26, VIEW_H - 26, '▼', {
      size: '12px', depth: 401,
    }).setVisible(false);

    this.blink = scene.tweens.add({
      targets: this.more, alpha: { from: 1, to: 0.2 },
      duration: 500, yoyo: true, repeat: -1, paused: true,
    });
  }

  _setVisible(v) {
    this.panel.setVisible(v);
    this.speaker.setVisible(v);
    this.text.setVisible(v);
    this.more.setVisible(v);
    if (v) this.blink.resume(); else this.blink.pause();
  }

  // Show `lines` one page at a time. Resolves when the last page is dismissed.
  show(lines, speakerName = '') {
    const pages = Array.isArray(lines) ? lines : [lines];
    this.open = true;
    this._setVisible(true);
    this.speaker.setText(speakerName ? `${speakerName}:` : '');

    return new Promise((resolve) => {
      let page = 0;
      const render = () => {
        this.text.setText(pages[page]);
        this.more.setText(page < pages.length - 1 ? '▼' : '✕');
      };

      const advance = () => {
        page++;
        if (page >= pages.length) {
          this.scene.input.off('pointerdown', advance);
          this.scene.input.keyboard.off('keydown-SPACE', advance);
          this.scene.input.keyboard.off('keydown-ENTER', advance);
          this._setVisible(false);
          this.open = false;
          SFX.cancel();
          resolve();
          return;
        }
        SFX.select();
        render();
      };

      render();
      // A tap anywhere, or space/enter, turns the page.
      this.scene.input.on('pointerdown', advance);
      this.scene.input.keyboard.on('keydown-SPACE', advance);
      this.scene.input.keyboard.on('keydown-ENTER', advance);
    });
  }
}
