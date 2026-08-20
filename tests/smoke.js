// =========================================================================
//  Smoke test — boots the real game in headless Chromium and exercises every
//  major system end to end: movement/collision, type effectiveness, a full
//  battle with XP and level-ups, catching, party switching, items, the pause
//  menu, save/load across a reload, blackout, heal tiles and signs.
//
//  Usage:
//    npm install playwright        (once)
//    node tests/smoke.js
//
//  Env: PORT, CHROMIUM (path to a browser binary), SHOT_DIR (screenshot dir).
// =========================================================================
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const ROOT = process.env.GAME_ROOT || require('path').resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8151);
const OUT = process.env.SHOT_DIR || require('os').tmpdir();

const log = (...a) => console.log(...a);

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
    await page.waitForFunction(() => window.game?.scene?.getScene('WorldScene')?.ready, { timeout: 15000 });
    log('\n[1] BOOT');
    const boot = await page.evaluate(() => {
      const w = window.game.scene.getScene('WorldScene');
      return { party: w.state.party.length, lead: w.state.party[0].name, lvl: w.state.party[0].level,
               bag: w.state.bag, rows: w.matrix.blocked.length, cols: w.matrix.blocked[0].length,
               spawnBlocked: w.matrix.isBlocked(w.player.col, w.player.row),
               mapName: w.map.name, mapTitle: w.map.displayName,
               areas: Object.keys(w.mapIndex.maps) };
    });
    check('started in town', boot.mapName === 'town', `${boot.mapTitle}`);
    check('all areas indexed', boot.areas.length === 3, boot.areas.join(', '));
    check('world + party ready', boot.party === 1 && boot.lead === 'MAAZ', `${boot.lead} Lv${boot.lvl}`);
    check('collision matrix built', boot.rows === 15 && boot.cols === 20, `${boot.cols}x${boot.rows}`);
    check('spawn walkable', !boot.spawnBlocked);
    check('starting bag', boot.bag.ball === 5 && boot.bag.potion === 3, JSON.stringify(boot.bag));

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
      return { partyBefore, partyAfter: w.state.party.length,
               ballsBefore, ballsAfter: w.state.bag.greatball,
               caught: w.state.caught.length, attempts };
    });
    check('ball consumed', catchRes.ballsAfter < catchRes.ballsBefore,
      `${catchRes.ballsBefore} -> ${catchRes.ballsAfter} (${catchRes.attempts} throw(s))`);
    check('monster joined party', catchRes.partyAfter === catchRes.partyBefore + 1,
      `party ${catchRes.partyBefore} -> ${catchRes.partyAfter}`);
    check('pokedex caught entry', catchRes.caught >= 1);

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
    await page.waitForFunction(() => window.game?.scene?.getScene('WorldScene')?.ready, { timeout: 15000 });
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
