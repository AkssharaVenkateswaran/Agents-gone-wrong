// ui/render.js
// Draws the whole screen from `state`, in retro pixel-art style. Every time the
// state changes we simply rebuild the HTML — simple to understand, and fast enough.
//
// Layout (full screen):
//   top bar:  title · score · Snowflake disk · mute
//   left:     TOOLBOX.EXE  (points + power-up floppy disks)
//   centre:   turn indicator, the big CRT monitor (win banner + board), message line
//   right:    Otto's little CRT, his speech bubble, patience bar, RULES.TXT

import { state, on, MAX_TURNS } from '../state.js';
import { CHEATS, MAX_GRID_SIZE } from '../cheats.js';
import { POWERUPS, canAfford } from '../powerups.js';
import { ottoMood } from '../agent.js';
import {
  RULES,
  CATEGORIES,
  RULE_DIAGRAMS,
  REVERSE_DAY_TURNS,
  getRule,
  currentTurn,
  markAge,
  winBanner,
  FADE_AFTER_TURNS,
} from '../rules.js';
import { MAX_NAME_LENGTH } from '../matchLog.js';
import { setLights, pointTorchAt } from './effects.js';
import {
  sprite,
  floppy,
  frameImage,
  svgDataUri,
  timerRing,
  X_SPRITE,
  O_SPRITE,
  MINION_SPRITE,
  OTTO_CASING,
  OTTO_FACES,
  STAR_SPRITE,
  SPEAKER_ON,
  SPEAKER_OFF,
  HOURGLASS,
  RULE_ICONS,
  CURSOR_ARROW,
  CURSOR_HAND,
} from './sprites.js';

// Short names that fit on a floppy disk label, and each disk's colour.
const DISK_LABELS = {
  flick: 'FLICK', lightSwitch: 'LIGHTS', eraser: 'ERASER', paperweight: 'WEIGHT',
  glueStick: 'GLUE', timeOut: 'TIME OUT', myOwnLine: 'MY LINE', doubleMark: '2X MARK',
  veto: 'VETO', amendment: 'AMEND',
};
const DISK_COLOURS = {
  flick: 'c', lightSwitch: 'y', eraser: 'p', paperweight: 'm', glueStick: 'l',
  timeOut: 'u', myOwnLine: 'n', doubleMark: 'w', veto: 'p', amendment: 'c',
};
const CATEGORY_LABELS = { win: 'WIN', placement: 'PLACE', twist: 'TWIST' };

let root;
let handlers;
let focusIndex = 4;        // which square has keyboard focus (start in the centre)
let insertingDisk = null;  // the disk that was just clicked (plays the "insert" slide once)

export function initRender(rootElement, callbacks) {
  root = rootElement;
  handlers = callbacks;
  installPixelKit();
  buildBackdrop();

  // One click listener for everything (event delegation).
  root.addEventListener('click', (e) => {
    const t = e.target;
    const cell = t.closest('[data-cell]');
    if (cell) {
      focusIndex = Number(cell.dataset.cell);
      handlers.onCellClick(focusIndex);
    }
    if (t.closest('#otto')) handlers.onCatch();
    if (t.closest('#play-again')) handlers.onPlayAgain();
    if (t.closest('#mute')) handlers.onMute();
    const disk = t.closest('[data-powerup]');
    if (disk) {
      insertingDisk = disk.dataset.powerup;
      handlers.onPowerUp(disk.dataset.powerup);
    }
    const lineChoice = t.closest('[data-line]');
    if (lineChoice) handlers.onOwnLineChoice(lineChoice.dataset.line);
    if (t.closest('[data-rule-ok]')) handlers.onRuleOk();
    const card = t.closest('[data-amend]');
    if (card) handlers.onRuleOk(card.dataset.amend);
    if (t.closest('#cancel-mode')) handlers.onCancel();
    const debugButton = t.closest('[data-debug]');
    if (debugButton) handlers.onDebug(debugButton.dataset.debug, debugButton.dataset.value);
  });

  // The title screen's name form.
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'name-form') return;
    e.preventDefault();
    handlers.onStart(e.target.elements.playerName.value);
  });

  // Arrow keys move around the board. Enter/Space press the focused square.
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

  // Keyboard shortcuts anywhere: C = catch Otto, 1-9 and 0 = power-ups, Esc = cancel.
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea')) return; // typing a name, not playing
    if (state.screen !== 'game') return;
    if (e.key === 'c' || e.key === 'C') handlers.onCatch();
    else if (e.key === 'Escape') handlers.onCancel();
    else {
      const powerUp = POWERUPS.find((p) => p.key === e.key);
      if (powerUp) {
        insertingDisk = powerUp.id;
        handlers.onPowerUp(powerUp.id);
      }
    }
  });

  // Keep the debug panel open/closed across redraws.
  root.addEventListener('toggle', (e) => {
    if (e.target.classList?.contains('debug')) state.debug.open = e.target.open;
  }, true);

  window.addEventListener('resize', afterRender);
  on('render', render);
}

