// ui/glitch.js
// Glitching that grows with Otto's madness (AGENTIC.md section 4).
// Intensity g goes from 0 (patience 100-76) to 1 (patience 0). Short bursts
// (150-400 ms) happen on Otto's turns and every 6-12 s (more often as g rises):
//   g > 0.1  scanline jitter
//   g > 0.3  RGB split on headings and Otto's bubble, random letters -> symbols (R#LES.TXT)
//   g > 0.5  block displacement (shifted slices of the side panels), "(Not Responding)" title bars
//   g > 0.7  datamosh smears, small inverted colour blocks, a 2-4 px UI shudder
//   g > 0.9  big tears on Otto's turns, the cracks pulse, the cursor leaves a pixel trail
// Safety: never more than 2 bursts a second, no full-screen flashes, nothing over the
// board, the turn indicator or pop-ups (overlays avoid them; scanlines stay faint),
// no bursts while the mouse button is held down. Reduced motion or Calm mode: static
// only (a faint tint and corrupted letters; the cracks are drawn by render.js).

import { setCursorTrail } from './ottoCursor.js';

const SYMBOLS = '#@%&$!?*/\\<>';
const MIN_GAP_MS = 500; // at most 2 bursts per second
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let getInfo = null;
let layer = null;
let lastBurst = 0;
let pointerDown = false;
let timer = null;

// info: { patience, calm, active, rampage }
export function initGlitch(infoFn) {
  getInfo = infoFn;
  layer = document.createElement('div');
  layer.className = 'glitch-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  window.addEventListener('pointerdown', () => (pointerDown = true));
  window.addEventListener('pointerup', () => (pointerDown = false));
  window.addEventListener('pointercancel', () => (pointerDown = false));
  scheduleNext();
  setInterval(updateStatic, 500);
}

export function glitchLevel(patience) {
  if (patience >= 76) return 0;
  return Math.min(1, (76 - patience) / 76);
}

function scheduleNext() {
  clearTimeout(timer);
  const g = getInfo ? glitchLevel(getInfo().patience) : 0;
  const wait = 12000 - 6000 * g + Math.random() * 2000 * (1 - g); // 6-12 s, sooner when madder
  timer = setTimeout(() => {
    glitchBurst();
    scheduleNext();
  }, wait);
}

// The steady, non-moving part: a faint tint and the pulse of the cracks.
function updateStatic() {
  const info = getInfo();
  const g = info.active && !info.rampage ? glitchLevel(info.patience) : 0;
  document.body.style.setProperty('--glitch-tint', (g * 0.12).toFixed(3));
  document.body.classList.toggle('glitch-tinted', g > 0.1);
  const still = info.calm || reduceMotion();
  document.body.classList.toggle('cracks-pulse', g > 0.9 && !still);
  setCursorTrail(g > 0.9 && !still);
}

// --- A burst ---------------------------------------------------------------------------------
// `ottoTurn`: bursts on Otto's turns may add the big tears. `force` (debug) = act as g = 1.
export function glitchBurst({ ottoTurn = false, force = false } = {}) {
  const info = getInfo();
  if (!force && (!info.active || info.rampage)) return;
  const g = force ? 1 : glitchLevel(info.patience);
  if (g <= 0.1 && !force) return;
  const now = Date.now();
  if (now - lastBurst < MIN_GAP_MS || pointerDown) return;
  lastBurst = now;
  const duration = 150 + Math.random() * 250;

  // Static only: just corrupt a few letters for a moment.
  if (info.calm || reduceMotion()) {
    if (g > 0.3) corruptText(g, duration * 2);
    return;
  }

  const classes = ['glitch-scan'];
  if (g > 0.3) classes.push('glitch-rgb');
  if (g > 0.5) classes.push('glitch-not-responding');
  if (g > 0.7) classes.push('glitch-shudder');
  document.body.classList.add(...classes);
  setTimeout(() => document.body.classList.remove(...classes), duration);

  scanlines(duration);
  if (g > 0.3) corruptText(g, duration);
  if (g > 0.5) displaceBlocks(Math.round(1 + g * 3), duration);
  if (g > 0.7) {
    smears(Math.round(1 + g * 2), duration);
    invertBlocks(Math.round(2 + g * 3), duration);
  }
  if (g > 0.9 && (ottoTurn || force)) bigTears(duration + 100);
}

