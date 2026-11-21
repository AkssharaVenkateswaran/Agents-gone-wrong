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
  board.js         // grid model (grows up to 9x9), lines of any length/direction, minimax for classic 3x3
  rules.js         // the rule categories (win, place, twist), legal moves, placing marks, win checks
  ai.js            // Otto's moves under the current rules (heuristic) and how it picks new rules
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

### Match structure: one long, evolving round
- The whole match is **one long round** on a board that starts at 3×3. The first player to meet the **current** win condition wins the match.
- It opens as classic tic-tac-toe: Otto plays perfect minimax and plays fair. Just before the first rule change Otto realises *"Wait... this game is SOLVED. Nobody can win. Ugh. Boring. New rules."* — from then on it also cheats and rewrites the rules.
- The board can grow up to **9×9**; new squares pop in. If the board fills up, Otto is forced to add a row or column.
- **FINAL RULE:** when the board reaches 9×9, or after **30 player turns**, the match ends with *"FINAL RULE: most lines of 3 wins"*: every line of 3 in any direction is counted (overlapping lines count too) and the higher count wins (equal = draw).
- The top bar shows the session score: matches won by you vs Otto since the page loaded.

### Pacing (the player always gets a fair chance)
- Otto waits 400ms after the player's move, then "thinks" for 1.2–1.8 seconds (random) before every move: its eyes look around, three dots hop in its bubble, and the turn indicator says `> OTTO IS THINKING...`. On the player's turn it says `> YOUR TURN_`.
- Otto has a **Frustration meter** (0–100), shown as `OTTO'S PATIENCE` (100 − frustration). It rises as the game drags on, when the player blocks Otto, catches or counters a cheat, or vetoes a rule. Higher frustration = more frequent and nastier cheats.
- Otto can cheat **at most once per turn**. Each cheat has a **cooldown** (a few turns). It never cheats before the first rule change.
- **Telegraph every cheat:** ~1 second before a cheat, Otto's screen flickers `>:)` and it says "hehe…" in its bubble. If the player clicks Otto (or presses C) during this window they **Catch** the cheat: it's blocked, they get bonus points, and a small `CAUGHT!` pixel window pops up with a stamp effect.

