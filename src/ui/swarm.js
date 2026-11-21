// ui/swarm.js
// Otto's roaming minion swarm: tiny pixel robots that wander over the INTERFACE
// (never the board) and cause havoc. How many roam depends on Otto's stage:
// Calm 0, Irritated 1, Unhinged 3, Meltdown 6 (and none in Calm mode).
//
// Each minion picks a job for 4-8 seconds, then moves on:
//   chewer    nibbles a window corner (pixel bites appear)
//   thief     carries one of your floppy disks away (click it to get the disk back, +1)
//   graffiti  sprays "OTTO WUZ HERE" in RULES.TXT
//   unplugger pulls the monitor cable (the screen dims until you plug it back in)
//   heckler   holds a little sign next to the monitor
//   dancer    dances on Otto's monitor
// Click a roaming minion to BONK it off the screen (+1 point, max 5 per round).
// They live on their own layer, never sit on cells or cover the board, the turn
// indicator or NEW_RULE.EXE, and they pause during rule changes and the rampage.

import { sprite, MINION_SPRITE, floppy } from './sprites.js';

const SWARM_SIZE = [0, 1, 3, 6];
const WALK_SPEED = 70;     // px per second
const LANE_Y = 72;         // they cross between panels along this lane (above the panels)
const JOBS = ['chewer', 'thief', 'graffiti', 'unplugger', 'heckler', 'dancer'];
const SIGNS = ['BAD MOVE', 'LOL', '4 IN A ROW?? lol', 'NOOB', 'TRY HARDER'];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let minions = [];
let hooks = null;          // callbacks into the game (see initSwarm)
let lastFrame = 0;
let layer = null;

// hooks: { getInfo, onBonk, onSteal, onReturnDisk, onGraffiti, onUnplug }
export function initSwarm(gameHooks) {
  hooks = gameHooks;
  layer = document.createElement('div');
  layer.className = 'swarm-layer';
  document.body.appendChild(layer);
  setInterval(adjustCount, 1000);
  requestAnimationFrame(frame);
}

// Spawn one now (debug "Spawn minion").
export function spawnMinion() {
  minions.push(makeMinion(true)); // a forced one isn't removed by the stage count
}

function adjustCount() {
  const { stage, calm, active, rampage } = hooks.getInfo();
  if (rampage) return;
  const wanted = active && !calm ? SWARM_SIZE[stage] : 0;
  const alive = minions.filter((m) => !m.gone);
  if (alive.length < wanted) minions.push(makeMinion());
  else if (alive.length > wanted && !alive[alive.length - 1].forced) leave(alive[alive.length - 1]);
}

function makeMinion(forced = false) {
  const el = document.createElement('button');
  el.className = 'roamer';
  el.setAttribute('aria-label', 'A roaming minion. Click to bonk it.');
  el.innerHTML = `${sprite(MINION_SPRITE)}<span class="roamer-carry"></span><span class="roamer-sign"></span>`;
  layer.appendChild(el);
  const minion = { el, x: window.innerWidth + 10, y: LANE_Y, path: [], job: null, jobEnds: 0, forced, gone: false };
  el.addEventListener('click', () => bonk(minion));
  minion.y = LANE_Y;
  draw(minion);
  return minion;
}

function draw(m) {
  m.el.style.transform = `translate(${Math.round(m.x - 8)}px, ${Math.round(m.y - 15)}px)`;
}

// --- Where things are on screen ------------------------------------------------------------
function rect(selector) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  return el ? el.getBoundingClientRect() : null;
}
const random = (list) => list[Math.floor(Math.random() * list.length)];

// A walking route that never crosses the monitor (so never the board): step out
// to the side of the monitor, up to the lane above the panels, along it, down
// beside the monitor, then across to the target.
function routeTo(m, x, y) {
  const c = rect('.casing');
  const pad = 16;
  const inside = (px) => c && px > c.left - pad && px < c.right + pad;
  const side = (px) => (px - c.left < c.right - px ? c.left - pad : c.right + pad);
  const path = [];
  let cx = m.x;
  if (inside(cx)) path.push({ x: (cx = side(cx)), y: m.y });
  const tx = inside(x) ? side(x) : x;
  if (Math.abs(tx - cx) > 160 || inside(x)) path.push({ x: cx, y: LANE_Y }, { x: tx, y: LANE_Y });
  path.push({ x: tx, y });
  if (tx !== x) path.push({ x, y });
  m.path = path;
}

// Pick a new job and walk to where it happens.
function pickJob(m) {
  m.job = random(JOBS);
  m.target = null;
  const casing = rect('.casing');
  if (m.job === 'chewer') {
    const win = rect(random(['.toolbox', '.rules', '.terminal']));
    if (win) m.target = { x: win.right - 10, y: win.top + 4 };
  } else if (m.job === 'thief') {
    const disks = [...document.querySelectorAll('.disk:not(.stolen-away)')];
    if (disks.length) {
      m.disk = random(disks);
      const box = m.disk.getBoundingClientRect();
      m.target = { x: box.left + box.width / 2, y: box.top + 2 };
    }
  } else if (m.job === 'graffiti') {
    const rules = rect('.rules');
    if (rules) m.target = { x: rules.left + 40 + Math.random() * (rules.width - 80), y: rules.bottom - 18 };
  } else if (m.job === 'unplugger') {
    const cable = rect('#plug');
    if (cable) m.target = { x: cable.left + cable.width / 2, y: cable.top + cable.height / 2 };
  } else if (m.job === 'heckler') {
    // beside the monitor casing (never over the screen or board)
    if (casing) m.target = { x: Math.random() < 0.5 ? casing.left - 24 : casing.right + 24, y: casing.top + casing.height * 0.6 };
  } else if (m.job === 'dancer') {
    const otto = rect('.otto');
    if (otto) m.target = { x: otto.left + otto.width / 2, y: otto.top + 6 };
  }
  if (!m.target) {
    m.job = null;
    return;
  }
  routeTo(m, m.target.x, m.target.y);
  m.arrived = false;
}

