// main.js
// Boots the game and runs ONE long match:
//
//   START of the player's turn:
//        if it's time, the RULES CHANGE (a NEW_RULE.EXE pop-up; inputs locked),
//        so the player always makes the first move under every new rule
//   player's turn: click a square (following the current rules) or use power-ups
//   -> Otto's turn: wait 400ms, "think" for 1.2-1.8s, maybe TELEGRAPH a cheat
//        (the player can click Otto to catch it), then a normal move
//   -> repeat until someone makes a line under the CURRENT win rule,
//      or the FINAL RULE (most lines of 3) decides it at 9x9 / after 30 turns.

import './styles.css';
import { state, on, emit, resetMatch, MAX_TURNS } from './state.js';
import { emptyCells, addRow, addColumn, linesOf, LINE_LENGTH } from './board.js';
import { chooseMove, pickCheat, commitCheat, addFrustration, tickCooldowns } from './agent.js';
import { getCheat } from './cheats.js';
import { getPowerUp, canAfford } from './powerups.js';
import { addPoints, POINTS, QUICK_COUNTER_TURNS, RULE_BONUS_TURNS } from './scoring.js';
import {
  MAX_BOARD,
  RULE_EVERY,
  TIMER_SECONDS,
  getRule,
  drawRules,
  landingSquare,
  whyIllegal,
  placeMove,
  putMark,
  lineFor,
  isReverseDay,
  expireRules,
  fadeOldMarks,
  affectedSquares,
  activateRule,
  currentTurn,
} from './rules.js';
import { ottoRewriteRules, findWinningSquare, winningSquares } from './ai.js';
import { say, sayRule, sayFromMemory, sayCatchRate } from './dialogue.js';
import { fetchStats, saveMatch } from './memory.js';
import { FIRST_MOVES, cleanName } from './matchLog.js';
import { sfx, setMuted } from './sfx.js';
import { initRender, updateTurnTimer, ruleRowPosition } from './ui/render.js';
import { showPopup, spinBoardEffect, popPoints } from './ui/effects.js';

const PLAYER_TO_OTTO_MS = 400;    // pause after the player's move before Otto starts thinking
const THINK_MIN_MS = 1200;        // Otto "thinks" for 1.2-1.8 seconds before every move
const THINK_EXTRA_MS = 600;
const TELEGRAPH_MS = 1100;        // how long the player has to catch a cheat
const RULE_AUTO_OK_MS = 4000;     // the NEW_RULE.EXE pop-up continues by itself after 4s
const RULE_MINIMISE_MS = 600;     // the pop-up shrinks into the Rule Book
const RULE_EXAMPLE_MS = 2000;     // a 2-second example of the new rule on the board
const TURN_TIMER_MS = TIMER_SECONDS * 1000;

// --- Timing ------------------------------------------------------------------
// `pause(ms)` waits, then tells us whether the game is still the same match.
// (If the player started a new match meanwhile, the old sequence must stop.)
let generation = 0;
function pause(ms) {
  const myGeneration = generation;
  return new Promise((resolve) => setTimeout(() => resolve(myGeneration === generation), ms));
}

const other = (mark) => (mark === 'X' ? 'O' : 'X');

// Give the player points and show a "+N" pop.
function earn(amount) {
  addPoints(state, amount);
  popPoints(amount);
}

// Was a rule changed within the last 2 player turns? (For the +3 rule bonus.)
function soonAfterRuleChange() {
  return state.stats.rulesChanged > 0 && state.playerTurns - state.lastRuleChangeTurn < RULE_BONUS_TURNS;
}

// Has Otto started bending the rules yet? (Before the first rule change it plays fair.)
const ottoUnleashed = () => state.stats.rulesChanged > 0;

// --- Player's turn -----------------------------------------------------------

function isPlayersTurn() {
  return state.turn === 'X' && !state.matchOver && !state.ruleScene && state.screen === 'game';
}

