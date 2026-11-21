// main.js
// Boots the game and runs a MATCH made of ROUNDS:
//
//   each round:
//     START of the player's turn: if it's time, the RULES CHANGE (a NEW_RULE.EXE
//       pop-up; inputs locked) — only to a rule that can't cause an instant win
//     player's turn: click a square (following the current rules) or use power-ups
//     -> Otto's turn: wait 400ms, "think" for 1.2-1.8s, maybe TELEGRAPH a cheat
//          (the player can click Otto to catch it), then a normal move
//     -> until someone makes a line under the CURRENT win rule, or SUDDEN DEATH
//        (most lines of 3) after 20 player turns
//   after each round: Otto loses a round -35 patience, wins a round +10, draw 0.
//   The player wins the match by draining Otto's patience to 0 (the RAMPAGE ending);
//   Otto wins the match by winning 3 rounds first.

import './styles.css';
import { state, on, emit, resetMatch, startNextRound, ROUND_TURN_CAP, OTTO_ROUNDS_TO_WIN } from './state.js';
import { emptyCells, addRow, addColumn, linesOf, LINE_LENGTH } from './board.js';
import {
  chooseMove,
  pickCheat,
  commitCheat,
  tickCooldowns,
  setPatience,
  stageOf,
  PATIENCE_LOST_ROUND,
  PATIENCE_WON_ROUND,
  PATIENCE_DRAW,
  PATIENCE_CAUGHT,
} from './agent.js';
import { getCheat } from './cheats.js';
import { getPowerUp, canAfford } from './powerups.js';
import { addPoints, POINTS, QUICK_COUNTER_TURNS, RULE_BONUS_TURNS } from './scoring.js';
import {
  MAX_BOARD,
  RULE_EVERY,
  TIMER_SECONDS,
  getRule,
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
import {
  ottoRewriteRules,
  findWinningSquare,
  winningSquares,
  safeRuleIds,
  expiryIsSafe,
  pickSome,
} from './ai.js';
import { say, sayRule, sayFromMemory, sayCatchRate, shout, RAMPAGE_LINES } from './dialogue.js';
import { fetchStats, saveMatch, fetchTactics } from './memory.js';
import { cheatReasoning, ruleReasoning } from './tactics.js';
import { termLog, cellName, panicLine, scanResult } from './terminal.js';
import { FIRST_MOVES, cleanName } from './matchLog.js';
import { sfx, setMuted, setDetune, startBuzz, stopBuzz, staticNoise } from './sfx.js';
import {
  startMusic,
  setStage as setMusicStage,
  setPatience as setMusicPatience,
  setCalm as setMusicCalm,
  musicEvent,
  setMusicEnabled,
  setMusicMuted,
  setMusicStageOverride,
} from './music.js';
import { initRender, updateTurnTimer, ruleRowPosition } from './ui/render.js';
import { performMove, performCheat, performTelegraph, performRuleRewrite, performSabotage } from './ui/performances.js';
import { initOttoCursor, setCursorPatience, slap, park } from './ui/ottoCursor.js';
import { initSwarm, clearSwarm, spawnMinion } from './ui/swarm.js';
import { initGlitch, glitchBurst } from './ui/glitch.js';
import { initTv, tvInterference } from './ui/tv.js';
import {
  showPopup,
  spinBoardEffect,
  popPoints,
  initChaos,
  tearBoard,
  spawnFakePopups,
  clearFakePopups,
  setTabGone,
  restoreTab,
} from './ui/effects.js';

const PLAYER_TO_OTTO_MS = 400;    // pause after the player's move before Otto starts thinking
const THINK_MIN_MS = 1200;        // Otto "thinks" for 1.2-1.8 seconds before every move
const THINK_EXTRA_MS = 600;
const TELEGRAPH_MS = 1100;        // how long the player has to catch a cheat
const RULE_AUTO_OK_MS = 4000;     // the NEW_RULE.EXE pop-up continues by itself after 4s
const RULE_MINIMISE_MS = 600;     // the pop-up shrinks into the Rule Book
const RULE_EXAMPLE_MS = 2000;     // a 2-second example of the new rule on the board
const ROUND_END_AUTO_MS = 6000;   // the ROUND_END.EXE pop-up continues by itself after 6s
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
const stage = () => stageOf(state.patience);

// Give the player points and show a "+N" pop.
function earn(amount) {
  addPoints(state, amount);
  popPoints(amount);
}

// Otto says something. From the Unhinged stage on, it sometimes SHOUTS.
function talk(text) {
  state.ottoSays = !state.calm && stage() >= 2 && Math.random() < 0.3 ? shout(text) : text;
}

// Otto's mood for a few seconds (defeated, victorious, glitching, bored...), see emotions.js.
function setTempMood(mood, ms) {
  const tempMood = { mood, until: Date.now() + ms };
  state.tempMood = tempMood;
  emit('change');
  setTimeout(() => {
    if (state.tempMood === tempMood) {
      state.tempMood = null;
      emit('change');
    }
  }, ms);
}

// A calm Otto (patience above 75) gets bored if the player is slow or the board fills up.
const BORED_AFTER_MS = 8000;
let boredTimer = null;
function watchForBoredom() {
  clearTimeout(boredTimer);
  if (state.patience <= 75) return;
  const filled = state.board.cells.filter(Boolean).length / state.board.cells.length;
  if (filled > 0.7) setTempMood('bored', 2000);
  const turn = state.totalTurns;
  boredTimer = setTimeout(() => {
    if (isPlayersTurn() && state.totalTurns === turn && state.patience > 75) {
      talk(say('bored'));
      setTempMood('bored', 2500);
    }
  }, BORED_AFTER_MS);
}

// Was a rule changed within the last 2 player turns? (For the +3 rule bonus.)
function soonAfterRuleChange() {
  return state.roundRuleChanges > 0 && state.playerTurns - state.lastRuleChangeTurn < RULE_BONUS_TURNS;
}

// --- Player's turn -----------------------------------------------------------

function isPlayersTurn() {
  return (
    state.turn === 'X' && !state.roundOver && !state.matchOver && !state.ruleScene && state.screen === 'game'
  );
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
    if (checkRoundEnd('X')) return;
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
  if (checkRoundEnd('X')) return;

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

// Which ninth of the board a square is in, named like the 3x3 squares (for Otto's memory).
function regionName(index) {
  const { rows, cols } = state.board;
  const r = Math.min(2, Math.floor((Math.floor(index / cols) * 3) / rows));
  const c = Math.min(2, Math.floor(((index % cols) * 3) / cols));
  return FIRST_MOVES[r * 3 + c];
}

// Place the player's X (with Mirror etc.) and award points.
function playerPlace(landing) {
  // Was Otto about to make a line here? (On Reverse day lines are bad, so no blocking.)
  const ottoThreat = isReverseDay(state) ? -1 : findWinningSquare(state, 'O');
  if (!state.log.firstMove) state.log.firstMove = regionName(landing); // remembered by Otto's memory
  placeMove(state, landing, 'X');
  sfx.place();
  state.notice = '';
  state.threatCells = null;
  earn(POINTS.placeX);

  if (landing === ottoThreat) {
    earn(POINTS.block);
    if (soonAfterRuleChange()) earn(POINTS.ruleBonus);
    talk(say('playerBlocks')); // (blocking doesn't change patience; only round results do)
  }
}

function endPlayerTurn() {
  stopTurnTimer();
  state.mode = null;
  state.extraMarks = 0;
  state.playerTurns++;
  state.totalTurns++;

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

  // At the Meltdown stage Otto gets desperate.
  if (stage() === 3 && Math.random() < 0.25) talk(say('desperate'));

  if (state.playerTurns >= ROUND_TURN_CAP) {
    suddenDeath();
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

  // Reverse day only lasts a few turns (but it waits a turn if ending now would
  // let someone win instantly).
  const twist = state.rules.twist;
  if (twist.expiresAtTurn && currentTurn(state) >= twist.expiresAtTurn && !expiryIsSafe(state)) {
    twist.expiresAtTurn++;
  }
  if (expireRules(state)) {
    noteRules();
    talk(say('ruleExpired'));
    state.notice = 'Reverse day is over. Lines win again.';
  }

  if (state.playerTurns >= state.nextRuleAt) {
    if (!(await ruleChangeScene())) return;
    if (checkRoundEnd(null)) return; // e.g. the board is full
  } else if (state.nextRuleAt - state.playerTurns === 1) {
    // One turn of warning before the rules change.
    talk(state.stats.rulesChanged === 0 ? say('solved') : say('ruleTelegraph'));
  }

  // Tutorial (round 1 only): point out where Otto is about to win.
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
  watchForBoredom();
  park(); // Otto's cursor waits in the corner during the player's turn
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
    noteRules();
    state.notice = `Vetoed "${getRule(vetoedId).name}". Back to "${restored.name}".`;
    talk(say('vetoed'));
    showExample(restored.id);
    showPopup('VETOED!');
  } else if (id === 'amendment') {
    powerUp.apply(state);
    state.notice = 'Amendment ready: YOU pick the next rule when the rules change.';
    talk(say('amended'));
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
    if (powerUp.id !== 'veto') talk(say('cheatCountered'));
  }
  if (checkRoundEnd('X')) return; // e.g. Glue Stick gave back a winning X
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

// The player pressed [ OK ] (or picked an Amendment card, or [NEXT ROUND]).
let resolveClick = null;
function onRuleOk(ruleId) {
  if (resolveClick) resolveClick(ruleId);
}
const waitForClick = () => new Promise((resolve) => (resolveClick = resolve));

// The rule change, step by step (inputs are locked the whole time):
//   1. the board dims and NEW_RULE.EXE pops up over the monitor
//   2. [ OK ], or it continues by itself after 4 seconds
//   3. the pop-up minimises into its row in RULES.TXT, which blinks twice
//   4. a 2-second example of the rule on the board
//   5. then it's the player's turn
// Only rules that can't cause an instant win or loss are used; if there is none,
// the change waits a turn ("NEW RULE DELAYED").
// Returns false if the match was reset meanwhile.
async function ruleChangeScene() {
  const safe = safeRuleIds(state);
  if (safe.length === 0) {
    state.nextRuleAt = state.playerTurns + 1;
    state.ruleDelayed = true;
    return true;
  }
  stopTurnTimer();
  state.ruleDelayed = false;
  state.nextRuleAt = state.playerTurns + RULE_EVERY;

  let change;
  if (state.amendmentPending) {
    // Amendment: the player picks from 3 (safe) cards.
    state.amendmentPending = false;
    const cards = pickSome(safe, 3);
    state.ruleScene = { phase: 'pick', cards };
    talk(say('amended'));
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
    if (!picked) return true;
    change = { ...picked, oldId: before[getRule(picked.ruleId).category].ruleId };
    // Otto's cursor opens RULES.TXT, deletes the old rule and types the new one.
    if (picked.dataDriven) logReasoning(ruleReasoning(state.tactics, getRule(picked.ruleId)));
    termLog(state, ruleCommand(picked.ruleId), 'rule updated. good luck, human.');
    const typing = generation;
    const category = getRule(picked.ruleId).category;
    await performRuleRewrite(category, getRule(change.oldId).name, getRule(picked.ruleId).name, (text, selected) => {
      state.ruleTyping = { category, text, selected };
      const el = document.querySelector(`.rule-row[data-category="${category}"] .rule-name`);
      if (el) {
        el.textContent = text;
        el.classList.toggle('selected', selected);
      }
    }, sfx.click);
    state.ruleTyping = null;
    if (typing !== generation) return false;
    sfx.rule();
  }
  state.lastRuleChange = change;

  // 1-2. Show the pop-up; wait for [ OK ] or 4 seconds.
  noteRules();
  musicEvent('ruleChange'); // record scratch, then bass only while the pop-up is open
  tvBurst('rule'); // the background fizzes while NEW_RULE.EXE pops up
  state.ruleScene = { phase: 'show', change };
  talk(sayRule(change.ruleId));
  state.notice = '';
  emit('change');
  const myGeneration = generation;
  await Promise.race([waitForClick(), pause(RULE_AUTO_OK_MS)]);
  if (myGeneration !== generation) return false;

  // 3. Minimise into the Rule Book (the music comes back on the next downbeat).
  musicEvent('ruleOk');
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
  state.ottoTurnStartedAt = Date.now(); // the monitor nudges / shudders (see render.js)
  glitchBurst({ ottoTurn: true }); // the madder Otto is, the more its turns glitch
  tickCooldowns(state);
  if (state.spinBlockedTurns > 0) state.spinBlockedTurns--;

  // Time Out makes Otto skip a turn.
  if (state.ottoSkipsNextTurn) {
    state.ottoSkipsNextTurn = false;
    talk(say('skipTurn'));
    emit('change');
    if (!(await pause(THINK_MIN_MS))) return;
    endOttoTurn();
    return;
  }

  // Otto thinks: eyes look around, dots in its bubble — and it scans the board.
  state.ottoThinking = true;
  const reverse = isReverseDay(state);
  termLog(state, 'scan --board', scanResult(state, reverse ? [] : winningSquares(state, 'O'), reverse ? [] : winningSquares(state, 'X')));
  if (stage() === 3 && !state.calm && Math.random() < 0.35) termLog(state, ...panicLine());
  emit('change');
  if (!(await pause(THINK_MIN_MS + Math.random() * THINK_EXTRA_MS))) return;
  state.ottoThinking = false;

  // Unhinged or worse: now and then Otto's cursor messes with the interface
  // (cosmetic only, never on the player's turn, at most once every 3 Otto turns).
  if (!(await maybeSabotage())) return;

  // A cheat (rarely: never early, at most 1 per 3 turns, never one that decides the round).
  const picked = pickCheat(state);
  if (picked) {
    const { cheat, trial, dataDriven } = picked;
    state.lastCheatTry = state.turnNumber;
    // Telegraph: Otto's screen flickers ">:)". The player can click Otto now.
    state.telegraph = cheat.id;
    talk(say(cheat.id === 'rewriteRules' ? 'ruleTelegraph' : 'telegraph'));
    // Sometimes Otto brags with a real stat: "Only 23% of humans catch my Mark Steal."
    const brag = sayCatchRate(state.memory.stats, cheat.id, cheat.name);
    if (brag && Math.random() < 0.4) state.ottoSays = brag;
    // If everyone's games shaped this pick, Otto's terminal shows its reasoning.
    if (dataDriven) logReasoning(cheatReasoning(state.tactics, cheat));
    termLog(state, ...cheatCommand(cheat, trial));
    emit('change');
    // Meanwhile Otto's cursor visibly heads for its target.
    performTelegraph(cheat, state, trial);
    if (!(await pause(TELEGRAPH_MS))) return;

    if (state.telegraph === cheat.id) {
      state.telegraph = null;
      if (!(await runCheat(cheat, trial))) return;
      if (state.roundOver) return;
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

  await ottoNormalMove();
}

// The terminal command for a rule change, e.g. rules.rewrite --win=5.
function ruleCommand(ruleId) {
  const flags = {
    three: '--win=3', four: '--win=4', five: '--win=5', noDiagonals: '--win=straight', onlyDiagonals: '--win=diagonal',
    gravity: '--place=gravity', lava: '--place=lava', touch: '--place=touch',
    fade: '--twist=fade', mirror: '--twist=mirror', timer: '--twist=timer', reverse: '--twist=reverse',
  };
  return `rules.rewrite ${flags[ruleId] || `--rule=${ruleId}`}`;
}

// Reasoning text "OTTO@AGENT:~$ command\n> result" -> a terminal entry.
function logReasoning(text) {
  const [command, result] = text.split('\n');
  termLog(state, command.replace('OTTO@AGENT:~$ ', ''), result.replace(/^> /, ''));
}

// The terminal command for each cheat (what Otto is about to do).
function cheatCommand(cheat, trial) {
  const board = trial.board;
  const changed = (test) => board.cells.map((_, i) => i).filter(test);
  switch (cheat.id) {
    case 'lightsOut':
      return ['lights.off', 'lights off. good luck seeing.'];
    case 'minionDrop': {
      const cells = changed((i) => board.minions[i] && !state.board.minions[i]).map((i) => cellName(board, i));
      return [`minion.deploy --cells=${cells.join(',')}`, `${cells.length} minion${cells.length === 1 ? '' : 's'} deployed. hehe.`];
    }
    case 'markSteal': {
      const [i] = changed((k) => board.stolen[k] && !state.board.stolen[k]);
      return [`cheat.markSteal --cell=${cellName(board, i)}`, 'your X is mine now.'];
    }
    case 'extraLine':
      return ['cheat.extraLine --draw', 'more board. more problems.'];
    case 'doubleMove':
      return ['cheat.doubleMove --times=2', 'two moves. rules are for humans.'];
    case 'boardSpin':
      return ['cheat.boardSpin --deg=90', 'wheee.'];
    case 'rewriteRules':
      return ['cheat.rewriteRules --now', 'early rule change scheduled.'];
    default:
      return [`cheat.${cheat.id}`, 'done.'];
  }
}

// 2000s TV interference on the background (see ui/tv.js).
function tvBurst(kind) {
  tvInterference(kind, state.calm ? 0 : stage(), state.calm);
}

// Cosmetic interface sabotage by Otto's cursor (stage 2+, not in Calm mode).
// Returns false if the match was reset meanwhile.
const SABOTAGE_GAP = 3;
async function maybeSabotage(force = null) {
  if (!force && (state.calm || stage() < 2 || state.turnNumber - state.lastSabotageTurn < SABOTAGE_GAP)) return true;
  if (!force && Math.random() > 0.45) return true;
  state.lastSabotageTurn = state.turnNumber;
  const kinds = ['dragToolbox', 'minimiseToolbox', 'shuffleDisks', 'hideBubble'];
  const kind = force || kinds[Math.floor(Math.random() * kinds.length)];
  const commands = {
    dragToolbox: ['ui.drag --window=TOOLBOX.EXE', 'oops. moved it.'],
    minimiseToolbox: ['ui.minimise --window=TOOLBOX.EXE', 'toolbox gone. bye.'],
    shuffleDisks: ['ui.shuffle --target=floppies', 'good luck finding anything.'],
    hideBubble: ['ui.drag --window=bubble --to=patience', "you didn't see that."],
  };
  termLog(state, ...commands[kind]);
  emit('change');
  const myGeneration = generation;
  await performSabotage(kind, (value) => applySabotage(kind, value), sfx.click);
  return myGeneration === generation;
}

function applySabotage(kind, value) {
  if (kind === 'dragToolbox') state.ui.toolboxOffset = value;
  if (kind === 'minimiseToolbox') state.ui.toolboxMinimised = true;
  if (kind === 'shuffleDisks') state.ui.diskOrder = [...(state.ui.diskOrder ?? defaultDiskOrder())].sort(() => Math.random() - 0.5);
  if (kind === 'hideBubble') {
    state.ui.bubbleDown = true;
    const ui = state.ui;
    setTimeout(() => {
      if (state.ui === ui) {
        ui.bubbleDown = false; // "you didn't see that"
        emit('change');
      }
    }, 6000);
  }
  emit('change');
}

function defaultDiskOrder() {
  return ['flick', 'lightSwitch', 'eraser', 'paperweight', 'glueStick', 'timeOut', 'myOwnLine', 'doubleMark', 'veto', 'amendment'];
}

// --- The roaming minion swarm (see ui/swarm.js) ------------------------------------------------
const MAX_BONK_POINTS = 5; // per round

function onBonk() {
  if (state.roundBonks < MAX_BONK_POINTS) {
    state.roundBonks++;
    earn(1);
  }
  sfx.click();
  emit('change');
}

function onMinionSteal(id) {
  state.ui.stolenDisk = id;
  emit('change');
}

function onMinionReturnDisk(id, dropped) {
  if (state.ui.stolenDisk === id) state.ui.stolenDisk = null;
  if (dropped) earn(1); // the player made it drop the disk
  emit('change');
}

function onMinionGraffiti(doodle) {
  state.ui.graffiti = [...state.ui.graffiti, doodle].slice(-4);
  emit('change');
}

function onMinionUnplug() {
  state.ui.unplugged = true;
  state.notice = 'A minion pulled the monitor cable! Click the cable to plug it back in.';
  emit('change');
}

// The player clicked the monitor cable: plugged back in.
function plugIn() {
  if (!state.ui.unplugged) return;
  state.ui.unplugged = false;
  sfx.click();
  emit('change');
}

// The player clicked TOOLBOX.EXE's taskbar button: bring it back.
function restoreToolbox() {
  state.ui.toolboxMinimised = false;
  state.ui.toolboxOffset = null;
  emit('change');
}

// The player clicked Otto (or pressed C).
function catchCheat() {
  if (!state.telegraph) return; // nothing to catch
  const cheat = getCheat(state.telegraph);
  state.telegraph = null;

  state.cooldowns[cheat.id] = cheat.cooldown; // a caught cheat still goes on cooldown
  state.stats.cheatsCaught++;
  state.log.cheatsCaught.push(cheat.id);
  talk(say('cheatCaught'));
  state.notice = `CAUGHT! Otto was about to use ${cheat.name}. (Otto's patience ${PATIENCE_CAUGHT})`;
  earn(POINTS.catchCheat);
  setPatience(state, state.patience + PATIENCE_CAUGHT); // getting caught costs Otto patience
  updateStageEffects();
  emit('change');
  sfx.caught();
  musicEvent('cheatCaught');
  showPopup('CAUGHT!');
  slap(); // Otto's cursor gets slapped away
  termLog(state, `cheat.${cheat.id}`, 'ERROR: caught by human. ow.');
  if (state.patience <= 0) patienceRanOut();
}

// Otto's patience hit 0 in the middle of a round (by catching a cheat): the match is won.
async function patienceRanOut() {
  generation++; // stop Otto's unfinished turn
  stopTurnTimer();
  state.roundOver = true;
  state.matchOver = true;
  state.result = 'X';
  state.telegraph = null;
  state.ottoThinking = false;
  emit('change');
  if (!(await pause(1500))) return;
  startRampage();
}

// Apply a cheat whose result was already checked by simulateCheat() (see agent.js).
// Otto's cursor performs it first; the change lands when the animation gets there.
// Returns false if the match was reset meanwhile.
async function runCheat(cheat, trial) {
  const myGeneration = generation;
  await performCheat(cheat, state, trial, sfx.click);
  if (myGeneration !== generation) return false;
  commitCheat(state, trial);
  state.cooldowns[cheat.id] = cheat.cooldown;
  state.lastCheat = { id: cheat.id, turnNumber: state.turnNumber };
  state.cheatLandedAt[cheat.id] = state.turnNumber;
  if (cheat.id === 'boardSpin') state.spinsToUndo++;
  state.stats.cheatsUsed++;
  state.log.cheatsUsed.push(cheat.id);
  talk(say('cheatSucceeds'));
  state.notice = `Otto cheated: ${cheat.name}! ${cheat.description}`;
  emit('change');
  sfx.cheat();
  musicEvent('cheat');
  tvBurst('cheat'); // the background loses signal
  if (cheat.id === 'boardSpin') spinBoardEffect();
  checkRoundEnd('O');
  return true;
}

async function ottoNormalMove() {
  const landing = chooseMove(state);
  if (landing !== undefined) {
    // Otto's cursor glides to the cell, hovers, clicks — then the O appears.
    termLog(state, `place --cell=${cellName(state.board, landing)}`, 'O placed. your move, human.');
    emit('change');
    const myGeneration = generation;
    await performMove(landing, sfx.click);
    if (myGeneration !== generation) return;
    placeMove(state, landing, 'O');
    sfx.otto();
  }
  state.ottoGrace = false; // the grace turn is over
  if (checkRoundEnd('O')) return;
  if (stage() === 3 && !state.calm) {
    tearBoard(); // Meltdown: screen tearing on Otto's move...
    setTempMood('glitching', 700); // ...and Otto glitches with it
  }
  endOttoTurn();
}

function endOttoTurn() {
  state.ottoGrace = false;
  startPlayerTurn();
}

// --- The end of a round ------------------------------------------------------------------

// Check whether the round is over after `mover` ('X', 'O' or null) did something.
// Returns true if it ended.
function checkRoundEnd(mover) {
  if (state.roundOver) return true;
  const lines = { X: lineFor(state, 'X'), O: lineFor(state, 'O') };
  if (lines.X || lines.O) {
    // The mover's own line counts first (a move can sometimes make lines for both).
    const maker = mover && lines[mover] ? mover : lines.X ? 'X' : 'O';
    // Reverse day: making a line LOSES.
    const winner = isReverseDay(state) ? other(maker) : maker;
    if (isReverseDay(state)) {
      state.notice = `Reverse day! Making a line LOSES, so ${winner === 'X' ? 'you win' : 'Otto wins'} the round.`;
    }
    endRound(winner, lines[maker].line);
    return true;
  }

  // Board full: Otto is forced to add a row or column (up to 7x7, then SUDDEN DEATH).
  if (emptyCells(state.board).length === 0) {
    if (state.board.rows >= MAX_BOARD && state.board.cols >= MAX_BOARD) {
      suddenDeath();
      return true;
    }
    if (state.board.cols >= MAX_BOARD || (state.board.rows <= state.board.cols && state.board.rows < MAX_BOARD)) {
      addRow(state.board);
    } else {
      addColumn(state.board);
    }
    talk(say('outOfRoom'));
    state.notice = 'The board is full, so Otto had to add more board.';
  }
  return false;
}

// SUDDEN DEATH: count every line of 3 (overlapping lines count too). Most lines wins the round.
function suddenDeath() {
  const xLines = linesOf(state.board, 'X', LINE_LENGTH);
  const oLines = linesOf(state.board, 'O', LINE_LENGTH);
  state.suddenDeath = { x: xLines.length, o: oLines.length };
  const winner = xLines.length > oLines.length ? 'X' : oLines.length > xLines.length ? 'O' : 'draw';
  const winnerLines = winner === 'X' ? xLines : winner === 'O' ? oLines : [...xLines, ...oLines];
  state.notice = `SUDDEN DEATH: MOST LINES OF 3 WINS. You ${xLines.length} – ${oLines.length} Otto.`;
  showPopup('SUDDEN DEATH!');
  endRound(winner, [...new Set(winnerLines.flat())], say('suddenDeath'));
}

// A round is over: patience changes, then the next round, the rampage, or Otto's win.
async function endRound(winner, line, ottoLine) {
  stopTurnTimer();
  state.roundOver = true;
  state.winLine = line;
  state.telegraph = null;
  state.ottoThinking = false;
  state.mode = null;
  state.threatCells = null;
  state.lightsOut = null; // lights back on so the player can see the result

  const before = state.patience;
  if (winner === 'X') {
    state.roundsWon.you++;
    earn(POINTS.winRound);
    if (soonAfterRuleChange()) earn(POINTS.ruleBonus);
    setPatience(state, before + PATIENCE_LOST_ROUND);
    talk(ottoLine || say('roundLost'));
    setTempMood('defeated', 3000);
    sfx.win();
    musicEvent('roundWonByPlayer');
  } else if (winner === 'O') {
    state.roundsWon.otto++;
    setPatience(state, before + PATIENCE_WON_ROUND);
    talk(ottoLine || say('roundWon'));
    setTempMood('victorious', 3000);
    sfx.lose();
    musicEvent('roundWonByOtto');
  } else {
    setPatience(state, before + PATIENCE_DRAW); // even a draw wears Otto down
    talk(ottoLine || say('draw'));
  }
  updateStageEffects();
  state.roundEnd = { winner, change: state.patience - before };

  if (state.patience <= 0) {
    // The player drained Otto's patience: the match is won. RAMPAGE!
    state.matchOver = true;
    state.result = 'X';
    emit('change');
    if (!(await pause(2200))) return;
    startRampage();
    return;
  }
  if (state.roundsWon.otto >= OTTO_ROUNDS_TO_WIN) {
    // Otto won 3 rounds first: the smug ending.
    state.matchOver = true;
    state.result = 'O';
    emit('change');
    rememberMatch('O');
    if (!(await pause(2200))) return;
    state.ending = 'banner';
    state.ottoSays = '...I cheated, obviously.';
    musicEvent('ottoWinsMatch');
    emit('change');
    return;
  }

  // Otherwise: [NEXT ROUND], or it continues by itself.
  emit('change');
  const myGeneration = generation;
  await Promise.race([waitForClick(), pause(ROUND_END_AUTO_MS)]);
  if (myGeneration !== generation) return;
  nextRound();
}

function nextRound() {
  startNextRound();
  noteRules();
  loadTactics(); // refreshed after each round (in the background)
  // Each stage of Otto falling apart is announced once.
  const now = stage();
  if (now > state.announcedStage) {
    state.announcedStage = now;
    talk(say(`stage${now}`));
  } else {
    talk(say('roundStart', { round: state.roundNumber }));
  }
  emit('change');
  startPlayerTurn();
}

// --- The rampage ending (patience reaches 0) ---------------------------------------------
// About 12-15 seconds, skippable. The match is saved to Snowflake BEFORE it starts.
let rampageSkipped = false;

// Like pause(), but also stops if the player pressed [SKIP].
async function rampagePause(ms) {
  const stillHere = await pause(ms);
  return stillHere && !rampageSkipped;
}

async function startRampage() {
  const myGeneration = generation;
  rampageSkipped = false;
  stopBuzz();
  await rememberMatch('X'); // saved first (gives up after a few seconds if offline)
  if (myGeneration !== generation) return;

  musicEvent('rampage'); // faster and higher as the chaos builds
  const step = async (phase, ms, line) => {
    state.rampage = { phase };
    if (phase === 'shatter') musicEvent('shatter'); // full distortion as the glass breaks
    if (line !== undefined) state.ottoSays = line;
    emit('change');
    if (phase === 'chaos') spawnFakePopups(6, 'OTTO.EXE HAS STOPPED CARING', Infinity, true); // pop-ups multiply
    return rampagePause(ms);
  };
  const played =
    (await step('red', 1300, 'PATIENCE.SYS NOT FOUND')) &&                 // 1. red monitor
    (await step('fine', 1800, RAMPAGE_LINES.fine)) &&                       // 2. Otto snaps
    (await step('chaos', 3000)) &&                                          // 3. everything flies
    (await step('shatter', 1700)) &&                                        // 4. the glass shatters
    (await step('crash', 1600)) &&                                          // 5. crash screen
    (await step('goodbye', 1600, RAMPAGE_LINES.goodbye));                   // 6. goodbye
  if (myGeneration !== generation || !played) return; // ([SKIP] goes straight to closeTheGame)
  closeTheGame();
}

// 7. Try to close the tab. Browsers usually block window.close() for tabs the
// player opened, so if the page is still here after 300ms, play the CRT-off fallback.
async function closeTheGame() {
  const myGeneration = generation;
  clearFakePopups();
  window.close();
  if (!(await pause(300))) return;
  state.rampage = { phase: 'crtOff' };   // the screen collapses into a line, then a dot
  musicEvent('tapeStop');                // ...as the music tape-stops into silence
  emit('change');
  if (!(await pause(1300))) return;
  state.rampage = { phase: 'black' };    // 3 seconds of black
  setTabGone();
  emit('change');
  if (!(await pause(3000))) return;
  if (myGeneration !== generation) return;
  state.rampage = { phase: 'final' };    // "Otto closed the game..." + [REBOOT OTTO]
  emit('change');
}

function skipRampage() {
  if (!state.rampage || ['crtOff', 'black', 'final'].includes(state.rampage.phase)) return;
  rampageSkipped = true;
  closeTheGame();
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
  if (taunt && state.totalTurns === 0 && !state.matchOver) state.ottoSays = taunt;
  emit('change');
}

// What beats humans across everyone's games. Fetched at match start and after each
// round; if Snowflake is down Otto just chooses without it.
async function loadTactics() {
  const myGeneration = generation;
  const tactics = await fetchTactics();
  if (myGeneration !== generation) return;
  if (tactics) state.tactics = tactics;
}

// Remember every rule that appears in the match (saved as rules_seen).
function noteRules() {
  for (const category of ['win', 'placement', 'twist']) {
    const id = state.rules[category].ruleId;
    if (!state.log.rulesSeen.includes(id)) state.log.rulesSeen.push(id);
  }
}

// At the end of a match: save ONE row for the match, then reload the stats for the leaderboard.
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
    winner: winner === 'X' ? 'player' : 'otto',
    turns: state.totalTurns,
    finalGrid: `${state.board.rows}x${state.board.cols}`,
    rulesSeen: state.log.rulesSeen,
  });
  const stats = await fetchStats(state.playerName);
  if (myGeneration !== generation) return;
  state.memory = stats ? { status: 'ready', stats } : { ...state.memory, status: 'offline' };
  emit('change');
}

// --- Stage effects that live outside the redraw -------------------------------------------
// Sound detune and the low buzz follow Otto's stage (and Calm mode).
function updateStageEffects() {
  const now = state.calm ? 0 : stage();
  setCursorPatience(state.patience);
  setMusicStage(stage());
  setMusicPatience(state.patience);
  setMusicCalm(state.calm);
  setDetune([0, 12, 25, 40][now]);
  if (now === 3 && state.screen === 'game' && !state.rampage) startBuzz();
  else stopBuzz();
}

// --- Starting matches ------------------------------------------------------------------

function playAgain() {
  generation++; // stops any unfinished sequences from the last match
  stopTurnTimer();
  resolveClick = null;
  rampageSkipped = false;
  restoreTab();
  clearFakePopups();
  clearSwarm();
  resetMatch();
  setPatience(state, 100);
  state.ottoSays = say('matchStart');
  setMusicStageOverride(null);
  updateStageEffects();
  startMusic(); // (restarts it after the rampage's tape-stop)
  noteRules();
  emit('change');
  loadMemory(); // runs in the background
  loadTactics();
}

// The title screen's Play button.
const NAME_KEY = 'agents-gone-wrong:name';
const MUTE_KEY = 'agents-gone-wrong:muted';
const CALM_KEY = 'agents-gone-wrong:calm';
const MUSIC_KEY = 'agents-gone-wrong:music-off';

function startGame(rawName) {
  state.playerName = cleanName(rawName) || 'Human';
  remember(NAME_KEY, state.playerName);
  state.screen = 'game';
  sfx.click();
  playAgain(); // starts the music: only now, after the PLAY click (browsers block autoplay)
}

function toggleMute() {
  state.muted = !state.muted;
  setMuted(state.muted);
  setMusicMuted(state.muted); // mute turns everything off
  remember(MUTE_KEY, state.muted ? '1' : '');
  updateStageEffects();
  emit('change');
}

// The music toggle only switches the music.
function toggleMusic() {
  state.musicOn = !state.musicOn;
  setMusicEnabled(state.musicOn);
  remember(MUSIC_KEY, state.musicOn ? '' : '1');
  emit('change');
}

// Calm mode switches the "unhinged" chaos effects off.
function toggleCalm() {
  state.calm = !state.calm;
  remember(CALM_KEY, state.calm ? '1' : '');
  updateStageEffects();
  if (state.calm) clearFakePopups();
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
  if (state.ruleScene && action !== 'rampage') return;
  state.debug.message = '';

  if (action === 'force') {
    state.debug.forceCheat = value;
    state.debug.message = `Otto will try ${getCheat(value).name} on its next turn.`;
  } else if (action === 'rule') {
    // Switch on a specific rule right now (no pop-up, no safety check).
    if (state.roundOver || state.rules[getRule(value).category].ruleId === value) {
      state.debug.message = `${getRule(value).name} is already active (or the round is over).`;
    } else {
      const oldId = state.rules[getRule(value).category].ruleId;
      activateRule(state, value);
      state.lastRuleChange = { ruleId: value, oldId, rejected: [], by: 'debug' };
      noteRules();
      talk(sayRule(value));
      showExample(value);
      startTurnTimer();
      checkRoundEnd(null);
    }
  } else if (action === 'ruleNow') {
    state.nextRuleAt = state.playerTurns + 1; // changes at the start of your next turn
    state.debug.message = 'The rules change at the start of your next turn.';
  } else if (action === 'grow') {
    if (state.board.rows < MAX_BOARD) addRow(state.board);
    if (state.board.cols < MAX_BOARD) addColumn(state.board);
    checkRoundEnd(null);
  } else if (action === 'turn19') {
    state.playerTurns = Math.max(state.playerTurns, ROUND_TURN_CAP - 1);
    state.debug.message = 'Your next move triggers SUDDEN DEATH.';
  } else if (action === 'mood') {
    // Show one of Otto's temporary moods (thinking shows the thinking animation).
    if (value === 'thinking') {
      state.ottoThinking = true;
      setTimeout(() => {
        state.ottoThinking = false;
        emit('change');
      }, 2500);
    } else {
      setTempMood(value, 3000);
    }
    state.debug.message = `Otto's mood: ${value}`;
  } else if (action === 'spawnMinion') {
    spawnMinion();
    state.debug.message = 'A minion is on its way (bonk it for +1).';
  } else if (action === 'glitchBurst') {
    glitchBurst({ force: true });
    state.debug.message = 'Glitch burst at full strength.';
  } else if (action === 'tvBurst') {
    tvInterference('rule', 3, state.calm);
    state.debug.message = 'TV static on the background (Meltdown strength).';
  } else if (action === 'ottoDragToolbox') {
    maybeSabotage('dragToolbox');
    state.debug.message = "Otto's cursor drags TOOLBOX.EXE out of place.";
  } else if (action === 'ottoRewriteRule') {
    if (isPlayersTurn() && !state.ruleScene && !state.roundOver) {
      ruleChangeScene(); // the cursor types the new rule into RULES.TXT, then NEW_RULE.EXE
      state.debug.message = 'Otto rewrites a rule now.';
    } else {
      state.nextRuleAt = state.playerTurns + 1;
      state.debug.message = 'Otto rewrites a rule at the start of your next turn.';
    }
  } else if (action === 'stage' || action === 'patienceUp' || action === 'patienceDown' || action === 'patienceOne') {
    const stagePatience = [100, 70, 40, 10][Number(value)];
    const next = { stage: stagePatience, patienceUp: state.patience + 25, patienceDown: state.patience - 25, patienceOne: 1 }[action];
    setPatience(state, Math.max(1, Math.min(100, next)));
    const now = stage();
    if (now > state.announcedStage) {
      state.announcedStage = now;
      talk(say(`stage${now}`));
    }
    updateStageEffects();
    state.debug.message = `Patience is now ${state.patience}.`;
  } else if (action === 'winRound' || action === 'loseRound') {
    if (!state.roundOver && !state.matchOver) {
      endRound(action === 'winRound' ? 'X' : 'O', []);
      return;
    }
  } else if (action === 'rampage') {
    if (!state.rampage) {
      generation++; // stop whatever was going on
      stopTurnTimer();
      state.ruleScene = null;
      setPatience(state, 0);
      state.roundOver = true;
      state.matchOver = true;
      state.result = 'X';
      startRampage();
      return;
    }
  } else if (action === 'musicStage') {
    setMusicStageOverride(Number(value));
    state.debug.message = `Music forced to stage ${value} (Play Again to follow patience again).`;
  } else if (action === 'testScratch') {
    musicEvent('ruleChange');
    setTimeout(() => musicEvent('ruleOk'), 2000);
    state.debug.message = 'Record scratch, bass only for 2 seconds, then back on the next downbeat.';
  } else if (action === 'testRampageMusic') {
    musicEvent('rampage');
    setTimeout(() => musicEvent('shatter'), 4000);
    setTimeout(() => musicEvent('tapeStop'), 6000);
    setTimeout(() => startMusic(), 9000);
    state.debug.message = 'Rampage music: speeds up, distorts, tape-stops, then restarts.';
  } else if (action === 'showTactics') {
    state.debug.message = `tactics: ${JSON.stringify(state.tactics)}`;
  } else if (action === 'showTwin') {
    state.debug.message = `twin: ${JSON.stringify(state.memory.stats?.twin ?? null)} (memory: ${state.memory.status})`;
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
  onCalm: toggleCalm,
  onMusic: toggleMusic,
  onSkip: skipRampage,
  onRestoreToolbox: restoreToolbox,
  onPlugIn: plugIn,
  onDebug: debugAction,
});
initOttoCursor();
initTv(staticNoise);
initGlitch(() => ({
  patience: state.patience,
  calm: state.calm,
  active: state.screen === 'game' && !state.matchOver,
  rampage: !!state.rampage,
}));
initSwarm({
  getInfo: () => ({
    stage: stage(),
    calm: state.calm,
    active: state.screen === 'game' && !state.matchOver,
    paused: !!state.ruleScene || state.roundOver,
    rampage: state.rampage?.phase,
  }),
  onBonk,
  onSteal: onMinionSteal,
  onReturnDisk: onMinionReturnDisk,
  onGraffiti: onMinionGraffiti,
  onUnplug: onMinionUnplug,
});
initChaos(
  () => ({
    stage: stage(),
    calm: state.calm,
    active: state.screen === 'game' && !state.matchOver && !state.rampage,
  }),
  () => setTempMood('glitching', 700), // Meltdown glitch bursts: Otto glitches too
);
on('change', () => emit('render'));
resetMatch();
state.playerName = recall(NAME_KEY);
state.muted = recall(MUTE_KEY) === '1';
state.calm = recall(CALM_KEY) === '1';
state.musicOn = recall(MUSIC_KEY) !== '1';
setMuted(state.muted);
setMusicMuted(state.muted);
setMusicEnabled(state.musicOn);
state.screen = 'title'; // ask for the player's name first
emit('change');
