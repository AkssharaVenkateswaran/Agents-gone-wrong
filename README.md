# Agents Gone Wrong

Tic-tac-toe is solved. The agent didn't like that.

A browser game (Vite + vanilla JavaScript) where Otto, an AI agent, keeps cheating and
rewriting the rules. Otto's memory (stats and the leaderboard) lives in Snowflake.

## Run it locally

```bash
npm install
npx vercel dev      # the game AND the /api functions, on http://localhost:3000
```

`npx vercel dev` needs you to be logged in (`npx vercel login`) and links the folder to a
Vercel project the first time. It reads `SNOWFLAKE_ACCOUNT_URL` and `SNOWFLAKE_PAT` from
`.env` (never commit that file).

`npm run dev` still works for the game alone: without the API, Otto just uses scripted
lines and the leaderboard says its memory is offline.

## How it's put together

- `src/` — the game (runs in the browser).
- `api/match.js` — `POST /api/match`: saves a finished match to `GAME_LOGS`.
- `api/stats.js` — `GET /api/stats?player=NAME`: the player's habits, today's victims,
  cheat catch rates and the top 5 humans.
- `api/_lib/` — shared server code (not an endpoint): the Snowflake SQL API call and
  input validation. The Snowflake token is only ever read here, on the server.

The API is public, so it checks everything: names are 1–20 letters/numbers/spaces, and
cheat and power-up ids must be ones the game really has. SQL always uses bind variables.
The game gives up on the API after 3 seconds and carries on without it.

## Deploy on Vercel

1. Import the GitHub repo in Vercel (it detects Vite: build `npm run build`, output `dist`).
2. In Project → Settings → Environment Variables, add `SNOWFLAKE_ACCOUNT_URL` and
   `SNOWFLAKE_PAT` (mark the token as Sensitive).
3. Deploy. Pushes to `main` deploy automatically.
