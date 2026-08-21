// =========================================================================
//  NAME PROMPT — an on-screen keyboard for naming the player and monsters.
//
//  A DOM <input> would be simpler, but it fights the canvas on iPad (the
//  soft keyboard resizes the viewport and breaks the Scale Manager), so the
//  keyboard is drawn in-game. Hardware keys work too, for desktop.
// =========================================================================
import { VIEW_W, VIEW_H } from '../config.js';
import { panel, label, button, UIGroup } from './widgets.js';
import { SFX } from '../systems/audio.js';

const ROWS = [
  'ABCDEFGHIJ',
  'KLMNOPQRST',
  'UVWXYZ0123',
  '456789 -.!',
];

export class NamePrompt {
  constructor(scene) {
    this.scene = scene;
    this.group = new UIGroup();
  }

  // Resolves with the entered name, or `fallback` if left blank.
  ask(title, fallback = '', maxLength = 10) {
    this.value = '';
    this.fallback = fallback;
    this.maxLength = maxLength;
    this.title = title;

    return new Promise((resolve) => {
      this.resolve = resolve;
      this._keyHandler = (event) => this._onKey(event);
      this.scene.input.keyboard.on('keydown', this._keyHandler);
      this._render();
    });
  }

  _finish(value) {
    this.scene.input.keyboard.off('keydown', this._keyHandler);
    this.group.destroy();
    const r = this.resolve;
    this.resolve = null;
    if (r) r(value);
  }

  _onKey(event) {
    const k = event.key;
    if (k === 'Enter') { SFX.select(); this._finish(this.value.trim() || this.fallback); return; }
    if (k === 'Backspace') { this._type(null); return; }
    if (k.length === 1 && /[A-Za-z0-9 \-.!]/.test(k)) this._type(k.toUpperCase());
  }

  _type(ch) {
    if (ch === null) this.value = this.value.slice(0, -1);
    else if (this.value.length < this.maxLength) this.value += ch;
    else return;
    SFX.select();
    this._renderValue();
  }

  _renderValue() {
    // Dots mark the characters still available — clearer than underscores,
    // which sit on the baseline and vanish against the field border.
    const left = Math.max(0, this.maxLength - this.value.length);
    this.valueText.setText(this.value + '·'.repeat(left));
  }

  _render() {
    const g = this.group;
    g.destroy();

    // Full-screen dim first: the panel is slightly translucent, so without
    // this the title screen behind it bleeds through and looks muddled.
    g.add(this.scene.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x05070c, 0.96)
      .setOrigin(0).setScrollFactor(0).setDepth(499));
    g.add(panel(this.scene, 20, 22, VIEW_W - 40, VIEW_H - 48, 500));
    g.add(label(this.scene, VIEW_W / 2, 34, this.title, {
      size: '12px', originX: 0.5, depth: 501,
    }));

    // A bordered field, so it's obvious where the typed name appears.
    g.add(this.scene.add
      .rectangle(VIEW_W / 2, 62, 190, 24, 0x0d1420, 1)
      .setStrokeStyle(1, 0xffffff, 0.5)
      .setScrollFactor(0).setDepth(500));
    this.valueText = label(this.scene, VIEW_W / 2, 62, '', {
      size: '15px', originX: 0.5, originY: 0.5, color: '#f5d76e', depth: 501,
    });
    g.add(this.valueText);
    this._renderValue();

    // On-screen keyboard.
    const keyW = 34, keyH = 22, gap = 3;
    const startY = 86;
    ROWS.forEach((row, r) => {
      const totalW = row.length * (keyW + gap) - gap;
      const startX = (VIEW_W - totalW) / 2 + keyW / 2;
      [...row].forEach((ch, c) => {
        const b = button(this.scene,
          startX + c * (keyW + gap), startY + r * (keyH + gap),
          keyW, keyH, ch === ' ' ? '␣' : ch,
          () => this._type(ch), { size: '11px', depth: 502 });
        g.add(b.rect, b.txt);
      });
    });

    const y = startY + ROWS.length * (keyH + gap) + 12;
    const del = button(this.scene, VIEW_W / 2 - 90, y, 110, 24, 'DELETE',
      () => this._type(null), { size: '11px', depth: 502 });
    g.add(del.rect, del.txt);

    const ok = button(this.scene, VIEW_W / 2 + 40, y, 150, 24, 'OK',
      () => { SFX.select(); this._finish(this.value.trim() || this.fallback); },
      { size: '11px', depth: 502 });
    g.add(ok.rect, ok.txt);

    g.add(label(this.scene, VIEW_W / 2, y + 22,
      `Leave blank for ${this.fallback || 'the default'}`, {
        size: '9px', originX: 0.5, color: '#9aa5b1', depth: 501,
      }));
  }
}
