// =========================================================================
//  BOOT — Phaser config tuned for crisp pixel art on iPad Safari.
// =========================================================================
import { VIEW_W, VIEW_H } from './config.js';
import { TitleScene } from './scenes/TitleScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { EndingScene } from './scenes/EndingScene.js';

const gameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#10131a',
  pixelArt: true,        // nearest-neighbour scaling, no smoothing
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,           // letterbox to fit any iPad screen
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW_W,
    height: VIEW_H,
  },
  render: { antialias: false, pixelArt: true },
  // TitleScene starts first, then hands off to the world.
  scene: [TitleScene, WorldScene, BattleScene, EndingScene],
};

if (typeof Phaser === 'undefined') {
  document.getElementById('game-root').innerHTML =
    '<p style="color:#fff;font-family:sans-serif;padding:2rem;text-align:center">' +
    'Failed to load Phaser (vendor/phaser.min.js). Make sure the file is ' +
    'served alongside index.html.</p>';
} else {
  // Exposed for debugging and automated tests.
  window.game = new Phaser.Game(gameConfig);
}

// PWA: register the service worker so the game installs to the iPad home
// screen and runs offline. Best-effort — the game works fine without it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => reg.update())     // check for a new worker every boot
      .catch((err) => console.warn('Service worker registration failed:', err));
  });

  // When a new worker takes over, the page in front of you is still running
  // the old code it was served. Reload once, so pulling an update and
  // reopening the game is all it takes to actually see the update.
  //
  // Guarded on there having been a controller already: the very first
  // registration also fires controllerchange (via clients.claim), and
  // reloading a first-time visitor for no reason would be its own bug.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
}
