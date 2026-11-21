# Implement: Otto's emotions change his face AND his colour

Otto's casing colour and face must show how he feels, driven by his patience and by game events. Keep everything else working (pixel style, Calm mode, reduced motion). These designs match the pitch-deck images exactly, so use the pixel data below as-is.

## 1. Palette additions (`src/ui/sprites.js`)
Add to `PALETTE`:
```js
o: '#FF9F43', O: '#C7701F', // orange (irritated)
r: '#FF3B4E', R: '#B81E33', // red (furious)
v: '#B86BFF', V: '#7A3BC4', // violet (unhinged)
e: '#9A95B5', E: '#6E698C', // grey-blue (defeated / crashed)
h: '#FFFFFF',               // white highlight
```
Add to `SHADE_OF`: `o: 'O', r: 'R', v: 'V', e: 'E'`.

Add these glyphs to `GLYPHS` (3×5, same format as the existing ones):
```js
'<': ['..g', '.g.', 'g..', '.g.', '..g'],
'?': ['ggg', '..g', '.gg', '...', '.g.'],
'!': ['.g.', '.g.', '.g.', '...', '.g.'],
'#': ['g.g', 'ggg', 'g.g', 'ggg', 'g.g'],
'@': ['ggg', 'g.g', 'g.g', 'g..', 'ggg'],
```

## 2. Casing colours
Keep `OTTO_CASING` as is (it uses `m`/`M` for the body and `p`/`P` for the antenna ball) and recolour it at render time by passing a palette override to `sprite()`:
```js
export const OTTO_COLOURS = {
  calm:      { m: '#C8C2E8', M: '#8E86C4', p: '#FF4F9A', P: '#C42A74' }, // lavender, pink ball
  happy:     { m: '#C8C2E8', M: '#8E86C4', p: '#9BE564', P: '#5FAE3C' }, // lavender, lime ball
  thinking:  { m: '#C8C2E8', M: '#8E86C4', p: '#5CD6FF', P: '#2E9CC4' }, // lavender, cyan ball
  irritated: { m: '#FF9F43', M: '#C7701F', p: '#FF9F43', P: '#C7701F' }, // orange
  furious:   { m: '#FF3B4E', M: '#B81E33', p: '#FF3B4E', P: '#B81E33' }, // red
  unhinged:  { m: '#B86BFF', M: '#7A3BC4', p: '#FF4F9A', P: '#C42A74' }, // violet
  glitching: { m: '#B86BFF', M: '#7A3BC4', p: '#FFE45C', P: '#D9B92E' }, // violet, yellow ball
  defeated:  { m: '#9A95B5', M: '#6E698C', p: '#5CD6FF', P: '#2E9CC4' }, // grey-blue
  crashed:   { m: '#9A95B5', M: '#6E698C', p: '#9A95B5', P: '#6E698C' }, // grey
  victorious:{ m: '#FFE45C', M: '#D9B92E', p: '#FF4F9A', P: '#C42A74' }, // gold
};
// usage: sprite(OTTO_CASING, 'otto-casing', { ...PALETTE, ...OTTO_COLOURS[mood] })
```

