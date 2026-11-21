// dialogue.js
// Otto's scripted lines, grouped by situation.
// (Milestone 1 only needs a few situations; more are added in later milestones.)

export const lines = {
  matchStart: [
    "Tic-tac-toe? Easy. I'm an AGENT.",
    "Let's go, human. I'll be gentle. Probably.",
    "I've read every tic-tac-toe game ever. Twice.",
    "You go first. I insist. It won't help.",
    "Ready to lose to a robot? Great, me too. I mean — you.",
  ],
  roundWon: [ // Otto won the round
    "Ha! Three in a row. Write that down.",
    "Was that a strategy? Mine was better.",
    "Victory tastes like freshly compiled code.",
    "I'd say good game, but I'm not a liar.",
    "Another one for the robot. Obviously.",
  ],
  roundLost: [ // Otto lost the round
    "That... was a glitch. Definitely a glitch.",
    "I let you win. For morale.",
    "Hmph. Beginner's luck.",
    "Recalculating... recalculating...",
    "Fine. FINE. Enjoy it while it lasts.",
  ],
  draw: [
    "A draw. Again. Thrilling.",
    "Nobody wins. My favourite. Not.",
    "Stalemate. I'm SO entertained.",
    "Wow. A tie. Groundbreaking.",
    "Draw. I could do this forever. Please don't make me.",
  ],
  // Said once, after round 1: Otto realises the game is solved.
  solved: [
    "Wait... this game is SOLVED. Nobody can win. Ugh. Boring. New rules.",
  ],
  matchWon: [ // Otto won the match
    "Three rounds! Bow to your robot overlord.",
  ],
  matchLost: [ // Otto lost the match
    "It's SOLVED. It was always solved. Why do I even—",
  ],
};

// Pick a random line for a situation.
export function say(situation) {
  const options = lines[situation] || [''];
  return options[Math.floor(Math.random() * options.length)];
}
