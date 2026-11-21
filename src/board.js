// board.js
// The grid model, win detection, minimax, and helpers to grow / shrink / spin the grid.
//
// A board is a plain object: { rows, cols, cells, minions, stolen, glued }
//   Every "layer" is a flat array with one entry per square (length rows * cols).
//   The square at (row, col) is stored at index row * cols + col.
//     cells[i]   -> null (empty), 'X' or 'O'
//     minions[i] -> true if a minion sticker is sitting on that square (blocked)
//     stolen[i]  -> true if Otto repainted the player's X into an O here
//     glued[i]   -> true if the player glued their X here (Otto can't steal it)
//   Keeping everything in parallel arrays means that when the grid grows or
//   spins, ALL the information moves together and nothing gets out of sync.

export const LINE_LENGTH = 3; // how many in a row you need to win

const LAYERS = ['cells', 'minions', 'stolen', 'glued'];
const BLANK = { cells: null, minions: false, stolen: false, glued: false }; // value of a fresh square

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

// Every possible "3 in a row" on the grid, as lists of 3 square indexes.
// From every square we look in 4 directions:
//   right (0,1), down (1,0), down-right (1,1) and down-left (1,-1).
export function allLines(board) {
  const { rows, cols } = board;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  const lines = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of directions) {
        const line = [];
        for (let step = 0; step < LINE_LENGTH; step++) {
          const rr = r + dr * step;
          const cc = c + dc * step;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) break; // off the grid
          line.push(rr * cols + cc);
        }
        if (line.length === LINE_LENGTH) lines.push(line);
      }
    }
  }
  return lines;
}

// Returns { mark: 'X' | 'O', line: [i1, i2, i3] } or null if nobody has won.
// Minion squares are always empty (null), so they never count toward a line.
export function findWinner(board) {
  for (const line of allLines(board)) {
    const mark = board.cells[line[0]];
    if (mark && line.every((i) => board.cells[i] === mark)) return { mark, line };
  }
  return null;
}

// If `mark` can win right now, return that square's index. Otherwise -1.
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

// With perfect play from here, who wins? ('X', 'O' or 'draw')
// `toMove` is whose turn it is. Only used on 3x3 (too slow on big grids).
export function perfectPlayResult(board, toMove) {
  const score = minimax(cloneBoard(board), 'O', toMove, 0);
  if (score > 0) return 'O';
  if (score < 0) return 'X';
  return 'draw';
}

// --- Simple heuristic (used when the grid is bigger than 3x3) ------------
// 1. win if possible  2. block if needed  3. take the best open square.
// `candidates` lets callers limit which squares may be chosen.
export function heuristicMove(board, mark, candidates = emptyCells(board)) {
  const other = mark === 'X' ? 'O' : 'X';

  const win = findWinningMove(board, mark, candidates);
  if (win !== -1) return win;

  const block = findWinningMove(board, other, candidates);
  if (block !== -1) return block;

  // Score each square: every possible line through it that the opponent
  // hasn't blocked is worth 1 point, plus 3 more per mark of ours already in it.
  let bestScore = -1;
  let bestIndexes = [];
  for (const i of candidates) {
    let score = 0;
    for (const line of allLines(board)) {
      if (!line.includes(i)) continue;
      const blocked = line.some((j) => board.cells[j] === other || board.minions[j]);
      if (blocked) continue;
      const mine = line.filter((j) => board.cells[j] === mark).length;
      score += 1 + mine * 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndexes = [i];
    } else if (score === bestScore) {
      bestIndexes.push(i);
    }
  }
  return pickRandom(bestIndexes);
}

// Otto's "best" move on any board: perfect minimax on 3x3, heuristic otherwise.
export function smartMove(board, mark) {
  if (board.rows === 3 && board.cols === 3) return bestMove(board, mark);
  return heuristicMove(board, mark);
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
