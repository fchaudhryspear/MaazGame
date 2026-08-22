// =========================================================================
//  Smoke test — boots the real game in headless Chromium and exercises every
//  major system end to end: movement/collision, type effectiveness, a full
//  battle with XP and level-ups, catching, party switching, items, the pause
//  menu, save/load across a reload, blackout, heal tiles and signs.
//
//  Usage:
//    npm install playwright        (once)
//    node tests/smoke.cjs
//
//  Env: PORT, CHROMIUM (path to a browser binary), SHOT_DIR (screenshot dir).
// =========================================================================
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const ROOT = process.env.GAME_ROOT || require('path').resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8151);
const OUT = process.env.SHOT_DIR || require('os').tmpdir();

const log = (...a) => console.log(...a);


// The game now opens on the title screen, so every boot goes through it:
// continue an existing save, or start a new game and accept the default names.
async function bootToWorld(page) {
  await page.waitForFunction(
    () => window.game?.scene?.getScene('TitleScene')?.ready, { timeout: 15000 });
  await page.evaluate(async () => {
    const t = window.game.scene.getScene('TitleScene');
    if (window.localStorage.getItem('maazgame.save.v1')) { t._continue(); return; }
    t._newGame(false);
    // Two prompts: trainer name, then starter nickname. Accept the defaults.
    for (let i = 0; i < 2; i++) {
      const t0 = Date.now();
      while (!t.prompt.resolve && Date.now() - t0 < 3000) {
        await new Promise(r => setTimeout(r, 60));
      }
      if (t.prompt.resolve) t.prompt._finish('');
      await new Promise(r => setTimeout(r, 200));
    }
  });
  await page.waitForFunction(
    () => window.game?.scene?.getScene('WorldScene')?.ready, { timeout: 15000 });
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 960, height: 704 } });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE.ERROR: ' + m.text()); });

  const W = () => page.evaluate(() => window.game.scene.getScene('WorldScene'));
  let failures = 0;
  const check = (name, cond, extra='') => {
    if (cond) log(`  PASS  ${name}${extra?' — '+extra:''}`);
    else { log(`  FAIL  ${name}${extra?' — '+extra:''}`); failures++; }
  };

  try {
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
    await bootToWorld(page);
    log('\n[1] BOOT');
    const boot = await page.evaluate(() => {
      const w = window.game.scene.getScene('WorldScene');
      return { party: w.state.party.length, lead: w.state.party[0].name, lvl: w.state.party[0].level,
               bag: w.state.bag, rows: w.matrix.blocked.length, cols: w.matrix.blocked[0].length,
               spawnBlocked: w.matrix.isBlocked(w.player.col, w.player.row),
               money: w.state.money, name: w.state.playerName,
               mapName: w.map.name, mapTitle: w.map.displayName,
               areas: Object.keys(w.mapIndex.maps) };
    });
    check('started in town', boot.mapName === 'town', `${boot.mapTitle}`);
    check('all areas indexed', boot.areas.length === 4, boot.areas.join(', '));
    check('world + party ready', boot.party === 1 && boot.lead === 'MAAZ', `${boot.lead} Lv${boot.lvl}`);
    check('collision matrix built', boot.rows === 15 && boot.cols === 20, `${boot.cols}x${boot.rows}`);
    check('spawn walkable', !boot.spawnBlocked);
    check('starting bag', boot.bag.ball === 5 && boot.bag.potion === 5, JSON.stringify(boot.bag));
    check('starting money', boot.money === 500, String(boot.money));

    log('\n[2] MOVEMENT + COLLISION');
    const mv = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const start = { c: w.player.col, r: w.player.row };
      // Walk into water/wall region: find a blocked neighbour and try to enter it
      let blockedTest = null;
      for (const [d, dc, dr] of [['up',0,-1],['down',0,1],['left',-1,0],['right',1,0]]) {
        if (w.matrix.isBlocked(start.c+dc, start.r+dr)) {
          w.player.tryMove(d); await wait(250);
          blockedTest = (w.player.col === start.c && w.player.row === start.r);
          break;
        }
      }
      // Normal step
      w.player.tryMove('right'); await wait(300);
      const moved = w.player.col === start.c + 1;
      // Diagonal impossible: tryMove only accepts 4 names
      const diag = w.player.tryMove('upright');
      return { blockedTest, moved, diag, facing: w.player.facing };
    });
    check('blocked tile rejected', mv.blockedTest === null || mv.blockedTest === true);
    check('normal step works', mv.moved);
    check('diagonal rejected', mv.diag === false);

    log('\n[2b] WARPS + MULTI-AREA');
    const warp = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const out = {};

      // Every warp pad in every loaded area must land somewhere walkable.
      const mod = await import('/src/systems/maploader.js');
      const idx = await mod.loadIndex();
      out.badWarps = [];
      out.warpCount = 0;
      for (const name of Object.keys(idx.maps)) {
        const m = await mod.loadMap(name);
        for (const [at, wp] of Object.entries(m.warps)) {
          out.warpCount++;
          const dest = await mod.loadMap(wp.toMap);
          const id = dest.ground[wp.toRow]?.[wp.toCol];
          const tile = id >= 0 ? dest.tiles[id] : null;
          if (!tile || !tile.walkable) out.badWarps.push(`${name}@${at} -> ${wp.toMap}`);
        }
      }

      // Walk the real route: town -> route1 -> cave -> route1 -> town.
      w.placePlayer(18, 7, 'right');
      w.player.tryMove('right');                 // steps onto the warp pad
      await wait(1400);
      out.afterEast = w.map.name;
      out.collisionMatches = w.matrix.cols === w.map.cols && w.matrix.rows === w.map.rows;

      await w.warpTo('route1', 18, 7, 'right');
      w.player.tryMove('right');
      await wait(1400);
      out.afterCave = w.map.name;
      out.caveDims = `${w.map.cols}x${w.map.rows}`;
      out.caveEncounters = w.map.encounters ? w.map.encounters.pool.join(',') : null;

      w.player.tryMove('left');                  // cave (0,5) warps back
      await wait(1400);
      out.backToRoute = w.map.name;

      await w.warpTo('town', 4, 7, 'down');
      out.home = w.map.name;
      out.townSafe = w.map.encounters === null;
      return out;
    });
    check('all warp destinations walkable', warp.badWarps.length === 0,
      `${warp.warpCount} warps checked${warp.badWarps.length ? ': ' + warp.badWarps.join('; ') : ''}`);
    check('town -> route1 via stepping on pad', warp.afterEast === 'route1');
    check('collision matrix rebuilt for new area', warp.collisionMatches);
    check('route1 -> cave', warp.afterCave === 'cave', `cave is ${warp.caveDims}`);
    check('cave has its own encounter pool', warp.caveEncounters === 'pebbo,zapmo', String(warp.caveEncounters));
    check('cave -> route1 (return trip)', warp.backToRoute === 'route1');
    check('town is a safe area', warp.townSafe && warp.home === 'town');

    log('\n[3] TYPE EFFECTIVENESS IN BATTLE');
    const typeTest = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      const mod = await import('/src/systems/monster.js');
      const data = await import('/src/data/monsters.js');
      const fire = mod.makeMonster('maaz', 10);
      const grass = mod.makeMonster('leaflet', 10);
      const water = mod.makeMonster('aqua', 10);
      let sup=0, weak=0;
      for (let i=0;i<150;i++){
        sup += mod.computeDamage(fire, grass, data.MOVES.ember).damage;
        weak += mod.computeDamage(fire, water, data.MOVES.ember).damage;
      }
      return { sup: sup/150, weak: weak/150, ratio: sup/weak,
               txt: mod.effectivenessText(mod.computeDamage(fire, grass, data.MOVES.ember).multiplier) };
    });
    check('super effective > not very effective', typeTest.ratio > 3,
      `ratio ${typeTest.ratio.toFixed(2)} (${typeTest.sup.toFixed(1)} vs ${typeTest.weak.toFixed(1)})`);
    check('effectiveness message', typeTest.txt === "It's super effective!");

    log('\n[4] BATTLE FLOW + XP/LEVEL UP');
    await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      // Town is a safe area, so move to ROUTE 1 before forcing a battle.
      await w.warpTo('route1', 1, 7, 'right');
      w.startBattle();
    });
    await page.waitForFunction(() => {
      const b = window.game.scene.getScene('BattleScene');
      return b && b.scene.isActive() && b.playerBar;
    }, { timeout: 8000 });
    const inBattle = await page.evaluate(() => {
      const b = window.game.scene.getScene('BattleScene');
      const w = window.game.scene.getScene('WorldScene');
      return { enemy: b.enemyMon.name, type: b.enemyMon.type, paused: w.scene.isPaused(),
               seen: w.state.seen.length };
    });
    check('battle launched, world paused', inBattle.paused, `vs ${inBattle.enemy} (${inBattle.type})`);
    check('pokedex records sighting', inBattle.seen >= 1);

    await page.screenshot({ path: OUT + '/new_battle.png' });

    // Force a win to test XP + level up
    const winRes = await page.evaluate(async () => {
      const b = window.game.scene.getScene('BattleScene');
      const w = window.game.scene.getScene('WorldScene');
      const before = { lvl: b.playerMon.level, xp: b.playerMon.xp };
      b.enemyMon.hp = 1;
      b.playerMon.level = 4; b.playerMon.xp = 0;
      const tapper = setInterval(() => b.input.emit('pointerdown'), 50);
      b.takeTurn({ kind: 'move', move: b.playerMon.moves[0] });
      const t0 = Date.now();
      while (Date.now() - t0 < 14000) {
        if (!b.scene.isActive()) break;
        await new Promise(r => setTimeout(r, 100));
      }
      clearInterval(tapper);
      const lead = w.state.party[0];
      return { ended: !b.scene.isActive(), lvl: lead.level, xp: lead.xp, hp: lead.hp };
    });
    check('battle ended on win', winRes.ended);
    check('XP awarded / level gained', winRes.lvl > 4 || winRes.xp > 0, `Lv${winRes.lvl} xp${winRes.xp}`);

    await page.waitForFunction(() => {
      const w = window.game.scene.getScene('WorldScene');
      return !w.scene.isPaused() && w.input.enabled && !w.encounterActive;
    }, { timeout: 8000 });
    check('world resumed after battle', true);

    log('\n[5] CATCHING');
    const catchRes = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      w.state.bag.greatball = 50;              // plenty of attempts
      w.startBattle();                          // already on ROUTE 1
      await new Promise(r => setTimeout(r, 700));
      const b = window.game.scene.getScene('BattleScene');
      const partyBefore = w.state.party.length;
      const ballsBefore = w.state.bag.greatball;
      const tapper = setInterval(() => b.input.emit('pointerdown'), 50);
      // A successful catch opens the nickname keyboard mid-sequence, so this
      // has to be answered by a watcher rather than after the throw loop.
      let asked = false;
      const nickWatch = setInterval(() => {
        if (b.prompt.resolve) { asked = true; b.prompt._finish('MAAZPET'); }
      }, 80);

      // Real RNG, weakened target: retry until it sticks. (Stubbing
      // Math.random globally would break Phaser's UUID generation.)
      let attempts = 0;
      while (b.scene.isActive() && w.state.party.length === partyBefore && attempts < 8) {
        attempts++;
        b.enemyMon.hp = 1;
        await b.useItem('greatball');
        await new Promise(r => setTimeout(r, 150));
      }
      const t0 = Date.now();
      while (Date.now() - t0 < 8000 && b.scene.isActive()) await new Promise(r => setTimeout(r, 100));
      clearInterval(tapper);
      clearInterval(nickWatch);
      const last = w.state.party[w.state.party.length - 1];
      return { partyBefore, partyAfter: w.state.party.length,
               ballsBefore, ballsAfter: w.state.bag.greatball,
               caught: w.state.caught.length, attempts,
               asked, caughtName: last.name, caughtNick: last.nickname };
    });
    check('ball consumed', catchRes.ballsAfter < catchRes.ballsBefore,
      `${catchRes.ballsBefore} -> ${catchRes.ballsAfter} (${catchRes.attempts} throw(s))`);
    check('monster joined party', catchRes.partyAfter === catchRes.partyBefore + 1,
      `party ${catchRes.partyBefore} -> ${catchRes.partyAfter}`);
    check('pokedex caught entry', catchRes.caught >= 1);
    check('catch offers a nickname', catchRes.asked === true);
    check('nickname applied to caught monster',
      catchRes.caughtNick === 'MAAZPET' && catchRes.caughtName === 'MAAZPET',
      `${catchRes.caughtName} / ${catchRes.caughtNick}`);

    await page.waitForFunction(() => {
      const w = window.game.scene.getScene('WorldScene');
      return !w.scene.isPaused() && !w.encounterActive;
    }, { timeout: 8000 });

    log('\n[6] PARTY SWITCH + ITEMS');
    const swapRes = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      w.startBattle();
      await new Promise(r => setTimeout(r, 700));
      const b = window.game.scene.getScene('BattleScene');
      const firstName = b.playerMon.name;
      const tapper = setInterval(() => b.input.emit('pointerdown'), 50);
      // Switch to party slot 1 (the caught monster)
      await b.switchTo(1, true);
      const afterName = b.playerMon.name;
      // Use a potion after taking damage
      b.playerMon.hp = Math.max(1, b.playerMon.maxHp - 30);
      const hpBefore = b.playerMon.hp;
      const potionsBefore = w.state.bag.potion;
      await b.useItem('potion');
      const res = { firstName, afterName, hpBefore, hpAfter: b.playerMon.hp,
                    potionsBefore, potionsAfter: w.state.bag.potion,
                    activeIdx: b.activeIndex };
      clearInterval(tapper);
      b.endBattle('run');
      return res;
    });
    check('switched active monster', swapRes.activeIdx === 1 && swapRes.afterName !== swapRes.firstName,
      `${swapRes.firstName} -> ${swapRes.afterName}`);
    check('potion healed', swapRes.hpAfter > swapRes.hpBefore, `${swapRes.hpBefore} -> ${swapRes.hpAfter}`);
    check('potion consumed', swapRes.potionsAfter === swapRes.potionsBefore - 1);

    await page.waitForFunction(() => {
      const w = window.game.scene.getScene('WorldScene');
      return !w.scene.isPaused() && !w.encounterActive;
    }, { timeout: 8000 });

    log('\n[7] MENU + SAVE/LOAD');
    const menuRes = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      // Save from the cave, so "which area am I in" is actually restored
      // rather than coincidentally matching the default start map.
      await w.warpTo('cave', 5, 5, 'down');
      w.openMenu(); const opened = w.menuOpen;
      w.showParty(); w.showBag(); w.showDex();   // exercise each screen
      w.openMenu();
      const saved = w.persist();
      w.closeMenu();
      return { opened, saved, closed: !w.menuOpen, raw: !!localStorage.getItem('maazgame.save.v1') };
    });
    check('menu opens/closes', menuRes.opened && menuRes.closed);
    check('save written to localStorage', menuRes.saved && menuRes.raw);

    // Reload the page and confirm the save is restored
    await page.reload({ waitUntil: 'load' });
    await bootToWorld(page);
    const loaded = await page.evaluate(() => {
      const w = window.game.scene.getScene('WorldScene');
      return { party: w.state.party.length, names: w.state.party.map(m=>m.name),
               pos: { c: w.player.col, r: w.player.row }, caught: w.state.caught.length,
               hpValid: w.state.party.every(m => m.hp >= 0 && m.hp <= m.maxHp),
               map: w.map.name, facing: w.player.facing };
    });
    check('save restored after reload', loaded.party === 2, `party: ${loaded.names.join(', ')}`);
    check('caught list persisted', loaded.caught >= 1);
    check('restored HP within bounds', loaded.hpValid);
    check('restored the saved area, not the start map', loaded.map === 'cave',
      `${loaded.map} at (${loaded.pos.c},${loaded.pos.r}) facing ${loaded.facing}`);

    log('\n[8] BLACKOUT (all fainted)');
    const blackout = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      w.state.party.forEach(m => { m.hp = 0; });
      w.onBattleEnd('lose');
      await new Promise(r => setTimeout(r, 1200));   // blackout warp fades
      return { healed: w.state.party.every(m => m.hp === m.maxHp),
               map: w.map.name, at: { c: w.player.col, r: w.player.row } };
    });
    check('party healed on blackout', blackout.healed);
    check('returned to start map', blackout.map === 'town', `${blackout.map} ${JSON.stringify(blackout.at)}`);

    log('\n[9] HEAL TILE + SIGNS');
    const world = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      w.state.party[0].hp = 1;
      w.placePlayer(4, 3, 'down');                  // the rest house floor
      w.onStepComplete(4, 3);
      const healed = w.state.party[0].hp === w.state.party[0].maxHp;
      // Stand beside the town sign at (2,7) and face it.
      w.placePlayer(3, 7, 'left');
      w.interact();
      const toastVisible = w.toastText.visible && w.toastText.text.includes('MAAZ TOWN');
      return { healed, toastVisible };
    });
    check('heal tile restores party', world.healed);
    check('sign readable via interact', world.toastVisible);

    log('\n[10] NPCs + DIALOGUE');
    const npcRes = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      await w.warpTo('town', 8, 7, 'up');            // stand below the town kid
      await new Promise(r => setTimeout(r, 400));
      const out = {
        count: w.npcs.length,
        blocked: w.npcs.every(n => w.matrix.isBlocked(n.col, n.row)),
      };
      w.interact();
      await new Promise(r => setTimeout(r, 300));
      out.opened = w.dialogue.open;
      out.firstLine = w.dialogue.text.text;
      for (let i = 0; i < 6; i++) {
        w.input.emit('pointerdown');
        await new Promise(r => setTimeout(r, 140));
      }
      out.closed = !w.dialogue.open && !w.busy;
      return out;
    });
    check('NPCs spawned in town', npcRes.count >= 4, `${npcRes.count} people`);
    check('every NPC blocks their tile', npcRes.blocked);
    check('talking opens a dialogue box', npcRes.opened, JSON.stringify(npcRes.firstLine));
    check('paging closes it and frees input', npcRes.closed);

    log('\n[11] TRAINER SIGHT + TEAM BATTLE');
    const sight = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      await w.warpTo('route1', 8, 9, 'up');
      await new Promise(r => setTimeout(r, 400));
      const t = w.npcs.find(n => n.kind === 'trainer');
      return {
        tiles: t.sightTiles(w.matrix).length,
        sees: t.sees(8, 8, w.matrix),
        blindSpot: t.sees(1, 1, w.matrix),
      };
    });
    check('trainer watches a line of tiles', sight.tiles > 0, `${sight.tiles} tiles`);
    check('sees the player in its line', sight.sees && !sight.blindSpot);

    const trainerBattle = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      const t = w.npcs.find(n => n.kind === 'trainer');
      w.busy = false; w.encounterActive = false;
      w.startTrainerBattle(t);
      await new Promise(r => setTimeout(r, 900));
      const b = window.game.scene.getScene('BattleScene');
      const tapper = setInterval(() => b.input.emit('pointerdown'), 50);

      const ballsBefore = w.state.bag.ball;
      await b.tryRun();
      const fled = !b.scene.isActive();
      await b.useItem('ball');
      const ballsAfter = w.state.bag.ball;

      // Overpower the player so the whole enemy team is cleared.
      b.playerMon.level = 30; b.playerMon.atk = 250;
      b.playerMon.maxHp = 400; b.playerMon.hp = 400;
      const faced = new Set();
      const t0 = Date.now();
      while (Date.now() - t0 < 25000 && b.scene.isActive()) {
        faced.add(b.enemyMon.name);
        if (!b.busy) b.takeTurn({ kind: 'move', move: b.playerMon.moves[0] });
        await new Promise(r => setTimeout(r, 120));
      }
      clearInterval(tapper);
      return {
        isTrainer: true, fled, ballsBefore, ballsAfter,
        faced: [...faced], ended: !b.scene.isActive(),
        defeated: w.state.defeatedTrainers.slice(), money: w.state.money,
      };
    });
    check('cannot flee a trainer battle', !trainerBattle.fled);
    check('cannot catch a trainer monster', trainerBattle.ballsAfter === trainerBattle.ballsBefore);
    check('fights the trainer\'s whole team', trainerBattle.faced.length >= 2,
      trainerBattle.faced.join(' then '));
    check('trainer recorded as defeated', trainerBattle.defeated.length >= 1,
      trainerBattle.defeated.join(','));
    check('prize money awarded', trainerBattle.money > 500, String(trainerBattle.money));

    log('\n[12] STATUS CONDITIONS + HELD ITEMS');
    const statusRes = await page.evaluate(async () => {
      const mod = await import('/src/systems/monster.js');
      const st = await import('/src/systems/status.js');
      const out = {};

      // Burn halves attack and chips HP; fire types are immune.
      const target = mod.makeMonster('aqua', 10);
      const atkBefore = mod.effectiveStat(target, 'atk', null);
      st.inflictStatus(target, 'burn');
      out.atkHalved = mod.effectiveStat(target, 'atk', null) < atkBefore;
      out.tick = st.statusTick(target).damage;
      out.fireImmune = st.inflictStatus(mod.makeMonster('maaz', 10), 'burn').reason === 'immune';

      // Paralysis slows and sometimes skips.
      const par = mod.makeMonster('birbo', 10);
      const spdBefore = mod.effectiveStat(par, 'spd', null);
      st.inflictStatus(par, 'paralysis');
      out.spdCut = mod.effectiveStat(par, 'spd', null) < spdBefore;
      let skips = 0;
      for (let i = 0; i < 2000; i++) if (st.rollStatusSkip(par).skipped) skips++;
      out.skipRate = skips / 2000;

      // Healing clears conditions.
      mod.healMonster(par);
      out.healClears = par.status === null;

      // Held items: type boost, pinch berry, status guard.
      const boosted = mod.makeMonster('maaz', 10); boosted.held = 'charcoal';
      out.boost = mod.heldTypeBoost(boosted, 'fire');
      out.boostWrongType = mod.heldTypeBoost(boosted, 'water');
      const berry = mod.makeMonster('aqua', 10); berry.held = 'oranberry'; berry.hp = 4;
      const pinch = mod.tryPinchHeal(berry);
      out.berryFired = !!pinch && berry.held === null;
      out.berryIdleAtFullHp = mod.tryPinchHeal(mod.makeMonster('aqua', 10)) === null;
      const guard = mod.makeMonster('aqua', 10); guard.held = 'burnguard';
      out.guards = mod.heldBlocksStatus(guard, 'burn') && !mod.heldBlocksStatus(guard, 'poison');
      return out;
    });
    check('burn halves attack and ticks HP', statusRes.atkHalved && statusRes.tick > 0,
      `tick ${statusRes.tick}`);
    check('type immunity respected (fire cannot burn)', statusRes.fireImmune);
    check('paralysis cuts speed and skips turns', statusRes.spdCut && statusRes.skipRate > 0.15,
      `${(statusRes.skipRate * 100).toFixed(0)}% skips`);
    check('healing clears conditions', statusRes.healClears);
    check('held type boost applies to matching type only',
      statusRes.boost > 1 && statusRes.boostWrongType === 1, `x${statusRes.boost}`);
    check('pinch berry fires low and is consumed',
      statusRes.berryFired && statusRes.berryIdleAtFullHp);
    check('status guard blocks only its condition', statusRes.guards);

    log('\n[13] SAVE ROUND TRIP');
    await page.waitForFunction(() => {
      const w = window.game.scene.getScene('WorldScene');
      return !w.scene.isPaused() && !w.encounterActive;
    }, { timeout: 10000 });
    await page.evaluate(() => {
      const w = window.game.scene.getScene('WorldScene');
      w.state.party[0].status = 'poison';
      w.persist();
    });
    await page.reload({ waitUntil: 'load' });
    await bootToWorld(page);
    const v3 = await page.evaluate(() => {
      const w = window.game.scene.getScene('WorldScene');
      return {
        version: JSON.parse(localStorage.getItem('maazgame.save.v1')).version,
        status: w.state.party[0].status,
        held: w.state.party[0].held,
        defeated: w.state.defeatedTrainers.length,
        money: w.state.money,
      };
    });
    check('save format is current', v3.version === 4, `v${v3.version}`);
    check('condition survives a reload', v3.status === 'poison');
    check('held item survives a reload', v3.held === 'oranberry');
    check('beaten trainers survive a reload', v3.defeated >= 1);
    check('money survives a reload', v3.money > 500, String(v3.money));

    log('\n[14] TITLE, NAMING + SHEEP GIFT');
    const intro = await page.evaluate(() => {
      const w = window.game.scene.getScene('WorldScene');
      return { name: w.state.playerName, starter: w.state.party[0].speciesKey };
    });
    check('player name recorded', !!intro.name, intro.name);

    const gift = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      w.busy = false;
      await w.warpTo('town', 14, 8, 'right');    // beside the ranch hand
      await new Promise(r => setTimeout(r, 400));
      const before = w.state.party.length;
      w.interact();
      await new Promise(r => setTimeout(r, 350));
      for (let i = 0; i < 6; i++) {
        w.input.emit('pointerdown');
        await new Promise(r => setTimeout(r, 150));
      }
      if (w.prompt.resolve) w.prompt._finish('WOOLY');
      await new Promise(r => setTimeout(r, 300));
      const mon = w.state.party[w.state.party.length - 1];
      // Talking again must not hand over a second sheep.
      w.busy = false;
      w.interact();
      await new Promise(r => setTimeout(r, 300));
      for (let i = 0; i < 4; i++) {
        w.input.emit('pointerdown');
        await new Promise(r => setTimeout(r, 140));
      }
      return { before, after: w.state.party.length,
               species: mon.speciesKey, nick: mon.nickname,
               afterSecondTalk: w.state.party.length };
    });
    check('ranch hand gifts a sheep', gift.species === 'lamblet' && gift.after === gift.before + 1,
      `LAMBLET nicknamed ${gift.nick}`);
    check('gift is one-off', gift.afterSecondTalk === gift.after);

    log('\n[15] SHOP');
    const shop = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      w.busy = false;
      w.state.money = 2000;
      await w.warpTo('town', 12, 7, 'up');       // below the shopkeeper
      await new Promise(r => setTimeout(r, 400));
      w.interact();
      await new Promise(r => setTimeout(r, 350));
      for (let i = 0; i < 3; i++) {
        w.input.emit('pointerdown');
        await new Promise(r => setTimeout(r, 160));
      }
      const opened = !!w.shop.resolve;
      const potions = w.state.bag.potion, money = w.state.money;
      w.shop._buy({ key: 'potion', price: 200, kind: 'bag' });
      w.shop._buy({ key: 'charcoal', price: 700, kind: 'held' });
      // Cannot buy what you cannot afford.
      w.state.money = 10;
      w.shop._buy({ key: 'greatball', price: 500, kind: 'bag' });
      const out = { opened, potions, potionsAfter: w.state.bag.potion,
                    money, moneyAfter: w.state.money,
                    held: w.state.heldStock.charcoal,
                    overspent: w.state.money < 0 };
      w.shop._close();
      w._endConversation();
      return out;
    });
    check('shop opens from the shopkeeper', shop.opened);
    check('purchase adds stock and deducts money',
      shop.potionsAfter === shop.potions + 1 && shop.held === 1);
    check('cannot overspend', !shop.overspent, `${shop.moneyAfter} coins left`);

    log('\n[16] EVOLUTION');
    const evo = await page.evaluate(async () => {
      const mod = await import('/src/systems/monster.js');
      const out = {};
      const sheep = mod.makeMonster('lamblet', 11);
      out.notYet = mod.pendingEvolution(sheep) === null;
      sheep.level = 12;
      const maxBefore = sheep.maxHp;
      const r = mod.evolveMonster(sheep);
      out.evolved = r && r.toName === 'WOOLIE';
      out.statsGrew = sheep.maxHp > maxBefore;
      out.typeCarried = sheep.speciesKey === 'woolie';
      // A nickname survives evolution; an un-nicknamed monster takes the new name.
      const named = mod.makeMonster('lamblet', 12);
      mod.setNickname(named, 'Maazu');
      mod.evolveMonster(named);
      out.keepsNickname = named.name === 'Maazu' && named.speciesKey === 'woolie';
      const plain = mod.makeMonster('lamblet', 12);
      mod.evolveMonster(plain);
      out.takesNewName = plain.name === 'WOOLIE';
      // Full line ends at RAMBOLT.
      sheep.level = 24;
      mod.evolveMonster(sheep);
      out.finalStage = sheep.speciesKey === 'rambolt' && mod.pendingEvolution(sheep) === null;
      return out;
    });
    check('does not evolve early', evo.notYet);
    check('evolves at the right level with bigger stats', evo.evolved && evo.statsGrew);
    check('nickname survives evolution', evo.keepsNickname && evo.takesNewName);
    check('line ends at its final stage', evo.finalStage);

    log('\n[17] CHAMPION GATE + ENDING');
    const champ = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      w.busy = false; w.encounterActive = false;
      w.state.defeatedTrainers = [];
      await w.warpTo('hall', 6, 4, 'up');
      await new Promise(r => setTimeout(r, 500));
      w.busy = false;
      w.interact();
      await new Promise(r => setTimeout(r, 350));
      const lockedText = w.dialogue.text.text;
      const lockedBattle = w.encounterActive;
      for (let i = 0; i < 6; i++) {
        w.input.emit('pointerdown');
        await new Promise(r => setTimeout(r, 140));
      }
      return { lockedText, lockedBattle };
    });
    check('champion is locked until the road trainers are beaten',
      !champ.lockedBattle && /CHAMPION/.test(champ.lockedText || ''));

    const fight = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      w.busy = false; w.encounterActive = false;
      w.state.defeatedTrainers = ['route1:joey', 'route1:rae', 'cave:dell'];
      w.interact();
      await new Promise(r => setTimeout(r, 350));
      for (let i = 0; i < 8; i++) {
        w.input.emit('pointerdown');
        await new Promise(r => setTimeout(r, 140));
      }
      await new Promise(r => setTimeout(r, 900));
      const b = window.game.scene.getScene('BattleScene');
      if (!b || !b.scene.isActive()) return { started: false };

      const tapper = setInterval(() => b.input.emit('pointerdown'), 50);
      b.playerMon.level = 50; b.playerMon.atk = 400;
      b.playerMon.maxHp = 600; b.playerMon.hp = 600;
      const team = b.enemyTeam.length;
      const t0 = Date.now();
      while (Date.now() - t0 < 40000 && b.scene.isActive()) {
        if (!b.busy) b.takeTurn({ kind: 'move', move: b.playerMon.moves[0] });
        await new Promise(r => setTimeout(r, 110));
      }
      clearInterval(tapper);

      // The world plays the champion's defeat line, then launches the ending.
      const t1 = Date.now();
      let ending = null;
      while (Date.now() - t1 < 12000) {
        w.input.emit('pointerdown');
        const e = window.game.scene.getScene('EndingScene');
        if (e && e.scene.isActive()) { ending = e; break; }
        await new Promise(r => setTimeout(r, 150));
      }
      return { started: true, team, beaten: w.state.championBeaten, ending: !!ending };
    });
    check('champion battles once unlocked', fight.started, `team of ${fight.team}`);
    check('champion recorded as beaten', fight.beaten);
    check('Hall of Fame ending plays', fight.ending);

    log('\n[18] RARE CANDY');
    const candy = await page.evaluate(async () => {
      const w = window.game.scene.getScene('WorldScene');
      const { candyLevelCap, championAceLevel } = await import('./src/data/trainers.js');
      const cap = candyLevelCap();
      w.busy = false;
      w.menuOpen = false;

      // A fresh low-level sheep to feed, so the check is independent of
      // whatever the party has been through earlier in the suite.
      const { makeMonster } = await import('./src/systems/monster.js');
      const lamb = makeMonster('lamblet', 5);
      w.state.party.push(lamb);
      const startLevel = lamb.level;

      w._useCandy(lamb);
      const afterOne = lamb.level;
      const hpGrew = lamb.maxHp > 30 + startLevel * 3 - 1;

      // Feed it up to the cap; it must evolve on the way and then stop.
      let guard = 0;
      while (lamb.level < cap && guard++ < 60) w._useCandy(lamb);
      const atCap = lamb.level;
      const speciesAtCap = lamb.speciesKey;

      w._useCandy(lamb);                       // one past the ceiling
      const afterCap = lamb.level;

      // The bag never runs out — the candy isn't stored there at all.
      const inBagState = Object.keys(w.state.bag).includes('rarecandy');
      return { cap, ace: championAceLevel(), startLevel, afterOne, hpGrew,
               atCap, afterCap, speciesAtCap, inBagState };
    });
    check('candy cap is five over the champion ace',
      candy.cap === candy.ace + 5, `ace Lv${candy.ace}, cap Lv${candy.cap}`);
    check('one candy is one level', candy.afterOne === candy.startLevel + 1,
      `Lv${candy.startLevel} -> Lv${candy.afterOne}`);
    check('stats grow with the level', candy.hpGrew);
    check('candy evolves at the right level', candy.speciesAtCap === 'rambolt',
      candy.speciesAtCap);
    check('candy stops at the cap', candy.atCap === candy.cap && candy.afterCap === candy.cap,
      `stuck at Lv${candy.afterCap}`);
    check('candy is never consumed', candy.inBagState === false);

    log('\n[19] SAVE v4');
    await page.evaluate(() => {
      const e = window.game.scene.getScene('EndingScene');
      if (e && e.scene.isActive()) e.finish();
    });
    await page.waitForFunction(() => {
      const w = window.game.scene.getScene('WorldScene');
      return !w.scene.isPaused();
    }, { timeout: 10000 });
    await page.evaluate(() => window.game.scene.getScene('WorldScene').persist());
    await page.reload({ waitUntil: 'load' });
    await bootToWorld(page);
    const v4 = await page.evaluate(() => {
      const w = window.game.scene.getScene('WorldScene');
      return {
        version: JSON.parse(localStorage.getItem('maazgame.save.v1')).version,
        name: w.state.playerName,
        champion: w.state.championBeaten,
        gifts: w.state.gifts.length,
        held: Object.keys(w.state.heldStock || {}).length,
        nicknamed: w.state.party.some(m => !!m.nickname),
      };
    });
    check('save format is v4', v4.version === 4);
    check('player name persisted', !!v4.name, v4.name);
    check('champion flag persisted', v4.champion);
    check('gifts and shop stock persisted', v4.gifts >= 1 && v4.held >= 1);
    check('nicknames persisted', v4.nicknamed);

    await page.screenshot({ path: OUT + '/new_world.png' });
    await page.evaluate(() => window.game.scene.getScene('WorldScene').openMenu());
    await page.waitForTimeout(200);
    await page.screenshot({ path: OUT + '/new_menu.png' });

    log('\n=== RESULT ===');
    if (errors.length) { log('RUNTIME ERRORS:'); errors.forEach(e => log('  ' + e)); }
    else log('No runtime errors.');
    log(failures === 0 && errors.length === 0 ? 'ALL CHECKS PASSED' : `${failures} check failure(s), ${errors.length} error(s)`);
    if (failures || errors.length) process.exitCode = 1;
  } catch (e) {
    log('TEST HARNESS FAILURE:', e.message);
    errors.forEach(x => log('  ' + x));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
})();
