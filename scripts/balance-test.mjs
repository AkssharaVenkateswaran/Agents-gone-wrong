// scripts/balance-test.mjs
// Plays lots of rounds and matches between Otto and a simple player bot.
//
//   npm run balance            (1000 rounds per patience band + 1000 full matches)
//   node scripts/balance-test.mjs 300
//
// The round flow below mirrors main.js (without the animations and pauses), and
// every decision uses the real game code: rules (only safe rule changes), Otto's
// moves, cheats, power-ups and the patience numbers.
// The player bot:
//   - wins if it can, otherwise blocks Otto if it can,
//   - otherwise picks a random square next to existing marks,
//   - uses a power-up whenever it counters a cheat that is active right now.
//   (It never clicks Otto to catch a cheat, so real players have it a bit easier.)

import { freshMatchState, freshRoundState, ROUND_TURN_CAP, OTTO_ROUNDS_TO_WIN } from '../src/state.js';
import { emptyCells, addRow, addColumn, linesOf, LINE_LENGTH } from '../src/board.js';
import {
  pickCheat,
  commitCheat,
  tickCooldowns,
  setPatience,
  PATIENCE_LOST_ROUND,
  PATIENCE_WON_ROUND,
} from '../src/agent.js';
import { ottoMove, ottoRewriteRules, winningSquares, reasonableSquare, expiryIsSafe, SKILL } from '../src/ai.js';
import { getPowerUp, canAfford } from '../src/powerups.js';
import { POINTS } from '../src/scoring.js';
import {
  MAX_BOARD,
  RULE_EVERY,
  currentTurn,
  legalSquares,
  placeMove,
  lineFor,
  isReverseDay,
  expireRules,
  fadeOldMarks,
} from '../src/rules.js';

const COUNT = Number(process.argv[2]) || 1000;
// Optional, for tuning: SKILL_JSON='[[takeWin, block, best], ...]' (one per band) overrides ai.js.
if (process.env.SKILL_JSON) {
  JSON.parse(process.env.SKILL_JSON).forEach(([takeWin, block, best], n) => Object.assign(SKILL[n], { takeWin, block, best }));
}

// Repeatable randomness: replace Math.random with a seeded generator.
let seed = 2026;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const other = (mark) => (mark === 'X' ? 'O' : 'X');

// --- The end of a round (same as checkRoundEnd / suddenDeath in main.js) -------------------
function suddenDeath(s) {
  const x = linesOf(s.board, 'X', LINE_LENGTH).length;
  const o = linesOf(s.board, 'O', LINE_LENGTH).length;
  return x > o ? 'X' : o > x ? 'O' : 'draw';
}

function checkEnd(s, mover) {
  const lines = { X: lineFor(s, 'X'), O: lineFor(s, 'O') };
  if (lines.X || lines.O) {
    const maker = mover && lines[mover] ? mover : lines.X ? 'X' : 'O';
    return isReverseDay(s) ? other(maker) : maker;
  }
  if (emptyCells(s.board).length === 0) {
    if (s.board.rows >= MAX_BOARD && s.board.cols >= MAX_BOARD) return suddenDeath(s);
    if (s.board.cols >= MAX_BOARD || (s.board.rows <= s.board.cols && s.board.rows < MAX_BOARD)) addRow(s.board);
    else addColumn(s.board);
  }
  return null;
}

// --- The player bot ------------------------------------------------------------------------
function use(s, id, choice) {
  const powerUp = getPowerUp(id);
  if (!canAfford(s, powerUp) || !powerUp.canUse(s)) return false;
  s.points -= powerUp.cost;
  powerUp.apply(s, choice);
  return true;
}

// Counter every cheat that is active right now (if the bot can afford it).
function counterCheats(s) {
  if (s.lightsOut) use(s, 'lightSwitch');
  if (s.addedLines.some((line) => line.owner === 'O')) use(s, 'eraser');
  if (s.board.stolen.some(Boolean)) use(s, 'glueStick');
  if (s.spinsToUndo > 0) use(s, 'paperweight');
  if (s.cheatLandedAt.doubleMove === s.turnNumber) use(s, 'timeOut');
  if (s.cheatLandedAt.rewriteRules === s.turnNumber) use(s, 'veto');
  s.board.minions.forEach((minion, i) => minion && use(s, 'flick', i));
}

function botMove(s) {
  const legal = legalSquares(s);
  if (legal.length === 0) return undefined;
  const myWins = winningSquares(s, 'X');
  if (isReverseDay(s)) {
    const safe = legal.filter((i) => !myWins.includes(i));
    return reasonableSquare(s, safe.length > 0 ? safe : legal);
  }
  if (myWins.length > 0) return myWins[0];
  const blocks = winningSquares(s, 'O');
  if (blocks.length > 0) return blocks[Math.floor(Math.random() * blocks.length)];
  return reasonableSquare(s, legal);
}