### Rules (Otto keeps rewriting them)
Rules come in 3 categories, shown as 3 fixed rows in `RULES.TXT`. Only **one rule per category** is active at a time:
| Category | Default | Other rules |
|---|---|---|
| **WIN** (how to win) | 3 in a row | 4 in a row → 5 in a row (one step at a time, never jumping by 2); "Diagonals don't count"; "Only diagonals count" (both keep the current length) |
| **PLACE** (where you can play) | Place anywhere | "Gravity" (marks fall to the bottom of their column); "Corners are lava" (corners can't be used); "Must touch" (new marks must touch an existing mark, diagonals included) |
| **TWIST** (a temporary effect) | None | "Fading ink" (marks older than 6 turns disappear); "Mirror" (every move is copied left ↔ right if that square is empty); "10-second timer" (the player loses the turn if time runs out; a pixel ring empties); "Reverse day" (making a line LOSES; lasts 3 turns, shown as pips) |

- The board is always at least (win length + 1) squares wide and tall; it grows automatically when needed.
- **When:** the first change comes after the player's 5th turn, then every 6 turns, and never more than one change per 5 player turns. `RULES.TXT` shows a countdown ("NEW RULE IN 3 TURNS"), and Otto warns one turn before (*"I've been reading the rules... I don't like them."*).
- **Only at the start of the player's turn**, after Otto has moved, so the player always makes the first move under every new rule.
- **How Otto picks:** it draws 3 random rules and keeps the one that helps it most (it tries each on a copy of the board).
- **Never sudden:** while a rule changes, inputs are locked. The board dims and a `NEW_RULE.EXE` window pops up (2 copies stacking behind it) with the rule's icon, a short title (max 4 words), a one-line explanation, a tiny diagram and the old rule crossed out. `[ OK ]` continues, or it continues by itself after 4 seconds. The window then minimises into its row in `RULES.TXT`, which blinks twice; the affected squares are highlighted on the board for 2 seconds; then it's the player's turn.
- **Never an instant win:** a line only counts if at least one of its marks was placed after the last rule change, so a new rule (or a Veto) can't turn a line that's already on the board into a win.
- **Grace turn:** Otto's first move after a rule change can't win, and it can't cheat on that turn.
- Rule history sits in a collapsed "HISTORY (n)" list in `RULES.TXT`.
- Otto has a line for every rule ("5 in a row now. Good luck.", "Gravity's on. Everything falls. Like your chances.") and for being vetoed or amended.

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

Power-ups are pixel floppy disks in the `TOOLBOX.EXE` window on the left, each with its name on the label and its cost as a pixel number. Unaffordable or currently useless power-ups are greyed out.

### Earning points
- Start each match with 3 points
- +1 for each X placed
- +3 for blocking a row where Otto had two in a row
- +2 for countering a cheat within 2 turns of it happening
- +4 for catching a cheat during its telegraph window
- +5 for winning the match
- +3 extra for winning or blocking within 2 turns of a rule change

Show point gains as small "+3" pixel pops that float up and fade.

### Win detection
Must work on **any grid size** (up to 9×9) and for the **current** win rule: any line length (3–5) and only the allowed directions (all, across/down only, or diagonals only). Squares covered by minions can't be clicked and don't count toward anyone's line. A line only counts if it includes a mark placed since the last rule change. On Reverse day, whoever makes a line loses. Minimax is only used for the classic 3×3 game with the default rules; everywhere else Otto uses a heuristic that follows the current rules: win if possible → block if needed → extend its longest open line.

### Ending
- **Player wins the match:** Otto has a meltdown (*"It's SOLVED. It was always solved. Why do I even—"*), its monitor shows a pixel "crash" screen, the table flips (the big CRT monitor flies off the desk), and a full-screen `YOU WIN!` pixel banner appears with pixel confetti.
- **Otto wins:** Otto gloats, then admits *"...I cheated, obviously."* A full-screen `OTTO WINS` pixel banner appears, with Otto's monitor showing a smug face.
- Either way, show a **Play Again** button.

### Otto's personality
Smug, petty, theatrical and funny — never cruel. Speaks in yellow pixel speech bubbles (at most 2 lines). Write at least 5 lines per situation in `dialogue.js`: match start, getting bored, telegraphing a cheat, cheat succeeds, cheat countered, cheat caught, player blocks it, Otto wins, draw, rising frustration, meltdown, rule warning, each new rule, vetoed, amended, Reverse day ending, out of room, final rule. All dialogue is scripted (no API calls) so it works offline and is reliable for demos.

## Screens
1. **Title screen:** a `LOGIN.EXE` window with "AGENTS GONE WRONG" in Press Start 2P (lime with a pink pixel shadow), Otto's pixel CRT, a name input, a chunky `PLAY` button, and the one-line premise: *"Tic-tac-toe is solved. The agent didn't like that."*
2. **Game screen:**
   - Top bar: the title, the session score (You vs Otto), a Snowflake status floppy disk and a mute button
   - Left: `TOOLBOX.EXE` (points and the power-up floppy disks)
   - Centre: the turn indicator, then the board inside a big pixel CRT monitor (win banner on its screen), then one message line
   - Right: Otto on a small pixel CRT with its speech bubble and patience bar, then `RULES.TXT`
3. **End screen:** a full-screen pixel result banner (`RESULT.EXE`), the Humans vs Otto leaderboard, and a `PLAY AGAIN` button.

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
1. **Playable core:** 3×3 board, player vs Otto (minimax), win/draw detection and match flow. Plain styling is fine.
2. **Cheats:** cheat system with telegraph, catch, cooldowns and the Frustration meter; implement all 6 cheats.
3. **Power-ups & points:** scoring, the toolbox, all 8 power-ups, and win detection on a grown grid.
4. **Art pass:** apply the retro pixel-art direction to every element, including Otto's expressions, speech bubbles, OS windows and pop-ups.
5. **Juice & ending:** sound effects, animations, the crash-and-table-flip meltdown, end screen, title screen.

Keep the code simple and well-commented — the team is first-year students who need to understand and present it.

Related spec files in this repo (implement only when asked): `COMMENTARY.md` (Otto's live commentary system) and `SNOWFLAKE.md` (Otto's memory stored in Snowflake).
