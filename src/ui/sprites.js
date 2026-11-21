// ui/sprites.js
// All the game's pixel art, drawn in code.
//
// A sprite is an array of strings, one character per pixel ('.' = transparent):
//     ['.ll.',
//      'llll']
// Each letter is a colour from PALETTE. `outlined()` then adds the two rules every
// sprite follows:
//   1. a 1-pixel dark outline (#140A2E) all the way round
//   2. one darker shade on the bottom and right edges of each colour
// `sprite()` turns the grid into an SVG made of <rect>s with crisp (unblurred)
// edges. CSS scales it up by whole numbers only (×2, ×3, ×4...).

export const PALETTE = {
  k: '#140A2E', // outline
  i: '#2B1B5A', // deep indigo
  u: '#6B5BA8', // purple wall
  U: '#4A3D80', //   shade
  n: '#1B2A6B', // navy
  N: '#101A45', //   shade
  s: '#0E1A2B', // CRT screen
  g: '#C9F6A7', // phosphor text
  m: '#C8C2E8', // monitor plastic
  M: '#8E86C4', //   shade
  p: '#FF4F9A', // neon pink (Otto)
  P: '#C42A74', //   shade
  l: '#9BE564', // lime (player)
  L: '#5FAE3C', //   shade
  y: '#FFE45C', // sunny yellow
  Y: '#D9B92E', //   shade
  c: '#5CD6FF', // sky cyan
  C: '#2E9CC4', //   shade
  w: '#F4EBD0', // cream
  W: '#CFC3A0', //   shade
  o: '#FF9F43', // orange (irritated)
  O: '#C7701F', //   shade
  r: '#FF3B4E', // red (furious)
  R: '#B81E33', //   shade
  v: '#B86BFF', // violet (unhinged)
  V: '#7A3BC4', //   shade
  e: '#9A95B5', // grey-blue (defeated / crashed)
  E: '#6E698C', //   shade
  h: '#FFFFFF', // white highlight
};

// Which colours get a darker shade on their bottom/right edge.
const SHADE_OF = { u: 'U', n: 'N', m: 'M', p: 'P', l: 'L', y: 'Y', c: 'C', w: 'W', o: 'O', r: 'R', v: 'V', e: 'E' };

// Add the outline and the bottom/right shade (the sprite grows by 1px on each side).
export function outlined(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map((row) => row.length));
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : rows[y][x] || '.');
  const out = [];
  for (let y = -1; y <= h; y++) {
    let line = '';
    for (let x = -1; x <= w; x++) {
      const ch = at(x, y);
      if (ch !== '.') {
        const edge = at(x + 1, y) === '.' || at(x, y + 1) === '.';
        line += edge && SHADE_OF[ch] ? SHADE_OF[ch] : ch;
      } else {
        let touches = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) !== '.') touches = true;
        line += touches ? 'k' : '.';
      }
    }
    out.push(line);
  }
  return out;
}

// Turn a grid into an SVG. Runs of the same colour become one <rect> (fewer elements).
// The size comes from CSS: width = pixels × var(--px) (a whole number).
export function sprite(rows, className = '', colours = PALETTE) {
  const h = rows.length;
  const w = Math.max(...rows.map((row) => row.length));
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || !colours[ch]) {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === ch) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${colours[ch]}"/>`;
      x += run;
    }
  });
  return `<svg class="px ${className}" viewBox="0 0 ${w} ${h}" style="--w:${w};--h:${h}"
    shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`;
}

// --- Tiny drawing helpers (used to build some of the bigger sprites) --------------------
function blank(w, h) {
  return Array.from({ length: h }, () => Array(w).fill('.'));
}
function plot(grid, x, y, ch) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) grid[y][x] = ch;
}
function rect(grid, x, y, w, h, ch) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) plot(grid, xx, yy, ch);
}
function stamp(grid, x, y, rows) {
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => ch !== '.' && plot(grid, x + dx, y + dy, ch)));
}
const toRows = (grid) => grid.map((row) => row.join(''));

