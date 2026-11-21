# Add: Otto's memory runs on Snowflake

Snowflake stores every match played by every player at the hackathon. Otto uses these stats to taunt players with real data, and the end screen shows a live "Humans vs Otto" leaderboard.

## Already set up in Snowflake (do not recreate)
- Warehouse: `COMPUTE_WH`
- Database / schema: `AGENTS_GONE_WRONG.PUBLIC`
- Table `GAME_LOGS`:
  ```
  match_id STRING, player_name STRING, first_move STRING,
  cheats_used ARRAY, cheats_caught ARRAY, powerups_used ARRAY,
  winner STRING, created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
  ```
- Credentials are in `.env` (never commit this file):
  ```
  SNOWFLAKE_ACCOUNT_URL=https://<account>.snowflakecomputing.com
  SNOWFLAKE_PAT=<programmatic access token>
  ```

## Architecture
- Add a small Node + Express server in `server/index.js` on port 3001; use `dotenv` to read `.env`.
- Configure the Vite dev server to proxy `/api` to `http://localhost:3001`. Add an npm script `dev:all` that runs both together (use `concurrently`).
- Talk to Snowflake via the Snowflake SQL API:
  - `POST ${SNOWFLAKE_ACCOUNT_URL}/api/v2/statements`
  - Headers:
    - `Authorization: Bearer ${SNOWFLAKE_PAT}`
    - `X-Snowflake-Authorization-Token-Type: PROGRAMMATIC_ACCESS_TOKEN`
    - `Content-Type: application/json`
    - `Accept: application/json`
  - Body includes `"warehouse": "COMPUTE_WH"`, `"database": "AGENTS_GONE_WRONG"`, `"schema": "PUBLIC"`, `"role": "ACCOUNTADMIN"`.
  - Always use **bind variables** (`"bindings"` in the request body) — never build SQL by string concatenation.
  - Results come back in `data` as an array of rows (arrays of strings).
- The token must ONLY live on the server — never send it to the browser, never commit it.

## Endpoints
- `POST /api/match` — insert a finished match into `GAME_LOGS` (match_id, player_name, first_move, cheats_used, cheats_caught, powerups_used, winner). Use `PARSE_JSON` / `ARRAY_CONSTRUCT` for the array columns.
- `GET /api/stats?player=NAME` — return JSON with:
  - the player's most common first move and how many times they've used it
  - the player's total matches and wins vs Otto
  - global count of humans Otto has beaten today
  - global catch rate per cheat (%)
  - top 5 players by wins vs Otto

## Game changes
- Ask for the player's name on the title screen (a sticker-style text input).
- At match start, fetch stats and fill placeholders in data-driven Otto lines in `dialogue.js`, e.g.:
  - "You've opened in the {firstMove} {firstMoveCount} times. Predictable."
  - "I've beaten {ottoWinsToday} humans today. You'll be next."
  - "Only {catchRate}% of humans catch my {cheatName}. Let's see."
- When a match ends, `POST /api/match`.
- End screen: a "Humans vs Otto" leaderboard drawn as a white sticker card.
- Add a small "🧠 Otto's memory powered by Snowflake" washi-tape label in the HUD.
- If the server or Snowflake fails or is slow (timeout 3 seconds), the game still works with plain scripted lines. Never block gameplay on the network.

## Done when
- `npm run dev:all` starts both the game and the server.
- Finishing a match adds a row to `GAME_LOGS` (check in Snowflake with `SELECT * FROM GAME_LOGS ORDER BY created_at DESC;`).
- Otto uses at least one real stat in its taunts, and the leaderboard shows real data.
