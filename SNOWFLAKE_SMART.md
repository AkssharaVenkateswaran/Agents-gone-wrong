# Implement: Otto learns from everyone's games (data-driven cheating + evil twin)

Two features that make Snowflake Otto's brain-from-the-crowd. Both use plain SQL and vector functions (no Cortex AI functions; those are blocked on our trial). Keep everything else working. Same rules as before: Vercel-style handlers in `api/`, bind variables only, token server-side only, 3 s client timeout, game never waits or breaks if Snowflake is down.

---

## 1. Data-driven cheating: `GET /api/tactics`
Otto picks the cheats and rules that have beaten humans most often across ALL players' games.

SQL (exclude `match_id LIKE 'test-%'`):
```sql
-- How often each cheat lands vs gets caught, and how often Otto wins matches where he used it
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
FROM used GROUP BY cheat;

-- How often Otto wins matches in which each rule appeared
SELECT f.value::STRING AS rule, COUNT(*) AS matches,
       ROUND(100 * AVG(IFF(winner = 'otto', 1, 0))) AS otto_win_rate
FROM GAME_LOGS, LATERAL FLATTEN(input => rules_seen) f
WHERE match_id NOT LIKE 'test-%'
GROUP BY rule;
```
Response: `{ cheats: { lightsOut: { attempts, landRate, ottoWinRate } }, rules: { win4: { matches, ottoWinRate } } }`. Cache the result in memory for 60 s on the server.

**In the game:**
- Fetch tactics at match start (and after each round).
- When Otto chooses among the **already-allowed** cheats or **already-safe** rule candidates (all existing cooldown, balance and fairness rules still apply first), weight the choice: `weight = 1 + (score / 100)`, where score = `0.5 × landRate + 0.5 × ottoWinRate` for cheats, or `ottoWinRate` for rules. Items with fewer than 3 attempts/matches get weight 1 (neutral). Never pick deterministically; keep it a weighted random choice so the balance targets still hold.
- Otto's terminal (or bubble if there's no terminal yet) shows the reasoning when a data-driven choice is made:
  ```
  OTTO@AGENT:~$ snowflake.query --best-cheat
  > lightsOut lands 82% of the time on humans. lights out.
  ```
- Re-run the balance test with typical tactics weights and confirm the player's win rates are still inside the targets.

## 2. Evil twin: similarity matching (add to `GET /api/stats`)
Each player's play style becomes a 6-number vector; Snowflake finds the most similar other player.
```sql
WITH s AS (
  SELECT player_name,
    AVG(IFF(first_move IN ('top-left','top-right','bottom-left','bottom-right'), 1, 0)) AS corner,
    AVG(IFF(first_move = 'center', 1, 0)) AS center,
    AVG(IFF(winner = 'player', 1, 0)) AS winrate,
    LEAST(COALESCE(AVG(ARRAY_SIZE(powerups_used)), 0) / 10, 1) AS powerups,
    LEAST(COALESCE(AVG(turns), 0) / 30, 1) AS length,
    COALESCE(SUM(ARRAY_SIZE(cheats_caught)) /
      NULLIF(SUM(ARRAY_SIZE(cheats_caught)) + SUM(ARRAY_SIZE(cheats_used)), 0), 0) AS catch_rate
  FROM GAME_LOGS
  WHERE match_id NOT LIKE 'test-%' AND player_name IS NOT NULL
  GROUP BY player_name
),
v AS (
  SELECT player_name,
         ARRAY_CONSTRUCT(corner, center, winrate, powerups, length, catch_rate)::VECTOR(FLOAT, 6) AS style
  FROM s
)
SELECT b.player_name AS twin, ROUND(100 * VECTOR_COSINE_SIMILARITY(a.style, b.style)) AS similarity
FROM v a JOIN v b ON a.player_name = ? AND b.player_name <> a.player_name
ORDER BY similarity DESC
LIMIT 1;
```
- Add `twin: { name, similarity }` (or `null` if the player has no games yet or nobody else exists) to the stats response. Run the query in parallel with the others.
- If the cast to VECTOR fails for any reason, compute the cosine similarity in JavaScript from the same 6 numbers instead (fallback), and log it.

**In the game:**
- Match-start taunt (when a twin exists): `"Your play style is {similarity}% identical to {twin}. {twin} lost too."` (use "won once. Lucky." if the twin has wins).
- End screen: a `TWIN.DAT` pixel window: `YOUR EVIL TWIN: {twin} ({similarity}% match)` with two tiny pixel figures side by side.
- Players with no history: `"No data on you yet, human. I'm watching."`

## 3. Debug and check
- Debug panel: "Show tactics" (prints the tactics JSON), "Show twin".
- Seed a few fake matches with `match_id` starting `test-` to test, then delete them.
- `npm run build` passes, balance test still inside targets. Commit and push, then tell me how to verify in Snowflake.
