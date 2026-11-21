// main.js
// Boots the game and runs the turn loop:
//   player clicks a square -> place X -> check for win/draw
//   -> Otto "thinks" for a moment -> place O -> check for win/draw -> repeat.

import './styles.css';
import { state, on, emit, resetMatch, resetRound, ROUNDS_TO_WIN } from './state.js';
import { findWinner, isFull } from './board.js';
import { chooseMove } from './agent.js';
import { say } from './dialogue.js';
import { initRender } from './ui/render.js';

const OTTO_THINK_MS = 600; // small pause so Otto's move doesn't feel instant

// Called by the UI when the player clicks (or presses Enter on) a square.
function playerMove(index) {
  if (state.turn !== 'X' || state.roundOver || state.matchOver) return;
  if (state.board.cells[index] !== null) return; // square already taken

  state.board.cells[index] = 'X';
  if (checkRoundEnd()) return;

  state.turn = 'O';
  emit('change');
  setTimeout(ottoMove, OTTO_THINK_MS);
}

function ottoMove() {
  if (state.roundOver || state.matchOver) return;

  const index = chooseMove(state);
  state.board.cells[index] = 'O';
  if (checkRoundEnd()) return;

  state.turn = 'X';
  emit('change');
}

// Check for a win or a draw. Returns true if the round just ended.
function checkRoundEnd() {
  const winner = findWinner(state.board);

  if (winner) {
    state.roundOver = true;
    state.roundResult = winner.mark;
    state.winLine = winner.line;
    if (winner.mark === 'X') {
      state.score.player++;
      state.ottoSays = say('roundLost');
    } else {
      state.score.otto++;
      state.ottoSays = say('roundWon');
    }
  } else if (isFull(state.board)) {
    state.roundOver = true;
    state.roundResult = 'draw'; // draws give nobody a round win
    state.ottoSays = say('draw');
  } else {
    return false; // game continues
  }

  // Did someone just win the whole match?
  if (state.score.player >= ROUNDS_TO_WIN) {
    state.matchOver = true;
    state.ottoSays = say('matchLost');
  } else if (state.score.otto >= ROUNDS_TO_WIN) {
    state.matchOver = true;
    state.ottoSays = say('matchWon');
  }

  emit('change');
  return true;
}

function nextRound() {
  // After round 1 Otto realises tic-tac-toe is solved (cheating starts in Milestone 2).
  const wasRoundOne = state.round === 1;
  state.round++;
  resetRound();
  state.ottoSays = wasRoundOne ? say('solved') : say('matchStart');
  emit('change');
}

function playAgain() {
  resetMatch();
  state.ottoSays = say('matchStart');
  emit('change');
}

// --- Boot ------------------------------------------------------------------
initRender(document.getElementById('app'), {
  onCellClick: playerMove,
  onNextRound: nextRound,
  onPlayAgain: playAgain,
});
on('change', () => emit('render'));
playAgain(); // start the first match
