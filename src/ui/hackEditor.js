// ui/hackEditor.js
// The HACK.EXE window: a retro code editor showing otto.cfg, over the left column
// (never over the board). It lives outside #app so a redraw never loses your typing.
//
// SAFETY: the player's text only ever goes into a <textarea> value or textContent.
// It is never put into innerHTML and never run (hack.js only parses it).

let win = null;
let parts = null;       // the window's pieces
let callbacks = null;   // { onRun(text), onCancel() }
let mode = 'closed';    // 'closed' | 'edit' | 'otto' (Otto is typing) | 'denied'

export function initHackEditor(handlers) {
  callbacks = handlers;
  win = document.createElement('section');
  win.className = 'window hack-window';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'HACK.EXE: edit Otto\'s config file');
  win.hidden = true;
  win.innerHTML = `
    <div class="title-bar"><span>HACK.EXE — otto.cfg</span><span class="title-buttons" aria-hidden="true">_ □ ×</span></div>
    <div class="hack-body">
      <div class="hack-code">
        <div class="hack-gutter" aria-hidden="true"></div>
        <textarea class="hack-text" spellcheck="false" autocomplete="off" autocapitalize="off"
                  maxlength="2000" wrap="off" aria-label="otto.cfg"></textarea>
        <div class="hack-lines" aria-live="polite"></div>
      </div>
      <div class="hack-denied" hidden>
        <p class="denied-title">ACCESS DENIED</p>
        <p>Otto locked the editor for the rest of this round.</p>
      </div>
      <p class="hack-errors" role="alert"></p>
      <div class="hack-buttons">
        <button type="button" class="btn hack-run">[RUN]</button>
        <button type="button" class="btn hack-cancel">[CANCEL]</button>
      </div>
    </div>`;
  document.body.appendChild(win);
  parts = {
    gutter: win.querySelector('.hack-gutter'),
    text: win.querySelector('.hack-text'),
    lines: win.querySelector('.hack-lines'),
    denied: win.querySelector('.hack-denied'),
    errors: win.querySelector('.hack-errors'),
    run: win.querySelector('.hack-run'),
    cancel: win.querySelector('.hack-cancel'),
    title: win.querySelector('.title-bar span'),
  };
  parts.text.addEventListener('input', updateGutter);
  parts.text.addEventListener('scroll', () => (parts.gutter.scrollTop = parts.text.scrollTop));
  parts.text.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') callbacks.onCancel();
  });
  parts.run.addEventListener('click', () => {
    if (mode === 'edit') callbacks.onRun(parts.text.value);
  });
  parts.cancel.addEventListener('click', () => {
    if (mode === 'edit' || mode === 'denied') callbacks.onCancel();
  });
  window.addEventListener('resize', place);
}

// Over the left column (where TOOLBOX.EXE is), never over the board.
function place() {
  if (!win || win.hidden) return;
  const column = document.querySelector('.toolbox, .toolbox-minimised');
  const board = document.querySelector('.board-area');
  if (!column) return;
  const box = column.getBoundingClientRect();
  const limit = board ? board.getBoundingClientRect().left - 8 : box.right;
  win.style.left = `${Math.max(4, box.left)}px`;
  win.style.top = `${box.top}px`;
  win.style.width = `${Math.max(220, Math.min(limit, box.left + 420) - box.left)}px`;
  win.style.maxHeight = `${Math.max(240, window.innerHeight - box.top - 40)}px`;
}

function show(newMode) {
  mode = newMode;
  win.hidden = false;
  win.dataset.mode = newMode;
  parts.text.hidden = newMode !== 'edit';
  parts.lines.hidden = newMode !== 'otto';
  parts.gutter.hidden = newMode === 'denied';
  parts.denied.hidden = newMode !== 'denied';
  parts.run.hidden = newMode === 'denied';
  parts.cancel.textContent = newMode === 'denied' ? '[OK]' : '[CANCEL]';
  parts.run.disabled = newMode !== 'edit';
  parts.cancel.disabled = newMode === 'otto';
  parts.errors.textContent = '';
  place();
}

// The player edits the file.
export function openForPlayer(lines) {
  show('edit');
  parts.text.value = lines.join('\n');
  updateGutter();
  parts.text.focus();
  // put the blinking cursor at the end of the first setting line
  const firstSetting = lines.findIndex((line) => line.startsWith('otto.'));
  const offset = lines.slice(0, firstSetting + 1).join('\n').length;
  parts.text.setSelectionRange(offset, offset);
}

// Otto shows the file read-only and types into it (see performHackRestore).
export function openForOtto(lines) {
  show('otto');
  setLines(lines);
}

export function openDenied() {
  show('denied');
}

export function closeEditor() {
  if (!win) return;
  mode = 'closed';
  win.hidden = true;
}

export const editorMode = () => mode;

export function showErrors(errors) {
  parts.errors.textContent = errors.slice(0, 3).join('\n'); // textContent: never HTML
}

function updateGutter() {
  const count = parts.text.value.split('\n').length;
  parts.gutter.textContent = Array.from({ length: count }, (_, n) => n + 1).join('\n');
}

// --- Otto's read-only view: one element per line, so he can select and retype them ----------
function setLines(lines) {
  parts.lines.replaceChildren(...lines.map((text) => {
    const line = document.createElement('div');
    line.className = 'hack-line';
    line.textContent = text;
    return line;
  }));
  parts.gutter.textContent = lines.map((_, n) => n + 1).join('\n');
}

export const lineElement = (i) => parts.lines.children[i];
export const runButton = () => parts.run;

export function setLineText(i, text, { selected = false, typing = false } = {}) {
  const line = parts.lines.children[i];
  if (!line) return;
  line.textContent = text;
  line.classList.toggle('selected', selected);
  line.classList.toggle('typing', typing);
}

// Add a line at the top (Otto's "DO NOT TOUCH" comment).
export function addTopLine(text) {
  const line = document.createElement('div');
  line.className = 'hack-line otto-comment';
  line.textContent = text;
  parts.lines.prepend(line);
  parts.gutter.textContent = Array.from({ length: parts.lines.children.length }, (_, n) => n + 1).join('\n');
}
