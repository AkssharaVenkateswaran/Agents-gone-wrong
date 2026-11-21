// rules.js
// Otto keeps rewriting the rules. This file holds:
//   - every rule (grouped into 3 categories: win, placement, twist)
//   - which rule is active in each category (only ONE per category at a time)
//   - the helpers the rest of the game uses to follow the current rules:
//     where a mark lands, which squares are legal, how a move is placed,
//     and whether someone has a winning line.
//
// The active rules live in state.rules = { win, placement, twist }. Each one is an
// "entry": { ruleId, sinceTurn, previous, settings?, expiresAtTurn? }
//   previous      - the entry it replaced (so Veto can bring it back)
//   settings      - win rules only: { length, directions } of a winning line
//   expiresAtTurn - Reverse day only: the turn it stops

import {
  addRow,
  addColumn,
  emptyCells,
  isPlayable,
  findLine,
  ALL_DIRECTIONS,
  pickRandom,
} from './board.js';

export const MAX_BOARD = 9;        // the board can grow up to 9x9
export const REVERSE_DAY_TURNS = 3; // Reverse day only lasts this many turns
export const FADE_AFTER_TURNS = 6;  // "Fading ink": marks older than this disappear

const DIRECTION_SETS = {
  all: ALL_DIRECTIONS,
  straight: ['h', 'v'],
  diagonal: ['d1', 'd2'],
};

// --- Every rule ---------------------------------------------------------------------
// available(state): can Otto (or the player) pick this rule right now?
// settings(current): win rules only — the new { length, dirs } given the current ones.
export const RULES = [
  // Win condition
  {
    id: 'three', category: 'win', isDefault: true,
    name: '3 in a row', sentence: 'Get 3 in a row (across, down or diagonal) to win.',
    settings: () => ({ length: 3, dirs: 'all' }),
  },
  {
    id: 'four', category: 'win',
    name: '4 in a row', sentence: 'You now need 4 in a row to win.',
    available: (state) => winSettings(state).length === 3,
    settings: () => ({ length: 4, dirs: 'all' }),
  },
  {
    id: 'five', category: 'win',
    name: '5 in a row', sentence: 'You now need 5 in a row to win.',
    available: (state) => winSettings(state).length === 4,
    settings: () => ({ length: 5, dirs: 'all' }),
  },
  {
    id: 'noDiagonals', category: 'win',
    name: "Diagonals don't count", sentence: 'Only lines going across or down count.',
    available: (state) => winSettings(state).dirs !== 'straight',
    settings: (current) => ({ length: current.length, dirs: 'straight' }),
  },
  {
    id: 'onlyDiagonals', category: 'win',
    name: 'ONLY diagonals count', sentence: 'Only diagonal lines count. Across and down do nothing.',
    available: (state) => winSettings(state).dirs !== 'diagonal',
    settings: (current) => ({ length: current.length, dirs: 'diagonal' }),
  },

  // Placement
  {
    id: 'anywhere', category: 'placement', isDefault: true,
    name: 'Place anywhere', sentence: 'Put your mark on any empty square.',
  },
  {
    id: 'gravity', category: 'placement',
    name: 'Gravity', sentence: 'Marks fall to the bottom of their column.',
  },
  {
    id: 'lava', category: 'placement',
    name: 'Corners are lava', sentence: "Nobody can play in the four corner squares.",
  },
  {
    id: 'touch', category: 'placement',
    name: 'Must touch', sentence: 'New marks must touch an existing mark (diagonally counts).',
  },

  // Twist
  {
    id: 'noTwist', category: 'twist', isDefault: true,
    name: 'No twist', sentence: 'Nothing weird is happening. Yet.',
  },
  {
    id: 'fade', category: 'twist',
    name: 'Fading ink', sentence: `Marks older than ${FADE_AFTER_TURNS} turns fade away.`,
  },
  {
    id: 'mirror', category: 'twist',
    name: 'Mirror', sentence: 'Every move is copied to the mirrored square (left ↔ right) if it is empty.',
  },
  {
    id: 'timer', category: 'twist',
    name: '5-second timer', sentence: 'You get 5 seconds per turn, or you lose the turn.',
  },
  {
    id: 'reverse', category: 'twist',
    name: 'Reverse day', sentence: `Making a line LOSES! Lasts ${REVERSE_DAY_TURNS} turns.`,
  },
];

export const CATEGORIES = ['win', 'placement', 'twist'];
export const CATEGORY_NAMES = { win: 'To win', placement: 'Placing marks', twist: 'Twist' };

export function getRule(id) {
  return RULES.find((rule) => rule.id === id);
}

// The rules every match starts with.
export function defaultRules() {
  return {
    win: { ruleId: 'three', sinceTurn: 1, previous: null, settings: { length: 3, dirs: 'all' } },
    placement: { ruleId: 'anywhere', sinceTurn: 1, previous: null },
    twist: { ruleId: 'noTwist', sinceTurn: 1, previous: null },
  };
}

// The turn number shown to the player (1 on the first turn).
export function currentTurn(state) {
  return state.playerTurns + 1;
}

