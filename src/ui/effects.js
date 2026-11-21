// ui/effects.js
// One-off effects that live OUTSIDE the normal redraw (so a redraw doesn't cut
// them short): pop-up alerts, "+3" points, the board spin and Lights Out.

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- A small pixel pop-up window: "CAUGHT!", "VETOED!", "FINAL RULE!" --------------------
// It slams in like a rubber stamp, then disappears. Only one at a time.
export function showPopup(text) {
  document.querySelectorAll('.alert-popup').forEach((old) => old.remove());
  const popup = document.createElement('div');
  popup.className = 'alert-popup window';
  popup.setAttribute('aria-hidden', 'true'); // the message line already says it
  popup.innerHTML = `
    <div class="title-bar"><span>ALERT.EXE</span><span class="title-buttons">_ □ ×</span></div>
    <div class="alert-text">${text}</div>`;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1600);
}

// --- "+3" points floating up from the points counter -------------------------------------
let popsInFlight = 0; // spreads out pops that happen at the same time
export function popPoints(amount) {
  const counter = document.getElementById('points');
  if (!counter) return;
  const box = counter.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'point-pop';
  pop.textContent = `+${amount}`;
  pop.setAttribute('aria-hidden', 'true'); // the points counter itself is announced
  pop.style.left = `${box.left + box.width / 2 + popsInFlight * 28}px`;
  pop.style.top = `${box.top}px`;
  document.body.appendChild(pop);
  popsInFlight++;
  setTimeout(() => {
    pop.remove();
    popsInFlight--;
  }, 1000);
}

// --- Board spin ----------------------------------------------------------------------------
// The board data has already been rotated; this animates it turning into place.
export function spinBoardEffect() {
  const board = document.querySelector('.board');
  if (!board || reduceMotion()) return;
  board.classList.remove('spin-in');
  void board.offsetWidth; // restart the animation
  board.classList.add('spin-in');
}

// --- Lights Out ----------------------------------------------------------------------------
// The room goes dark, except for the monitor's outline glow and a hard-edged torch
// circle around the cursor (or the keyboard-focused square). Fades, never flashes.
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
  // Snap to a 4px grid so the torch moves in chunky pixel steps.
  darkness.style.setProperty('--torch-x', `${Math.round(x / 4) * 4}px`);
  darkness.style.setProperty('--torch-y', `${Math.round(y / 4) * 4}px`);
}

// Point the torch at an element (used when playing with the keyboard).
export function pointTorchAt(element) {
  if (!darkness || !element) return;
  const box = element.getBoundingClientRect();
  moveTorch(box.left + box.width / 2, box.top + box.height / 2);
}

export function setLights(on) {
  ensureDarkness().classList.toggle('on', !on);
  document.body.classList.toggle('lights-out', !on);
}