// A 3x5 pixel font for a few characters.
const GLYPHS = {
  '>': ['g..', '.g.', '..g', '.g.', 'g..'],
  ':': ['...', '.g.', '...', '.g.', '...'],
  ')': ['g..', '.g.', '.g.', '.g.', 'g..'],
  '(': ['..g', '.g.', '.g.', '.g.', '..g'],
  '<': ['..g', '.g.', 'g..', '.g.', '..g'],
  '?': ['ggg', '..g', '.gg', '...', '.g.'],
  '!': ['.g.', '.g.', '.g.', '...', '.g.'],
  '#': ['g.g', 'ggg', 'g.g', 'ggg', 'g.g'],
  '@': ['ggg', 'g.g', 'g.g', 'g..', 'ggg'],
  3: ['ggg', '..g', '.gg', '..g', 'ggg'],
  4: ['g.g', 'g.g', 'ggg', '..g', '..g'],
  5: ['ggg', 'g..', 'ggg', '..g', 'ggg'],
};
// Write text in the pixel font, scaled `size` times, in colour `ch`.
function text(grid, x, y, str, ch = 'g', size = 1) {
  [...str].forEach((letter, n) => {
    GLYPHS[letter].forEach((row, dy) =>
      [...row].forEach((dot, dx) => {
        if (dot !== '.') rect(grid, x + (n * 4 + dx) * size, y + dy * size, size, size, ch);
      })
    );
  });
}

// --- Marks ------------------------------------------------------------------------------
export const X_SPRITE = outlined([
  'll..........ll',
  'lll........lll',
  '.lll......lll.',
  '..lll....lll..',
  '...lll..lll...',
  '....llllll....',
  '.....llll.....',
  '.....llll.....',
  '....llllll....',
  '...lll..lll...',
  '..lll....lll..',
  '.lll......lll.',
  'lll........lll',
  'll..........ll',
]);

export const O_SPRITE = outlined([
  '....pppppp....',
  '..pppppppppp..',
  '.pppp....pppp.',
  '.ppp......ppp.',
  'ppp........ppp',
  'ppp........ppp',
  'ppp........ppp',
  'ppp........ppp',
  'ppp........ppp',
  'ppp........ppp',
  '.ppp......ppp.',
  '.pppp....pppp.',
  '..pppppppppp..',
  '....pppppp....',
]);

// Minion: a tiny original round robot with an antenna (Otto's little helper).
export const MINION_SPRITE = outlined([
  '......pp......',
  '......kk......',
  '....yyyyyy....',
  '..yyyyyyyyyy..',
  '.yyyyyyyyyyyy.',
  '.yysssssssssy.',
  'yyysgssssgssyy',
  'yyysgssssgssyy',
  'yyyssggggsssyy',
  '.yysssssssssy.',
  '.yyyyyyyyyyyy.',
  '..yyyyyyyyyy..',
  '....yyyyyy....',
]);

// --- Otto: a little CRT monitor with an antenna ---------------------------------------
// The casing (32 wide) and, separately, the face shown on its 20x13 screen.
export const OTTO_SCREEN = { x: 6, y: 10, w: 20, h: 13 }; // where the face goes (in pixels, after the outline)

export const OTTO_CASING = (() => {
  const g = blank(30, 30);
  rect(g, 14, 0, 2, 2, 'p');        // antenna ball
  rect(g, 14, 2, 2, 4, 'k');        // antenna
  rect(g, 0, 6, 30, 18, 'm');       // casing
  rect(g, 4, 8, 22, 15, 'k');       // screen bezel
  rect(g, 5, 9, 20, 13, 's');       // screen
  rect(g, 24, 23, 2, 1, 'l');       // power light
  rect(g, 10, 24, 10, 3, 'm');      // neck
  rect(g, 6, 27, 18, 3, 'm');       // base
  return outlined(toRows(g));
})();

function face(draw) {
  const g = blank(OTTO_SCREEN.w, OTTO_SCREEN.h);
  draw(g);
  return toRows(g);
}

