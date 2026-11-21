// cheats.js
// Every cheat Otto can pull. Each cheat is an object:
//   id             - short name used in code
//   name           - name shown to the player
//   description    - what happened, shown after the cheat lands
//   cooldown       - how many of Otto's turns before it can be used again
//   minFrustration - Otto only uses it once frustration is at least this high
//                    (so the nastier cheats appear as Otto gets angrier)
//   replacesMove   - true if the cheat already places Otto's mark(s) this turn
//   canUse(state)  - can this cheat be used right now?
//   apply(state)   - do the cheat
//   undo(state)    - reverse it (the power-ups in Milestone 3 will call this)

import {
  addRow,
  addColumn,
  removeRow,
  removeColumn,
  rotateClockwise,
  rotateAnticlockwise,
  lineCells,
  emptyCells,
  findWinner,
  findWinningMove,
  heuristicMove,
  smartMove,
  pickRandom,
} from './board.js';

const MAX_GRID_SIZE = 5;        // Extra Line won't grow the grid past 5x5
export const LIGHTS_OUT_TURNS = 3; // Lights Out lasts this many player turns

export const CHEATS = [
  // ---------------------------------------------------------------------
  {
    id: 'lightsOut',
    name: 'Lights Out',
    description: 'The lights are off for 3 of your turns. Your cursor is a torch.',
    cooldown: 4,
    minFrustration: 0,
    replacesMove: false,
    canUse: (state) => !state.lightsOut,
    apply(state) {
      state.lightsOut = { turnsLeft: LIGHTS_OUT_TURNS };
    },
    undo(state) {
      state.lightsOut = null;
    },
  },

  // ---------------------------------------------------------------------
  {
    id: 'extraLine',
    name: 'Extra Line',
    description: 'Otto scribbled a new line onto the grid and put an O in it.',
    cooldown: 5,
    minFrustration: 25,
    replacesMove: true,
    canUse: (state) => state.board.rows < MAX_GRID_SIZE || state.board.cols < MAX_GRID_SIZE,
    apply(state) {
      const board = state.board;
      const options = [];
      if (board.rows < MAX_GRID_SIZE) options.push('row');
      if (board.cols < MAX_GRID_SIZE) options.push('col');
      const type = pickRandom(options);

      const index = type === 'row' ? addRow(board) : addColumn(board);
      state.addedLines.push({ owner: 'O', type, index });

      // Put an O on the best square of the new line.
      const target = heuristicMove(board, 'O', lineCells(board, type, index));
      board.cells[target] = 'O';
    },
    undo(state) {
      // Remove the most recent line Otto added (with all its marks).
      const line = [...state.addedLines].reverse().find((l) => l.owner === 'O');
      if (line) removeAddedLine(state, line);
    },
  },

  // ---------------------------------------------------------------------
  {
    id: 'minionDrop',
    name: 'Minion Drop',
    description: "Minions are sitting on squares. You can't play there.",
    cooldown: 4,
    minFrustration: 0,
    replacesMove: false,
    canUse: (state) => emptyCells(state.board).length >= 3, // leave room to play
    apply(state) {
      const board = state.board;
      const count = state.frustration >= 50 ? 2 : 1; // angrier Otto throws more
      for (let n = 0; n < count; n++) {
        // Petty: if the player could win somewhere, sit a minion right there.
        let target = findWinningMove(board, 'X');
        if (target === -1) target = pickRandom(emptyCells(board));
        board.minions[target] = true;
      }
    },
    undo(state) {
      state.board.minions = state.board.minions.map(() => false);
    },
  },

  // ---------------------------------------------------------------------
  {
    id: 'markSteal',
    name: 'Mark Steal',
    description: 'Otto repainted one of your X marks into an O.',
    cooldown: 5,
    minFrustration: 25,
    replacesMove: true,
    canUse: (state) => state.board.cells.includes('X'),
    apply(state) {
      const board = state.board;
      const xSquares = [];
      board.cells.forEach((mark, i) => {
        if (mark === 'X') xSquares.push(i);
      });

      // Prefer a steal that wins Otto the game on the spot.
      let target = xSquares.find((i) => {
        board.cells[i] = 'O';
        const win = findWinner(board);
        board.cells[i] = 'X';
        return win && win.mark === 'O';
      });
      // Otherwise steal the X that is most useful to Otto.
      if (target === undefined) {
        xSquares.forEach((i) => (board.cells[i] = null)); // pretend they're empty...
        target = heuristicMove(board, 'O', xSquares);     // ...pick the best one...
        xSquares.forEach((i) => (board.cells[i] = 'X'));  // ...and put them back
      }

      board.cells[target] = 'O';
      board.stolen[target] = true;
    },
    undo(state) {
      const board = state.board;
      board.stolen.forEach((wasStolen, i) => {
        if (wasStolen) {
          board.cells[i] = 'X';
          board.stolen[i] = false;
        }
      });
    },
  },

  // ---------------------------------------------------------------------
  {
    id: 'doubleMove',
    name: 'Double Move',
    description: 'Otto placed two O marks in one turn.',
    cooldown: 5,
    minFrustration: 50,
    replacesMove: true,
    canUse: (state) => emptyCells(state.board).length >= 2,
    apply(state) {
      const board = state.board;
      board.cells[smartMove(board, 'O')] = 'O';
      // Only take the second move if the first one didn't already win.
      if (!findWinner(board) && emptyCells(board).length > 0) {
        board.cells[smartMove(board, 'O')] = 'O';
      }
    },
    undo(state) {
      // The counter for a double move is Time Out: Otto skips its next turn.
      state.ottoSkipsNextTurn = true;
    },
  },

  // ---------------------------------------------------------------------
  {
    id: 'boardSpin',
    name: 'Board Spin',
    description: 'The board was rotated 90°.',
    cooldown: 3,
    minFrustration: 0,
    replacesMove: false,
    canUse: (state) =>
      state.spinBlockedTurns === 0 && state.board.cells.some((mark) => mark !== null),
    apply(state) {
      spinBoard(state, true);
    },
    undo(state) {
      spinBoard(state, false);
    },
  },
];

export function getCheat(id) {
  return CHEATS.find((cheat) => cheat.id === id);
}

// --- Helpers -----------------------------------------------------------------

// Remove one added row/column (and its marks) from the board, and fix up the
// positions of any other added lines that were after it.
export function removeAddedLine(state, line) {
  if (line.type === 'row') removeRow(state.board, line.index);
  else removeColumn(state.board, line.index);

  state.addedLines = state.addedLines.filter((l) => l !== line);
  for (const other of state.addedLines) {
    if (other.type === line.type && other.index > line.index) other.index--;
  }
}

// Spin the board 90° and keep track of where the added lines ended up.
// Clockwise: row i becomes column (rows - 1 - i), column j becomes row j.
// Anticlockwise: row i becomes column i, column j becomes row (cols - 1 - j).
function spinBoard(state, clockwise) {
  const { rows, cols } = state.board;
  if (clockwise) rotateClockwise(state.board);
  else rotateAnticlockwise(state.board);

  for (const line of state.addedLines) {
    if (line.type === 'row') {
      line.type = 'col';
      line.index = clockwise ? rows - 1 - line.index : line.index;
    } else {
      line.type = 'row';
      line.index = clockwise ? line.index : cols - 1 - line.index;
    }
  }
}
