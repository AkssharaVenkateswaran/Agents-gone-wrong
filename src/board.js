// board.js
// The grid model, win detection and the minimax algorithm.
//
// A board is a plain object: { rows, cols, cells }
//   cells is a flat array of length rows * cols.
//   Each cell is null (empty), 'X' or 'O'.
//   The cell at (row, col) is stored at index row * cols + col.

export const LINE_LENGTH = 3; // how many in a row you need to win

export function createBoard(rows, cols) {
  return { rows, cols, cells: new Array(rows * cols).fill(null) };
}

// Make an independent copy (so minimax can try moves without
// changing the real board).
export function cloneBoard(board) {
  return { rows: board.rows, cols: board.cols, cells: board.cells.slice() };
}

export function emptyCells(board) {
  const result = [];
  board.cells.forEach((cell, i) => {
    if (cell === null) result.push(i);
  });
  return result;
}

export function isFull(board) {
  return emptyCells(board).length === 0;
}

// Look for 3 in a row ANYWHERE on the grid, of any size.
// From every square we look in 4 directions:
//   right (0,1), down (1,0), down-right (1,1) and down-left (1,-1).
// Returns { mark: 'X' | 'O', line: [i1, i2, i3] } or null if nobody has won.
export function findWinner(board) {
  const { rows, cols, cells } = board;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mark = cells[r * cols + c];
      if (mark !== 'X' && mark !== 'O') continue; // only real marks count

      for (const [dr, dc] of directions) {
        const line = [];
        for (let step = 0; step < LINE_LENGTH; step++) {
          const rr = r + dr * step;
          const cc = c + dc * step;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) break; // off the grid
          if (cells[rr * cols + cc] !== mark) break;               // chain broken
          line.push(rr * cols + cc);
        }
        if (line.length === LINE_LENGTH) return { mark, line };
      }
    }
  }
  return null;
}

// --- Minimax -------------------------------------------------------------
// Minimax tries every possible future game and picks the move that is best
// assuming the opponent also plays perfectly.
// Scores (from the point of view of `me`):
//   +10 for a win, -10 for a loss, 0 for a draw.
// We subtract/add the depth so a FASTER win (or a SLOWER loss) is preferred.
// Only used on the standard 3x3 grid (it would be too slow on big grids).

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
  return bestIndexes[Math.floor(Math.random() * bestIndexes.length)];
}