export const OTTO_FACES = {
  smug: face((g) => {
    rect(g, 3, 4, 4, 1, 'g'); rect(g, 3, 5, 2, 1, 'g');      // half-closed eyes
    rect(g, 13, 4, 4, 1, 'g'); rect(g, 13, 5, 2, 1, 'g');
    rect(g, 5, 9, 9, 1, 'g'); rect(g, 14, 8, 2, 1, 'g');     // smirk
  }),
  bored: face((g) => {
    rect(g, 3, 5, 4, 1, 'g'); rect(g, 13, 5, 4, 1, 'g');     // flat eyes
    rect(g, 6, 9, 8, 1, 'g');                                 // flat mouth
    rect(g, 17, 1, 2, 1, 'g'); rect(g, 18, 2, 1, 1, 'g'); rect(g, 17, 3, 2, 1, 'g'); // z
  }),
  scheming: face((g) => text(g, 4, 4, '>:)', 'g')),
  furious: face((g) => {
    rect(g, 3, 2, 2, 1, 'r'); rect(g, 5, 3, 2, 1, 'r');      // angry brows
    rect(g, 15, 2, 2, 1, 'r'); rect(g, 13, 3, 2, 1, 'r');
    rect(g, 4, 5, 3, 2, 'r'); rect(g, 13, 5, 3, 2, 'r');     // eyes
    for (let x = 4; x < 16; x += 2) { plot(g, x, 9, 'r'); plot(g, x + 1, 10, 'r'); } // zig-zag
  }),
  // Thinking: two frames, eyes looking left then right.
  thinkLeft: face((g) => {
    rect(g, 3, 4, 2, 2, 'g'); rect(g, 12, 4, 2, 2, 'g');
    rect(g, 7, 9, 5, 1, 'g');
  }),
  thinkRight: face((g) => {
    rect(g, 6, 4, 2, 2, 'g'); rect(g, 15, 4, 2, 2, 'g');
    rect(g, 8, 9, 5, 1, 'g');
  }),
  happy: face((g) => {
    rect(g, 4, 3, 2, 1, 'g'); plot(g, 3, 4, 'g'); plot(g, 6, 4, 'g');      // ^ eyes
    rect(g, 14, 3, 2, 1, 'g'); plot(g, 13, 4, 'g'); plot(g, 16, 4, 'g');
    plot(g, 5, 8, 'g'); rect(g, 6, 9, 8, 1, 'g'); plot(g, 14, 8, 'g');     // smile
    rect(g, 7, 10, 6, 1, 'g');
  }),
  irritated: face((g) => {
    rect(g, 3, 3, 4, 1, 'y'); rect(g, 13, 3, 4, 1, 'y');                   // flat brows
    rect(g, 4, 5, 2, 1, 'y'); rect(g, 14, 5, 2, 1, 'y');                   // narrowed eyes
    rect(g, 5, 9, 10, 2, 'y');                                              // gritted teeth
    for (const x of [7, 9, 11, 13]) { plot(g, x, 9, 's'); plot(g, x, 10, 's'); }
    plot(g, 17, 1, 'y'); plot(g, 18, 2, 'y');                               // vein tick
  }),
  unhinged: face((g) => {
    rect(g, 2, 2, 6, 1, 'v'); rect(g, 2, 7, 6, 1, 'v');                    // one big ringed eye
    rect(g, 2, 2, 1, 6, 'v'); rect(g, 7, 2, 1, 6, 'v'); rect(g, 4, 4, 2, 2, 'h');
    rect(g, 13, 4, 2, 2, 'v');                                              // one tiny pupil
    rect(g, 3, 9, 6, 1, 'p'); rect(g, 9, 10, 7, 1, 'p'); rect(g, 5, 11, 5, 1, 'c'); // glitched grin
  }),
  glitching: face((g) => {
    text(g, 3, 4, '#@!', 'p');
    rect(g, 0, 1, 7, 1, 'c'); rect(g, 12, 11, 8, 1, 'c');                  // tear lines
  }),
  defeated: face((g) => {
    plot(g, 3, 4, 'c'); rect(g, 4, 5, 3, 1, 'c');                          // droopy eyes
    plot(g, 16, 4, 'c'); rect(g, 13, 5, 3, 1, 'c');
    rect(g, 6, 9, 8, 1, 'c'); plot(g, 5, 10, 'c'); plot(g, 14, 10, 'c');   // frown
    rect(g, 4, 7, 1, 2, 'h');                                               // tear
  }),
  victorious: face((g) => {
    text(g, 2, 2, '>', 'y'); text(g, 14, 2, '<', 'y');                     // > < squint
    rect(g, 4, 8, 12, 1, 'y'); rect(g, 5, 9, 10, 2, 'y'); rect(g, 6, 11, 8, 1, 'y'); // big grin
    rect(g, 6, 9, 8, 1, 'p');                                               // tongue
  }),
  // Meltdown: a blue crash screen with a sad face.
  crash: face((g) => {
    rect(g, 0, 0, 20, 13, 'n');
    text(g, 4, 4, ':(', 'w', 1);
    rect(g, 3, 11, 14, 1, 'w');
  }),
};

