// ui/render.js
// Draws the whole game screen from `state`. Every time the state changes we
// simply rebuild the HTML — simple to understand and fast enough for a small board.

import { state, on } from '../state.js';
import { lineCells } from '../board.js';
import { CHEATS, MAX_GRID_SIZE } from '../cheats.js';
import { POWERUPS, canAfford } from '../powerups.js';
import { ottoMood } from '../agent.js';
import { setLights, pointTorchAt } from './effects.js';

// Placeholder faces until the sticker art pass (Milestone 4).
const OTTO_FACES = { smug: '😏', bored: '😑', scheming: '😈', furious: '😡' };

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
    if (e.target.closest('#otto')) handlers.onCatch();
    if (e.target.closest('#next-round')) handlers.onNextRound();
    if (e.target.closest('#play-again')) handlers.onPlayAgain();

    const powerUpButton = e.target.closest('[data-powerup]');
    if (powerUpButton) handlers.onPowerUp(powerUpButton.dataset.powerup);
    const lineChoice = e.target.closest('[data-line]');
    if (lineChoice) handlers.onOwnLineChoice(lineChoice.dataset.line);
    if (e.target.closest('#cancel-mode')) handlers.onCancel();

    const debugButton = e.target.closest('[data-debug]');
    if (debugButton) handlers.onDebug(debugButton.dataset.debug, debugButton.dataset.value);
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

  // Keyboard shortcuts anywhere on the page:
  //   C      - catch Otto mid-cheat
  //   1-8    - use a power-up
  //   Escape - cancel a power-up that is waiting for a click
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'c' || e.key === 'C') handlers.onCatch();
    else if (e.key === 'Escape') handlers.onCancel();
    else {
      const powerUp = POWERUPS.find((p) => p.key === e.key);
      if (powerUp) handlers.onPowerUp(powerUp.id);
    }
  });

  on('render', render);
}

function focusCell() {
  const cell = root.querySelector(`[data-cell="${focusIndex}"]`);
  cell?.focus();
  pointTorchAt(cell);
}

function render() {
  // The grid can change size (Extra Line / Board Spin), so keep focus on the board.
  focusIndex = Math.min(focusIndex, state.board.cells.length - 1);
  // Remember if the player was using the board so we can put focus back.
  const boardHadFocus = !!document.activeElement?.closest?.('[data-cell]');

  const mood = ottoMood(state);

  root.innerHTML = `
    <header class="hud">
      <div class="hud-item">Round <strong>${state.round}</strong></div>
      <div class="hud-item score">
        You <strong>${state.score.player}</strong> – <strong>${state.score.otto}</strong> Otto
      </div>
      <div class="hud-item points" id="points" aria-live="polite">
        Points <strong>${state.points}</strong>
      </div>
      <div class="hud-item frustration">
        <span id="frustration-label">Frustration</span>
        <div class="meter" role="progressbar" aria-labelledby="frustration-label"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.frustration}">
          <div class="meter-fill" style="width: ${state.frustration}%"></div>
        </div>
      </div>
    </header>

    <main class="arena">
      <section class="otto-area">
        <button id="otto" class="otto ${state.telegraph ? 'telegraph' : ''}"
                aria-label="Otto (${mood}). Click or press C while Otto is scheming to catch a cheat.">
          <span class="otto-face" aria-hidden="true">${OTTO_FACES[mood]}</span>
        </button>
        <div class="bubble" role="status" aria-live="polite">${state.ottoSays}</div>
      </section>

      ${renderBoard()}

      <p class="status">${statusText()}</p>
      ${state.notice ? `<p class="notice" role="status">${state.notice}</p>` : ''}
      ${renderButtons()}
    </main>

    ${renderTray()}

    ${state.debug.enabled ? renderDebug() : ''}
  `;

  setLights(!state.lightsOut);
  if (boardHadFocus) focusCell();
}

