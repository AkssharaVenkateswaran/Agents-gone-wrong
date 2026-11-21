// state.js
// One single object holds everything about the current game.
// Other modules read it and change it, then call emit('change') so the UI redraws.
//
// A MATCH is made of ROUNDS. The player wins the match by draining Otto's
// patience from 100 to 0 (Otto loses a round: -35, Otto wins a round: +10).
// Otto wins the match by winning 3 rounds first. After each round the board
// resets; patience, points and power-ups carry over.

import { createBoard } from './board.js';
import { STARTING_POINTS } from './scoring.js';
import { defaultRules, FIRST_RULE_AT } from './rules.js';

export const ROUND_TURN_CAP = 20;   // after 20 player turns in a round: SUDDEN DEATH (most lines of 3)
export const OTTO_ROUNDS_TO_WIN = 3; // Otto wins the match by winning 3 rounds

export const state = {
  screen: 'title',         // 'title' (enter your name) or 'game'
  playerName: '',          // sent to Otto's memory (max 20 characters)
  muted: false,            // all sound off
  calm: false,             // Calm mode: the "unhinged" chaos effects are switched off
  debug: {
    // (`location` only exists in the browser, not in the test scripts)
    enabled: typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'),
    forceCheat: null,      // id of a cheat Otto MUST try on its next turn
    message: '',
  },
  ...freshMatchState(),
};

function newLog() {
  return { firstMove: null, cheatsUsed: [], cheatsCaught: [], powerupsUsed: [], saved: false };
}

function newStats() {
  return { cheatsUsed: 0, cheatsCaught: 0, powerUpsUsed: 0, pointsEarned: 0, rulesChanged: 0 };
}

// Everything that lasts the whole match.
export function freshMatchState() {
  return {
    patience: 100,          // Otto's patience: the player wins by draining it to 0
    frustration: 0,         // always 100 - patience (Otto gets sharper as it rises)
    roundNumber: 1,
    roundsWon: { you: 0, otto: 0 },
    totalTurns: 0,          // player turns across all rounds (saved to Snowflake)
    announcedStage: 0,      // the last chaos stage Otto announced
    points: STARTING_POINTS,
    stats: newStats(),
    log: newLog(),          // what happened this match (saved to Otto's memory in Snowflake)
    memory: { status: 'idle', stats: null }, // Otto's memory: 'idle' | 'loading' | 'ready' | 'offline'
    matchOver: false,
    result: null,           // 'X' (patience drained) or 'O' (Otto won 3 rounds)
    ending: null,           // 'banner' when the Otto-wins screen shows
    rampage: null,          // the rampage ending: { phase }
    ...freshRoundState(1),
  };
}

// Everything that resets at the start of each round.
// Round 1 (the tutorial round): 4x4 with 4 in a row. Rounds 2+: 5x5 with 4 in a row.
export function freshRoundState(roundNumber) {
  const size = roundNumber === 1 ? 4 : 5;
  return {
    roundNumber,
    tutorial: roundNumber === 1, // Otto's threats are pointed out
    board: createBoard(size, size),
    turn: 'X',             // the player always moves first
    playerTurns: 0,        // player turns finished in this round
    turnNumber: 0,         // Otto's turns in this round (cheat cooldowns and spacing)
    moveCount: 0,          // every mark placed this round (see board.stamp)
    ottoThinking: false,
    ottoTurnStartedAt: 0,  // when Otto's current turn began (for the monitor's nudge/shudder)
    roundOver: false,
    roundEnd: null,        // the ROUND_END.EXE pop-up: { winner, change, suddenDeath }
    winLine: null,         // squares of the winning line(s), for highlighting
    suddenDeath: null,     // { x, o } line counts if SUDDEN DEATH decided the round
    ottoSays: '',          // text in Otto's speech bubble
    notice: '',            // the ONE message line under the monitor

    // --- Rules (Otto keeps rewriting them) ---
    rules: defaultRules(), // the active rule in each category: { win, placement, twist }
    ruleHistory: [],       // replaced / vetoed / expired rules
    newestCategory: null,  // category of the newest rule (Veto targets it)
    lastRuleChange: null,  // { ruleId, rejected, by } — the latest change
    lastRuleChangeTurn: 0, // playerTurns when a rule last changed
    roundRuleChanges: 0,   // rule changes so far this round (Otto plays fair until the first)
    ruleChangeStamp: 0,    // moveCount at the last rule change (older lines don't count)
    ottoGrace: false,      // Otto's next move can't win and it can't cheat (after a rule change)
    nextRuleAt: FIRST_RULE_AT, // the rules change when playerTurns reaches this
    ruleDelayed: false,    // no safe rule was possible, so the change was postponed
    amendmentPending: false, // Amendment bought: the player picks the next rule
    ruleScene: null,       // the NEW_RULE.EXE pop-up while a rule changes (inputs locked)
    blinkCategory: null,   // the Rule Book row that just got a new rule (blinks twice)
    highlight: null,       // squares showing an example of a new rule for 2 seconds
    threatCells: null,     // tutorial: squares where Otto is about to win
    turnDeadline: null,    // when the turn timer runs out (a Date.now() time)

    // --- Cheating ---
    telegraph: null,       // id of the cheat Otto is ABOUT to do (catch window open)
    cooldowns: {},         // cheat id -> Otto turns left before it can be reused
    lastCheat: null,       // { id, turnNumber } of the last cheat that landed
    lastCheatTry: -99,     // Otto turn of the last cheat attempt (max 1 cheat per 3 Otto turns)
    lightsOut: null,       // { turnsLeft } while the lights are off
    addedLines: [],        // rows/cols added by Extra Line / My Own Line: { owner, type, index }
    ottoSkipsNextTurn: false, // set by Time Out
    spinBlockedTurns: 0,   // Board Spin is blocked while this is above 0 (Paperweight)
    cheatLandedAt: {},     // cheat id -> Otto turn it landed on (for the quick-counter bonus)
    spinsToUndo: 0,        // Board Spins that haven't been undone yet (Paperweight)

    // --- Power-ups in use ---
    mode: null,            // power-up waiting for a click: { type: 'flick' | 'ownLinePick' | 'ownLinePlace', cells? }
    extraMarks: 0,         // Double Mark: extra X marks left to place this turn
  };
}

// Start a brand-new match (the name and settings stay).
export function resetMatch() {
  Object.assign(state, freshMatchState());
}

// Start the next round (patience, points and power-ups carry over).
export function startNextRound() {
  Object.assign(state, freshRoundState(state.roundNumber + 1));
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