// Pixel window frames and pixel cursors, made from sprites and handed to CSS.
function installPixelKit() {
  const css = document.documentElement.style;
  // name: [fill, shade]
  const frames = {
    cream: ['#F4EBD0', '#CFC3A0'], yellow: ['#FFE45C', '#D9B92E'], navy: ['#1B2A6B', '#101A45'],
    lavender: ['#C8C2E8', '#8E86C4'], lime: ['#9BE564', '#5FAE3C'], pink: ['#FF4F9A', '#C42A74'],
  };
  for (const [name, [fill, shade]] of Object.entries(frames)) {
    css.setProperty(`--frame-${name}`, frameImage(fill, shade));
  }
  css.setProperty('--cursor-arrow', `${svgDataUri(CURSOR_ARROW, undefined, 2)} 0 0, auto`);
  css.setProperty('--cursor-hand', `${svgDataUri(CURSOR_HAND, undefined, 2)} 8 0, pointer`);
}

// The wall behind everything: a few slowly drifting floppy disks and binary digits.
function buildBackdrop() {
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  const items = [];
  const colours = ['c', 'p', 'l', 'y'];
  for (let n = 0; n < 6; n++) {
    items.push(`<span class="drift floppy-drift" style="left:${6 + n * 16}%;animation-delay:-${n * 7}s">${sprite(floppy(colours[n % 4]))}</span>`);
  }
  for (let n = 0; n < 10; n++) {
    items.push(`<span class="drift bit" style="left:${3 + n * 10}%;animation-delay:-${n * 4}s">${n % 3 ? '1' : '0'}</span>`);
  }
  backdrop.innerHTML = items.join('');
  document.body.prepend(backdrop);
}

function focusCell() {
  const cell = root.querySelector(`[data-cell="${focusIndex}"]`);
  cell?.focus();
  pointTorchAt(cell);
}

