/**
 * Visualizer state machine that a UI drives: board editing, maze builds and
 * algorithm runs, animated by update(dtMs). No DOM; the clock is injectable.
 *
 * Status flow: 'idle' -> 'building' (maze animation) -> 'idle'
 *              'idle' -> 'running' (search animation) -> 'done'
 * Editing the board while 'running' cancels the run; editing it while 'done'
 * recomputes the result instantly, so the path follows the user's changes.
 */
import { CELL, createGrid, defaultEndpoints, lineBetween, toIndex, toRowCol } from './grid.js';
import { ALGORITHMS, solve } from './algorithms.js';
import { MAZES } from './mazes.js';
import { createRng } from './rng.js';

/** Overlay states drawn on top of the cells while or after an algorithm runs. */
export const OVERLAY = Object.freeze({ NONE: 0, FRONTIER: 1, VISITED: 2, PATH: 3 });

/** Animation speeds in visited cells per second. */
export const SPEEDS = Object.freeze({ slow: 30, normal: 120, fast: 480 });

/** Budget each animation event consumes; frontier cells appear together with their visit. */
const EVENT_COST = Object.freeze({ visit: 1, frontier: 0, path: 2, wall: 1 });
/** Maze builds play this many times faster than searches. */
const BUILD_SPEEDUP = 4;
/** Longest frame update(dtMs) honours, so a tab returning from the background does not jump ahead. */
const MAX_FRAME_MS = 250;
/** Cell type written by each paint action. */
const PAINT_TYPE = Object.freeze({ wall: CELL.WALL, weight: CELL.WEIGHT, erase: CELL.EMPTY });
const DEMO_SEED = 115;
const DEMO_WEIGHT_DENSITY = 0.05;

/** @typedef {import('./grid.js').Grid} Grid */
/** @typedef {{type: 'visit' | 'frontier' | 'path' | 'wall', cell: number}} GameEvent */
/** @typedef {'idle' | 'building' | 'running' | 'done'} Status */
/** @typedef {'wall' | 'weight' | 'erase'} PaintAction */
/** @typedef {PaintAction | 'move-start' | 'move-end'} StrokeAction */

/**
 * @typedef {object} GameState
 * @property {number} rows
 * @property {number} cols
 * @property {Uint8Array} cells CELL type per index (live view, read only).
 * @property {Uint8Array} overlay OVERLAY state per index (live view, read only).
 * @property {number} start
 * @property {number} end
 * @property {Status} status
 * @property {string} algorithm Key of ALGORITHMS.
 * @property {number} speed Visited cells per second.
 * @property {'found' | 'unreachable' | null} outcome Set once the run is done.
 * @property {number[] | null} path Final path once the run is done.
 * @property {{visited: number, pathLength: number | null, pathCost: number | null, timeMs: number | null}} stats
 */

/**
 * @typedef {object} Game
 * @property {() => GameState} getState
 * @property {(dtMs: number) => GameEvent[]} update Advances the animation; returns the events applied.
 * @property {() => void} finish Completes a running build or search instantly.
 * @property {(options?: {animate?: boolean}) => void} visualize Runs the selected algorithm.
 * @property {() => void} clearPath Removes the search overlay.
 * @property {() => void} clearBoard Removes walls, weights and the overlay.
 * @property {(id: string, seed: number, options?: {animate?: boolean}) => number} generateMaze
 *   Clears the board and builds a maze; returns the number of walls.
 * @property {(id: string) => void} setAlgorithm
 * @property {(cellsPerSecond: number) => void} setSpeed
 * @property {(cell: number, tool: 'wall' | 'weight') => StrokeAction} strokeAction
 *   What a pointer stroke that begins on `cell` does: drag an endpoint, paint or erase.
 * @property {(cell: number, action: PaintAction) => boolean} paint
 * @property {(from: number, to: number, action: PaintAction) => number} paintLine
 *   Paints every cell on the line between two cells; returns how many changed.
 * @property {(which: 'start' | 'end', cell: number) => boolean} moveEndpoint
 *   Moves an endpoint; the cell it covers comes back when it moves away.
 * @property {(rows: number, cols: number) => void} resize
 *   Changes the board size, keeping the cells and endpoints that still fit.
 */

/**
 * Creates a visualizer with an empty board.
 * @param {object} options
 * @param {number} options.rows
 * @param {number} options.cols
 * @param {string} [options.algorithm] Key of ALGORITHMS, 'astar' by default.
 * @param {number} [options.speed] Visited cells per second.
 * @param {() => number} [options.clock] Millisecond clock used for the time stat.
 * @returns {Game}
 */
