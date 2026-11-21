// ai.js
// How Otto chooses moves and rules. Otto has to follow the CURRENT rules too.
//
// Minimax (perfect play) only works on the classic 3x3 game — bigger boards have
// far too many possible games. Everywhere else Otto uses a simple heuristic:
//   1. win if it can
//   2. block the player if they're about to win
//   3. otherwise extend its own longest open line

import { cloneBoard, bestMove, allLines, isPlayable, pickRandom } from './board.js';
import {
  isClassic,
  legalSquares,
  placeMove,
  putMark,
  lineFor,
  winSettings,
  winDirections,
  isReverseDay,
  drawRules,
  activateRule,
  fadeOldMarks,
} from './rules.js';

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

// Otto's normal move: returns the square its mark lands on.
export function ottoMove(state) {
  // Perfect play on classic 3x3 (but not during a grace turn, see below).
  if (isClassic(state) && !state.ottoGrace) return bestMove(state.board, 'O');

  let moves = legalSquares(state);
  if (moves.length === 0) return undefined;

  // Grace turn: right after a rule change Otto is not allowed to win, so the
  // player always gets one move under the new rule first.
  if (state.ottoGrace) {
    const safe = moves.filter((i) => !makesLine(state, i, 'O'));
    if (safe.length > 0) moves = safe;
  }

  if (isReverseDay(state)) {
    // Making a line LOSES today: avoid it, and stay away from our own marks.
    const safe = moves.filter((i) => !makesLine(state, i, 'O'));
    const pool = safe.length > 0 ? safe : moves;
    return lowestBy(pool, (i) => squareScore(state, i, 'O'));
  }

  const win = moves.find((i) => makesLine(state, i, 'O'));
  if (win !== undefined) return win;

  const block = moves.find((i) => makesLine(state, i, 'X'));
  if (block !== undefined) return block;

  return highestBy(moves, (i) => squareScore(state, i, 'O'));
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

// Otto draws 3 random rules and keeps the one that helps it most.
// Returns { ruleId, rejected } or null if no rule can change.
export function ottoRewriteRules(state) {
  const drawn = drawRules(state, 3);
  if (drawn.length === 0) return null;
  const ruleId = highestBy(drawn, (id) => ruleValueForOtto(state, id));
  activateRule(state, ruleId);
  const change = { ruleId, rejected: drawn.filter((id) => id !== ruleId), by: 'otto' };
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
