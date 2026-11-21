// sfx.js
// Tiny retro sound effects, synthesised with the Web Audio API (no audio files).
// Each sound is a few short square-wave "beeps", like an old computer.

let audio = null;  // created on first use (browsers only allow sound after a click)
let muted = false;
let detune = 0;    // cents: sounds drift out of tune as Otto loses patience

export function setMuted(value) {
  muted = value;
  if (muted) stopBuzz();
}

export function setDetune(cents) {
  detune = cents;
}

// The shared AudioContext (also used by music.js).
export function getAudio() {
  audio ||= new AudioContext();
  return audio;
}

// One beep: a frequency (Hz) for a number of milliseconds, starting after `delay` ms.
function beep(frequency, ms, delay = 0, volume = 0.05) {
  if (muted) return;
  try {
    getAudio();
    const start = audio.currentTime + delay / 1000;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune * (Math.random() < 0.5 ? -1 : 1);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000); // quick fade, no click
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + ms / 1000);
  } catch {
    // no sound available — the game works fine without it
  }
}

export const sfx = {
  place: () => beep(880, 60),                                  // you place an X
  otto: () => beep(440, 80),                                   // Otto places an O
  click: () => beep(1200, 25, 0, 0.03),                        // buttons and disks
  rule: () => [523, 659, 784].forEach((f, i) => beep(f, 90, i * 90)), // NEW_RULE.EXE
  caught: () => [988, 1319].forEach((f, i) => beep(f, 90, i * 100)),  // CAUGHT!
  cheat: () => [392, 311].forEach((f, i) => beep(f, 120, i * 120)),   // a cheat lands
  win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 120, i * 120)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 150, i * 150)),
};

// --- A low, quiet buzz loop (Otto's Meltdown stage) ------------------------------------------
let buzz = null;

export function startBuzz() {
  if (muted || buzz) return;
  try {
    getAudio();
    const oscillator = audio.createOscillator();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 55;      // a low hum
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    gain.gain.value = 0.012;              // very quiet
    oscillator.connect(filter).connect(gain).connect(audio.destination);
    oscillator.start();
    buzz = { oscillator, gain };
  } catch {
    buzz = null;
  }
}

export function stopBuzz() {
  if (!buzz) return;
  try {
    buzz.gain.gain.setTargetAtTime(0, audio.currentTime, 0.1);
    buzz.oscillator.stop(audio.currentTime + 0.5);
  } catch {
    // already stopped
  }
  buzz = null;
}

// --- Quiet TV static (the 2000s TV interference) -------------------------------------------
export function staticNoise(ms, volume = 0.02) {
  if (muted) return;
  try {
    getAudio();
    const length = Math.floor((audio.sampleRate * ms) / 1000);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 3000; // hissy, not harsh
    const start = audio.currentTime;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.setValueAtTime(volume, start + (ms / 1000) * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(start);
  } catch {
    // no sound available
  }
}
