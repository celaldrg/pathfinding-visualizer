// Shared test helpers: seeded random grids and an independent shortest-path oracle.
// Kept outside test/, because `node --test` runs every .js file under test/ as a test file.
import assert from 'node:assert/strict';
import { CELL, createGrid } from '../src/grid.js';
import { createRng } from '../src/rng.js';

/** Cost of a weighted cell according to the spec, kept separate from src on purpose. */
const SPEC_WEIGHT_COST = 5;

/**
 * Seeded random grid, 4-21 rows by 4-27 columns, with 10-40 % walls and, when
 * `weighted`, 15-50 % of the remaining cells weighted. Endpoints are random and distinct.
 * @param {number} seed
 * @param {{weighted?: boolean}} [options]
 */
export function randomGrid(seed, { weighted = false } = {}) {
  const rng = createRng(seed);
  const rows = 4 + rng.int(18);
  const cols = 4 + rng.int(24);
  const size = rows * cols;
  const start = rng.int(size);
  const end = (start + 1 + rng.int(size - 1)) % size;
  const grid = createGrid(rows, cols, { start, end });
  const wallDensity = 0.1 + rng.next() * 0.3;
  const weightDensity = weighted ? 0.15 + rng.next() * 0.35 : 0;
  for (let cell = 0; cell < size; cell++) {
    if (cell === start || cell === end) continue;
    const roll = rng.next();
    if (roll < wallDensity) grid.cells[cell] = CELL.WALL;
    else if (roll < wallDensity + weightDensity) grid.cells[cell] = CELL.WEIGHT;
  }
  return grid;
}

/**
 * Builds a grid from rows of text: '#' wall, 'w' weight, 'S' start, 'E' end, anything else empty.
 * @param {string[]} lines
 */
export function gridFromText(lines) {
  const rows = lines.length;
  const cols = lines[0].length;
  const flat = lines.join('');
  const grid = createGrid(rows, cols, { start: flat.indexOf('S'), end: flat.indexOf('E') });
  for (let cell = 0; cell < flat.length; cell++) {
    if (flat[cell] === '#') grid.cells[cell] = CELL.WALL;
    if (flat[cell] === 'w') grid.cells[cell] = CELL.WEIGHT;
  }
  return grid;
}

/**
 * Shortest distance from every cell to `grid.start` by repeated edge relaxation
 * (Bellman-Ford style, no priority queue), independent of the code under test.
 * @param {import('../src/grid.js').Grid} grid
 * @param {{unit?: boolean}} [options] unit: treat every step as cost 1.
 * @returns {number[]} Infinity for unreachable cells.
 */
export function referenceDistances(grid, { unit = false } = {}) {
  const { rows, cols, cells } = grid;
  const dist = new Array(rows * cols).fill(Infinity);
  dist[grid.start] = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let cell = 0; cell < dist.length; cell++) {
      if (dist[cell] === Infinity) continue;
      for (const next of adjacent(rows, cols, cell)) {
        if (cells[next] === CELL.WALL) continue;
        const step = !unit && cells[next] === CELL.WEIGHT ? SPEC_WEIGHT_COST : 1;
        if (dist[cell] + step < dist[next]) {
          dist[next] = dist[cell] + step;
          changed = true;
        }
      }
    }
  }
  return dist;
}

/**
 * Shortest distance from start to end; Infinity when unreachable.
 * @param {import('../src/grid.js').Grid} grid
 * @param {{unit?: boolean}} [options]
 */
export function referenceDistance(grid, options) {
  return referenceDistances(grid, options)[grid.end];
}

/** Cost of a path computed with the spec's costs, independent of src/grid.js. */
export function specCost(grid, path) {
  return path.slice(1).reduce((sum, cell) => sum + (grid.cells[cell] === CELL.WEIGHT ? SPEC_WEIGHT_COST : 1), 0);
}

/**
 * Asserts that a path starts at the start, ends at the end, moves one orthogonal
 * step at a time, never enters a wall and never repeats a cell.
 */
export function assertValidPath(grid, path, label = '') {
  assert.ok(Array.isArray(path) && path.length > 0, `${label}: path missing`);
  assert.equal(path[0], grid.start, `${label}: path must begin at start`);
  assert.equal(path.at(-1), grid.end, `${label}: path must finish at end`);
  assert.equal(new Set(path).size, path.length, `${label}: path repeats a cell`);
  for (let i = 0; i < path.length; i++) {
    assert.ok(Number.isInteger(path[i]) && path[i] >= 0 && path[i] < grid.cells.length, `${label}: off-grid cell`);
    assert.notEqual(grid.cells[path[i]], CELL.WALL, `${label}: path crosses a wall`);
    if (i > 0) assert.ok(adjacent(grid.rows, grid.cols, path[i - 1]).includes(path[i]), `${label}: path jumps`);
  }
}

/**
 * Number of open-cell components (4-connected), counted by flood fill.
 * @param {import('../src/grid.js').Grid} grid
 */
export function openComponents(grid) {
  const seen = new Uint8Array(grid.cells.length);
  let components = 0;
  for (let first = 0; first < grid.cells.length; first++) {
    if (seen[first] || grid.cells[first] === CELL.WALL) continue;
    components++;
    const stack = [first];
    seen[first] = 1;
    while (stack.length > 0) {
      for (const next of adjacent(grid.rows, grid.cols, stack.pop())) {
        if (seen[next] || grid.cells[next] === CELL.WALL) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return components;
}

/** In-bounds orthogonal neighbours of a cell, walls included. */
function adjacent(rows, cols, cell) {
  const row = Math.floor(cell / cols);
  const col = cell % cols;
  const result = [];
  if (row > 0) result.push(cell - cols);
  if (row < rows - 1) result.push(cell + cols);
  if (col > 0) result.push(cell - 1);
  if (col < cols - 1) result.push(cell + 1);
  return result;
}
