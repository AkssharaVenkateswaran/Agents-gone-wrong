// main.js
// Boots the game and runs the turn loop:
//
//   player clicks a square -> place X -> check for win/draw
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
import { say } from './dialogue.js';
import { initRender } from './ui/render.js';
import { showStamp, spinBoardEffect } from './ui/effects.js';

const OTTO_THINK_MS = 600;  // small pause so Otto's move doesn't feel instant
const TELEGRAPH_MS = 1100;  // how long the player has to catch a cheat

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

function playerMove(index) {
  if (state.turn !== 'X' || state.roundOver || state.matchOver) return;
  if (!isPlayable(state.board, index)) return; // taken, or a minion is there

  const ottoThreat = findWinningMove(state.board, 'O'); // was Otto about to win?
  state.board.cells[index] = 'X';
  state.notice = '';

  // Lights Out wears off after a few player turns.
  if (state.lightsOut) {
    state.lightsOut.turnsLeft--;
    if (state.lightsOut.turnsLeft <= 0) {
      state.lightsOut = null;
      state.notice = 'The lights flicker back on.';
    }
  }

  if (checkRoundEnd()) return;

  // Frustration: blocking Otto, or the game heading for a draw, annoys Otto.
  if (state.round >= 2) {
    let crossedLevel = false;
    if (index === ottoThreat) {
      crossedLevel = addFrustration(state, 5);
      state.ottoSays = say('playerBlocks');
    } else if (
      state.board.rows === 3 &&
      state.board.cols === 3 &&
      perfectPlayResult(state.board, 'O') === 'draw'
    ) {
      crossedLevel = addFrustration(state, 4);
      if (Math.random() < 0.3) state.ottoSays = say('bored');
    }
    if (crossedLevel) state.ottoSays = say('frustration');
  }

  state.turn = 'O';
  emit('change');
  later(OTTO_THINK_MS, ottoTurn);
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
  emit('change');
  showStamp('CAUGHT!');

  later(OTTO_THINK_MS + 300, ottoNormalMove); // a caught Otto has to play fair
}

function runCheat(cheat) {
  cheat.apply(state);
  state.cooldowns[cheat.id] = cheat.cooldown;
  state.lastCheat = { id: cheat.id, turnNumber: state.turnNumber };
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
  const wasRoundOne = state.round === 1 && roundNumber === 2;
  state.round = roundNumber;
  resetRound();
  if (wasRoundOne) {
    // Otto realises tic-tac-toe is solved and decides to start cheating.
    addFrustration(state, Math.max(0, 20 - state.frustration));
    state.ottoSays = say('solved');
  } else {
    state.ottoSays = say('matchStart');
  }
  emit('change');
}

function playAgain() {
  generation++;
  resetMatch();
  state.ottoSays = say('matchStart');
  emit('change');
}

// --- Debug panel (open the game with ?debug in the URL) -----------------------
function debugAction(action, value) {
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
  } else if (action === 'cooldowns') {
    state.cooldowns = {};
  }
  emit('change');
}

// --- Boot ------------------------------------------------------------------
initRender(document.getElementById('app'), {
  onCellClick: playerMove,
  onCatch: catchCheat,
  onNextRound: () => startRound(state.round + 1),
  onPlayAgain: playAgain,
  onDebug: debugAction,
});
on('change', () => emit('render'));
playAgain(); // start the first match
