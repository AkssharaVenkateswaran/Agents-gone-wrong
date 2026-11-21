// main.js
// Boots the game and runs ONE long match:
//
//   player's turn: click a square (following the current rules) or use power-ups
//   -> Otto's turn:
//        every 4 player turns: Otto REWRITES A RULE (the Rule Book shakes first)
//        maybe a cheat -> TELEGRAPH it (Otto wobbles, "hehe…") for ~1 second
//            -> player clicks Otto in time? CAUGHT! (cheat blocked)
//        then a normal move (following the current rules)
//   -> repeat until someone makes a line under the CURRENT win rule,
//      or the FINAL RULE (most lines of 3) decides it at 9x9 / after 30 turns.
//
// The opening is classic 3x3 tic-tac-toe in the 1952 "OXO on EDSAC" style. At the
// first rule change Otto realises the game is solved and the old screen peels away.

import './styles.css';
import { state, on, emit, resetMatch, MAX_TURNS, RULE_EVERY } from './state.js';
import { emptyCells, addRow, addColumn, linesOf, LINE_LENGTH } from './board.js';
import { chooseMove, pickCheat, addFrustration, tickCooldowns } from './agent.js';
import { getCheat } from './cheats.js';
import { getPowerUp, canAfford } from './powerups.js';
import { addPoints, POINTS, QUICK_COUNTER_TURNS, RULE_BONUS_TURNS } from './scoring.js';
import {
  MAX_BOARD,
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
import { ottoRewriteRules, findWinningSquare } from './ai.js';
import { say, sayRule, sayFromMemory, sayCatchRate } from './dialogue.js';
import { fetchStats, saveMatch } from './memory.js';
import { FIRST_MOVES, cleanName } from './matchLog.js';
import { initRender, updateTurnTimer } from './ui/render.js';
import { showStamp, spinBoardEffect, popPoints, createPeelSheet } from './ui/effects.js';

const OTTO_THINK_MS = 600;       // small pause so Otto's move doesn't feel instant
const TELEGRAPH_MS = 1100;       // how long the player has to catch a cheat
const SOLVED_PAUSE_MS = 2200;    // time to read "this game is SOLVED" before the 1952 screen peels
const RULE_TELEGRAPH_MS = 1500;  // the Rule Book shakes for this long before a rule changes
const RULE_READ_MS = 1400;       // pause after a new rule so the player can read it
const HIGHLIGHT_MS = 2000;       // affected squares glow for 2 seconds
const TURN_TIMER_MS = 5000;      // the "5-second timer" rule

// --- Timing ------------------------------------------------------------------
// `pause(ms)` waits, then tells us whether the game is still the same match.
// (If the player started a new match meanwhile, the old Otto turn must stop.)
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
  return state.playerTurns - state.lastRuleChangeTurn < RULE_BONUS_TURNS;
}

// --- Player's turn -----------------------------------------------------------

function isPlayersTurn() {
  return state.turn === 'X' && !state.matchOver && !state.transitioning;
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
    state.notice = 'Click a minion to flick it (Esc to cancel).';
    emit('change');
    return;
  }
  if (state.mode?.type === 'ownLinePick' || state.mode?.type === 'amend') return; // finish choosing first

  // My Own Line: the free X goes anywhere in the new line and doesn't use up the turn.
  if (state.mode?.type === 'ownLinePlace') {
    if (!state.mode.cells.includes(index) || state.board.cells[index]) return;
    state.mode = null;
    putMark(state, index, 'X');
    earn(POINTS.placeX);
    if (checkMatchEnd('X')) return;
    state.notice = 'Free X placed! Now make your normal move.';
    emit('change');
    return;
  }

  // A normal move must follow the current placement rules.
  const landing = landingSquare(state, index); // Gravity makes marks fall
  const problem = whyIllegal(state, landing);
  if (problem) {
    state.notice = problem;
    emit('change');
    return;
  }

  playerPlace(landing);
  if (checkMatchEnd('X')) return;

  // Double Mark: the player gets to place another X before Otto moves.
  if (state.extraMarks > 0) {
    state.extraMarks--;
    state.notice = 'Double Mark! Place your second X.';
    emit('change');
    return;
  }

  endPlayerTurn();
}

