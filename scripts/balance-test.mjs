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
//   - if it has no win and no block to make, it uses a power-up that counters a
//     cheat active right now (at most one; a power-up USES THE TURN, like in the game).
//   (It never clicks Otto to catch a cheat, so real players have it a bit easier.)

import { freshMatchState, freshRoundState, ROUND_TURN_CAP, OTTO_ROUNDS_TO_WIN } from '../src/state.js';
import { emptyCells, addRow, addColumn, linesOf, LINE_LENGTH } from '../src/board.js';
import {
  pickCheat,
  commitCheat,
  tickCooldowns,
  setPatience,
  changePatience,
  PATIENCE_LOST_ROUND,
  PATIENCE_WON_ROUND,
  PATIENCE_DRAW,
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

const COUNT = Number(process.argv.find((arg) => /^\d+$/.test(arg))) || 1000;
// --tactics: Otto also uses typical crowd data from Snowflake (GET /api/tactics) to
// weight its cheat and rule choices, like in the real game.
const WITH_TACTICS = process.argv.includes('--tactics');
const TYPICAL_TACTICS = {
  cheats: {
    lightsOut: { attempts: 40, landRate: 82, ottoWinRate: 45 },
    extraLine: { attempts: 30, landRate: 70, ottoWinRate: 40 },
    minionDrop: { attempts: 35, landRate: 75, ottoWinRate: 50 },
    markSteal: { attempts: 25, landRate: 60, ottoWinRate: 55 },
    doubleMove: { attempts: 20, landRate: 65, ottoWinRate: 60 },
    boardSpin: { attempts: 30, landRate: 80, ottoWinRate: 35 },
    rewriteRules: { attempts: 15, landRate: 70, ottoWinRate: 50 },
  },
  rules: {
    four: { matches: 50, ottoWinRate: 45 }, five: { matches: 20, ottoWinRate: 60 },
    noDiagonals: { matches: 25, ottoWinRate: 40 }, onlyDiagonals: { matches: 18, ottoWinRate: 55 },
    gravity: { matches: 30, ottoWinRate: 50 }, lava: { matches: 22, ottoWinRate: 35 },
    touch: { matches: 20, ottoWinRate: 45 }, fade: { matches: 15, ottoWinRate: 55 },
    mirror: { matches: 18, ottoWinRate: 50 }, timer: { matches: 12, ottoWinRate: 65 },
    reverse: { matches: 10, ottoWinRate: 40 },
  },
};
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

// Counter ONE cheat that is active right now (if the bot can afford it).
// Returns true if it used a power-up (which uses its whole turn).
function counterCheat(s) {
  if (s.lightsOut && use(s, 'lightSwitch')) return true;
  if (s.addedLines.some((line) => line.owner === 'O') && use(s, 'eraser')) return true;
  if (s.board.stolen.some(Boolean) && use(s, 'glueStick')) return true;
  if (s.spinsToUndo > 0 && use(s, 'paperweight')) return true;
  if (s.cheatLandedAt.doubleMove === s.turnNumber && use(s, 'timeOut')) return true;
  if (s.cheatLandedAt.rewriteRules === s.turnNumber && use(s, 'veto')) return true;
  const minion = s.board.minions.findIndex(Boolean);
  return minion >= 0 && use(s, 'flick', minion);
}

// Does the bot have something better to do than a power-up (a win or a block)?
function urgentMove(s) {
  if (isReverseDay(s)) return false;
  return winningSquares(s, 'X').length > 0 || winningSquares(s, 'O').length > 0;
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

    // The player's turn: a power-up (which uses the turn) or a move.
    let end;
    if (!urgentMove(s) && counterCheat(s)) {
      s.stats.powerUpsUsed = (s.stats.powerUpsUsed || 0) + 1;
      end = checkEnd(s, 'X'); // e.g. Glue Stick gave back a winning X
      if (end) return end;
    } else {
      const landing = botMove(s);
      if (landing !== undefined) {
        if (!isReverseDay(s) && winningSquares(s, 'O').includes(landing)) s.points += POINTS.block;
        placeMove(s, landing, 'X');
        s.points += POINTS.placeX;
      }
      end = checkEnd(s, 'X');
      if (end) return end;
    }
    s.playerTurns++;
    s.totalTurns++;
    if (s.lightsOut && --s.lightsOut.turnsLeft <= 0) s.lightsOut = null;
    fadeOldMarks(s);
    if (s.playerTurns >= ROUND_TURN_CAP) return suddenDeath(s);

    // Otto's turn.
    s.turnNumber++;
    tickCooldowns(s);
    if (s.spinBlockedTurns > 0) s.spinBlockedTurns--;
    if (s.ottoSkipTurns > 0) {
      s.ottoSkipTurns--;
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
  const s = { ...freshMatchState(), debug: {}, memory: {}, tactics: WITH_TACTICS ? TYPICAL_TACTICS : null };
  Object.assign(s, freshRoundState(roundNumber));
  setPatience(s, patience);
  return playRound(s);
}

// A whole match: rounds until patience hits 0 (player wins) or Otto wins 3 rounds.
function playMatch() {
  const s = { ...freshMatchState(), debug: {}, memory: {}, tactics: WITH_TACTICS ? TYPICAL_TACTICS : null };
  setPatience(s, 100);
  for (;;) {
    const result = playRound(s);
    if (result === 'X') {
      s.roundsWon.you++;
      s.points += POINTS.winRound;
      changePatience(s, PATIENCE_LOST_ROUND, { roundEnd: true });
    } else if (result === 'O') {
      s.roundsWon.otto++;
      changePatience(s, PATIENCE_WON_ROUND, { roundEnd: true });
    } else {
      changePatience(s, PATIENCE_DRAW, { roundEnd: true });
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

console.log(`Balance test, seed 2026${WITH_TACTICS ? ', with typical Snowflake tactics weights' : ''}\n`);
console.log(`Round wins at each patience band (${COUNT} rounds each; 2 in 3 are rounds 1-2 on 4x4 with 3 in a row, 1 in 3 is round 3+ on 5x5 with 4 in a row):\n`);
console.log('| Patience | Otto skill (win / block / best) | Player wins | Otto wins | Draws |');
console.log('|---|---|---|---|---|');
for (const band of [{ label: '100-76', patience: 88 }, { label: '75-51', patience: 63 }, { label: '50-26', patience: 38 }, { label: '25-1', patience: 12 }]) {
  const results = { X: 0, O: 0, draw: 0 };
  for (let n = 0; n < COUNT; n++) results[roundAtPatience(band.patience, (n % 3) + 1)]++;
  const skill = SKILL.find((level) => band.patience >= level.minPatience);
  console.log(`| ${band.label} | ${skill.takeWin} / ${skill.block} / ${skill.best} | ${pct(results.X, COUNT)} | ${pct(results.O, COUNT)} | ${pct(results.draw, COUNT)} |`);
}

const matches = { X: 0, O: 0, draw: 0 };
let earlyRampages = 0; // matches where patience hit 0 before round 3 ended (must be 0)
const roundsWhenPlayerWins = {};
let totalRounds = 0;
for (let n = 0; n < COUNT; n++) {
  const { winner, rounds } = playMatch();
  matches[winner]++;
  if (winner === 'X' && rounds < 3) earlyRampages++;
  totalRounds += rounds;
  if (winner === 'X') roundsWhenPlayerWins[rounds] = (roundsWhenPlayerWins[rounds] || 0) + 1;
}
console.log(`\nFull matches (${COUNT}): player wins ${pct(matches.X, COUNT)}, Otto wins ${pct(matches.O, COUNT)}` +
  `${matches.draw ? `, unfinished ${pct(matches.draw, COUNT)}` : ''}; average ${(totalRounds / COUNT).toFixed(1)} rounds per match`);
console.log(`Rampages before the end of round 3: ${earlyRampages}`);
console.log('When the player wins, the match took:');
for (const rounds of Object.keys(roundsWhenPlayerWins).sort((a, b) => a - b)) {
  console.log(`  ${rounds} rounds: ${pct(roundsWhenPlayerWins[rounds], matches.X)}`);
}
console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)}s)`);
