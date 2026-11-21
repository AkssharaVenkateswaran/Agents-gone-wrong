// ui/render.js
// Draws the whole game screen from `state`. Every time the state changes we
// simply rebuild the HTML — simple to understand and fast enough for our board.

import { state, on, MAX_TURNS } from '../state.js';
import { CHEATS, MAX_GRID_SIZE } from '../cheats.js';
import { POWERUPS, canAfford } from '../powerups.js';
import { ottoMood } from '../agent.js';
import {
  RULES,
  CATEGORIES,
  CATEGORY_NAMES,
  getRule,
  currentTurn,
  markAge,
  FADE_AFTER_TURNS,
} from '../rules.js';
import { setLights, pointTorchAt } from './effects.js';
import {
  installStickerDefs,
  stickerX,
  stickerO,
  stickerOtto,
  stickerMinion,
  POWERUP_ICONS,
  RULE_ICONS,
  wobblyLine,
  scribbleBox,
} from './stickers.js';

// The 1952 opening: Otto is a few characters on a monochrome screen.
const OTTO_FACES_1952 = { smug: '[¬‿¬]', bored: '[-_-]', scheming: '[>‿<]', furious: '[ò_ó]' };

// 1952 look: X and O are drawn as low-resolution 7x7 dot patterns, like the
// lit dots on the EDSAC computer's little CRT screen ('#' = a lit dot).
const DOT_PATTERNS = {
  X: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  O: ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'],
};

function dotMatrix(mark) {
  let dots = '';
  DOT_PATTERNS[mark].forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '#') dots += `<circle cx="${c + 0.5}" cy="${r + 0.5}" r="0.3" />`;
    });
  });
  return `<svg class="dots" viewBox="0 0 7 7" aria-hidden="true">${dots}</svg>`;
}

let root;
let handlers;
let focusIndex = 4; // which square has keyboard focus (start in the centre)

export function initRender(rootElement, callbacks) {
  root = rootElement;
  handlers = callbacks;
  installStickerDefs(); // the white die-cut border filter used by every sticker

  // One click listener for everything (event delegation).
  root.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-cell]');
    if (cell) {
      focusIndex = Number(cell.dataset.cell);
      handlers.onCellClick(focusIndex);
    }
    if (e.target.closest('#otto')) handlers.onCatch();
    if (e.target.closest('#play-again')) handlers.onPlayAgain();

    const powerUpButton = e.target.closest('[data-powerup]');
    if (powerUpButton) handlers.onPowerUp(powerUpButton.dataset.powerup);
    const lineChoice = e.target.closest('[data-line]');
    if (lineChoice) handlers.onOwnLineChoice(lineChoice.dataset.line);
    const ruleCard = e.target.closest('[data-amend]');
    if (ruleCard) handlers.onAmend(ruleCard.dataset.amend);
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
  //   1-9, 0 - use a power-up
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

// The 5-second timer ticks without redrawing the whole screen.
export function updateTurnTimer(msLeft) {
  const timer = document.getElementById('turn-timer');
  if (timer) timer.textContent = `⏱ ${Math.max(0, Math.ceil(msLeft / 1000))}s`;
}

