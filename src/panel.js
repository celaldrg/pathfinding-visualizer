/**
 * Everything on the page around the board: the static strings in the chosen
 * language, the generated option lists and info tables, and the live status
 * line, stat tiles and primary button. Nodes are built with createElement and
 * textContent only.
 */
import { ALGORITHMS } from './algorithms.js';
import { SPEEDS } from './game.js';
import { otherLanguage, translate } from './i18n.js';
import { MAZES } from './mazes.js';
import { describeStatus, statsText, statusText } from './status.js';

/** Colour of each shortest-path guarantee in the info table. */
const GUARANTEE_TONE = Object.freeze({ always: 'good', unweighted: 'warn', never: 'bad' });

/**
 * @typedef {object} Panel
 * @property {(lang: string) => void} applyLanguage Translates every static string and the page language.
 * @property {(state: import('./game.js').GameState, lang: string) => void} render
 *   Shows the status, stats and primary action of a game state.
 */

/**
 * Builds the generated parts of the page and returns its updaters.
 * @param {Document} doc
 * @returns {Panel}
 */
export function createPanel(doc) {
  const byId = (id) => doc.getElementById(id);
  fillOptions(doc, byId('algorithm'), Object.keys(ALGORITHMS), 'algo.');
  fillOptions(doc, byId('maze'), Object.keys(MAZES), 'maze.');
  fillRadios(doc, byId('speed-options'), 'speed', Object.keys(SPEEDS));
  fillAbout(doc, byId('about-list'));
  const guaranteeRows = fillGuarantees(doc, byId('guarantees-body'));
  const status = byId('status');
  const primary = byId('visualize');
  const primaryLabel = byId('visualize-label');
  const statValues = {
    visited: byId('stat-visited'),
    length: byId('stat-length'),
    cost: byId('stat-cost'),
    time: byId('stat-time'),
  };
  const langToggle = byId('lang-toggle');

  function applyLanguage(lang) {
    doc.documentElement.lang = lang;
    doc.title = translate(lang, 'app.title');
    for (const element of doc.querySelectorAll('[data-i18n]')) {
      element.textContent = translate(lang, element.dataset.i18n);
    }
    for (const element of doc.querySelectorAll('[data-i18n-aria-label]')) {
      element.setAttribute('aria-label', translate(lang, element.dataset.i18nAriaLabel));
    }
    for (const element of doc.querySelectorAll('[data-i18n-title]')) {
      element.title = translate(lang, element.dataset.i18nTitle);
    }
    langToggle.textContent = otherLanguage(lang).toUpperCase();
  }

  function render(state, lang) {
    setText(status, statusText(state, lang));
    setData(status, 'tone', describeStatus(state).tone);
    const stats = statsText(state, lang);
    for (const [name, element] of Object.entries(statValues)) setText(element, stats[name]);
    const busy = state.status === 'running' || state.status === 'building';
    setText(primaryLabel, translate(lang, busy ? 'actions.skip' : 'actions.visualize'));
    setData(primary, 'mode', busy ? 'skip' : 'run');
    for (const [id, row] of guaranteeRows) {
      if (id === state.algorithm) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
  }

  return { applyLanguage, render };
}

/** Writes text only when it changed, so screen readers and layout are not disturbed every frame. */
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setData(element, name, value) {
  if (element.dataset[name] !== value) element.dataset[name] = value;
}

/** Adds one option per id; applyLanguage fills in their names. */
function fillOptions(doc, select, ids, keyPrefix) {
  for (const id of ids) {
    const option = doc.createElement('option');
    option.value = id;
    option.dataset.i18n = keyPrefix + id;
    select.append(option);
  }
}

/** Adds a segmented radio button per id, named by the `${name}.${id}` string. */
function fillRadios(doc, container, name, ids) {
  for (const id of ids) {
    const label = doc.createElement('label');
    label.className = 'segment';
    const input = doc.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = id;
    const text = doc.createElement('span');
    text.dataset.i18n = `${name}.${id}`;
    label.append(input, text);
    container.append(label);
  }
}

/** One row per algorithm: does it use weights, and does it guarantee the shortest path? */
function fillGuarantees(doc, body) {
  const rows = new Map();
  for (const [id, { weighted, shortest }] of Object.entries(ALGORITHMS)) {
    const row = doc.createElement('tr');
    const name = doc.createElement('th');
    name.scope = 'row';
    name.dataset.i18n = `short.${id}`;
    row.append(
      name,
      pillCell(doc, weighted ? 'guarantees.yes' : 'guarantees.no', weighted ? 'good' : 'neutral'),
      pillCell(doc, `guarantees.${shortest}`, GUARANTEE_TONE[shortest]),
    );
    body.append(row);
    rows.set(id, row);
  }
  return rows;
}

function pillCell(doc, key, tone) {
  const cell = doc.createElement('td');
  const pill = doc.createElement('span');
  pill.className = 'pill';
  pill.dataset.tone = tone;
  pill.dataset.i18n = key;
  cell.append(pill);
  return cell;
}

function fillAbout(doc, list) {
  for (const id of Object.keys(ALGORITHMS)) {
    const item = doc.createElement('div');
    const term = doc.createElement('dt');
    term.dataset.i18n = `algo.${id}`;
    const description = doc.createElement('dd');
    description.dataset.i18n = `about.${id}`;
    item.append(term, description);
    list.append(item);
  }
}