// The player clicked (or pressed Enter on) a square.
function onCellClick(index) {
  if (!isPlayersTurn()) return;

  // Clicking a minion flicks it off the board (that's the Flick power-up).
  if (state.board.minions[index]) {
    flickMinion(index);
    return;
  }
  if (state.mode?.type === 'flick') {
    setNotice('Click a minion to flick it (Esc to cancel).');
    return;
  }
  if (state.mode?.type === 'ownLinePick') return; // choose row/column first

  // My Own Line: the free X goes anywhere in the new line and doesn't use up the turn.
  if (state.mode?.type === 'ownLinePlace') {
    if (!state.mode.cells.includes(index) || state.board.cells[index]) return;
    state.mode = null;
    putMark(state, index, 'X');
    sfx.place();
    earn(POINTS.placeX);
    if (checkMatchEnd('X')) return;
    setNotice('Free X placed! Now make your normal move.');
    return;
  }

  // A normal move must follow the current placement rules.
  const landing = landingSquare(state, index); // Gravity makes marks fall
  const problem = whyIllegal(state, landing);
  if (problem) {
    setNotice(problem);
    return;
  }

  playerPlace(landing);
  if (checkMatchEnd('X')) return;

  // Double Mark: the player gets to place another X before Otto moves.
  if (state.extraMarks > 0) {
    state.extraMarks--;
    setNotice('Double Mark! Place your second X.');
    return;
  }

  endPlayerTurn();
}

// Replace the one message line (there is only ever one notice at a time).
function setNotice(text) {
  state.notice = text;
  emit('change');
}

// Place the player's X (with Mirror etc.) and award points.
function playerPlace(landing) {
  // Was Otto about to make a line here? (On Reverse day lines are bad, so no blocking.)
  const ottoThreat = isReverseDay(state) ? -1 : findWinningSquare(state, 'O');
  if (!state.log.firstMove && state.board.rows === 3 && state.board.cols === 3) {
    state.log.firstMove = FIRST_MOVES[landing]; // remembered by Otto's memory
  }
  placeMove(state, landing, 'X');
  sfx.place();
  state.notice = '';
  state.threatCells = null;
  earn(POINTS.placeX);

  if (landing === ottoThreat) {
    earn(POINTS.block);
    if (soonAfterRuleChange()) earn(POINTS.ruleBonus);
    state.ottoSays = say('playerBlocks');
    if (ottoUnleashed() && addFrustration(state, 5)) state.ottoSays = say('frustration');
  }
}

function endPlayerTurn() {
  stopTurnTimer();
  state.mode = null;
  state.extraMarks = 0;
  state.playerTurns++;

  // Lights Out wears off after a few player turns.
  if (state.lightsOut) {
    state.lightsOut.turnsLeft--;
    if (state.lightsOut.turnsLeft <= 0) {
      state.lightsOut = null;
      state.notice = 'The lights flicker back on.';
    }
  }

  const faded = fadeOldMarks(state);
  if (faded > 0) state.notice = `${faded} old mark${faded > 1 ? 's' : ''} faded away.`;

  // The longer the game drags on, the grumpier Otto gets.
  if (ottoUnleashed() && addFrustration(state, 2)) state.ottoSays = say('frustration');

  if (state.playerTurns >= MAX_TURNS) {
    finalRule();
    return;
  }

  state.turn = 'O';
  emit('change');
  ottoTurn();
}

// The START of the player's turn: rule changes happen here, never before Otto moves.
async function startPlayerTurn() {
  state.turn = 'X';
  state.blinkCategory = null;

  // Reverse day only lasts a few turns.
  if (expireRules(state)) {
    state.ottoSays = say('ruleExpired');
    state.notice = 'Reverse day is over. Lines win again.';
  }

  if (state.playerTurns >= state.nextRuleAt) {
    if (!(await ruleChangeScene())) return;
    if (checkMatchEnd(null)) return; // e.g. the board had to grow to 9x9
  } else if (state.nextRuleAt - state.playerTurns === 1) {
    // One turn of warning before the rules change.
    state.ottoSays = state.stats.rulesChanged === 0 ? say('solved') : say('ruleTelegraph');
  }

  // Tutorial (first match only): point out where Otto is about to win.
  state.threatCells = null;
  if (state.tutorial && !isReverseDay(state)) {
    const threats = winningSquares(state, 'O');
    if (threats.length > 0) {
      state.threatCells = threats;
      state.ottoSays = "> threat: you're about to lose, human";
    }
  }

  emit('change');
  startTurnTimer();
}

