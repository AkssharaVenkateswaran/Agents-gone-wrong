// music.js
// Original 8-bit background music, made live with the Web Audio API (no audio files).
// It starts cheerful and gets faster, darker and more broken as Otto loses patience.
//
//   startMusic()        start (only after a click: browsers block autoplay)
//   setStage(stage)     0-3, from Otto's patience
//   setPatience(p)      smooth changes in between (tempo and wobble keep creeping up)
//   setCalm(on)         Calm mode: stays on the stage 0/1 arrangement
//   musicEvent(name)    react to the game: 'ruleChange', 'cheat', 'cheatCaught', ...
//   setMusicEnabled(on) the music toggle;  setMusicMuted(on) the global mute
//   stopMusic()
//
// How it keeps time: a "look-ahead scheduler". Every 25 ms a setTimeout loop
// schedules every note that starts in the next 100 ms on the AudioContext clock,
// which is precise. (setTimeout alone would drift and stutter.)

import { getAudio } from './sfx.js';

const MUSIC_VOLUME = 0.15;     // quiet: sound effects stay louder
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;    // seconds
const STEPS_PER_BAR = 8;       // 8th notes in 4/4

// --- The arrangement for each stage (Calm, Irritated, Unhinged, Meltdown) ------------------
// Numbers in between stages are blended, so a stage change crossfades over 2 bars.
const STAGES = [
  { tempo: 96,  minor: 0, kick: 0.5, hats: 0, snare: 0, pad: 1, crush: 0, dist: 0, wobbleCents: 0,  wobbleHz: 1, stutter: 0,   tritone: 0,   noise: 0, tape: 0, pickup: 0 },
  { tempo: 112, minor: 0, kick: 0.6, hats: 1, snare: 1, pad: 1, crush: 0, dist: 0, wobbleCents: 8,  wobbleHz: 1, stutter: 0,   tritone: 0,   noise: 0, tape: 0, pickup: 0 },
  { tempo: 128, minor: 1, kick: 0.7, hats: 1, snare: 1, pad: 0, crush: 1, dist: 0, wobbleCents: 25, wobbleHz: 4, stutter: 0.1, tritone: 0,   noise: 0, tape: 0, pickup: 1 },
  { tempo: 150, minor: 1, kick: 0.8, hats: 1, snare: 1, pad: 0, crush: 1, dist: 1, wobbleCents: 25, wobbleHz: 4, stutter: 0.1, tritone: 0.2, noise: 1, tape: 1, pickup: 1 },
];

// Chords (one per bar, looping over 4 bars): [root semitone above C, minor?]
const MAJOR_CHORDS = [[0, false], [9, true], [5, false], [7, false]];  // C - Am - F - G
const MINOR_CHORDS = [[0, true], [8, false], [5, true], [7, false]];   // Cm - Ab - Fm - G
// Arpeggio per bar: root, 3rd, 5th, octave, 5th, 3rd, root, 5th (8th notes).
const ARPEGGIO = ['root', 'third', 'fifth', 'octave', 'fifth', 'third', 'root', 'fifth'];
const LEAD_ROOT = 72;   // C5 (MIDI note numbers)
const BASS_ROOT = 48;   // C3
const PAD_ROOT = 60;    // C4
const F_SHARP = 78;     // the tritone that sneaks in at Meltdown

const midiToHz = (note) => 440 * Math.pow(2, (note - 69) / 12);
const lerp = (a, b, t) => a + (b - a) * t;

// --- State ---------------------------------------------------------------------------------
let audio = null;
let nodes = null;          // the mixer (built once)
let running = false;
let timer = null;
let enabled = true;        // the music toggle
let muted = false;         // the global mute
let calm = false;
let stage = 0;             // the target stage
let patience = 100;
let fromParams = STAGES[0];
let crossfadeStart = 0;    // audio time when the last stage change began
let nextStepTime = 0;
let step = 0;              // 8th-note counter since the music started
let bassOnly = false;      // while NEW_RULE.EXE is open
let resumeAtBar = false;   // come back in on the next downbeat
let stutterNext = false;
let rampage = null;        // { start } while the rampage plays
let distortAll = false;    // the screen shattered
let tapeStop = null;       // { start, length } the final tape-stop
let overrideStage = null;  // debug: force a stage

// --- The mixer ---------------------------------------------------------------------------------
// lead -> (dry | bitcrusher) -> dirty bus <- bass;  dirty bus -> (dry | distortion) -> master
function curve(fn) {
  const samples = new Float32Array(1024);
  for (let i = 0; i < samples.length; i++) samples[i] = fn((i / (samples.length - 1)) * 2 - 1);
  return samples;
}