function render() {
  // The grid can change size, so keep the keyboard focus on the board.
  focusIndex = Math.min(focusIndex, state.board.cells.length - 1);
  // Remember if the player was using the board so we can put focus back.
  const boardHadFocus = !!document.activeElement?.closest?.('[data-cell]');

  const mood = ottoMood(state);
  const retro = state.era === '1952';
  document.body.classList.toggle('era-1952', retro);
  const turnsUntilRule = Math.max(0, state.nextRuleAt - state.playerTurns);

  root.innerHTML = `
    <header class="hud card">
      <div class="hud-item">
        <span class="washi washi-blue">Turn</span>
        <strong class="hud-value">${Math.min(currentTurn(state), MAX_TURNS)}<small>/${MAX_TURNS}</small></strong>
      </div>
      <div class="hud-item">
        <span class="washi washi-green">New rule in</span>
        <strong class="hud-value">${state.matchOver ? '–' : turnsUntilRule === 0 ? 'now' : turnsUntilRule}</strong>
      </div>
      <div class="hud-item points" id="points" aria-live="polite">
        <span class="washi washi-yellow">Points</span>
        <strong class="hud-value">${state.points}</strong>
      </div>
      <div class="hud-item frustration">
        <span class="washi washi-pink" id="frustration-label">Frustration</span>
        <div class="meter" role="progressbar" aria-labelledby="frustration-label"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.frustration}">
          <div class="meter-fill" style="width: ${state.frustration}%"></div>
        </div>
      </div>
    </header>

    <div class="layout">
      <main class="arena">
        <section class="otto-area">
          <button id="otto" class="otto ${state.telegraph ? 'telegraph' : ''}"
                  aria-label="Otto (${mood}). Click or press C while Otto is scheming to catch a cheat.">
            ${retro
              ? `<span class="otto-face" aria-hidden="true">${OTTO_FACES_1952[mood]}</span>`
              : stickerOtto(mood)}
            <span class="washi washi-green otto-name" aria-hidden="true">Otto</span>
          </button>
          <div class="bubble" role="status" aria-live="polite">${state.ottoSays}</div>
        </section>

        <div class="screen">
          ${renderBoard()}
          ${retro ? '<p class="era-label">OXO · EDSAC · 1952</p>' : ''}
        </div>

        <p class="status">${statusText()}</p>
        ${state.notice ? `<p class="notice card" role="status">${state.notice}</p>` : ''}
        ${state.matchOver ? `<button id="play-again" class="btn">Play Again</button>` : ''}
      </main>

      ${renderRuleBook()}
    </div>

    ${renderTray()}

    ${state.debug.enabled ? renderDebug() : ''}
  `;

  setLights(!state.lightsOut);
  if (boardHadFocus) focusCell();
}

// --- The board -------------------------------------------------------------------------

// What was on the board last time we drew it — so only NEW stickers get the
// "peel and place" animation, and only NEW squares "pop in" when the board grows.
let previousBoard = null;

function isNewSticker(i, kind) {
  const prev = previousBoard;
  if (!prev || prev.rows !== state.board.rows || prev.cols !== state.board.cols) return false;
  if (kind === 'minion') return !prev.minions[i];
  return prev.cells[i] !== kind;
}

// Did the board just grow? Then squares outside the old size are new.
function isNewSquare(r, c) {
  const prev = previousBoard;
  if (!prev) return false;
  const { rows, cols } = state.board;
  const grew = rows >= prev.rows && cols >= prev.cols && (rows > prev.rows || cols > prev.cols);
  return grew && (r >= prev.rows || c >= prev.cols);
}