// --- The turn timer rule -----------------------------------------------------------
let timerInterval = null;

function startTurnTimer() {
  stopTurnTimer();
  if (state.rules.twist.ruleId !== 'timer' || !isPlayersTurn()) return;
  state.turnDeadline = Date.now() + TURN_TIMER_MS;
  const myGeneration = generation;
  emit('change');
  timerInterval = setInterval(() => {
    if (myGeneration !== generation || !isPlayersTurn()) return stopTurnTimer();
    const left = state.turnDeadline - Date.now();
    updateTurnTimer(left, TURN_TIMER_MS);
    if (left <= 0) {
      stopTurnTimer();
      state.notice = `Too slow! The ${TIMER_SECONDS}-second timer ran out and you lost your turn.`;
      endPlayerTurn();
    }
  }, 250);
}

function stopTurnTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  state.turnDeadline = null;
}

// --- Power-ups ---------------------------------------------------------------

// The player clicked a power-up disk (or pressed its number key).
function activatePowerUp(id) {
  if (!isPlayersTurn()) return;
  const powerUp = getPowerUp(id);

  // Pressing an active power-up again cancels it.
  if (state.mode && modeOwner(state.mode) === id) {
    cancelMode();
    return;
  }
  if (state.mode?.type === 'ownLinePlace') {
    setNotice('Place your free X in your new line first.');
    return;
  }
  if (!canAfford(state, powerUp)) {
    setNotice(`${powerUp.name} costs ${powerUp.cost} points. You have ${state.points}.`);
    return;
  }
  if (!powerUp.canUse(state)) {
    setNotice(`${powerUp.name} won't do anything right now.`);
    return;
  }
  sfx.click();

  if (id === 'flick') {
    // One minion? Flick it straight away. Several? Let the player choose.
    const minions = state.board.minions.flatMap((m, i) => (m ? [i] : []));
    if (minions.length === 1) {
      flickMinion(minions[0]);
    } else {
      state.mode = { type: 'flick' };
      setNotice('Click a minion to flick it (Esc to cancel).');
    }
    return;
  }

  if (id === 'myOwnLine') {
    state.mode = { type: 'ownLinePick' };
    setNotice('Add a row or a column? (Esc to cancel)');
    return;
  }

  // Everything else happens immediately.
  pay(powerUp);
  if (id === 'veto') {
    const vetoedId = state.rules[state.newestCategory].ruleId;
    const category = getRule(vetoedId).category;
    powerUp.apply(state);
    const restored = getRule(state.rules[category].ruleId);
    state.notice = `Vetoed "${getRule(vetoedId).name}". Back to "${restored.name}".`;
    state.ottoSays = say('vetoed');
    showExample(restored.id);
    showPopup('VETOED!');
  } else if (id === 'amendment') {
    powerUp.apply(state);
    state.notice = 'Amendment ready: YOU pick the next rule when the rules change.';
    state.ottoSays = say('amended');
  } else {
    powerUp.apply(state);
    state.notice = `${powerUp.name}! ${powerUp.help}`;
  }
  afterPowerUp(powerUp);
}

function flickMinion(index) {
  const flick = getPowerUp('flick');
  if (!canAfford(state, flick)) {
    setNotice(`Flicking a minion costs ${flick.cost} points. You have ${state.points}.`);
    return;
  }
  state.mode = null;
  pay(flick);
  flick.apply(state, index);
  state.notice = 'Flick! The minion goes flying.';
  afterPowerUp(flick);
}

// My Own Line: the player chose 'row' or 'col'.
function chooseOwnLine(type) {
  if (state.mode?.type !== 'ownLinePick') return;
  const powerUp = getPowerUp('myOwnLine');
  pay(powerUp);
  powerUp.apply(state, type); // adds the line and switches to 'ownLinePlace' mode
  setNotice('Your new line is ready. Click a square in it for your free X.');
}

function cancelMode() {
  if (!state.mode || state.mode.type === 'ownLinePlace') return; // already paid: can't cancel
  state.mode = null;
  setNotice('');
}

// Which power-up started a mode?
function modeOwner(mode) {
  return mode.type === 'flick' ? 'flick' : 'myOwnLine';
}

