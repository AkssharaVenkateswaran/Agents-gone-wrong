// scripts/fairness-test.mjs
// Hard rule: a rule change must NEVER cause an instant win or loss.
//
//   npm run fairness
//
// Builds 500 random mid-game boards (random size, random marks, random rules
// already in play), then changes a rule exactly like the game does (ai.js:
// ottoRewriteRules picks only from safeRuleIds). After every change, neither
// player may be able to win with their very next move. If no rule is safe the
// game postpones the change instead — that counts as a pass too.
// It also checks Reverse day running out and the Amendment cards.

import { freshMatchState } from '../src/state.js';
import { addRow, addColumn, pickRandom } from '../src/board.js';
import {
  activateRule,
  availableRules,
  legalSquares,
  placeMove,
  lineFor,
  isReverseDay,
  restorePrevious,
} from '../src/rules.js';
import { ottoRewriteRules, findWinningSquare, safeRuleIds, expiryIsSafe, pickSome } from '../src/ai.js';

const CHANGES = Number(process.argv[2]) || 500;

// Repeatable randomness.
let seed = 77;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const someoneWinsInOne = (s) => findWinningSquare(s, 'X') !== -1 || findWinningSquare(s, 'O') !== -1;

// A random mid-game position: random board size, a few random rules, random marks
// (stopping before anyone has actually won).
function randomMidGame() {
  const s = { ...freshMatchState(), debug: {} };
  const size = 4 + Math.floor(Math.random() * 3); // 4x4 .. 6x6
  while (s.board.rows < size) addRow(s.board);
  while (s.board.cols < size) addColumn(s.board);
  for (let k = Math.floor(Math.random() * 3); k > 0; k--) {
    const options = availableRules(s);
    if (options.length) activateRule(s, pickRandom(options).id);
  }
  const marks = 4 + Math.floor(Math.random() * Math.min(14, s.board.cells.length - 6));
  for (let n = 0; n < marks; n++) {
    const legal = legalSquares(s);
    if (!legal.length) break;
    const mark = n % 2 ? 'O' : 'X';
    const square = pickRandom(legal);
    const trial = { ...s, board: { ...s.board, cells: s.board.cells.slice(), stamp: s.board.stamp.slice(), age: s.board.age.slice() } };
    placeMove(trial, square, mark);
    if (lineFor(trial, 'X') || lineFor(trial, 'O')) continue; // keep the game unfinished
    placeMove(s, square, mark);
  }
  return s;
}

let changed = 0;
let postponed = 0;
let failures = 0;
for (let n = 0; n < CHANGES; n++) {
  const s = randomMidGame();
  const change = ottoRewriteRules(s); // null = no safe rule, so the game postpones
  if (!change) {
    postponed++;
    continue;
  }
  changed++;
  if (someoneWinsInOne(s)) {
    failures++;
    console.log(`FAIL #${n}: after "${change.ruleId}" someone can win in one move`);
  }
}

// Amendment cards are drawn from the same safe list.
let cardFailures = 0;
for (let n = 0; n < 200; n++) {
  const s = randomMidGame();
  for (const id of pickSome(safeRuleIds(s), 3)) {
    const trial = { ...s, board: structuredClone(s.board), rules: { ...s.rules }, ruleHistory: [...s.ruleHistory], stats: { ...s.stats } };
    activateRule(trial, id);
    if (someoneWinsInOne(trial)) cardFailures++;
  }
}

// Reverse day running out: it only ends when that's safe (otherwise it waits a turn).
let expiryChecks = 0;
let expiryFailures = 0;
for (let n = 0; n < 300; n++) {
  const s = randomMidGame();
  if (s.rules.twist.ruleId !== 'reverse' && availableRules(s).some((r) => r.id === 'reverse')) activateRule(s, 'reverse');
  if (!isReverseDay(s) || !expiryIsSafe(s)) continue;
  expiryChecks++;
  restorePrevious(s, 'twist', 'expired');
  if (someoneWinsInOne(s)) expiryFailures++;
}

console.log(`Fairness test: ${CHANGES} random rule changes on random mid-game boards`);
console.log(`  rule changed:       ${changed}`);
console.log(`  postponed (no safe rule, "NEW RULE DELAYED"): ${postponed}`);
console.log(`  instant wins after a change: ${failures}`);
console.log(`  Amendment cards that would allow an instant win: ${cardFailures}`);
console.log(`  Reverse day endings checked: ${expiryChecks}, instant wins after them: ${expiryFailures}`);
const passed = failures === 0 && cardFailures === 0 && expiryFailures === 0;
console.log(passed ? 'PASS' : 'FAIL');
process.exit(passed ? 0 : 1);