function buildMixer() {
  const gain = (value, to) => {
    const node = audio.createGain();
    node.gain.value = value;
    if (to) node.connect(to);
    return node;
  };
  const master = gain(0, audio.destination);
  const dirty = gain(1);
  const distDry = gain(1, master);
  const distortion = audio.createWaveShaper();
  distortion.curve = curve((x) => Math.tanh(x * 12));          // heavy distortion
  const distWet = gain(0, master);
  dirty.connect(distDry);
  dirty.connect(distortion).connect(distWet);

  const lead = gain(1);
  const crushDry = gain(1, dirty);
  const crusher = audio.createWaveShaper();
  crusher.curve = curve((x) => Math.round(x * 8) / 8);         // ~4-bit: 16 levels
  const crushWet = gain(0, dirty);
  lead.connect(crushDry);
  lead.connect(crusher).connect(crushWet);

  const bass = gain(1, dirty);
  const drums = gain(1, master);
  const pad = gain(1, master);
  return { master, distDry, distWet, crushDry, crushWet, lead, bass, drums, pad };
}

// White noise, made once and reused for drums and noise bursts.
let noiseBuffer = null;
function noise() {
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  return source;
}

// --- Instruments -------------------------------------------------------------------------------
function tone(type, freq, time, length, volume, out, { wobbleCents = 0, wobbleHz = 1, glideTo = null, filter = null } = {}) {
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), time + length);
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(volume, time + 0.005);   // short attack
  env.gain.exponentialRampToValueAtTime(0.0001, time + length);  // and decay
  if (wobbleCents > 0) {
    // A slow pitch wobble: a low-frequency oscillator nudging the detune.
    const lfo = audio.createOscillator();
    const depth = audio.createGain();
    lfo.frequency.value = wobbleHz;
    depth.gain.value = wobbleCents;
    lfo.connect(depth).connect(osc.detune);
    lfo.start(time);
    lfo.stop(time + length + 0.05);
  }
  let chain = osc;
  if (filter) chain = chain.connect(filter);
  chain.connect(env).connect(out);
  osc.start(time);
  osc.stop(time + length + 0.05);
}

function kick(time, volume) {
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);  // fast pitch drop
  env.gain.setValueAtTime(volume, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
  osc.connect(env).connect(nodes.drums);
  osc.start(time);
  osc.stop(time + 0.25);
}

function noiseHit(time, length, volume, filterType, freq, out = nodes.drums) {
  const source = noise();
  const filter = audio.createBiquadFilter();
  const env = audio.createGain();
  filter.type = filterType;
  filter.frequency.value = freq;
  env.gain.setValueAtTime(volume, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + length);
  source.connect(filter).connect(env).connect(out);
  source.start(time, Math.random() * 0.5);
  source.stop(time + length + 0.02);
}

// --- The current arrangement ---------------------------------------------------------------
function targetParams() {
  const s = overrideStage ?? stage;
  const arrangement = calm ? Math.min(s, 1) : s; // Calm mode: no distortion, stutters or tape
  const base = STAGES[arrangement];
  const next = STAGES[Math.min(arrangement + 1, 3)];
  // Between stages, tempo and wobble keep creeping up with patience.
  const stageTop = [100, 75, 50, 25][s];
  const creep = Math.max(0, Math.min(1, (stageTop - patience) / 25)) * 0.5;
  const params = { ...base, tempo: lerp(base.tempo, next.tempo, creep), wobbleCents: lerp(base.wobbleCents, next.wobbleCents, creep) };
  if (calm) params.tempo = base.tempo + 4 * s; // calm: only the tempo rises a little
  return params;
}

// Blend from the previous arrangement to the new one over 2 bars.
function currentParams(time) {
  const target = targetParams();
  const barLength = (60 / target.tempo) * 4;
  const t = Math.max(0, Math.min(1, (time - crossfadeStart) / (2 * barLength)));
  const params = {};
  for (const key of Object.keys(target)) params[key] = lerp(fromParams[key], target[key], t);
  params.minor = t >= 0.5 ? target.minor : fromParams.minor; // the chords switch half-way
  return params;
}

function markStageChange() {
  if (!audio) return;
  fromParams = currentParams(audio.currentTime);
  crossfadeStart = audio.currentTime;
}

// --- The scheduler ---------------------------------------------------------------------------
function scheduler() {
  if (!running) return;
  // If the tab was throttled and we fell behind, jump forward instead of rushing.
  if (nextStepTime < audio.currentTime - 0.2) nextStepTime = audio.currentTime + 0.05;
  while (nextStepTime < audio.currentTime + SCHEDULE_AHEAD) {
    const length = scheduleStep(nextStepTime);
    if (length === null) return; // the tape stopped
    nextStepTime += length;
    step++;
  }
  timer = setTimeout(scheduler, LOOKAHEAD_MS);
}