function pay(powerUp) {
  state.points -= powerUp.cost;
  state.stats.powerUpsUsed++;
  state.log.powerupsUsed.push(powerUp.id);
}

// Shared clean-up after a power-up: counter bonus, Otto's reaction, win check.
function afterPowerUp(powerUp) {
  const cheatId = powerUp.counters;
  if (cheatId) {
    // +2 if this counters a cheat that landed within the last 2 Otto turns.
    const landedAt = state.cheatLandedAt[cheatId];
    if (landedAt !== undefined && state.turnNumber - landedAt < QUICK_COUNTER_TURNS) {
      earn(POINTS.quickCounter);
      delete state.cheatLandedAt[cheatId]; // only once per cheat
    }
    if (powerUp.id !== 'veto') state.ottoSays = say('cheatCountered');
    if (ottoUnleashed() && addFrustration(state, 8)) state.ottoSays = say('frustration');
  }
  if (checkMatchEnd('X')) return; // e.g. Glue Stick gave back a winning X
  emit('change');
}

// --- Rule changes ------------------------------------------------------------------

// Show a 2-second example of a rule on the board (e.g. a ghost line of 4 squares).
function showExample(ruleId) {
  const highlight = { cells: affectedSquares(state, ruleId) };
  state.highlight = highlight;
  setTimeout(() => {
    if (state.highlight === highlight) {
      state.highlight = null;
      emit('change');
    }
  }, RULE_EXAMPLE_MS);
}

// The player pressed [ OK ] (or picked an Amendment card) on the pop-up.
let resolveRuleScene = null;
function onRuleOk(ruleId) {
  if (resolveRuleScene) resolveRuleScene(ruleId);
}
const waitForClick = () => new Promise((resolve) => (resolveRuleScene = resolve));

// The rule change, step by step (inputs are locked the whole time):
//   1. the board dims and NEW_RULE.EXE pops up over the monitor
//   2. [ OK ], or it continues by itself after 4 seconds
//   3. the pop-up minimises into its row in RULES.TXT, which blinks twice
//   4. a 2-second example of the rule on the board
//   5. then it's the player's turn
// Returns false if the match was reset meanwhile.
async function ruleChangeScene() {
  stopTurnTimer();
  state.nextRuleAt = state.playerTurns + RULE_EVERY;

  let change;
  if (state.amendmentPending && drawRules(state).length > 0) {
    // Amendment: the player picks from 3 cards.
    state.amendmentPending = false;
    const cards = drawRules(state, 3);
    state.ruleScene = { phase: 'pick', cards };
    state.ottoSays = say('amended');
    emit('change');
    sfx.rule();
    const ruleId = await waitForClick();
    if (!state.ruleScene) return false; // new match started
    const oldId = state.rules[getRule(ruleId).category].ruleId;
    activateRule(state, ruleId);
    change = { ruleId, oldId, rejected: cards.filter((id) => id !== ruleId), by: 'player' };
  } else {
    const before = { ...state.rules };
    const picked = ottoRewriteRules(state);
    if (!picked) return true; // no rule left to change
    change = { ...picked, oldId: before[getRule(picked.ruleId).category].ruleId };
    sfx.rule();
  }
  state.lastRuleChange = change;

  // 1-2. Show the pop-up; wait for [ OK ] or 4 seconds.
  state.ruleScene = { phase: 'show', change };
  state.ottoSays = sayRule(change.ruleId);
  state.notice = '';
  emit('change');
  const myGeneration = generation;
  await Promise.race([waitForClick(), pause(RULE_AUTO_OK_MS)]);
  if (myGeneration !== generation) return false;

  // 3. Minimise into the Rule Book.
  const category = getRule(change.ruleId).category;
  state.ruleScene = { phase: 'minimise', change, target: ruleRowPosition(category) };
  emit('change');
  if (!(await pause(RULE_MINIMISE_MS))) return false;
  state.ruleScene = null;
  state.blinkCategory = category;

  // 4. The example on the board.
  showExample(change.ruleId);
  emit('change');
  if (!(await pause(RULE_EXAMPLE_MS))) return false;
  return true;
}

// --- Otto's turn -------------------------------------------------------------