// Otto's casing colours for each mood. OTTO_CASING uses m/M for the body and p/P
// for the antenna ball, so passing one of these to sprite() recolours it:
//   sprite(OTTO_CASING, 'otto-casing', { ...PALETTE, ...OTTO_COLOURS[mood] })
export const OTTO_COLOURS = {
  calm:      { m: '#C8C2E8', M: '#8E86C4', p: '#FF4F9A', P: '#C42A74' }, // lavender, pink ball
  happy:     { m: '#C8C2E8', M: '#8E86C4', p: '#9BE564', P: '#5FAE3C' }, // lavender, lime ball
  thinking:  { m: '#C8C2E8', M: '#8E86C4', p: '#5CD6FF', P: '#2E9CC4' }, // lavender, cyan ball
  irritated: { m: '#FF9F43', M: '#C7701F', p: '#FF9F43', P: '#C7701F' }, // orange
  furious:   { m: '#FF3B4E', M: '#B81E33', p: '#FF3B4E', P: '#B81E33' }, // red
  unhinged:  { m: '#B86BFF', M: '#7A3BC4', p: '#FF4F9A', P: '#C42A74' }, // violet
  glitching: { m: '#B86BFF', M: '#7A3BC4', p: '#FFE45C', P: '#D9B92E' }, // violet, yellow ball
  defeated:  { m: '#9A95B5', M: '#6E698C', p: '#5CD6FF', P: '#2E9CC4' }, // grey-blue
  crashed:   { m: '#9A95B5', M: '#6E698C', p: '#9A95B5', P: '#6E698C' }, // grey
  victorious:{ m: '#FFE45C', M: '#D9B92E', p: '#FF4F9A', P: '#C42A74' }, // gold
};

// --- Small extras around Otto (outside the casing) ----------------------------------------
export const OTTO_EXTRAS = {
  question: outlined(['yyy', '..y', '.yy', '...', '.y.']),               // thinking
  sweat: outlined(['..c..', '.ccc.', 'ccccc', 'ccccc', '.ccc.']),        // irritated
  steam: outlined(['.ww..', 'wwww.', '.wwww', '..ww.']),                 // furious
  spark: ['.y.', 'yoy', '.y.'],                                          // unhinged / glitching
  sparkle: ['..y..', '..y..', 'yyyyy', '..y..', '..y..'],                // victorious (+)
  crack: ['h...', '.h..', '.hh.', '...h', '..h.', '..h.', '.h..'],       // a crack on the screen glass
};

