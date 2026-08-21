// =========================================================================
//  SHOP — spend prize money on bag items and held items.
//  Opened by talking to the shopkeeper; `open()` resolves when closed.
// =========================================================================
import { VIEW_W, VIEW_H } from '../config.js';
import { ITEMS, HELD_ITEMS, SHOP_STOCK } from '../data/monsters.js';
import { panel, label, button, UIGroup } from './widgets.js';
import { SFX } from '../systems/audio.js';

export class Shop {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.group = new UIGroup();
  }

  itemName(entry) {
    return entry.kind === 'held' ? HELD_ITEMS[entry.key].name : ITEMS[entry.key].name;
  }

  open() {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.page = 0;
      this._render();
    });
  }

  _close() {
    this.group.destroy();
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(); }
  }

  _render(message = 'What would you like?') {
    const g = this.group;
    g.destroy();

    g.add(panel(this.scene, 24, 18, VIEW_W - 48, 252, 400));
    g.add(label(this.scene, VIEW_W / 2, 28, 'SHOP', {
      size: '13px', originX: 0.5, depth: 401,
    }));
    // Money is the whole point of the screen, so keep it always visible.
    g.add(label(this.scene, VIEW_W - 36, 28, `${this.state.money} coins`, {
      size: '11px', originX: 1, color: '#f5d76e', depth: 401,
    }));
    g.add(label(this.scene, 40, 44, message, { size: '10px', depth: 401 }));

    // Five rows a page keeps every button comfortably tappable on an iPad.
    const PER_PAGE = 5;
    const pages = Math.ceil(SHOP_STOCK.length / PER_PAGE);
    const start = this.page * PER_PAGE;
    const slice = SHOP_STOCK.slice(start, start + PER_PAGE);

    slice.forEach((entry, i) => {
      const y = 68 + i * 30;
      const owned = entry.kind === 'held'
        ? (this.state.heldStock?.[entry.key] || 0)
        : (this.state.bag[entry.key] || 0);
      const affordable = this.state.money >= entry.price;
      const text = `${this.itemName(entry)}  ${entry.price}c  (have ${owned})`;

      const b = button(this.scene, VIEW_W / 2, y, VIEW_W - 100, 26, text,
        () => this._buy(entry), {
          size: '10px', depth: 402, enabled: affordable,
        });
      g.add(b.rect, b.txt);
    });

    let y = 68 + PER_PAGE * 30;
    if (pages > 1) {
      const nav = button(this.scene, VIEW_W / 2, y, 140, 22,
        `PAGE ${this.page + 1}/${pages}  ▶`, () => {
          SFX.select();
          this.page = (this.page + 1) % pages;
          this._render();
        }, { size: '10px', depth: 402 });
      g.add(nav.rect, nav.txt);
      y += 28;
    }

    const done = button(this.scene, VIEW_W / 2, 248, 180, 24, 'DONE', () => {
      SFX.cancel();
      this._close();
    }, { size: '11px', depth: 402 });
    g.add(done.rect, done.txt);
  }

  _buy(entry) {
    if (this.state.money < entry.price) {
      this._render('You cannot afford that.');
      return;
    }
    this.state.money -= entry.price;

    if (entry.kind === 'held') {
      // Held items live in their own stock so they don't clutter the battle bag.
      this.state.heldStock = this.state.heldStock || {};
      this.state.heldStock[entry.key] = (this.state.heldStock[entry.key] || 0) + 1;
    } else {
      this.state.bag[entry.key] = (this.state.bag[entry.key] || 0) + 1;
    }

    SFX.save();
    this._render(`Bought ${this.itemName(entry)}!`);
  }
}