async function ottoTurn() {
  if (!(await pause(PLAYER_TO_OTTO_MS))) return;
  state.turnNumber++;
  tickCooldowns(state);
  if (state.spinBlockedTurns > 0) state.spinBlockedTurns--;

  // Time Out makes Otto skip a turn.
  if (state.ottoSkipsNextTurn) {
    state.ottoSkipsNextTurn = false;
    state.ottoSays = say('skipTurn');
    emit('change');
    if (!(await pause(THINK_MIN_MS))) return;
    endOttoTurn();
    return;
  }

  // Otto thinks: eyes look around, dots in its bubble.
  state.ottoThinking = true;
  emit('change');
  if (!(await pause(THINK_MIN_MS + Math.random() * THINK_EXTRA_MS))) return;
  state.ottoThinking = false;

  // A cheat (rarely: never early, at most 1 per 3 turns, never one that decides the match).
  const picked = pickCheat(state);
  if (picked) {
    const { cheat, trial } = picked;
    state.lastCheatTry = state.turnNumber;
    // Telegraph: Otto's screen flickers ">:)". The player can click Otto now.
    state.telegraph = cheat.id;
    state.ottoSays = say(cheat.id === 'rewriteRules' ? 'ruleTelegraph' : 'telegraph');
    // Sometimes Otto brags with a real stat: "Only 23% of humans catch my Mark Steal."
    const brag = sayCatchRate(state.memory.stats, cheat.id, cheat.name);
    if (brag && Math.random() < 0.4) state.ottoSays = brag;
    emit('change');
    if (!(await pause(TELEGRAPH_MS))) return;

    if (state.telegraph === cheat.id) {
      state.telegraph = null;
      runCheat(cheat, trial);
      if (state.matchOver) return;
      if (cheat.replacesMove) {
        endOttoTurn(); // the cheat already placed Otto's mark(s)
        return;
      }
    }
    // After a cheat (or getting caught) Otto thinks again briefly.
    state.ottoThinking = true;
    emit('change');
    if (!(await pause(THINK_MIN_MS))) return;
    state.ottoThinking = false;
  }

  ottoNormalMove();
}

// The player clicked Otto (or pressed C).
function catchCheat() {
  if (!state.telegraph) return; // nothing to catch
  const cheat = getCheat(state.telegraph);
  state.telegraph = null;

  state.cooldowns[cheat.id] = cheat.cooldown; // a caught cheat still goes on cooldown
  state.stats.cheatsCaught++;
  state.log.cheatsCaught.push(cheat.id);
  addFrustration(state, 10);
  state.ottoSays = say('cheatCaught');
  state.notice = `CAUGHT! Otto was about to use ${cheat.name}.`;
  earn(POINTS.catchCheat);
  emit('change');
  sfx.caught();
  showPopup('CAUGHT!');
}

// Apply a cheat whose result was already checked by simulateCheat() (see agent.js).
function runCheat(cheat, trial) {
  commitCheat(state, trial);
  state.cooldowns[cheat.id] = cheat.cooldown;
  state.lastCheat = { id: cheat.id, turnNumber: state.turnNumber };
  state.cheatLandedAt[cheat.id] = state.turnNumber;
  if (cheat.id === 'boardSpin') state.spinsToUndo++;
  state.stats.cheatsUsed++;
  state.log.cheatsUsed.push(cheat.id);
  state.ottoSays = say('cheatSucceeds');
  state.notice = `Otto cheated: ${cheat.name}! ${cheat.description}`;
  emit('change');
  sfx.cheat();
  if (cheat.id === 'boardSpin') spinBoardEffect();
  checkMatchEnd('O');
}

function ottoNormalMove() {
  const landing = chooseMove(state);
  if (landing !== undefined) {
    placeMove(state, landing, 'O');
    sfx.otto();
  }
  state.ottoGrace = false; // the grace turn is over
  if (checkMatchEnd('O')) return;
  endOttoTurn();
}

function endOttoTurn() {
  state.ottoGrace = false;
  startPlayerTurn();
}

// --- Win / board full / final rule -----------------------------------------------------

