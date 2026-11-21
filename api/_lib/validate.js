// api/_lib/validate.js
// The API is public, so everything a browser sends is checked before it goes
// anywhere near Snowflake: names are short and plain, and cheat / power-up ids
// must be ones the game really has.

import { CHEATS } from '../../src/cheats.js';
import { POWERUPS } from '../../src/powerups.js';
import { FIRST_MOVES, WINNERS, cleanName } from '../../src/matchLog.js';

export { cleanName };

const CHEAT_IDS = new Set(CHEATS.map((cheat) => cheat.id));
const POWERUP_IDS = new Set(POWERUPS.map((powerUp) => powerUp.id));
const MAX_LIST_LENGTH = 200; // no real match gets anywhere near this

function cleanIdList(list, allowed) {
  if (!Array.isArray(list) || list.length > MAX_LIST_LENGTH) return null;
  return list.every((id) => typeof id === 'string' && allowed.has(id)) ? list : null;
}

// Check a finished match sent by the game.
// Returns { match } with clean values, or { error } explaining what's wrong.
export function validateMatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Expected a JSON object' };

  const playerName = cleanName(body.playerName);
  if (!playerName) return { error: 'playerName must be 1-20 letters, numbers or spaces' };

  const firstMove = body.firstMove ?? null;
  if (firstMove !== null && !FIRST_MOVES.includes(firstMove)) return { error: 'Unknown firstMove' };

  const cheatsUsed = cleanIdList(body.cheatsUsed, CHEAT_IDS);
  const cheatsCaught = cleanIdList(body.cheatsCaught, CHEAT_IDS);
  if (!cheatsUsed || !cheatsCaught) return { error: 'Unknown cheat id' };

  const powerupsUsed = cleanIdList(body.powerupsUsed, POWERUP_IDS);
  if (!powerupsUsed) return { error: 'Unknown power-up id' };

  if (!WINNERS.includes(body.winner)) return { error: 'winner must be player, otto or draw' };

  return { match: { playerName, firstMove, cheatsUsed, cheatsCaught, powerupsUsed, winner: body.winner } };
}
