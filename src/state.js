// state.js
// One single object holds everything about the current game.
// Other modules read it and change it, then call emit('change') so the UI redraws.
//
// The whole match is ONE long round. It starts as classic 3x3 tic-tac-toe
// (shown in the 1952 style), then Otto starts rewriting the rules.

import { createBoard } from './board.js';
import { STARTING_POINTS } from './scoring.js';
import { defaultRules } from './rules.js';

export const MAX_TURNS = 30;   // after 30 player turns the FINAL RULE decides the winner
export const RULE_EVERY = 4;   // Otto rewrites a rule every 4 player turns

export const state = {
  screen: 'title',         // 'title' (enter your name) or 'game'
  playerName: '',          // shown to Otto's memory (max 20 characters)
  era: '1952',             // '1952' = the opening, styled like OXO on the EDSAC; 'modern' = sticker scrapbook
  transitioning: false,    // true while the 1952 screen glitches and peels away (input is blocked)
  board: createBoard(3, 3),
  turn: 'X',               // whose turn it is: 'X' (player) or 'O' (Otto)
  playerTurns: 0,          // how many turns the player has finished
  turnNumber: 0,           // counts Otto's turns (for cheat cooldowns)
  matchOver: false,
  result: null,            // 'X', 'O' or 'draw' once the match is over
  winLine: null,           // squares of the winning line(s), for highlighting
  finalRule: null,         // { x, o } line counts if the FINAL RULE decided the match
  ottoSays: '',            // text in Otto's speech bubble
  notice: '',              // short line under the board explaining what just happened

  // --- Rules (Otto keeps rewriting them) ---
  rules: defaultRules(),   // the active rule in each category: { win, placement, twist }
  ruleHistory: [],         // replaced / vetoed / expired rules (shown crossed out)
  newestCategory: null,    // category of the newest rule (gets the NEW! label; Veto targets it)
  lastRuleChange: null,    // { ruleId, rejected, by } — the latest change, for the Rule Book
  lastRuleChangeTurn: -99, // playerTurns when a rule last changed (for the +3 bonus)
  nextRuleAt: RULE_EVERY,  // Otto's next scheduled rewrite happens after this many player turns
  ruleTelegraph: false,    // true while the Rule Book shakes before a change
  highlight: null,         // squares lit up for 2 seconds after a rule change
  turnDeadline: null,      // when the 5-second timer runs out (a Date.now() time)

  // --- Cheating ---
  frustration: 0,          // 0-100. Higher = Otto cheats more often and nastier
  telegraph: null,         // id of the cheat Otto is ABOUT to do (catch window open)
  cooldowns: {},           // cheat id -> Otto turns left before it can be reused
  lastCheat: null,         // { id, turnNumber } of the last cheat that landed
  lightsOut: null,         // { turnsLeft } while the lights are off
  addedLines: [],          // rows/cols added by Extra Line / My Own Line: { owner, type, index }
  ottoSkipsNextTurn: false,// set by Time Out
  spinBlockedTurns: 0,     // Board Spin is blocked while this is above 0 (Paperweight)
  cheatLandedAt: {},       // cheat id -> Otto turn it landed on (for the quick-counter bonus)
  spinsToUndo: 0,          // Board Spins that haven't been undone yet (Paperweight)

  // --- Points & power-ups ---
  points: STARTING_POINTS,
  mode: null,              // power-up waiting for a click:
                           //   { type: 'flick' | 'ownLinePick' | 'ownLinePlace' | 'amend', cells?, cards? }
  extraMarks: 0,           // Double Mark: extra X marks left to place this turn

  stats: newStats(),

  // --- What happened this match (saved to Otto's memory in Snowflake) ---
  log: newLog(),
  // --- Otto's memory: stats from Snowflake, via our API ---
  memory: { status: 'idle', stats: null }, // status: 'idle' | 'loading' | 'ready' | 'offline'

  // Debug panel: open the game with ?debug in the URL.
  debug: {
    enabled: new URLSearchParams(location.search).has('debug'),
    forceCheat: null,      // id of a cheat Otto MUST try on its next turn
    message: '',
  },
};

function newLog() {
  return { firstMove: null, cheatsUsed: [], cheatsCaught: [], powerupsUsed: [], saved: false };
}

function newStats() {
  return { cheatsUsed: 0, cheatsCaught: 0, powerUpsUsed: 0, pointsEarned: 0, rulesChanged: 0 };
}

// Reset everything for a brand-new match.
export function resetMatch() {
  Object.assign(state, {
    era: '1952',
    transitioning: false,
    board: createBoard(3, 3),
    turn: 'X',             // the player always moves first
    playerTurns: 0,
    turnNumber: 0,
    matchOver: false,
    result: null,
    winLine: null,
    finalRule: null,
    notice: '',
    rules: defaultRules(),
    ruleHistory: [],
    newestCategory: null,
    lastRuleChange: null,
    lastRuleChangeTurn: -99,
    nextRuleAt: RULE_EVERY,
    ruleTelegraph: false,
    highlight: null,
    turnDeadline: null,
    frustration: 0,
    telegraph: null,
    cooldowns: {},
    lastCheat: null,
    lightsOut: null,
    addedLines: [],
    ottoSkipsNextTurn: false,
    spinBlockedTurns: 0,
    cheatLandedAt: {},
    spinsToUndo: 0,
    points: STARTING_POINTS,
    mode: null,
    extraMarks: 0,
    stats: newStats(),
    log: newLog(),
  });
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
