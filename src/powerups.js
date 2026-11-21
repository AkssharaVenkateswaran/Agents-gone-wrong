// powerups.js
// The player's power-ups, bought with points. Each power-up is an object:
//   id        - short name used in code
//   name      - name shown on the sticker button
//   cost      - points it costs
//   key       - keyboard shortcut (1-8)
//   counters  - id of the cheat it counters (or null)
//   help      - one-line description (used for the button's aria-label / tooltip)
//   canUse(state)        - is it useful right now? (if not, the button looks faded)
//   apply(state, choice) - do it. `choice` is extra info for power-ups that need
//                          one: the minion square for Flick, 'row'/'col' for My Own Line.

import { addRow, addColumn, lineCells } from './board.js';
import { getCheat, MAX_GRID_SIZE } from './cheats.js';

export const POWERUPS = [
  {
    id: 'flick',
    name: 'Flick',
    cost: 2,
    key: '1',
    counters: 'minionDrop',
    help: 'Removes one minion blocker. Then click the minion to flick.',
    canUse: (state) => state.board.minions.some(Boolean),
    apply(state, square) {
      state.board.minions[square] = false;
    },
  },
  {
    id: 'lightSwitch',
    name: 'Light Switch',
    cost: 3,
    key: '2',
    counters: 'lightsOut',
    help: 'Turns the lights back on.',
    canUse: (state) => !!state.lightsOut,
    apply(state) {
      getCheat('lightsOut').undo(state);
    },
  },
  {
    id: 'eraser',
    name: 'Eraser',
    cost: 3,
    key: '3',
    counters: 'extraLine',
    help: 'Removes a line Otto added, and its marks.',
    canUse: (state) => state.addedLines.some((line) => line.owner === 'O'),
    apply(state) {
      getCheat('extraLine').undo(state);
    },
  },
  {
    id: 'paperweight',
    name: 'Paperweight',
    cost: 3,
    key: '4',
    counters: 'boardSpin',
    help: 'Undoes a Board Spin and blocks spins for 3 turns.',
    canUse: (state) => state.spinsToUndo > 0,
    apply(state) {
      getCheat('boardSpin').undo(state);
      state.spinsToUndo--;
      state.spinBlockedTurns = 3;
    },
  },
  {
    id: 'glueStick',
    name: 'Glue Stick',
    cost: 4,
    key: '5',
    counters: 'markSteal',
    help: 'Undoes a Mark Steal. That mark is protected forever.',
    canUse: (state) => state.board.stolen.some(Boolean),
    apply(state) {
      const board = state.board;
      const stolenSquares = [];
      board.stolen.forEach((wasStolen, i) => {
        if (wasStolen) stolenSquares.push(i);
      });
      getCheat('markSteal').undo(state);              // turn them back into X...
      stolenSquares.forEach((i) => (board.glued[i] = true)); // ...and glue them down
    },
  },
  {
    id: 'timeOut',
    name: 'Time Out',
    cost: 5,
    key: '6',
    counters: 'doubleMove',
    help: 'Otto skips its next turn.',
    canUse: (state) => !state.ottoSkipsNextTurn,
    apply(state) {
      getCheat('doubleMove').undo(state); // sets ottoSkipsNextTurn
    },
  },
  {
    id: 'myOwnLine',
    name: 'My Own Line',
    cost: 5,
    key: '7',
    counters: null,
    help: 'Draw your own extra row or column and place a free X in it.',
    canUse: (state) => state.board.rows < MAX_GRID_SIZE || state.board.cols < MAX_GRID_SIZE,
    apply(state, type) {
      const board = state.board;
      const index = type === 'row' ? addRow(board) : addColumn(board);
      state.addedLines.push({ owner: 'X', type, index });
      // Now the player picks which square of the new line gets the free X.
      state.mode = { type: 'ownLinePlace', cells: lineCells(board, type, index) };
    },
  },
  {
    id: 'doubleMark',
    name: 'Double Mark',
    cost: 6,
    key: '8',
    counters: null,
    help: 'Place two X marks this turn.',
    canUse: (state) => state.extraMarks === 0,
    apply(state) {
      state.extraMarks = 1; // one extra X after the normal one
    },
  },
];

export function getPowerUp(id) {
  return POWERUPS.find((p) => p.id === id);
}

// Can the player afford it?
export function canAfford(state, powerUp) {
  return state.points >= powerUp.cost;
}