// Check whether the match is over after `mover` ('X', 'O' or null) did something.
// Returns true if it ended.
function checkMatchEnd(mover) {
  const lines = { X: lineFor(state, 'X'), O: lineFor(state, 'O') };
  if (lines.X || lines.O) {
    // The mover's own line counts first (a move can sometimes make lines for both).
    const maker = mover && lines[mover] ? mover : lines.X ? 'X' : 'O';
    // Reverse day: making a line LOSES.
    const winner = isReverseDay(state) ? other(maker) : maker;
    endMatch(winner, lines[maker].line);
    return true;
  }

  // At 9x9 the FINAL RULE decides.
  if (state.board.rows >= MAX_BOARD && state.board.cols >= MAX_BOARD) {
    finalRule();
    return true;
  }

  // Board full: Otto is forced to add a row or column.
  if (emptyCells(state.board).length === 0) {
    if (state.board.rows <= state.board.cols) addRow(state.board);
    else addColumn(state.board);
    state.ottoSays = say('outOfRoom');
    state.notice = 'The board is full, so Otto had to add more board.';
    addFrustration(state, 10);
    if (state.board.rows >= MAX_BOARD && state.board.cols >= MAX_BOARD) {
      finalRule();
      return true;
    }
  }
  return false;
}

// FINAL RULE: count every line of 3 (overlapping lines count too). Most lines wins.
function finalRule() {
  const xLines = linesOf(state.board, 'X', LINE_LENGTH);
  const oLines = linesOf(state.board, 'O', LINE_LENGTH);
  state.finalRule = { x: xLines.length, o: oLines.length };
  const winner = xLines.length > oLines.length ? 'X' : oLines.length > xLines.length ? 'O' : 'draw';
  const winnerLines = winner === 'X' ? xLines : winner === 'O' ? oLines : [...xLines, ...oLines];
  state.notice = `FINAL RULE: most lines of 3 wins. You ${xLines.length} – ${oLines.length} Otto.`;
  showPopup('FINAL RULE!');
  endMatch(winner, [...new Set(winnerLines.flat())]);
  state.ottoSays = say('finalRule');
  emit('change');
}

// The match is over. Then the ending plays:
//   player wins: Otto's monitor crashes -> the table flips -> YOU WIN! banner
//   Otto wins / draw: straight to the banner (Otto looks smug)
async function endMatch(winner, line) {
  stopTurnTimer();
  state.matchOver = true;
  state.result = winner;
  state.winLine = line;
  state.telegraph = null;
  state.ottoThinking = false;
  state.mode = null;
  state.threatCells = null;
  state.lightsOut = null; // lights back on so the player can see the result
  state.session.played++; // the next match is the next "match number"

  if (winner === 'X') {
    earn(POINTS.winMatch);
    if (soonAfterRuleChange()) earn(POINTS.ruleBonus);
    state.session.you++;
    state.ottoSays = say('meltdown');
  } else if (winner === 'O') {
    state.session.otto++;
    state.ottoSays = say('matchWon');
  } else {
    state.ottoSays = say('draw');
  }
  if (isReverseDay(state) && !state.finalRule) {
    state.notice = `Reverse day! Making a line LOSES, so ${winner === 'X' ? 'you win' : 'Otto wins'}.`;
  }
  rememberMatch(winner);

  if (winner === 'X') {
    state.ending = 'crash';
    emit('change');
    sfx.lose(); // Otto's computer dying
    if (!(await pause(1400))) return;
    state.ending = 'flip';
    emit('change');
    if (!(await pause(900))) return;
    sfx.win();
  } else {
    emit('change');
    if (!(await pause(1200))) return;
    if (winner === 'O') sfx.lose();
  }
  state.ending = 'banner';
  emit('change');
}

// --- Otto's memory (Snowflake, through our API) ---------------------------------------
// None of this ever blocks the game: if the API is slow or down, the game carries on.

// At the start of a match: load stats, then maybe taunt the player with them.
async function loadMemory() {
  const myGeneration = generation;
  state.memory = { status: 'loading', stats: null };
  const stats = await fetchStats(state.playerName);
  if (myGeneration !== generation) return; // a new match started meanwhile
  state.memory = { status: stats ? 'ready' : 'offline', stats };
  const taunt = sayFromMemory(stats);
  // Only interrupt if the player hasn't started playing yet.
  if (taunt && state.playerTurns === 0 && !state.matchOver) state.ottoSays = taunt;
  emit('change');
}