// --- Floppy disks (the power-ups) -------------------------------------------------------
// `c` is replaced by the disk's colour; the cream label gets the name in HTML on top.
const FLOPPY = [
  'cchhhhhhhhcc..',
  'cchhhhkkhhccc.',
  'cchhhhkkhhcccc',
  'cchhhhhhhhcccc',
  'cccccccccccccc',
  'ccwwwwwwwwwwcc',
  'ccwwwwwwwwwwcc',
  'ccwwwwwwwwwwcc',
  'ccwwwwwwwwwwcc',
  'ccwwwwwwwwwwcc',
  'ccwwwwwwwwwwcc',
  'cccccccccccccc',
];
export const FLOPPY_LABEL = { x: 3, y: 6, w: 10, h: 6 }; // label area (in pixels, after outline)

export function floppy(colour) {
  return outlined(FLOPPY.map((row) => row.replaceAll('c', colour).replaceAll('h', 'm')));
}

// --- Small UI sprites ---------------------------------------------------------------------
export const STAR_SPRITE = outlined([
  '....y....',
  '....y....',
  '...yyy...',
  'yyyyyyyyy',
  '.yyyyyyy.',
  '..yyyyy..',
  '..yy.yy..',
  '.yy...yy.',
]);

export const SPEAKER_ON = outlined([
  '....c.......',
  '...cc...c...',
  'cccccc...c..',
  'cccccc.c.c..',
  'cccccc.c.c..',
  'cccccc...c..',
  '...cc...c...',
  '....c.......',
]);

export const SPEAKER_OFF = outlined([
  '....c.......',
  '...cc.......',
  'cccccc.p...p',
  'cccccc..p.p.',
  'cccccc...p..',
  'cccccc..p.p.',
  '...cc..p...p',
  '....c.......',
]);

export const HOURGLASS = outlined([
  'wwwwwww',
  '.wyyyw.',
  '..wyw..',
  '...w...',
  '..w.w..',
  '.wyyyw.',
  'wwwwwww',
]);

// --- Rule icons (16x16 with the outline) --------------------------------------------------
function icon(draw) {
  const g = blank(14, 14);
  draw(g);
  return outlined(toRows(g));
}
// Draw a thick diagonal from (x0,y0) going (dx,dy) for n steps.
function diagonal(g, x0, y0, dx, dy, n, ch, thick = 2) {
  for (let k = 0; k < n; k++) rect(g, x0 + dx * k, y0 + dy * k, thick, thick, ch);
}
function digit(n) {
  return icon((g) => {
    const glyph = GLYPHS[n].map((row) => row.replaceAll('g', 'y'));
    // each font dot becomes a 3x2 block: a 9x10 digit in the middle of the icon
    glyph.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && rect(g, 2 + x * 3, 2 + y * 2, 3, 2, ch)));
  });
}

