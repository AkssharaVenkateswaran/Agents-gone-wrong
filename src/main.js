// main.js
// Boots the game and runs the turn loop:
//
//   player clicks a square -> place X -> check for win/draw
//     (on their turn the player can also spend points on power-ups)
//   -> Otto's turn:
//        maybe pick a cheat -> TELEGRAPH it (Otto wobbles, "hehe…") for ~1 second
//            -> player clicks Otto in time? CAUGHT! (cheat blocked, Otto moves normally)
//            -> otherwise the cheat happens (and Otto may still make a normal move)
//        or just make a normal move
//   -> check for win/draw -> back to the player.

import './styles.css';
import { state, on, emit, resetMatch, resetRound, ROUNDS_TO_WIN } from './state.js';
import { findWinner, isFull, isPlayable, findWinningMove, perfectPlayResult } from './board.js';
import { chooseMove, pickCheat, addFrustration, tickCooldowns } from './agent.js';
import { getCheat } from './cheats.js';
import { getPowerUp, canAfford } from './powerups.js';
import { addPoints, POINTS, QUICK_COUNTER_TURNS } from './scoring.js';
import { say } from './dialogue.js';
import { initRender } from './ui/render.js';
import { showStamp, spinBoardEffect, popPoints, createPeelSheet } from './ui/effects.js';

const OTTO_THINK_MS = 600;  // small pause so Otto's move doesn't feel instant
const TELEGRAPH_MS = 1100;  // how long the player has to catch a cheat
const SOLVED_PAUSE_MS = 2200; // time to read "this game is SOLVED" before the 1952 screen peels

// --- Timers ----------------------------------------------------------------
// `later` is setTimeout, but if the round/match was reset in the meantime the
// callback is ignored. (Otherwise an old Otto move could land on a new board!)
let generation = 0;
function later(ms, fn) {
  const myGeneration = generation;
  setTimeout(() => {
    if (myGeneration === generation) fn();
  }, ms);
}

// --- Player's turn -----------------------------------------------------------

function isPlayersTurn() {
  return state.turn === 'X' && !state.roundOver && !state.matchOver && !state.transitioning;
}

// Give the player points and show a "+N" pop.
function earn(amount) {
  addPoints(state, amount);
  popPoints(amount);
}

// The player clicked (or pressed Enter on) a square.
function onCellClick(index) {
  if (!isPlayersTurn()) return;

  // Clicking a minion flicks it off the board (that's the Flick power-up).
  if (state.board.minions[index]) {
    flickMinion(index);
    return;
  }

  // Flick mode is waiting for a minion: any other square is ignored.
  if (state.mode?.type === 'flick') {
    state.notice = 'Click a minion to flick it (Esc to cancel).';
    emit('change');
    return;
  }
  if (state.mode?.type === 'ownLinePick') return; // choose row/column in the tray first

  if (!isPlayable(state.board, index)) return; // square already taken

  // My Own Line: the free X must go in the new line, and doesn't use up the turn.
  if (state.mode?.type === 'ownLinePlace') {
    if (!state.mode.cells.includes(index)) return;
    state.mode = null;
    placeX(index);
    if (checkRoundEnd()) return;
    state.notice = 'Free X placed! Now make your normal move.';
    emit('change');
    return;
  }

  placeX(index);
  if (checkRoundEnd()) return;

  // Double Mark: the player gets to place another X before Otto moves.
  if (state.extraMarks > 0) {
    state.extraMarks--;
    state.notice = 'Double Mark! Place your second X.';
    emit('change');
    return;
  }

  endPlayerTurn();
}

// Put an X on the board and award points for it.
function placeX(index) {
  const ottoThreat = findWinningMove(state.board, 'O'); // was Otto about to win?
  state.board.cells[index] = 'X';
  state.notice = '';
  earn(POINTS.placeX);

  if (index === ottoThreat) {
    earn(POINTS.block);
    state.ottoSays = say('playerBlocks');
    if (state.round >= 2 && addFrustration(state, 5)) state.ottoSays = say('frustration');
  }
}

