// =========================================================================
//  UI WIDGETS — small building blocks shared by every scene.
//  All of them are camera-pinned (scrollFactor 0) and live at high depth,
//  so they sit above the world and scale with the Scale Manager.
// =========================================================================
import { UI } from '../config.js';
import { SFX } from '../systems/audio.js';

// A framed panel: drop shadow, rounded body, bright inner rule. Returns a
// Graphics rather than a Rectangle — same setVisible/setDepth/destroy surface,
// but it can carry rounded corners and layered edges, which is most of what
// separates "programmer rectangle" from "game UI".
export function panel(scene, x, y, w, h, depth = 100) {
  const g = scene.add.graphics({ x, y }).setScrollFactor(0).setDepth(depth);
  const r = 6;

  g.fillStyle(0x000000, 0.35).fillRoundedRect(3, 4, w, h, r);      // shadow
  g.fillStyle(UI.panelFill, UI.panelAlpha).fillRoundedRect(0, 0, w, h, r);
  g.fillStyle(UI.panelHi, 0.5).fillRoundedRect(2, 2, w - 4, 10, { tl: r - 2, tr: r - 2, bl: 0, br: 0 });
  g.lineStyle(2, UI.panelStroke, 0.75).strokeRoundedRect(1, 1, w - 2, h - 2, r);
  g.lineStyle(1, 0x000000, 0.45).strokeRoundedRect(3, 3, w - 6, h - 6, r - 2);
  return g;
}

export function label(scene, x, y, text, opts = {}) {
  return scene.add
    .text(x, y, text, {
      fontFamily: UI.font,
      fontSize: opts.size || '12px',
      color: opts.color || '#ffffff',
      lineSpacing: opts.lineSpacing ?? 4,
      wordWrap: opts.wrapWidth ? { width: opts.wrapWidth } : undefined,
      align: opts.align || 'left',
    })
    .setOrigin(opts.originX ?? 0, opts.originY ?? 0)
    .setScrollFactor(0)
    .setDepth(opts.depth ?? 101);
}

// A tappable button. `enabled: false` renders it dimmed and inert, which is
// how the battle menu shows a fainted party member or an empty item slot.
export function button(scene, x, y, w, h, text, onClick, opts = {}) {
  const enabled = opts.enabled !== false;
  const depth = opts.depth ?? 120;
  const r = 5;

  // The visible body is a Graphics so it can be rounded and layered; a
  // transparent rectangle on top of it takes the input, which keeps hit
  // testing exactly as simple as it was.
  const g = scene.add.graphics({ x: x - w / 2, y: y - h / 2 })
    .setScrollFactor(0).setDepth(depth);

  const paint = (fill) => {
    g.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(2, 3, w, h, r);
    g.fillStyle(enabled ? fill : 0x262a33, 1).fillRoundedRect(0, 0, w, h, r);
    g.fillStyle(0xffffff, enabled ? 0.13 : 0.05)
      .fillRoundedRect(2, 2, w - 4, Math.max(3, h / 2 - 3), { tl: r - 1, tr: r - 1, bl: 0, br: 0 });
    g.lineStyle(2, UI.panelStroke, enabled ? 0.85 : 0.25).strokeRoundedRect(1, 1, w - 2, h - 2, r);
  };
  paint(UI.btnFill);

  const txt = scene.add
    .text(x, y, text, {
      fontFamily: UI.font,
      fontSize: opts.size || '12px',
      color: enabled ? (opts.color || '#ffffff') : '#777777',
      align: 'center',
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(depth + 1);

  const hit = scene.add.rectangle(x, y, w, h, 0x000000, 0)
    .setScrollFactor(0).setDepth(depth + 2);

  if (enabled) {
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => paint(UI.btnFillActive));
    hit.on('pointerout', () => paint(UI.btnFill));
    hit.on('pointerdown', (pointer, lx, ly, event) => {
      // Keep the tap from also reaching the scene-wide "advance message"
      // handler, which would otherwise skip the next line instantly.
      if (event && event.stopPropagation) event.stopPropagation();
      SFX.select();
      onClick();
    });
  }

  return {
    rect: g,
    txt,
    destroy: () => { g.destroy(); txt.destroy(); hit.destroy(); },
  };
}

// A small coloured type badge, e.g. FIRE / WATER.
export function typeBadge(scene, x, y, typeName, color, depth = 101) {
  const txt = scene.add
    .text(x, y, typeName.toUpperCase(), {
      fontFamily: UI.font, fontSize: '9px', color: '#101010',
      backgroundColor: color, padding: { x: 3, y: 1 },
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(depth);
  return txt;
}

// Groups objects so a whole menu can be torn down in one call.
export class UIGroup {
  constructor() { this.items = []; }
  add(...objs) { this.items.push(...objs); return objs[0]; }
  destroy() {
    for (const o of this.items) {
      if (o && typeof o.destroy === 'function') o.destroy();
    }
    this.items = [];
  }
}
