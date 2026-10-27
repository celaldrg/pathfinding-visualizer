/**
 * Entry point: builds the visualizer from the page, wires the controls, pointer
 * and keyboard input, keeps the board fitted to its frame and runs the animation
 * loop. `?demo` opens on a finished A* run through a recursive-division maze.
 */
import { ALGORITHMS } from './algorithms.js';
import { SPEEDS, createDemoGame, createGame } from './game.js';
import { isLanguage, otherLanguage } from './i18n.js';
import { boardMetrics, gridSizeFor, stepCell } from './layout.js';
import { MAZES } from './mazes.js';
import { createPanel } from './panel.js';
import { attachPointer } from './pointer.js';
import { createRenderer } from './renderer.js';
import { createRng } from './rng.js';
import { resolveBoardKey, resolveShortcut } from './shortcuts.js';
import { loadSetting, saveSetting } from './storage.js';

const isKeyOf = (table) => (value) => typeof value === 'string' && Object.hasOwn(table, value);
const byId = (id) => document.getElementById(id);

const demo = new URLSearchParams(location.search).has('demo');
const settings = {
  lang: loadSetting('lang', 'en', isLanguage),
  algorithm: demo ? 'astar' : loadSetting('algorithm', 'astar', isKeyOf(ALGORITHMS)),
  maze: demo ? 'recursiveDivision' : loadSetting('maze', 'recursiveDivision', isKeyOf(MAZES)),
  speed: loadSetting('speed', 'normal', isKeyOf(SPEEDS)),
};
const controls = {
  visualize: byId('visualize'),
  clearPath: byId('clear-path'),
  clearBoard: byId('clear-board'),
  generate: byId('generate'),
  algorithm: byId('algorithm'),
  maze: byId('maze'),
  lang: byId('lang-toggle'),
};
const canvas = byId('board');
const area = byId('board-area');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
/** Seeds for new mazes; the mazes themselves come from the seeded generators. */
const seeds = createRng(Date.now());

const panel = createPanel(document);
const opening = areaSize();
let game = createInitialGame(gridSizeFor(opening.width, opening.height));
const renderer = createRenderer(canvas, { reducedMotion: () => motion.matches });
/** @type {import('./renderer.js').BoardView} */
const view = { hover: -1, cursor: -1, dragging: null };
let brush = /** @type {'wall' | 'weight'} */ ('wall');
let cursor = game.getState().start;
let cursorShown = false;
/** Whether the latest interaction was a pointer press rather than a key press. */
let pointerDriven = false;
/** True until the first pointer or key press: a resize then rebuilds the opening board instead of cropping it. */
let pristine = true;
let frameId = 0;
let lastFrame = 0;

panel.applyLanguage(settings.lang);
controls.algorithm.value = settings.algorithm;
controls.maze.value = settings.maze;
checkRadio('speed', settings.speed);
fitBoard(areaSize());
attachPointer(canvas, { getGame: () => game, view, brush: () => brush, onInput: requestDraw });
wireControls();
wireKeyboard();
new ResizeObserver(([entry]) => fitBoard(entry.contentRect)).observe(area);
watchPixelRatio();

/**
 * The opening board: empty, or the finished ?demo run.
 * @param {{rows: number, cols: number}} size
 */
function createInitialGame(size) {
  const created = demo ? createDemoGame(size) : createGame({ ...size, algorithm: settings.algorithm });
  created.setSpeed(SPEEDS[settings.speed]);
  return created;
}

/**
 * Fits the board to the frame. A different row or column count rebuilds the opening
 * board while nobody has touched it yet, and otherwise resizes the game (a finished
 * run is recomputed on the new board). The canvas is redrawn at once, so a resize
 * never shows an empty frame.
 * @param {{width: number, height: number}} size Board area in CSS pixels.
 */
function fitBoard({ width, height }) {
  const size = gridSizeFor(width, height);
  const state = game.getState();
  if (size.rows !== state.rows || size.cols !== state.cols) {
    if (pristine) {
      game = createInitialGame(size);
    } else {
      game.resize(size.rows, size.cols);
      if (state.status === 'done') game.visualize({ animate: false });
    }
    cursor = game.getState().start;
  }
  renderer.setBoard(boardMetrics(width, height, size.rows, size.cols, devicePixelRatio), size.rows, size.cols);
  if (render(performance.now())) requestDraw();
}

/** Refits the board when the pixel ratio changes, e.g. on browser zoom or a move to another screen. */
function watchPixelRatio() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener(
    'change',
    () => {
      fitBoard(areaSize());
      watchPixelRatio();
    },
    { once: true },
  );
}

/** The board area's exact size; the same numbers the ResizeObserver reports. */
function areaSize() {
  const { width, height } = area.getBoundingClientRect();
  return { width, height };
}

function requestDraw() {
  if (!frameId) frameId = requestAnimationFrame(frame);
}

function frame(now) {
  frameId = 0;
  renderer.noteEvents(game.update(lastFrame ? now - lastFrame : 0), now);
  const keepGoing = render(now);
  lastFrame = isBusy(game.getState()) ? now : 0;
  if (keepGoing) requestDraw();
}