export function isActive(state, ruleId) {
  const rule = getRule(ruleId);
  return state.rules[rule.category].ruleId === ruleId;
}

// What a winning line looks like right now: { length, dirs: 'all'|'straight'|'diagonal' }
export function winSettings(state) {
  return state.rules.win.settings;
}

// Is the game still using the original rules? (Then Otto can use perfect minimax.)
export function isClassic(state) {
  return (
    state.rules.win.ruleId === 'three' &&
    state.rules.placement.ruleId === 'anywhere' &&
    state.rules.twist.ruleId === 'noTwist' &&
    state.board.rows === 3 &&
    state.board.cols === 3
  );
}

// --- Changing the rules --------------------------------------------------------------

// Rules that could be switched on right now (not already active, not a default).
export function availableRules(state) {
  return RULES.filter(
    (rule) =>
      !rule.isDefault &&
      !isActive(state, rule.id) &&
      (rule.available ? rule.available(state) : true)
  );
}

// Draw up to `count` random rules, all different.
export function drawRules(state, count = 3) {
  const pool = availableRules(state).slice();
  const drawn = [];
  while (drawn.length < count && pool.length > 0) {
    const pick = pickRandom(pool);
    drawn.push(pick.id);
    pool.splice(pool.indexOf(pick), 1);
  }
  return drawn;
}

// Switch a rule on. The old rule in that category goes into the history (crossed out).
export function activateRule(state, ruleId) {
  const rule = getRule(ruleId);
  const category = rule.category;
  const old = state.rules[category];
  const entry = { ruleId, sinceTurn: currentTurn(state), previous: old };
  if (category === 'win') entry.settings = rule.settings(old.settings);
  if (ruleId === 'reverse') entry.expiresAtTurn = currentTurn(state) + REVERSE_DAY_TURNS;

  state.ruleHistory.unshift({ entry: old, endedTurn: currentTurn(state), how: 'replaced' });
  state.rules[category] = entry;
  state.newestCategory = category;           // shows the NEW! label; Veto targets this
  state.lastRuleChangeTurn = state.playerTurns;
  state.stats.rulesChanged++;
  ensureBoardFits(state);
}

// Veto: cross out the newest rule and bring back the one it replaced.
// Returns the vetoed rule's id, or null if there's nothing to veto.
export function vetoNewest(state) {
  const category = state.newestCategory;
  if (!category) return null;
  const entry = state.rules[category];
  if (!entry.previous) return null;

  restorePrevious(state, category, 'vetoed');
  state.newestCategory = null; // you can only veto the newest rule once
  return entry.ruleId;
}

// Put back the rule that `category`'s current rule replaced.
export function restorePrevious(state, category, how) {
  const entry = state.rules[category];
  const previous = entry.previous;
  // It's active again, so take it out of the crossed-out history...
  state.ruleHistory = state.ruleHistory.filter((record) => record.entry !== previous);
  // ...and cross out the rule we're removing.
  state.ruleHistory.unshift({ entry, endedTurn: currentTurn(state), how });
  state.rules[category] = previous;
  ensureBoardFits(state);
}

// Reverse day only lasts a few turns. Returns true if it just ended.
export function expireRules(state) {
  const twist = state.rules.twist;
  if (twist.expiresAtTurn && currentTurn(state) >= twist.expiresAtTurn) {
    restorePrevious(state, 'twist', 'expired');
    if (state.newestCategory === 'twist') state.newestCategory = null;
    return true;
  }
  return false;
}

// The board must always be at least (win length + 1) squares wide and tall.
// Returns true if it had to grow.
export function ensureBoardFits(state) {
  const need = Math.min(MAX_BOARD, winSettings(state).length + 1);
  let grew = false;
  while (state.board.rows < need) {
    addRow(state.board);
    grew = true;
  }
  while (state.board.cols < need) {
    addColumn(state.board);
    grew = true;
  }
  return grew;
}

// --- Following the rules -------------------------------------------------------------

function isCorner(board, i) {
  const r = Math.floor(i / board.cols);
  const c = i % board.cols;
  return (r === 0 || r === board.rows - 1) && (c === 0 || c === board.cols - 1);
}

function touchesAMark(board, i) {
  const r = Math.floor(i / board.cols);
  const c = i % board.cols;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < board.rows && cc >= 0 && cc < board.cols) {
        if (board.cells[rr * board.cols + cc]) return true;
      }
    }
  }
  return false;
}

// Where does a mark end up if you click square i?
// Normally right there; with Gravity it falls down its column.
// Returns -1 if it can't go anywhere (the square is taken).
export function landingSquare(state, i) {
  const board = state.board;
  if (!isPlayable(board, i)) return -1;
  if (state.rules.placement.ruleId !== 'gravity') return i;
  let landing = i;
  while (landing + board.cols < board.cells.length && isPlayable(board, landing + board.cols)) {
    landing += board.cols; // keep falling while the square below is free
  }
  return landing;
}