// --- What must stay clean -----------------------------------------------------------------------
function keepClear() {
  return [...document.querySelectorAll('.board-area, .turn-indicator, .speech-bar, .rule-popup, .ending-window, .debug')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0);
}

const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// A random rectangle on screen that avoids the clean areas (or null).
function freeRect(w, h) {
  const clear = keepClear();
  for (let tries = 0; tries < 12; tries++) {
    const left = Math.random() * (window.innerWidth - w);
    const top = Math.random() * (window.innerHeight - h);
    const r = { left, top, right: left + w, bottom: top + h };
    if (!clear.some((c) => overlaps(r, c))) return r;
  }
  return null;
}

function addPiece(className, style, duration) {
  const el = document.createElement('div');
  el.className = className;
  Object.assign(el.style, style);
  layer.appendChild(el);
  setTimeout(() => el.remove(), duration);
  return el;
}

// --- The effects -------------------------------------------------------------------------------
function scanlines(duration) {
  addPiece('glitch-lines', {}, duration);
}

// Random letters in title bars and headings -> symbols, then back.
function corruptText(g, duration) {
  const targets = [...document.querySelectorAll('.title-bar > span:first-child, .stage-label')]
    .filter((el) => !el.closest('.rule-popup, .ending-window') && el.children.length === 0);
  const chance = 0.15 + g * 0.25;
  for (const el of targets) {
    if (Math.random() > 0.6) continue;
    const original = el.textContent;
    const broken = [...original].map((ch) => (/[A-Za-z]/.test(ch) && Math.random() < chance ? SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)] : ch)).join('');
    el.textContent = broken;
    setTimeout(() => {
      if (el.isConnected && el.textContent === broken) el.textContent = original;
    }, duration);
  }
}

// Shifted copies of slices of the side panels (clipped layers; the board is never copied).
function displaceBlocks(count, duration) {
  const panels = [...document.querySelectorAll('.toolbox, .terminal, .rules, .topbar')];
  for (let n = 0; n < count && panels.length; n++) {
    const panel = panels[Math.floor(Math.random() * panels.length)];
    const box = panel.getBoundingClientRect();
    const top = Math.random() * 80;
    const copy = panel.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    copy.classList.add('glitch-slice');
    Object.assign(copy.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      margin: 0,
      clipPath: `inset(${top}% 0 ${Math.max(0, 100 - top - 6 - Math.random() * 12)}% 0)`,
      transform: `translateX(${(Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 14)}px)`,
    });
    layer.appendChild(copy);
    setTimeout(() => copy.remove(), duration);
  }
}

function smears(count, duration) {
  for (let n = 0; n < count; n++) {
    const r = freeRect(120 + Math.random() * 160, 10 + Math.random() * 18);
    if (r) addPiece('glitch-smear', { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` }, duration);
  }
}

function invertBlocks(count, duration) {
  for (let n = 0; n < count; n++) {
    const size = 16 + Math.random() * 40;
    const r = freeRect(size, size * (0.4 + Math.random() * 0.6));
    if (r) addPiece('glitch-invert', { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` }, duration);
  }
}

// Big tears: full-width torn strips, cut around the board so the cells stay clean.
function bigTears(duration) {
  const board = document.querySelector('.board-area')?.getBoundingClientRect();
  for (let n = 0; n < 3; n++) {
    const y = Math.random() * (window.innerHeight - 20);
    const h = 6 + Math.random() * 12;
    const shift = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 20);
    const crossesBoard = board && y < board.bottom && y + h > board.top;
    const gap = 34; // more than the biggest shift, so a shifted strip never reaches the board
    const pieces = crossesBoard ? [[0, board.left - gap], [board.right + gap, window.innerWidth]] : [[0, window.innerWidth]];
    for (const [from, to] of pieces) {
      addPiece('glitch-tear', { left: `${from}px`, top: `${y}px`, width: `${to - from}px`, height: `${h}px`, translate: `${shift}px 0` }, duration);
    }
  }
}
