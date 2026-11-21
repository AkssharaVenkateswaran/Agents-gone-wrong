// ai.js
// How Otto chooses moves and rules. Otto has to follow the CURRENT rules too.
//
// Otto plays a simple heuristic, on every board size and under every rule:
//   1. win if it can
//   2. block the player if they're about to win
//   3. otherwise extend its own longest open line
// ...but it makes mistakes! How often it gets each step right depends on its
// patience (see SKILL below): a calm Otto is sloppy, an angry Otto is sharp.

import { cloneBoard, allLines, isPlayable, pickRandom } from './board.js';
import {
  legalSquares,
  placeMove,
  putMark,
  lineFor,
  winSettings,
  winDirections,
  isReverseDay,
  availableRules,
  restorePrevious,
  activateRule,
  fadeOldMarks,
} from './rules.js';
import { ruleScore, weightOf, weightedSample } from './tactics.js';

const other = (mark) => (mark === 'X' ? 'O' : 'X');

// A copy of the game we can try moves on without touching the real board.
// (The rules are only read, so they can be shared.)
function trialCopy(state) {
  return { ...state, board: cloneBoard(state.board) };
}

// Would playing `landing` give `mark` a line under the current rules?
function makesLine(state, landing, mark) {
  const trial = trialCopy(state);
  placeMove(trial, landing, mark);
  return !!lineFor(trial, mark);
}

// Otto's skill at each patience level (patience = 100 - frustration).
//   takeWin: chance it notices and takes its own winning move
//   block:   chance it blocks the player's winning threat
//   best:    chance it plays its best square (otherwise a random square next to existing marks)
// scripts/balance-test.mjs simulates 1000s of games to tune these numbers.
// Tuned with scripts/balance-test.mjs so the test bot wins about 70% of rounds
// against Otto at patience 100-51, about 55% at 50-1, and ~80% of whole matches.
export const SKILL = [
  { minPatience: 76, takeWin: 0.08, block: 0.05, best: 0.06 },
  { minPatience: 51, takeWin: 0.1, block: 0.06, best: 0.08 },
  { minPatience: 26, takeWin: 0.16, block: 0.11, best: 0.13 },
  { minPatience: 0, takeWin: 0.18, block: 0.12, best: 0.14 },
];

export function skillFor(state) {
  const patience = 100 - state.frustration;
  return SKILL.find((level) => patience >= level.minPatience);
}

// Every square where `mark` could make a line right now.
export function winningSquares(state, mark) {
  return legalSquares(state).filter((i) => makesLine(state, i, mark));
}

// A square where `mark` could make a line right now, or -1.
export function findWinningSquare(state, mark) {
  return legalSquares(state).find((i) => makesLine(state, i, mark)) ?? -1;
}

// How good is square i for `mark`? Every possible line through it that the
// opponent hasn't blocked scores points — more if we already have marks in it.
// Squares where the opponent has a strong line score a bit too (blocking them).
function squareScore(state, i, mark) {
  const { length } = winSettings(state);
  const board = state.board;
  let score = 0;
  for (const line of allLines(board, length, winDirections(state))) {
    if (!line.includes(i)) continue;
    const mine = line.filter((j) => board.cells[j] === mark).length;
    const theirs = line.filter((j) => board.cells[j] === other(mark)).length;
    const blocked = line.some((j) => board.minions[j]);
    if (blocked) continue;
    if (theirs === 0) score += 1 + mine * mine * 3; // grows our open line
    if (mine === 0) score += theirs * theirs * 1.5; // gets in their way
  }
  return score + Math.random() * 0.5; // a little randomness breaks ties
}

// Is square i next to (touching) any mark already on the board?
function nextToAMark(board, i) {
  const r = Math.floor(i / board.cols);
  const c = i % board.cols;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < board.rows && cc >= 0 && cc < board.cols && board.cells[rr * board.cols + cc]) {
        return true;
      }
    }
  }
  return false;
}

// A random "reasonable" square: one next to existing marks (if there is one).
export function reasonableSquare(state, squares) {
  const near = squares.filter((i) => nextToAMark(state.board, i));
  return pickRandom(near.length > 0 ? near : squares);
}

// Otto's normal move: returns the square its mark lands on.
export function ottoMove(state) {
  const moves = legalSquares(state);
  if (moves.length === 0) return undefined;

  if (isReverseDay(state)) {
    // Making a line LOSES today: avoid it, and stay away from our own marks.
    const safe = moves.filter((i) => !makesLine(state, i, 'O'));
    const pool = safe.length > 0 ? safe : moves;
    return lowestBy(pool, (i) => squareScore(state, i, 'O'));
  }

  const skill = skillFor(state);
  // Otto may not win before the first rule change of the round, or on its grace turn right after one.
  const mayWin = state.roundRuleChanges > 0 && !state.ottoGrace;

  // 1. Its own winning move (if it notices it).
  const wins = moves.filter((i) => makesLine(state, i, 'O'));
  if (wins.length > 0 && mayWin && Math.random() < skill.takeWin) return pickRandom(wins);
  let pool = moves.filter((i) => !wins.includes(i)); // missed (or not allowed to take) the win
  if (pool.length === 0) pool = moves;

  // 2. Block the player's winning threat (if it notices it).
  const threats = pool.filter((i) => makesLine(state, i, 'X'));
  if (threats.length > 0) {
    if (Math.random() < skill.block) return pickRandom(threats);
    const elsewhere = pool.filter((i) => !threats.includes(i));
    if (elsewhere.length > 0) pool = elsewhere; // it didn't see the threat
  }

  // 3. Its best square, or a random square next to existing marks.
  if (Math.random() < skill.best) return bestSquare(state, pool);
  return reasonableSquare(state, pool);
}

