// ui/effects.js
// One-off visual effects that live OUTSIDE the normal render (so a re-render
// doesn't cut them off): the rubber stamp, the board spin, and Lights Out.
// (The full juicy versions arrive in Milestones 4 and 5.)

// --- Rubber stamp ("CAUGHT!") ------------------------------------------------
export function showStamp(text) {
  const stamp = document.createElement('div');
  stamp.className = 'stamp';
  stamp.textContent = text;
  stamp.setAttribute('aria-hidden', 'true'); // the notice text already says it
  document.body.appendChild(stamp);
  setTimeout(() => stamp.remove(), 1600);
}

// --- Board spin --------------------------------------------------------------
// The board data has already been rotated; this animates it spinning into place.
export function spinBoardEffect() {
  const board = document.querySelector('.board');
  if (!board) return;
  board.classList.remove('spin-in');
  void board.offsetWidth; // restart the animation (forces the browser to reflow)
  board.classList.add('spin-in');
}

// --- Lights Out --------------------------------------------------------------
// A dark layer over the whole page with a see-through "torch" circle that
// follows the mouse (or the keyboard-focused square). It fades in and out
// smoothly with a CSS transition — never flashes.
let darkness = null;

function ensureDarkness() {
  if (darkness) return darkness;
  darkness = document.createElement('div');
  darkness.className = 'darkness';
  darkness.setAttribute('aria-hidden', 'true');
  document.body.appendChild(darkness);
  moveTorch(window.innerWidth / 2, window.innerHeight / 2);
  window.addEventListener('pointermove', (e) => moveTorch(e.clientX, e.clientY));
  return darkness;
}

function moveTorch(x, y) {
  darkness.style.setProperty('--torch-x', `${x}px`);
  darkness.style.setProperty('--torch-y', `${y}px`);
}

// Point the torch at an element (used when playing with the keyboard).
export function pointTorchAt(element) {
  if (!darkness || !element) return;
  const box = element.getBoundingClientRect();
  moveTorch(box.left + box.width / 2, box.top + box.height / 2);
}

export function setLights(on) {
  ensureDarkness().classList.toggle('on', !on);
}

// --- Point pops ("+3") ----------------------------------------------------------
// A small sticker that floats up from the points counter and fades away.
let popsInFlight = 0; // spreads out pops that happen at the same time
export function popPoints(amount) {
  const counter = document.getElementById('points');
  if (!counter) return;
  const box = counter.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'point-pop';
  pop.textContent = `+${amount}`;
  pop.setAttribute('aria-hidden', 'true'); // the points counter itself is announced
  pop.style.left = `${box.left + box.width / 2 + popsInFlight * 22}px`;
  pop.style.top = `${box.top}px`;
  document.body.appendChild(pop);
  popsInFlight++;
  setTimeout(() => {
    pop.remove();
    popsInFlight--;
  }, 1100);
}