// Schedule one 8th note of music. Returns its length in seconds.
function scheduleStep(time) {
  const p = currentParams(time);
  const inBar = step % STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR);

  // Mixer settings for this moment.
  nodes.crushDry.gain.setTargetAtTime(1 - p.crush, time, 0.05);
  nodes.crushWet.gain.setTargetAtTime(p.crush, time, 0.05);
  const dist = distortAll ? 1 : p.dist;
  nodes.distDry.gain.setTargetAtTime(1 - dist * 0.7, time, 0.05);
  nodes.distWet.gain.setTargetAtTime(dist * 0.6, time, 0.05);

  // Speed and pitch: tape slowdowns, the rampage speed-up, the final tape-stop.
  let tempo = p.tempo;
  let pitch = 1;
  if (p.tape >= 0.5 && bar % 4 === 3 && inBar >= 4) {
    const t = (inBar - 3) / 4;           // the second half of every 4th bar
    pitch = 1 - 0.3 * t;                 // the whole mix sags ~30%...
    tempo *= 1 - 0.3 * t;                // ...then snaps back on the next bar
  }
  if (rampage) {
    const t = Math.min(1, (time - rampage.start) / 4);
    tempo = lerp(tempo, 180, t);
    pitch *= 1 + 0.25 * t;
  }
  if (tapeStop) {
    const t = (time - tapeStop.start) / tapeStop.length;
    if (t >= 1) return stopNow();
    pitch *= Math.max(0.05, 1 - t);
    tempo *= Math.max(0.05, 1 - t);
  }
  const stepLength = 60 / tempo / 2;

  const [root, minor] = (p.minor >= 0.5 ? MINOR_CHORDS : MAJOR_CHORDS)[bar % 4];
  const third = minor ? 3 : 4;
  const offsets = { root: 0, third, fifth: 7, octave: 12 };

  if (resumeAtBar && inBar === 0) {
    bassOnly = false;
    resumeAtBar = false;
  }

  // Bass: root on beats 1 and 3, plus a pickup note at higher stages.
  if (inBar === 0 || inBar === 4 || (p.pickup >= 0.5 && inBar === 7)) {
    const note = BASS_ROOT + root + (inBar === 7 ? 7 : 0);
    tone('triangle', midiToHz(note) * pitch, time, stepLength * (inBar === 7 ? 0.9 : 1.8), 0.35, nodes.bass);
  }
  if (bassOnly) return stepLength;

  // Drums.
  if (inBar === 0 || inBar === 4) kick(time, p.kick);
  if (p.snare > 0.05 && (inBar === 2 || inBar === 6)) noiseHit(time, 0.12, 0.25 * p.snare, 'bandpass', 1800);
  if (p.hats > 0.05) noiseHit(time, 0.03, 0.08 * p.hats, 'highpass', 7000);
  if (p.noise >= 0.5 && Math.random() < 0.06) noiseHit(time, 0.15, 0.12, 'bandpass', 600 + Math.random() * 3000);

  // Pad (stages 0-1): a soft chord for the whole bar.
  if (p.pad > 0.05 && inBar === 0) {
    const filter = () => {
      const f = audio.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      return f;
    };
    for (const interval of [0, third, 7]) {
      tone('square', midiToHz(PAD_ROOT + root + interval) * pitch, time, stepLength * 8, 0.035 * p.pad, nodes.pad, { filter: filter() });
    }
  }

  // Lead: the arpeggio (with a wobble, stutters and the odd tritone at higher stages).
  let note = LEAD_ROOT + root + offsets[ARPEGGIO[inBar]];
  if (p.tritone > 0 && Math.random() < p.tritone) note = F_SHARP;
  const leadOptions = { wobbleCents: p.wobbleCents, wobbleHz: p.wobbleHz };
  if (stutterNext || Math.random() < p.stutter) {
    stutterNext = false;
    for (let k = 0; k < 3; k++) {
      tone('square', midiToHz(note) * pitch, time + (k * stepLength) / 4, stepLength / 4, 0.18, nodes.lead, leadOptions);
    }
  } else {
    tone('square', midiToHz(note) * pitch, time, stepLength * 0.9, 0.2, nodes.lead, leadOptions);
  }
  return stepLength;
}

function stopNow() {
  running = false;
  clearTimeout(timer);
  if (nodes) nodes.master.gain.setTargetAtTime(0, audio.currentTime, 0.05);
  return null;
}

