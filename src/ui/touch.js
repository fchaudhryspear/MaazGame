// =========================================================================
//  TOUCH CONTROLS
//  An on-screen D-Pad plus action buttons, drawn as Phaser UI and pinned to
//  the camera. Living inside the canvas means it scales pixel-perfectly with
//  the Scale Manager — unlike a DOM overlay, which fights FIT letterboxing.
//
//  It drives the scene by setting `scene.pressedDir`, the same hook the
//  keyboard path reads, so movement logic stays input-agnostic.
//  Multitouch-safe: tracks every held button and reports the most recent.
// =========================================================================
import { VIEW_H, UI } from '../config.js';
import { SFX } from '../systems/audio.js';

export class TouchControls {
  constructor(scene, { onAction, onMenu } = {}) {
    this.scene = scene;
    this.active = [];      // stack of currently-held directions
    this.buttons = {};
    this.objects = [];     // every rect + label, so we can hide as one unit
    this.onAction = onAction;
    this.onMenu = onMenu;

    // Allow several simultaneous touch points (thumb roll across pads).
    scene.input.addPointer(3);

    this._build();
  }

  _build() {
    const cx = 74;
    const cy = VIEW_H - 74;
    const gap = 46;
    const size = 42;

    const layout = [
      { name: 'up',    x: cx,       y: cy - gap, sym: '▲' },
      { name: 'down',  x: cx,       y: cy + gap, sym: '▼' },
      { name: 'left',  x: cx - gap, y: cy,       sym: '◀' },
      { name: 'right', x: cx + gap, y: cy,       sym: '▶' },
    ];
    for (const b of layout) {
      this.buttons[b.name] = this._makeDirButton(b.name, b.x, b.y, size, b.sym);
    }

    // Action buttons on the right thumb side.
    this._makeTapButton(430, VIEW_H - 52, 46, 'A', () => this.onAction && this.onAction());
    this._makeTapButton(430, VIEW_H - 104, 34, '☰', () => this.onMenu && this.onMenu());
  }

  _makeDirButton(name, x, y, size, symbol) {
    const scene = this.scene;

    const rect = scene.add
      .rectangle(x, y, size, size, 0x000000, 0.35)
      .setStrokeStyle(1, 0xffffff, 0.35)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    const txt = scene.add
      .text(x, y, symbol, { fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);
    this.objects.push(rect, txt);

    const press = () => {
      rect.setFillStyle(0xffffff, 0.45);
      this._release(name, false);       // most-recent wins on multitouch
      this.active.push(name);
      this._sync();
    };
    const release = () => {
      rect.setFillStyle(0x000000, 0.35);
      this._release(name, true);
    };

    rect.on('pointerdown', press);
    rect.on('pointerup', release);
    rect.on('pointerout', release);
    rect.on('pointerupoutside', release);

    return rect;
  }

  _makeTapButton(x, y, size, symbol, cb) {
    const scene = this.scene;
    const circle = scene.add
      .circle(x, y, size / 2, 0x000000, 0.35)
      .setStrokeStyle(1, 0xffffff, 0.35)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    const txt = scene.add
      .text(x, y, symbol, {
        fontFamily: UI.font, fontSize: size > 40 ? '16px' : '13px', color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);
    this.objects.push(circle, txt);

    circle.on('pointerdown', (p, lx, ly, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      circle.setFillStyle(0xffffff, 0.45);
      SFX.select();
      cb();
    });
    const up = () => circle.setFillStyle(0x000000, 0.35);
    circle.on('pointerup', up);
    circle.on('pointerout', up);
    circle.on('pointerupoutside', up);

    return circle;
  }

  _release(name, sync) {
    const i = this.active.indexOf(name);
    if (i !== -1) this.active.splice(i, 1);
    if (sync) this._sync();
  }

  // Publish the currently-intended direction to the scene.
  _sync() {
    this.scene.pressedDir = this.active.length
      ? this.active[this.active.length - 1]
      : null;
  }

  // Drop every held direction — used when a menu or battle takes over, so
  // the player doesn't keep walking after the overlay closes.
  releaseAll() {
    this.active = [];
    this._sync();
    for (const rect of Object.values(this.buttons)) rect.setFillStyle(0x000000, 0.35);
  }

  // Hide the whole overlay. Interactivity is toggled too — an invisible but
  // still-interactive button would swallow taps meant for a menu above it.
  setVisible(visible) {
    if (!visible) this.releaseAll();
    for (const obj of this.objects) {
      obj.setVisible(visible);
      if (obj.input) obj.input.enabled = visible;
    }
  }
}
