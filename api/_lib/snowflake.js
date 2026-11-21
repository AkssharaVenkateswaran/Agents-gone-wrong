// api/_lib/snowflake.js
// Runs one SQL statement through the Snowflake SQL API.
// This file only ever runs on the server (Vercel). The access token comes from
// environment variables and is never sent to the browser.
// (Files and folders starting with "_" inside api/ are not turned into endpoints.)

const SNOWFLAKE_TIMEOUT_MS = 8000;

// Run `sql` with `?` placeholders filled from `params` (bind variables —
// we never glue user input into the SQL text). Returns the rows: arrays of strings.
export async function runQuery(sql, params = []) {
  const accountUrl = process.env.SNOWFLAKE_ACCOUNT_URL;
  const token = process.env.SNOWFLAKE_PAT;
  if (!accountUrl || !token) throw new Error('Snowflake is not configured');

  const bindings = {};
  params.forEach((value, i) => {
    bindings[i + 1] = { type: 'TEXT', value: String(value) };
  });

  const response = await fetch(`${accountUrl.replace(/\/+$/, '')}/api/v2/statements`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      statement: sql,
      timeout: 10, // seconds Snowflake may spend on it
      warehouse: 'COMPUTE_WH',
      database: 'AGENTS_GONE_WRONG',
      schema: 'PUBLIC',
      role: 'ACCOUNTADMIN',
      bindings,
    }),
    signal: AbortSignal.timeout(SNOWFLAKE_TIMEOUT_MS),
  });

  // 200 = finished. (202 means "still running", which we treat as too slow.)
  if (response.status !== 200) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Snowflake answered ${response.status}: ${detail}`);
  }
  const result = await response.json();
  return result.data ?? [];
}

// Send a JSON error without leaking any details to the browser.
export function sendError(res, status, message) {
  res.status(status).json({ error: message });
}
