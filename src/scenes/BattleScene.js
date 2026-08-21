// =========================================================================
//  BATTLE SCENE
//  A turn-based, Pokémon-style battle. Launched on top of a paused
//  WorldScene; draws its own opaque background so the overworld is hidden.
//
//  Turn flow is written with async/await over small helpers (message / wait
//  / animateBar), which keeps the sequencing readable and strictly ordered:
//    pick an action -> resolve both sides in order -> check faints -> repeat.
// =========================================================================
import { VIEW_W, VIEW_H, UI } from '../config.js';
import { MOVES, ITEMS, SPECIES, TYPE_COLORS } from '../data/monsters.js';
import {
  computeDamage, effectivenessText, orderActions, isFainted,
  gainXp, xpFromDefeat, xpToNext, rollCatch,
  tryPinchHeal, heldBlocksStatus, heldItem, rollQuickClaw,
  pendingEvolution, evolveMonster, setNickname,
} from '../systems/monster.js';
import {
  inflictStatus, statusTick, rollStatusSkip, cureStatus,
  statusName, statusColor,
} from '../systems/status.js';
import { typeMultiplier } from '../data/monsters.js';
import { buildMonster, buildBall } from '../assets.js';
import { panel, label, button, typeBadge, UIGroup } from '../ui/widgets.js';
import { NamePrompt } from '../ui/prompt.js';
import { SFX } from '../systems/audio.js';

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    this.state = data.state;           // { party, bag, seen, caught, ... }
    this.onEnd = data.onEnd;

    // A trainer battle fields a team; a wild battle is a single monster.
    this.trainer = data.trainer || null;
    this.enemyTeam = this.trainer ? this.trainer.team : [data.enemyMon];
    this.enemyIndex = 0;
    this.enemyMon = this.enemyTeam[0];
    this.isTrainerBattle = !!this.trainer;

    this.activeIndex = this.state.party.findIndex((m) => !isFainted(m));
    if (this.activeIndex < 0) this.activeIndex = 0;

    this.busy = true;                  // gate input until the intro finishes
    this.menu = new UIGroup();         // current command widgets
    this.overlay = new UIGroup();      // full-screen sub-menus (party/bag)
    this.finished = false;

    // Stat stages live here, not on the monsters, so buffs evaporate when
    // the battle ends without touching saved data.
    this.stages = {
      player: { atk: 0, def: 0, spd: 0 },
      enemy: { atk: 0, def: 0, spd: 0 },
    };
  }

  get playerMon() {
    return this.state.party[this.activeIndex];
  }

  create() {
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.prompt = new NamePrompt(this);
    buildBall(this);
    this._buildScene();

    // Record sightings for the mini-pokédex.
    for (const mon of this.enemyTeam) {
      if (!this.state.seen.includes(mon.speciesKey)) this.state.seen.push(mon.speciesKey);
    }

    this.start();
  }

  // Build (once) and return the texture key for a monster, passing the
  // species shape so sheep are drawn as sheep rather than generic blobs.
  _monTexture(mon) {
    const key = 'mon_' + mon.speciesKey;
    buildMonster(this, key, mon.color, SPECIES[mon.speciesKey].shape || 'blob');
    return key;
  }

  // ---- layout ----------------------------------------------------------
  _buildScene() {
    const W = VIEW_W, H = VIEW_H;

    // Opaque background so the paused world can't show through.
    this.add.rectangle(0, 0, W, H, 0x9bd7e6).setOrigin(0).setDepth(0);
    this.add.rectangle(0, H * 0.58, W, H * 0.42, 0x6bbf59).setOrigin(0).setDepth(0);

    this._monTexture(this.enemyMon);
    this._monTexture(this.playerMon);

    // Enemy: upper-right on a platform.
    this.add.ellipse(360, 120, 96, 26, 0x4f9d43).setDepth(1);
    this.enemySprite = this.add
      .image(360, 96, 'mon_' + this.enemyMon.speciesKey)
      .setDepth(2).setScale(1.5);

    // Player's monster: lower-left, larger (nearer the camera).
    this.add.ellipse(116, 226, 110, 28, 0x4f9d43).setDepth(1);
    this.playerSprite = this.add
      .image(116, 198, 'mon_' + this.playerMon.speciesKey)
      .setDepth(2).setScale(1.9);

    this._buildPanels();

    // Message / command box.
    panel(this, 8, 256, VIEW_W - 16, 92, 100);
    this.msgText = label(this, 20, 268, '', { wrapWidth: 258, size: '13px' });
  }

  _buildPanels() {
    this.enemyPanelGroup = new UIGroup();
    this.playerPanelGroup = new UIGroup();
    this._drawEnemyPanel();
    this._drawPlayerPanel();
  }

  // Panels are laid out in fixed rows so the status badge and held-item
  // marker never collide with the HP bar:
  //   row 1  name .............. level
  //   row 2  status  ◆held ...... type
  //   row 3  HP bar        (player also gets HP text + XP bar below)
  _drawEnemyPanel() {
    this.enemyPanelGroup.destroy();
    const g = this.enemyPanelGroup;
    const x = 16, y = 20, mon = this.enemyMon;

    g.add(panel(this, x, y, 184, 54, 50));
    g.add(label(this, x + 8, y + 6, mon.name, { size: '12px', depth: 51 }));
    g.add(label(this, x + 176, y + 6, `Lv${mon.level}`, {
      size: '11px', originX: 1, depth: 51,
    }));

    g.add(typeBadge(this, x + 176, y + 22, mon.type, TYPE_COLORS[mon.type], 51));
    if (mon.status) {
      g.add(label(this, x + 8, y + 23, statusName(mon.status), {
        size: '9px', color: statusColor(mon.status), depth: 51,
      }));
    }

    const barX = x + 8, barY = y + 44, barW = 120;
    g.add(this.add.rectangle(barX, barY, barW, 7, 0x333333)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51));
    this.enemyBar = this.add.rectangle(barX, barY, barW, 7, 0x54b35a)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(52);
    g.add(this.enemyBar);
    this.enemyBar.scaleX = mon.hp / mon.maxHp;
    this._setBarColor(this.enemyBar, this.enemyBar.scaleX);
  }

  _drawPlayerPanel() {
    this.playerPanelGroup.destroy();
    const g = this.playerPanelGroup;
    const x = 280, y = 142, mon = this.playerMon;

    g.add(panel(this, x, y, 184, 70, 50));
    g.add(label(this, x + 8, y + 6, mon.name, { size: '12px', depth: 51 }));
    g.add(label(this, x + 176, y + 6, `Lv${mon.level}`, {
      size: '11px', originX: 1, depth: 51,
    }));

    g.add(typeBadge(this, x + 176, y + 22, mon.type, TYPE_COLORS[mon.type], 51));
    if (mon.status) {
      g.add(label(this, x + 8, y + 23, statusName(mon.status), {
        size: '9px', color: statusColor(mon.status), depth: 51,
      }));
    }
    // Held item marker, so a berry or booster in play is visible.
    const item = heldItem(mon);
    if (item) {
      g.add(label(this, x + 38, y + 24, `◆${item.name}`, {
        size: '8px', color: '#c9e0a0', depth: 51,
      }));
    }

    const barX = x + 8, barY = y + 44, barW = 120;
    g.add(this.add.rectangle(barX, barY, barW, 7, 0x333333)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51));
    this.playerBar = this.add.rectangle(barX, barY, barW, 7, 0x54b35a)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(52);
    g.add(this.playerBar);
    this.playerBar.scaleX = mon.hp / mon.maxHp;
    this._setBarColor(this.playerBar, this.playerBar.scaleX);

    this.playerHpText = label(this, x + 176, y + 39, `${mon.hp}/${mon.maxHp}`, {
      size: '10px', originX: 1, depth: 51,
    });
    g.add(this.playerHpText);

    // Thin XP bar along the bottom of the panel.
    g.add(this.add.rectangle(barX, y + 60, barW, 3, 0x2a3550)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51));
    this.xpBar = this.add.rectangle(barX, y + 60, barW, 3, 0x5aa9e6)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(52);
    g.add(this.xpBar);
    this.xpBar.scaleX = Math.min(1, mon.xp / xpToNext(mon.level));
  }

  _setBarColor(fill, ratio) {
    fill.fillColor = ratio > 0.5 ? 0x54b35a : ratio > 0.2 ? 0xe6c62e : 0xd23b3b;
  }

  _refreshPlayerHud() {
    const mon = this.playerMon;
    this.playerHpText.setText(`${mon.hp}/${mon.maxHp}`);
    this.xpBar.scaleX = Math.min(1, mon.xp / xpToNext(mon.level));
  }

  // ---- async primitives ------------------------------------------------
  wait(ms) {
    return new Promise((res) => this.time.delayedCall(ms, res));
  }

  // Show a line, then wait for a tap or a short timeout.
  message(text) {
    this.msgText.setText(text);
    return new Promise((res) => {
      let timer = null;
      const done = () => {
        this.input.off('pointerdown', done);
        if (timer) timer.remove(false);
        res();
      };
      timer = this.time.delayedCall(1200, done);
      this.input.on('pointerdown', done);
    });
  }

  setMessage(text) { this.msgText.setText(text); }

  animateBar(fill, ratio) {
    return new Promise((res) => {
      this.tweens.add({
        targets: fill,
        scaleX: Math.max(0, ratio),
        duration: 450,
        ease: 'Sine.out',
        onUpdate: () => this._setBarColor(fill, fill.scaleX),
        onComplete: () => { this._setBarColor(fill, ratio); res(); },
      });
    });
  }

  // ---- menus -----------------------------------------------------------
  openMenu() {
    if (this.finished) return;
    this.busy = false;
    this.menu.destroy();
    this.overlay.destroy();
    this.setMessage(`What will\n${this.playerMon.name} do?`);

    // Two-by-two command grid on the right of the message box.
    this._btn(340, 282, 78, 24, 'FIGHT', () => this.openMoves());
    this._btn(424, 282, 78, 24, 'BAG', () => this.openBag());
    this._btn(340, 310, 78, 24, 'SWAP', () => this.openParty());
    this._btn(424, 310, 78, 24, 'RUN', () => this.tryRun());
  }

  _btn(x, y, w, h, text, cb, opts = {}) {
    const b = button(this, x, y, w, h, text, cb, opts);
    this.menu.add(b.rect, b.txt);
    return b;
  }

  openMoves() {
    this.menu.destroy();
    this.setMessage('Choose a move:');
    const slots = [[340, 282], [424, 282], [340, 310], [424, 310]];
    this.playerMon.moves.slice(0, 4).forEach((mk, i) => {
      const [x, y] = slots[i];
      const move = MOVES[mk];
      this._btn(x, y, 78, 24, move.name, () => this.takeTurn({ kind: 'move', move: mk }), {
        size: '10px', color: TYPE_COLORS[move.type],
      });
    });
    // Cancel always gets its own row, so a 4-move monster never overlaps it.
    this._btn(382, 336, 162, 22, 'CANCEL', () => { SFX.cancel(); this.openMenu(); }, { size: '10px' });
  }

  openBag() {
    this.menu.destroy();
    this.setMessage('Bag:');
    const entries = Object.entries(this.state.bag).filter(([, n]) => n > 0);

    if (!entries.length) {
      this._btn(382, 300, 162, 24, 'BAG IS EMPTY', () => { SFX.cancel(); this.openMenu(); });
      return;
    }

    const slots = [[340, 282], [424, 282], [340, 310], [424, 310]];
    entries.slice(0, 4).forEach(([key, count], i) => {
      const [x, y] = slots[i];
      this._btn(x, y, 78, 24, `${ITEMS[key].name.split(' ')[0]}x${count}`, () => {
        this.takeTurn({ kind: 'item', item: key });
      }, { size: '9px' });
    });
    this._btn(382, 336, 162, 22, 'CANCEL', () => { SFX.cancel(); this.openMenu(); }, { size: '10px' });
  }

  // Full-screen party list — used for switching, and forced after a faint.
  openParty(forced = false) {
    this.menu.destroy();
    this.overlay.destroy();

    this.overlay.add(panel(this, 40, 30, VIEW_W - 80, 250, 300));
    this.overlay.add(label(this, VIEW_W / 2, 42,
      forced ? 'Choose your next monster' : 'Switch to which monster?',
      { size: '12px', originX: 0.5, depth: 301 }));

    this.state.party.forEach((mon, i) => {
      const y = 70 + i * 32;
      const isActive = i === this.activeIndex;
      const fainted = isFainted(mon);
      const text = `${mon.name}  Lv${mon.level}  ${mon.hp}/${mon.maxHp}`
        + (isActive ? '  (out)' : fainted ? '  (fainted)' : '');

      const b = button(this, VIEW_W / 2, y, 300, 26, text, () => {
        this.overlay.destroy();
        this.switchTo(i, forced);
      }, {
        enabled: !isActive && !fainted,
        size: '11px',
        depth: 302,
      });
      this.overlay.add(b.rect, b.txt);
    });

    if (!forced) {
      const b = button(this, VIEW_W / 2, 262, 300, 24, 'CANCEL', () => {
        SFX.cancel();
        this.overlay.destroy();
        this.openMenu();
      }, { size: '11px', depth: 302 });
      this.overlay.add(b.rect, b.txt);
    }
  }

  // ---- turn resolution -------------------------------------------------
  async start() {
    if (this.isTrainerBattle) {
      await this.message(`${this.trainer.name} wants to battle!`);
      await this.message(`${this.trainer.name} sent out ${this.enemyMon.name}!`);
    } else {
      await this.message(`A wild ${this.enemyMon.name} appeared!`);
    }
    await this.message(`Go! ${this.playerMon.name}!`);
    this.openMenu();
  }

  // How the enemy is referred to in messages.
  get enemyLabel() {
    return this.isTrainerBattle
      ? `${this.trainer.name}'s ${this.enemyMon.name}`
      : `Wild ${this.enemyMon.name}`;
  }

  // Enemy AI: usually picks its most effective move, sometimes rolls at
  // random so it isn't perfectly predictable.
  _enemyChoice() {
    const moves = this.enemyMon.moves;
    if (Math.random() < 0.35) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    let best = moves[0], bestScore = -Infinity;
    for (const key of moves) {
      const mv = MOVES[key];
      const eff = typeMultiplier(mv.type, this.playerMon.type);
      const stab = mv.type === this.enemyMon.type ? 1.5 : 1;
      const score = (mv.power || 25) * eff * stab;
      if (score > bestScore) { bestScore = score; best = key; }
    }
    return best;
  }

  async takeTurn(playerAction) {
    this.busy = true;
    this.menu.destroy();

    // Using an item or switching forfeits the attack but resolves first.
    const actions = orderActions([
      {
        ...playerAction,
        user: this.playerMon,
        target: this.enemyMon,
        stages: this.stages.player,
        isPlayer: true,
        quickClaw: rollQuickClaw(this.playerMon),
      },
      {
        kind: 'move',
        move: this._enemyChoice(),
        user: this.enemyMon,
        target: this.playerMon,
        stages: this.stages.enemy,
        isPlayer: false,
        quickClaw: rollQuickClaw(this.enemyMon),
      },
    ]);

    for (const act of actions) {
      if (this.finished) return;
      // The actor may have fainted, or been swapped out, before its turn.
      if (act.isPlayer && act.user !== this.playerMon && act.kind === 'move') continue;
      if (isFainted(act.user)) continue;

      await this.resolveAction(act);

      if (this.finished) return;
      if (isFainted(this.enemyMon)) { await this.enemyDefeated(); return; }
      if (isFainted(this.playerMon)) { await this.playerFainted(); return; }
    }

    await this.endOfTurn();
    if (this.finished) return;
    this.openMenu();
  }

  // Burn and poison chip HP once both sides have acted.
  async endOfTurn() {
    for (const who of ['player', 'enemy']) {
      const mon = who === 'player' ? this.playerMon : this.enemyMon;
      if (isFainted(mon)) continue;

      const tick = statusTick(mon);
      if (tick) {
        SFX.weakHit();
        const bar = who === 'player' ? this.playerBar : this.enemyBar;
        await this.animateBar(bar, mon.hp / mon.maxHp);
        if (who === 'player') this._refreshPlayerHud();
        await this.message(tick.text);
      }

      // A pinch berry can save a monster right after the tick.
      await this.checkPinchHeal(who);

      if (isFainted(mon)) {
        if (who === 'enemy') { await this.enemyDefeated(); return; }
        await this.playerFainted();
        return;
      }
    }
  }

  // Fire a held pinch-heal berry if HP dropped low enough.
  async checkPinchHeal(who) {
    const mon = who === 'player' ? this.playerMon : this.enemyMon;
    const res = tryPinchHeal(mon);
    if (!res) return;

    SFX.heal();
    const bar = who === 'player' ? this.playerBar : this.enemyBar;
    await this.animateBar(bar, mon.hp / mon.maxHp);
    if (who === 'player') { this._refreshPlayerHud(); this._drawPlayerPanel(); }
    else this._drawEnemyPanel();
    await this.message(`${mon.name}'s ${res.itemName} restored ${res.healed} HP!`);
  }

  async resolveAction(act) {
    if (act.kind === 'item') return this.useItem(act.item);
    if (act.kind === 'switch') return; // the swap already happened
    return this.doMove(act);
  }

  async doMove(act) {
    const move = MOVES[act.move];
    const userName = act.isPlayer ? this.playerMon.name : this.enemyLabel;

    // Paralysis is rolled before the move is announced, as in the source games.
    const skip = rollStatusSkip(act.user);
    if (skip.skipped) {
      SFX.cancel();
      await this.message(skip.text);
      return;
    }

    await this.message(`${userName} used ${move.name}!`);

    if (Math.random() * 100 > move.accuracy) {
      SFX.miss();
      await this.message('But it missed!');
      return;
    }

    // Condition move: inflict burn / poison / paralysis.
    if (!move.power && move.inflict) {
      const target = act.isPlayer ? this.enemyMon : this.playerMon;
      const targetName = act.isPlayer ? this.enemyLabel : this.playerMon.name;
      await this.applyStatus(target, move.inflict, targetName, !act.isPlayer);
      return;
    }

    // Status move: shift a stat stage instead of dealing damage.
    if (!move.power && move.effect) {
      const toSelf = move.effect.target === 'self';
      const stages = toSelf
        ? (act.isPlayer ? this.stages.player : this.stages.enemy)
        : (act.isPlayer ? this.stages.enemy : this.stages.player);
      const targetName = toSelf ? userName
        : (act.isPlayer ? this.enemyLabel : this.playerMon.name);

      const stat = move.effect.stat;
      stages[stat] = Math.max(-6, Math.min(6, stages[stat] + move.effect.stages));
      SFX.select();
      const dir = move.effect.stages > 0 ? 'rose' : 'fell';
      await this.message(`${targetName}'s ${stat.toUpperCase()} ${dir}!`);
      return;
    }

    const atkStages = act.isPlayer ? this.stages.player : this.stages.enemy;
    const defStages = act.isPlayer ? this.stages.enemy : this.stages.player;
    const { damage, multiplier } = computeDamage(act.user, act.target, move, atkStages, defStages);

    act.target.hp = Math.max(0, act.target.hp - damage);

    // Impact feedback: flash the sprite and pick a weightier sound for a
    // super-effective hit.
    const targetIsEnemy = act.target === this.enemyMon;
    const spr = targetIsEnemy ? this.enemySprite : this.playerSprite;
    if (multiplier >= 2) SFX.superHit();
    else if (multiplier <= 0.5) SFX.weakHit();
    else SFX.hit();

    this.tweens.add({
      targets: spr, alpha: 0.25, duration: 60, yoyo: true, repeat: 2,
    });
    this.cameras.main.shake(multiplier >= 2 ? 180 : 90, 0.006);

    const bar = targetIsEnemy ? this.enemyBar : this.playerBar;
    await this.animateBar(bar, act.target.hp / act.target.maxHp);
    if (!targetIsEnemy) this._refreshPlayerHud();

    const effText = effectivenessText(multiplier);
    if (effText) await this.message(effText);

    // Secondary effect: some damaging moves can also inflict a condition.
    if (move.inflictChance && !isFainted(act.target)
        && Math.random() < move.inflictChance.chance) {
      const targetName = targetIsEnemy ? this.enemyLabel : this.playerMon.name;
      await this.applyStatus(act.target, move.inflictChance.status, targetName, !targetIsEnemy);
    }

    if (!isFainted(act.target)) {
      await this.checkPinchHeal(targetIsEnemy ? 'enemy' : 'player');
    }

    if (isFainted(act.target)) {
      const faintName = targetIsEnemy ? this.enemyLabel : this.playerMon.name;
      SFX.faint();
      this.tweens.add({ targets: spr, y: spr.y + 18, alpha: 0, duration: 320 });
      await this.message(`${faintName} fainted!`);
    }
  }

  // Apply a condition, respecting immunities and held guards, then redraw
  // the affected panel so its badge appears.
  async applyStatus(target, statusKey, targetName, isPlayerTarget) {
    if (heldBlocksStatus(target, statusKey)) {
      const item = heldItem(target);
      await this.message(`${targetName}'s ${item.name} blocked it!`);
      return;
    }

    const res = inflictStatus(target, statusKey);
    if (res.text) {
      if (res.applied) SFX.hit(); else SFX.miss();
      await this.message(res.text);
    }
    if (res.applied) {
      if (isPlayerTarget) this._drawPlayerPanel(); else this._drawEnemyPanel();
    }
  }

  async useItem(key) {
    const item = ITEMS[key];
    if (!this.state.bag[key]) return;

    if (item.kind === 'heal') {
      const mon = this.playerMon;
      if (mon.hp >= mon.maxHp) {
        await this.message('It would have no effect!');
        return; // don't consume it
      }
      this.state.bag[key]--;
      const healed = Math.min(item.amount, mon.maxHp - mon.hp);
      mon.hp += healed;
      SFX.heal();
      await this.animateBar(this.playerBar, mon.hp / mon.maxHp);
      this._refreshPlayerHud();
      await this.message(`${mon.name} recovered ${healed} HP!`);
      return;
    }

    if (item.kind === 'cure') {
      const mon = this.playerMon;
      if (!mon.status) {
        await this.message('It would have no effect!');
        return;   // don't consume it
      }
      this.state.bag[key]--;
      const had = statusName(cureStatus(mon));
      SFX.heal();
      this._drawPlayerPanel();
      await this.message(`${mon.name} was cured of ${had}!`);
      return;
    }

    if (item.kind === 'ball') {
      this.state.bag[key]--;
      await this.throwBall(item);
    }
  }

  // Animate a thrown ball, wobble it, then report the result.
  async throwBall(item) {
    if (this.isTrainerBattle) {
      // Refund it — stealing another trainer's monster isn't allowed.
      this.state.bag[
        Object.keys(ITEMS).find((k) => ITEMS[k] === item)
      ]++;
      await this.message("You can't catch another trainer's monster!");
      return;
    }

    await this.message(`You threw a ${item.name}!`);
    SFX.ballThrow();

    const ball = this.add.image(120, 210, 'ball').setDepth(20).setScale(1.2);
    await new Promise((res) => {
      this.tweens.add({
        targets: ball,
        x: this.enemySprite.x, y: this.enemySprite.y,
        duration: 480, ease: 'Quad.out',
        onComplete: res,
      });
    });

    this.tweens.add({ targets: this.enemySprite, alpha: 0, scale: 0.6, duration: 220 });
    await this.wait(260);

    const { caught, shakes } = rollCatch(this.enemyMon, item.bonus);
    for (let i = 0; i < Math.max(1, shakes); i++) {
      SFX.ballWobble();
      await new Promise((res) => {
        this.tweens.add({
          targets: ball, angle: { from: -18, to: 18 },
          duration: 130, yoyo: true, onComplete: res,
        });
      });
      ball.angle = 0;
      await this.wait(120);
    }

    if (!caught) {
      this.tweens.add({ targets: this.enemySprite, alpha: 1, scale: 1.5, duration: 200 });
      ball.destroy();
      await this.message(`Oh no! The ${this.enemyMon.name} broke free!`);
      return;
    }

    SFX.caught();
    ball.destroy();
    await this.message(`Gotcha! ${this.enemyMon.name} was caught!`);

    if (!this.state.caught.includes(this.enemyMon.speciesKey)) {
      this.state.caught.push(this.enemyMon.speciesKey);
    }
    if (this.state.party.length < 6) {
      this.state.party.push(this.enemyMon);
      await this.message(`${this.enemyMon.name} joined your party!`);
      // Offer a nickname — kids name everything, and it makes the catch stick.
      const nick = await this.prompt.ask(
        `Nickname for your ${this.enemyMon.name}?`, '', 10);
      if (nick) {
        setNickname(this.enemyMon, nick);
        await this.message(`${this.enemyMon.name} it is!`);
      }
    } else {
      await this.message('Your party is full, so it was released.');
    }

    this.endBattle('caught');
  }

  // Swap the active monster. Outside a forced swap this costs the turn, so
  // the enemy still gets to attack.
  async switchTo(index, forced) {
    const outgoing = this.playerMon;
    this.activeIndex = index;
    const incoming = this.playerMon;

    // Stat stages belong to the monster that earned them.
    this.stages.player = { atk: 0, def: 0, spd: 0 };

    this._monTexture(incoming);
    this.playerSprite.setTexture('mon_' + incoming.speciesKey);
    this.playerSprite.setAlpha(1).setScale(1.9);
    this.playerSprite.y = 198;
    this._drawPlayerPanel();

    if (forced) {
      this.busy = true;
      await this.message(`Go! ${incoming.name}!`);
      this.openMenu();
      return;
    }

    this.busy = true;
    await this.message(`${outgoing.name}, come back!`);
    await this.message(`Go! ${incoming.name}!`);
    // Switching used the turn — the enemy still acts.
    await this.takeTurn({ kind: 'switch' });
  }

  async tryRun() {
    this.busy = true;
    this.menu.destroy();

    if (this.isTrainerBattle) {
      await this.message("There's no running from a trainer battle!");
      this.openMenu();
      return;
    }

    const chance = 0.5 + (this.playerMon.spd - this.enemyMon.spd) * 0.06;
    if (Math.random() < Math.max(0.3, Math.min(0.95, chance))) {
      await this.message('Got away safely!');
      this.endBattle('run');
      return;
    }

    await this.message("Couldn't get away!");
    await this.doMove({
      kind: 'move', move: this._enemyChoice(),
      user: this.enemyMon, target: this.playerMon,
      stages: this.stages.enemy, isPlayer: false,
    });
    if (isFainted(this.playerMon)) { await this.playerFainted(); return; }
    await this.endOfTurn();
    if (this.finished) return;
    this.openMenu();
  }

  // One enemy went down. Award XP, then either send out the trainer's next
  // monster or end the battle.
  async enemyDefeated() {
    if (!this.isTrainerBattle) SFX.victory();
    const mon = this.playerMon;
    const xp = xpFromDefeat(this.enemyMon);
    const report = gainXp(mon, xp);
    await this.message(`${mon.name} gained ${xp} XP!`);

    this._drawPlayerPanel();
    for (const lv of report.levels) {
      SFX.levelUp();
      this.cameras.main.flash(200, 255, 255, 180);
      await this.message(`${mon.name} grew to level ${lv.level}!`);
      if (lv.learned) await this.message(`${mon.name} learned ${MOVES[lv.learned].name}!`);
    }

    // Levelling can trigger an evolution — the big moment of the game.
    await this.tryEvolve(mon);

    // Trainer with monsters left: send out the next one and continue.
    const next = this.enemyTeam.findIndex((m, i) => i > this.enemyIndex && !isFainted(m));
    if (this.isTrainerBattle && next !== -1) {
      this.enemyIndex = next;
      this.enemyMon = this.enemyTeam[next];
      this.stages.enemy = { atk: 0, def: 0, spd: 0 };

      this._monTexture(this.enemyMon);
      this.enemySprite.setTexture('mon_' + this.enemyMon.speciesKey);
      this.enemySprite.setAlpha(1).setScale(1.5);
      this.enemySprite.y = 96;
      this._drawEnemyPanel();

      await this.message(`${this.trainer.name} sent out ${this.enemyMon.name}!`);
      this.openMenu();
      return;
    }

    await this.win();
  }

  // Play the evolution sequence: the sprite flashes white, swells, and
  // returns as the new species.
  async tryEvolve(mon) {
    while (pendingEvolution(mon)) {
      await this.message(`What? ${mon.name} is evolving!`);

      const spr = this.playerSprite;
      const baseScale = spr.scaleX;
      SFX.levelUp();

      await new Promise((res) => {
        this.tweens.add({
          targets: spr,
          scaleX: baseScale * 1.35, scaleY: baseScale * 1.35,
          alpha: 0.25,
          duration: 260, yoyo: true, repeat: 2,
          onComplete: res,
        });
      });

      const result = evolveMonster(mon);
      if (!result) break;

      // Swap in the new species art mid-flash.
      this.cameras.main.flash(320, 255, 255, 255);
      spr.setTexture(this._monTexture(mon));
      spr.setAlpha(1).setScale(baseScale);
      this._drawPlayerPanel();
      this._refreshPlayerHud();

      SFX.caught();
      await this.message(`${result.fromName} evolved into ${result.toName}!`);
    }
  }

  async win() {
    SFX.victory();
    if (this.isTrainerBattle) {
      await this.message(`You defeated ${this.trainer.name}!`);
      // Record the win so the trainer never re-challenges.
      if (!this.state.defeatedTrainers.includes(this.trainer.key)) {
        this.state.defeatedTrainers.push(this.trainer.key);
      }
      if (this.trainer.reward) {
        this.state.money = (this.state.money || 0) + this.trainer.reward;
        await this.message(`You got ${this.trainer.reward} coins for winning!`);
      }
      this.endBattle('trainerWin');
      return;
    }

    this.endBattle('win');
  }

  async playerFainted() {
    const alive = this.state.party.some((m) => !isFainted(m));
    if (alive) {
      this.openParty(true);   // forced swap; battle continues
      return;
    }
    await this.message('You have no monsters left...');
    await this.message('You scurry back to town to recover.');
    this.endBattle('lose');
  }

  // ---- teardown --------------------------------------------------------
  endBattle(result) {
    if (this.finished) return;
    this.finished = true;
    this.busy = true;
    this.menu.destroy();
    this.overlay.destroy();

    this.cameras.main.fadeOut(260, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const world = this.scene.get('WorldScene');
      this.scene.stop();
      this.scene.resume('WorldScene');
      if (this.onEnd) this.onEnd(result);
      world.cameras.main.flash(220, 0, 0, 0);
    });
  }
}
