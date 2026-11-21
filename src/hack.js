// hack.js
// HACK.EXE: the player edits Otto's config file (otto.cfg). The new values really
// take effect, until Otto notices (after 2 of his turns, 1 below 50 patience, at once
// for a second hack in a round) and changes them back.
//
// SAFETY: the player's text is never run. parseConfig() only accepts lines of the form
//   otto.<setting> = <value>      (// comments allowed)
// for the settings below; numbers are clamped, booleans and moods are checked.
// No eval, no Function, and the editor only ever puts the text in a textarea /
// textContent (see ui/hackEditor.js).

import { skillFor } from './ai.js';
import { cheatChance, changePatience } from './agent.js';
import { baseMood } from './emotions.js';

export const HACK_PATIENCE = -8;   // Otto loses this much patience when he detects a hack
export const DETECT_TURNS = 2;     // Otto notices after 2 of his turns...
export const DETECT_TURNS_ANGRY = 1; // ...1 below 50 patience...
export const MOODS = ['smug', 'bored', 'happy', 'defeated'];

// The settings, their type, range and the hint comment shown in the file.
export const HACK_SETTINGS = {
  cheatChance: { type: 'number', min: 0, max: 1, decimals: 2, hint: '0 to 1' },
  blockChance: { type: 'number', min: 0, max: 1, decimals: 2, hint: '0 to 1' },
  takeWinChance: { type: 'number', min: 0, max: 1, decimals: 2, hint: '0 to 1' },
  thinkTime: { type: 'number', min: 0.5, max: 4, decimals: 1, hint: 'seconds, 0.5 to 4' },
  rulesLocked: { type: 'boolean', hint: "true = Otto can't change rules" },
  mood: { type: 'mood', hint: MOODS.join(' | ') },
  taunts: { type: 'boolean', hint: 'false = Otto stays quiet' },
};

const HEADER = "// otto.cfg — Otto's behaviour. Edit at your own risk.";
const OTTO_COMMENTS = ['// DO NOT TOUCH. — Otto', '// I SAID DO NOT TOUCH.', '// every edit is logged, human.'];

// Otto's real current values (without any hack).
export function realValues(state) {
  const hacked = state.hack;
  state.hack = null; // read the real numbers, not the hacked ones
  const skill = skillFor(state);
  const values = {
    cheatChance: round(cheatChance(state), 2),
    blockChance: skill.block,
    takeWinChance: skill.takeWin,
    thinkTime: 1.5,
    rulesLocked: false,
    mood: baseMood(state),
    taunts: true,
  };
  state.hack = hacked;
  return values;
}

// The values Otto currently runs with (hacked ones on top of the real ones).
export function currentValues(state) {
  return { ...realValues(state), ...(state.hack?.overrides || {}) };
}

const round = (n, decimals) => Math.round(n * 10 ** decimals) / 10 ** decimals;

export function formatValue(key, value) {
  const setting = HACK_SETTINGS[key];
  if (setting.type === 'number') return value.toFixed(setting.decimals);
  if (setting.type === 'mood') return `"${value}"`;
  return String(value);
}

export function settingLine(key, value) {
  return `${`otto.${key}`.padEnd(19)}= ${formatValue(key, value).padEnd(7)}// ${HACK_SETTINGS[key].hint}`;
}

// The file as a list of lines: Otto's angry comments, the header, one line per setting.
export function configLines(values, comments = []) {
  return [...comments, HEADER, ...Object.keys(HACK_SETTINGS).map((key) => settingLine(key, values[key]))];
}

// --- Parsing (the only thing that ever happens to the player's text) -----------------------
// Returns { values, changed: [keys], errors: [strings] }. If there are errors, nothing runs.
export function parseConfig(text, original) {
  const values = { ...original };
  const errors = [];
  const lines = String(text).split('\n').slice(0, 60);
  lines.forEach((raw, n) => {
    const where = `line ${n + 1}`;
    const code = raw.split('//')[0].trim();
    if (code === '') return; // blank or comment
    const match = /^otto\.([A-Za-z]+)\s*=\s*(\S+)$/.exec(code);
    if (!match) {
      const name = /^otto\.([A-Za-z]+)/.exec(code);
      errors.push(name && !Object.hasOwn(HACK_SETTINGS, name[1])
        ? `${where}: otto doesn't know "${name[1].slice(0, 20)}"`
        : `${where}: use otto.<setting> = <value>`);
      return;
    }
    const [, key, valueText] = match;
    const setting = Object.hasOwn(HACK_SETTINGS, key) ? HACK_SETTINGS[key] : null; // (not "constructor"...)
    if (!setting) {
      errors.push(`${where}: otto doesn't know "${key.slice(0, 20)}"`);
      return;
    }
    if (setting.type === 'number') {
      if (!/^-?(\d+\.?\d*|\.\d+)$/.test(valueText)) {
        errors.push(`${where}: ${key} needs a number`);
        return;
      }
      values[key] = round(Math.min(setting.max, Math.max(setting.min, Number(valueText))), setting.decimals);
    } else if (setting.type === 'boolean') {
      if (valueText !== 'true' && valueText !== 'false') {
        errors.push(`${where}: ${key} must be true or false`);
        return;
      }
      values[key] = valueText === 'true';
    } else {
      const mood = /^"?([a-z]+)"?$/.exec(valueText)?.[1];
      if (!mood || (!MOODS.includes(mood) && mood !== original.mood)) {
        errors.push(`${where}: mood must be ${MOODS.join(' | ')}`);
        return;
      }
      values[key] = mood;
    }
  });
  const changed = errors.length ? [] : Object.keys(HACK_SETTINGS).filter((key) => values[key] !== original[key]);
  return { values, changed, errors };
}

// --- The hack's life: run -> active for a few Otto turns -> detected -> restored ----------
// Start a hack with already-parsed values. Returns the hack.
export function startHack(state, values, changed, original) {
  state.roundHacks = (state.roundHacks || 0) + 1;
  const turns = state.roundHacks >= 2 ? 0 : state.patience < 50 ? DETECT_TURNS_ANGRY : DETECT_TURNS;
  const overrides = {};
  for (const key of changed) overrides[key] = values[key];
  state.hack = { overrides, original, changed: [...changed], turnsLeft: turns };
  return state.hack;
}

// At the start of each Otto turn. Returns true when Otto detects the hack now.
export function tickHack(state) {
  if (!state.hack) return false;
  if (state.hack.turnsLeft <= 0) return true;
  state.hack.turnsLeft--;
  return false;
}

// Otto noticed: he loses patience (never below 5 before the end of round 3), he will
// retaliate with a cheat, and a second hack in a round locks the editor.
// Returns { clamped } (true if the "NOT. YET." rule kicked in).
export function detectHack(state) {
  const clamped = changePatience(state, HACK_PATIENCE);
  state.hackRetaliate = true;
  if (state.roundHacks >= 2) state.hackLocked = true;
  return { clamped };
}

// Otto put his values back: the hack is over, and he leaves a comment in the file.
export function restoreHack(state) {
  state.hack = null;
  const next = OTTO_COMMENTS[Math.min(state.hackComments.length, OTTO_COMMENTS.length - 1)];
  if (!state.hackComments.includes(next)) state.hackComments = [next, ...state.hackComments];
}
