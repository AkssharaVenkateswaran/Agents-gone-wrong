// board.js
// The grid model, win detection, minimax, and helpers to grow / shrink / spin the grid.
//
// A board is a plain object: { rows, cols, cells, minions, stolen, glued, age, stamp }
//   Every "layer" is a flat array with one entry per square (length rows * cols).
//   The square at (row, col) is stored at index row * cols + col.
//     cells[i]   -> null (empty), 'X' or 'O'
//     minions[i] -> true if a minion robot is sitting on that square (blocked)
//     stolen[i]  -> true if Otto repainted the player's X into an O here
//     glued[i]   -> true if the player glued their X here (Otto can't steal it)
//     age[i]     -> the player-turn number when the mark here was placed (for "fading ink")
//     stamp[i]   -> the move number when the mark here was placed (lines only count if
//                   they include a mark placed AFTER the last rule change)
//   Keeping everything in parallel arrays means that when the grid grows or
//   spins, ALL the information moves together and nothing gets out of sync.

export const LINE_LENGTH = 3; // the classic rule: 3 in a row wins

// The 4 directions a line can run in. Rules can switch some of them off.
export const DIRECTIONS = {
  h: [0, 1],   // horizontal  →
  v: [1, 0],   // vertical    ↓
  d1: [1, 1],  // diagonal    ↘
  d2: [1, -1], // diagonal    ↙
};
export const ALL_DIRECTIONS = ['h', 'v', 'd1', 'd2'];

const LAYERS = ['cells', 'minions', 'stolen', 'glued', 'age', 'stamp'];
const BLANK = { cells: null, minions: false, stolen: false, glued: false, age: null, stamp: 0 }; // value of a fresh square

export function createBoard(rows, cols) {
  const board = { rows, cols };
  for (const layer of LAYERS) board[layer] = new Array(rows * cols).fill(BLANK[layer]);
  return board;
}

// Make an independent copy (so minimax can try moves without
// changing the real board).
export function cloneBoard(board) {
  const copy = { rows: board.rows, cols: board.cols };
  for (const layer of LAYERS) copy[layer] = board[layer].slice();
  return copy;
}

// A square can be played if it has no mark and no minion on it.
export function isPlayable(board, i) {
  return board.cells[i] === null && !board.minions[i];
}

export function emptyCells(board) {
  const result = [];
  board.cells.forEach((_, i) => {
    if (isPlayable(board, i)) result.push(i);
  });
  return result;
}

export function isFull(board) {
  return emptyCells(board).length === 0;
}

// The indexes of every square in one row or one column.
export function lineCells(board, type, index) {
  const result = [];
  if (type === 'row') for (let c = 0; c < board.cols; c++) result.push(index * board.cols + c);
  else for (let r = 0; r < board.rows; r++) result.push(r * board.cols + index);
  return result;
}

// --- Win detection (works on ANY grid size) ------------------------------

// Every possible line of `length` squares on the grid, as lists of square indexes.
// From every square we look in each allowed direction (see DIRECTIONS).
export function allLines(board, length = LINE_LENGTH, directions = ALL_DIRECTIONS) {
  const { rows, cols } = board;
  const lines = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const name of directions) {
        const [dr, dc] = DIRECTIONS[name];
        const line = [];
        for (let step = 0; step < length; step++) {
          const rr = r + dr * step;
          const cc = c + dc * step;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) break; // off the grid
          line.push(rr * cols + cc);
        }
        if (line.length === length) lines.push(line);
      }
    }
  }
  return lines;
}

// Find a completed line for `mark` (or for either mark if `mark` is null).
// Returns { mark, line: [indexes] } or null.
// Minion squares are always empty (null), so they never count toward a line.
export function findLine(board, mark = null, length = LINE_LENGTH, directions = ALL_DIRECTIONS) {
  for (const line of allLines(board, length, directions)) {
    const first = board.cells[line[0]];
    if (!first || (mark && first !== mark)) continue;
    if (line.every((i) => board.cells[i] === first)) return { mark: first, line };
  }
  return null;
}

// The classic check (3 in a row, any direction) — used by minimax on 3x3.
export function findWinner(board) {
  return findLine(board);
}

// All the separate lines of `length` a mark has (overlapping ones count too,
// so 4 in a row = 2 lines of 3). Used by the FINAL RULE.
export function linesOf(board, mark, length = LINE_LENGTH) {
  return allLines(board, length).filter((line) => line.every((i) => board.cells[i] === mark));
}