export function createGame({ rows, cols, algorithm = 'astar', speed = SPEEDS.normal, clock = defaultClock }) {
  assertAlgorithm(algorithm);
  assertSpeed(speed);
  let grid = createGrid(rows, cols);
  let overlay = new Uint8Array(grid.cells.length);
  let under = { start: CELL.EMPTY, end: CELL.EMPTY };
  /** @type {Status} */
  let status = 'idle';
  /** @type {GameEvent[]} */
  let pending = [];
  let cursor = 0;
  let budget = 0;
  let visited = 0;
  /** @type {(import('./algorithms.js').Solution & {timeMs: number}) | null} */
  let run = null;

  function getState() {
    const done = status === 'done';
    return {
      rows: grid.rows,
      cols: grid.cols,
      cells: grid.cells,
      overlay,
      start: grid.start,
      end: grid.end,
      status,
      algorithm,
      speed,
      outcome: done ? (run.path ? 'found' : 'unreachable') : null,
      path: done ? run.path : null,
      stats: {
        visited,
        pathLength: done ? run.length : null,
        pathCost: done ? run.cost : null,
        timeMs: run ? run.timeMs : null,
      },
    };
  }

  function update(dtMs) {
    if (status !== 'building' && status !== 'running') return [];
    const dt = Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), MAX_FRAME_MS) : 0;
    budget += (dt * speed * (status === 'building' ? BUILD_SPEEDUP : 1)) / 1000;
    const applied = [];
    while (cursor < pending.length && EVENT_COST[pending[cursor].type] <= budget) {
      const event = pending[cursor++];
      budget -= EVENT_COST[event.type];
      applyEvent(event);
      applied.push(event);
    }
    if (cursor === pending.length) completeQueue();
    return applied;
  }

  function finish() {
    if (status !== 'building' && status !== 'running') return;
    while (cursor < pending.length) applyEvent(pending[cursor++]);
    completeQueue();
  }

  function visualize({ animate = true } = {}) {
    settleBuild();
    resetOverlay();
    const startedAt = clock();
    const solution = solve(grid, algorithm);
    run = { ...solution, timeMs: Math.max(0, clock() - startedAt) };
    startQueue(solution.steps, 'running');
    if (!animate) finish();
  }

  function clearPath() {
    settleBuild();
    if (status === 'running' || status === 'done') stopQueue();
    resetOverlay();
  }

  function clearBoard() {
    stopQueue();
    resetOverlay();
    grid.cells.fill(CELL.EMPTY);
    under = { start: CELL.EMPTY, end: CELL.EMPTY };
  }

  function generateMaze(id, seed, { animate = true } = {}) {
    if (!Object.hasOwn(MAZES, id)) throw new RangeError(`Unknown maze: ${id}`);
    clearBoard();
    const walls = MAZES[id](grid, createRng(seed));
    startQueue(walls.map((cell) => ({ type: 'wall', cell })), 'building');
    if (!animate) finish();
    return walls.length;
  }

  function setAlgorithm(id) {
    assertAlgorithm(id);
    algorithm = id;
    if (status === 'running' || status === 'done') clearPath();
  }

  function setSpeed(cellsPerSecond) {
    assertSpeed(cellsPerSecond);
    speed = cellsPerSecond;
  }

  function strokeAction(cell, tool) {
    if (tool !== 'wall' && tool !== 'weight') throw new RangeError(`Unknown tool: ${tool}`);
    if (cell === grid.start) return 'move-start';
    if (cell === grid.end) return 'move-end';
    return grid.cells[cell] === PAINT_TYPE[tool] ? 'erase' : tool;
  }

  function paint(cell, action) {
    const type = paintType(action);
    return edit(() => setCell(cell, type));
  }

  function paintLine(from, to, action) {
    const type = paintType(action);
    if (!isCell(from) || !isCell(to)) return 0;
    return edit(() => {
      let changed = 0;
      for (const cell of lineBetween(grid, from, to)) if (setCell(cell, type)) changed++;
      return changed;
    });
  }

  function moveEndpoint(which, cell) {
    if (which !== 'start' && which !== 'end') throw new RangeError(`Unknown endpoint: ${which}`);
    return edit(() => relocate(which, cell));
  }

  function resize(rows, cols) {
    const next = createGrid(rows, cols);
    clearPath();
    const old = grid;
    old.cells[old.start] = under.start;
    old.cells[old.end] = under.end;
    for (let row = 0; row < Math.min(rows, old.rows); row++) {
      for (let col = 0; col < Math.min(cols, old.cols); col++) {
        next.cells[toIndex(next, row, col)] = old.cells[toIndex(old, row, col)];
      }
    }
    let start = clampInto(old, next, old.start);
    let end = clampInto(old, next, old.end);
    if (start === end) ({ start, end } = defaultEndpoints(rows, cols));
    Object.assign(next, { start, end });
    under = { start: next.cells[start], end: next.cells[end] };
    next.cells[start] = CELL.EMPTY;
    next.cells[end] = CELL.EMPTY;
    grid = next;
    overlay = new Uint8Array(next.cells.length);
  }

  /**
   * Applies a board change. A running search is cancelled first; a finished one
   * is recomputed afterwards so the overlay matches the new board.
   */
  function edit(mutate) {
    settleBuild();
    if (status === 'running') clearPath();
    const changed = mutate();
    if (changed && status === 'done') visualize({ animate: false });
    return changed;
  }

  function setCell(cell, type) {
    if (!isCell(cell) || cell === grid.start || cell === grid.end) return false;
    if (grid.cells[cell] === type) return false;
    grid.cells[cell] = type;
    return true;
  }

  function relocate(which, cell) {
    const other = which === 'start' ? 'end' : 'start';
    if (!isCell(cell) || cell === grid[which] || cell === grid[other]) return false;
    grid.cells[grid[which]] = under[which];
    under[which] = grid.cells[cell];
    grid.cells[cell] = CELL.EMPTY;
    grid[which] = cell;
    return true;
  }

  function applyEvent({ type, cell }) {
    switch (type) {
      case 'wall':
        grid.cells[cell] = CELL.WALL;
        break;
      case 'visit':
        overlay[cell] = OVERLAY.VISITED;
        visited++;
        break;
      case 'frontier':
        if (overlay[cell] === OVERLAY.NONE) overlay[cell] = OVERLAY.FRONTIER;
        break;
      default:
        overlay[cell] = OVERLAY.PATH;
    }
  }

  function startQueue(events, nextStatus) {
    pending = events;
    cursor = 0;
    budget = 0;
    status = nextStatus;
  }

  function stopQueue() {
    startQueue([], 'idle');
  }

  function completeQueue() {
    startQueue([], status === 'building' ? 'idle' : 'done');
  }

  function settleBuild() {
    if (status === 'building') finish();
  }

  function resetOverlay() {
    overlay.fill(OVERLAY.NONE);
    visited = 0;
    run = null;
  }

  function isCell(cell) {
    return Number.isInteger(cell) && cell >= 0 && cell < grid.cells.length;
  }

  return {
    getState,
    update,
    finish,
    visualize,
    clearPath,
    clearBoard,
    generateMaze,
    setAlgorithm,
    setSpeed,
    strokeAction,
    paint,
    paintLine,
    moveEndpoint,
    resize,
  };
}

