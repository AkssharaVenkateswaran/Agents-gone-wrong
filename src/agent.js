// agent.js
// Otto's brain: picks normal moves, decides when to cheat, and tracks its patience.
// (The move-choosing and rule-choosing details live in ai.js.)

import { cloneBoard } from './board.js';
import { CHEATS, getCheat } from './cheats.js';
import { ottoMove, findWinningSquare } from './ai.js';
import { lineFor } from './rules.js';
import { cheatScore, weightOf, weightedPick } from './tactics.js';

// Chance Otto cheats on a turn goes from 20% (calm) up to 80% (furious).
const MIN_CHEAT_CHANCE = 0.2;
const MAX_CHEAT_CHANCE = 0.8;
const CHEAT_GAP = 3;        // at most 1 cheat every 3 Otto turns
const NO_CHEAT_TURNS = 2;   // and none in Otto's first 2 turns of a match

// Decide which square Otto (O) plays normally, following the current rules.
// Returns the square Otto's mark lands on.
export function chooseMove(state) {
  return ottoMove(state); // a heuristic that makes mistakes (see SKILL in ai.js)
}

// Try a cheat on a COPY of the game first. Cheats must never win the match by
// themselves: skip the cheat if it would give Otto a winning line, or take away
// the player's only way to win next turn.
// Returns the copy (with the cheat done) if it's fair to use, otherwise null.
export function simulateCheat(state, cheat) {
  const trial = {
    ...state,
    board: cloneBoard(state.board),
    addedLines: state.addedLines.map((line) => ({ ...line })),
    lightsOut: state.lightsOut && { ...state.lightsOut },
  };
  const playerCouldWin = findWinningSquare(state, 'X') !== -1;
  cheat.apply(trial);
  if (lineFor(trial, 'O')) return null;
  if (playerCouldWin && findWinningSquare(trial, 'X') === -1) return null;
  return trial;
}

// Copy the result of a simulated cheat back into the real game.
// (So what happens is exactly what was checked, even for cheats with randomness.)
export function commitCheat(state, trial) {
  for (const key of Object.keys(trial)) {
    if (trial[key] !== state[key]) state[key] = trial[key];
  }
}

// Decide whether Otto cheats this turn.
// Returns { cheat, trial } (the cheat and its already-checked result), or null.
export function pickCheat(state) {
  // Debug panel: a forced cheat is always attempted (if it's possible and fair right now).
  if (state.debug.forceCheat) {
    const cheat = getCheat(state.debug.forceCheat);
    state.debug.forceCheat = null;
    state.debug.message = '';
    const trial = cheat.canUse(state) && simulateCheat(state, cheat);
    if (trial) return { cheat, trial, dataDriven: cheatScore(state.tactics, cheat.id) !== null };
    state.debug.message = `${cheat.name} can't be used right now (impossible, or it would decide the match).`;
    return null;
  }

  if (!state.roundRuleChanges) return null;        // fair play until the round's first rule change
  if (state.ottoGrace) return null;              // no cheating right after a rule change
  if (state.turnNumber <= NO_CHEAT_TURNS) return null;
  if (state.turnNumber - state.lastCheatTry < CHEAT_GAP) return null;

  // No need to cheat if a normal move already wins.
  if (findWinningSquare(state, 'O') !== -1) return null;

  const chance =
    MIN_CHEAT_CHANCE + (MAX_CHEAT_CHANCE - MIN_CHEAT_CHANCE) * (state.frustration / 100);
  if (Math.random() > chance) return null;

  const options = CHEATS.filter(
    (cheat) =>
      !(state.cooldowns[cheat.id] > 0) &&
      state.frustration >= cheat.minFrustration &&
      cheat.canUse(state)
  );
  // Try them in a random order (cheats that work well on humans, according to
  // everyone's games in Snowflake, are a bit more likely) and use the first fair one.
  while (options.length > 0) {
    const cheat = weightedPick(options, (c) => weightOf(cheatScore(state.tactics, c.id)));
    options.splice(options.indexOf(cheat), 1);
    const trial = simulateCheat(state, cheat);
    if (trial) return { cheat, trial, dataDriven: cheatScore(state.tactics, cheat.id) !== null };
  }
  return null;
}

// --- Otto's patience ------------------------------------------------------------------------
// Patience (100 -> 0): the player wins the match by draining it to 0. Its opposite,
// "frustration" (0 -> 100), is what makes Otto sharper and cheat more (see ai.js and pickCheat).
export const PATIENCE_LOST_ROUND = -50; // Otto loses a round
export const PATIENCE_DRAW = -15;       // a round ends in a draw
export const PATIENCE_CAUGHT = -5;      // the player catches one of Otto's cheats
export const PATIENCE_WON_ROUND = 5;    // Otto wins a round (never above 100)

export function setPatience(state, patience) {
  state.patience = Math.max(0, Math.min(100, Math.round(patience)));
  state.frustration = 100 - state.patience;
}

// The 4 stages of Otto falling apart (0 Calm, 1 Irritated, 2 Unhinged, 3 Meltdown).
export const STAGES = [
  { min: 76, label: 'FINE' },
  { min: 51, label: 'IRRITATED' },
  { min: 26, label: 'UNHINGED' },
  { min: 0, label: 'CRITICAL' },
];
export function stageOf(patience) {
  return STAGES.findIndex((stage) => patience >= stage.min);
}
// How far into its stage Otto is: 0 at the top of the stage, 1 at the bottom.
export function stageProgress(patience) {
  const stage = stageOf(patience);
  const top = stage === 0 ? 100 : STAGES[stage - 1].min - 1;
  const bottom = STAGES[stage].min;
  return top === bottom ? 0 : (top - patience) / (top - bottom);
}

// Count every cheat's cooldown down by one (called at the start of Otto's turn).
export function tickCooldowns(state) {
  for (const id in state.cooldowns) {
    if (state.cooldowns[id] > 0) state.cooldowns[id]--;
  }
}

// Which face Otto should pull: 'smug', 'bored', 'scheming' or 'furious'.
export function ottoMood(state) {
  if (state.telegraph) return 'scheming';
  const stage = stageOf(state.patience);
  if (stage >= 2) return 'furious';
  if (stage === 1) return 'bored';
  return 'smug';
}
