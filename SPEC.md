# Build: "Agents Gone Wrong" — a browser game where you play tic-tac-toe against a cheating AI agent

## Concept
Tic-tac-toe is a solved game: with perfect play, every game is a draw. The opponent, an AI agent called **Otto** (plays O), knows this. Otto gets bored, then desperate, and starts **breaking the rules** to win — turning off the lights, drawing extra lines, throwing its minion agents onto squares, and more. The player (X) earns **points** during play and spends them on **power-ups** to counter Otto's cheats and fight back. Since fair play always ends in a draw, power-ups are the player's only real path to victory.

## Tech
- Vite + vanilla JavaScript (ES modules), HTML, CSS. No frontend framework, no game engine.
- **All art is pixel sprites drawn in code** (see Art direction) — no external image files.
- Google Fonts: **"Press Start 2P"** (title, score, headings, buttons) and **"VT323"** (all other text).
- Optional sound effects using the Web Audio API (simple synthesised retro square-wave beeps) — no audio files. A mute button sits in the top bar.
- Must run with `npm install && npm run dev`, and build to static files with `npm run build`.

Suggested structure:
```
src/
  main.js          // boots the game, wires modules together
  state.js         // single game state object + simple event emitter (on/emit)
  board.js         // grid model (grows up to 9x9), lines of any length/direction
  rules.js         // the rule categories (win, place, twist), legal moves, placing marks, win checks
  ai.js            // Otto's moves under the current rules (heuristic + mistakes by patience) and how it picks new rules
  agent.js         // Otto's brain: chooses between a normal move and a cheat, tracks frustration
  cheats.js        // each cheat: { id, name, cooldown, canUse(state), apply(state), undo(state) }
  powerups.js      // each power-up: { id, name, cost, canUse(state), apply(state) }
  scoring.js       // point rules
  dialogue.js      // Otto's lines, grouped by situation (plus rule lines and stat-based taunts)
  memory.js        // talks to /api/stats and /api/match (Otto's memory in Snowflake, see SNOWFLAKE.md)
  matchLog.js      // what a finished match records; shared with the API's input validation
  sfx.js           // synthesised retro beeps
  ui/
    render.js      // renders the top bar, TOOLBOX.EXE, the CRT monitor and board, Otto and RULES.TXT from state
    sprites.js     // pixel sprites as string arrays (X, O, Otto's CRT and faces, minion robot, floppy disks, rule icons...)
    effects.js     // pop-up alerts (CAUGHT!), point pops, board spin, lights-out effects
  styles.css
```

## Game rules

