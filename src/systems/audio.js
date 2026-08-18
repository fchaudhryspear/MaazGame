// =========================================================================
//  AUDIO — procedural sound effects via WebAudio.
//  No audio files: every sound is a short oscillator envelope, which keeps
//  the PWA tiny and asset-free.
//
//  iOS/iPadOS will not start an AudioContext until a real user gesture, so
//  `unlock()` must be called from a pointer/key handler. Until then every
//  play() call is a silent no-op rather than an error.
// =========================================================================

let ctx = null;
let master = null;
let muted = false;

export function unlock() {
  if (ctx) {
    // Safari can leave the context suspended after backgrounding.
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) {
    ctx = null;
  }
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.18;
}

export function isMuted() {
  return muted;
}

// One shaped tone. `type` is any OscillatorNode waveform.
function tone(freq, durationMs, { type = 'square', volume = 1, slideTo = null, delayMs = 0 } = {}) {
  if (!ctx || muted) return;
  const now = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const dur = durationMs / 1000;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);

  // Short attack, exponential release — reads as a crisp retro blip.
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

// Filtered noise burst, for impacts.
function noise(durationMs, { volume = 0.6, delayMs = 0 } = {}) {
  if (!ctx || muted) return;
  const now = ctx.currentTime + delayMs / 1000;
  const frames = Math.floor(ctx.sampleRate * (durationMs / 1000));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Decaying noise so it thumps rather than hisses.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(master);
  src.start(now);
}

export const SFX = {
  select:      () => tone(660, 60, { volume: 0.5 }),
  cancel:      () => tone(300, 80, { volume: 0.5 }),
  step:        () => tone(180, 35, { type: 'triangle', volume: 0.25 }),
  bump:        () => tone(120, 90, { type: 'sawtooth', volume: 0.4 }),

  hit:         () => { noise(120, { volume: 0.5 }); tone(220, 90, { slideTo: 110, volume: 0.5 }); },
  superHit:    () => { noise(170, { volume: 0.7 }); tone(340, 140, { slideTo: 120, volume: 0.7 }); },
  weakHit:     () => { noise(70, { volume: 0.3 }); tone(180, 70, { slideTo: 140, volume: 0.3 }); },
  miss:        () => tone(400, 120, { type: 'sine', slideTo: 200, volume: 0.4 }),

  faint:       () => { tone(400, 400, { type: 'sawtooth', slideTo: 60, volume: 0.6 }); },
  heal:        () => { tone(523, 90); tone(659, 90, { delayMs: 90 }); tone(784, 160, { delayMs: 180 }); },
  encounter:   () => { tone(300, 90, { volume: 0.6 }); tone(500, 90, { delayMs: 90, volume: 0.6 }); tone(700, 160, { delayMs: 180, volume: 0.6 }); },

  ballThrow:   () => tone(500, 140, { type: 'sine', slideTo: 900, volume: 0.5 }),
  ballWobble:  () => tone(350, 70, { type: 'sine', volume: 0.45 }),
  caught:      () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 150, { delayMs: i * 110, volume: 0.6 })); },
  levelUp:     () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 130, { delayMs: i * 80, volume: 0.55 })); },
  victory:     () => { [659, 659, 784, 1046].forEach((f, i) => tone(f, 160, { delayMs: i * 130, volume: 0.6 })); },
  save:        () => { tone(784, 100); tone(1046, 160, { delayMs: 100 }); },
};