// If `mark` can win right now (classic rules), return that square's index. Otherwise -1.
export function findWinningMove(board, mark, candidates = emptyCells(board)) {
  for (const i of candidates) {
    board.cells[i] = mark; // try it...
    const winner = findWinner(board);
    board.cells[i] = null; // ...and undo it
    if (winner && winner.mark === mark) return i;
  }
  return -1;
}

// --- Minimax (standard 3x3 grid only) ------------------------------------
// Minimax tries every possible future game and picks the move that is best
// assuming the opponent also plays perfectly.
// Scores (from the point of view of `me`):
//   +10 for a win, -10 for a loss, 0 for a draw.
// We subtract/add the depth so a FASTER win (or a SLOWER loss) is preferred.

function minimax(board, me, current, depth) {
  const winner = findWinner(board);
  if (winner) return winner.mark === me ? 10 - depth : depth - 10;
  if (isFull(board)) return 0;

  const other = current === 'X' ? 'O' : 'X';
  let best = current === me ? -Infinity : Infinity;

  for (const i of emptyCells(board)) {
    board.cells[i] = current;                     // try the move
    const score = minimax(board, me, other, depth + 1);
    board.cells[i] = null;                        // undo it

    if (current === me) best = Math.max(best, score); // my turn: maximise
    else best = Math.min(best, score);                // their turn: minimise
  }
  return best;
}

// Returns the index of the best square for `mark` to play.
export function bestMove(board, mark) {
  const copy = cloneBoard(board);
  const other = mark === 'X' ? 'O' : 'X';
  let bestScore = -Infinity;
  let bestIndexes = [];

  for (const i of emptyCells(copy)) {
    copy.cells[i] = mark;
    const score = minimax(copy, mark, other, 1);
    copy.cells[i] = null;

    if (score > bestScore) {
      bestScore = score;
      bestIndexes = [i];
    } else if (score === bestScore) {
      bestIndexes.push(i); // keep ties so Otto doesn't always play the same game
    }
  }
  return pickRandom(bestIndexes);
}

// --- Growing, shrinking and spinning the grid ----------------------------
// All of these change the board IN PLACE.
//
// reshape() builds new layers of size newRows x newCols. For every new square
// (r, c), `sourceOf(r, c)` says which OLD index it should copy from
// (or -1 for "a brand-new blank square").

function reshape(board, newRows, newCols, sourceOf) {
  for (const layer of LAYERS) {
    const old = board[layer];
    const next = [];
    for (let r = 0; r < newRows; r++) {
      for (let c = 0; c < newCols; c++) {
        const from = sourceOf(r, c);
        next.push(from === -1 ? BLANK[layer] : old[from]);
      }
    }
    board[layer] = next;
  }
  board.rows = newRows;
  board.cols = newCols;
}

// Add an empty row at the bottom. Returns the new row's index.
export function addRow(board) {
  const { rows, cols } = board;
  reshape(board, rows + 1, cols, (r, c) => (r < rows ? r * cols + c : -1));
  return rows;
}

// Add an empty column on the right. Returns the new column's index.
export function addColumn(board) {
  const { rows, cols } = board;
  reshape(board, rows, cols + 1, (r, c) => (c < cols ? r * cols + c : -1));
  return cols;
}

export function removeRow(board, rowToRemove) {
  const { rows, cols } = board;
  reshape(board, rows - 1, cols, (r, c) => (r < rowToRemove ? r : r + 1) * cols + c);
}

export function removeColumn(board, colToRemove) {
  const { rows, cols } = board;
  reshape(board, rows, cols - 1, (r, c) => r * cols + (c < colToRemove ? c : c + 1));
}

// Rotate 90° clockwise: the old square (r, c) moves to (c, rows - 1 - r).
export function rotateClockwise(board) {
  const { rows, cols } = board;
  reshape(board, cols, rows, (r, c) => (rows - 1 - c) * cols + r);
}

// Rotate 90° anticlockwise: the old square (r, c) moves to (cols - 1 - c, r).
export function rotateAnticlockwise(board) {
  const { rows, cols } = board;
  reshape(board, cols, rows, (r, c) => c * cols + (cols - 1 - r));
}

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}
