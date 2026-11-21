// ui/ottoCursor.js
// Otto's own mouse pointer: a chunky pink pixel hand with an "OTTO" name tag.
// Every Otto action is performed by hand: the cursor glides to the target, clicks,
// drags, carries things... It lives on its own top layer and never takes clicks
// (pointer-events: none), so it can't block the player.

import { sprite, CURSOR_HAND, PALETTE } from './sprites.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let cursor = null;     // the cursor element
let carry = null;      // whatever it's carrying (a sprite next to the hand)
let position = { x: -60, y: -60 };
let patience = 100;    // lower patience = faster and jerkier
let trail = false;     // at the highest glitch level the cursor leaves a pixel trail

// Pink hand: the arrow-hand sprite with cream swapped for pink.
const PINK_HAND = CURSOR_HAND.map((row) => row.replaceAll('w', 'p'));

export function initOttoCursor() {
  if (cursor) return;
  cursor = document.createElement('div');
  cursor.className = 'otto-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = `${sprite(PINK_HAND, 'hand', PALETTE)}<span class="cursor-tag">OTTO</span><span class="cursor-carry"></span>`;
  document.body.appendChild(cursor);
  carry = cursor.querySelector('.cursor-carry');
  place(position.x, position.y);
}

export function setCursorPatience(value) {
  patience = value;
}

export function setCursorTrail(on) {
  trail = on;
}

function place(x, y) {
  position = { x, y };
  // The hand's fingertip is ~8px in from the sprite's left edge.
  cursor.style.transform = `translate(${Math.round(x - 8)}px, ${Math.round(y - 2)}px)`;
  if (trail && Math.random() < 0.35) dropTrailPixel(x, y);
}

function dropTrailPixel(x, y) {
  const dot = document.createElement('i');
  dot.className = 'cursor-trail';
  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;
  document.body.appendChild(dot);
  setTimeout(() => dot.remove(), 500);
}

// Where to aim for an element: its centre, or a corner.
export function pointOf(target, where = 'centre') {
  if (!target) return null;
  if (typeof target.x === 'number') return target;
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return null;
  const box = el.getBoundingClientRect();
  if (where === 'topRight') return { x: box.right - 6, y: box.top + 6 };
  if (where === 'bottomRight') return { x: box.right - 6, y: box.bottom - 6 };
  if (where === 'topLeft') return { x: box.left + 6, y: box.top + 6 };
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// Glide to a point on an eased, slightly curved path, with a tiny overshoot.
// Speed 600-900 px/s (faster and jerkier when Otto is angrier). Returns a promise.
export function moveTo(target, { where = 'centre', speed = null } = {}) {
  initOttoCursor();
  const end = pointOf(target, where);
  if (!end) return Promise.resolve();
  const start = { ...position };
  // Off-screen start: appear from the right edge of the screen.
  if (start.x < 0) {
    start.x = window.innerWidth + 20;
    start.y = end.y;
  }
  const anger = 1 - patience / 100;
  const pxPerSecond = speed ?? 600 + 300 * anger;
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const duration = Math.max(120, (distance / pxPerSecond) * 1000);
  if (reduceMotion()) {
    place(end.x, end.y);
    return new Promise((resolve) => setTimeout(resolve, 150));
  }
  // The curve: a control point pushed sideways from the middle of the path.
  const bend = (Math.random() < 0.5 ? -1 : 1) * Math.min(80, distance * 0.18);
  const nx = -(end.y - start.y) / (distance || 1);
  const ny = (end.x - start.x) / (distance || 1);
  const control = { x: (start.x + end.x) / 2 + nx * bend, y: (start.y + end.y) / 2 + ny * bend };
  const overshoot = 0.06 + 0.06 * anger;
  return new Promise((resolve) => {
    const began = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - began) / duration);
      // "ease out back": fast, then a tiny overshoot past the target, then settle
      const c1 = overshoot * 10;
      const u = 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      const x = (1 - u) * (1 - u) * start.x + 2 * (1 - u) * u * control.x + u * u * end.x;
      const y = (1 - u) * (1 - u) * start.y + 2 * (1 - u) * u * control.y + u * u * end.y;
      const jitter = anger > 0.5 ? (Math.random() - 0.5) * 6 * anger : 0; // jerkier when angry
      place(x + jitter, y + jitter);
      if (t < 1) requestAnimationFrame(frame);
      else {
        place(end.x, end.y);
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

// A click: the hand presses down, a pixel ripple, a click sound (passed in).
export function click(sound) {
  initOttoCursor();
  cursor.classList.remove('pressing');
  void cursor.offsetWidth;
  cursor.classList.add('pressing');
  const ripple = document.createElement('i');
  ripple.className = 'cursor-ripple';
  ripple.style.left = `${position.x}px`;
  ripple.style.top = `${position.y}px`;
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 450);
  sound?.();
  return wait(140);
}

// Carry something next to the hand (sprite HTML), or nothing.
export function carrying(html = '') {
  initOttoCursor();
  carry.innerHTML = html;
}

// Caught! The cursor gets slapped away with a pixel SMACK and flies off screen.
export function slap() {
  initOttoCursor();
  const smack = document.createElement('div');
  smack.className = 'smack';
  smack.textContent = 'SMACK!';
  smack.style.left = `${position.x}px`;
  smack.style.top = `${position.y}px`;
  document.body.appendChild(smack);
  setTimeout(() => smack.remove(), 900);
  carrying('');
  return moveTo({ x: window.innerWidth + 60, y: Math.max(40, position.y - 160) }, { speed: 2600 });
}

// A smug little wiggle (between the two clicks of a Double Move).
export async function wiggle() {
  const { x, y } = position;
  for (const dx of [-8, 8, -6, 6, 0]) {
    place(x + dx, y);
    await wait(60);
  }
}

// Drag in steps through a list of points (for drawing lines, rotating the monitor...).
export async function dragThrough(points, msPerPoint = 40) {
  for (const p of points) {
    place(p.x, p.y);
    await wait(msPerPoint);
  }
}

// Park the cursor out of the way (top right) between actions.
export function park() {
  return moveTo({ x: window.innerWidth - 40, y: 90 });
}

export function cursorPosition() {
  return { ...position };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