// Otto's best square: of its most promising squares, the one that leaves the
// player the fewest chances to set up TWO winning threats at once (a "fork",
// which can't be blocked). Ties go to the square that builds Otto's own lines.
const CANDIDATES = 8;   // look closely at Otto's 8 most promising squares...
const REPLIES = 24;     // ...against up to 24 likely replies from the player

function bestSquare(state, pool) {
  const scored = pool.map((i) => ({ i, score: squareScore(state, i, 'O') }));
  scored.sort((a, b) => b.score - a.score);
  let best = null;
  for (const { i, score } of scored.slice(0, CANDIDATES)) {
    const afterOtto = trialCopy(state);
    placeMove(afterOtto, i, 'O');
    // Danger 1: squares where the player could win straight away.
    let danger = winningSquares(afterOtto, 'X').length * 100;
    // Danger 2: replies that would give the player two threats at once.
    const replies = legalSquares(afterOtto).filter((r) => nextToAMark(afterOtto.board, r)).slice(0, REPLIES);
    for (const r of replies) {
      const afterPlayer = trialCopy(afterOtto);
      placeMove(afterPlayer, r, 'X');
      if (winningSquares(afterPlayer, 'X').length >= 2) danger += 10;
    }
    if (!best || danger < best.danger || (danger === best.danger && score > best.score)) {
      best = { i, danger, score };
    }
  }
  return best.i;
}

// The best square for Otto among `squares`, ignoring placement rules
// (used by cheats like Extra Line and Mark Steal, which don't play fair anyway).
export function bestSquareAmong(state, squares) {
  const free = squares.filter((i) => isPlayable(state.board, i));
  if (free.length === 0) return undefined;
  const win = free.find((i) => {
    const trial = trialCopy(state);
    putMark(trial, i, 'O');
    return !!lineFor(trial, 'O');
  });
  if (win !== undefined) return win;
  return highestBy(free, (i) => squareScore(state, i, 'O'));
}

// --- Picking a new rule --------------------------------------------------------------------

// How strong is `mark`'s position? Adds up all its open lines (more marks = much more).
function position(state, mark) {
  const { length } = winSettings(state);
  const board = state.board;
  let total = 0;
  for (const line of allLines(board, length, winDirections(state))) {
    const mine = line.filter((j) => board.cells[j] === mark).length;
    const blocked = line.some((j) => board.cells[j] === other(mark) || board.minions[j]);
    if (!blocked) total += mine * mine;
  }
  return total;
}

// Score a rule from Otto's point of view: try it on a copy of the game and see
// whether Otto's position improves compared to the player's.
function ruleValueForOtto(state, ruleId) {
  const trial = trialCopy(state);
  trial.rules = { ...state.rules };
  trial.ruleHistory = [];
  trial.stats = { ...state.stats };
  activateRule(trial, ruleId);
  fadeOldMarks(trial);

  let value = position(trial, 'O') - position(trial, 'X');
  if (ruleId === 'reverse') value = -value;  // a strong position is BAD on reverse day
  if (ruleId === 'timer') value += 4;        // the timer only rushes the player
  return value + Math.random() * 2;          // a dash of chaos
}

// --- Rule changes must never cause an instant win or loss ---------------------------------
// A copy of the game whose rules we can change without touching the real one.
function ruleTrial(state) {
  return {
    ...state,
    board: cloneBoard(state.board),
    rules: { ...state.rules },
    ruleHistory: [...state.ruleHistory],
    stats: { ...state.stats },
  };
}

// Could either player win (make a line) with their very next move?
function someoneWinsInOne(state) {
  return findWinningSquare(state, 'X') !== -1 || findWinningSquare(state, 'O') !== -1;
}

// Is it safe to switch this rule on right now? (Tried on a copy first.)
export function ruleIsSafe(state, ruleId) {
  const trial = ruleTrial(state);
  activateRule(trial, ruleId);
  return !someoneWinsInOne(trial);
}

// All the rules that could be switched on right now without an instant win/loss.
export function safeRuleIds(state) {
  return availableRules(state).map((rule) => rule.id).filter((id) => ruleIsSafe(state, id));
}

// Is it safe for the current twist (Reverse day) to run out right now?
export function expiryIsSafe(state) {
  const trial = ruleTrial(state);
  restorePrevious(trial, 'twist', 'expired');
  return !someoneWinsInOne(trial);
}

// Up to `count` different random rules from `ids`.
export function pickSome(ids, count) {
  const pool = ids.slice();
  const picked = [];
  while (picked.length < count && pool.length > 0) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picked;
}

// Otto draws 3 random SAFE rules and keeps the one that helps it most.
// Returns { ruleId, rejected } or null if no rule can safely change (then the change is postponed).
// (The 3 are drawn weighted by how often Otto wins with each rule across everyone's games.)
export function ottoRewriteRules(state) {
  const drawn = weightedSample(safeRuleIds(state), 3, (id) => weightOf(ruleScore(state.tactics, id)));
  if (drawn.length === 0) return null;
  const ruleId = highestBy(drawn, (id) => ruleValueForOtto(state, id));
  activateRule(state, ruleId);
  const dataDriven = ruleScore(state.tactics, ruleId) !== null;
  const change = { ruleId, rejected: drawn.filter((id) => id !== ruleId), by: 'otto', dataDriven };
  state.lastRuleChange = change;
  return change;
}

function highestBy(list, scoreOf) {
  let best = [];
  let bestScore = -Infinity;
  for (const item of list) {
    const score = scoreOf(item);
    if (score > bestScore) {
      bestScore = score;
      best = [item];
    } else if (score === bestScore) {
      best.push(item);
    }
  }
  return pickRandom(best);
}

function lowestBy(list, scoreOf) {
  return highestBy(list, (item) => -scoreOf(item));
}
