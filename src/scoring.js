// scoring.js
// How the player earns points. Points are spent on power-ups.

export const STARTING_POINTS = 3;

export const POINTS = {
  placeX: 1,        // +1 for each X placed
  block: 3,         // +3 for blocking a row where Otto had two in a row
  quickCounter: 2,  // +2 for countering a cheat within 2 turns of it happening
  catchCheat: 4,    // +4 for catching a cheat during its telegraph window
  winRound: 5,      // +5 for winning a round
};

// A cheat countered within this many of Otto's turns earns the quick-counter bonus.
export const QUICK_COUNTER_TURNS = 2;

// Give the player points (main.js also shows a "+3" pop for each gain).
export function addPoints(state, amount) {
  state.points += amount;
  state.stats.pointsEarned += amount;
}
