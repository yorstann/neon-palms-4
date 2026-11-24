// Keyboard and mouse state for the game.
// Everything polls through the `keys` set and the mouse record, so the
// simulation never touches DOM events directly and scripted screenshot
// scenes can drive the same surface.

export const keys = new Set();
export const mouse = { x: 0, y: 0, down: false, clicked: false };

const GAME_KEYS = new Set([
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ',
]);

let attached = false;

/** Wire DOM listeners into the shared state. Safe to call once. */
export function attachInput(canvas) {
  if (attached) return;
  attached = true;
  window.addEventListener('keydown', (ev) => {
    const k = ev.key.toLowerCase();
    if (GAME_KEYS.has(k)) ev.preventDefault();
    keys.add(k);
  });
  window.addEventListener('keyup', (ev) => {
    keys.delete(ev.key.toLowerCase());
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (ev) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * canvas.width;
    mouse.y = ((ev.clientY - r.top) / r.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (ev) => {
    if (ev.button === 0) mouse.down = false;
  });
}

/** True while any of the named keys is held. Names are lowercase. */
export function held(...names) {
  for (const n of names) if (keys.has(n)) return true;
  return false;
}

/** One-shot press latch: true once per physical press of `name`. */
const latched = new Map();
export function pressed(name) {
  const isDown = keys.has(name);
  const was = latched.get(name) || false;
  latched.set(name, isDown);
  return isDown && !was;
}

/** Call at the end of each frame to clear per-frame mouse state. */
export function endFrame() {
  mouse.clicked = false;
}