// Place the player's X (with Mirror etc.) and award points.
function playerPlace(landing) {
  // Was Otto about to make a line here? (On Reverse day lines are bad, so no blocking.)
  const ottoThreat = isReverseDay(state) ? -1 : findWinningSquare(state, 'O');
  if (!state.log.firstMove && state.board.rows === 3 && state.board.cols === 3) {
    state.log.firstMove = FIRST_MOVES[landing]; // remembered by Otto's memory
  }
  placeMove(state, landing, 'X');
  state.notice = '';
  earn(POINTS.placeX);

  if (landing === ottoThreat) {
    earn(POINTS.block);
    if (soonAfterRuleChange()) earn(POINTS.ruleBonus);
    state.ottoSays = say('playerBlocks');
    if (state.era === 'modern' && addFrustration(state, 5)) state.ottoSays = say('frustration');
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

  // Twist rules that tick with the turns.
  if (expireRules(state)) {
    state.ottoSays = say('ruleExpired');
    state.notice = 'Reverse day is over. Lines win again.';
  }
  const faded = fadeOldMarks(state);
  if (faded > 0) state.notice = `${faded} old mark${faded > 1 ? 's' : ''} faded away.`;

  // The longer the game drags on, the grumpier Otto gets.
  if (state.era === 'modern' && addFrustration(state, 2)) state.ottoSays = say('frustration');

  if (state.playerTurns >= MAX_TURNS) {
    finalRule();
    return;
  }

  state.turn = 'O';
  emit('change');
  ottoTurn();
}

// --- The 5-second timer rule -----------------------------------------------------
let timerInterval = null;

function startTurnTimer() {
  stopTurnTimer();
  if (state.rules.twist.ruleId !== 'timer' || !isPlayersTurn()) return;
  state.turnDeadline = Date.now() + TURN_TIMER_MS;
  const myGeneration = generation;
  timerInterval = setInterval(() => {
    if (myGeneration !== generation || !isPlayersTurn()) return stopTurnTimer();
    const left = state.turnDeadline - Date.now();
    updateTurnTimer(left);
    if (left <= 0) {
      stopTurnTimer();
      state.notice = 'Too slow! The 5-second timer ran out and you lost your turn.';
      endPlayerTurn();
    }
  }, 200);
}

function stopTurnTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  state.turnDeadline = null;
}

// --- Power-ups ---------------------------------------------------------------

// The player clicked a power-up in the tray (or pressed its number key).
function activatePowerUp(id) {
  if (!isPlayersTurn()) return;
  const powerUp = getPowerUp(id);

  // Pressing an active power-up again cancels it.
  if (state.mode && modeOwner(state.mode) === id) {
    cancelMode();
    return;
  }
  if (state.mode?.type === 'ownLinePlace') {
    state.notice = 'Place your free X in your new line first.';
    emit('change');
    return;
  }
  if (!canAfford(state, powerUp)) {
    state.notice = `${powerUp.name} costs ${powerUp.cost} points. You have ${state.points}.`;
    emit('change');
    return;
  }
  if (!powerUp.canUse(state)) {
    state.notice = `${powerUp.name} won't do anything right now.`;
    emit('change');
    return;
  }

  if (id === 'flick') {
    // One minion? Flick it straight away. Several? Let the player choose.
    const minions = state.board.minions.flatMap((m, i) => (m ? [i] : []));
    if (minions.length === 1) {
      flickMinion(minions[0]);
    } else {
      state.mode = { type: 'flick' };
      state.notice = 'Click a minion to flick it (Esc to cancel).';
      emit('change');
    }
    return;
  }

  if (id === 'myOwnLine') {
    state.mode = { type: 'ownLinePick' };
    state.notice = 'Add a row or a column? (Esc to cancel)';
    emit('change');
    return;
  }

  if (id === 'amendment') {
    // Deal 3 rule cards. The player pays when they pick one.
    state.mode = { type: 'amend', cards: drawRules(state, 3) };
    state.notice = 'Amendment: pick the next rule (Esc to cancel).';
    emit('change');
    return;
  }

  // Everything else happens immediately.
  pay(powerUp);
  if (id === 'veto') {
    const vetoedId = state.rules[state.newestCategory].ruleId;
    powerUp.apply(state);
    const restored = getRule(state.rules[getRule(vetoedId).category].ruleId);
    state.notice = `Vetoed "${getRule(vetoedId).name}". Back to "${restored.name}".`;
    state.ottoSays = say('vetoed');
    highlightRule(restored.id);
    showStamp('VETOED!');
  } else {
    powerUp.apply(state);
    state.notice = `${powerUp.name}! ${powerUp.help}`;
  }
  afterPowerUp(powerUp);
}

