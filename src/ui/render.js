// ui/render.js
// Draws the whole screen from `state`, in retro pixel-art style. Every time the
// state changes we simply rebuild the HTML — simple to understand, and fast enough.
//
// Layout (full screen):
//   top bar:  title · score · Snowflake disk · mute
//   left:     TOOLBOX.EXE  (points + power-up floppy disks)
//   centre:   turn indicator, the big CRT monitor (win banner + board), message line
//   right:    Otto's little CRT, his speech bubble, patience bar, RULES.TXT

import { state, on, ROUND_TURN_CAP, OTTO_ROUNDS_TO_WIN } from '../state.js';
import { CHEATS, MAX_GRID_SIZE } from '../cheats.js';
import { POWERUPS, canAfford } from '../powerups.js';
import { stageOf, stageProgress, STAGES } from '../agent.js';
import { ottoLook } from '../emotions.js';
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
  PALETTE,
  MOON_SPRITE,
  NOTE_ON,
  NOTE_OFF,
  OTTO_COLOURS,
  OTTO_EXTRAS,
  crackSprite,
  wobblyLine,
  tinyFigure,
} from './sprites.js';

// The full power-up name on each floppy's label (soft hyphens let long words wrap
// onto 2 lines instead of being cut off), and each disk's own palette colour.
const DISK_NAMES = {
  flick: 'Flick', lightSwitch: 'Light Switch', eraser: 'Eraser', paperweight: 'Paper\u00ADweight',
  glueStick: 'Glue Stick', timeOut: 'Time Out', myOwnLine: 'My Own Line', doubleMark: 'Double Mark',
  veto: 'Veto', amendment: 'Amend\u00ADment',
};
const DISK_COLOURS = {
  flick: 'c', lightSwitch: 'y', eraser: 'p', paperweight: 'm', glueStick: 'l',
  timeOut: 'u', myOwnLine: 'n', doubleMark: 'w', veto: 'o', amendment: 'v',
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
    if (t.closest('#calm')) handlers.onCalm();
    if (t.closest('#music')) handlers.onMusic();
    if (t.closest('#skip')) handlers.onSkip();
    if (t.closest('#restore-toolbox')) handlers.onRestoreToolbox();
    if (t.closest('#plug')) handlers.onPlugIn();
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

  applyStage();
  root.innerHTML = `
    ${renderTopBar()}
    <div class="main">
      ${renderToolbox()}
      ${renderCentre()}
      <aside class="otto-side">
        ${renderOtto()}
        ${renderTerminal()}
        ${renderRules()}
      </aside>
    </div>
    ${state.ending === 'banner' ? renderEnding() : ''}
    ${renderRampage()}
    ${state.debug.enabled ? renderDebug() : ''}
  `;
  insertingDisk = null;

  setLights(!state.lightsOut);
  if (boardHadFocus) focusCell();
  afterRender();
}

// --- Otto's stage: how unhinged the whole screen looks ------------------------------------------
// Body classes (stage-0..3, calm, rampage-<phase>) and a few CSS variables that
// change gradually with patience inside each stage.
const INDIGO = [0x2b, 0x1b, 0x5a];
const WARM = [0x4a, 0x1b, 0x4f]; // purple-red

function applyStage() {
  const body = document.body;
  const stage = state.screen === 'game' ? stageOf(state.patience) : 0;
  const t = stageProgress(state.patience); // 0..1 through the current stage
  for (let n = 0; n < 4; n++) body.classList.toggle(`stage-${n}`, stage === n);
  body.classList.toggle('calm', state.calm);
  for (const cls of [...body.classList]) if (cls.startsWith('rampage')) body.classList.remove(cls);
  if (state.rampage) body.classList.add('rampage', `rampage-${state.rampage.phase}`);

  const chaos = state.calm ? 0 : stage;
  // The monitor's resting tilt: none, none, 3-5 degrees, 6-8 degrees.
  const tilt = [0, 0, 3 + 2 * t, 6 + 2 * t][chaos];
  body.style.setProperty('--tilt', `${-tilt}deg`);
  // The background warms towards purple-red from the Unhinged stage on.
  const warmth = chaos >= 2 ? Math.min(1, (50 - state.patience) / 50 + 0.2) : 0;
  const mix = INDIGO.map((c, i) => Math.round(c + (WARM[i] - c) * warmth));
  body.style.setProperty('--bg', `rgb(${mix.join(',')})`);
  // Background floppies drift faster when Otto is upset.
  body.style.setProperty('--drift', `${[48, 40, 26, 18][chaos]}s`);
}

