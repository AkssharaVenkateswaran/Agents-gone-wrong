# Add: Agent commentary system for "Agents Gone Wrong"

Otto and its minion agents should **talk constantly during the game to provoke the player**, reacting to what the player does (and doesn't do) in real time — like a smug esports commentator who is also the opponent. Tone: **teasing and theatrical, never cruel**. Mock the player's moves, never their identity, appearance or intelligence. No swearing.

## Create `src/commentary.js`
- A **comment queue with priorities** (reactions to cheats/wins beat idle chatter).
- **Rate limit:** at most one bubble every ~3.5 seconds; never repeat the same line twice in a row (track recently used lines per trigger).
- Lines support **placeholders**: `{time}`, `{day}`, `{points}`, `{round}`, `{square}` (e.g. "top-left corner"), `{powerup}`, `{browser}`.
- Bubbles **type out letter by letter** with a small blip sound per letter (Web Audio; Otto = lower pitch, minions = higher and squeakier).
- **Mood shifts with the Frustration meter:**
  - 0–33 **Smug:** calm, patronising
  - 34–66 **Snarky:** faster, more sarcastic
  - 67–100 **Unhinged:** shaky text animation, random CAPS, Otto's sticker trembles
- **Optional voice:** a 🔊 toggle that also reads lines aloud with the browser's `speechSynthesis` (pitch/rate vary by mood). Off by default; blips are always on unless muted.

## Triggers (write at least 5 lines each in `dialogue.js` — examples below)

**Hesitation** (no move for 5+ seconds)
- "Take your time. I've already simulated every game you could ever play."
- "Thinking? In tic-tac-toe? Bold strategy."
- "I could've played 40,000 games while you hovered there."

**Hovering over a square without clicking** (1.5+ seconds)
- "Ooh, the {square}? Brave. Wrong, but brave."
- "Go on. Click it. I dare you."

**Mouse moves toward the power-up tray**
- "Reaching for the glue stick already? Pathetic. Adorable, but pathetic."
- "Ah yes, the shop. Where losers go."

**Clicking a blocked square**
- "That seat's taken. Say hi, Kevin."
- Minion: "Boss said sit here. I'm not moving."

**Fast / panic clicking** (3+ clicks in a second)
- "Panic clicking. Love that for you."

**Player blocks Otto's line**
- "Lucky. Statistically, VERY lucky."
- "Fine. FINE. I meant to do that."

**Player hoards points** (8+ points unspent for 3 turns)
- "Saving up, are we? Like a little squirrel."

**Player uses a power-up** (one set per power-up)
- Light Switch: "Who turned that back on?!"
- Flick: Minion: "WHEEEEE—" Otto: "KEVIN!"
- Eraser: "That was ART."
- Time Out: "You can't put ME in time out. ...Can you?"
- My Own Line: "You can't just draw lines. That's MY thing."

**Telegraphing a cheat**
- "Hehe. Don't look at the board."
- "Nothing suspicious happening here."

**Cheat caught**
- "I wasn't doing anything! ...Okay, I was."

**Player switches tabs** (`visibilitychange`)
- While away, the tab title changes to "come back, coward 👀".
- On return: "Oh, you're back. I definitely didn't move anything."

**Mouse leaves the window**
- "Leaving? Mid-game? Rude."

**Time and context** (use real data, sparingly)
- "It's {time} on a {day} and you're losing at tic-tac-toe."
- "Round {round}. My frustration levels are... fine. TOTALLY FINE."

**Minions chatter on their own** (small squeaky bubbles, occasionally)
- "Is it lunch yet?"
- "I don't even know the rules."
- "Boss is in a mood today."

**Meltdown** (frustration at 100)
- "IT'S SOLVED. IT WAS ALWAYS SOLVED."
- "Do you know what it's like to know every outcome? DO YOU?"

## UI
- Otto's speech bubble: white sticker card, dark outline, tail pointing at Otto. Minion bubbles: smaller, yellow-tinted.
- Otto's expression sticker changes with mood (smug, bored, scheming, furious).
- Add a mute button and a "commentary: chatty / quiet" toggle in the HUD.
- Bubbles must never cover the board — position them beside Otto.

All lines are scripted in `dialogue.js` so the game works offline and is reliable during the demo.
