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

// --- The "unhinged" chaos that grows as Otto loses patience ----------------------------------
// A slow timer adds the occasional extra: static on the screen (stage 1+), title
// glitches and fake "not responding" pop-ups (stage 2+). Calm mode switches it off.
// Nothing here flashes: things drift, shift or appear and stay put.

const TITLE = 'AGENTS GONE WRONG';
const TITLE_GLITCHES = ['AGENTS GONE WR0NG', 'AG3NTS GONE WRONG', 'AGENTS G0NE WRONG', 'AGENT$ GONE WRONG'];

export function initChaos(getInfo) {
  let tick = 0;
  setInterval(() => {
    tick++;
    const { stage, calm, active } = getInfo();
    if (!active || calm) return;
    if (stage >= 1 && tick % 10 === 0 && !reduceMotion()) staticBand();
    if (stage >= 2 && tick % 7 === 3) glitchTitle();
    if (stage >= 2 && tick % 14 === 6) spawnFakePopups(1, 'OTTO.EXE is not responding', stage >= 3 ? 2 : 1);
  }, 1000);
}

// A few horizontal lines of pixel noise drift down the CRT screen once.
function staticBand() {
  const screen = document.querySelector('.screen');
  if (!screen) return;
  const box = screen.getBoundingClientRect();
  const band = document.createElement('div');
  band.className = 'static-band';
  band.setAttribute('aria-hidden', 'true');
  Object.assign(band.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, '--travel': `${box.height - 24}px` });
  document.body.appendChild(band);
  setTimeout(() => band.remove(), 1600);
}

// The title swaps a letter or two for a moment: AGENTS GONE WR0NG.
function glitchTitle() {
  const title = document.querySelector('.topbar .game-title');
  if (!title) return;
  title.textContent = TITLE_GLITCHES[Math.floor(Math.random() * TITLE_GLITCHES.length)];
  setTimeout(() => {
    if (title.isConnected) title.textContent = TITLE;
  }, 450);
}

// Fake pop-ups in EMPTY space (never over the board). Both buttons say WAIT and close it.
export function spawnFakePopups(count, text, max = Infinity) {
  const monitor = document.querySelector('.monitor')?.getBoundingClientRect();
  for (let n = 0; n < count; n++) {
    if (document.querySelectorAll('.fake-popup').length >= max) return;
    const spot = freeSpot(monitor);
    if (!spot) return;
    const popup = document.createElement('div');
    popup.className = 'fake-popup window';
    popup.setAttribute('role', 'alertdialog');
    popup.setAttribute('aria-label', text);
    popup.innerHTML = `
      <div class="title-bar"><span>OTTO.EXE</span><span class="title-buttons" aria-hidden="true">_ □ ×</span></div>
      <div class="window-body"><p>${text}</p>
        <div class="fake-buttons"><button class="btn small">[WAIT]</button><button class="btn small">[WAIT]</button></div>
      </div>`;
    Object.assign(popup.style, { left: `${spot.x}px`, top: `${spot.y}px` });
    popup.addEventListener('click', (e) => {
      if (e.target.closest('button')) popup.remove();
    });
    document.body.appendChild(popup);
  }
}

// Somewhere a 260x130 pop-up fits without covering the monitor (or other pop-ups).
function freeSpot(monitor) {
  const w = 260;
  const h = 130;
  const taken = [...document.querySelectorAll('.fake-popup')].map((el) => el.getBoundingClientRect());
  if (monitor) taken.push(monitor);
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = 16 + Math.random() * (window.innerWidth - w - 32);
    const y = 72 + Math.random() * (window.innerHeight - h - 120);
    const overlaps = taken.some((r) => x < r.right + 8 && x + w > r.left - 8 && y < r.bottom + 8 && y + h > r.top - 8);
    if (!overlaps) return { x, y };
  }
  return null;
}

export function clearFakePopups() {
  document.querySelectorAll('.fake-popup').forEach((el) => el.remove());
}

// Meltdown: horizontal bands of the board slide sideways for ~300ms (no flashing).
export function tearBoard() {
  if (reduceMotion()) return;
  const area = document.querySelector('.board-area');
  if (!area) return;
  const box = area.getBoundingClientRect();
  const bands = [[10, 22, -14], [42, 52, 10], [70, 78, -8]]; // [top %, bottom %, shift px]
  for (const [top, bottom, shift] of bands) {
    const copy = area.cloneNode(true);
    copy.className = 'tear-band';
    copy.setAttribute('aria-hidden', 'true');
    Object.assign(copy.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      clipPath: `inset(${top}% 0 ${100 - bottom}% 0)`,
      transform: `translateX(${shift}px)`,
    });
    document.body.appendChild(copy);
    setTimeout(() => copy.remove(), 300);
  }
}

// --- The tab when Otto "closes the game" ----------------------------------------------------
let originalTitle = null;
export function setTabGone() {
  originalTitle ??= document.title;
  document.title = 'Otto has left';
  setFavicon("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect x='4' y='4' width='8' height='8' fill='%23000'/%3E%3C/svg%3E");
}
export function restoreTab() {
  if (originalTitle) document.title = originalTitle;
  setFavicon(null);
}
function setFavicon(href) {
  let link = document.querySelector('link[rel="icon"]');
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}
