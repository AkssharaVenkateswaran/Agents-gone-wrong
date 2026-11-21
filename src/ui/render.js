// ui/render.js
// Draws the whole game screen from `state`. Every time the state changes we
// simply rebuild the HTML — simple to understand and fast enough for a 3x3 board.

import { state, on } from '../state.js';

let root;
let handlers;
let focusIndex = 4; // which square has keyboard focus (start in the centre)

export function initRender(rootElement, callbacks) {
  root = rootElement;
  handlers = callbacks;

  // One click listener for everything (event delegation).
  root.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-cell]');
    if (cell) {
      focusIndex = Number(cell.dataset.cell);
      handlers.onCellClick(focusIndex);
    }
    if (e.target.closest('#next-round')) handlers.onNextRound();
    if (e.target.closest('#play-again')) handlers.onPlayAgain();
  });

  // Arrow keys move around the board. Enter/Space press the focused
  // square (that comes for free because squares are <button>s).
  root.addEventListener('keydown', (e) => {
    if (!e.target.closest('[data-cell]')) return;
    const { rows, cols } = state.board;
    let r = Math.floor(focusIndex / cols);
    let c = focusIndex % cols;
    if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (e.key === 'ArrowDown') r = Math.min(rows - 1, r + 1);
    else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowRight') c = Math.min(cols - 1, c + 1);
    else return;
    e.preventDefault();
    focusIndex = r * cols + c;
    focusCell();
  });

  on('render', render);
}

function focusCell() {
  root.querySelector(`[data-cell="${focusIndex}"]`)?.focus();
}

function render() {
  // Remember if the player was using the board so we can put focus back.
  const boardHadFocus = !!document.activeElement?.closest?.('[data-cell]');

  root.innerHTML = `
    <header class="hud">
      <div class="hud-item">Round <strong>${state.round}</strong></div>
      <div class="hud-item score">
        You <strong>${state.score.player}</strong> – <strong>${state.score.otto}</strong> Otto
      </div>
      <div class="hud-item">First to 3</div>
    </header>

    <main class="arena">
      <section class="otto">
        <div class="otto-face" aria-hidden="true">🤖</div>
        <div class="bubble" role="status" aria-live="polite">${state.ottoSays}</div>
      </section>

      ${renderBoard()}

      <p class="status">${statusText()}</p>
      ${renderButtons()}
    </main>
  `;

  if (boardHadFocus) focusCell();
}

function renderBoard() {
  const { rows, cols, cells } = state.board;
  const locked = state.turn !== 'X' || state.roundOver;

  const squares = cells
    .map((mark, i) => {
      const r = Math.floor(i / cols) + 1;
      const c = (i % cols) + 1;
      const winClass = state.winLine?.includes(i) ? ' win' : '';
      const label = `Row ${r}, column ${c}: ${mark ? mark : 'empty'}`;
      return `
        <button class="cell ${mark ? 'mark-' + mark : ''}${winClass}"
                data-cell="${i}"
                aria-label="${label}"
                tabindex="${i === focusIndex ? 0 : -1}"
                ${locked || mark ? 'aria-disabled="true"' : ''}>
          ${mark ?? ''}
        </button>`;
    })
    .join('');

  return `
    <div class="board" role="grid" aria-label="Tic-tac-toe board"
         style="grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr);">
      ${squares}
    </div>`;
}

function statusText() {
  if (state.matchOver) {
    return state.score.player > state.score.otto ? 'YOU WIN THE MATCH!' : 'Otto wins the match.';
  }
  if (state.roundOver) {
    if (state.roundResult === 'X') return 'You won the round!';
    if (state.roundResult === 'O') return 'Otto won the round.';
    return "It's a draw.";
  }
  return state.turn === 'X' ? 'Your turn (X)' : 'Otto is thinking…';
}

function renderButtons() {
  if (state.matchOver) return `<button id="play-again" class="btn">Play Again</button>`;
  if (state.roundOver) return `<button id="next-round" class="btn">Next Round</button>`;
  return '';
}