export const RULE_ICONS = {
  four: digit(4),
  five: digit(5),
  noDiagonals: icon((g) => {
    diagonal(g, 1, 11, 1, -1, 11, 'c');
    for (let a = 0; a < 360; a += 6) {
      plot(g, Math.round(6.5 + 6 * Math.cos((a * Math.PI) / 180)), Math.round(6.5 + 6 * Math.sin((a * Math.PI) / 180)), 'p');
    }
    diagonal(g, 2, 2, 1, 1, 9, 'p', 2);
  }),
  onlyDiagonals: icon((g) => {
    diagonal(g, 0, 12, 1, -1, 11, 'l');
    rect(g, 7, 0, 7, 2, 'l');
    rect(g, 12, 0, 2, 7, 'l');
  }),
  anywhere: icon((g) => {
    rect(g, 4, 0, 2, 14, 'w'); rect(g, 9, 0, 2, 14, 'w');
    rect(g, 0, 4, 14, 2, 'w'); rect(g, 0, 9, 14, 2, 'w');
  }),
  gravity: icon((g) => {
    rect(g, 5, 0, 4, 6, 'c');
    for (let k = 0; k < 4; k++) rect(g, 1 + k, 6 + k, 12 - 2 * k, 1, 'c');
    rect(g, 0, 12, 14, 2, 'l');
  }),
  lava: icon((g) => {
    rect(g, 0, 0, 14, 14, 'u');
    for (let k = 0; k < 5; k++) {
      rect(g, 0, k, 5 - k, 1, 'p'); rect(g, 9 + k, k, 5 - k, 1, 'p');
      rect(g, 0, 13 - k, 5 - k, 1, 'p'); rect(g, 9 + k, 13 - k, 5 - k, 1, 'p');
    }
    rect(g, 6, 5, 2, 4, 'y'); rect(g, 5, 7, 4, 2, 'y');
  }),
  touch: icon((g) => {
    stamp(g, 0, 3, ['.ll.', 'llll', 'llll', 'llll', 'llll', '.ll.']);
    rect(g, 1, 3, 5, 8, 'l'); rect(g, 0, 4, 7, 6, 'l');
    rect(g, 8, 3, 5, 8, 'p'); rect(g, 7, 4, 7, 6, 'p');
  }),
  noTwist: icon((g) => {
    for (let k = 0; k < 14; k += 3) {
      rect(g, k, 0, 2, 1, 'w'); rect(g, k, 13, 2, 1, 'w');
      rect(g, 0, k, 1, 2, 'w'); rect(g, 13, k, 1, 2, 'w');
    }
  }),
  fade: icon((g) => {
    diagonal(g, 0, 0, 1, 1, 13, 'l');
    diagonal(g, 0, 12, 1, -1, 13, 'l');
    for (let y = 0; y < 14; y++) for (let x = (y % 2); x < 14; x += 2) plot(g, x, y, '.'); // dithered = fading
  }),
  mirror: icon((g) => {
    for (let y = 0; y < 14; y += 3) rect(g, 6, y, 2, 2, 'c');
    for (let k = 0; k < 5; k++) { rect(g, 4 - k, 2 + k, k + 1, 1, 'l'); rect(g, 4 - k, 11 - k, k + 1, 1, 'l'); }
    rect(g, 0, 6, 5, 2, 'l');
    for (let k = 0; k < 5; k++) { rect(g, 9, 2 + k, k + 1, 1, 'l'); rect(g, 9, 11 - k, k + 1, 1, 'l'); }
    rect(g, 9, 6, 5, 2, 'l');
  }),
  timer: icon((g) => stamp(g, 3, 3, ['yyyyyyy', '.y...y.', '..yyy..', '...y...', '..y.y..', '.ypppy.', 'yyyyyyy'].map((r) => r))),
  reverse: icon((g) => {
    rect(g, 3, 2, 11, 2, 'p'); stamp(g, 0, 0, ['...p', '..pp', '.ppp', 'pppp', '.ppp', '..pp', '...p'].map((r) => r.slice(0, 4)));
    rect(g, 0, 10, 11, 2, 'l'); stamp(g, 10, 7, ['l...', 'll..', 'lll.', 'llll', 'lll.', 'll..', 'l...']);
  }),
};

// --- The turn timer: a ring of pixel segments that empties second by second --------------
export function timerRing(fractionLeft, segments = 10) {
  const g = blank(16, 16);
  const filled = Math.ceil(fractionLeft * segments);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const r = Math.hypot(dx, dy);
      if (r < 5 || r > 7.6) continue;
      // Which segment is this pixel in? (clockwise from 12 o'clock)
      const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
      const segment = Math.floor((angle / (2 * Math.PI)) * segments);
      g[y][x] = segment < filled ? 'y' : 'u';
    }
  }
  return toRows(g);
}

// --- Retro UI kit helpers -------------------------------------------------------------------

// A "stepped corner" window frame for CSS border-image: a 9x9 pixel tile with a
// 1-pixel outline, stepped corners, and (if given) a darker shade along the bottom
// and right edges. CSS slices it into 9 pieces and stretches the middle (3x scale).
export function frameImage(fill, shade = fill) {
  const rows = [
    '..kkkkk..',
    '.kfffffk.',
    'kffffffSk',
    'kffffffSk',
    'kffffffSk',
    'kffffffSk',
    'kffffffSk',
    '.kSSSSSk.',
    '..kkkkk..',
  ];
  return svgDataUri(rows, { ...PALETTE, f: fill, S: shade });
}