// Every square a mark is allowed to land on right now (same for both players).
export function legalSquares(state) {
  const board = state.board;
  const placement = state.rules.placement.ruleId;
  let squares = emptyCells(board);
  if (placement === 'gravity') squares = squares.filter((i) => landingSquare(state, i) === i);

  let legal = squares;
  if (placement === 'lava') legal = squares.filter((i) => !isCorner(board, i));
  if (placement === 'touch' && board.cells.some(Boolean)) {
    legal = squares.filter((i) => touchesAMark(board, i));
  }
  // Never get stuck: if the rule leaves nowhere to play, any free square will do.
  return legal.length > 0 ? legal : squares;
}

// A short explanation of why a landing square isn't allowed (or '' if it is).
export function whyIllegal(state, landing) {
  if (landing === -1) return 'That square is taken.';
  if (legalSquares(state).includes(landing)) return '';
  const placement = state.rules.placement.ruleId;
  if (placement === 'lava') return 'Corners are lava! Pick another square.';
  if (placement === 'touch') return 'Your mark must touch an existing mark.';
  return "You can't play there.";
}

// The mirrored square (left ↔ right) of square i.
export function mirrorSquare(board, i) {
  const r = Math.floor(i / board.cols);
  const c = i % board.cols;
  return r * board.cols + (board.cols - 1 - c);
}

// Put a single mark on a square, remembering when it was placed.
export function putMark(state, i, mark) {
  state.board.cells[i] = mark;
  state.board.age[i] = state.playerTurns;
  state.board.stolen[i] = false;
  state.board.glued[i] = false;
}

// Make a normal move on a landing square, following the twist rules (Mirror).
// Returns the list of squares that got a mark.
export function placeMove(state, landing, mark) {
  putMark(state, landing, mark);
  const placed = [landing];
  if (state.rules.twist.ruleId === 'mirror') {
    const mirror = mirrorSquare(state.board, landing);
    if (mirror !== landing && isPlayable(state.board, mirror)) {
      putMark(state, mirror, mark);
      placed.push(mirror);
    }
  }
  return placed;
}

// Fading ink: remove marks that are too old. Returns how many faded.
export function fadeOldMarks(state) {
  if (state.rules.twist.ruleId !== 'fade') return 0;
  const board = state.board;
  let faded = 0;
  board.cells.forEach((mark, i) => {
    if (mark && board.age[i] !== null && state.playerTurns - board.age[i] >= FADE_AFTER_TURNS) {
      board.cells[i] = null;
      board.age[i] = null;
      board.stolen[i] = false;
      board.glued[i] = false;
      faded++;
    }
  });
  return faded;
}

// How old is the mark on square i, in turns? (Used to draw fading marks.)
export function markAge(state, i) {
  const age = state.board.age[i];
  return age === null ? 0 : state.playerTurns - age;
}

// Does `mark` have a winning line under the CURRENT win rule? { mark, line } or null.
export function lineFor(state, mark) {
  const { length, dirs } = winSettings(state);
  return findLine(state.board, mark, length, DIRECTION_SETS[dirs]);
}

export function winDirections(state) {
  return DIRECTION_SETS[winSettings(state).dirs];
}

export function isReverseDay(state) {
  return state.rules.twist.ruleId === 'reverse';
}

// --- Highlights ------------------------------------------------------------------------
// When a rule changes, these squares light up for 2 seconds to show what it affects.
export function affectedSquares(state, ruleId) {
  const board = state.board;
  const { rows, cols } = board;
  const all = board.cells.map((_, i) => i);
  const midRow = Math.floor(rows / 2);
  const midCol = Math.floor(cols / 2);
  const { length } = winSettings(state);

  // An example line of the current win length, through the middle of the board.
  const exampleLine = (dr, dc) => {
    const squares = [];
    const startR = dr === 0 ? midRow : Math.max(0, midRow - Math.floor(length / 2));
    const startC = dc === 0 ? midCol : dc > 0 ? Math.max(0, midCol - Math.floor(length / 2)) : Math.min(cols - 1, midCol + Math.floor(length / 2));
    for (let k = 0; k < length; k++) {
      const r = startR + dr * k;
      const c = startC + dc * k;
      if (r >= 0 && r < rows && c >= 0 && c < cols) squares.push(r * cols + c);
    }
    return squares;
  };

  switch (ruleId) {
    case 'three':
    case 'four':
    case 'five':
      return exampleLine(0, 1);
    case 'noDiagonals':
      return exampleLine(1, 0);
    case 'onlyDiagonals':
      return exampleLine(1, 1);
    case 'gravity':
      return all.filter((i) => Math.floor(i / cols) === rows - 1);
    case 'lava':
      return all.filter((i) => isCorner(board, i));
    case 'touch':
      return legalSquares(state);
    case 'fade':
      return all.filter((i) => board.cells[i]);
    case 'mirror':
      return all.filter((i) => board.cells[i]).map((i) => mirrorSquare(board, i));
    case 'reverse':
      return all.filter((i) => board.cells[i]);
    default:
      return [];
  }
}
