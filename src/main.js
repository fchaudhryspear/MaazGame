// =========================================================================
//  BOOT — Phaser config tuned for crisp pixel art on iPad Safari.
// =========================================================================
import { VIEW_W, VIEW_H } from './config.js';
import { WorldScene } from './scenes/WorldScene.js';
import { BattleScene } from './scenes/BattleScene.js';

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
  scene: [WorldScene, BattleScene],   // WorldScene starts first
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
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}