function endPlayerTurn() {
  // Lights Out wears off after a few player turns.
  if (state.lightsOut) {
    state.lightsOut.turnsLeft--;
    if (state.lightsOut.turnsLeft <= 0) {
      state.lightsOut = null;
      state.notice = 'The lights flicker back on.';
    }
  }

  // Frustration: the game heading for a draw bores Otto.
  if (
    state.round >= 2 &&
    state.board.rows === 3 &&
    state.board.cols === 3 &&
    perfectPlayResult(state.board, 'O') === 'draw'
  ) {
    if (addFrustration(state, 4)) state.ottoSays = say('frustration');
    else if (Math.random() < 0.3) state.ottoSays = say('bored');
  }

  state.turn = 'O';
  emit('change');
  later(OTTO_THINK_MS, ottoTurn);
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

  // Everything else happens immediately.
  pay(powerUp);
  powerUp.apply(state);
  state.notice = `${powerUp.name}! ${powerUp.help}`;
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

function cancelMode() {
  if (!state.mode || state.mode.type === 'ownLinePlace') return; // already paid: can't cancel
  state.mode = null;
  state.notice = '';
  emit('change');
}

// Which power-up started a mode?
function modeOwner(mode) {
  if (mode.type === 'flick') return 'flick';
  return 'myOwnLine';
}

function pay(powerUp) {
  state.points -= powerUp.cost;
  state.stats.powerUpsUsed++;
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
    state.ottoSays = say('cheatCountered');
    if (state.round >= 2 && addFrustration(state, 8)) state.ottoSays = say('frustration');
  }
  if (checkRoundEnd()) return; // e.g. Glue Stick gave back a winning X
  emit('change');
}

// --- Otto's turn -------------------------------------------------------------

function ottoTurn() {
  state.turnNumber++;
  tickCooldowns(state);
  if (state.spinBlockedTurns > 0) state.spinBlockedTurns--;

  // Time Out (a Milestone 3 power-up) makes Otto skip a turn.
  if (state.ottoSkipsNextTurn) {
    state.ottoSkipsNextTurn = false;
    state.ottoSays = say('skipTurn');
    endOttoTurn();
    return;
  }

  const cheat = pickCheat(state);
  if (!cheat) {
    ottoNormalMove();
    return;
  }

  // Telegraph: Otto wobbles and says "hehe…". The player can click Otto now.
  state.telegraph = cheat.id;
  state.ottoSays = say('telegraph');
  emit('change');

  later(TELEGRAPH_MS, () => {
    if (state.telegraph !== cheat.id) return; // the player caught it
    state.telegraph = null;
    runCheat(cheat);
  });
}

// The player clicked Otto (or pressed C).
function catchCheat() {
  if (!state.telegraph) return; // nothing to catch
  const cheat = getCheat(state.telegraph);
  state.telegraph = null;

  state.cooldowns[cheat.id] = cheat.cooldown; // a caught cheat still goes on cooldown
  state.stats.cheatsCaught++;
  addFrustration(state, 10);
  state.ottoSays = say('cheatCaught');
  state.notice = `CAUGHT! Otto was about to use ${cheat.name}.`;
  earn(POINTS.catchCheat);
  emit('change');
  showStamp('CAUGHT!');

  later(OTTO_THINK_MS + 300, ottoNormalMove); // a caught Otto has to play fair
}

function runCheat(cheat) {
  cheat.apply(state);
  state.cooldowns[cheat.id] = cheat.cooldown;
  state.lastCheat = { id: cheat.id, turnNumber: state.turnNumber };
  state.cheatLandedAt[cheat.id] = state.turnNumber;
  if (cheat.id === 'boardSpin') state.spinsToUndo++;
  state.stats.cheatsUsed++;
  state.ottoSays = say('cheatSucceeds');
  state.notice = `Otto cheated: ${cheat.name}! ${cheat.description}`;
  emit('change');
  if (cheat.id === 'boardSpin') spinBoardEffect();

  if (checkRoundEnd()) return;

  if (cheat.replacesMove) endOttoTurn(); // the cheat already placed Otto's mark(s)
  else later(OTTO_THINK_MS, ottoNormalMove);
}

