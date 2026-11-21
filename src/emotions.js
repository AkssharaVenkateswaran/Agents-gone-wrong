// emotions.js
// How Otto feels, and so which face, casing colour and little extras it shows.
//
// The BASE mood comes from Otto's patience:
//   100-76 smug (happy at the start of a round) · 75-51 irritated · 50-26 furious
//   25-1 unhinged (glitching during glitch bursts) · 0 crashed (the rampage)
// TEMPORARY moods (state.tempMood) override it for a few seconds:
//   defeated (lost a round), victorious (won a round or the match),
//   glitching (a glitch burst), bored (patience > 75 and the game drags on).
// While thinking, its eyes look around; while telegraphing a cheat it schemes.

// The base mood for a patience value.
export function baseMood(state) {
  const p = state.patience;
  if (p <= 0) return 'crashed';
  if (p > 75) {
    const roundJustStarted = state.playerTurns === 0 && !state.roundOver && state.turn === 'X';
    return roundJustStarted ? 'happy' : 'smug';
  }
  if (p > 50) return 'irritated';
  if (p > 25) return 'furious';
  return 'unhinged';
}

// The casing colours (OTTO_COLOURS key) that go with a mood.
const COLOURS_FOR = {
  smug: 'calm', happy: 'happy', irritated: 'irritated', furious: 'furious', unhinged: 'unhinged',
  glitching: 'glitching', defeated: 'defeated', victorious: 'victorious', crashed: 'crashed',
};

// The face sprite (OTTO_FACES key) that goes with a mood.
const FACE_FOR = {
  smug: 'smug', happy: 'happy', irritated: 'irritated', furious: 'furious', unhinged: 'unhinged',
  glitching: 'glitching', defeated: 'defeated', victorious: 'victorious', crashed: 'crash', bored: 'bored',
  scheming: 'scheming',
};

// The small pixel extras around the casing for each mood.
const EXTRAS_FOR = {
  thinking: ['question'],
  irritated: ['sweat'],
  furious: ['steam'],
  unhinged: ['sparks', 'crack'],
  glitching: ['sparks', 'crack'],
  victorious: ['sparkles'],
};

// Everything the screen needs to draw Otto right now:
//   { mood, face, colours, thinking, extras, label }
export function ottoLook(state, now = Date.now()) {
  const base = baseMood(state);
  const temp = state.tempMood && state.tempMood.until > now ? state.tempMood.mood : null;

  // The rampage: red while it snaps, then grey and crashed.
  if (state.rampage) {
    const red = ['red', 'fine'].includes(state.rampage.phase);
    return look(red ? 'furious' : 'crashed', red ? 'furious' : 'crash', red ? 'furious' : 'crashed');
  }
  // The Otto-wins screen: victorious for good.
  if (state.ending === 'banner' && state.result === 'O') return look('victorious');
  // Telegraphing a cheat: scheming face, but its base colour stays.
  if (state.telegraph) return look('scheming', 'scheming', COLOURS_FOR[base] || 'calm');
  if (temp) return look(temp, FACE_FOR[temp], COLOURS_FOR[temp] || COLOURS_FOR[base] || 'calm');
  // Thinking: eyes look around. Above 50 patience it also wears the "thinking" colours.
  if (state.ottoThinking) {
    const colours = state.patience > 50 ? 'thinking' : COLOURS_FOR[base];
    return { ...look('thinking', 'thinkLeft', colours), thinking: true };
  }
  return look(base);
}

function look(mood, face = FACE_FOR[mood], colours = COLOURS_FOR[mood] || 'calm') {
  return { mood, face, colours, thinking: false, extras: EXTRAS_FOR[mood] || [] };
}