### Match structure: drain Otto's patience over several rounds
- **Otto's Patience** starts at **100** and is the main goal: the player wins the match by draining it to **0**.
- A match is made of **rounds**. After each round the board resets; patience, points and power-ups carry over.
- Patience changes **only** on round results: Otto **loses** a round **−35**, Otto **wins** a round **+10** (never above 100), draw: no change. Catching or countering cheats and blocking lines do NOT change patience (they still give points and trigger Otto's reactions).
- So the player needs **3 round wins** if Otto never wins a round, or **4** if Otto wins one or more after the player has started draining him.
- **Otto wins the match** if he wins **3 rounds** before his patience runs out.
- **Round 1** (the tutorial round) starts on a **4×4** board with **WIN: 4 IN A ROW**; **rounds 2+** start on **5×5** with 4 in a row. In round 1, when Otto is one move from winning, the threatened square pulses gently and Otto says `> threat: you're about to lose, human`.
- Otto plays fair until the first rule change of each round and **can't win before it**.
- The board can grow up to **7×7**; new squares pop in. If the board fills up, Otto is forced to add a row or column (at a full 7×7: sudden death).
- **SUDDEN DEATH:** after **20 player turns** in a round, `SUDDEN DEATH: MOST LINES OF 3 WINS`: every line of 3 in any direction is counted (overlapping lines count too) and the higher count wins the round (equal = draw).
- Between rounds a `ROUND_END.EXE` pop-up shows the result and the patience change, with `[ NEXT ROUND ]` (continues by itself after 6 seconds).
- HUD: `ROUND 2 · YOU 1 – 0 OTTO`. Otto's patience bar shows a stage label (see "Otto falls apart").

### Pacing (the player always gets a fair chance)
- Otto waits 400ms after the player's move, then "thinks" for 1.2–1.8 seconds (random) before every move: its eyes look around, three dots hop in its bubble, and the turn indicator says `> OTTO IS THINKING...`. On the player's turn it says `> YOUR TURN_`.
- **Otto makes mistakes**, fewer as it gets angrier (lower patience). On each normal move it takes its own winning move, blocks the player's winning threat, and otherwise plays its best square (else a random square next to existing marks) with these chances, on every board size and rule (`npm run balance` reports how the test bot does):
  | Patience | Takes its win | Blocks the player | Plays its best square |
  |---|---|---|---|
  | 100–76 | 74% | 60% | 64% |
  | 75–51 | 84% | 72% | 77% |
  | 50–26 | 92% | 82% | 86% |
  | 25–0 | 100% | 90% | 92% |
- Otto's "best square" looks one move ahead and avoids squares that let the player set up two threats at once.
- **Cheats are rare and never decide a round:** at most 1 cheat attempt every 3 Otto turns, none in Otto's first 2 turns of a round, none before the round's first rule change. The chance of a cheat grows from 20% (patience 100) to 80% (patience 0). Each cheat is first tried on a copy of the game and skipped if it would complete a winning line for Otto or remove the player's only winning move.
- Each cheat also has a **cooldown** (a few turns).
- **Telegraph every cheat:** ~1 second before a cheat, Otto's screen flickers `>:)` and it says "hehe…" in its bubble. If the player clicks Otto (or presses C) during this window they **Catch** the cheat: it's blocked, they get bonus points, and a small `CAUGHT!` pixel window pops up with a stamp effect.

### Rules (Otto keeps rewriting them)
Rules come in 3 categories, shown as 3 fixed rows in `RULES.TXT`. Only **one rule per category** is active at a time:
| Category | Start of each round | Other rules |
|---|---|---|
| **WIN** (how to win) | 4 in a row | 5 in a row ↔ 4 in a row; "Diagonals don't count"; "Only diagonals count" (both keep the current length) |
| **PLACE** (where you can play) | Place anywhere | "Gravity" (marks fall to the bottom of their column); "Corners are lava" (corners can't be used); "Must touch" (new marks must touch an existing mark, diagonals included) |
| **TWIST** (a temporary effect) | None | "Fading ink" (marks older than 6 turns disappear); "Mirror" (every move is copied left ↔ right if that square is empty); "10-second timer" (the player loses the turn if time runs out; a pixel ring empties); "Reverse day" (making a line LOSES; lasts 3 turns, shown as pips) |

- After a rule change the board is always at least (win length + 1) squares wide and tall (up to 7×7); it grows automatically when needed. (Round 1's 4×4 start is the one exception.)
- **When:** every **3 player turns**; the first change of each round happens at the start of the player's 3rd turn. `RULES.TXT` shows a countdown ("NEW RULE IN 2 TURNS"), and Otto warns one turn before (*"I've been reading the rules... I don't like them."*).
- **Only at the start of the player's turn**, after Otto has moved, so the player always makes the first move under every new rule.
- **No instant wins or losses (hard rule):** before a rule is used it is tried on a copy of the game; if under the new rule **either** player would have a move that wins immediately, the rule is rejected. Otto draws 3 random rules from the safe ones and keeps the one that helps it most. If no rule is safe, the change is postponed by one turn (`NEW RULE DELAYED`). Reverse day only runs out when that is safe too. `npm run fairness` (`scripts/fairness-test.mjs`) runs 500 random rule changes on random mid-game boards and checks this.
- **Never sudden:** while a rule changes, inputs are locked. The board dims and a `NEW_RULE.EXE` window pops up (2 copies stacking behind it) with the rule's icon, a short title (max 4 words), a one-line explanation, a tiny diagram and the old rule crossed out. `[ OK ]` continues, or it continues by itself after 4 seconds. The window then minimises into its row in `RULES.TXT`, which blinks twice; the affected squares are highlighted on the board for 2 seconds; then it's the player's turn.
- A line only counts if at least one of its marks was placed after the last rule change.
- **Grace turn:** Otto's first move after a rule change can't win, and it can't cheat on that turn.
- Rule history sits in a collapsed "HISTORY (n)" list in `RULES.TXT`.
- Otto has a line for every rule ("5 in a row now. Good luck.", "Gravity's on. Everything falls. Like your chances.") and for being vetoed or amended.

### Otto falls apart (driven only by patience)
| Stage | Patience | Label | What changes |
|---|---|---|---|
| 0 Calm | 100–76 | `FINE` | nothing |
| 1 Irritated | 75–51 | `IRRITATED` | the CRT monitor nudges 1–2° and settles on each Otto turn; soft static drifts across the screen every ~10 s; new lines jitter in the bubble; sound effects detune slightly |
| 2 Unhinged | 50–26 | `UNHINGED` | the monitor tilts 3–5° and wobbles gently; the first crack on the CRT glass (semi-transparent, never hides marks); the title glitches letters (`AGENTS GONE WR0NG`); windows shift a few pixels and their title bars turn reddish; occasional fake `OTTO.EXE is not responding [WAIT] [WAIT]` pop-ups in empty space (max 1, never over the board); Otto sometimes SHOUTS; floppies drift faster; the background warms towards purple-red |
| 3 Meltdown | 25–1 | `CRITICAL` | more cracks (3), the monitor tilts 6–8° and shudders on Otto's turn; screen tearing (bands of the board slide sideways for ~300 ms on Otto's move); RGB-split headings; sparks around Otto; scribbles on the Rule Book; pop-ups stack (max 2); a quiet low buzz; desperate lines |
- Changes are gradual within each stage, and each stage is announced once with a line from Otto.
- **Safety:** nothing flashes faster than 2 times per second, no full-screen flashes, and marks, grid lines and the turn indicator stay clear at every stage. With `prefers-reduced-motion`: no wobble, shudder or tearing; the stage shows as static tilt, cracks, colour changes and text glitches only.
- **Calm mode:** a small moon toggle next to the mute button turns the chaos effects off (remembered in the browser).

### Otto's cheats (each has a counter)
| Cheat | What happens | Countered by |
|---|---|---|
| **Lights Out** | The room goes dark except for the CRT monitor's glow; the player only sees a hard-edged pixel torch circle around the cursor | **Light Switch** |
| **Extra Line** | Otto scribbles a new row or column onto the grid and instantly puts an O in it | **Eraser** (removes Otto's added line and its marks) |
| **Minion Drop** | Otto throws 1–2 tiny pixel minion robots onto empty squares, which become unclickable | **Flick** (click a minion to flick it off the board) |
| **Mark Steal** | Otto repaints one of the player's X marks into an O | **Glue Stick** (undo the steal, and that mark is protected forever) |
| **Double Move** | Otto places two O marks in one turn | **Time Out** (Otto skips its next turn) |
| **Board Spin** | The board rotates 90° | **Paperweight** (undo the spin, and blocks spins for 3 turns) |
| **Rewrite the Rules** | When frustrated, Otto brings the next rule change forward to the start of the player's next turn (never sooner than 5 turns after the last change) | **Veto** (cross out the new rule) |

Lights Out lasts until countered or 3 player turns pass. It must be a smooth fade — no flashing.

### Player power-ups (spent with points)
| Power-up | Cost | Effect |
|---|---|---|
| Flick | 2 | Removes one minion blocker |
| Light Switch | 3 | Turns the lights back on |
| Eraser | 3 | Removes a line Otto added (and its marks) |
| Paperweight | 3 | Undoes a Board Spin and blocks spins for 3 turns |
| Glue Stick | 4 | Undoes a Mark Steal; that mark is protected forever |
| Time Out | 5 | Otto skips its next turn |
| **My Own Line** | 5 | The player draws their own extra row or column and places a free X in it |
| **Double Mark** | 6 | The player places two X marks this turn |
| **Veto** | 5 | Cross out the newest rule and bring back the one it replaced |
| **Amendment** | 6 | At the next rule change, the player picks the new rule from 3 cards instead of Otto |

Keyboard shortcuts: 1–9 and 0 for the 10 power-ups.

Power-ups are pixel floppy disks in the `TOOLBOX.EXE` window on the left, each in its own palette colour, with its full name on the label (up to 2 lines, never cut off) and its cost as a pixel number. Keyboard shortcuts are in the tooltip. A disk is greyed out only when it's unaffordable or would do nothing right now (the tooltip says which). The disks are as big as the window allows.

### Earning points
- Start each match with 6 points
- +2 for each X placed
- +3 for blocking a row where Otto had two in a row
- +2 for countering a cheat within 2 turns of it happening
- +4 for catching a cheat during its telegraph window
- +5 for winning a round
- +3 extra for winning or blocking within 2 turns of a rule change

Show point gains as small "+3" pixel pops that float up and fade.

### Win detection
Must work on **any grid size** (up to 7×7) and for the **current** win rule: any line length (4–5; lines of 3 for sudden death) and only the allowed directions (all, across/down only, or diagonals only). Squares covered by minions can't be clicked and don't count toward anyone's line. A line only counts if it includes a mark placed since the last rule change. On Reverse day, whoever makes a line loses. Otto uses one heuristic everywhere, following the current rules (with the mistake chances above): win if possible → block if needed → its best square.

### Ending
- **The rampage (patience reaches 0, the player wins):** the match is saved to Snowflake first, inputs are locked, and it plays for about 12–15 seconds (skippable with `[SKIP]`): Otto's monitor turns red with `PATIENCE.SYS NOT FOUND`; Otto: `FINE. FINE! YOU WANT TO WIN? HAVE YOUR STUPID GAME.`; the floppy disks fly out of `TOOLBOX.EXE`, `RULES.TXT` is scribbled out and slides off, `OTTO.EXE HAS STOPPED CARING` pop-ups multiply and the HUD letters fall; the CRT glass shatters into pixel shards; a crash screen `FATAL ERROR: OTTO HAS LEFT THE GAME` with fake log lines; Otto: `I'm closing this. Goodbye, human.` Then it calls `window.close()`. Browsers usually block that, so if the page is still there after 300 ms: the screen collapses into a line and a dot like an old CRT turning off, the tab title becomes `Otto has left` with a black-square favicon, and after 3 seconds of black: `Otto closed the game. You drained his patience in {rounds} rounds.` with `[REBOOT OTTO]` and the Humans vs Otto leaderboard.
- **Otto wins (3 rounds first):** a smug `OTTO WINS` pixel banner, Otto says `...I cheated, obviously.`, then the leaderboard and `[PLAY AGAIN]`. No rampage.
- **Otto's memory (Snowflake):** one row per **match** (not per round), with `turns` = total player turns across all rounds, `final_grid` = the last board size (e.g. `6x6`), and winner `'player'` (patience drained) or `'otto'` (3 rounds won).

### Otto's personality
Smug, petty, theatrical and funny — never cruel. Speaks in yellow pixel speech bubbles (at most 2 lines). Write at least 5 lines per situation in `dialogue.js`: match start, getting bored, telegraphing a cheat, cheat succeeds, cheat countered, cheat caught, player blocks it, Otto wins a round, Otto loses a round, draw, round start, each stage (announced once), desperate lines, rule warning, each new rule, vetoed, amended, Reverse day ending, out of room, sudden death, and the rampage lines. All dialogue is scripted (no API calls) so it works offline and is reliable for demos.

## Screens
1. **Title screen:** a `LOGIN.EXE` window with "AGENTS GONE WRONG" in Press Start 2P (lime with a pink pixel shadow), Otto's pixel CRT, a name input, a chunky `PLAY` button, and the one-line premise: *"Tic-tac-toe is solved. The agent didn't like that."*
2. **Game screen:**
   - Top bar: the title, `ROUND n · YOU a – b OTTO`, a Snowflake status floppy disk, the Calm mode toggle and a mute button
   - Left: `TOOLBOX.EXE` (points and the power-up floppy disks)
   - Centre: the turn indicator, then the board inside a big pixel CRT monitor (win banner on its screen), then one message line
   - Right: Otto on a small pixel CRT with its speech bubble and patience bar, then `RULES.TXT`
3. **End screens:** the rampage (player wins) or the `OTTO WINS` banner (`RESULT.EXE`), each with the Humans vs Otto leaderboard and a way to play again.

## Art direction: retro pixel art
**Mood:** a cosy 90s computer desk at night: chunky CRT monitors, floppy disks, old operating-system windows, pixel cursors and neon accents. Bright, playful and readable, not dark and gloomy.

**Palette** (use only these):
- Background: deep indigo `#2B1B5A`, with a purple wall `#6B5BA8` and navy `#1B2A6B` for areas
- Outlines: `#140A2E`, used for all pixel outlines
- CRT screen: `#0E1A2B`, phosphor glow text `#C9F6A7`
- Monitor plastic: `#C8C2E8`, shade `#8E86C4`
- Accents: neon pink `#FF4F9A`, lime `#9BE564`, sunny yellow `#FFE45C`, sky cyan `#5CD6FF`, cream `#F4EBD0`
- Player X = lime `#9BE564`. Otto's O = neon pink `#FF4F9A`.

**Pixel rules:**
- All art is pixel sprites drawn on small grids (16×16 or 32×32), defined in code as arrays of strings (e.g. `"..##..##.."`) with a palette map, rendered as SVG `<rect>`s with `shape-rendering="crispEdges"` (or to a canvas), and scaled up by whole numbers only (×3, ×4). Add `image-rendering: pixelated` everywhere.
- Every sprite has a 1-pixel dark outline and one darker shade on its bottom and right side.
- Shadows are hard pixel offsets (e.g. `6px 6px 0 #140A2E`), never blurred. The only soft effect allowed is a subtle glow on CRT screen text.
- Corners are stepped pixel corners (using `clip-path` or pixel border sprites), not smooth rounded corners.
- Use a 2×2 checkerboard dither pattern (a data-URI background) for shading large areas.

**Fonts** (Google Fonts):
- "Press Start 2P": title, score, headings and buttons only. Keep it small (12–20px) because it's very wide.
- "VT323": all other text (18–26px, so it stays readable).

**Retro UI kit:**
- Panels are old operating-system windows: a navy title bar `#1B2A6B` with a pixel title (e.g. `RULES.TXT`, `TOOLBOX.EXE`), little `_ □ ×` buttons (decorative), a cream or white body, a chunky 3px pixel outline and a hard shadow.
- Buttons are chunky pixel buttons that visibly press down 3px when clicked.
- The cursor is a custom pixel hand cursor (a data-URI SVG), and a pixel pointing hand when hovering over clickable things.
- Speech bubbles are pixel bubbles in sunny yellow with an indigo outline and a stepped tail.

**Background:** a purple or indigo wall with a few slowly drifting pixel floppy disks and binary digits (`0 1`) in lime, low opacity. A desk strip runs along the bottom. Turn the drifting off when `prefers-reduced-motion` is set.

## Accessibility
- Board is keyboard-playable (arrow keys + Enter; number keys 1–8 for power-ups).
- No flashing or strobing effects.
- All pixel buttons and floppy disks have `aria-label`s.
- Text keeps good contrast (VT323 at 18–26px; Press Start 2P only for short titles, score, headings and buttons). No flashing faster than 2 times per second.

## Build in milestones
After each milestone, make sure `npm run dev` runs without errors and summarise what changed before moving on.
1. **Playable core:** 3×3 board, player vs Otto, win/draw detection and match flow. Plain styling is fine.
2. **Cheats:** cheat system with telegraph, catch, cooldowns and the Frustration meter; implement all 6 cheats.
3. **Power-ups & points:** scoring, the toolbox, all 8 power-ups, and win detection on a grown grid.
4. **Art pass:** apply the retro pixel-art direction to every element, including Otto's expressions, speech bubbles, OS windows and pop-ups.
5. **Juice & ending:** sound effects, animations, the crash-and-table-flip meltdown, end screen, title screen.

Keep the code simple and well-commented — the team is first-year students who need to understand and present it.

Related spec files in this repo (implement only when asked): `COMMENTARY.md` (Otto's live commentary system) and `SNOWFLAKE.md` (Otto's memory stored in Snowflake).
