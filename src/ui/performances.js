// ui/performances.js
// Otto performs every action BY HAND with its cursor (see ottoCursor.js). Each
// function plays the animation and resolves when it reaches the moment the effect
// should happen — main.js applies the real game change right then.
// Everything here is drawn on overlay layers: nothing blocks the player's clicks.

import { moveTo, click, carrying, wiggle, dragThrough, wait, pointOf } from './ottoCursor.js';
import { sprite, X_SPRITE, MINION_SPRITE } from './sprites.js';

const cellEl = (i) => document.querySelector(`[data-cell="${i}"]`);

// A small overlay element on top of everything (but never taking clicks).
function overlay(className, html, x, y) {
  const el = document.createElement('div');
  el.className = `perform-overlay ${className}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = html;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  return el;
}

// Which squares a cheat changes (comparing the board before and after it).
function changedSquares(before, after, test) {
  return after.cells.map((_, i) => i).filter((i) => test(before, after, i));
}

// --- Normal move: glide to the cell, hover 300 ms, click -------------------------------------
export async function performMove(index, clickSound) {
  await moveTo(cellEl(index));
  await wait(300);
  await click(clickSound);
}

// --- Telegraph: the cursor heads for the cheat's target (time to catch it!) ---------------
export function telegraphTarget(cheat, state, trial) {
  switch (cheat.id) {
    case 'lightsOut': return pointOf('#light-switch');
    case 'extraLine': return pointOf('.board', 'bottomRight');
    case 'minionDrop': return pointOf('.toolbox', 'topRight');
    case 'markSteal': {
      const [i] = changedSquares(state.board, trial.board, (b, a, k) => a.stolen[k] && !b.stolen[k]);
      return pointOf(cellEl(i));
    }
    case 'doubleMove': {
      const [i] = changedSquares(state.board, trial.board, (b, a, k) => a.cells[k] === 'O' && b.cells[k] !== 'O');
      return pointOf(cellEl(i));
    }
    case 'boardSpin': return pointOf('.casing', 'topRight');
    case 'rewriteRules': return pointOf('.rules .countdown');
    default: return pointOf('.board');
  }
}

export function performTelegraph(cheat, state, trial) {
  return moveTo(telegraphTarget(cheat, state, trial) || pointOf('.board'));
}

// --- Cheats --------------------------------------------------------------------------------------
export async function performCheat(cheat, state, trial, clickSound) {
  switch (cheat.id) {
    case 'lightsOut': {
      // fly to the little light switch in the top bar and flick it off
      await moveTo('#light-switch');
      await click(clickSound);
      document.querySelector('#light-switch')?.classList.add('off');
      return wait(200);
    }
    case 'extraLine': {
      // pick up a pixel pen and draw the new row/column line, pixel by pixel
      const line = trial.addedLines[trial.addedLines.length - 1];
      const board = document.querySelector('.board')?.getBoundingClientRect();
      if (!board) return undefined;
      carrying('<span class="pen" aria-hidden="true"></span>');
      const isRow = line.type === 'row';
      const from = isRow ? { x: board.left, y: board.bottom + 6 } : { x: board.right + 6, y: board.top };
      const to = isRow ? { x: board.right, y: board.bottom + 6 } : { x: board.right + 6, y: board.bottom };
      await moveTo(from);
      const drawn = overlay(`pen-line ${isRow ? 'row' : 'col'}`, '', from.x, from.y);
      const steps = 18;
      const points = [];
      for (let k = 1; k <= steps; k++) points.push({ x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps });
      for (const p of points) {
        await dragThrough([p], 28);
        if (isRow) drawn.style.width = `${p.x - from.x}px`;
        else drawn.style.height = `${p.y - from.y}px`;
      }
      carrying('');
      setTimeout(() => drawn.remove(), 300);
      return undefined;
    }
    case 'minionDrop': {
      // open a MINIONS/ folder and drag the robots out one by one onto their cells
      const targets = changedSquares(state.board, trial.board, (b, a, k) => a.minions[k] && !b.minions[k]);
      const spot = pointOf('.toolbox', 'topRight');
      const folder = overlay('folder-window window', `<div class="title-bar"><span>MINIONS/</span></div>
        <div class="window-body folder-body">${sprite(MINION_SPRITE)}${sprite(MINION_SPRITE)}${sprite(MINION_SPRITE)}</div>`, spot.x - 150, spot.y + 10);
      const dropped = [];
      for (const i of targets) {
        await moveTo(folder.querySelector('.folder-body'));
        await click(clickSound);
        carrying(sprite(MINION_SPRITE));
        await moveTo(cellEl(i));
        await click(clickSound);
        carrying('');
        const at = pointOf(cellEl(i));
        dropped.push(overlay('dropped-minion', sprite(MINION_SPRITE), at.x - 18, at.y - 18));
      }
      folder.remove();
      setTimeout(() => dropped.forEach((el) => el.remove()), 150);
      return undefined;
    }
    case 'markSteal': {
      // grab your X, drop it in a tiny trash can, then put an O in its place
      const [i] = changedSquares(state.board, trial.board, (b, a, k) => a.stolen[k] && !b.stolen[k]);
      const cell = cellEl(i);
      await moveTo(cell);
      await click(clickSound);
      cell?.querySelector('.mark')?.classList.add('grabbed');
      carrying(sprite(X_SPRITE));
      const corner = pointOf('.casing', 'bottomRight');
      const trash = overlay('trash-can', '<span class="bin"></span>', corner.x - 40, corner.y - 46);
      await moveTo({ x: corner.x - 22, y: corner.y - 34 });
      await click(clickSound);
      carrying('');
      await wait(150);
      trash.remove();
      await moveTo(cell);
      return click(clickSound);
    }
    case 'doubleMove': {
      // two quick clicks with a smug wiggle between them
      const cells = changedSquares(state.board, trial.board, (b, a, k) => a.cells[k] === 'O' && b.cells[k] !== 'O');
      for (const [n, i] of cells.entries()) {
        await moveTo(cellEl(i));
        await click(clickSound);
        if (n === 0 && cells.length > 1) await wiggle();
      }
      return undefined;
    }
    case 'boardSpin': {
      // grab the monitor's corner and swing it round
      const casing = document.querySelector('.casing')?.getBoundingClientRect();
      if (!casing) return undefined;
      await moveTo('.casing', { where: 'topRight' });
      await click(clickSound);
      const cx = casing.left + casing.width / 2;
      const cy = casing.top + casing.height / 2;
      const r = Math.hypot(casing.width, casing.height) / 2.2;
      const start = Math.atan2(casing.top - cy, casing.right - cx);
      const arc = [];
      for (let k = 1; k <= 10; k++) {
        const angle = start + (k / 10) * (Math.PI / 2);
        arc.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
      }
      return dragThrough(arc, 35);
    }
    case 'rewriteRules': {
      await moveTo('.rules .countdown');
      return click(clickSound);
    }
    default:
      return undefined;
  }
}

// --- Rule change: open RULES.TXT, select the old rule, delete it, type the new one ---------
// `show(text, selected)` keeps the half-typed text in the game state, so a redraw in
// the middle of the typing shows it too (see render.js, state.ruleTyping).
export async function performRuleRewrite(category, oldName, newName, show, clickSound) {
  const nameEl = () => document.querySelector(`.rule-row[data-category="${category}"] .rule-name`);
  if (!nameEl()) return;
  show(oldName, false);
  await moveTo(nameEl());
  await click(clickSound);
  show(oldName, true); // the old text is highlighted
  await wait(250);
  let text = oldName;
  while (text.length > 0) {
    text = text.slice(0, -1);
    show(text, false);
    await wait(28);
  }
  for (const letter of newName) {
    text += letter;
    show(text, false);
    await wait(38);
  }
  await wait(200);
}

// --- Interface sabotage (cosmetic; never blocks a move) ------------------------------------
// `apply` makes the change in the game state once the cursor gets there.
export async function performSabotage(kind, apply, clickSound) {
  if (kind === 'dragToolbox') {
    const toolbox = document.querySelector('.toolbox');
    if (!toolbox) return;
    await moveTo('.toolbox .title-bar');
    await click(clickSound);
    const start = pointOf('.toolbox .title-bar');
    const dx = 14 + Math.random() * 16;
    const dy = 10 + Math.random() * 14;
    for (let k = 1; k <= 8; k++) {
      await dragThrough([{ x: start.x + (dx * k) / 8, y: start.y + (dy * k) / 8 }], 30);
      toolbox.style.translate = `${(dx * k) / 8}px ${(dy * k) / 8}px`;
    }
    apply({ x: dx, y: dy });
  } else if (kind === 'minimiseToolbox') {
    await moveTo('.toolbox .title-buttons');
    await click(clickSound);
    apply();
  } else if (kind === 'shuffleDisks') {
    await moveTo('.disks');
    await click(clickSound);
    await wiggle();
    apply();
  } else if (kind === 'hideBubble') {
    await moveTo('.bubble');
    await click(clickSound);
    const to = pointOf('.patience');
    if (to) await dragThrough([to], 200);
    apply();
  }
}

// --- HACK.EXE: Otto retypes every line you changed, then clicks [RUN] ------------------------
// editor: the hackEditor.js functions. steps: [{ line, from, to }] (line index, old text, new text).
export async function performHackRestore(editor, steps, clickSound) {
  for (const { line, from, to } of steps) {
    await moveTo(editor.lineElement(line));
    await click(clickSound);
    editor.setLineText(line, from, { selected: true }); // select the whole line
    await wait(220);
    let text = from;
    while (text.length > 0) {
      text = text.slice(0, -2); // fast, two letters at a time
      editor.setLineText(line, text, { typing: true });
      await wait(10);
    }
    for (const letter of to) {
      text += letter;
      editor.setLineText(line, text, { typing: true });
      await wait(14);
    }
    editor.setLineText(line, to);
    await wait(120);
  }
  await moveTo(editor.runButton());
  await click(clickSound);
}