function setMasterLevel() {
  if (!nodes) return;
  const on = running && enabled && !muted && !document.hidden;
  nodes.master.gain.setTargetAtTime(on ? MUSIC_VOLUME : 0, audio.currentTime, 0.1);
}

// --- Public API ---------------------------------------------------------------------------------
export function startMusic() {
  try {
    audio = getAudio();
    if (audio.state === 'suspended') audio.resume();
    nodes ||= buildMixer();
  } catch {
    return; // no Web Audio: the game works fine without music
  }
  if (running) return;
  running = true;
  rampage = null;
  tapeStop = null;
  distortAll = false;
  bassOnly = false;
  step = 0;
  fromParams = targetParams();
  crossfadeStart = audio.currentTime;
  nextStepTime = audio.currentTime + 0.1;
  setMasterLevel();
  scheduler();
}

export function stopMusic() {
  if (!running) return;
  stopNow();
}

export function setStage(newStage) {
  if (newStage === stage) return;
  markStageChange();
  stage = newStage;
}

export function setPatience(p) {
  patience = p;
}

export function setCalm(on) {
  if (on === calm) return;
  markStageChange();
  calm = on;
}

export function setMusicEnabled(on) {
  enabled = on;
  setMasterLevel();
}

export function setMusicMuted(on) {
  muted = on;
  setMasterLevel();
}

// Debug: force a stage (null = follow Otto's patience again).
export function setMusicStageOverride(value) {
  markStageChange();
  overrideStage = value;
}

// A short tune on the lead (jingles and stingers), on top of the music.
function jingle(notes, length = 0.14, detune = 0) {
  if (!running || !nodes) return;
  const t = audio.currentTime + 0.02;
  notes.forEach((note, n) => {
    const osc = audio.createOscillator();
    const env = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = midiToHz(note);
    osc.detune.value = detune * (n % 2 ? 1 : -1);
    env.gain.setValueAtTime(0.0001, t + n * length);
    env.gain.exponentialRampToValueAtTime(0.25, t + n * length + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + (n + 1) * length);
    osc.connect(env).connect(nodes.master);
    osc.start(t + n * length);
    osc.stop(t + (n + 1) * length + 0.05);
  });
}

// The music reacts to what happens in the game.
export function musicEvent(name) {
  if (!running || !nodes) return;
  const now = audio.currentTime;
  switch (name) {
    case 'ruleChange': {
      // A record scratch / tape-stop (pitch dives over 300 ms), then bass only.
      tone('sawtooth', 600, now, 0.3, 0.2, nodes.master, { glideTo: 60 });
      noiseHit(now, 0.25, 0.15, 'bandpass', 1200, nodes.master);
      bassOnly = true;
      resumeAtBar = false;
      break;
    }
    case 'ruleOk':
      resumeAtBar = true; // everything comes back on the next downbeat
      break;
    case 'cheat': {
      // Duck to 40% for 0.8 s, with one stutter.
      const level = enabled && !muted ? MUSIC_VOLUME : 0;
      nodes.master.gain.cancelScheduledValues(now);
      nodes.master.gain.setTargetAtTime(level * 0.4, now, 0.03);
      nodes.master.gain.setTargetAtTime(level, now + 0.8, 0.1);
      stutterNext = true;
      break;
    }
    case 'cheatCaught':
      jingle([67, 66, 65], 0.22, 30); // a cheeky "wah-wah-wah"
      break;
    case 'roundWonByPlayer':
      jingle([72, 76, 79, 84], 0.12); // a short happy major jingle
      break;
    case 'roundWonByOtto':
      jingle([79, 76, 79], 0.16);     // a smug little "nyah-nyah"
      break;
    case 'rampage':
      rampage = { start: now };       // speed up to 180 BPM and rise in pitch over ~4 s
      break;
    case 'shatter':
      distortAll = true;              // full distortion as the glass breaks
      break;
    case 'tapeStop':
      tapeStop = { start: now, length: 1.2 }; // a long tape-stop down to silence
      break;
    case 'ottoWinsMatch':
      // A smug, slightly out-of-tune fanfare, then calm stage-0 music.
      jingle([67, 72, 76, 79, 76, 79], 0.15, 35);
      rampage = null;
      setMusicStageOverride(0);
      break;
    default:
      break;
  }
}

// Pause the music while the tab is hidden; resume when it's visible again.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!running) return;
    if (document.hidden) {
      clearTimeout(timer);
    } else {
      nextStepTime = audio.currentTime + 0.05;
      clearTimeout(timer);
      scheduler();
    }
    setMasterLevel();
  });
}