/** Draws the board and updates the panel; returns whether more frames are needed. */
function render(now) {
  const state = game.getState();
  view.cursor = cursorShown ? cursor : -1;
  const animating = renderer.draw(state, view, now);
  panel.render(state, settings.lang);
  return animating || isBusy(state);
}

function isBusy(state) {
  return state.status === 'running' || state.status === 'building';
}

/** Visualize, or skip to the end of the build or search that is playing. */
function primaryAction() {
  if (isBusy(game.getState())) {
    game.finish();
  } else {
    renderer.startRun();
    game.visualize();
  }
  requestDraw();
}

function clearPath() {
  game.clearPath();
  requestDraw();
}

function clearBoard() {
  game.clearBoard();
  requestDraw();
}

function generateMaze() {
  game.generateMaze(settings.maze, seeds.int(2 ** 31));
  requestDraw();
}

function selectAlgorithm(id) {
  settings.algorithm = id;
  controls.algorithm.value = id;
  game.setAlgorithm(id);
  saveSetting('algorithm', id);
  requestDraw();
}

function selectMaze(id) {
  settings.maze = id;
  saveSetting('maze', id);
  generateMaze();
}

function selectSpeed(id) {
  settings.speed = id;
  game.setSpeed(SPEEDS[id]);
  saveSetting('speed', id);
}

function setBrush(next) {
  brush = next;
  checkRadio('brush', next);
}

function toggleLanguage() {
  settings.lang = otherLanguage(settings.lang);
  saveSetting('lang', settings.lang);
  panel.applyLanguage(settings.lang);
  requestDraw();
}

function checkRadio(name, value) {
  for (const input of document.querySelectorAll(`input[name="${name}"]`)) input.checked = input.value === value;
}

function wireControls() {
  onClick(controls.visualize, primaryAction);
  onClick(controls.clearPath, clearPath);
  onClick(controls.clearBoard, clearBoard);
  onClick(controls.generate, generateMaze);
  onClick(controls.lang, toggleLanguage);
  controls.algorithm.addEventListener('change', () => {
    selectAlgorithm(controls.algorithm.value);
    releaseFocus(controls.algorithm);
  });
  controls.maze.addEventListener('change', () => {
    selectMaze(controls.maze.value);
    releaseFocus(controls.maze);
  });
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'radio') return;
    if (input.name === 'speed') selectSpeed(input.value);
    else if (input.name === 'brush') setBrush(/** @type {'wall' | 'weight'} */ (input.value));
  });
}

/** Runs an action on click; a button pressed with a pointer gives focus back, so Space keeps visualizing. */
function onClick(button, action) {
  button.addEventListener('click', () => {
    action();
    releaseFocus(button);
  });
}

function releaseFocus(element) {
  if (pointerDriven && document.activeElement === element) element.blur();
}

function wireKeyboard() {
  document.addEventListener('pointerdown', () => {
    pointerDriven = true;
    pristine = false;
  }, true);
  document.addEventListener('keydown', () => {
    pointerDriven = false;
    pristine = false;
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.target === canvas && handleBoardKey(event)) return;
    const command = resolveShortcut(event, focusKind(document.activeElement));
    if (!command) return;
    event.preventDefault();
    if (!event.repeat) runCommand(command);
  });
  canvas.addEventListener('focus', () => showCursor(!pointerDriven));
  canvas.addEventListener('blur', () => showCursor(false));
  canvas.addEventListener('pointerdown', () => showCursor(false));
}

function showCursor(shown) {
  if (cursorShown === shown) return;
  cursorShown = shown;
  requestDraw();
}

/** @param {import('./shortcuts.js').Command} command */
function runCommand(command) {
  switch (command.name) {
    case 'primary':
      primaryAction();
      break;
    case 'clear-path':
      clearPath();
      break;
    case 'clear-board':
      clearBoard();
      break;
    case 'maze':
      generateMaze();
      break;
    case 'brush':
      setBrush(brush === 'wall' ? 'weight' : 'wall');
      break;
    case 'algorithm':
      selectAlgorithm(command.algorithm);
      break;
  }
}

/** Arrow keys, Enter, S and E on the focused board; returns whether the key was used. */
function handleBoardKey(event) {
  const action = resolveBoardKey(event);
  if (!action) return false;
  event.preventDefault();
  showCursor(true);
  if (action.name === 'move') cursor = stepCell(game.getState(), cursor, action.dRow, action.dCol);
  else if (event.repeat) return true;
  else if (action.name === 'place') game.moveEndpoint(action.endpoint, cursor);
  else paintAtCursor(action.weight);
  requestDraw();
  return true;
}

function paintAtCursor(weight) {
  const stroke = game.strokeAction(cursor, weight ? 'weight' : brush);
  if (stroke !== 'move-start' && stroke !== 'move-end') game.paint(cursor, stroke);
}

/**
 * What kind of element has focus, for the shortcut rules: controls that take
 * typed keys, buttons that Space and Enter activate, or anything else.
 * @param {Element | null} element
 * @returns {'text' | 'button' | 'other'}
 */
function focusKind(element) {
  if (!(element instanceof HTMLElement)) return 'other';
  if (element.isContentEditable || element.matches('select, textarea, input:not([type="radio"])')) return 'text';
  if (element.matches('button, a[href], summary')) return 'button';
  return 'other';
}
