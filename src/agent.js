// agent.js
// Otto's brain: picks normal moves, decides when to cheat, and tracks frustration.

import { emptyCells, smartMove, findWinningMove, pickRandom } from './board.js';
import { CHEATS, getCheat } from './cheats.js';

export const ROUND1_RANDOM_CHANCE = 0.4; // round 1: 40% of Otto's moves are random

// Chance Otto cheats on a turn goes from 20% (calm) up to 80% (furious).
const MIN_CHEAT_CHANCE = 0.2;
const MAX_CHEAT_CHANCE = 0.8;

// Decide which square Otto (O) plays normally. Returns a cell index.
export function chooseMove(state) {
  const empty = emptyCells(state.board);

  // Round 1: Otto plays fairly but sloppily, so the player can learn (and win).
  if (state.round === 1 && Math.random() < ROUND1_RANDOM_CHANCE) {
    return pickRandom(empty);
  }

  // Otherwise: perfect minimax on 3x3, simple heuristic on a bigger grid.
  return smartMove(state.board, 'O');
}

// Decide whether Otto cheats this turn. Returns a cheat object, or null.
export function pickCheat(state) {
  // Debug panel: a forced cheat is always attempted (if it's possible right now).
  if (state.debug.forceCheat) {
    const cheat = getCheat(state.debug.forceCheat);
    state.debug.forceCheat = null;
    state.debug.message = '';
    if (cheat.canUse(state)) return cheat;
    state.debug.message = `${cheat.name} can't be used right now.`;
    return null;
  }

  if (state.round < 2) return null; // round 1 is played fair

  // No need to cheat if a normal move already wins.
  if (findWinningMove(state.board, 'O') !== -1) return null;

  const chance =
    MIN_CHEAT_CHANCE + (MAX_CHEAT_CHANCE - MIN_CHEAT_CHANCE) * (state.frustration / 100);
  if (Math.random() > chance) return null;

  const options = CHEATS.filter(
    (cheat) =>
      !(state.cooldowns[cheat.id] > 0) &&
      state.frustration >= cheat.minFrustration &&
      cheat.canUse(state)
  );
  return options.length > 0 ? pickRandom(options) : null;
}

// Change frustration by `amount` (can be negative), kept between 0 and 100.
// Returns true if this pushed Otto past 50 or 80 (so Otto can complain about it).
export function addFrustration(state, amount) {
  const before = state.frustration;
  state.frustration = Math.max(0, Math.min(100, before + amount));
  return [50, 80].some((level) => before < level && state.frustration >= level);
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
  if (state.frustration >= 70) return 'furious';
  if (state.round >= 2 && state.frustration < 35) return 'bored';
  return 'smug';
}
