// sfx.js
// Tiny retro sound effects, synthesised with the Web Audio API (no audio files).
// Each sound is a few short square-wave "beeps", like an old computer.

let audio = null;  // created on first use (browsers only allow sound after a click)
let muted = false;

export function setMuted(value) {
  muted = value;
}

// One beep: a frequency (Hz) for a number of milliseconds, starting after `delay` ms.
function beep(frequency, ms, delay = 0, volume = 0.05) {
  if (muted) return;
  try {
    audio ||= new AudioContext();
    const start = audio.currentTime + delay / 1000;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
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
