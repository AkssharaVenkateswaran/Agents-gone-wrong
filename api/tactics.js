// api/tactics.js  —  GET /api/tactics
// Otto learns from EVERYONE's games: which cheats land on humans most often, and
// which rules Otto tends to win with. The game uses these to weight (never decide)
// Otto's choices. Runs as a Vercel serverless function.

import { runQuery, sendError } from './_lib/snowflake.js';

// For each cheat: how often it was tried, how often it landed (wasn't caught), and how
// often Otto won the matches it was used in. (Test matches are left out.)
const CHEAT_TACTICS = `
  WITH used AS (
    SELECT f.value::STRING AS cheat, match_id, winner, 0 AS caught
    FROM GAME_LOGS, LATERAL FLATTEN(input => cheats_used) f WHERE match_id NOT LIKE 'test-%'
    UNION ALL
    SELECT f.value::STRING, match_id, winner, 1
    FROM GAME_LOGS, LATERAL FLATTEN(input => cheats_caught) f WHERE match_id NOT LIKE 'test-%'
  )
  SELECT cheat,
         COUNT(*) AS attempts,
         ROUND(100 * AVG(IFF(caught = 0, 1, 0))) AS land_rate,
         ROUND(100 * AVG(IFF(winner = 'otto', 1, 0))) AS otto_win_rate
  FROM used GROUP BY cheat`;

// For each rule: in how many matches it appeared, and how often Otto won those.
const RULE_TACTICS = `
  SELECT f.value::STRING AS rule, COUNT(*) AS matches,
         ROUND(100 * AVG(IFF(winner = 'otto', 1, 0))) AS otto_win_rate
  FROM GAME_LOGS, LATERAL FLATTEN(input => rules_seen) f
  WHERE match_id NOT LIKE 'test-%'
  GROUP BY rule`;

// Kept in memory for 60 s (per warm server instance), so busy moments don't hammer Snowflake.
const CACHE_MS = 60 * 1000;
let cache = null; // { at, data }

const toNumber = (value) => Number(value ?? 0);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Use GET');
  }
  if (cache && Date.now() - cache.at < CACHE_MS) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(cache.data);
  }
  try {
    const [cheatRows, ruleRows] = await Promise.all([runQuery(CHEAT_TACTICS), runQuery(RULE_TACTICS)]);
    const cheats = {};
    for (const [cheat, attempts, landRate, ottoWinRate] of cheatRows) {
      cheats[cheat] = { attempts: toNumber(attempts), landRate: toNumber(landRate), ottoWinRate: toNumber(ottoWinRate) };
    }
    const rules = {};
    for (const [rule, matches, ottoWinRate] of ruleRows) {
      rules[rule] = { matches: toNumber(matches), ottoWinRate: toNumber(ottoWinRate) };
    }
    const data = { cheats, rules };
    cache = { at: Date.now(), data };
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(data);
  } catch (err) {
    console.error('Loading tactics failed:', err.message);
    sendError(res, 502, "Otto's memory is unavailable right now");
  }
}
