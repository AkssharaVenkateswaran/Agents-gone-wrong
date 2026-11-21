// agent.js
// Otto's brain. For Milestone 1 Otto only makes normal moves (no cheats yet).

import { bestMove, emptyCells } from './board.js';

export const ROUND1_RANDOM_CHANCE = 0.4; // round 1: 40% of Otto's moves are random

// Decide which square Otto (O) plays. Returns a cell index.
export function chooseMove(state) {
  const empty = emptyCells(state.board);

  // Round 1: Otto plays fairly but sloppily, so the player can learn (and win).
  if (state.round === 1 && Math.random() < ROUND1_RANDOM_CHANCE) {
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // Otherwise: perfect play with minimax.
  return bestMove(state.board, 'O');
}
