// state.js
// One single object holds everything about the current game.
// Other modules read it and change it, then call emit('change') so the UI redraws.
//
// The whole match is ONE long round. It starts as classic 3x3 tic-tac-toe,
// then Otto starts rewriting the rules.

import { createBoard } from './board.js';
import { STARTING_POINTS } from './scoring.js';
import { defaultRules, FIRST_RULE_AT } from './rules.js';

export const MAX_TURNS = 30; // after 30 player turns the FINAL RULE decides the winner

export const state = {
  screen: 'title',         // 'title' (enter your name) or 'game'
  playerName: '',          // sent to Otto's memory (max 20 characters)
  session: { you: 0, otto: 0 }, // matches won since the page loaded (top bar score)
  muted: false,            // sound effects on/off

  board: createBoard(3, 3),
  turn: 'X',               // whose turn it is: 'X' (player) or 'O' (Otto)
  playerTurns: 0,          // how many turns the player has finished
  turnNumber: 0,           // counts Otto's turns (for cheat cooldowns)
  moveCount: 0,            // counts every mark ever placed (see board.stamp)
  ottoThinking: false,     // true while Otto "thinks" before moving
  matchOver: false,
  result: null,            // 'X', 'O' or 'draw' once the match is over
  ending: null,            // end-of-match sequence: 'crash' -> 'flip' -> 'banner'
  winLine: null,           // squares of the winning line(s), for highlighting
  finalRule: null,         // { x, o } line counts if the FINAL RULE decided the match
  ottoSays: '',            // text in Otto's speech bubble
  notice: '',              // the ONE message line under the monitor

  // --- Rules (Otto keeps rewriting them) ---
  rules: defaultRules(),   // the active rule in each category: { win, placement, twist }
  ruleHistory: [],         // replaced / vetoed / expired rules
  newestCategory: null,    // category of the newest rule (Veto targets it)
  lastRuleChange: null,    // { ruleId, rejected, by } — the latest change
  lastRuleChangeTurn: 0,   // playerTurns when a rule last changed
  ruleChangeStamp: 0,      // moveCount at the last rule change (older lines don't count)
  ottoGrace: false,        // Otto's next move can't win and it can't cheat (after a rule change)
  nextRuleAt: FIRST_RULE_AT, // the rules change when playerTurns reaches this
  amendmentPending: false, // Amendment bought: the player picks the next rule
  ruleScene: null,         // the NEW_RULE.EXE pop-up while a rule changes (inputs locked)
  blinkCategory: null,     // the Rule Book row that just got a new rule (blinks twice)
  highlight: null,         // squares showing an example of a new rule for 2 seconds
  turnDeadline: null,      // when the turn timer runs out (a Date.now() time)

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
  mode: null,              // power-up waiting for a click: { type: 'flick' | 'ownLinePick' | 'ownLinePlace', cells? }
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

// Reset everything for a brand-new match (the session score and name stay).
export function resetMatch() {
  Object.assign(state, {
    board: createBoard(3, 3),
    turn: 'X',             // the player always moves first
    playerTurns: 0,
    turnNumber: 0,
    moveCount: 0,
    ottoThinking: false,
    matchOver: false,
    result: null,
    ending: null,
    winLine: null,
    finalRule: null,
    notice: '',
    rules: defaultRules(),
    ruleHistory: [],
    newestCategory: null,
    lastRuleChange: null,
    lastRuleChangeTurn: 0,
    ruleChangeStamp: 0,
    ottoGrace: false,
    nextRuleAt: FIRST_RULE_AT,
    amendmentPending: false,
    ruleScene: null,
    blinkCategory: null,
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