// The job itself, once the minion gets there.
function startJob(m, now) {
  m.arrived = true;
  m.jobEnds = now + 4000 + Math.random() * 4000;
  m.el.classList.add(`job-${m.job}`);
  if (m.job === 'thief' && m.disk) {
    const id = m.disk.dataset.powerup;
    m.carrying = id;
    m.el.querySelector('.roamer-carry').innerHTML = sprite(floppy('c'));
    hooks.onSteal(id);
    routeTo(m, -30, m.y); // carry it slowly off to the left
  } else if (m.job === 'graffiti') {
    const rules = rect('.rules');
    if (rules) hooks.onGraffiti({ text: random(['OTTO WUZ HERE', '<3 OTTO', 'HUMANS LOL', ':P']), x: ((m.x - rules.left) / rules.width) * 100, y: ((m.y - rules.top) / rules.height) * 100 });
  } else if (m.job === 'unplugger') {
    hooks.onUnplug();
    const c = rect('.casing');
    if (c) routeTo(m, c.right + 30, m.y); // steps aside so you can reach the cable
  } else if (m.job === 'heckler') {
    m.el.querySelector('.roamer-sign').textContent = random(SIGNS);
  }
}

function endJob(m) {
  if (m.job === 'thief' && m.carrying) {
    hooks.onReturnDisk(m.carrying); // it gives up and drops it back
    m.carrying = null;
    m.el.querySelector('.roamer-carry').innerHTML = '';
  }
  m.el.classList.remove(`job-${m.job}`);
  m.el.querySelector('.roamer-sign').textContent = '';
  m.job = null;
}

// Chewer: little pixel bites appear at the window corner.
function bite(m) {
  const b = document.createElement('i');
  b.className = 'bite';
  b.style.left = `${m.x - 4 + Math.random() * 8}px`;
  b.style.top = `${m.y - 2 + Math.random() * 6}px`;
  layer.appendChild(b);
  setTimeout(() => b.remove(), 12000);
}

// --- Click: BONK -------------------------------------------------------------------------------
function bonk(m) {
  if (m.gone) return;
  if (m.carrying) {
    hooks.onReturnDisk(m.carrying, true); // it drops your disk (+1)
    m.carrying = null;
  } else {
    hooks.onBonk();
  }
  m.gone = true;
  m.el.classList.add('bonked');
  setTimeout(() => m.el.remove(), 700);
}

function leave(m) {
  if (m.carrying) hooks.onReturnDisk(m.carrying);
  m.gone = true;
  m.el.remove();
}

// --- The rampage: they cheer, then fall with the shards -------------------------------------
function rampageStep(phase) {
  for (const m of minions) {
    if (m.gone) continue;
    m.el.classList.toggle('cheering', phase === 'fine' || phase === 'chaos');
    if (phase === 'shatter' && !m.falling) {
      m.falling = true;
      m.el.classList.add('falling');
    }
    if (['crash', 'goodbye', 'crtOff', 'black', 'final'].includes(phase)) leave(m);
  }
}

// Remove everything (new match).
export function clearSwarm() {
  minions.forEach((m) => leave(m));
  minions = [];
  layer?.querySelectorAll('.bite').forEach((b) => b.remove());
}

// --- The animation loop -------------------------------------------------------------------------
function frame(now) {
  const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  const info = hooks.getInfo();
  minions = minions.filter((m) => !m.gone || m.el.isConnected);
  if (info.rampage) rampageStep(info.rampage);
  else if (!info.paused) {
    for (const m of minions) {
      if (m.gone || m.falling) continue;
      if (!m.job) pickJob(m);
      if (m.path.length) {
        // walk towards the next point of the route
        const next = m.path[0];
        const dx = next.x - m.x;
        const dy = next.y - m.y;
        const dist = Math.hypot(dx, dy);
        const step = WALK_SPEED * (m.carrying ? 0.6 : 1) * dt * (reduceMotion() ? 3 : 1);
        if (dist <= step) {
          m.x = next.x;
          m.y = next.y;
          m.path.shift();
        } else {
          m.x += (dx / dist) * step;
          m.y += (dy / dist) * step;
        }
        m.el.classList.toggle('walking', true);
        draw(m);
        if (!m.path.length && m.job && !m.arrived) startJob(m, now);
        if (!m.path.length && m.carrying) endJob(m); // reached the edge with the disk
      } else {
        m.el.classList.toggle('walking', false);
        if (m.job === 'chewer' && Math.random() < dt) bite(m);
        if (m.job && now > m.jobEnds) endJob(m);
      }
    }
  }
  requestAnimationFrame(frame);
}