function renderBoard() {
  const { rows, cols, cells, minions, stolen } = state.board;
  const locked = state.turn !== 'X' || state.roundOver;
  const targetCells = state.mode?.type === 'ownLinePlace' ? state.mode.cells : null;

  // Which squares belong to a line Otto (or later, the player) added?
  const lineOwner = {};
  for (const line of state.addedLines) {
    for (const i of lineCells(state.board, line.type, line.index)) lineOwner[i] = line.owner;
  }

  const squares = cells
    .map((mark, i) => {
      const r = Math.floor(i / cols) + 1;
      const c = (i % cols) + 1;
      const classes = ['cell'];
      if (mark) classes.push('mark-' + mark);
      if (state.winLine?.includes(i)) classes.push('win');
      if (lineOwner[i]) classes.push('line-' + lineOwner[i]);
      if (stolen[i]) classes.push('stolen');
      if (state.board.glued[i]) classes.push('glued');
      if (targetCells?.includes(i) && !mark) classes.push('target');
      if (state.mode?.type === 'flick' && minions[i]) classes.push('target');

      let label = mark ? mark : 'empty';
      let content = mark ?? '';
      if (minions[i]) {
        label = 'blocked by a minion (click to flick it off for 2 points)';
        content = '<span class="minion" aria-hidden="true">•‿•</span>';
      }
      if (stolen[i]) label += ' (stolen from you)';
      if (state.board.glued[i]) label += ' (glued, can\'t be stolen)';

      return `
        <button class="${classes.join(' ')}"
                data-cell="${i}"
                aria-label="Row ${r}, column ${c}: ${label}"
                tabindex="${i === focusIndex ? 0 : -1}"
                ${locked || mark ? 'aria-disabled="true"' : ''}>
          ${content}
        </button>`;
    })
    .join('');

  return `
    <div class="board" role="grid" aria-label="Tic-tac-toe board, ${rows} by ${cols}"
         style="grid-template-columns: repeat(${cols}, 1fr);
                grid-template-rows: repeat(${rows}, 1fr);
                aspect-ratio: ${cols} / ${rows};
                width: min(100%, ${cols * 110}px);">
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
  if (state.mode?.type === 'flick') return 'Flick: click a minion.';
  if (state.mode?.type === 'ownLinePick') return 'My Own Line: add a row or a column?';
  if (state.mode?.type === 'ownLinePlace') return 'Click a square in your new line for a free X.';
  if (state.extraMarks > 0 && state.turn === 'X') return 'Double Mark: place two X marks!';
  if (state.telegraph) return 'Otto is up to something… click Otto (or press C) to catch it!';
  return state.turn === 'X' ? 'Your turn (X)' : 'Otto is thinking…';
}

function renderButtons() {
  if (state.matchOver) return `<button id="play-again" class="btn">Play Again</button>`;
  if (state.roundOver) return `<button id="next-round" class="btn">Next Round</button>`;
  return '';
}

// A testing panel, only shown when the URL contains ?debug
function renderDebug() {
  const cheatButtons = CHEATS.map(
    (cheat) =>
      `<button class="debug-btn ${state.debug.forceCheat === cheat.id ? 'armed' : ''}"
               data-debug="force" data-value="${cheat.id}">${cheat.name}</button>`
  ).join('');

  const cooldowns =
    CHEATS.filter((cheat) => state.cooldowns[cheat.id] > 0)
      .map((cheat) => `${cheat.name}: ${state.cooldowns[cheat.id]}`)
      .join(', ') || 'none';

  return `
    <aside class="debug" aria-label="Debug panel">
      <strong>Debug</strong> — force Otto's next cheat:
      <div class="debug-row">${cheatButtons}</div>
      <div class="debug-row">
        <button class="debug-btn" data-debug="round2">Jump to round 2+</button>
        <button class="debug-btn" data-debug="frustration">Frustration +25</button>
        <button class="debug-btn" data-debug="calm">Frustration → 0</button>
        <button class="debug-btn" data-debug="points">+10 points</button>
        <button class="debug-btn" data-debug="cooldowns">Clear cooldowns</button>
      </div>
      <div>Frustration: ${state.frustration} · Cooldowns: ${cooldowns} ·
           Cheats used: ${state.stats.cheatsUsed} · caught: ${state.stats.cheatsCaught}</div>
      ${state.debug.message ? `<div class="debug-msg">${state.debug.message}</div>` : ''}
    </aside>`;
}

// The power-up tray: one sticker button per power-up, showing its cost.
// Unaffordable or currently useless power-ups look faded and half-peeled.
function renderTray() {
  const yourTurn = state.turn === 'X' && !state.roundOver && !state.matchOver;

  const buttons = POWERUPS.map((p) => {
    const affordable = canAfford(state, p);
    const useful = p.canUse(state);
    const active =
      (state.mode?.type === 'flick' && p.id === 'flick') ||
      (state.mode?.type?.startsWith('ownLine') && p.id === 'myOwnLine') ||
      (state.extraMarks > 0 && p.id === 'doubleMark');
    const faded = !yourTurn || !affordable || !useful;

    let why = '';
    if (!affordable) why = ` Not enough points.`;
    else if (!useful) why = ` Nothing to use it on right now.`;

    return `
      <button class="powerup ${faded ? 'faded' : ''} ${active ? 'active' : ''}"
              data-powerup="${p.id}"
              aria-label="${p.name}, costs ${p.cost} points. ${p.help}${why} Shortcut: ${p.key}."
              title="${p.help} (key ${p.key})"
              ${faded ? 'aria-disabled="true"' : ''}>
        <span class="powerup-key" aria-hidden="true">${p.key}</span>
        <span class="powerup-name">${p.name}</span>
        <span class="powerup-cost" aria-hidden="true">${p.cost}</span>
      </button>`;
  }).join('');

  // My Own Line asks which kind of line to add.
  let choice = '';
  if (state.mode?.type === 'ownLinePick') {
    const { rows, cols } = state.board;
    choice = `
      <div class="tray-choice" role="group" aria-label="Add a row or a column">
        <button class="btn small" data-line="row" ${rows >= MAX_GRID_SIZE ? 'disabled' : ''}>Add a row ↓</button>
        <button class="btn small" data-line="col" ${cols >= MAX_GRID_SIZE ? 'disabled' : ''}>Add a column →</button>
        <button class="btn small" id="cancel-mode">Cancel</button>
      </div>`;
  } else if (state.mode?.type === 'flick') {
    choice = `<div class="tray-choice"><button class="btn small" id="cancel-mode">Cancel</button></div>`;
  }

  return `
    <nav class="tray" aria-label="Power-ups">
      ${choice}
      <div class="tray-buttons">${buttons}</div>
    </nav>`;
}