// --- One round on state `s`. Returns 'X' (player), 'O' (Otto) or 'draw'. ------------------
function playRound(s) {
  for (;;) {
    // Start of the player's turn: twists expire (only when safe), rules may change (only safe ones).
    const twist = s.rules.twist;
    if (twist.expiresAtTurn && currentTurn(s) >= twist.expiresAtTurn && !expiryIsSafe(s)) twist.expiresAtTurn++;
    expireRules(s);
    if (s.playerTurns >= s.nextRuleAt) {
      if (ottoRewriteRules(s)) s.nextRuleAt = s.playerTurns + RULE_EVERY;
      else s.nextRuleAt = s.playerTurns + 1; // postponed: NEW RULE DELAYED
      const end = checkEnd(s, null);
      if (end) return end;
    }

    // The player's turn.
    counterCheats(s);
    let end = checkEnd(s, 'X');
    if (end) return end;
    const landing = botMove(s);
    if (landing !== undefined) {
      if (!isReverseDay(s) && winningSquares(s, 'O').includes(landing)) s.points += POINTS.block;
      placeMove(s, landing, 'X');
      s.points += POINTS.placeX;
    }
    end = checkEnd(s, 'X');
    if (end) return end;
    s.playerTurns++;
    s.totalTurns++;
    if (s.lightsOut && --s.lightsOut.turnsLeft <= 0) s.lightsOut = null;
    fadeOldMarks(s);
    if (s.playerTurns >= ROUND_TURN_CAP) return suddenDeath(s);

    // Otto's turn.
    s.turnNumber++;
    tickCooldowns(s);
    if (s.spinBlockedTurns > 0) s.spinBlockedTurns--;
    if (s.ottoSkipsNextTurn) {
      s.ottoSkipsNextTurn = false;
      continue;
    }
    const picked = pickCheat(s);
    if (picked) {
      const { cheat, trial } = picked;
      s.lastCheatTry = s.turnNumber;
      commitCheat(s, trial);
      s.cooldowns[cheat.id] = cheat.cooldown;
      s.cheatLandedAt[cheat.id] = s.turnNumber;
      if (cheat.id === 'boardSpin') s.spinsToUndo++;
      s.stats.cheatsUsed++;
      end = checkEnd(s, 'O');
      if (end) return end;
      if (cheat.replacesMove) {
        s.ottoGrace = false;
        continue;
      }
    }
    const move = ottoMove(s);
    if (move !== undefined) placeMove(s, move, 'O');
    s.ottoGrace = false;
    end = checkEnd(s, 'O');
    if (end) return end;
  }
}

// A fresh round with Otto's patience fixed (for the per-band table).
function roundAtPatience(patience, roundNumber) {
  const s = { ...freshMatchState(), debug: {}, memory: {} };
  Object.assign(s, freshRoundState(roundNumber));
  setPatience(s, patience);
  return playRound(s);
}

// A whole match: rounds until patience hits 0 (player wins) or Otto wins 3 rounds.
function playMatch() {
  const s = { ...freshMatchState(), debug: {}, memory: {} };
  setPatience(s, 100);
  for (;;) {
    const result = playRound(s);
    if (result === 'X') {
      s.roundsWon.you++;
      setPatience(s, s.patience + PATIENCE_LOST_ROUND);
    } else if (result === 'O') {
      s.roundsWon.otto++;
      setPatience(s, s.patience + PATIENCE_WON_ROUND);
    }
    if (s.patience <= 0) return { winner: 'X', rounds: s.roundNumber };
    if (s.roundsWon.otto >= OTTO_ROUNDS_TO_WIN) return { winner: 'O', rounds: s.roundNumber };
    if (s.roundNumber >= 30) return { winner: 'draw', rounds: s.roundNumber }; // (safety net)
    Object.assign(s, freshRoundState(s.roundNumber + 1));
  }
}

// --- Report -------------------------------------------------------------------------------
const pct = (n, total) => `${((100 * n) / total).toFixed(1)}%`;
const started = Date.now();

console.log(`Balance test, seed 2026\n`);
console.log(`Round wins at each patience band (${COUNT} rounds each; 1 in 3 is round 1 on 4x4, the rest 5x5):\n`);
console.log('| Patience | Otto skill (win / block / best) | Player wins | Otto wins | Draws |');
console.log('|---|---|---|---|---|');
for (const band of [{ label: '100-76', patience: 88 }, { label: '75-51', patience: 63 }, { label: '50-26', patience: 38 }, { label: '25-1', patience: 12 }]) {
  const results = { X: 0, O: 0, draw: 0 };
  for (let n = 0; n < COUNT; n++) results[roundAtPatience(band.patience, n % 3 === 0 ? 1 : 2)]++;
  const skill = SKILL.find((level) => band.patience >= level.minPatience);
  console.log(`| ${band.label} | ${skill.takeWin} / ${skill.block} / ${skill.best} | ${pct(results.X, COUNT)} | ${pct(results.O, COUNT)} | ${pct(results.draw, COUNT)} |`);
}

const matches = { X: 0, O: 0, draw: 0 };
const roundsWhenPlayerWins = {};
let totalRounds = 0;
for (let n = 0; n < COUNT; n++) {
  const { winner, rounds } = playMatch();
  matches[winner]++;
  totalRounds += rounds;
  if (winner === 'X') roundsWhenPlayerWins[rounds] = (roundsWhenPlayerWins[rounds] || 0) + 1;
}
console.log(`\nFull matches (${COUNT}): player wins ${pct(matches.X, COUNT)}, Otto wins ${pct(matches.O, COUNT)}` +
  `${matches.draw ? `, unfinished ${pct(matches.draw, COUNT)}` : ''}; average ${(totalRounds / COUNT).toFixed(1)} rounds per match`);
console.log('When the player wins, the match took:');
for (const rounds of Object.keys(roundsWhenPlayerWins).sort((a, b) => a - b)) {
  console.log(`  ${rounds} rounds: ${pct(roundsWhenPlayerWins[rounds], matches.X)}`);
}
console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)}s)`);