// A whole sprite as a data: URI (for CSS backgrounds and cursors).
export function svgDataUri(rows, colours = PALETTE, scale = 1) {
  const svg = sprite(rows, '', colours)
    .replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${rows[0].length * scale}" height="${rows.length * scale}" `)
    .replace(/class="[^"]*"|style="[^"]*"|aria-hidden="true"|focusable="false"/g, '');
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Pixel mouse pointers: an arrow, and a pointing hand for clickable things.
export const CURSOR_ARROW = [
  'k..........',
  'kk.........',
  'kwk........',
  'kwwk.......',
  'kwwwk......',
  'kwwwwk.....',
  'kwwwwwk....',
  'kwwwwwwk...',
  'kwwwwwwwk..',
  'kwwwwwwwwk.',
  'kwwwwwkkkkk',
  'kwwkwwk....',
  'kwk.kwwk...',
  'kk..kwwk...',
  'k....kwwk..',
  '.....kwwk..',
  '......kk...',
];
export const CURSOR_HAND = [
  '....kk.......',
  '...kwwk......',
  '...kwwk......',
  '...kwwk......',
  '...kwwkkk....',
  '...kwwkwwkk..',
  'kk.kwwkwwkwkk',
  'kwkkwwwwwwkwk',
  'kwwkwwwwwwwwk',
  '.kwwwwwwwwwwk',
  '..kwwwwwwwwwk',
  '..kwwwwwwwwk.',
  '...kwwwwwwwk.',
  '...kwwwwwwk..',
  '....kwwwwwk..',
  '....kkkkkkk..',
];

// --- Cracks in the CRT glass (Otto's Unhinged and Meltdown stages) -----------------------------
// A jagged crack made of 1-pixel white lines that branch out from a point.
// `seed` makes each crack different but the same every time it's drawn.
export function crackSprite(seed, size = 40) {
  let s = seed * 7919 + 13;
  const random = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const g = blank(size, size);
  const branch = (x, y, angle, length) => {
    for (let n = 0; n < length; n++) {
      angle += (random() - 0.5) * 0.9;           // jagged: the direction keeps changing
      x += Math.cos(angle);
      y += Math.sin(angle);
      plot(g, Math.round(x), Math.round(y), 'h');
      if (random() < 0.08 && length > 6) branch(x, y, angle + (random() < 0.5 ? 1 : -1), length / 2);
    }
  };
  const centre = size / 2;
  for (let k = 0; k < 5; k++) branch(centre, centre, (k / 5) * Math.PI * 2 + random(), size * 0.45);
  return toRows(g);
}

// Calm mode toggle: a little moon.
export const MOON_SPRITE = outlined([
  '..yyyy..',
  '.yyy....',
  'yyy.....',
  'yyy.....',
  'yyy.....',
  'yyy.....',
  '.yyy....',
  '..yyyy..',
]);

// A scribbly line from (x1,y1) to (x2,y2) as an SVG path "d" (for scribbles over the
// Rule Book). `seed` keeps it the same on every redraw.
export function wobblyLine(x1, y1, x2, y2, seed, wobble = 3, segments = 5) {
  let s = seed * 7919 + 7;
  const random = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  let d = `M${x1},${y1}`;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const x = x1 + (x2 - x1) * t + (random() * 2 - 1) * wobble;
    const y = y1 + (y2 - y1) * t + (random() * 2 - 1) * wobble;
    d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

// Music toggle: a pixel music note (crossed out when the music is off).
export const NOTE_ON = outlined([
  '...llll',
  '...l..l',
  '...l..l',
  '...l..l',
  '.lll.ll',
  'llll.ll',
  '.ll....',
]);
export const NOTE_OFF = outlined([
  'p..llll',
  '.p.l..l',
  '..pl..l',
  '...p..l',
  '.lllpll',
  'llll.pl',
  '.ll...p',
]);
