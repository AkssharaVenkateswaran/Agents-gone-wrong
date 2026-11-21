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

// --- The evil twin: the other player whose play style is most like yours ---------------------
// Each player's style is 6 numbers: corner openings, centre openings, win rate, power-ups
// per match, match length and cheat catch rate. (Our first moves are named like
// 'top-left corner' and 'centre'.) Test matches are left out.
const STYLES = `
  SELECT player_name,
    AVG(IFF(first_move IN ('top-left corner','top-right corner','bottom-left corner','bottom-right corner'), 1, 0)) AS corner,
    AVG(IFF(first_move = 'centre', 1, 0)) AS center,
    AVG(IFF(winner = 'player', 1, 0)) AS winrate,
    LEAST(COALESCE(AVG(ARRAY_SIZE(powerups_used)), 0) / 10, 1) AS powerups,
    LEAST(COALESCE(AVG(turns), 0) / 30, 1) AS length,
    COALESCE(SUM(ARRAY_SIZE(cheats_caught)) /
      NULLIF(SUM(ARRAY_SIZE(cheats_caught)) + SUM(ARRAY_SIZE(cheats_used)), 0), 0) AS catch_rate
  FROM GAME_LOGS
  WHERE match_id NOT LIKE 'test-%' AND player_name IS NOT NULL
  GROUP BY player_name`;

// Snowflake does the matching with a vector similarity.
const TWIN = `
  WITH s AS (${STYLES}),
  v AS (
    SELECT player_name, winrate,
           ARRAY_CONSTRUCT(corner, center, winrate, powerups, length, catch_rate)::VECTOR(FLOAT, 6) AS style
    FROM s
    -- an all-zero style has no direction (its similarity would be NaN), so leave it out
    WHERE corner + center + winrate + powerups + length + catch_rate > 0
  )
  SELECT b.player_name AS twin, ROUND(100 * VECTOR_COSINE_SIMILARITY(a.style, b.style)) AS similarity, b.winrate
  FROM v a JOIN v b ON a.player_name = ? AND b.player_name <> a.player_name
  ORDER BY similarity DESC
  LIMIT 1`;

function cosine(a, b) {
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
  const size = (v) => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return size(a) && size(b) ? dot / (size(a) * size(b)) : 0;
}

// The twin as { name, similarity, hasWins }, or null (no games yet / nobody else).
// If the VECTOR cast fails for any reason, the same 6 numbers are compared in JavaScript.
async function findTwin(player) {
  try {
    const [row] = await runQuery(TWIN, [player]);
    if (!row || !Number.isFinite(Number(row[1]))) return null;
    return { name: row[0], similarity: Number(row[1]), hasWins: Number(row[2]) > 0 };
  } catch (err) {
    console.log('Twin: VECTOR query failed, using the JavaScript fallback:', err.message);
    const rows = await runQuery(STYLES);
    const styles = rows
      .map(([name, ...numbers]) => ({ name, style: numbers.map(Number) }))
      .filter((s) => s.style.some((x) => x > 0)); // all-zero styles have no direction
    const me = styles.find((s) => s.name === player);
    if (!me) return null;
    let best = null;
    for (const other of styles) {
      if (other.name === player) continue;
      const similarity = Math.round(100 * cosine(me.style, other.style));
      if (!best || similarity > best.similarity) best = { name: other.name, similarity, hasWins: other.style[2] > 0 };
    }
    return best;
  }
}

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
    const [firstMove, record, totals, rates, leaders, twin] = await Promise.all([
      player ? runQuery(FIRST_MOVE, [player]) : [],
      player ? runQuery(PLAYER_RECORD, [player]) : [],
      runQuery(TOTALS),
      runQuery(CATCH_RATES),
      runQuery(LEADERBOARD),
      player ? findTwin(player) : null,
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
      twin, // { name, similarity, hasWins } or null
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
