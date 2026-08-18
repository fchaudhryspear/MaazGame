// =========================================================================
//  UI WIDGETS — small building blocks shared by every scene.
//  All of them are camera-pinned (scrollFactor 0) and live at high depth,
//  so they sit above the world and scale with the Scale Manager.
// =========================================================================
import { UI } from '../config.js';
import { SFX } from '../systems/audio.js';

export function panel(scene, x, y, w, h, depth = 100) {
  return scene.add
    .rectangle(x, y, w, h, UI.panelFill, UI.panelAlpha)
    .setOrigin(0)
    .setStrokeStyle(2, UI.panelStroke, 0.6)
    .setScrollFactor(0)
    .setDepth(depth);
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

  const rect = scene.add
    .rectangle(x, y, w, h, enabled ? UI.btnFill : 0x2a2a2a, 1)
    .setStrokeStyle(2, UI.panelStroke, enabled ? 0.85 : 0.3)
    .setScrollFactor(0)
    .setDepth(depth);

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

  if (enabled) {
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => rect.setFillStyle(UI.btnFillActive, 1));
    rect.on('pointerout', () => rect.setFillStyle(UI.btnFill, 1));
    rect.on('pointerdown', (pointer, lx, ly, event) => {
      // Keep the tap from also reaching the scene-wide "advance message"
      // handler, which would otherwise skip the next line instantly.
      if (event && event.stopPropagation) event.stopPropagation();
      SFX.select();
      onClick();
    });
  }

  return { rect, txt, destroy: () => { rect.destroy(); txt.destroy(); } };
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