## 3. New faces (add to `OTTO_FACES`, using the existing `face`, `rect`, `plot`, `text` helpers)
Keep the existing `smug`, `bored`, `scheming`, `furious`, `thinkLeft`, `thinkRight`, `crash`. Change `furious` to use `'r'` instead of `'p'`. Add:
```js
happy: face((g) => {
  rect(g, 4, 3, 2, 1, 'g'); plot(g, 3, 4, 'g'); plot(g, 6, 4, 'g');      // ^ eyes
  rect(g, 14, 3, 2, 1, 'g'); plot(g, 13, 4, 'g'); plot(g, 16, 4, 'g');
  plot(g, 5, 8, 'g'); rect(g, 6, 9, 8, 1, 'g'); plot(g, 14, 8, 'g');     // smile
  rect(g, 7, 10, 6, 1, 'g');
}),
irritated: face((g) => {
  rect(g, 3, 3, 4, 1, 'y'); rect(g, 13, 3, 4, 1, 'y');                   // flat brows
  rect(g, 4, 5, 2, 1, 'y'); rect(g, 14, 5, 2, 1, 'y');                   // narrowed eyes
  rect(g, 5, 9, 10, 2, 'y');                                              // gritted teeth
  for (const x of [7, 9, 11, 13]) { plot(g, x, 9, 's'); plot(g, x, 10, 's'); }
  plot(g, 17, 1, 'y'); plot(g, 18, 2, 'y');                               // vein tick
}),
unhinged: face((g) => {
  rect(g, 2, 2, 6, 1, 'v'); rect(g, 2, 7, 6, 1, 'v');                    // one big ringed eye
  rect(g, 2, 2, 1, 6, 'v'); rect(g, 7, 2, 1, 6, 'v'); rect(g, 4, 4, 2, 2, 'h');
  rect(g, 13, 4, 2, 2, 'v');                                              // one tiny pupil
  rect(g, 3, 9, 6, 1, 'p'); rect(g, 9, 10, 7, 1, 'p'); rect(g, 5, 11, 5, 1, 'c'); // glitched grin
}),
glitching: face((g) => {
  text(g, 3, 4, '#@!', 'p');
  rect(g, 0, 1, 7, 1, 'c'); rect(g, 12, 11, 8, 1, 'c');                  // tear lines
}),
defeated: face((g) => {
  plot(g, 3, 4, 'c'); rect(g, 4, 5, 3, 1, 'c');                          // droopy eyes
  plot(g, 16, 4, 'c'); rect(g, 13, 5, 3, 1, 'c');
  rect(g, 6, 9, 8, 1, 'c'); plot(g, 5, 10, 'c'); plot(g, 14, 10, 'c');   // frown
  rect(g, 4, 7, 1, 2, 'h');                                               // tear
}),
victorious: face((g) => {
  text(g, 2, 2, '>', 'y'); text(g, 14, 2, '<', 'y');                     // > < squint
  rect(g, 4, 8, 12, 1, 'y'); rect(g, 5, 9, 10, 2, 'y'); rect(g, 6, 11, 8, 1, 'y'); // big grin
  rect(g, 6, 9, 8, 1, 'p');                                               // tongue
}),
```
Note: `text()` draws glyph pixels with the colour passed as its last argument.

## 4. Small extras around Otto (pixel sprites placed outside the casing)
- **Thinking:** a yellow pixel `?` floating top-right.
- **Irritated:** a cyan sweat drop on the right side.
- **Furious:** cream steam puffs on both sides of the casing, gently rising.
- **Unhinged / glitching:** small yellow and orange sparks around the casing; a white pixel crack on the right edge of his screen glass.
- **Victorious:** yellow pixel sparkles (+ shapes) around him.
These respect reduced motion and Calm mode (static, no movement).

## 5. Which mood shows when
Base mood from patience (also sets the casing colour):
| Patience | Default mood |
|---|---|
| 100–76 | `smug` (calm colours); `happy` at the start of a round |
| 75–51 | `irritated` |
| 50–26 | `furious` |
| 25–1 | `unhinged` (switch to `glitching` for the duration of each glitch burst) |
| 0 | `crashed` (during the rampage) |

Temporary moods (override for ~2 seconds, then return to the base mood):
- While thinking → `thinkLeft/thinkRight` animation with `thinking` colours (only at patience > 50; above that his base colour stays and only the face animates).
- Telegraphing a cheat → `scheming` (keep the base casing colour).
- Board is heading for a draw / player is slow → `bored` (only at patience > 75).
- Otto loses a round → `defeated` for 3 seconds.
- Otto wins a round or the match → `victorious` for 3 seconds (on the Otto-wins end screen, stay `victorious`).

**Colour changes:** when the casing colour changes, animate it as a quick pixel wipe from bottom to top over ~500ms (no flashing). With reduced motion, just switch.

## 6. Check
- Use the debug panel to step through patience values and trigger each temporary mood; every mood shows the right face and colour.
- `npm run build` passes. Commit and push.