// Where is a RULES.TXT row on screen? (The NEW_RULE.EXE pop-up minimises into it.)
export function ruleRowPosition(category) {
  const row = document.querySelector(`.rule-row[data-category="${category}"]`);
  if (!row) return null;
  const box = row.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// The turn timer ticks without redrawing the whole screen.
export function updateTurnTimer(msLeft, msTotal) {
  const timer = document.getElementById('turn-timer');
  if (!timer) return;
  const seconds = Math.max(0, Math.ceil(msLeft / 1000));
  timer.innerHTML = `${sprite(timerRing(Math.max(0, msLeft) / msTotal), 'ring')}<span>${seconds}s</span>`;
}

// Names come from players, so never put them into HTML as-is.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// A retro window title bar with decorative _ □ × buttons.
function titleBar(title) {
  return `<div class="title-bar"><span>${title}</span><span class="title-buttons" aria-hidden="true">_ □ ×</span></div>`;
}

// --- Drawing ---------------------------------------------------------------------------------

function render() {
  if (state.screen === 'title') {
    renderTitle();
    return;
  }
  focusIndex = Math.min(focusIndex, state.board.cells.length - 1);
  const boardHadFocus = !!document.activeElement?.closest?.('[data-cell]');

  root.innerHTML = `
    ${renderTopBar()}
    <div class="main">
      ${renderToolbox()}
      ${renderCentre()}
      <aside class="otto-side">
        ${renderOtto()}
        ${renderRules()}
      </aside>
    </div>
    ${state.ending === 'banner' ? renderEnding() : ''}
    ${state.debug.enabled ? renderDebug() : ''}
  `;
  insertingDisk = null;

  setLights(!state.lightsOut);
  if (boardHadFocus) focusCell();
  afterRender();
}

// Things that need the real sizes of elements on screen.
function afterRender() {
  // 1. Marks are pixel sprites scaled by a WHOLE number to fit the squares.
  const board = root.querySelector('.board');
  const cell = root.querySelector('.cell');
  if (board && cell) {
    const px = Math.max(1, Math.floor((cell.clientWidth * 0.78) / 16));
    board.style.setProperty('--mark-px', px);
  }
  // 2. The NEW_RULE.EXE pop-up minimises into its row in RULES.TXT.
  const popup = root.querySelector('.rule-popup-stack.minimise');
  const target = state.ruleScene?.target;
  if (popup && target) {
    const box = popup.getBoundingClientRect();
    const dx = target.x - (box.left + box.width / 2);
    const dy = target.y - (box.top + box.height / 2);
    requestAnimationFrame(() => {
      popup.style.transform = `translate(${dx}px, ${dy}px) scale(0.08)`;
      popup.style.opacity = '0';
    });
  }
  // 3. Lights Out: the CRT keeps a glowing outline above the darkness.
  let glow = document.querySelector('.monitor-glow');
  const casing = root.querySelector('.casing');
  if (state.lightsOut && casing) {
    if (!glow) {
      glow = document.createElement('div');
      glow.className = 'monitor-glow';
      document.body.appendChild(glow);
    }
    const box = casing.getBoundingClientRect();
    Object.assign(glow.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  } else if (glow) {
    glow.remove();
  }
  // 4. Keyboard users land on the pop-up's button.
  const ok = root.querySelector('.rule-popup-stack.show [data-rule-ok], .rule-popup-stack.pick [data-amend]');
  if (ok && !ok.closest('.rule-popup').contains(document.activeElement)) ok.focus({ preventScroll: true });
}

// --- Title screen --------------------------------------------------------------------------
function renderTitle() {
  setLights(true);
  root.innerHTML = `
    <section class="title-screen">
      <div class="window login">
        ${titleBar('LOGIN.EXE')}
        <div class="window-body">
          <h1 class="game-title big">AGENTS GONE WRONG</h1>
          <div class="title-otto">${sprite(OTTO_CASING, 'otto-casing')}<span class="otto-face">${sprite(OTTO_FACES.smug)}</span></div>
          <p class="premise">Tic-tac-toe is solved. The agent didn't like that.</p>
          <form id="name-form" class="name-form">
            <label for="player-name">&gt; ENTER YOUR NAME:</label>
            <input id="player-name" name="playerName" class="name-input" type="text"
                   maxlength="${MAX_NAME_LENGTH}" autocomplete="nickname" spellcheck="false"
                   value="${escapeHtml(state.playerName)}" />
            <button class="btn" type="submit">PLAY</button>
          </form>
        </div>
      </div>
    </section>`;
  root.querySelector('#player-name').focus();
}

// --- Top bar -----------------------------------------------------------------------------------
function renderTopBar() {
  const memory = state.memory.status;
  const memoryText = {
    ready: "Otto's memory (Snowflake) is connected",
    loading: "Otto's memory (Snowflake) is loading",
    offline: "Otto's memory (Snowflake) is offline: playing with scripted lines",
    idle: "Otto's memory (Snowflake)",
  }[memory];
  return `
    <header class="topbar">
      <h1 class="game-title">AGENTS GONE WRONG</h1>
      <div class="score" aria-label="Matches won: you ${state.session.you}, Otto ${state.session.otto}">
        YOU <b>${state.session.you}</b> – <b>${state.session.otto}</b> OTTO
      </div>
      <div class="topbar-right">
        <span class="memory-disk ${memory}" title="${memoryText}" role="img" aria-label="${memoryText}">
          ${sprite(floppy('n'))}<span class="memory-light"></span>
        </span>
        <button id="mute" class="icon-btn" aria-label="${state.muted ? 'Turn sound on' : 'Mute sound'}" aria-pressed="${state.muted}">
          ${sprite(state.muted ? SPEAKER_OFF : SPEAKER_ON)}
        </button>
      </div>
    </header>`;
}

// --- Left: TOOLBOX.EXE -----------------------------------------------------------------------
function renderToolbox() {
  const yourTurn = state.turn === 'X' && !state.matchOver && !state.ruleScene;
  const disks = POWERUPS.map((p) => {
    const affordable = canAfford(state, p);
    const useful = p.canUse(state);
    const active =
      (state.mode?.type === 'flick' && p.id === 'flick') ||
      (state.mode?.type?.startsWith('ownLine') && p.id === 'myOwnLine') ||
      (state.extraMarks > 0 && p.id === 'doubleMark') ||
      (state.amendmentPending && p.id === 'amendment');
    const greyed = !yourTurn || !affordable || !useful;
    let why = '';
    if (!affordable) why = ' Not enough points.';
    else if (!useful) why = ' Nothing to use it on right now.';
    return `
      <button class="disk ${greyed ? 'greyed' : ''} ${active ? 'active' : ''} ${insertingDisk === p.id ? 'inserting' : ''}"
              data-powerup="${p.id}"
              aria-label="${p.name}, costs ${p.cost} points. ${p.help}${why} Shortcut key ${p.key}."
              title="${p.name}: ${p.help}"
              ${greyed ? 'aria-disabled="true"' : ''}>
        ${sprite(floppy(DISK_COLOURS[p.id]))}
        <span class="disk-label">${DISK_LABELS[p.id]}</span>
        <span class="disk-cost">${p.cost}</span>
        <span class="disk-key" aria-hidden="true">${p.key}</span>
      </button>`;
  }).join('');

  return `
    <aside class="toolbox window" aria-label="Your toolbox">
      ${titleBar('TOOLBOX.EXE')}
      <div class="window-body">
        <div class="points" id="points" aria-live="polite">
          ${sprite(STAR_SPRITE)} <b>${state.points}</b> PTS
        </div>
        <div class="disks">${disks}</div>
      </div>
    </aside>`;
}

// --- Centre: turn indicator, CRT monitor with the board, message line ----------------------
function renderCentre() {
  let indicator;
  let tone = 'otto';
  if (state.matchOver) {
    indicator = '&gt; GAME OVER';
  } else if (state.ruleScene) {
    indicator = '&gt; NEW RULE...';
  } else if (state.turn === 'X') {
    tone = 'you';
    const what = state.mode?.type === 'ownLinePlace' ? 'PLACE YOUR FREE X' : state.extraMarks > 0 ? 'PLACE 2 X MARKS' : 'YOUR TURN';
    indicator = `&gt; ${what}<span class="cursor" aria-hidden="true">_</span>`;
  } else if (state.telegraph) {
    indicator = '&gt; OTTO IS UP TO SOMETHING... CLICK OTTO!';
  } else {
    indicator = '&gt; OTTO IS THINKING...';
  }
  const timer =
    state.turnDeadline && state.turn === 'X'
      ? `<span id="turn-timer" class="turn-timer" aria-label="Turn timer">${sprite(timerRing(1), 'ring')}<span>10s</span></span>`
      : '';

  const { rows, cols } = state.board;
  const classes = ['monitor'];
  if (state.ruleScene) classes.push('dimmed');
  if (state.ending === 'flip') classes.push('flip');

  return `
    <section class="centre">
      <p class="turn-indicator ${tone}" role="status" aria-live="polite">${indicator}${timer}</p>
      <div class="monitor-area">
        <div class="${classes.join(' ')}">
          <div class="casing">
            <div class="screen">
              <div class="win-banner">${winBanner(state)}</div>
              <div class="board-area">
                <div class="board" role="grid" aria-label="Board, ${rows} by ${cols}"
                     style="--cols:${cols};--rows:${rows}">${renderCells()}</div>
              </div>
              ${renderPopups()}
            </div>
            <span class="power-led" aria-hidden="true"></span>
          </div>
          <div class="stand" aria-hidden="true"></div>
        </div>
      </div>
      <p class="message-line" role="status">${state.notice || '&nbsp;'}</p>
    </section>`;
}

// What was on the board last time we drew it — so only NEW marks "dissolve in",
// and only NEW squares "pop in" when the board grows.
let previousBoard = null;

function renderCells() {
  const { rows, cols, cells, minions, stolen, glued } = state.board;
  const locked = state.turn !== 'X' || state.matchOver || !!state.ruleScene;
  const targetCells = state.mode?.type === 'ownLinePlace' ? state.mode.cells : null;
  const placement = state.rules.placement.ruleId;
  const fading = state.rules.twist.ruleId === 'fade';
  const glow = state.highlight?.cells || [];
  const prev = previousBoard;
  const sameSize = prev && prev.rows === rows && prev.cols === cols;
  const grew = prev && rows >= prev.rows && cols >= prev.cols && (rows > prev.rows || cols > prev.cols);

  const html = cells
    .map((mark, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
      const classes = ['cell'];
      if (state.winLine?.includes(i)) classes.push('win');
      if (targetCells?.includes(i) && !mark) classes.push('target');
      if (state.mode?.type === 'flick' && minions[i]) classes.push('target');
      if (glow.includes(i)) classes.push('rule-glow');
      if (state.threatCells?.includes(i)) classes.push('threat'); // tutorial: Otto wins here next
      if (placement === 'lava' && isCorner) classes.push('lava');
      if (grew && (r >= prev.rows || c >= prev.cols)) classes.push('pop-in');

      let label = mark || 'empty';
      let content = '';
      if (mark) {
        content = sprite(mark === 'X' ? X_SPRITE : O_SPRITE, 'mark');
        if (sameSize && prev.cells[i] !== mark) classes.push('dissolve');
        if (fading) {
          const turnsLeft = FADE_AFTER_TURNS - markAge(state, i);
          if (turnsLeft <= 2) classes.push('fading');
          label += `, fades in ${turnsLeft} turn${turnsLeft === 1 ? '' : 's'}`;
        }
      }
      if (minions[i]) {
        label = 'blocked by a minion (click to flick it off for 2 points)';
        content = sprite(MINION_SPRITE, 'mark');
        if (sameSize && !prev.minions[i]) classes.push('dissolve');
      }
      if (stolen[i]) {
        label += ' (stolen from you)';
        content += '<span class="tag tag-stolen" aria-hidden="true">STOLEN</span>';
      }
      if (glued[i]) {
        label += " (glued, can't be stolen)";
        content += '<span class="tag tag-glued" aria-hidden="true">GLUED</span>';
      }
      if (placement === 'lava' && isCorner && !mark) label += ' (lava: nobody can play here)';
      if (state.threatCells?.includes(i)) label += ' (Otto is about to win here!)';

      return `<button class="${classes.join(' ')}" data-cell="${i}"
                aria-label="Row ${r + 1}, column ${c + 1}: ${label}"
                tabindex="${i === focusIndex ? 0 : -1}"
                ${locked || mark ? 'aria-disabled="true"' : ''}>${content}</button>`;
    })
    .join('');

  previousBoard = { rows, cols, cells: cells.slice(), minions: minions.slice() };
  return html;
}

// A tiny diagram of a rule: one small square per letter (see RULE_DIAGRAMS).
function renderDiagram(ruleId) {
  const rows = RULE_DIAGRAMS[ruleId];
  if (!rows) return '';
  const width = rows[0].length;
  const squares = rows.join('').split('').map((ch) => `<span class="d d-${ch === '.' ? 'e' : ch}"></span>`).join('');
  return `<div class="diagram" style="--dcols:${width}" aria-hidden="true">${squares}</div>`;
}

function ruleIcon(ruleId) {
  return sprite(RULE_ICONS[ruleId], 'rule-icon');
}

// Pop-up windows over the monitor: NEW_RULE.EXE, AMEND.EXE and MYLINE.EXE.
function renderPopups() {
  const scene = state.ruleScene;
  if (scene?.phase === 'pick') {
    const cards = scene.cards.map((id) => {
      const rule = getRule(id);
      return `<button class="rule-card" data-amend="${id}" aria-label="Pick: ${rule.name}. ${rule.sentence}">
          ${ruleIcon(id)}<b>${rule.name}</b><span>${rule.sentence}</span></button>`;
    }).join('');
    return `
      <div class="rule-popup-stack pick">
        <div class="window rule-popup" role="dialog" aria-label="Amendment: pick the next rule">
          ${titleBar('AMEND.EXE')}
          <div class="window-body">
            <p class="popup-heading">PICK THE NEXT RULE</p>
            <div class="rule-cards">${cards}</div>
          </div>
        </div>
      </div>`;
  }
  if (scene) {
    const { change } = scene;
    const rule = getRule(change.ruleId);
    const old = change.oldId ? getRule(change.oldId) : null;
    return `
      <div class="rule-popup-stack ${scene.phase}">
        <div class="window ghost g2" aria-hidden="true"></div>
        <div class="window ghost g1" aria-hidden="true"></div>
        <div class="window rule-popup" role="dialog" aria-label="New rule: ${rule.name}. ${rule.sentence}">
          ${titleBar('NEW_RULE.EXE')}
          <div class="window-body">
            ${old ? `<p class="old-rule">OLD: <s>${old.name}</s></p>` : ''}
            <div class="new-rule">
              ${ruleIcon(rule.id)}
              <div>
                <p class="popup-heading">${rule.name.toUpperCase()}</p>
                <p class="rule-line">${rule.sentence}</p>
              </div>
              ${renderDiagram(rule.id)}
            </div>
            ${change.by === 'player' ? '<p class="rule-line">You picked this rule.</p>' : ''}
            <button class="btn" data-rule-ok>[ OK ]</button>
          </div>
        </div>
      </div>`;
  }
  if (state.mode?.type === 'ownLinePick') {
    const { rows, cols } = state.board;
    return `
      <div class="rule-popup-stack small">
        <div class="window rule-popup" role="dialog" aria-label="My Own Line: add a row or a column">
          ${titleBar('MYLINE.EXE')}
          <div class="window-body choice">
            <button class="btn" data-line="row" ${rows >= MAX_GRID_SIZE ? 'disabled' : ''}>ROW</button>
            <button class="btn" data-line="col" ${cols >= MAX_GRID_SIZE ? 'disabled' : ''}>COLUMN</button>
            <button class="btn" id="cancel-mode">CANCEL</button>
          </div>
        </div>
      </div>`;
  }
  return '';
}

// --- Right: Otto ---------------------------------------------------------------------------
function ottoFace() {
  if (state.ending && state.result === 'X') return 'crash'; // meltdown
  if (state.telegraph) return 'scheming';
  if (state.matchOver && state.result === 'O') return 'smug';
  return ottoMood(state);
}

function renderOtto() {
  const faceName = ottoFace();
  const thinking = state.ottoThinking && !state.telegraph;
  // Thinking: two faces (eyes left / eyes right) that take turns, slowly.
  const face = thinking
    ? `<span class="otto-face think">${sprite(OTTO_FACES.thinkLeft, 'f1')}${sprite(OTTO_FACES.thinkRight, 'f2')}</span>`
    : `<span class="otto-face ${state.telegraph ? 'flicker' : ''}">${sprite(OTTO_FACES[faceName])}</span>`;
  const bubble = thinking
    ? '<span class="dots" aria-label="Otto is thinking"><i></i><i></i><i></i></span>'
    : escapeHtml(state.ottoSays);
  const patience = 100 - state.frustration;
  const segments = 20;
  const full = Math.round((patience / 100) * segments);
  const bar = Array.from({ length: segments }, (_, n) => `<i class="${n < full ? 'on' : ''}"></i>`).join('');

  return `
    <section class="otto-area">
      <button id="otto" class="otto" aria-label="Otto (${faceName}). Click it, or press C, while it's scheming to catch a cheat.">
        ${sprite(OTTO_CASING, 'otto-casing')}
        ${face}
      </button>
      <div class="bubble" role="status" aria-live="polite">${bubble}</div>
      <div class="patience">
        <span id="patience-label">OTTO'S PATIENCE</span>
        <div class="patience-bar ${patience < 30 ? 'low' : ''}" role="progressbar" aria-labelledby="patience-label"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${patience}">${bar}</div>
      </div>
    </section>`;
}

// --- Right: RULES.TXT -------------------------------------------------------------------------
function renderRules() {
  const now = currentTurn(state);
  const rowsHtml = CATEGORIES.map((category) => {
    const entry = state.rules[category];
    const rule = getRule(entry.ruleId);
    const recent = !rule.isDefault && now - entry.sinceTurn <= 2;
    let pips = '';
    if (entry.expiresAtTurn) {
      const left = Math.max(0, entry.expiresAtTurn - now);
      pips = `<span class="pips" aria-label="${left} turns left">${Array.from({ length: REVERSE_DAY_TURNS }, (_, n) => `<i class="${n < left ? 'on' : ''}"></i>`).join('')}</span>`;
    }
    return `
      <div class="rule-row ${state.blinkCategory === category ? 'blink' : ''} ${recent ? 'recent' : ''}"
           data-category="${category}" tabindex="0" aria-label="${CATEGORY_LABELS[category]}: ${rule.name}. ${rule.sentence}">
        <span class="rule-cat">${CATEGORY_LABELS[category]}</span>
        ${ruleIcon(rule.id)}
        <span class="rule-name">${rule.name}</span>
        ${pips}
        <span class="rule-tip" aria-hidden="true">${rule.sentence}</span>
      </div>`;
  }).join('');

  const until = Math.max(0, state.nextRuleAt - state.playerTurns);
  const countdown = state.matchOver
    ? 'NO MORE RULES'
    : until === 0
      ? 'NEW RULE NOW'
      : until === 1
        ? 'NEW RULE NEXT TURN'
        : `NEW RULE IN ${until} TURNS`;
  const history = state.ruleHistory
    .map((record) => `<li><s>${getRule(record.entry.ruleId).name}</s> <small>turns ${record.entry.sinceTurn}–${record.endedTurn}, ${record.how}</small></li>`)
    .join('');

  return `
    <section class="rules window" aria-label="Rules">
      ${titleBar('RULES.TXT')}
      <div class="window-body">
        ${rowsHtml}
        <p class="countdown">${sprite(HOURGLASS)} ${countdown}${state.amendmentPending ? ' (YOU PICK)' : ''}</p>
        <p class="turn-count">TURN ${Math.min(now, MAX_TURNS)}/${MAX_TURNS}</p>
        ${history ? `<details class="history"><summary>HISTORY (${state.ruleHistory.length})</summary><ul>${history}</ul></details>` : ''}
      </div>
    </section>`;
}

// --- The ending: a full-screen pixel banner --------------------------------------------------
function renderEnding() {
  const result = state.result;
  const headline = result === 'X' ? 'YOU WIN!' : result === 'O' ? 'OTTO WINS' : 'DRAW';
  const confetti =
    result === 'X'
      ? `<div class="confetti" aria-hidden="true">${Array.from({ length: 24 }, (_, n) => `<i style="left:${(n * 41) % 100}%;animation-delay:${(n % 6) * 0.15}s"></i>`).join('')}</div>`
      : '';
  const otto = result === 'O'
    ? `<div class="ending-otto">${sprite(OTTO_CASING, 'otto-casing')}<span class="otto-face">${sprite(OTTO_FACES.smug)}</span></div>`
    : '';
  return `
    <div class="ending ${result === 'X' ? 'won' : result === 'O' ? 'lost' : 'draw'}" role="dialog" aria-label="${headline}">
      ${confetti}
      <div class="window ending-window">
        ${titleBar('RESULT.EXE')}
        <div class="window-body">
          <p class="headline">${headline}</p>
          ${otto}
          ${state.finalRule ? `<p class="ending-line">FINAL RULE: you ${state.finalRule.x} – ${state.finalRule.o} Otto (lines of 3)</p>` : ''}
          ${renderLeaderboard()}
          <button id="play-again" class="btn">PLAY AGAIN</button>
        </div>
      </div>
    </div>`;
}

function renderLeaderboard() {
  const { status, stats } = state.memory;
  let body;
  if (status === 'loading' && !stats) {
    body = '<p class="ending-line">Loading HISCORE.DAT…</p>';
  } else if (!stats) {
    body = "<p class=\"ending-line\">Otto's memory is offline. (The game works fine without it.)</p>";
  } else {
    const rows = stats.leaderboard
      .map((row, n) => `<li class="${row.name === state.playerName ? 'you' : ''}"><span>${n + 1}.</span><span>${escapeHtml(row.name)}</span><span>${row.wins} WIN${row.wins === 1 ? '' : 'S'}</span></li>`)
      .join('');
    body = `
      <p class="ending-line">HUMANS ${stats.global.humanWins} – ${stats.global.ottoWins} OTTO</p>
      ${rows ? `<ol class="hiscores">${rows}</ol>` : '<p class="ending-line">No human has beaten Otto yet!</p>'}`;
  }
  return `<div class="hiscore" aria-label="Humans vs Otto leaderboard"><p class="hiscore-title">HISCORE.DAT</p>${body}</div>`;
}

// --- Debug panel (only when the URL contains ?debug) -----------------------------------------
function renderDebug() {
  const cheatButtons = CHEATS.map(
    (cheat) => `<button class="debug-btn ${state.debug.forceCheat === cheat.id ? 'armed' : ''}" data-debug="force" data-value="${cheat.id}">${cheat.name}</button>`
  ).join('');
  const ruleButtons = RULES.filter((rule) => !rule.isDefault)
    .map((rule) => `<button class="debug-btn" data-debug="rule" data-value="${rule.id}">${rule.name}</button>`)
    .join('');
  return `
    <details class="debug window" ${state.debug.open ? 'open' : ''}>
      <summary>DEBUG.EXE</summary>
      <div class="debug-body">
        <div class="debug-row">
          <button class="debug-btn" data-debug="ruleNow">Rules change next turn</button>
          <button class="debug-btn" data-debug="grow">Grow board +1</button>
          <button class="debug-btn" data-debug="turn29">Jump to turn 30</button>
          <button class="debug-btn" data-debug="points">+10 points</button>
          <button class="debug-btn" data-debug="frustration">Frustration +25</button>
          <button class="debug-btn" data-debug="calm">Frustration 0</button>
          <button class="debug-btn" data-debug="cooldowns">Clear cooldowns</button>
        </div>
        Rule now: <div class="debug-row">${ruleButtons}</div>
        Otto's next cheat: <div class="debug-row">${cheatButtons}</div>
        <div>Turn ${currentTurn(state)} · ${state.board.rows}×${state.board.cols} · frustration ${state.frustration}</div>
        ${state.debug.message ? `<div><b>${state.debug.message}</b></div>` : ''}
      </div>
    </details>`;
}