function flickMinion(index) {
  const flick = getPowerUp('flick');
  if (!canAfford(state, flick)) {
    state.notice = `Flicking a minion costs ${flick.cost} points. You have ${state.points}.`;
    emit('change');
    return;
  }
  state.mode = null;
  pay(flick);
  flick.apply(state, index);
  state.notice = 'Flick! The minion goes flying.';
  afterPowerUp(flick);
}

// My Own Line: the player chose 'row' or 'col' in the tray.
function chooseOwnLine(type) {
  if (state.mode?.type !== 'ownLinePick') return;
  const powerUp = getPowerUp('myOwnLine');
  pay(powerUp);
  powerUp.apply(state, type); // adds the line and switches to 'ownLinePlace' mode
  state.notice = 'Your new line is ready. Click a square in it for your free X.';
  emit('change');
}

// Amendment: the player picked one of the 3 rule cards.
function chooseAmendment(ruleId) {
  if (state.mode?.type !== 'amend' || !state.mode.cards.includes(ruleId)) return;
  const powerUp = getPowerUp('amendment');
  const cards = state.mode.cards;
  state.mode = null;
  pay(powerUp);
  powerUp.apply(state, ruleId);
  state.lastRuleChange = { ruleId, rejected: cards.filter((id) => id !== ruleId), by: 'player' };
  state.nextRuleAt = state.playerTurns + RULE_EVERY; // Otto's next rewrite waits 4 more turns
  announceRuleChange(state.lastRuleChange);
  state.ottoSays = say('amended');
  if (addFrustration(state, 6)) state.ottoSays = say('frustration');
  startTurnTimer(); // in case the player picked the 5-second timer
  if (checkMatchEnd('X')) return;
  emit('change');
}

function cancelMode() {
  if (!state.mode || state.mode.type === 'ownLinePlace') return; // already paid: can't cancel
  state.mode = null;
  state.notice = '';
  emit('change');
}

// Which power-up started a mode?
function modeOwner(mode) {
  if (mode.type === 'flick') return 'flick';
  if (mode.type === 'amend') return 'amendment';
  return 'myOwnLine';
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
    if (state.era === 'modern' && addFrustration(state, 8)) state.ottoSays = say('frustration');
  }
  if (checkMatchEnd('X')) return; // e.g. Glue Stick or Veto gave the player a line
  emit('change');
}

// --- Rule changes ------------------------------------------------------------------

// Light up the squares a rule affects for 2 seconds.
function highlightRule(ruleId) {
  const highlight = { cells: affectedSquares(state, ruleId) };
  state.highlight = highlight;
  setTimeout(() => {
    if (state.highlight === highlight) {
      state.highlight = null;
      emit('change');
    }
  }, HIGHLIGHT_MS);
}

// Show a rule change: Otto's comment, the notice, the stamp and the highlight.
function announceRuleChange(change) {
  const rule = getRule(change.ruleId);
  const rejected = change.rejected.map((id) => `"${getRule(id).name}"`).join(' and ');
  const who = change.by === 'player' ? 'You picked' : 'New rule';
  state.ottoSays = sayRule(change.ruleId);
  state.notice = `${who}: ${rule.name}. ${rule.sentence}` + (rejected ? ` (Not chosen: ${rejected}.)` : '');
  highlightRule(change.ruleId);
  emit('change');
  showStamp('NEW RULE!');
}