/**
 * Builds the deterministic `?demo` state: A* finished on a recursive-division
 * maze with a few weights, the path drawn and the explored area visible.
 * @param {object} options
 * @param {number} options.rows
 * @param {number} options.cols
 * @param {() => number} [options.clock]
 * @returns {Game}
 */
export function createDemoGame({ rows, cols, clock = defaultClock }) {
  const game = createGame({ rows, cols, algorithm: 'astar', clock });
  game.generateMaze('recursiveDivision', DEMO_SEED, { animate: false });
  const rng = createRng(DEMO_SEED);
  const { cells } = game.getState();
  for (let cell = 0; cell < cells.length; cell++) {
    if (cells[cell] === CELL.EMPTY && rng.next() < DEMO_WEIGHT_DENSITY) game.paint(cell, 'weight');
  }
  game.visualize({ animate: false });
  return game;
}

function defaultClock() {
  return globalThis.performance?.now() ?? Date.now();
}

function assertAlgorithm(id) {
  if (!Object.hasOwn(ALGORITHMS, id)) throw new RangeError(`Unknown algorithm: ${id}`);
}

function assertSpeed(value) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Invalid speed: ${value}`);
}

function paintType(action) {
  if (!Object.hasOwn(PAINT_TYPE, action)) throw new RangeError(`Unknown paint action: ${action}`);
  return PAINT_TYPE[action];
}

/** Maps a cell of one grid to the same row and column of another, clamped to its bounds. */
function clampInto(from, to, cell) {
  const { row, col } = toRowCol(from, cell);
  return toIndex(to, Math.min(row, to.rows - 1), Math.min(col, to.cols - 1));
}
