// ui/effects.js
// One-off visual effects that live OUTSIDE the normal render (so a re-render
// doesn't cut them off): the rubber stamp, the board spin, and Lights Out.
// (The full juicy versions arrive in Milestones 4 and 5.)

// --- Rubber stamp ("CAUGHT!") ------------------------------------------------
export function showStamp(text) {
  document.querySelectorAll('.stamp').forEach((old) => old.remove()); // one stamp at a time
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

// --- 1952 -> scrapbook: glitch, then peel the old screen away -------------------
// How it works:
//   1. createPeelSheet() copies the current (1952-style) page into a "sheet"
//      that covers the whole window. The real page can then switch to the new
//      look underneath without the player seeing it yet.
//   2. play() glitches the sheet (a couple of horizontal strips slide sideways —
//      movement only, no brightness changes, so nothing flashes) and then peels
//      it from the bottom-right corner like a sticker, showing its white back.
//   With prefers-reduced-motion the sheet simply fades out instead.

const GLITCH_MS = 900;
const PEEL_MS = 1500;

export function createPeelSheet(app) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const box = app.getBoundingClientRect();

  const sheet = document.createElement('div');
  sheet.className = 'peel-sheet era-1952';
  sheet.setAttribute('aria-hidden', 'true');

  // A full-window "screen" holding a copy of the page, in the same position.
  function makeScreen() {
    const screen = document.createElement('div');
    screen.className = 'peel-screen';
    const copy = app.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id')); // no duplicate ids
    copy.style.cssText = `position:absolute; left:${box.left}px; top:${box.top}px; width:${box.width}px; margin:0;`;
    screen.appendChild(copy);
    return screen;
  }

  const screen = makeScreen();
  // Two extra copies, each clipped to a thin strip, slide sideways during the glitch.
  const bands = [1, 2].map((n) => {
    const band = makeScreen();
    band.classList.add('glitch-band', `glitch-band-${n}`);
    return band;
  });
  // The folded-over part of the sticker (its plain white back).
  const flapShadow = document.createElement('div');
  flapShadow.className = 'peel-flap-shadow';
  const flap = document.createElement('div');
  flap.className = 'peel-flap';
  flapShadow.appendChild(flap);

  sheet.append(screen, ...bands, flapShadow);
  document.body.appendChild(sheet);

  return {
    play: () => (reduceMotion ? fadeAway(sheet) : glitchThenPeel(sheet, screen, flap)),
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fadeAway(sheet) {
  sheet.classList.add('fading');
  await wait(800);
  sheet.remove();
}

async function glitchThenPeel(sheet, screen, flap) {
  sheet.classList.add('glitching');
  await wait(GLITCH_MS);
  sheet.classList.remove('glitching');
  await animate(PEEL_MS, (progress) => drawPeel(screen, flap, easeInOut(progress)));
  sheet.remove();
}

// Call draw(progress) every frame, with progress going from 0 to 1 over `ms`.
function animate(ms, draw) {
  return new Promise((resolve) => {
    const start = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - start) / ms);
      draw(progress);
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// The fold is the diagonal line x + y = fold. It starts at the bottom-right
// corner (fold = width + height) and sweeps to the top-left (fold = 0).
//   - The part of the sheet above/left of the fold is still stuck down.
//   - The part past the fold has been lifted and folded back over: we draw it
//     as the white flap, which is that part mirrored across the fold line.
function drawPeel(screen, flap, progress) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fold = (w + h) * (1 - progress);
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];

  const stuck = clipPolygon(corners, ([x, y]) => fold - (x + y));
  const lifted = clipPolygon(corners, ([x, y]) => x + y - fold);
  const flapShape = lifted.map(([x, y]) => [fold - y, fold - x]); // mirror across the fold

  screen.style.clipPath = toPolygon(stuck);
  flap.style.clipPath = toPolygon(flapShape);
}

// Keep the part of a polygon where side(point) >= 0 (cutting it along a straight line).
function clipPolygon(points, side) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) result.push(a);
    if (sa >= 0 !== sb >= 0) {
      // The edge a->b crosses the line: add the crossing point.
      const t = sa / (sa - sb);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

function toPolygon(points) {
  if (points.length < 3) return 'polygon(0 0, 0 0, 0 0)'; // nothing to show
  return `polygon(${points.map(([x, y]) => `${x}px ${y}px`).join(', ')})`;
}
