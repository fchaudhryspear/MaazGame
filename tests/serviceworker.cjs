// =========================================================================
//  SERVICE WORKER TEST — proves an update actually reaches the browser.
//
//  This exists because it once didn't: the worker was cache-first, so
//  pulling new code changed the files on disk and the running game carried
//  on serving the previous version, with the browser requesting nothing at
//  all. Three things have to hold at once, and the third is why the fix
//  isn't simply "delete the service worker":
//
//    1. with a worker controlling the page, modules are still requested;
//    2. an edited file is picked up on the next load;
//    3. the game still boots with the network cut.
//
//  Usage: node tests/serviceworker.cjs      (env: PORT, CHROMIUM)
// =========================================================================
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = process.env.GAME_ROOT || path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8161);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
                '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json' };
let hits = [];

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  hits.push(url);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

let failures = 0;
const check = (ok, pass, fail) => {
  console.log(ok ? `PASS  ${pass}` : `FAIL  ${fail}`);
  if (!ok) failures++;
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
  );
  const ctx = await browser.newContext({ viewport: { width: 480, height: 352 } });
  const page = await ctx.newPage();

  // First load: registers and installs the worker.
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => window.game?.scene?.getScene('TitleScene')?.ready, { timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 20000 });
  console.log('worker is controlling the page');

  // Second load, worker in charge. Network-first means the modules are still
  // requested; the old cache-first worker would have served them silently.
  hits = [];
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.game?.scene?.getScene('TitleScene')?.ready, { timeout: 20000 });
  await wait(500);
  const askedForMain = hits.some(h => h.includes('/src/main.js'));
  const askedForAssets = hits.some(h => h.includes('/src/assets.js'));
  check(askedForMain && askedForAssets,
    'modules re-fetched with the worker active',
    `worker served stale copies — hits: ${JSON.stringify(hits.slice(0, 12))}`);

  // Now edit a file the way `git pull` would, and check the change appears.
  const cfg = path.join(ROOT, 'src/config.js');
  const original = fs.readFileSync(cfg, 'utf8');
  fs.writeFileSync(cfg, original.replace('MOVE_MS: 180', 'MOVE_MS: 181'));
  try {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.game?.scene?.getScene('TitleScene')?.ready, { timeout: 20000 });
    const moveMs = await page.evaluate(async () => (await import('./src/config.js')).CONFIG.MOVE_MS);
    check(moveMs === 181,
      'an edited file is picked up on the next load',
      `still serving the old file (MOVE_MS=${moveMs})`);
  } finally {
    fs.writeFileSync(cfg, original);
  }

  // And offline still works, which is the whole point of keeping the cache.
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  const bootedOffline = await page.waitForFunction(
    () => window.game?.scene?.getScene('TitleScene')?.ready, { timeout: 20000 }
  ).then(() => true).catch(() => false);
  check(bootedOffline, 'still boots offline from the cache', 'offline boot broken');

  console.log(failures ? `\n${failures} failure(s)` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failures ? 1 : 0);
})();
