// terminal.js
// OTTO@AGENT:~$ — Otto "runs a command" before every action, then shows a result.
// The commands map to what Otto really does: scan, place, cheat.<id>, lights.off,
// minion.deploy, rules.rewrite, ui.drag, ui.minimise, ui.shuffle.

export const TERMINAL_LINES = 100; // how many lines are kept (the whole match, mostly)

// A square's name on the board: column letter + row number, e.g. C3.
export function cellName(board, index) {
  const r = Math.floor(index / board.cols);
  const c = index % board.cols;
  return `${'ABCDEFGHI'[c]}${r + 1}`;
}

// Terminal entries: { kind, ..., id, at }
//   cmd      a command + its result (2 lines)    say  Otto's spoken line ("OTTO: ...")
//   sys      a game notice ("SYS: ...")           divider  "──── ROUND 2 ────"
function addEntry(state, entry) {
  state.terminalSeq = (state.terminalSeq || 0) + 1;
  const entries = [...(state.terminal || []), { ...entry, id: state.terminalSeq, at: Date.now() }];
  // keep the last 100 LINES (a command entry is 2 lines)
  let lines = entries.reduce((sum, e) => sum + (e.kind === 'cmd' ? 2 : 1), 0);
  while (lines > TERMINAL_LINES) lines -= entries.shift().kind === 'cmd' ? 2 : 1;
  state.terminal = entries;
}

// Add one command + result to Otto's terminal.
export function termLog(state, command, result) {
  addEntry(state, { kind: 'cmd', command, result });
}

export function termSay(state, text) {
  addEntry(state, { kind: 'say', text });
}

export function termSys(state, text) {
  addEntry(state, { kind: 'sys', text });
}

export function termDivider(state, label) {
  addEntry(state, { kind: 'divider', text: `──── ${label} ────` });
}

// At the Meltdown stage Otto's commands get panicked and buggy.
const PANIC = [
  ['sudo rm -rf patience', 'permission denied'],
  ['kill human.exe', 'process not found'],
  ['reboot --force --now', 'nice try'],
  ['chmod 000 rules.txt', 'operation not permitted'],
  ['ping patience', 'request timed out'],
];
export function panicLine() {
  return PANIC[Math.floor(Math.random() * PANIC.length)];
}

// What `scan --board` reports: the human's habits and any threats.
export function scanResult(state, ottoWins, playerWins) {
  const board = state.board;
  const { rows, cols, cells } = board;
  let corners = 0;
  let middle = 0;
  cells.forEach((mark, i) => {
    if (mark !== 'X') return;
    const r = Math.floor(i / cols);
    const c = i % cols;
    if ((r === 0 || r === rows - 1) && (c === 0 || c === cols - 1)) corners++;
    else if (r > 0 && r < rows - 1 && c > 0 && c < cols - 1) middle++;
  });
  const habit = corners > middle ? 'human prefers corners.' : middle > corners ? 'human hogs the middle.' : 'human is unpredictable. annoying.';
  if (playerWins.length) return `${habit} threat at ${playerWins.map((i) => cellName(board, i)).join(',')}.`;
  if (ottoWins.length) return `${habit} winning move at ${cellName(board, ottoWins[0])}. hehe.`;
  return `${habit} no threats.`;
}
