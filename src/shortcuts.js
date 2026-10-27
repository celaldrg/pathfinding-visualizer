/**
 * Keyboard shortcuts as pure data: which command a keydown stands for. The UI
 * runs the commands; the tests check the mapping.
 */
import { ALGORITHMS } from './algorithms.js';

const ALGORITHM_IDS = Object.keys(ALGORITHMS);
const ARROWS = Object.freeze({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] });

/**
 * @typedef {object} KeyLike
 * @property {string} key
 * @property {boolean} [shiftKey]
 * @property {boolean} [ctrlKey]
 * @property {boolean} [metaKey]
 * @property {boolean} [altKey]
 */

/**
 * @typedef {object} Command
 * @property {'primary' | 'clear-path' | 'clear-board' | 'maze' | 'brush' | 'algorithm'} name
 * @property {string} [algorithm] Id to select, for 'algorithm'.
 */

/**
 * @typedef {object} BoardAction
 * @property {'move' | 'paint' | 'place'} name
 * @property {number} [dRow] Row step, for 'move'.
 * @property {number} [dCol] Column step, for 'move'.
 * @property {boolean} [weight] Shift was held, for 'paint': place a weight whatever the brush.
 * @property {'start' | 'end'} [endpoint] Endpoint to move to the cursor, for 'place'.
 */

/**
 * Maps a keydown anywhere on the page to a global command:
 * Space visualize (or skip to the end), C clear path, Shift+C clear board,
 * M new maze, W switch brush, 1-5 choose an algorithm.
 * @param {KeyLike} event
 * @param {'text' | 'button' | 'other'} focus What has focus: a control that takes typing
 *   (select, text field), a button or link that Space and Enter activate, or anything else.
 * @returns {Command | null} null when the key is no shortcut or belongs to the focused control.
 */
export function resolveShortcut(event, focus) {
  if (event.ctrlKey || event.metaKey || event.altKey || focus === 'text') return null;
  if (focus === 'button' && (event.key === ' ' || event.key === 'Enter')) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === ' ') return { name: 'primary' };
  if (key === 'c') return { name: event.shiftKey ? 'clear-board' : 'clear-path' };
  if (key === 'm') return { name: 'maze' };
  if (key === 'w') return { name: 'brush' };
  const index = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
  return index >= 0 && index < ALGORITHM_IDS.length ? { name: 'algorithm', algorithm: ALGORITHM_IDS[index] } : null;
}

/**
 * Maps a keydown on the focused board to a cursor action: arrows move the cursor,
 * Enter paints with the brush (Shift+Enter a weight), S and E move the start and end.
 * @param {KeyLike} event
 * @returns {BoardAction | null}
 */
export function resolveBoardKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (Object.hasOwn(ARROWS, event.key)) {
    const [dRow, dCol] = ARROWS[event.key];
    return { name: 'move', dRow, dCol };
  }
  if (event.key === 'Enter') return { name: 'paint', weight: Boolean(event.shiftKey) };
  const key = event.key.toLowerCase();
  if (key === 's') return { name: 'place', endpoint: 'start' };
  if (key === 'e') return { name: 'place', endpoint: 'end' };
  return null;
}