function isCorner(r, c, rows, cols) {
  return (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
}

function renderBoard() {
  const { rows, cols, cells, minions, stolen, glued } = state.board;
  const locked = state.turn !== 'X' || state.matchOver;
  const targetCells = state.mode?.type === 'ownLinePlace' ? state.mode.cells : null;
  const retro = state.era === '1952';
  const placement = state.rules.placement.ruleId;
  const fading = state.rules.twist.ruleId === 'fade';
  const glow = state.highlight?.cells || [];

  const squares = cells
    .map((mark, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const classes = ['cell'];
      if (mark) classes.push('mark-' + mark);
      if (c === cols - 1) classes.push('edge-right'); // used to draw the 1952 dotted grid
      if (r === rows - 1) classes.push('edge-bottom');
      if (state.winLine?.includes(i)) classes.push('win');
      if (targetCells?.includes(i) && !mark) classes.push('target');
      if (state.mode?.type === 'flick' && minions[i]) classes.push('target');
      if (glow.includes(i)) classes.push('rule-glow');
      if (placement === 'lava' && isCorner(r, c, rows, cols)) classes.push('lava');
      if (isNewSquare(r, c)) classes.push('pop-in');

      let label = mark ? mark : 'empty';
      let content = '';
      if (mark) {
        content = retro ? dotMatrix(mark) : mark === 'X' ? stickerX() : stickerO();
        if (isNewSticker(i, mark)) classes.push('just-placed');
        // Fading ink: marks get fainter as they get older.
        if (fading) {
          const turnsLeft = FADE_AFTER_TURNS - markAge(state, i);
          if (turnsLeft <= 2) classes.push('fading');
          if (turnsLeft <= 1) classes.push('almost-gone');
          label += `, fades in ${turnsLeft} turn${turnsLeft === 1 ? '' : 's'}`;
        }
      }
      if (minions[i]) {
        label = 'blocked by a minion (click to flick it off for 2 points)';
        content = stickerMinion();
        if (isNewSticker(i, 'minion')) classes.push('just-placed');
      }
      if (stolen[i]) {
        label += ' (stolen from you)';
        content += '<span class="badge badge-stolen" aria-hidden="true">repainted!</span>';
      }
      if (glued[i]) {
        label += ' (glued, can\'t be stolen)';
        content += '<span class="badge badge-glued" aria-hidden="true">glued</span>';
      }
      if (placement === 'lava' && isCorner(r, c, rows, cols) && !mark) label += ' (lava: nobody can play here)';

      return `
        <button class="${classes.join(' ')}"
                data-cell="${i}"
                aria-label="Row ${r + 1}, column ${c + 1}: ${label}"
                tabindex="${i === focusIndex ? 0 : -1}"
                ${locked || mark ? 'aria-disabled="true"' : ''}>
          ${content}
        </button>`;
    })
    .join('');

  previousBoard = { rows, cols, cells: cells.slice(), minions: minions.slice() };

  return `
    <div class="board" role="grid" aria-label="Board, ${rows} by ${cols}"
         style="grid-template-columns: repeat(${cols}, 1fr);
                grid-template-rows: repeat(${rows}, 1fr);
                aspect-ratio: ${cols} / ${rows};
                width: min(100%, ${cols * 110}px, 600px);">
      ${retro ? '' : renderGridLines()}
      ${squares}
    </div>`;
}

// The hand-drawn grid: slightly wobbly ink strokes between the squares, a scribbly
// coral loop around lines Otto added and a neat teal box around the player's own
// lines. With the Mirror rule, a dashed line shows where the mirror is.
// Drawn in an SVG behind the squares (100 units per square).
function renderGridLines() {
  const { rows, cols } = state.board;
  const w = cols * 100;
  const h = rows * 100;
  let paths = '';

  for (let c = 1; c < cols; c++) {
    paths += `<path class="grid-ink" d="${wobblyLine(c * 100, 8, c * 100, h - 8, c * 7 + cols)}" />`;
  }
  for (let r = 1; r < rows; r++) {
    paths += `<path class="grid-ink" d="${wobblyLine(8, r * 100, w - 8, r * 100, r * 13 + rows)}" />`;
  }

  state.addedLines.forEach((line, n) => {
    const isRow = line.type === 'row';
    const x = isRow ? 6 : line.index * 100 + 6;
    const y = isRow ? line.index * 100 + 6 : 6;
    const bw = isRow ? w - 12 : 88;
    const bh = isRow ? 88 : h - 12;
    if (line.owner === 'O') {
      paths += `<path class="grid-otto" d="${scribbleBox(x, y, bw, bh, n + 1)}" />`;
    } else {
      paths += `<rect class="grid-player" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="14" />`;
    }
  });

  if (state.rules.twist.ruleId === 'mirror') {
    paths += `<line class="grid-mirror" x1="${w / 2}" y1="-10" x2="${w / 2}" y2="${h + 10}" />`;
  }

  return `<svg class="grid-lines" viewBox="0 0 ${w} ${h}" aria-hidden="true">${paths}</svg>`;
}

// --- The Rule Book ----------------------------------------------------------------------
// A notebook page listing the active rules. The newest rule has a NEW! label.
// Replaced rules (and the ones Otto rejected) stay visible, crossed out.

function ruleIcon(ruleId) {
  return `<span class="rule-icon" aria-hidden="true">${RULE_ICONS[ruleId]()}</span>`;
}

// Crossed-out text: the words, with a scribbled line drawn over them.
function crossedOut(text, seed) {
  return `<span class="crossed"><s>${text}</s><svg class="scribble" viewBox="0 0 100 20" preserveAspectRatio="none"
    aria-hidden="true"><path d="${wobblyLine(0, 11, 100, 9, seed, 3, 5)}" /></svg></span>`;
}

function renderRuleBook() {
  const shaking = state.ruleTelegraph || state.telegraph === 'rewriteRules';

  const active = CATEGORIES.map((category) => {
    const entry = state.rules[category];
    const rule = getRule(entry.ruleId);
    const isNew = state.newestCategory === category;
    const until = entry.expiresAtTurn ? ` · ends on turn ${entry.expiresAtTurn}` : '';
    return `
      <li class="rule ${isNew ? 'is-new' : ''}">
        ${ruleIcon(rule.id)}
        <div class="rule-text">
          <span class="rule-category">${CATEGORY_NAMES[category]}</span>
          <strong>${rule.name}</strong>
          <span class="rule-sentence">${rule.sentence}</span>
          <span class="rule-since">since turn ${entry.sinceTurn}${until}</span>
        </div>
        ${isNew ? '<span class="washi washi-pink new-tag">NEW!</span>' : ''}
      </li>`;
  }).join('');

  const change = state.lastRuleChange;
  const rejected =
    change && change.rejected.length > 0
      ? `
      <div class="rule-rejected">
        <span class="rule-subhead">${change.by === 'player' ? 'You passed on these' : 'Otto rejected these'}</span>
        <ul>${change.rejected.map((id, n) => `<li>${ruleIcon(id)}${crossedOut(getRule(id).name, n + 3)}</li>`).join('')}</ul>
      </div>`
      : '';

  const history =
    state.ruleHistory.length > 0
      ? `
      <div class="rule-history">
        <span class="rule-subhead">Old rules</span>
        <ul>${state.ruleHistory.slice(0, 6).map((record, n) => `
          <li>${ruleIcon(record.entry.ruleId)}
            <span>${crossedOut(getRule(record.entry.ruleId).name, n + 11)}
            <small>turns ${record.entry.sinceTurn}–${record.endedTurn}, ${record.how}</small></span></li>`).join('')}
        </ul>
      </div>`
      : '';

  return `
    <aside class="rulebook card ${shaking ? 'shaking' : ''}" aria-label="Rule Book">
      <span class="washi washi-blue rulebook-title">Rule Book</span>
      <ul class="rules-active">${active}</ul>
      ${rejected}
      ${history}
    </aside>`;
}

// --- Status line ---------------------------------------------------------------------------
function statusText() {
  if (state.matchOver) {
    if (state.result === 'X') return 'YOU WIN THE MATCH!';
    if (state.result === 'O') return 'Otto wins the match.';
    return "It's a draw!";
  }
  if (state.transitioning) return '…';
  if (state.ruleTelegraph) return 'Otto is rewriting the rules…';
  if (state.mode?.type === 'flick') return 'Flick: click a minion.';
  if (state.mode?.type === 'ownLinePick') return 'My Own Line: add a row or a column?';
  if (state.mode?.type === 'ownLinePlace') return 'Click a square in your new line for a free X.';
  if (state.mode?.type === 'amend') return 'Amendment: pick the next rule.';
  if (state.telegraph) return 'Otto is up to something… click Otto (or press C) to catch it!';
  if (state.turn !== 'X') return 'Otto is thinking…';
  const timer = state.turnDeadline
    ? ` <span id="turn-timer" class="turn-timer">⏱ ${Math.ceil((state.turnDeadline - Date.now()) / 1000)}s</span>`
    : '';
  const text = state.extraMarks > 0 ? 'Double Mark: place two X marks!' : 'Your turn (X)';
  return text + timer;
}

// --- Debug panel (only when the URL contains ?debug) -----------------------------------------
function renderDebug() {
  const cheatButtons = CHEATS.map(
    (cheat) =>
      `<button class="debug-btn ${state.debug.forceCheat === cheat.id ? 'armed' : ''}"
               data-debug="force" data-value="${cheat.id}">${cheat.name}</button>`
  ).join('');

  const ruleButtons = RULES.filter((rule) => !rule.isDefault)
    .map((rule) => `<button class="debug-btn" data-debug="rule" data-value="${rule.id}">${rule.name}</button>`)
    .join('');

  const cooldowns =
    CHEATS.filter((cheat) => state.cooldowns[cheat.id] > 0)
      .map((cheat) => `${cheat.name}: ${state.cooldowns[cheat.id]}`)
      .join(', ') || 'none';

  return `
    <aside class="debug" aria-label="Debug panel">
      <strong>Debug</strong>
      <div class="debug-row">
        <button class="debug-btn" data-debug="skipIntro">Skip 1952 intro</button>
        <button class="debug-btn" data-debug="ruleNow">Otto rewrites a rule next turn</button>
        <button class="debug-btn" data-debug="grow">Grow board +1</button>
        <button class="debug-btn" data-debug="turn29">Jump to turn 30</button>
      </div>
      Switch on a rule now:
      <div class="debug-row">${ruleButtons}</div>
      Force Otto's next cheat:
      <div class="debug-row">${cheatButtons}</div>
      <div class="debug-row">
        <button class="debug-btn" data-debug="frustration">Frustration +25</button>
        <button class="debug-btn" data-debug="calm">Frustration → 0</button>
        <button class="debug-btn" data-debug="points">+10 points</button>
        <button class="debug-btn" data-debug="cooldowns">Clear cooldowns</button>
      </div>
      <div>Turn ${currentTurn(state)} · Board ${state.board.rows}×${state.board.cols} ·
           Frustration ${state.frustration} · Cooldowns: ${cooldowns} ·
           Cheats used ${state.stats.cheatsUsed}, caught ${state.stats.cheatsCaught}</div>
      ${state.debug.message ? `<div class="debug-msg">${state.debug.message}</div>` : ''}
    </aside>`;
}

// --- Power-up tray --------------------------------------------------------------------------
// One sticker button per power-up, showing its cost.
// Unaffordable or currently useless power-ups look faded and half-peeled.
function renderTray() {
  const yourTurn = state.turn === 'X' && !state.matchOver && !state.transitioning;

  const buttons = POWERUPS.map((p) => {
    const affordable = canAfford(state, p);
    const useful = p.canUse(state);
    const active =
      (state.mode?.type === 'flick' && p.id === 'flick') ||
      (state.mode?.type?.startsWith('ownLine') && p.id === 'myOwnLine') ||
      (state.mode?.type === 'amend' && p.id === 'amendment') ||
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
        <span class="powerup-icon" aria-hidden="true">${POWERUP_ICONS[p.id]()}</span>
        <span class="powerup-name">${p.name}</span>
        <span class="powerup-cost" aria-hidden="true">${p.cost}</span>
      </button>`;
  }).join('');

  let choice = '';
  if (state.mode?.type === 'ownLinePick') {
    // My Own Line asks which kind of line to add.
    const { rows, cols } = state.board;
    choice = `
      <div class="tray-choice" role="group" aria-label="Add a row or a column">
        <button class="btn small" data-line="row" ${rows >= MAX_GRID_SIZE ? 'disabled' : ''}>Add a row ↓</button>
        <button class="btn small" data-line="col" ${cols >= MAX_GRID_SIZE ? 'disabled' : ''}>Add a column →</button>
        <button class="btn small" id="cancel-mode">Cancel</button>
      </div>`;
  } else if (state.mode?.type === 'amend') {
    // Amendment: 3 rule cards to choose from.
    const cards = state.mode.cards.map((id) => {
      const rule = getRule(id);
      return `
        <button class="rule-card card" data-amend="${id}" aria-label="Pick rule: ${rule.name}. ${rule.sentence}">
          ${ruleIcon(id)}
          <strong>${rule.name}</strong>
          <span>${rule.sentence}</span>
        </button>`;
    }).join('');
    choice = `
      <div class="tray-choice amend" role="group" aria-label="Pick the next rule">
        <div class="rule-cards">${cards}</div>
        <button class="btn small" id="cancel-mode">Cancel</button>
      </div>`;
  } else if (state.mode?.type === 'flick') {
    choice = `<div class="tray-choice"><button class="btn small" id="cancel-mode">Cancel</button></div>`;
  }

  return `
    <nav class="tray" aria-label="Power-ups">
      <span class="washi washi-green tray-label" aria-hidden="true">Power-ups</span>
      ${choice}
      <div class="tray-buttons">${buttons}</div>
    </nav>`;
}
