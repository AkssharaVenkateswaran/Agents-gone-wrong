# Implement: HACK.EXE — the player rewrites Otto's code, Otto notices and fights back

The player can open a code editor and change Otto's behaviour settings. The change really takes effect, but Otto detects the tampering, gets angry, and visibly changes it back. Hacking is a risky tactic: it can help you, and it drains Otto's patience, but Otto retaliates.

Keep everything else exactly as it is (balance, patience rules, fairness rules, emotions, music, Otto's cursor, minions, glitches, Snowflake). Pixel-art retro style.

## 1. The editor window: `HACK.EXE`
- Open it from a new floppy in TOOLBOX.EXE called **HACK** (cost 3 points, uses your turn like every power-up) or the keyboard shortcut `H`. It opens as a retro window over the left column (never over the board).
- It shows Otto's config file `otto.cfg` as editable code (VT323 font, line numbers, dark screen, lime text, blinking cursor):
  ```
  // otto.cfg — Otto's behaviour. Edit at your own risk.
  otto.cheatChance   = 0.30   // 0 to 1
  otto.blockChance   = 0.60   // 0 to 1
  otto.takeWinChance = 0.75   // 0 to 1
  otto.thinkTime     = 1.5    // seconds, 0.5 to 4
  otto.rulesLocked   = false  // true = Otto can't change rules
  otto.mood          = "smug" // smug | bored | happy | defeated
  otto.taunts        = true   // false = Otto stays quiet
  ```
  The values shown are Otto's real current values.
- Buttons: `[RUN]` and `[CANCEL]`.

## 2. Safety: NEVER run the player's text as JavaScript
- Parse only lines of the form `otto.<setting> = <value>` (comments with `//` allowed). Only the settings above are allowed.
- Numbers are clamped to their ranges; booleans and the mood list are validated.
- Anything else shows a friendly pixel error line in the editor (`line 3: otto doesn't know "fly"`) and nothing runs. No `eval`, no `Function`, no `innerHTML` with the player's text (escape everything).

## 3. What happens when the player runs a hack
1. **It works (for a while):** the new values apply immediately to Otto's real behaviour (cheat frequency, blocking, taking wins, think time, rule changes, mood face, taunts). Otto's terminal shows `> config reloaded.` and Otto looks briefly confused (thinking face).
2. **Otto senses it:** after **2 Otto turns** (sooner — 1 turn — at patience below 50), the terminal shows:
   ```
   OTTO@AGENT:~$ integrity.check otto.cfg
   > TAMPERING DETECTED. who touched my code??
   ```
   Otto switches to the **furious** face and colour for a few seconds.
3. **Otto changes it back, visibly:** Otto's pink cursor flies to HACK.EXE (re-opening it if closed), selects each line you changed, deletes it and types his original value back letter by letter (fast), then clicks `[RUN]`. Terminal: `> restored. nice try, human.` Then he adds a comment line at the top of the file, e.g. `// DO NOT TOUCH. — Otto` (the file keeps it for the rest of the match).
4. **Consequences:**
   - Every hack drains **−8 patience** when Otto detects it (hacks are rude) — but never below 5 before the end of round 3 (same rule as the rest of the game).
   - Otto **retaliates** with one cheat on his next turn (ignores the normal cheat cooldown, still obeys the fairness rules: no instant wins).
   - The second hack in the same round gets detected immediately (0 turns) and Otto locks the editor for the rest of the round (`ACCESS DENIED` window).
5. Special reactions:
   - `otto.taunts = false` → Otto mutters `...` in his window until he restores it, then: `I WILL NOT BE SILENCED.`
   - `otto.rulesLocked = true` → `RULES.TXT` gets a padlock icon until restored.
   - `otto.mood = "happy"` → he looks happy for a moment, then his face glitches back to furious: `don't tell me how to feel.`

## 4. Debug and checks
- Debug buttons: "Open HACK.EXE", "Simulate hack (cheatChance = 0)", "Force detection now".
- The balance test is unaffected when the bot never hacks. Add a quick test that a hack is detected and restored within the right number of turns, and that invalid input never runs.
- `npm run build` passes at 1440×900 and 1280×720 with no scrolling. Commit and push.
