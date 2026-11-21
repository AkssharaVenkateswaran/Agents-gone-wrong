// memory.js
// Otto's memory: talks to our own API (/api/stats and /api/match), which talks
// to Snowflake. The browser never sees any Snowflake credentials.
//
// The network must NEVER hold up the game: every call gives up after 3 seconds
// and returns null on any problem, and the game simply carries on with its
// normal scripted lines.

const API_TIMEOUT_MS = 3000;

async function callApi(path, options = {}) {
  try {
    const response = await fetch(path, { ...options, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null; // offline, too slow, no API running (e.g. plain `npm run dev`)...
  }
}

// Stats for this player and everyone else, or null.
export function fetchStats(playerName) {
  return callApi(`/api/stats?player=${encodeURIComponent(playerName)}`);
}

// Save a finished match. Resolves to the API's answer, or null.
export function saveMatch(match) {
  return callApi('/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(match),
  });
}
