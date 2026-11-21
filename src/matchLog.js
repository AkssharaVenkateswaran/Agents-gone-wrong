// matchLog.js
// What we remember about a finished match, shared by the game (which sends it)
// and the API (which checks it before saving it to Snowflake).
// Plain constants only — no browser code — so the server can import this file too.

export const MAX_NAME_LENGTH = 20;

// Names for the 9 squares of the classic 3x3 board (the player's first move).
export const FIRST_MOVES = [
  'top-left corner', 'top edge', 'top-right corner',
  'left edge', 'centre', 'right edge',
  'bottom-left corner', 'bottom edge', 'bottom-right corner',
];

export const WINNERS = ['player', 'otto', 'draw'];

// Letters (any language), numbers, spaces and a little punctuation.
const NAME_PATTERN = /^[\p{L}\p{N} _.'-]+$/u;

// Tidy a player name. Returns the clean name, or null if it isn't allowed.
export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || [...name].length > MAX_NAME_LENGTH) return null;
  return NAME_PATTERN.test(name) ? name : null;
}
