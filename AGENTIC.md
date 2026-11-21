# Implement: Otto visibly takes over the interface (cursor, terminal, minion swarm, escalating glitches)

Goal: it must LOOK like another agent is operating this computer. Otto doesn't just "cause effects" — he moves his own cursor, clicks, drags windows, types, runs commands, and sends tiny robot agents to wreck the UI. Everything gets more glitchy and chaotic as his patience drops.

Keep all game rules, fairness rules (no instant wins after rule changes), pixel-art style, patience/rounds, Snowflake and Calm mode working. Read SPEC.md and UNHINGED.md first. Update SPEC.md with a short summary when done.

---

## 1. Otto's cursor: every Otto action is performed by hand
- Add a second pixel cursor sprite: a chunky **pink pointing hand labelled `OTTO`** (small name tag). It lives on a top layer and never blocks the player's clicks.
- Otto's cursor moves on eased, slightly curved paths (not teleporting), speed 600–900 px/s, with a tiny overshoot. Faster and jerkier at lower patience.
- Clicks show a pixel click ripple and a click sound.
- **Every Otto action is animated through his cursor before it happens** (the engine applies the effect when the animation reaches that step):
  - **Normal move:** cursor glides to the cell, hovers 300ms, clicks; the O appears.
  - **Rule change:** cursor opens `RULES.TXT`, selects the old rule text (highlight), deletes it letter by letter, types the new rule letter by letter, then the `NEW_RULE.EXE` pop-up appears. (Still only at the start of the player's turn.)
  - **Lights Out:** cursor flies to a little light-switch icon in the top bar and flicks it off.
  - **Extra Line:** cursor picks a pixel pen tool and draws the new row/column line pixel by pixel.
  - **Minion Drop:** cursor opens a small `MINIONS/` folder window, drags minion robots out one by one and drops them on cells.
  - **Mark Steal:** cursor grabs your X, drags it off the board into a tiny trash can, then drops an O in its place.
  - **Double Move:** two quick clicks with a smug wiggle between them.
  - **Board Spin:** cursor grabs the monitor's corner and rotates it.
- **Telegraph:** during a cheat's telegraph window the cursor visibly heads to its target, giving the player time to click Otto (catch). If caught, the cursor gets "slapped" away with a pixel *SMACK*.
- **Interface sabotage (cosmetic, never blocks a move):** at stage 2+ Otto's cursor occasionally (max once per 3 turns):
  - drags `TOOLBOX.EXE` a little out of place or minimises it (the player clicks its taskbar button to restore it),
  - nudges the player's power-up floppies out of order,
  - drags the speech bubble over his own patience bar to hide it ("you didn't see that").
  It never moves the board, never covers cells, and never interferes during the player's turn timer.

## 2. Otto's terminal: `OTTO@AGENT:~$`
- A small retro terminal window in Otto's column (black screen, lime VT323 text). Merge with `OTTO.LOG` if it exists.
- Before each action Otto "runs a command", typed out quickly, then shows a result line:
  ```
  OTTO@AGENT:~$ scan --board
  > human prefers corners. threat at C3.
  OTTO@AGENT:~$ minion.deploy --cells=B2,D4
  > 2 minions deployed. hehe.
  OTTO@AGENT:~$ rules.rewrite --win=5
  > rule updated. good luck, human.
  ```
- Commands map to real actions: `place`, `cheat.<id>`, `rules.rewrite`, `minion.deploy`, `ui.drag`, `ui.minimise`, `lights.off`, `scan`.
- At stage 3, commands get panicked and buggy-looking: `sudo rm -rf patience` → `> permission denied`, `kill human.exe` → `> process not found`.
- If the AI brain from AGENT.md exists, its OBSERVE/PLAN/ACT become the `scan` result and the command lines.

## 3. Minion swarm: tiny robots wrecking the UI
- Tiny pixel robots (12–16 px, same style as Otto, original design) that **roam the interface** on their own: walk along window edges, climb title bars, hop between panels.
- How many are roaming depends on Otto's stage: Calm 0, Irritated 1, Unhinged 3, Meltdown 6.
- Havoc behaviours (each minion picks one, takes 4–8 s, then moves on):
  - **Chewer:** nibbles a window corner (pixel bites appear).
  - **Thief:** picks up one of your floppy disks and slowly carries it away. Click the minion to make it drop the disk (+1 point).
  - **Graffiti:** sprays a tiny pixel doodle or "OTTO WUZ HERE" on `RULES.TXT` empty space.
  - **Unplugger:** pulls the monitor's cable; the screen dims 30% until you click the cable to plug it back.
  - **Heckler:** stands near the board holding a tiny sign: "BAD MOVE", "LOL", "4 IN A ROW?? lol".
  - **Dancer:** does a little dance on Otto's monitor.
- **Bonk:** clicking a roaming minion bonks it — it spins and flies off screen (+1 point, max 5 points per round from bonks). Minions placed by the Minion Drop cheat still need Flick as before.
- Rules: roaming minions never sit on cells, never cover marks, the turn indicator or the `NEW_RULE.EXE` pop-up, and pause during rule-change pop-ups and the rampage. They take part in the rampage (they cheer, carry the floppies away, and fall with the shards).

## 4. Glitching that grows with madness
A glitch intensity value `g` from 0 to 1, computed from patience (`g = 0` at 100–76, rising smoothly to `1` at 0). Glitch bursts happen on Otto's turns and at random every 6–12 s, more often as `g` rises. Each burst lasts 150–400 ms.
Effects, introduced progressively as `g` rises:
- `g > 0.1` — scanline jitter on the CRT, tiny horizontal pixel offsets.
- `g > 0.3` — RGB split on headings and Otto's bubble; random letters in UI text swap to symbols for a moment (`R#LES.TXT`).
- `g > 0.5` — block displacement: rectangles of the screen shift sideways (implement with duplicated clipped layers or CSS `clip-path` slices); window title bars briefly show `(Not Responding)`.
- `g > 0.7` — datamosh-style smears: a slice of the screen stretches/repeats for a moment; colour channels invert in small blocks; the whole UI shudders 2–4 px.
- `g > 0.9` — big tears across the screen on Otto's turns; cracks pulse; Otto's cursor leaves a pixel trail.
Safety rules (mandatory):
- No flashing or rapid brightness changes faster than **2 per second**, no full-screen flashes.
- Marks, grid lines, the turn indicator and the win banner stay readable at all times (glitch effects avoid the board cells, or stay under 30% opacity over them).
- Never glitch during the player's click on a cell (pause bursts while the pointer is pressed).
- `prefers-reduced-motion` and **Calm mode**: replace motion with static effects (cracks, colour tint, text corruption only).

## 4b. 2000s TV interference on every rule change and cheat
Whenever **Otto changes a rule** or **performs a cheat** (when the effect lands, and also briefly during a rule-change's `NEW_RULE.EXE` pop-up), the **background** behind all the windows glitches like an old 2000s CRT TV losing signal. It affects the background layer only (the wall, desk and floating floppies), never the board, marks, turn indicator or pop-up text.

Effects, played together as one 0.6–1.2 s burst:
- **Static snow:** animated grey-and-white pixel noise over the background (render on a low-resolution canvas, e.g. 160×90, scaled up with `image-rendering: pixelated`). Opacity 25–45%, never pure white.
- **Rolling bar:** a darker horizontal band rolls slowly up the background (vertical-hold drift).
- **Horizontal hold jitter:** the background shifts sideways in a few thin slices for a moment.
- **Colour fringing:** a slight red/cyan channel offset on the background image.
- **Channel-change "zap":** at the start, the background squeezes into a bright-ish horizontal line for 80 ms and opens again (keep brightness moderate).
- **On-screen display text:** in the top-right of the background, a green TV-style OSD label appears for the burst: `CH 03`, `NO SIGNAL`, `AV1`, or `▶ OTTO.TV`, chosen at random, with a subtle VT323 glow.
- **Sound:** a short burst of TV static (quiet; respects mute).

Intensity scales with Otto's stage: Calm = short and light (0.6 s, 25% snow, no OSD); Meltdown = longest and strongest (1.2 s, 45% snow, OSD + rolling bar + zap). A rule change always gets a slightly stronger burst than a normal cheat.

Safety (mandatory):
- No full-screen flashes, and no brightness changes faster than 2 per second. The snow is low-contrast and never covers the board area or any text the player needs to read.
- `prefers-reduced-motion` and Calm mode: replace the burst with a single static noise frame at 15% opacity plus the OSD label for 0.8 s (no animation).

## 5. Debug panel
Add buttons: "Stage 0/1/2/3", "Spawn minion", "Force glitch burst", "TV static burst", "Otto: drag toolbox", "Otto: rewrite rule".

## 6. Check before finishing
- At each stage, the game is still fully playable and readable at 1440×900 and 1280×720.
- Otto's cursor performs every action type, catching a cheat slaps the cursor away, and sabotage never blocks a move.
- `npm run build` passes. Commit and push, then list what changed.