// Otto's regular rewrite: the Rule Book shakes, Otto picks a rule, everyone reads it.
// Returns false if the match was reset meanwhile.
async function scheduledRuleChange() {
  state.nextRuleAt = state.playerTurns + RULE_EVERY;
  state.ruleTelegraph = true;
  state.ottoSays = say('ruleTelegraph');
  emit('change');
  if (!(await pause(RULE_TELEGRAPH_MS))) return false;

  state.ruleTelegraph = false;
  const change = ottoRewriteRules(state);
  if (!change) {
    emit('change');
    return true;
  }
  announceRuleChange(change);
  return pause(RULE_READ_MS);
}

// --- Otto's turn -------------------------------------------------------------

async function ottoTurn() {
  if (!(await pause(OTTO_THINK_MS))) return;
  state.turnNumber++;
  tickCooldowns(state);
  if (state.spinBlockedTurns > 0) state.spinBlockedTurns--;

  // Every 4 player turns, Otto rewrites a rule. (The first time, it also realises
  // the classic game is solved and peels away the 1952 screen.)
  if (state.playerTurns >= state.nextRuleAt) {
    if (state.era === '1952' && !(await leave1952())) return;
    if (!(await scheduledRuleChange())) return;
    if (checkMatchEnd(null)) return;
  }

  // Time Out makes Otto skip a turn.
  if (state.ottoSkipsNextTurn) {
    state.ottoSkipsNextTurn = false;
    state.ottoSays = say('skipTurn');
    endOttoTurn();
    return;
  }

  const cheat = pickCheat(state);
  if (cheat) {
    // Telegraph: Otto wobbles and says "hehe…". The player can click Otto now.
    state.telegraph = cheat.id;
    state.ottoSays = say(cheat.id === 'rewriteRules' ? 'ruleTelegraph' : 'telegraph');
    // Sometimes Otto brags with a real stat: "Only 23% of humans catch my Mark Steal."
    const brag = sayCatchRate(state.memory.stats, cheat.id, cheat.name);
    if (brag && Math.random() < 0.4) state.ottoSays = brag;
    emit('change');
    if (!(await pause(TELEGRAPH_MS))) return;

    if (state.telegraph === cheat.id) {
      state.telegraph = null;
      runCheat(cheat);
      if (state.matchOver) return;
      if (cheat.replacesMove) {
        endOttoTurn(); // the cheat already placed Otto's mark(s)
        return;
      }
      if (!(await pause(cheat.id === 'rewriteRules' ? RULE_READ_MS : OTTO_THINK_MS))) return;
    } else {
      // The player caught it: Otto has to play fair this turn.
      if (!(await pause(OTTO_THINK_MS + 300))) return;
    }
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
  showStamp('CAUGHT!');
}

function runCheat(cheat) {
  cheat.apply(state);
  state.cooldowns[cheat.id] = cheat.cooldown;
  state.lastCheat = { id: cheat.id, turnNumber: state.turnNumber };
  state.cheatLandedAt[cheat.id] = state.turnNumber;
  if (cheat.id === 'boardSpin') state.spinsToUndo++;
  state.stats.cheatsUsed++;
  state.log.cheatsUsed.push(cheat.id);

  if (cheat.id === 'rewriteRules') {
    announceRuleChange(state.lastRuleChange);
    state.notice = `Otto cheated: rewrote a rule early! ` + state.notice;
  } else {
    state.ottoSays = say('cheatSucceeds');
    state.notice = `Otto cheated: ${cheat.name}! ${cheat.description}`;
  }
  emit('change');
  if (cheat.id === 'boardSpin') spinBoardEffect();

  checkMatchEnd('O');
}

function ottoNormalMove() {
  const landing = chooseMove(state);
  if (landing !== undefined) placeMove(state, landing, 'O');
  if (checkMatchEnd('O')) return;
  endOttoTurn();
}

function endOttoTurn() {
  state.turn = 'X';
  emit('change');
  startTurnTimer();
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
  endMatch(winner, [...new Set(winnerLines.flat())]);
  state.ottoSays = say('finalRule');
  state.notice = `FINAL RULE: most lines of 3 wins. You ${xLines.length} – ${oLines.length} Otto.`;
  emit('change');
  showStamp('FINAL RULE!');
}

function endMatch(winner, line) {
  stopTurnTimer();
  state.matchOver = true;
  state.result = winner;
  state.winLine = line;
  state.telegraph = null;
  state.ruleTelegraph = false;
  state.mode = null;
  state.lightsOut = null; // lights back on so the player can see the result

  if (winner === 'X') {
    earn(POINTS.winMatch);
    if (soonAfterRuleChange()) earn(POINTS.ruleBonus);
    state.ottoSays = say('meltdown');
  } else if (winner === 'O') {
    state.ottoSays = say('matchWon');
  } else {
    state.ottoSays = say('draw');
  }
  if (isReverseDay(state) && !state.finalRule) {
    state.notice = `Reverse day! Making a line LOSES, so ${winner === 'X' ? 'you win' : 'Otto wins'}.`;
  }
  emit('change');
  rememberMatch(winner);
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
  emit('change');

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

// --- The 1952 opening -------------------------------------------------------------------

// Otto realises tic-tac-toe is solved, and the old 1952 screen glitches and
// peels away like a sticker, revealing the sticker-scrapbook world.
// Returns false if the match was reset meanwhile.
async function leave1952() {
  state.transitioning = true;
  state.ottoSays = say('solved');
  emit('change'); // Otto says it on the old screen first
  if (!(await pause(SOLVED_PAUSE_MS))) return false;

  // 1. Copy the old screen over the page, 2. switch the real page underneath...
  const sheet = createPeelSheet(document.getElementById('app'));
  state.era = 'modern';
  addFrustration(state, Math.max(0, 20 - state.frustration)); // Otto starts out bored
  emit('change');

  // 3. ...then glitch and peel the copy away.
  const myGeneration = generation;
  await sheet.play();
  if (myGeneration !== generation) return false;
  state.transitioning = false;
  emit('change');
  return true;
}

function playAgain() {
  generation++; // stops any of Otto's unfinished turns
  stopTurnTimer();
  resetMatch();
  state.ottoSays = say('matchStart');
  emit('change');
  loadMemory(); // runs in the background
}

// The title screen's Play button.
const NAME_KEY = 'agents-gone-wrong:name';
function startGame(rawName) {
  state.playerName = cleanName(rawName) || 'Human';
  try {
    localStorage.setItem(NAME_KEY, state.playerName); // remember the name next time
  } catch {
    // private browsing etc. — not important
  }
  state.screen = 'game';
  playAgain();
}

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

// --- Debug panel (open the game with ?debug in the URL) -----------------------
async function debugAction(action, value) {
  if (state.transitioning) return;
  state.debug.message = '';

  if (action === 'force') {
    state.debug.forceCheat = value;
    state.debug.message = `Otto will try ${getCheat(value).name} on its next turn.`;
  } else if (action === 'skipIntro') {
    if (state.era === '1952') {
      generation++; // cancel Otto's pending turn; it's the player's go afterwards
      state.turn = 'X';
      await leave1952();
    }
    return;
  } else if (action === 'rule') {
    // Switch on a specific rule right now.
    if (state.matchOver || getRuleIsActive(value)) {
      state.debug.message = `${getRule(value).name} is already active (or the match is over).`;
    } else {
      activateRule(state, value);
      state.lastRuleChange = { ruleId: value, rejected: [], by: 'debug' };
      announceRuleChange(state.lastRuleChange);
      startTurnTimer();
      checkMatchEnd(null);
      return;
    }
  } else if (action === 'ruleNow') {
    state.nextRuleAt = state.playerTurns; // Otto rewrites a rule on its next turn
    state.debug.message = 'Otto will rewrite a rule on its next turn.';
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

function getRuleIsActive(ruleId) {
  const rule = getRule(ruleId);
  return state.rules[rule.category].ruleId === ruleId;
}

// --- Boot ------------------------------------------------------------------
initRender(document.getElementById('app'), {
  onCellClick,
  onCatch: catchCheat,
  onPlayAgain: playAgain,
  onStart: startGame,
  onPowerUp: activatePowerUp,
  onOwnLineChoice: chooseOwnLine,
  onAmend: chooseAmendment,
  onCancel: cancelMode,
  onDebug: debugAction,
});
on('change', () => emit('render'));
resetMatch();
state.playerName = savedName();
state.screen = 'title'; // ask for the player's name first
emit('change');
