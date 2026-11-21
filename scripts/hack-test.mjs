// scripts/hack-test.mjs
// Quick checks for HACK.EXE (npm run hack):
//   - invalid input is rejected and never runs (and the hack code has no eval/Function),
//   - a hack really changes Otto's numbers,
//   - Otto detects it after the right number of his turns and restores it,
//   - detection costs 8 patience (never below 5 before round 3 ends), triggers one
//     retaliation cheat that ignores cooldowns, and a 2nd hack is caught at once + locks.

import { readFileSync } from 'node:fs';
import { freshMatchState } from '../src/state.js';
import { setPatience, pickCheat, cheatChance } from '../src/agent.js';
import { skillFor } from '../src/ai.js';
import { CHEATS } from '../src/cheats.js';
import { realValues, configLines, parseConfig, startHack, tickHack, detectHack, restoreHack } from '../src/hack.js';

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
}

function newState(patience = 100, roundNumber = 1) {
  const s = { ...freshMatchState(), debug: {}, memory: {}, tactics: null };
  s.roundNumber = roundNumber;
  setPatience(s, patience);
  return s;
}

// Otto turns until he notices (or 10).
function turnsUntilDetected(s) {
  for (let turn = 1; turn <= 10; turn++) if (tickHack(s)) return turn;
  return Infinity;
}

// --- 1. Invalid input never runs ---------------------------------------------------------------
{
  const s = newState();
  const original = realValues(s);
  const file = configLines(original).join('\n');
  check('the unchanged file parses with no errors and no changes', (() => {
    const r = parseConfig(file, original);
    return r.errors.length === 0 && r.changed.length === 0;
  })());
  const bad = [
    ['otto.fly = 1', 'otto doesn\'t know "fly"'],
    ['alert(1)', 'use otto.<setting> = <value>'],
    ['otto.cheatChance = alert(1)', 'needs a number'],
    ['otto.cheatChance = 0.1; fetch("x")', 'use otto.<setting> = <value>'],
    ['otto.taunts = yes', 'true or false'],
    ['otto.mood = "<img src=x onerror=alert(1)>"', 'use otto.<setting> = <value>'],
    ['otto.mood = "angry"', 'mood must be'],
    ['otto.constructor = 1', 'otto doesn\'t know "constructor"'],
    ['window.otto = 1', 'use otto.<setting> = <value>'],
  ];
  for (const [line, expected] of bad) {
    const r = parseConfig(`${file}\n${line}`, original);
    check(`rejects  ${line}`, r.errors.length > 0 && r.errors[0].includes(expected) && r.changed.length === 0);
  }
  // Numbers are clamped.
  const clamped = parseConfig(file.replace(/otto\.thinkTime\s*= [0-9.]+/, 'otto.thinkTime = 99').replace(/otto\.cheatChance\s*= [0-9.]+/, 'otto.cheatChance = -3'), original);
  check('numbers are clamped (thinkTime 99 -> 4, cheatChance -3 -> 0)', clamped.values.thinkTime === 4 && clamped.values.cheatChance === 0);
  // No code execution anywhere in the hack code.
  for (const path of ['src/hack.js', 'src/ui/hackEditor.js']) {
    const code = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    check(`${path} has no eval / Function / player text in innerHTML`, !/\beval\s*\(|\bFunction\s*\(|innerHTML\s*=\s*[^`]*(value|text)/.test(code));
  }
}

// --- 2. A hack changes Otto's real numbers -----------------------------------------------------
{
  const s = newState();
  const original = realValues(s);
  const text = configLines(original).join('\n')
    .replace(/otto\.cheatChance\s*= [0-9.]+/, 'otto.cheatChance = 0')
    .replace(/otto\.blockChance\s*= [0-9.]+/, 'otto.blockChance = 1');
  const { values, changed, errors } = parseConfig(text, original);
  check('a valid edit parses', errors.length === 0 && changed.join() === 'cheatChance,blockChance');
  startHack(s, values, changed, original);
  check('cheatChance and blockChance really change', cheatChance(s) === 0 && skillFor(s).block === 1);
  restoreHack(s);
  check('after the restore they are back', cheatChance(s) === original.cheatChance && skillFor(s).block === original.blockChance);
  check('Otto leaves a comment at the top of the file', configLines(realValues(s), s.hackComments)[0].includes('DO NOT TOUCH'));
}

// --- 3. Detection timing, patience, retaliation, lock ---------------------------------------
{
  const s = newState(100);
  const original = realValues(s);
  startHack(s, { ...original, cheatChance: 0 }, ['cheatChance'], original);
  check('patience 100: active for 2 Otto turns, detected on the 3rd', turnsUntilDetected(s) === 3);
  detectHack(s);
  check('detection costs 8 patience', s.patience === 92);
  restoreHack(s);

  const angry = newState(40);
  startHack(angry, { ...original, cheatChance: 0 }, ['cheatChance'], original);
  check('patience 40: active for 1 Otto turn, detected on the 2nd', turnsUntilDetected(angry) === 2);

  // Second hack in the same round: detected at once, editor locked.
  startHack(s, { ...original, taunts: false }, ['taunts'], original);
  check('2nd hack in a round: detected on the very next Otto turn', turnsUntilDetected(s) === 1);
  detectHack(s);
  check('2nd hack locks the editor for the round', s.hackLocked === true);
  restoreHack(s);

  // Never below 5 before the end of round 3.
  const low = newState(6, 2);
  startHack(low, { ...original, cheatChance: 0 }, ['cheatChance'], original);
  const { clamped } = detectHack(low);
  check('patience 6 in round 2: clamped at 5 ("NOT. YET.")', clamped && low.patience === 5);

  // Retaliation: one cheat even with every cooldown running and before any rule change.
  const r = newState(100);
  r.board.cells = ['X', 'O', null, null, null, 'X', null, null, null, null, null, null, null, null, null, null];
  for (const cheat of CHEATS) r.cooldowns[cheat.id] = 9;
  r.hackRetaliate = true;
  const picked = pickCheat(r);
  check('retaliation cheat ignores cooldowns and timing', !!picked && picked.retaliation === true);
  check('retaliation is used up after one cheat', r.hackRetaliate === false && pickCheat(r) === null);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll HACK.EXE checks passed.');
process.exit(failures ? 1 : 0);