// At the end of a match: save it, then reload the stats for the leaderboard.
async function rememberMatch(winner) {
  if (state.log.saved) return; // only once per match
  state.log.saved = true;
  const myGeneration = generation;
  state.memory = { ...state.memory, status: 'loading' };

  await saveMatch({
    playerName: state.playerName,
    firstMove: state.log.firstMove,
    cheatsUsed: state.log.cheatsUsed,
    cheatsCaught: state.log.cheatsCaught,
    powerupsUsed: state.log.powerupsUsed,
    winner: winner === 'X' ? 'player' : winner === 'O' ? 'otto' : 'draw',
  });
  const stats = await fetchStats(state.playerName);
  if (myGeneration !== generation) return;
  state.memory = stats ? { status: 'ready', stats } : { ...state.memory, status: 'offline' };
  emit('change');
}

// --- Starting matches ------------------------------------------------------------------

function playAgain() {
  generation++; // stops any unfinished sequences from the last match
  stopTurnTimer();
  resolveRuleScene = null;
  resetMatch();
  state.ottoSays = say('matchStart');
  emit('change');
  loadMemory(); // runs in the background
}

// The title screen's Play button.
const NAME_KEY = 'agents-gone-wrong:name';
const MUTE_KEY = 'agents-gone-wrong:muted';

function startGame(rawName) {
  state.playerName = cleanName(rawName) || 'Human';
  remember(NAME_KEY, state.playerName);
  state.screen = 'game';
  sfx.click();
  playAgain();
}

function toggleMute() {
  state.muted = !state.muted;
  setMuted(state.muted);
  remember(MUTE_KEY, state.muted ? '1' : '');
  emit('change');
}

// localStorage can fail (private browsing etc.), and that's fine.
function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not important
  }
}
function recall(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

// --- Debug panel (open the game with ?debug in the URL) -----------------------
function debugAction(action, value) {
  if (state.ruleScene) return;
  state.debug.message = '';

  if (action === 'force') {
    state.debug.forceCheat = value;
    state.debug.message = `Otto will try ${getCheat(value).name} on its next turn.`;
  } else if (action === 'rule') {
    // Switch on a specific rule right now (no pop-up).
    if (state.matchOver || state.rules[getRule(value).category].ruleId === value) {
      state.debug.message = `${getRule(value).name} is already active (or the match is over).`;
    } else {
      const oldId = state.rules[getRule(value).category].ruleId;
      activateRule(state, value);
      state.lastRuleChange = { ruleId: value, oldId, rejected: [], by: 'debug' };
      state.ottoSays = sayRule(value);
      showExample(value);
      startTurnTimer();
      checkMatchEnd(null);
    }
  } else if (action === 'ruleNow') {
    state.nextRuleAt = state.playerTurns + 1; // changes at the start of your next turn
    state.debug.message = 'The rules change at the start of your next turn.';
  } else if (action === 'grow') {
    if (state.board.rows < MAX_BOARD) addRow(state.board);
    if (state.board.cols < MAX_BOARD) addColumn(state.board);
    checkMatchEnd(null);
  } else if (action === 'turn29') {
    state.playerTurns = Math.max(state.playerTurns, MAX_TURNS - 1);
    state.debug.message = `It's now turn ${currentTurn(state)}. Your next move triggers the FINAL RULE.`;
  } else if (action === 'frustration') {
    addFrustration(state, 25);
  } else if (action === 'calm') {
    addFrustration(state, -100);
  } else if (action === 'points') {
    earn(10);
  } else if (action === 'cooldowns') {
    state.cooldowns = {};
  }
  emit('change');
}

// --- Boot ------------------------------------------------------------------
initRender(document.getElementById('app'), {
  onCellClick,
  onCatch: catchCheat,
  onPlayAgain: playAgain,
  onStart: startGame,
  onPowerUp: activatePowerUp,
  onOwnLineChoice: chooseOwnLine,
  onRuleOk,
  onCancel: cancelMode,
  onMute: toggleMute,
  onDebug: debugAction,
});
on('change', () => emit('render'));
resetMatch();
state.playerName = recall(NAME_KEY);
state.muted = recall(MUTE_KEY) === '1';
setMuted(state.muted);
state.screen = 'title'; // ask for the player's name first
emit('change');
