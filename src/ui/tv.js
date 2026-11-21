// ui/tv.js
// 2000s TV interference (AGENTIC.md section 4b): when a cheat lands or the rules
// change, the BACKGROUND (the wall behind the windows) fizzes like an old TV losing
// its signal: static snow, a rolling dark bar, horizontal-hold jitter, red/cyan
// fringing, a channel-change zap, and green on-screen-display text (CH 03, NO SIGNAL...).
// It sits behind every window, so the board, marks, turn indicator and pop-ups are
// never covered. Calm stage: short and faint; Meltdown: long, strong, the works.
// Reduced motion or Calm mode: a single still frame of static at 15% plus the OSD.

const W = 160; // the snow is drawn small and scaled up with crisp pixels
const H = 90;
const OSD_TEXT = ['CH 03', 'NO SIGNAL', 'AV1', '▶ OTTO.TV', 'CH 13', 'VIDEO 2'];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let screen = null;  // wrapper (for the zap)
let canvas = null;
let ctx = null;
let bar = null;
let osd = null;
let playing = 0;    // id of the burst that is playing
let playSound = null;

export function initTv(soundFn) {
  playSound = soundFn;
  screen = document.createElement('div');
  screen.className = 'tv-layer';
  screen.setAttribute('aria-hidden', 'true');
  screen.innerHTML = '<canvas class="tv-snow"></canvas><div class="tv-bar"></div>';
  document.body.appendChild(screen);
  canvas = screen.querySelector('canvas');
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext('2d');
  bar = screen.querySelector('.tv-bar');
  osd = document.createElement('div');
  osd.className = 'tv-osd';
  osd.setAttribute('aria-hidden', 'true');
  document.body.appendChild(osd);
}

// One frame of snow. `shift` = horizontal-hold jitter: some row bands slide sideways.
function drawSnow(jitter) {
  const image = ctx.createImageData(W, H);
  const data = image.data;
  for (let y = 0; y < H; y++) {
    const dark = jitter && Math.random() < 0.06 ? 0.4 : 1; // an occasional dim line
    for (let x = 0; x < W; x++) {
      const v = Math.floor((40 + Math.random() * 170) * dark); // never pure white
      const i = (y * W + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v + 10;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  if (jitter) {
    for (let n = 0; n < 3; n++) {
      const y = Math.floor(Math.random() * H);
      const h = 2 + Math.floor(Math.random() * 6);
      const dx = Math.floor((Math.random() - 0.5) * 24);
      ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
    }
  }
}

// How strong the interference is: by Otto's stage (0-3), a bit more for rule changes.
function settings(stage, kind) {
  const s = Math.max(0, Math.min(3, stage)) / 3;
  const extra = kind === 'rule' ? 1 : 0;
  return {
    ms: 600 + 600 * s + 150 * extra,               // 0.6 s .. 1.2 s
    opacity: Math.min(0.5, 0.25 + 0.2 * s + 0.04 * extra), // 25% .. 45%
    osd: stage >= 2 || (stage >= 1 && kind === 'rule'),
    rollingBar: stage >= 3 || (stage >= 2 && kind === 'rule'),
    zap: stage >= 3,
    fringe: stage >= 1,
  };
}

function showOsd(ms) {
  osd.textContent = OSD_TEXT[Math.floor(Math.random() * OSD_TEXT.length)];
  osd.classList.add('on');
  setTimeout(() => osd.classList.remove('on'), ms);
}

// kind: 'cheat' | 'rule'. stage: Otto's stage (0-3). still: Calm mode.
export function tvInterference(kind, stage, still = false) {
  if (!canvas) return;
  const id = ++playing;
  // Reduced motion / Calm: one still frame at 15% + OSD for 0.8 s.
  if (still || reduceMotion()) {
    drawSnow(false);
    screen.className = 'tv-layer on still';
    screen.style.setProperty('--tv-opacity', '0.15');
    showOsd(800);
    setTimeout(() => {
      if (playing === id) screen.className = 'tv-layer';
    }, 800);
    return;
  }
  const set = settings(stage, kind);
  screen.style.setProperty('--tv-opacity', set.opacity);
  screen.style.setProperty('--tv-ms', `${set.ms}ms`);
  screen.className = `tv-layer on ${set.fringe ? 'fringe' : ''} ${set.rollingBar ? 'rolling' : ''} ${set.zap ? 'zap' : ''}`;
  if (set.osd) showOsd(set.ms + 300);
  playSound?.(set.ms, 0.012 + 0.01 * (stage / 3));
  const started = performance.now();
  let last = 0;
  function frame(now) {
    if (playing !== id) return;
    if (now - last > 50) {
      // ~20 frames a second, like a cheap tuner
      drawSnow(true);
      last = now;
    }
    if (now - started < set.ms) requestAnimationFrame(frame);
    else screen.className = 'tv-layer';
  }
  requestAnimationFrame(frame);
}
