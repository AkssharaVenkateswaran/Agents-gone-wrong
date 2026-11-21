// scripts/balance-test.mjs
// Plays lots of matches between Otto and a simple player bot, and reports how
// often the player wins at each of Otto's patience levels.
//
//   npm run balance            (1000 matches per patience band)
//   node scripts/balance-test.mjs 300
//
// The match flow below mirrors main.js (without the animations and pauses), and
// every decision uses the real game code: rules, Otto's moves, cheats, power-ups.
// Patience is held fixed for each band so we can see Otto's skill at that level.
// The player bot:
//   - wins if it can, otherwise blocks Otto if it can,
//   - otherwise picks a random square next to existing marks,
//   - uses a power-up whenever it counters a cheat that is active right now.
//   (It never clicks Otto to catch a cheat, so real players have it a bit easier.)

import { freshMatchState, MAX_TURNS, FOUR_IN_A_ROW_MATCHES } from '../src/state.js';
import { emptyCells, addRow, addColumn, linesOf, LINE_LENGTH } from '../src/board.js';
import { pickCheat, commitCheat, tickCooldowns } from '../src/agent.js';
import { ottoMove, ottoRewriteRules, winningSquares, reasonableSquare, SKILL } from '../src/ai.js';
import { getPowerUp, canAfford } from '../src/powerups.js';
import { POINTS } from '../src/scoring.js';
import {
  MAX_BOARD,
  RULE_EVERY,
  legalSquares,
  placeMove,
  lineFor,
  isReverseDay,
  expireRules,
  fadeOldMarks,
} from '../src/rules.js';

const ROUNDS = Number(process.argv[2]) || 1000;
// Optional, for tuning: SKILL_JSON='[[takeWin, block, best], ...]' (one per band) overrides ai.js.
if (process.env.SKILL_JSON) {
  JSON.parse(process.env.SKILL_JSON).forEach(([takeWin, block, best], n) => Object.assign(SKILL[n], { takeWin, block, best }));
}

// Repeatable randomness: replace Math.random with a seeded generator.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = seeded(2026);

const other = (mark) => (mark === 'X' ? 'O' : 'X');

// --- The end of a match (same as checkMatchEnd / finalRule in main.js) ---------------------
function finalRule(s) {
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
  if (s.board.rows >= MAX_BOARD && s.board.cols >= MAX_BOARD) return finalRule(s);
  if (emptyCells(s.board).length === 0) {
    if (s.board.rows <= s.board.cols) addRow(s.board);
    else addColumn(s.board);
    if (s.board.rows >= MAX_BOARD && s.board.cols >= MAX_BOARD) return finalRule(s);
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

// --- One whole match. Returns 'X' (player), 'O' (Otto) or 'draw'. -------------------------
function playMatch(frustration, matchNumber) {
  const s = { ...freshMatchState(matchNumber), frustration, debug: {}, memory: {}, session: {} };
  for (;;) {
    // Start of the player's turn: twists expire, rules may change.
    expireRules(s);
    if (s.playerTurns >= s.nextRuleAt) {
      s.nextRuleAt = s.playerTurns + RULE_EVERY;
      ottoRewriteRules(s);
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
    if (s.lightsOut && --s.lightsOut.turnsLeft <= 0) s.lightsOut = null;
    fadeOldMarks(s);
    if (s.playerTurns >= MAX_TURNS) return finalRule(s);

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

// --- Run every patience band ------------------------------------------------------------------
const BANDS = [
  { label: '100-76', patience: 88 },
  { label: '75-51', patience: 63 },
  { label: '50-26', patience: 38 },
  { label: '25-0', patience: 12 },
];

// Matches cycle through match numbers 1, 2, 3: two start with 4 in a row on 5x5,
// one with classic 3 in a row on 3x3 (like a player's first three matches).
const pct = (n, total = ROUNDS) => `${((100 * n) / total).toFixed(1)}%`;
console.log(`Balance test: ${ROUNDS} matches per patience band, seed 2026\n`);
console.log('| Patience | Otto skill (win / block / best) | Player wins | Otto wins | Draws | Player wins: 5x5 start | 3x3 start |');
console.log('|---|---|---|---|---|---|---|');
const started = Date.now();
for (const band of BANDS) {
  const results = { X: 0, O: 0, draw: 0 };
  const bySetup = { big: { X: 0, n: 0 }, classic: { X: 0, n: 0 } };
  for (let n = 0; n < ROUNDS; n++) {
    const matchNumber = (n % 3) + 1;
    const result = playMatch(100 - band.patience, matchNumber);
    results[result]++;
    const setup = matchNumber <= FOUR_IN_A_ROW_MATCHES ? bySetup.big : bySetup.classic;
    setup.n++;
    if (result === 'X') setup.X++;
  }
  const skill = SKILL.find((level) => band.patience >= level.minPatience);
  console.log(
    `| ${band.label} | ${skill.takeWin} / ${skill.block} / ${skill.best} | ${pct(results.X)} | ${pct(results.O)} | ${pct(results.draw)} | ` +
      `${pct(bySetup.big.X, bySetup.big.n)} | ${pct(bySetup.classic.X, bySetup.classic.n)} |`
  );
}
console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)}s)`);
