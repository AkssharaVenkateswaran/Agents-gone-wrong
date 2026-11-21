// agent.js
// Otto's brain: picks normal moves, decides when to cheat, and tracks frustration.
// (The move-choosing and rule-choosing details live in ai.js.)

import { pickRandom } from './board.js';
import { CHEATS, getCheat } from './cheats.js';
import { ottoMove, findWinningSquare } from './ai.js';

// Chance Otto cheats on a turn goes from 20% (calm) up to 80% (furious).
const MIN_CHEAT_CHANCE = 0.2;
const MAX_CHEAT_CHANCE = 0.8;

// Decide which square Otto (O) plays normally, following the current rules.
// Returns the square Otto's mark lands on.
export function chooseMove(state) {
  return ottoMove(state); // perfect minimax on classic 3x3, heuristic otherwise
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

  if (state.era !== 'modern') return null; // the 1952 opening is played fair

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
  if (state.era === 'modern' && state.frustration < 35) return 'bored';
  return 'smug';
}
