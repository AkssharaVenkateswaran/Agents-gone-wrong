// ui/stickers.js
// Every picture in the game is an inline SVG "sticker" drawn here in code.
//
// The sticker look, piece by piece:
//   - chunky shapes in a slight 2.5D view: each shape is drawn twice — a darker
//     "side" copy nudged down/right, then the flat-coloured "top" on top of it
//   - a thick near-black ink outline (stroke) on every shape
//   - a white die-cut border around the whole sticker: the SVG filter
//     #die-cut (see installStickerDefs) grows the sticker's outline and fills it white
//   - a soft drop shadow, added in CSS (.sticker { filter: drop-shadow(...) })

const INK = '#1F1D2B';
const C = {
  coral: '#FF7A6B', coralShade: '#E25D4F',
  yellow: '#FFD25A', yellowShade: '#E8B63A',
  teal: '#2EC4B6', tealShade: '#1F9C90',
  sky: '#6EC1F0', skyShade: '#4AA3D6',
  green: '#7BC96F', greenShade: '#5CAA51',
  paper: '#FBF6EA', grey: '#D9D4C7', greyShade: '#B9B3A4', white: '#FFFFFF',
};

// Shared outline settings for every shape.
const OUTLINE = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;

// Wrap shapes into a finished sticker <svg>.
function sticker(className, viewBox, shapes) {
  return `<svg class="sticker ${className}" viewBox="${viewBox}" aria-hidden="true" focusable="false">
    <g filter="url(#die-cut)">${shapes}</g>
  </svg>`;
}

// Draw a shape in 2.5D: a shaded copy offset by (dx, dy), then the top face.
function chunky(shape, fill, shade, dx = 2, dy = 5) {
  return `
    <g transform="translate(${dx} ${dy})">${shape(`fill="${shade}" ${OUTLINE}`)}</g>
    ${shape(`fill="${fill}" ${OUTLINE}`)}`;
}

