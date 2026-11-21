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
  turnNumber: 0,           // counts Otto's turns in the match (for cooldowns)
  roundOver: false,        // true once someone wins or the board is full
  roundResult: null,       // 'X', 'O' or 'draw'
  winLine: null,           // indices of the winning three squares (for highlighting)
  matchOver: false,        // true once someone reaches ROUNDS_TO_WIN
  ottoSays: '',            // text in Otto's speech bubble
  notice: '',              // short line under the board explaining what just happened

  // --- Cheating (Milestone 2) ---
  frustration: 0,          // 0-100. Higher = Otto cheats more often and nastier
  telegraph: null,         // id of the cheat Otto is ABOUT to do (catch window open)
  cooldowns: {},           // cheat id -> Otto turns left before it can be reused
  lastCheat: null,         // { id, turnNumber } of the last cheat that landed
  lightsOut: null,         // { turnsLeft } while the lights are off
  addedLines: [],          // rows/cols added to the grid: { owner: 'O'|'X', type: 'row'|'col', index }
  ottoSkipsNextTurn: false,// set by the Double Move counter (Time Out)
  spinBlockedTurns: 0,     // Board Spin is blocked while this is above 0 (Paperweight)
  stats: { cheatsUsed: 0, cheatsCaught: 0 },

  // Debug panel: open the game with ?debug in the URL to force cheats.
  debug: {
    enabled: new URLSearchParams(location.search).has('debug'),
    forceCheat: null,      // id of a cheat Otto MUST try on its next turn
    message: '',
  },
};

// Reset everything for a brand-new match.
export function resetMatch() {
  state.round = 1;
  state.score = { player: 0, otto: 0 };
  state.matchOver = false;
  state.turnNumber = 0;
  state.frustration = 0;
  state.cooldowns = {};
  state.lastCheat = null;
  state.stats = { cheatsUsed: 0, cheatsCaught: 0 };
  resetRound();
}

// Reset only the board for the next round (scores, frustration and cooldowns are kept).
export function resetRound() {
  state.board = createBoard(3, 3);
  state.turn = 'X';        // the player always moves first
  state.roundOver = false;
  state.roundResult = null;
  state.winLine = null;
  state.notice = '';
  state.telegraph = null;
  state.lightsOut = null;
  state.addedLines = [];
  state.ottoSkipsNextTurn = false;
  state.spinBlockedTurns = 0;
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
