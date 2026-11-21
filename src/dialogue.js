// dialogue.js
// Otto's scripted lines, grouped by situation. All offline, no API calls.

export const lines = {
  matchStart: [
    "Tic-tac-toe? Easy. I'm an AGENT.",
    "Let's go, human. I'll be gentle. Probably.",
    "I've read every tic-tac-toe game ever. Twice.",
    "You go first. I insist. It won't help.",
    "Ready to lose to a robot? Great, me too. I mean — you.",
  ],
  // Said once, after round 1: Otto realises the game is solved.
  solved: [
    "Wait... this game is SOLVED. Nobody can win. Ugh. Boring. New rules.",
  ],
  bored: [
    "Yawn. I can see the draw from here.",
    "This is going to be a tie, isn't it. Again.",
    "I've simulated this game 9! times. It ends the same.",
    "Booooring. Somebody do something.",
    "My fans are spinning out of sheer boredom.",
  ],
  telegraph: [
    "hehe…",
    "hehe… don't mind me…",
    "hehehe… nothing to see here…",
    "hehe… just stretching my circuits…",
    "hehe… look over there!",
  ],
  cheatSucceeds: [
    "Rules? I don't see any rules.",
    "Oops! Totally an accident. Totally.",
    "That's called innovation, look it up.",
    "Technically nobody said I COULDN'T.",
    "Ta-da! Did you see that? No? Good.",
  ],
  cheatCountered: [
    "Hey! That was MY cheat!",
    "You can't just UNDO my cheating!",
    "Ugh. Fine. Back to boring rules.",
    "Who gave you power-ups?! Unfair!",
    "Rude. I worked hard on that cheat.",
  ],
  cheatCaught: [
    "What? I wasn't doing anything!",
    "Caught? Me? Prove it. ...Oh, you can.",
    "Hands off! I was just... waving.",
    "How did you SEE that?!",
    "Okay okay, I'll play fair. This turn.",
  ],
  playerBlocks: [
    "Hey! I was going to put mine there!",
    "Blocked?! By a human?!",
    "Lucky guess. Very lucky.",
    "Stop reading my mind!",
    "I had a plan and you RUINED it.",
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
  frustration: [
    "I am NOT getting annoyed. My fan is just loud.",
    "Grrrr. Beep. GRRR.",
    "Okay, gloves off. Metaphorically. I don't have gloves.",
    "My patience module is at 3%.",
    "Why won't you just LOSE?!",
  ],
  skipTurn: [ // Otto has to skip a turn (Time Out)
    "A time out? For ME?",
    "Fine, I'll sit here. Quietly. Angrily.",
    "This is robot abuse.",
    "I'm only skipping because I want to.",
    "Skipping my turn. Plotting my revenge.",
  ],
  matchWon: [ // Otto won the match
    "Undefeated! Bow to your robot overlord. ...I cheated, obviously.",
    "Winner: ME! ...I cheated, obviously.",
    "Three rounds! Flawless! ...Well. I cheated, obviously.",
    "Champion of the grid! ...I cheated, obviously.",
    "GG EZ. ...I cheated, obviously.",
  ],
  meltdown: [ // Otto lost the match
    "It's SOLVED. It was always solved. Why do I even—",
    "No no no NO. This is not in my training data!",
    "I'm calling my developer. DEVELOPER!",
    "I demand a rematch. And better rules. And a hug.",
    "Error 404: dignity not found.",
  ],
  // --- Rewriting the rules ---
  ruleTelegraph: [ // the Rule Book shakes before a change
    "I've been reading the rules... I don't like them.",
    "Hold on. I'm making some... edits.",
    "Page 1, rule 1: Otto makes the rules. Let me check... yep.",
    "These rules are SO 1952. Time for an update.",
    "Hmm, what if the rules were... worse? For you.",
  ],
  vetoed: [
    "VETOED?! You can't veto ME!",
    "I worked hard on that rule. With my feelings.",
    "Fine. The old rule. The BORING rule.",
    "Who gave the human a veto stamp?!",
    "My beautiful rule... crossed out like a typo.",
  ],
  amended: [
    "YOU'RE picking the rules now? Since when?!",
    "An amendment? This isn't a democracy!",
    "Fine, pick a card. Any card. Except that one.",
    "I demand to see your rule-making licence.",
    "You've changed the rules. That's MY thing!",
  ],
  ruleExpired: [
    "Reverse day is over. Things make sense again. Ugh.",
    "Back to normal. Normal is boring.",
    "Okay, lines are good again. I knew that.",
    "Reverse day expired. Like milk. Like your luck.",
    "Un-reversed. Did you miss me? Don't answer.",
  ],
  outOfRoom: [
    "No room left? Fine. I'll just add MORE board.",
    "Board's full. Good thing I own a pencil.",
    "A draw? Not on my watch. Extending the grid!",
    "Squares are free. Have some more.",
    "If you can't win, make the board bigger. Science.",
  ],
  finalRule: [
    "FINAL RULE: most lines of 3 wins. Let's count!",
    "Enough! FINAL RULE: whoever has the most lines of 3 wins!",
    "I'm calling it. FINAL RULE: count the lines of 3!",
    "That's it, the board's had enough. FINAL RULE: most lines of 3!",
    "Time's up! FINAL RULE: we count every line of 3.",
  ],
};

// What Otto says when each rule comes in (by rule id).
export const ruleLines = {
  three: ["Back to 3 in a row. Classic. Boring. Classic.", "3 in a row again. Nostalgic, isn't it?"],
  four: ["4 in a row now. Your 3 is worthless.", "3 was too easy. Four. FOUR!"],
  five: ["5 in a row now. Good luck.", "Five. In. A. Row. I'll wait."],
  noDiagonals: ["Diagonals don't count anymore. Sorry, slanty lines.", "Straight lines only. Diagonals are cancelled."],
  onlyDiagonals: ["ONLY diagonals count now. Tilt your head.", "Across? Down? Nope. Diagonals only."],
  anywhere: ["Place anywhere again. Freedom! Ugh.", "Fine. Play wherever you want."],
  gravity: ["Gravity's on. Everything falls. Like your chances.", "Gravity! What goes up must come down. Mostly your marks."],
  lava: ["The corners are lava! Don't touch them!", "Corners: lava. Your plans: also lava."],
  touch: ["Everything must touch now. Stay close. Like friends. Ew.", "New marks have to touch old ones. Clingy."],
  noTwist: ["No twist. For now.", "Twist removed. Enjoy the calm."],
  fade: ["Ink fades now. Nothing lasts. Especially your lead.", "Old marks fade away. Like your memory of winning."],
  mirror: ["Mirror mode! Every move happens twice. Double trouble.", "Mirror, mirror on the grid..."],
  timer: ["5-second timer! Tick tock, human.", "Think fast. No, faster. FIVE seconds."],
  reverse: ["Reverse day! Making a line LOSES. Bet you didn't see that coming.", "Opposite day! Lines are bad now. For 3 turns."],
};

export function sayRule(ruleId) {
  const options = ruleLines[ruleId] || ['New rule!'];
  return options[Math.floor(Math.random() * options.length)];
}

// Pick a random line for a situation.
export function say(situation) {
  const options = lines[situation] || [''];
  return options[Math.floor(Math.random() * options.length)];
}
