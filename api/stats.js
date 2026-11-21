// api/stats.js  —  GET /api/stats?player=NAME
// Everything Otto "remembers": the player's habits, today's victims,
// how often each cheat gets caught, and the Humans vs Otto leaderboard.
// Runs as a Vercel serverless function.

import { runQuery, sendError } from './_lib/snowflake.js';
import { cleanName } from './_lib/validate.js';

// The player's favourite first move.
const FIRST_MOVE = `
  SELECT first_move, COUNT(*) AS times
  FROM GAME_LOGS
  WHERE player_name = ? AND first_move IS NOT NULL
  GROUP BY first_move
  ORDER BY times DESC
  LIMIT 1`;

// The player's record against Otto.
const PLAYER_RECORD = `
  SELECT COUNT(*) AS matches, COUNT_IF(winner = 'player') AS wins
  FROM GAME_LOGS
  WHERE player_name = ?`;

// How many different humans Otto has beaten today, plus the all-time totals.
const TOTALS = `
  SELECT
    COUNT(DISTINCT IFF(winner = 'otto' AND created_at >= CURRENT_DATE(), player_name, NULL)),
    COUNT_IF(winner = 'player'),
    COUNT_IF(winner = 'otto')
  FROM GAME_LOGS`;

// For each cheat: how many attempts were caught (cheats_caught) vs. landed (cheats_used).
const CATCH_RATES = `
  WITH attempts AS (
    SELECT f.value::STRING AS cheat, 0 AS caught
    FROM GAME_LOGS, LATERAL FLATTEN(input => cheats_used) f
    UNION ALL
    SELECT f.value::STRING AS cheat, 1 AS caught
    FROM GAME_LOGS, LATERAL FLATTEN(input => cheats_caught) f
  )
  SELECT cheat, ROUND(100 * SUM(caught) / COUNT(*)) AS catch_rate, COUNT(*) AS attempts
  FROM attempts
  GROUP BY cheat`;

// Top 5 humans by wins against Otto.
const LEADERBOARD = `
  SELECT player_name, COUNT_IF(winner = 'player') AS wins, COUNT(*) AS matches
  FROM GAME_LOGS
  GROUP BY player_name
  HAVING wins > 0
  ORDER BY wins DESC, matches ASC
  LIMIT 5`;

const toNumber = (value) => Number(value ?? 0);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Use GET');
  }

  // The player is optional (without it you just get the global stats).
  const rawPlayer = req.query?.player;
  const player = rawPlayer === undefined || rawPlayer === '' ? null : cleanName(rawPlayer);
  if (rawPlayer && !player) return sendError(res, 400, 'player must be 1-20 letters, numbers or spaces');

  try {
    // All queries at once, so the answer comes back quickly.
    const [firstMove, record, totals, rates, leaders] = await Promise.all([
      player ? runQuery(FIRST_MOVE, [player]) : [],
      player ? runQuery(PLAYER_RECORD, [player]) : [],
      runQuery(TOTALS),
      runQuery(CATCH_RATES),
      runQuery(LEADERBOARD),
    ]);

    const catchRates = {};
    for (const [cheat, rate, attempts] of rates) {
      catchRates[cheat] = { rate: toNumber(rate), attempts: toNumber(attempts) };
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      player: player && {
        name: player,
        firstMove: firstMove[0] ? { move: firstMove[0][0], count: toNumber(firstMove[0][1]) } : null,
        matches: toNumber(record[0]?.[0]),
        wins: toNumber(record[0]?.[1]),
      },
      global: {
        ottoWinsToday: toNumber(totals[0]?.[0]),
        humanWins: toNumber(totals[0]?.[1]),
        ottoWins: toNumber(totals[0]?.[2]),
        catchRates,
      },
      leaderboard: leaders.map(([name, wins, matches]) => ({
        name,
        wins: toNumber(wins),
        matches: toNumber(matches),
      })),
    });
  } catch (err) {
    console.error('Loading stats failed:', err.message);
    sendError(res, 502, "Otto's memory is unavailable right now");
  }
}