function ottoNormalMove() {
  const index = chooseMove(state);
  if (index === undefined) return; // no squares left (shouldn't happen)
  state.board.cells[index] = 'O';
  if (checkRoundEnd()) return;
  endOttoTurn();
}

function endOttoTurn() {
  state.turn = 'X';
  emit('change');
}

// --- Round / match end -------------------------------------------------------

// Check for a win or a draw. Returns true if the round just ended.
function checkRoundEnd() {
  const winner = findWinner(state.board);

  if (winner) {
    state.roundResult = winner.mark;
    state.winLine = winner.line;
    if (winner.mark === 'X') {
      state.score.player++;
      earn(POINTS.winRound);
      addFrustration(state, 20);
      state.ottoSays = say('roundLost');
    } else {
      state.score.otto++;
      addFrustration(state, -25); // winning calms Otto down
      state.ottoSays = say('roundWon');
    }
  } else if (isFull(state.board)) {
    state.roundResult = 'draw'; // draws give nobody a round win
    if (state.round >= 2) addFrustration(state, 15);
    state.ottoSays = say('draw');
  } else {
    return false; // game continues
  }

  state.roundOver = true;
  state.telegraph = null;
  state.mode = null;
  state.lightsOut = null; // lights back on so the player can see the result

  // Did someone just win the whole match?
  if (state.score.player >= ROUNDS_TO_WIN) {
    state.matchOver = true;
    state.ottoSays = say('meltdown');
  } else if (state.score.otto >= ROUNDS_TO_WIN) {
    state.matchOver = true;
    state.ottoSays = say('matchWon');
  }

  emit('change');
  return true;
}

function startRound(roundNumber) {
  generation++; // cancel any of Otto's pending timers
  if (state.era === '1952') {
    leave1952(roundNumber);
    return;
  }
  state.round = roundNumber;
  resetRound();
  state.ottoSays = say('matchStart');
  emit('change');
}

// After round 1: Otto realises tic-tac-toe is solved, and the old 1952 screen
// glitches and peels away like a sticker, revealing the sticker-scrapbook world.
function leave1952(roundNumber) {
  state.transitioning = true;
  state.ottoSays = say('solved');
  emit('change'); // Otto says it on the old screen first

  later(SOLVED_PAUSE_MS, () => {
    // 1. Take a copy of the old screen and lay it over the page...
    const sheet = createPeelSheet(document.getElementById('app'));

    // 2. ...switch the real page to the new world underneath it...
    state.era = 'modern';
    state.round = roundNumber;
    resetRound();
    addFrustration(state, Math.max(0, 20 - state.frustration)); // Otto starts out bored
    emit('change');

    // 3. ...then glitch and peel the copy away.
    const myGeneration = generation;
    sheet.play().then(() => {
      if (myGeneration !== generation) return; // a new match started meanwhile
      state.transitioning = false;
      emit('change');
    });
  });
}

function playAgain() {
  generation++;
  resetMatch();
  state.ottoSays = say('matchStart');
  emit('change');
}

// --- Debug panel (open the game with ?debug in the URL) -----------------------
function debugAction(action, value) {
  if (state.transitioning) return;
  state.debug.message = '';
  if (action === 'force') {
    state.debug.forceCheat = value;
    state.debug.message = `Otto will try ${getCheat(value).name} on its next turn.`;
  } else if (action === 'round2') {
    if (state.matchOver) resetMatch();
    startRound(Math.max(2, state.round));
    return;
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
  onCellClick: onCellClick,
  onCatch: catchCheat,
  onPowerUp: activatePowerUp,
  onOwnLineChoice: chooseOwnLine,
  onCancel: cancelMode,
  onNextRound: () => startRound(state.round + 1),
  onPlayAgain: playAgain,
  onDebug: debugAction,
});
on('change', () => emit('render'));
playAgain(); // start the first match
