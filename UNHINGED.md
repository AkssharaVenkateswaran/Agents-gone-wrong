# Implement: rounds, Otto's patience, fair rule changes, and an increasingly unhinged game

Keep the retro pixel-art style, Snowflake memory, power-ups and cheats working. Read SPEC.md first; update its game-rules section to match this file when you're done.

---

## 1. Match structure: drain Otto's patience over 3–4 longer rounds
- **Otto's Patience** starts at **100** and is the main goal: the player wins the match by draining it to **0**.
- The match is made of **rounds**. After each round the board resets; patience, points and power-ups carry over.
- Patience changes on these events only (use these exact numbers, in patience points out of 100):
  - Otto **loses** a round (player wins): **−50**
  - Draw: **−15**
  - The player **catches** a cheat: **−5** (if this drains the last patience mid-round, the match is won)
  - Otto **wins** a round: **+5** (never above 100)
- Countering cheats and blocking lines do NOT change patience (they still give points and trigger Otto's reactions).
- With these numbers **2 round wins** (or 1 win + a draw + a few catches) can finish Otto, so a match lasts about 2–4 rounds.
- **Otto wins the match** if he wins **3 rounds** before his patience runs out (smug ending, see section 5).
- HUD: `ROUND 2 · YOU 1 – 0 OTTO`. Otto's patience bar shows a stage label (see section 3).

## 2. Longer, fairer rounds
**Longer rounds**
- Round 1 starts on a **4×4** board with **WIN: 4 IN A ROW** (the tutorial round).
- Rounds 2+ start on a **5×5** board with **WIN: 4 IN A ROW**.
- Rule changes can move the win length between 4 and 5 and grow the board up to **7×7**. The board must always be at least (win length + 1) wide.
- A rule change happens every **3 player turns**. The first one in each round happens at the start of the player's 3rd turn, so the twist always appears.
- Soft cap: after **20 player turns** in a round, trigger `SUDDEN DEATH: MOST LINES OF 3 WINS` and count lines to decide the round.
- Otto's AI must handle these boards with the existing heuristic (win → block → extend his longest open line under the current rules). Otto should be beatable but not easy: on his normal moves he ignores a winning or blocking move 15% of the time when patience is above 75, 5% when 50–75, and never below 50 (he gets sharper as he gets angrier).

**No instant wins or losses after a rule change** (this is a hard rule)
- Before applying a candidate rule, **simulate it**: if under the new rule **either** player would have a move that wins immediately (a "one-move win"), **reject that rule** and try another candidate. If no candidate is safe, postpone the rule change by one turn (the countdown shows `NEW RULE DELAYED`).
- Rule changes only happen at the **start of the player's turn**, never right before Otto's move.
- Wins only count for a line that includes a **newly placed** mark (keep the existing placement-stamp check).
- Otto's **first move after a rule change cannot win** (grace turn).
- Write a test that runs 500 random rule changes on random mid-game boards and asserts that no player can win on the first move afterwards.

## 3. The game gets more unhinged as patience drops
Four stages, driven only by patience. Changes are gradual within each stage (interpolate by patience value), and each stage is announced once with a line from Otto.

| Stage | Patience | Patience label |
|---|---|---|
| 0 Calm | 100–76 | `FINE` |
| 1 Irritated | 75–51 | `IRRITATED` |
| 2 Unhinged | 50–26 | `UNHINGED` |
| 3 Meltdown | 25–1 | `CRITICAL` |

**Stage 1: Irritated**
- The central CRT monitor tilts 1–2° and settles back slowly on each Otto turn.
- Occasional soft static: a few horizontal pixel noise lines drift across the screen once every ~10 seconds.
- Otto's speech bubble text jitters slightly while typing; his face gets a faint red tint.
- Sound effects detune slightly.

**Stage 2: Unhinged**
- The monitor sits tilted 3–5° and wobbles gently.
- The **first crack** appears on the CRT glass: a pixel-art crack sprite drawn over the board (it never hides marks; keep it semi-transparent over cells).
- The title glitches letters now and then: `AGENTS GONE WR0NG`, `AG3NTS GONE WRONG`.
- Windows (`TOOLBOX.EXE`, `RULES.TXT`) shift a few pixels off-grid and their title bars turn reddish.
- Small fake pop-ups occasionally appear in empty space: `OTTO.EXE is not responding  [WAIT] [WAIT]` (both buttons say WAIT and just close it). Max one at a time, never over the board.
- Otto sometimes SHOUTS in ALL CAPS; background floppies drift faster.
- The palette warms: the indigo background shifts slightly towards purple-red.

**Stage 3: Meltdown**
- More cracks spread across the glass (2–3 sprites), and the monitor tilts 6–8° and shudders on Otto's turn.
- Screen tearing: horizontal bands of the board area offset sideways for ~300ms on Otto's turn (no flashing).
- RGB-split effect on headings; Otto's monitor sparks (small pixel sparks).
- The rule book gets scribbles drawn over empty space; pop-ups stack (max 2).
- A low buzzing sound loop (quiet, respects mute).
- Otto's lines get desperate and unhinged.

**Safety and accessibility**
- **No flashing faster than 2 times per second**, no full-screen flashes, nothing that makes the board unreadable. Marks, grid lines and the turn indicator must stay clear at every stage.
- With `prefers-reduced-motion`: no wobble, shudder or tearing; show the stage with static tilt, cracks, colour changes and text glitches only.
- Add a small **"Calm mode"** toggle next to the mute button that turns the chaos effects off.

## 4. The rampage ending (patience reaches 0)
Make sure the match result is saved to Snowflake **before** this starts. Inputs are locked. About 12–15 seconds, skippable with a small `[SKIP]` button:
1. Otto's monitor turns red and shows `PATIENCE.SYS NOT FOUND`.
2. Otto: `FINE. FINE! YOU WANT TO WIN? HAVE YOUR STUPID GAME.`
3. Rampage: the floppy disks fly out of `TOOLBOX.EXE` and scatter, `RULES.TXT` gets scribbled out and slides off screen, pop-ups multiply (`OTTO.EXE HAS STOPPED CARING`), and the HUD letters fall down the screen.
4. The CRT glass **shatters**: the cracks spread and the screen breaks into pixel shards that fall off the bottom.
5. A pixel crash screen: `FATAL ERROR: OTTO HAS LEFT THE GAME`, with a few lines of fake log text.
6. Otto's last line: `I'm closing this. Goodbye, human.`
7. **Close the tab**: call `window.close()`. Browsers only allow this for windows opened by a script, so it will usually be blocked. Detect that (the page is still there after ~300ms) and play the fallback:
   - the whole screen collapses into a thin horizontal line and then a dot, like an old CRT turning off;
   - the tab title changes to `Otto has left` and the favicon becomes a tiny black square;
   - after 3 seconds of black, a small line fades in: `Otto closed the game. You drained his patience in {rounds} rounds.` with `[REBOOT OTTO]` (restarts the match) and the Humans vs Otto leaderboard if Snowflake is available.

## 5. Otto wins ending
If Otto wins 3 rounds first: a smug pixel banner `OTTO WINS`, Otto's monitor shows a grin, he says `...I cheated, obviously.`, and the leaderboard and `[PLAY AGAIN]` appear. No rampage.

## 6. Also include these polish items (if not done yet)
- Floppy disks show the **full** power-up name (2 lines allowed, never truncated), no shortcut numbers on the disks (put them in the tooltip), each disk its own palette colour, greyed only when unaffordable or useless (tooltip says why).
- Bigger floppies so `TOOLBOX.EXE` has no empty space; `RULES.TXT` only as tall as its content.
- Bigger score text in the top bar; the title has one crisp pixel shadow.

## 7. Snowflake
- Keep saving one row per **match** (not per round). Set `turns` to total player turns across rounds and `final_grid` to the last board size.
- Winner: `'player'` when patience hit 0, `'otto'` when Otto won 3 rounds.

## 8. Check before finishing
- The 500-rule-change fairness test passes.
- Play-test (or simulate) a full match: it should take 3–4 rounds when the player wins.
- Each stage is visible and the board stays readable at every stage; reduced-motion and Calm mode both work.
- The rampage plays fully, `window.close()` is attempted, and the CRT-off fallback appears when it's blocked.
- `npm run build` passes at 1440×900 and 1280×720 with no scrolling. Commit and push, then list what changed and how to quickly reach each stage using the debug panel (add debug buttons: "Patience −25", "Patience → 1", "Trigger rampage").