// Put this once on the page: the SVG filter that makes the white die-cut border.
// (Filters defined in one inline SVG can be used by every other SVG on the page.)
export function installStickerDefs() {
  if (document.getElementById('sticker-defs')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `
    <svg id="sticker-defs" width="0" height="0" style="position:absolute" aria-hidden="true">
      <defs>
        <filter id="die-cut" x="-25%" y="-25%" width="150%" height="150%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="5" result="grown" />
          <feFlood flood-color="#FFFFFF" />
          <feComposite in2="grown" operator="in" result="border" />
          <feMerge><feMergeNode in="border" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
    </svg>`;
  document.body.appendChild(holder.firstElementChild);
}

// --- X and O --------------------------------------------------------------------

// The X is one chunky "plus" shape turned 45°. We work out its 12 corners once.
const X_POINTS = (() => {
  const arm = 10;  // half the thickness of each arm
  const len = 31;  // how far each arm reaches from the centre
  const plus = [
    [-arm, -len], [arm, -len], [arm, -arm], [len, -arm], [len, arm], [arm, arm],
    [arm, len], [-arm, len], [-arm, arm], [-len, arm], [-len, -arm], [-arm, -arm],
  ];
  const turn = Math.PI / 4;
  return plus
    .map(([x, y]) => {
      const rx = x * Math.cos(turn) - y * Math.sin(turn) + 50;
      const ry = x * Math.sin(turn) + y * Math.cos(turn) + 46;
      return `${rx.toFixed(1)},${ry.toFixed(1)}`;
    })
    .join(' ');
})();

export function stickerX() {
  return sticker('sticker-x', '0 0 100 100',
    chunky((attrs) => `<polygon points="${X_POINTS}" ${attrs} />`, C.teal, C.tealShade));
}

// The O is a thick ring (a big circle with a smaller hole cut out).
const O_PATH = 'M50,16 a30,30 0 1,0 0.01,0 Z M50,32 a14,14 0 1,1 -0.01,0 Z';

export function stickerO() {
  return sticker('sticker-o', '0 0 100 100',
    chunky((attrs) => `<path d="${O_PATH}" fill-rule="evenodd" ${attrs} />`, C.coral, C.coralShade));
}

// --- Otto ------------------------------------------------------------------------
// A chunky rounded robot. The face on its screen changes with its mood.

const OTTO_FACES = {
  // Smug: one eyebrow up, half-closed eyes, lopsided smirk.
  smug: `
    <path d="M38 50 q6 -5 12 -2" />
    <path d="M62 46 q6 -3 12 1" />
    <path d="M39 58 q5 -4 10 0" /><path d="M63 58 q5 -4 10 0" />
    <path d="M46 70 q12 6 22 -4" />`,
  // Bored: flat eyes, flat mouth, a little "z".
  bored: `
    <path d="M39 57 h11" /><path d="M63 57 h11" />
    <path d="M48 71 h17" />
    <path d="M80 36 h6 l-6 7 h6" stroke-width="2.5" />`,
  // Scheming: slanted brows, narrowed eyes, big toothy grin.
  scheming: `
    <path d="M37 47 l13 5" /><path d="M76 47 l-13 5" />
    <path d="M40 58 q5 3 10 0" /><path d="M63 58 q5 3 10 0" />
    <path d="M43 66 q14 12 28 0 z" fill="${C.paper}" />
    <path d="M50 67 v4 M57 68 v5 M64 67 v4" stroke-width="2" />`,
  // Furious: angry V brows, small hard eyes, zig-zag mouth.
  furious: `
    <path d="M37 44 l14 8" /><path d="M76 44 l-14 8" />
    <circle cx="45" cy="58" r="2.5" fill="${C.paper}" /><circle cx="68" cy="58" r="2.5" fill="${C.paper}" />
    <path d="M44 72 l5 -4 l5 4 l5 -4 l5 4 l5 -4" />`,
};

export function stickerOtto(mood = 'smug') {
  const face = OTTO_FACES[mood] || OTTO_FACES.smug;
  const furious = mood === 'furious';
  return sticker(`sticker-otto mood-${mood}`, '0 0 120 132', `
    <!-- antenna -->
    <path d="M58 26 V12" ${OUTLINE} fill="none" />
    <circle cx="58" cy="10" r="6" fill="${furious ? C.coral : C.yellow}" ${OUTLINE} />
    <!-- ears -->
    ${chunky((a) => `<rect x="8" y="46" width="12" height="24" rx="5" ${a} />`, C.grey, C.greyShade)}
    ${chunky((a) => `<rect x="96" y="46" width="12" height="24" rx="5" ${a} />`, C.grey, C.greyShade)}
    <!-- body -->
    ${chunky((a) => `<rect x="34" y="94" width="48" height="28" rx="11" ${a} />`, C.coral, C.coralShade)}
    <circle cx="58" cy="108" r="4" fill="${C.yellow}" ${OUTLINE} />
    <!-- head -->
    ${chunky((a) => `<rect x="16" y="26" width="84" height="66" rx="20" ${a} />`, C.coral, C.coralShade, 3, 6)}
    <!-- face screen -->
    <rect x="27" y="36" width="60" height="46" rx="12" fill="${INK}" ${OUTLINE} />
    <g fill="none" stroke="${C.paper}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
      ${face}
    </g>
    ${furious ? `<path d="M100 22 q6 -6 2 -12 M108 30 q8 -4 6 -12" fill="none" ${OUTLINE} stroke-width="2.5" />` : ''}
  `);
}

// --- Minion: a small, round mini-Otto ----------------------------------------------
export function stickerMinion() {
  return sticker('sticker-minion', '0 0 100 100', `
    <path d="M50 24 V12" ${OUTLINE} fill="none" />
    <circle cx="50" cy="11" r="5" fill="${C.coral}" ${OUTLINE} />
    ${chunky((a) => `<circle cx="50" cy="56" r="31" ${a} />`, C.yellow, C.yellowShade)}
    <rect x="31" y="42" width="38" height="24" rx="10" fill="${INK}" ${OUTLINE} />
    <circle cx="42" cy="53" r="3" fill="${C.paper}" /><circle cx="58" cy="53" r="3" fill="${C.paper}" />
    <path d="M44 60 q6 4 12 0" fill="none" stroke="${C.paper}" stroke-width="2.5" stroke-linecap="round" />
  `);
}

// --- Power-up icons --------------------------------------------------------------
export const POWERUP_ICONS = {
  // A minion flying off with "whoosh" lines.
  flick: () => sticker('icon', '0 0 60 60', `
    <path d="M6 22 h12 M4 32 h14 M8 42 h10" ${OUTLINE} fill="none" stroke-width="3" />
    ${chunky((a) => `<circle cx="38" cy="30" r="15" ${a} />`, C.yellow, C.yellowShade, 1, 3)}
    <rect x="29" y="24" width="18" height="11" rx="5" fill="${INK}" />`),
  // A light bulb.
  lightSwitch: () => sticker('icon', '0 0 60 60', `
    ${chunky((a) => `<path d="M30 6 a17 17 0 0 1 10 31 v6 h-20 v-6 a17 17 0 0 1 10 -31 z" ${a} />`, C.yellow, C.yellowShade, 1, 3)}
    ${chunky((a) => `<rect x="21" y="44" width="18" height="10" rx="3" ${a} />`, C.grey, C.greyShade, 1, 2)}
    <path d="M25 27 q5 6 10 0" ${OUTLINE} fill="none" stroke-width="2.5" />`),
  // A chunky eraser block, half pink.
  eraser: () => sticker('icon', '0 0 60 60', `
    <g transform="rotate(-25 30 30)">
      ${chunky((a) => `<rect x="8" y="20" width="44" height="20" rx="5" ${a} />`, C.white, C.grey, 2, 4)}
      <path d="M30 20 h17 a5 5 0 0 1 5 5 v10 a5 5 0 0 1 -5 5 h-17 z" fill="${C.coral}" ${OUTLINE} />
    </g>`),
  // A glass-dome paperweight.
  paperweight: () => sticker('icon', '0 0 60 60', `
    ${chunky((a) => `<path d="M8 44 a22 22 0 0 1 44 0 z" ${a} />`, C.sky, C.skyShade, 1, 3)}
    ${chunky((a) => `<rect x="5" y="42" width="50" height="9" rx="4" ${a} />`, C.grey, C.greyShade, 1, 2)}
    <path d="M18 34 q2 -10 10 -13" ${OUTLINE} fill="none" stroke="${C.white}" stroke-width="3" />`),
  // A glue stick with a teal cap.
  glueStick: () => sticker('icon', '0 0 60 60', `
    <g transform="rotate(20 30 30)">
      ${chunky((a) => `<rect x="20" y="16" width="20" height="38" rx="5" ${a} />`, C.white, C.grey, 2, 3)}
      ${chunky((a) => `<rect x="18" y="6" width="24" height="14" rx="5" ${a} />`, C.teal, C.tealShade, 2, 3)}
      <path d="M24 34 h12" ${OUTLINE} fill="none" stroke-width="2.5" />
    </g>`),
  // An hourglass.
  timeOut: () => sticker('icon', '0 0 60 60', `
    ${chunky((a) => `<path d="M17 10 h26 q0 14 -11 20 q11 6 11 20 h-26 q0 -14 11 -20 q-11 -6 -11 -20 z" ${a} />`, C.white, C.grey, 1, 3)}
    <path d="M23 46 q7 -8 14 0 z M25 15 h10 q-1 6 -5 9 q-4 -3 -5 -9 z" fill="${C.yellow}" ${OUTLINE} stroke-width="2" />
    ${chunky((a) => `<rect x="13" y="5" width="34" height="7" rx="3" ${a} />`, C.green, C.greenShade, 1, 2)}
    ${chunky((a) => `<rect x="13" y="48" width="34" height="7" rx="3" ${a} />`, C.green, C.greenShade, 1, 2)}`),
  // A teal pencil drawing a line.
  myOwnLine: () => sticker('icon', '0 0 60 60', `
    <path d="M6 52 h22" ${OUTLINE} fill="none" stroke="${C.teal}" stroke-width="4" />
    <g transform="rotate(45 34 26)">
      ${chunky((a) => `<rect x="27" y="2" width="14" height="36" rx="3" ${a} />`, C.teal, C.tealShade, 2, 2)}
      <path d="M27 38 h14 l-7 12 z" fill="${C.paper}" ${OUTLINE} />
      <path d="M32 46 h4 l-2 4 z" fill="${INK}" />
    </g>`),
  // Two little X stickers.
  doubleMark: () => sticker('icon', '0 0 60 60', `
    <g transform="translate(-6 -4) scale(0.5)">${chunky((a) => `<polygon points="${X_POINTS}" ${a} />`, C.teal, C.tealShade)}</g>
    <g transform="translate(18 18) scale(0.5)">${chunky((a) => `<polygon points="${X_POINTS}" ${a} />`, C.teal, C.tealShade)}</g>`),
  // A rubber stamp saying NO.
  veto: () => sticker('icon', '0 0 60 60', `
    ${chunky((a) => `<rect x="20" y="4" width="20" height="20" rx="6" ${a} />`, C.coral, C.coralShade, 1, 3)}
    ${chunky((a) => `<rect x="8" y="26" width="44" height="14" rx="4" ${a} />`, C.coral, C.coralShade, 1, 3)}
    ${chunky((a) => `<rect x="6" y="42" width="48" height="12" rx="3" ${a} />`, C.white, C.grey, 1, 2)}
    <text x="30" y="52" text-anchor="middle" font-family="Permanent Marker, cursive" font-size="10" fill="${C.coral}">NO</text>`),
  // Three fanned-out rule cards.
  amendment: () => sticker('icon', '0 0 60 60', `
    <g transform="rotate(-18 30 46)">${chunky((a) => `<rect x="17" y="10" width="26" height="36" rx="4" ${a} />`, C.sky, C.skyShade, 1, 2)}</g>
    <g transform="rotate(16 30 46)">${chunky((a) => `<rect x="17" y="10" width="26" height="36" rx="4" ${a} />`, C.green, C.greenShade, 1, 2)}</g>
    ${chunky((a) => `<rect x="17" y="12" width="26" height="36" rx="4" ${a} />`, C.white, C.grey, 1, 2)}
    <path d="M22 22 h16 M22 29 h16 M22 36 h10" ${OUTLINE} fill="none" stroke-width="2.5" />`),
};

// --- Rule icons (for the Rule Book) -----------------------------------------------------
// A small sticker for every rule.
const tile = (inner, fill = C.white) =>
  sticker('icon', '0 0 60 60', `${chunky((a) => `<rect x="7" y="7" width="44" height="44" rx="8" ${a} />`, fill, C.grey, 2, 3)}${inner}`);
const numberBadge = (n) =>
  sticker('icon', '0 0 60 60', `
    ${chunky((a) => `<circle cx="29" cy="28" r="22" ${a} />`, C.yellow, C.yellowShade, 1, 3)}
    <text x="29" y="38" text-anchor="middle" font-family="Permanent Marker, cursive" font-size="28" fill="${INK}">${n}</text>`);

export const RULE_ICONS = {
  three: () => numberBadge(3),
  four: () => numberBadge(4),
  five: () => numberBadge(5),
  // A diagonal line with a "no" sign over it.
  noDiagonals: () => tile(`
    <path d="M16 42 L42 16" ${OUTLINE} fill="none" stroke-width="4" />
    <circle cx="29" cy="29" r="15" fill="none" stroke="${C.coral}" stroke-width="5" />
    <path d="M18 40 L40 18" stroke="${C.coral}" stroke-width="5" stroke-linecap="round" />`),
  // A bold diagonal arrow.
  onlyDiagonals: () => tile(`
    <path d="M16 42 L40 18 M28 17 h12 v12" fill="none" stroke="${C.teal}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />`),
  // A little 2x2 grid: play anywhere.
  anywhere: () => tile(`
    <path d="M29 13 V45 M13 29 H45" ${OUTLINE} fill="none" stroke-width="3" />`),
  // An arrow falling onto the ground.
  gravity: () => sticker('icon', '0 0 60 60', `
    ${chunky((a) => `<path d="M22 6 h14 v20 h10 l-17 18 l-17 -18 h10 z" ${a} />`, C.sky, C.skyShade, 1, 3)}
    ${chunky((a) => `<rect x="6" y="48" width="46" height="7" rx="3" ${a} />`, C.green, C.greenShade, 1, 2)}`),
  // A tile with hot corners.
  lava: () => tile(`
    <path d="M7 7 h14 l-14 14 z M51 7 v14 l-14 -14 z M7 51 v-14 l14 14 z M51 51 h-14 l14 -14 z" fill="${C.coral}" ${OUTLINE} stroke-width="2.5" />
    <path d="M29 20 q8 8 3 14 q-3 4 -6 0 q-4 -6 3 -14 z" fill="${C.yellow}" ${OUTLINE} stroke-width="2" />`),
  // Two marks touching.
  touch: () => sticker('icon', '0 0 60 60', `
    ${chunky((a) => `<circle cx="20" cy="30" r="13" ${a} />`, C.teal, C.tealShade, 1, 3)}
    ${chunky((a) => `<circle cx="40" cy="30" r="13" ${a} />`, C.coral, C.coralShade, 1, 3)}`),
  // A plain star: nothing weird.
  noTwist: () => sticker('icon', '0 0 60 60',
    chunky((a) => `<path d="M30 6 l7 15 l16 2 l-12 11 l3 16 l-14 -8 l-14 8 l3 -16 l-12 -11 l16 -2 z" ${a} />`, C.grey, C.greyShade, 1, 3)),
  // A faint, dashed X.
  fade: () => tile(`
    <g opacity="0.4" transform="translate(4 4) scale(0.5)"><polygon points="${X_POINTS}" fill="${C.teal}" ${OUTLINE} stroke-dasharray="6 5" /></g>`),
  // Two triangles facing a dashed mirror.
  mirror: () => tile(`
    <path d="M29 11 V47" stroke="${INK}" stroke-width="2.5" stroke-dasharray="4 4" />
    <path d="M24 18 v22 l-11 -11 z" fill="${C.teal}" ${OUTLINE} stroke-width="2.5" />
    <path d="M34 18 v22 l11 -11 z" fill="${C.teal}" ${OUTLINE} stroke-width="2.5" opacity="0.55" />`),
  // A stopwatch.
  timer: () => sticker('icon', '0 0 60 60', `
    ${chunky((a) => `<rect x="24" y="3" width="12" height="7" rx="2" ${a} />`, C.grey, C.greyShade, 1, 2)}
    ${chunky((a) => `<circle cx="30" cy="33" r="21" ${a} />`, C.yellow, C.yellowShade, 1, 3)}
    <circle cx="30" cy="33" r="14" fill="${C.white}" ${OUTLINE} stroke-width="2.5" />
    <path d="M30 33 V23 M30 33 l6 4" ${OUTLINE} fill="none" stroke-width="3" />`),
  // Two arrows chasing each other.
  reverse: () => sticker('icon', '0 0 60 60', `
    <path d="M14 26 a16 16 0 0 1 30 -6" fill="none" stroke="${C.coral}" stroke-width="6" stroke-linecap="round" />
    <path d="M46 10 l-1 12 l-11 -4 z" fill="${C.coral}" ${OUTLINE} stroke-width="2" />
    <path d="M46 34 a16 16 0 0 1 -30 6" fill="none" stroke="${C.teal}" stroke-width="6" stroke-linecap="round" />
    <path d="M14 50 l1 -12 l11 4 z" fill="${C.teal}" ${OUTLINE} stroke-width="2" />`),
};

// --- Hand-drawn lines ---------------------------------------------------------------

// A random number generator that always gives the same numbers for the same seed,
// so the wobbly lines look identical every time the board is redrawn.
function seededRandom(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// A slightly wobbly marker stroke from (x1, y1) to (x2, y2), as an SVG path "d".
export function wobblyLine(x1, y1, x2, y2, seed, wobble = 3.5, segments = 5) {
  const random = seededRandom(seed);
  const length = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / length; // a direction at right angles to the line
  const ny = (x2 - x1) / length;

  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const push = (random() * 2 - 1) * wobble;
    points.push([x1 + (x2 - x1) * t + nx * push, y1 + (y2 - y1) * t + ny * push]);
  }
  // Smooth curve through the points (each point is a control point, curving
  // through the midpoints between them).
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i + 1][0]) / 2;
    const my = (points[i][1] + points[i + 1][1]) / 2;
    d += ` Q${points[i][0].toFixed(1)},${points[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
}

// A scribbly loop around a rectangle (Otto's added lines): two loose, careless
// passes whose strokes overshoot the corners, like a quick marker scribble.
export function scribbleBox(x, y, w, h, seed) {
  let d = '';
  for (let pass = 0; pass < 2; pass++) {
    const o = pass === 0 ? -4 : 5;          // the second pass is a bit inside the first
    const over = pass === 0 ? 10 : 6;       // how far strokes run past the corners
    const s = seed * 10 + pass * 4;
    const left = x + o, right = x + w - o, top = y + o, bottom = y + h - o;
    d += wobblyLine(left - over, top, right + over / 2, top + 3, s, 6, 6) + ' ';
    d += wobblyLine(right, top - over / 2, right - 3, bottom + over, s + 1, 6, 6) + ' ';
    d += wobblyLine(right + over / 2, bottom, left - over, bottom - 3, s + 2, 6, 6) + ' ';
    d += wobblyLine(left, bottom + over / 2, left + 3, top - over, s + 3, 6, 6) + ' ';
  }
  return d;
}