// A one-off animation that survives redraws: start it "elapsed" ms in.
function since(startedAt, durationMs) {
  const elapsed = Date.now() - startedAt;
  return elapsed >= 0 && elapsed < durationMs ? elapsed : null;
}

// Things that need the real sizes of elements on screen.
function afterRender() {
  // 0. Floppies as big as fits, so TOOLBOX.EXE has no empty space.
  const disks = root.querySelector('.disks');
  if (disks) {
    const body = disks.parentElement;
    const points = body.querySelector('.points');
    const rows = Math.ceil(POWERUPS.length / 2);
    const freeHeight = body.clientHeight - points.offsetHeight - 16 - (rows - 1) * 8 - 16;
    const fitHigh = Math.floor(freeHeight / rows / 14);
    const fitWide = Math.floor((disks.clientWidth - 16) / 2 / 16);
    const px = Math.max(4, Math.min(10, fitHigh, fitWide));
    disks.style.setProperty('--disk-px', px);
  }
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
          <div class="title-otto">${ottoCasing('happy')}<span class="otto-face">${sprite(OTTO_FACES.happy)}</span></div>
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
      <h1 class="game-title">${fallingText('AGENTS GONE WRONG')}</h1>
      <div class="score" aria-label="Round ${state.roundNumber}. Rounds won: you ${state.roundsWon.you}, Otto ${state.roundsWon.otto}">
        ${fallingText(`ROUND ${state.roundNumber} · YOU ${state.roundsWon.you} – ${state.roundsWon.otto} OTTO`)}
      </div>
      <div class="topbar-right">
        <span id="light-switch" class="light-switch ${state.lightsOut ? 'off' : ''}" title="The lights (Otto likes to flick them off)" aria-hidden="true"><i></i></span>
        <span class="memory-disk ${memory}" title="${memoryText}" role="img" aria-label="${memoryText}">
          ${sprite(floppy('n'))}<span class="memory-light"></span>
        </span>
        <button id="calm" class="icon-btn ${state.calm ? 'on' : ''}" aria-pressed="${state.calm}"
                aria-label="Calm mode: ${state.calm ? 'on' : 'off'} (turns the chaos effects off)" title="Calm mode (no chaos effects)">
          ${sprite(MOON_SPRITE)}
        </button>
        <button id="music" class="icon-btn" aria-pressed="${state.musicOn}" title="Music on/off"
                aria-label="${state.musicOn ? 'Turn the music off' : 'Turn the music on'}">
          ${sprite(state.musicOn ? NOTE_ON : NOTE_OFF)}
        </button>
        <button id="mute" class="icon-btn" aria-label="${state.muted ? 'Turn sound on' : 'Mute sound'}" aria-pressed="${state.muted}">
          ${sprite(state.muted ? SPEAKER_OFF : SPEAKER_ON)}
        </button>
      </div>
    </header>`;
}

// --- Left: TOOLBOX.EXE -----------------------------------------------------------------------
function renderToolbox() {
  // Otto's cursor may have minimised TOOLBOX.EXE: show its taskbar button instead.
  if (state.ui.toolboxMinimised) {
    return `
      <aside class="toolbox-minimised" aria-label="Your toolbox (minimised)">
        <button id="restore-toolbox" class="btn taskbar-btn">▣ TOOLBOX.EXE</button>
        <p class="taskbar-note">Otto minimised your toolbox. Click to restore it.</p>
      </aside>`;
  }
  // ...or shuffled the floppies.
  const order = state.ui.diskOrder;
  const ordered = order ? order.map((id) => POWERUPS.find((p) => p.id === id)) : POWERUPS;
  const disks = ordered.map((p, n) => {
    const affordable = canAfford(state, p);
    const useful = p.canUse(state);
    const active =
      (state.mode?.type === 'flick' && p.id === 'flick') ||
      (state.mode?.type?.startsWith('ownLine') && p.id === 'myOwnLine') ||
      (state.extraMarks > 0 && p.id === 'doubleMark') ||
      (state.amendmentPending && p.id === 'amendment');
    // Greyed only when you can't afford it or it would do nothing (the tooltip says which).
    const greyed = !affordable || !useful;
    let why = '';
    if (!affordable) why = ` Not enough points (costs ${p.cost}).`;
    else if (!useful) why = ' Nothing to use it on right now.';
    // During the rampage the disks fly out in all directions.
    const fly = `--fx:${((n * 37) % 11) - 5}00px;--fy:${((n * 53) % 9) - 6}00px;--fr:${((n * 71) % 7) * 90 - 270}deg`;
    if (state.ui.stolenDisk === p.id) {
      // a minion is carrying this disk away (click the minion to get it back)
      return `<div class="disk stolen-away" aria-label="${p.name}: a minion stole it! Click the minion to get it back.">?</div>`;
    }
    return `
      <button class="disk ${greyed ? 'greyed' : ''} ${active ? 'active' : ''} ${insertingDisk === p.id ? 'inserting' : ''}"
              data-powerup="${p.id}" style="${fly}"
              aria-label="${p.name}, costs ${p.cost} points. ${p.help}${why} Shortcut key ${p.key}."
              title="${p.name} (key ${p.key}, ${p.cost} pts): ${p.help}${why}"
              ${greyed ? 'aria-disabled="true"' : ''}>
        ${sprite(floppy(DISK_COLOURS[p.id]))}
        <span class="disk-label">${DISK_NAMES[p.id]}</span>
        <span class="disk-cost">${p.cost}</span>
      </button>`;
  }).join('');

  return `
    <aside class="toolbox window" aria-label="Your toolbox"
           ${state.ui.toolboxOffset ? `style="translate:${state.ui.toolboxOffset.x}px ${state.ui.toolboxOffset.y}px"` : ''}>
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
  } else if (state.roundOver) {
    indicator = '&gt; ROUND OVER';
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
  if (state.ruleScene || state.roundEnd) classes.push('dimmed');
  if (state.ui.unplugged) classes.push('unplugged');

  // The monitor's motion (kept continuous across redraws, see since()):
  //   Irritated: a 1-2 degree nudge that settles on each Otto turn
  //   Unhinged:  a gentle wobble       Meltdown: a shudder on each Otto turn
  const stage = state.calm ? 0 : stageOf(state.patience);
  let motion = '';
  const turnAnim = since(state.ottoTurnStartedAt, stage === 1 ? 2400 : 700);
  if (stage === 1 && turnAnim !== null) motion = `animation: nudge 2.4s ease-out ${-turnAnim}ms both;`;
  if (stage === 2) motion = `animation: wobble 4s ease-in-out ${-(Date.now() % 4000)}ms infinite;`;
  if (stage === 3 && turnAnim !== null) motion = `animation: shudder 0.7s steps(7) ${-turnAnim}ms both;`;

  // Cracks in the glass: 1 when Unhinged, 3 at Meltdown (never hiding the marks).
  const crackCount = state.calm ? 0 : [0, 0, 1, 3][stage];
  const crackSpots = [[62, 18, 3], [14, 58, 11], [70, 70, 23]];
  const cracks = crackSpots
    .slice(0, crackCount)
    .map(([x, y, seed]) => `<span class="crack" style="left:${x}%;top:${y}%">${sprite(crackSprite(seed))}</span>`)
    .join('');

  return `
    <section class="centre">
      <p class="turn-indicator ${tone}" role="status" aria-live="polite">${indicator}${timer}</p>
      <div class="monitor-area">
        <div class="${classes.join(' ')}" style="${motion}">
          <div class="casing">
            <div class="screen">
              <div class="win-banner">${winBanner(state)}</div>
              <div class="board-area">
                <div class="board" role="grid" aria-label="Board, ${rows} by ${cols}"
                     style="--cols:${cols};--rows:${rows}">${renderCells()}</div>
              </div>
              ${cracks}
              ${renderShards()}
              ${renderPopups()}
            </div>
            <span class="power-led" aria-hidden="true"></span>
          </div>
          <div class="stand" aria-hidden="true"></div>
          <button id="plug" class="cable ${state.ui.unplugged ? 'unplugged' : ''}"
                  aria-label="${state.ui.unplugged ? 'The monitor cable is unplugged: click to plug it back in' : 'Monitor cable'}">
            <i></i>${state.ui.unplugged ? '<span>PLUG IN</span>' : ''}</button>
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
  const locked = state.turn !== 'X' || state.roundOver || state.matchOver || !!state.ruleScene;
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
  if (state.roundEnd && !state.rampage) return renderRoundEnd();
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
// Irritated or worse: Otto's new lines jitter for a moment as they appear.
let lastSays = '';
let saysAt = 0;
function bubbleJitter() {
  if (state.ottoSays !== lastSays) {
    lastSays = state.ottoSays;
    saysAt = Date.now();
  }
  return since(saysAt, 700) !== null ? 'jitter' : '';
}

// Otto's casing in a mood's colours (see OTTO_COLOURS).
function ottoCasing(coloursKey) {
  return sprite(OTTO_CASING, 'otto-casing', { ...PALETTE, ...OTTO_COLOURS[coloursKey] });
}

// When the casing colour changes it wipes from bottom to top over ~500ms:
// the old colour underneath, the new colour on top, revealed by a growing clip.
let shownColours = 'calm';
let previousColours = 'calm';
let coloursChangedAt = 0;
function casingWithWipe(coloursKey) {
  if (coloursKey !== shownColours) {
    previousColours = shownColours;
    shownColours = coloursKey;
    coloursChangedAt = Date.now();
  }
  const elapsed = since(coloursChangedAt, 500);
  if (elapsed === null) return ottoCasing(coloursKey);
  return `<span class="casing-wipe">${ottoCasing(previousColours)}
    <span class="wipe-new" style="animation-delay:${-elapsed}ms">${ottoCasing(coloursKey)}</span></span>`;
}

// The little pixel extras around Otto for its mood (static in Calm mode / reduced motion).
function ottoExtras(extras) {
  const parts = {
    question: `<span class="extra question">${sprite(OTTO_EXTRAS.question)}</span>`,
    sweat: `<span class="extra sweat">${sprite(OTTO_EXTRAS.sweat)}</span>`,
    steam: `<span class="extra steam left">${sprite(OTTO_EXTRAS.steam)}</span><span class="extra steam right">${sprite(OTTO_EXTRAS.steam)}</span>`,
    sparks: [1, 2, 3, 4].map((n) => `<span class="extra spark s${n}">${sprite(OTTO_EXTRAS.spark)}</span>`).join(''),
    crack: `<span class="extra glass-crack">${sprite(OTTO_EXTRAS.crack)}</span>`,
    sparkles: [1, 2, 3].map((n) => `<span class="extra sparkle k${n}">${sprite(OTTO_EXTRAS.sparkle)}</span>`).join(''),
  };
  return extras.map((name) => parts[name]).join('');
}

function renderOtto() {
  const look = ottoLook(state);
  // Thinking: two faces (eyes left / eyes right) that take turns, slowly.
  const face = look.thinking
    ? `<span class="otto-face think">${sprite(OTTO_FACES.thinkLeft, 'f1')}${sprite(OTTO_FACES.thinkRight, 'f2')}</span>`
    : `<span class="otto-face ${state.telegraph ? 'flicker' : ''}">${sprite(OTTO_FACES[look.face])}</span>`;
  const bubble = look.thinking
    ? '<span class="dots" aria-label="Otto is thinking"><i></i><i></i><i></i></span>'
    : escapeHtml(state.ottoSays);
  const patience = state.patience;
  const stageLabel = STAGES[stageOf(patience)].label;
  const segments = 20;
  const full = Math.round((patience / 100) * segments);
  const bar = Array.from({ length: segments }, (_, n) => `<i class="${n < full ? 'on' : ''}"></i>`).join('');
  const redScreen = state.rampage && ['red', 'fine'].includes(state.rampage.phase);

  return `
    <section class="otto-area">
      <button id="otto" class="otto mood-${look.mood}" aria-label="Otto (${look.mood}). Click it, or press C, while it's scheming to catch a cheat.">
        ${casingWithWipe(look.colours)}
        ${redScreen ? '<span class="otto-screen-text">PATIENCE.SYS<br>NOT FOUND</span>' : face}
        ${ottoExtras(look.extras)}
      </button>
      <div class="bubble ${bubbleJitter()} ${state.ui.bubbleDown ? 'dragged' : ''} ${state.ottoSays.startsWith('OTTO@AGENT') && !look.thinking ? 'terminal' : ''}" role="status" aria-live="polite">${bubble}</div>
      <div class="patience">
        <span id="patience-label">OTTO'S PATIENCE: <b class="stage-label">${stageLabel}</b></span>
        <div class="patience-bar ${patience < 30 ? 'low' : ''}" role="progressbar" aria-labelledby="patience-label"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${patience}">${bar}</div>
      </div>
    </section>`;
}

// --- Right: Otto's terminal (OTTO@AGENT:~$) ----------------------------------------------------
// The newest command types itself out (kept smooth across redraws with since()).
const TERMINAL_SHOWN = 3; // entries on screen (each is a command + a result line)
function renderTerminal() {
  const entries = (state.terminal || []).slice(-TERMINAL_SHOWN);
  const lines = entries.map((entry, n) => {
    const newest = n === entries.length - 1;
    const typeMs = Math.min(900, entry.command.length * 22);
    const elapsed = newest ? since(entry.at, typeMs + 200) : null;
    const typing = elapsed !== null
      ? `style="--chars:${entry.command.length};--type:${typeMs}ms;animation-delay:${-elapsed}ms"`
      : '';
    return `
      <div class="term-entry">
        <div class="term-cmd ${typing ? 'typing' : ''}" ${typing}><span class="prompt">OTTO@AGENT:~$</span> ${escapeHtml(entry.command)}</div>
        <div class="term-result ${typing ? 'waiting' : ''}" ${typing ? `style="animation-delay:${typeMs - elapsed}ms"` : ''}>&gt; ${escapeHtml(entry.result)}</div>
      </div>`;
  }).join('');
  return `
    <section class="terminal window" aria-label="Otto's terminal" aria-live="polite">
      ${titleBar('OTTO@AGENT:~$')}
      <div class="terminal-body">${lines || '<div class="term-entry"><span class="prompt">OTTO@AGENT:~$</span> <span class="term-cursor">_</span></div>'}</div>
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
  const countdown = state.matchOver || state.roundOver
    ? 'NO MORE RULES'
    : state.ruleDelayed
      ? 'NEW RULE DELAYED'
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
      ${state.ui.graffiti.map((g) => `<span class="graffiti" aria-hidden="true" style="left:${g.x}%;top:${g.y}%">${escapeHtml(g.text)}</span>`).join('')}
      <svg class="rules-scribble" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="${wobblyLine(5, 20, 95, 30, 7, 6, 6)} ${wobblyLine(8, 60, 92, 45, 9, 6, 6)} ${wobblyLine(10, 85, 90, 80, 13, 6, 6)}" />
      </svg>
      ${titleBar('RULES.TXT')}
      <div class="window-body">
        ${rowsHtml}
        <p class="countdown">${sprite(HOURGLASS)} ${countdown}${state.amendmentPending ? ' (YOU PICK)' : ''}
          <span class="turn-count" title="Sudden death after turn ${ROUND_TURN_CAP}">· TURN ${Math.min(now, ROUND_TURN_CAP)}/${ROUND_TURN_CAP}</span></p>
        ${history ? `<details class="history"><summary>HISTORY (${state.ruleHistory.length})</summary><ul>${history}</ul></details>` : ''}
      </div>
    </section>`;
}

// --- Text whose letters fall down the screen during the rampage -----------------------------
function fallingText(text) {
  const falling = state.rampage && !['red', 'fine'].includes(state.rampage.phase);
  if (!falling) return text;
  return [...text]
    .map((ch, n) => `<span class="fall" style="--d:${(n * 37) % 600}ms;--r:${((n * 53) % 9) * 20 - 80}deg">${ch === ' ' ? '&nbsp;' : ch}</span>`)
    .join('');
}

// --- Between rounds: ROUND_END.EXE --------------------------------------------------------
function renderRoundEnd() {
  const { winner, change } = state.roundEnd;
  const headline =
    winner === 'X' ? `ROUND ${state.roundNumber}: YOU WIN!` : winner === 'O' ? `ROUND ${state.roundNumber}: OTTO WINS` : `ROUND ${state.roundNumber}: DRAW`;
  const patienceLine = change < 0 ? `OTTO'S PATIENCE ${change}` : change > 0 ? `OTTO'S PATIENCE +${change}` : "OTTO'S PATIENCE: NO CHANGE";
  const more = state.matchOver
    ? ''
    : `<button class="btn" data-rule-ok>[ NEXT ROUND ]</button>`;
  return `
    <div class="rule-popup-stack show round-end">
      <div class="window rule-popup" role="dialog" aria-label="${headline}">
        ${titleBar('ROUND_END.EXE')}
        <div class="window-body">
          <p class="popup-heading ${winner === 'X' ? 'good' : winner === 'O' ? 'bad' : ''}">${headline}</p>
          ${state.suddenDeath ? `<p class="rule-line">SUDDEN DEATH: lines of 3, you ${state.suddenDeath.x} – ${state.suddenDeath.o} Otto</p>` : ''}
          <p class="rule-line">${patienceLine} (now ${state.patience})</p>
          <p class="rule-line">ROUNDS: YOU ${state.roundsWon.you} – ${state.roundsWon.otto} OTTO (Otto needs ${OTTO_ROUNDS_TO_WIN})</p>
          ${more}
        </div>
      </div>
    </div>`;
}

// --- The rampage: the CRT glass shatters into pixel shards that fall off -------------------
function renderShards() {
  if (!state.rampage || state.rampage.phase !== 'shatter') return '';
  const shards = [];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const n = r * 6 + c;
      shards.push(`<i style="left:${c * 16.66}%;top:${r * 16.66}%;--d:${((n * 47) % 9) * 90}ms;--x:${((n * 31) % 7) * 20 - 60}px;--r:${((n * 13) % 9) * 30 - 120}deg"></i>`);
    }
  }
  return `<div class="shards" aria-hidden="true">${shards.join('')}</div>`;
}

// The rampage's full-screen parts: the crash screen, CRT-off, black, and the last message.
function renderRampage() {
  const phase = state.rampage?.phase;
  if (!phase) return '';
  const skip =
    ['red', 'fine', 'chaos', 'shatter', 'crash', 'goodbye'].includes(phase)
      ? '<button id="skip" class="btn small skip-btn">[SKIP]</button>'
      : '';
  if (phase === 'crash' || phase === 'goodbye') {
    return `
      <div class="crash-screen" role="alert">
        <p class="crash-title">FATAL ERROR: OTTO HAS LEFT THE GAME</p>
        <pre class="crash-log">
&gt; patience.sys ........ NOT FOUND
&gt; rules.txt .......... SCRIBBLED
&gt; toolbox.exe ........ EMPTY
&gt; crt_glass .......... SHATTERED
&gt; otto.exe ........... has stopped caring
&gt; core dumped (it was mostly sulking)</pre>
        ${phase === 'goodbye' ? `<p class="crash-otto">OTTO: ${escapeHtml(state.ottoSays)}</p>` : ''}
      </div>${skip}`;
  }
  if (phase === 'crtOff') return '<div class="crt-off" aria-hidden="true"><i></i></div>';
  if (phase === 'black') return '<div class="black-screen" aria-hidden="true"></div>';
  if (phase === 'final') {
    return `
      <div class="black-screen final" role="dialog" aria-label="Otto closed the game">
        <div class="final-box">
          <p>Otto closed the game. You drained his patience in ${state.roundNumber} rounds.</p>
          <button id="play-again" class="btn">[REBOOT OTTO]</button>
          ${state.memory.stats ? renderLeaderboard() : ''}
          ${renderTwin()}
        </div>
      </div>`;
  }
  return skip;
}

// --- Otto wins the match: a smug full-screen pixel banner -------------------------------------
function renderEnding() {
  return `
    <div class="ending lost" role="dialog" aria-label="Otto wins">
      <div class="window ending-window">
        ${titleBar('RESULT.EXE')}
        <div class="window-body">
          <p class="headline">OTTO WINS</p>
          <div class="ending-otto">${ottoCasing('victorious')}<span class="otto-face">${sprite(OTTO_FACES.victorious)}</span>${ottoExtras(['sparkles'])}</div>
          <p class="ending-line">OTTO: ...I cheated, obviously.</p>
          <p class="ending-line">Otto won ${state.roundsWon.otto} rounds before you could drain its patience (${state.patience} left).</p>
          ${renderLeaderboard()}
          ${renderTwin()}
          <button id="play-again" class="btn">[PLAY AGAIN]</button>
        </div>
      </div>
    </div>`;
}

// TWIN.DAT: the player whose play style is most like yours (from Snowflake).
function renderTwin() {
  const twin = state.memory.stats?.twin;
  if (!twin) return '';
  return `
    <div class="window twin" aria-label="Your evil twin: ${escapeHtml(twin.name)}, ${twin.similarity}% match">
      ${titleBar('TWIN.DAT')}
      <div class="window-body twin-body">
        <span class="twin-figures" aria-hidden="true">${sprite(tinyFigure('l'))}${sprite(tinyFigure('p'))}</span>
        <span>YOUR EVIL TWIN: ${escapeHtml(twin.name)} (${twin.similarity}% match)</span>
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
          <button class="debug-btn" data-debug="patienceUp">Patience +25</button>
          <button class="debug-btn" data-debug="patienceDown">Patience −25</button>
          <button class="debug-btn" data-debug="patienceOne">Patience → 1</button>
          <button class="debug-btn" data-debug="rampage">Trigger rampage</button>
          <button class="debug-btn" data-debug="winRound">You win this round</button>
          <button class="debug-btn" data-debug="loseRound">Otto wins this round</button>
          <button class="debug-btn" data-debug="ruleNow">Rules change next turn</button>
          <button class="debug-btn" data-debug="grow">Grow board +1</button>
          <button class="debug-btn" data-debug="turn19">Jump to turn 20</button>
          <button class="debug-btn" data-debug="showTactics">Show tactics</button>
          <button class="debug-btn" data-debug="showTwin">Show twin</button>
          <button class="debug-btn" data-debug="points">+10 points</button>
          <button class="debug-btn" data-debug="cooldowns">Clear cooldowns</button>
        </div>
        Music: <div class="debug-row">${[0, 1, 2, 3].map((n) => `<button class="debug-btn" data-debug="musicStage" data-value="${n}">Music stage ${n}</button>`).join('')}
          <button class="debug-btn" data-debug="testScratch">Test rule-change scratch</button>
          <button class="debug-btn" data-debug="testRampageMusic">Test rampage music</button></div>
        Otto's mood: <div class="debug-row">${['happy', 'thinking', 'scheming', 'bored', 'defeated', 'victorious', 'glitching']
          .map((mood) => `<button class="debug-btn" data-debug="mood" data-value="${mood}">${mood}</button>`).join('')}</div>
        Rule now: <div class="debug-row">${ruleButtons}</div>
        Otto's next cheat: <div class="debug-row">${cheatButtons}</div>
        <div>Round ${state.roundNumber} · turn ${currentTurn(state)} · ${state.board.rows}×${state.board.cols} · patience ${state.patience}</div>
        ${state.debug.message ? `<div><b>${state.debug.message}</b></div>` : ''}
      </div>
    </details>`;
}
