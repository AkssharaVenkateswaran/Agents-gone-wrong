# Build: "Agents Gone Wrong" — a browser game where you play tic-tac-toe against a cheating AI agent

## Concept
Tic-tac-toe is a solved game: with perfect play, every game is a draw. The opponent, an AI agent called **Otto** (plays O), knows this. Otto gets bored, then desperate, and starts **breaking the rules** to win — turning off the lights, drawing extra lines, throwing its minion agents onto squares, and more. The player (X) earns **points** during play and spends them on **power-ups** to counter Otto's cheats and fight back. Since fair play always ends in a draw, power-ups are the player's only real path to victory.

## Tech
- Vite + vanilla JavaScript (ES modules), HTML, CSS. No frontend framework, no game engine.
- **All art is inline SVG drawn in code** — no external image files.
- Google Fonts: **"Permanent Marker"** (headings, buttons) and **"Nunito"** (body text).
- Optional sound effects using the Web Audio API (simple synthesised pops, scribbles, stamps) — no audio files.
- Must run with `npm install && npm run dev`, and build to static files with `npm run build`.

Suggested structure:
```
src/
  main.js          // boots the game, wires modules together
  state.js         // single game state object + simple event emitter (on/emit)
  board.js         // grid model, win detection (any grid size), minimax
  agent.js         // Otto's brain: chooses between a normal move and a cheat
  cheats.js        // each cheat: { id, name, cooldown, canUse(state), telegraph(), apply(state), undo(state) }
  powerups.js      // each power-up: { id, name, cost, canUse(state), apply(state) }
  scoring.js       // point rules
  dialogue.js      // Otto's lines, grouped by situation
  ui/
    render.js      // renders board, HUD, tray, speech bubbles from state
    stickers.js    // SVG sticker components (X, O, Otto, minion agent, lightbulb, eraser, glue...)
    effects.js     // stamp, peel, wobble, flick, table-flip, lights-out effects
  styles.css
```

## Game rules

### Match structure
- A match is **first to 3 round wins**. Draws give no round win.
- **Round 1:** Otto plays fairly but imperfectly (40% random moves), so the player learns the basics. After round 1 Otto says something like *"Wait... this game is SOLVED. Nobody can win. Ugh. Boring. New rules."*
- **Round 2 onward:** Otto plays perfect minimax AND cheats. Otto has a **Frustration meter** (0–100, shown in the HUD) that rises whenever a game heads toward a draw or the player counters a cheat. Higher frustration = more frequent and more chaotic cheats.
- Otto can cheat **at most once per turn**. Each cheat has a **cooldown** (a few turns).
- **Telegraph every cheat:** ~1 second before a cheat, Otto wobbles on screen with a "hehe…" bubble. If the player clicks Otto during this window they **Catch** the cheat: it's blocked, they get bonus points, and a "CAUGHT!" rubber stamp appears.

