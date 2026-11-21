// api/match.js  —  POST /api/match
// Saves a finished match into the GAME_LOGS table.
// Runs as a Vercel serverless function (export default handler(req, res)).

import { randomUUID } from 'node:crypto';
import { runQuery, sendError } from './_lib/snowflake.js';
import { validateMatch } from './_lib/validate.js';

// INSERT ... SELECT (not VALUES) so we can turn JSON text into ARRAY columns.
const INSERT_MATCH = `
  INSERT INTO GAME_LOGS
    (match_id, player_name, first_move, cheats_used, cheats_caught, powerups_used, winner)
  SELECT ?, ?, NULLIF(?, ''), PARSE_JSON(?)::ARRAY, PARSE_JSON(?)::ARRAY, PARSE_JSON(?)::ARRAY, ?`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'Use POST');
  }

  const { match, error } = validateMatch(req.body);
  if (error) return sendError(res, 400, error);

  const matchId = randomUUID(); // made on the server, so nobody can pick their own
  try {
    await runQuery(INSERT_MATCH, [
      matchId,
      match.playerName,
      match.firstMove ?? '',
      JSON.stringify(match.cheatsUsed),
      JSON.stringify(match.cheatsCaught),
      JSON.stringify(match.powerupsUsed),
      match.winner,
    ]);
  } catch (err) {
    console.error('Saving match failed:', err.message);
    return sendError(res, 502, "Otto's memory is unavailable right now");
  }
  res.status(201).json({ ok: true, matchId });
}
