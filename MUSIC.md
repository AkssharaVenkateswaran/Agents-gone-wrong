# Implement: background chiptune that falls apart as Otto loses patience

Add original 8-bit background music, generated live in code with the Web Audio API (no audio files, no samples, and don't imitate any existing song). It starts cheerful and gets faster, darker and more broken as Otto's patience drops. Keep everything else working.

## 1. Setup
- New file `src/music.js` exporting `startMusic()`, `setStage(stage)` (0–3 from patience), `setPatience(p)` for smooth in-between changes, `musicEvent(name)`, `stopMusic()`.
- Use a standard look-ahead scheduler (a `setTimeout` loop every 25 ms scheduling notes 100 ms ahead on the AudioContext clock) so timing stays tight.
- **Start only after a user click** (browsers block autoplay): start on the title screen's PLAY button.
- Master music volume **0.15** (quiet; sound effects stay louder than the music).
- Add a **🎵 music toggle** next to the existing mute button (pixel icon). Mute turns everything off; the music toggle only the music. Remember both in `localStorage` (inside try/catch).
- Pause the music when the tab is hidden (`visibilitychange`), resume when visible.

## 2. Instruments (all synthesised)
- **Lead:** square wave, short envelope, plays an 8th-note arpeggio.
- **Bass:** triangle wave, plays root notes on beats 1 and 3 (plus a pickup note at higher stages).
- **Drums:** kick = sine with a fast pitch drop (150 → 45 Hz); snare = short filtered noise burst; hi-hat = very short high-passed noise.
- **Pad (stage 0–1 only):** soft pulse-wave chords, low volume.

## 3. The four stages (same melody, increasingly broken)
Chords loop over 4 bars, one chord per bar. Arpeggio pattern per bar: root, 3rd, 5th, octave, 5th, 3rd, root, 5th (8th notes).

| Stage (patience) | Tempo | Chords | Arrangement |
|---|---|---|---|
| 0 Calm (100–76) | 96 BPM | C – Am – F – G (bright) | lead, bass, soft kick on 1 & 3, pad. Cheerful and bouncy. |
| 1 Irritated (75–51) | 112 BPM | same | add hi-hats on 8ths and snare on 2 & 4; the lead gets a slow pitch wobble (±8 cents, 1 Hz). |
| 2 Unhinged (50–26) | 128 BPM | switch to minor: Cm – A♭ – Fm – G | bitcrush the lead (a WaveShaper that quantises to ~4 bits), pitch wobble ±25 cents at 4 Hz, 10% of beats "stutter" (the note repeats 3× as 32nds), the pad drops out. |
| 3 Meltdown (25–1) | 150 BPM | Cm – A♭ – Fm – G, with a tritone (F♯) swapped in for 20% of lead notes | heavy distortion on bass and lead, random noise bursts, and every 4th bar a **tape-slowdown** (the whole mix drops ~30% in pitch and speed over half a bar, then snaps back). |

- When the stage changes, crossfade over **2 bars**; never cut abruptly.
- Between stages, interpolate tempo and wobble smoothly with `setPatience(p)` so it keeps creeping up.
- **Calm mode:** keep the music at the stage 0 or 1 arrangement (no distortion, stutters or tape effects), but let the tempo rise a little.

## 4. Event reactions (`musicEvent(name)`)
- `'ruleChange'`: a **record-scratch / tape-stop** (pitch dives over 300 ms), then the music drops to a bass-only line while `NEW_RULE.EXE` is open, and comes back in on the next downbeat when the player clicks OK.
- `'cheat'`: the music ducks to 40% for 0.8 s during the TV static burst (sidechain feel), with one stutter.
- `'cheatCaught'`: a cheeky 3-note "wah-wah" on the lead, then normal.
- `'roundWonByPlayer'`: a short happy 4-note jingle (major), then the next round's music.
- `'roundWonByOtto'`: a smug 3-note jingle.
- `'rampage'`: the music accelerates to 180 BPM and rises in pitch over ~4 s as the chaos builds, distorts fully as the screen shatters, then a long **tape-stop** down to silence exactly as the screen collapses into the CRT-off line. Total silence on the black screen.
- `'ottoWinsMatch'`: a smug, slightly out-of-tune victory fanfare, then calm stage-0 music on the end screen.

## 5. Wiring
- Call `setPatience`/`setStage` whenever patience changes, and `musicEvent` at the matching moments (rule changes, cheats landing, catches, round ends, rampage, Otto's win).
- Add debug buttons: "Music stage 0/1/2/3", "Test rule-change scratch", "Test rampage music".

## 6. Check
- The music starts after PLAY, never before, and the 🎵 and mute toggles work and persist.
- Each stage is clearly different but still rhythmic (not just noise), and stage changes crossfade.
- No audio glitches or drift after 10 minutes of play.
- `npm run build` passes. Commit and push.
