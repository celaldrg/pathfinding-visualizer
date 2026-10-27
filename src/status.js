/**
 * What the stats tiles and the status line say about a game state. Pure: the
 * words come from i18n.js and numbers are formatted for the chosen language.
 */
import { ALGORITHMS } from './algorithms.js';
import { CELL } from './grid.js';
import { translate } from './i18n.js';

const LOCALES = Object.freeze({ en: 'en-US', tr: 'tr-TR' });
const formatters = new Map();

/**
 * @typedef {object} StatusLine
 * @property {string} key i18n key of the message.
 * @property {string | null} note i18n key of the shortest-path note shown after a found path.
 * @property {'idle' | 'busy' | 'success' | 'failure'} tone
 */

/**
 * Chooses the status message for a game state.
 * @param {import('./game.js').GameState} state
 * @returns {StatusLine}
 */
export function describeStatus(state) {
  switch (state.status) {
    case 'building':
      return { key: 'status.building', note: null, tone: 'busy' };
    case 'running':
      return { key: 'status.running', note: null, tone: 'busy' };
    case 'done':
      return state.outcome === 'found'
        ? { key: 'status.found', note: guaranteeNote(state), tone: 'success' }
        : { key: 'status.unreachable', note: null, tone: 'failure' };
    default:
      return { key: 'status.ready', note: null, tone: 'idle' };
  }
}

/**
 * Key of the note telling whether a path from the state's algorithm is guaranteed
 * to be the shortest. BFS only guarantees it while the board has no weights.
 * @param {import('./game.js').GameState} state
 * @returns {string}
 */
export function guaranteeNote(state) {
  const { shortest } = ALGORITHMS[state.algorithm];
  if (shortest === 'always') return 'note.always';
  if (shortest === 'never') return 'note.never';
  return state.cells.includes(CELL.WEIGHT) ? 'note.ignoresWeights' : 'note.shortestUnweighted';
}

/**
 * The full status line in a language.
 * @param {import('./game.js').GameState} state
 * @param {string} lang
 * @returns {string}
 */
export function statusText(state, lang) {
  const line = describeStatus(state);
  const params = {
    algo: translate(lang, `short.${state.algorithm}`),
    length: formatCount(lang, state.stats.pathLength),
    cost: formatCount(lang, state.stats.pathCost),
  };
  const message = translate(lang, line.key, params);
  return line.note ? `${message} ${translate(lang, line.note, params)}` : message;
}

/**
 * Texts of the four stat tiles; a dash stands for a value that does not exist yet.
 * @param {import('./game.js').GameState} state
 * @param {string} lang
 * @returns {{visited: string, length: string, cost: string, time: string}}
 */
export function statsText(state, lang) {
  const { visited, pathLength, pathCost, timeMs } = state.stats;
  return {
    visited: formatCount(lang, visited),
    length: formatCount(lang, pathLength),
    cost: formatCount(lang, pathCost),
    time: formatTime(lang, timeMs),
  };
}

function formatCount(lang, value) {
  return value === null ? translate(lang, 'stats.none') : formatter(lang, 0).format(value);
}

/** Milliseconds with one decimal below 10 ms; anything under 0.1 ms reads "<0.1 ms". */
function formatTime(lang, ms) {
  if (ms === null) return translate(lang, 'stats.none');
  const digits = ms < 10 ? 1 : 0;
  const shown = formatter(lang, digits).format(Math.max(ms, 0.1));
  return translate(lang, 'stats.ms', { value: ms < 0.1 ? `<${shown}` : shown });
}

function formatter(lang, digits) {
  const locale = Object.hasOwn(LOCALES, lang) ? LOCALES[lang] : LOCALES.en;
  const id = `${locale}/${digits}`;
  if (!formatters.has(id)) {
    formatters.set(id, new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  }
  return formatters.get(id);
}