### Otto's cheats (each has a counter)
| Cheat | What happens | Countered by |
|---|---|---|
| **Lights Out** | The page fades dark; the player only sees a small torch circle around the cursor | **Light Switch** |
| **Extra Line** | Otto scribbles a new row or column onto the grid and instantly puts an O in it | **Eraser** (removes Otto's added line and its marks) |
| **Minion Drop** | Otto throws 1–2 tiny minion-agent stickers onto empty squares, which become unclickable | **Flick** (click a minion to flick it off the board) |
| **Mark Steal** | Otto repaints one of the player's X marks into an O | **Glue Stick** (undo the steal, and that mark is protected forever) |
| **Double Move** | Otto places two O marks in one turn | **Time Out** (Otto skips its next turn) |
| **Board Spin** | The board rotates 90° | **Paperweight** (undo the spin, and blocks spins for 3 turns) |

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

Power-ups sit in a tray of sticker buttons at the bottom of the screen, each showing its cost. Unaffordable or currently useless power-ups look faded and half-peeled.

### Earning points
- Start each match with 3 points
- +1 for each X placed
- +3 for blocking a row where Otto had two in a row
- +2 for countering a cheat within 2 turns of it happening
- +4 for catching a cheat during its telegraph window
- +5 for winning a round

Show point gains as small "+3" sticker pops that float up and fade.

### Win detection
Must work on **any grid size** (the grid can grow via Extra Line and My Own Line). A win is **3 in a row** horizontally, vertically or diagonally anywhere on the grid. Squares covered by minions can't be clicked and don't count toward anyone's line. Minimax only needs to handle the standard 3×3 grid; on a larger grid, Otto uses a simple heuristic: win if possible → block if needed → take the best open square.

### Ending
- **Player wins the match:** Otto has a meltdown (*"It's SOLVED. It was always solved. Why do I even—"*), flips the table (board and stickers fly off with a paper-crumple animation), and a big "YOU WIN" rubber stamp slams down.
- **Otto wins:** Otto gloats, then admits *"...I cheated, obviously."* with a "CHEATER WINS" stamp.
- Either way, show a **Play Again** button.

### Otto's personality
Smug, petty, theatrical and funny — never cruel. Speaks in sticker speech bubbles. Write at least 5 lines per situation in `dialogue.js`: match start, getting bored, telegraphing a cheat, cheat succeeds, cheat countered, cheat caught, player blocks it, round won, round lost, draw, rising frustration, meltdown. All dialogue is scripted (no API calls) so it works offline and is reliable for demos.

## Screens
1. **Title screen:** "Agents Gone Wrong" title in marker font on washi tape, Otto sticker waving, "Play" button, one-line premise: *"Tic-tac-toe is solved. The agent didn't like that."*
2. **Game screen:**
   - Top HUD: round score (You vs Otto), points counter, Otto's Frustration meter
   - Centre: the board, with Otto's sticker and speech bubble beside it
   - Bottom: the power-up tray
3. **End screen:** stamp, a summary (cheats caught, power-ups used, points earned), Play Again.

## Art direction (follow exactly)
Hand-drawn **"sticker scrapbook"** style:
- Every object is a **chunky, simplified illustration** in a slight **2.5D oblique view** (top and front faces visible, not true isometric).
- **Thick dark-ink outline**, about 2–3px, near-black `#1F1D2B`.
- **Flat colour fills** with **one soft shade on the side faces**.
- A **white die-cut sticker border** around each object (e.g. a duplicate shape behind it with a thick white stroke) and a **subtle drop shadow** (`filter: drop-shadow(2px 3px 0 rgba(31,29,43,0.18))`), so it looks peeled off a sticker sheet and placed on the page.
- **Background:** cream graph paper `#FBF6EA` with faint blue grid lines `#CFE3F5`, like a maker's notebook.
- **UI panels:** white cards with rounded corners (~16px), dark outlines, soft offset shadows.
- **Labels** sit on strips of **pastel washi tape** (semi-transparent, slightly rotated, torn/zigzag ends via `clip-path`).
- **Success moments** use a **rubber-stamp effect** (rotated ~−8°, patchy uneven ink texture, slams in with a small scale bounce).
- **Palette:** cream paper `#FBF6EA`, near-black ink `#1F1D2B`, coral pink `#FF7A6B`, sunny yellow `#FFD25A`, teal `#2EC4B6`, sky blue `#6EC1F0`, grass green `#7BC96F` — used as **accents, not everywhere**. Suggested mapping: player X = teal, Otto's O = coral, minions = yellow, power-ups = sky blue / green.
- **Fonts:** "Permanent Marker" for headings and buttons; "Nunito" for body text.
- Keep shapes rounded, details minimal, and the feel **tactile, cheerful and unintimidating** — like a beginner's craft journal, not a technical diagram.
- **No gradients, photorealism, glossy 3D or harsh neon.** (Only exception: the Lights Out torch may use a radial mask.)
- **Otto:** a chunky, rounded robot sticker with a big expressive face and at least 4 expressions (smug, bored, scheming, furious) that change with game state.
- **Minion agents:** small, round, mini versions of Otto.
- **Hand-drawn grid lines:** slightly wobbly marker strokes (SVG paths with small random offsets), not perfectly straight. Otto's added lines look scribbly and coral; the player's added lines are neat and teal.
- **Motion:** stickers "peel and place" when they appear (quick scale + rotate), wobble gently when idle. Respect `prefers-reduced-motion` (disable wobble/shake).

## Accessibility
- Board is keyboard-playable (arrow keys + Enter; number keys 1–8 for power-ups).
- No flashing or strobing effects.
- All sticker buttons have `aria-label`s.
- Text keeps good contrast on cream paper.

## Build in milestones
After each milestone, make sure `npm run dev` runs without errors and summarise what changed before moving on.
1. **Playable core:** 3×3 board, player vs Otto (minimax), win/draw detection, rounds and match score. Plain styling is fine.
2. **Cheats:** cheat system with telegraph, catch, cooldowns and the Frustration meter; implement all 6 cheats.
3. **Power-ups & points:** scoring, the tray, all 8 power-ups, and win detection on a grown grid.
4. **Art pass:** apply the full sticker-scrapbook art direction to every element, including Otto's expressions, speech bubbles, washi tape labels and stamps.
5. **Juice & ending:** sound effects, animations, the table-flip meltdown, end screen, title screen.

Keep the code simple and well-commented — the team is first-year students who need to understand and present it.

Related spec files in this repo (implement only when asked): `COMMENTARY.md` (Otto's live commentary system) and `SNOWFLAKE.md` (Otto's memory stored in Snowflake).
