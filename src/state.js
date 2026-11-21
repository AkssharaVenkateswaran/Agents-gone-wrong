// state.js
// One single object holds everything about the current game.
// Other modules read it and change it, then call emit('change') so the UI redraws.

import { createBoard } from './board.js';

export const ROUNDS_TO_WIN = 3; // a match is first to 3 round wins

export const state = {
  screen: 'game',          // 'game' for now (title/end screens come in Milestone 5)
  board: createBoard(3, 3),
  round: 1,                // which round we are on (1, 2, 3, ...)
  score: { player: 0, otto: 0 },
  turn: 'X',               // whose turn it is: 'X' (player) or 'O' (Otto)
  roundOver: false,        // true once someone wins or the board is full
  roundResult: null,       // 'X', 'O' or 'draw'
  winLine: null,           // indices of the winning three squares (for highlighting)
  matchOver: false,        // true once someone reaches ROUNDS_TO_WIN
  ottoSays: '',            // text in Otto's speech bubble
};

// Reset everything for a brand-new match.
export function resetMatch() {
  state.round = 1;
  state.score = { player: 0, otto: 0 };
  state.matchOver = false;
  resetRound();
}

// Reset only the board for the next round (scores are kept).
export function resetRound() {
  state.board = createBoard(3, 3);
  state.turn = 'X';        // the player always moves first
  state.roundOver = false;
  state.roundResult = null;
  state.winLine = null;
}

// --- A tiny event emitter ---------------------------------------------
// on('change', fn) registers a listener, emit('change') calls all of them.
const listeners = {};

export function on(eventName, fn) {
  (listeners[eventName] ||= []).push(fn);
}

export function emit(eventName, data) {
  (listeners[eventName] || []).forEach((fn) => fn(data));
}
