/**
 * Grid model: a rows x cols board whose cells are addressed by a linear
 * index (row * cols + col). Pure data and helpers, no DOM.
 */

/** Cell types stored in `grid.cells`. */
export const CELL = Object.freeze({ EMPTY: 0, WALL: 1, WEIGHT: 2 });

/** Cost of stepping onto a weighted cell; stepping onto any other open cell costs 1. */
export const WEIGHT_COST = 5;

/** Moves in neighbour order: up, right, down, left. */
const DIRECTIONS = Object.freeze([
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
]);

const FIT_MIN = 5;
const FIT_MAX_ROWS = 45;
const FIT_MAX_COLS = 79;

/**
 * @typedef {object} Grid
 * @property {number} rows
 * @property {number} cols
 * @property {Uint8Array} cells CELL type per index.
 * @property {number} start Index of the start node.
 * @property {number} end Index of the end node.
 */

/**
 * Creates an empty grid.
 * @param {number} rows Integer >= 2.
 * @param {number} cols Integer >= 2.
 * @param {{start: number, end: number}} [endpoints] Distinct cell indices; defaults to {@link defaultEndpoints}.
 * @returns {Grid}
 */
export function createGrid(rows, cols, endpoints) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2) {
    throw new RangeError(`Invalid grid size ${rows}x${cols}`);
  }
  const size = rows * cols;
  const { start, end } = endpoints ?? defaultEndpoints(rows, cols);
  if (!isIndex(start, size) || !isIndex(end, size) || start === end) {
    throw new RangeError(`Invalid endpoints ${start} and ${end}`);
  }
  return { rows, cols, cells: new Uint8Array(size), start, end };
}

/**
 * Converts a row and column to a cell index.
 * @param {Grid} grid
 * @param {number} row
 * @param {number} col
 * @returns {number}
 */
export function toIndex(grid, row, col) {
  return row * grid.cols + col;
}

/**
 * Converts a cell index to its row and column.
 * @param {Grid} grid
 * @param {number} index
 * @returns {{row: number, col: number}}
 */
export function toRowCol(grid, index) {
  const row = Math.floor(index / grid.cols);
  return { row, col: index - row * grid.cols };
}

/**
 * Tells whether a row and column lie on the grid.
 * @param {Grid} grid
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function inBounds(grid, row, col) {
  return row >= 0 && row < grid.rows && col >= 0 && col < grid.cols;
}

/**
 * Lists the open (non-wall) orthogonal neighbours of a cell in the order up, right, down, left.
 * @param {Grid} grid
 * @param {number} index
 * @returns {number[]}
 */
export function neighbors(grid, index) {
  const { row, col } = toRowCol(grid, index);
  const result = [];
  for (const [dr, dc] of DIRECTIONS) {
    const r = row + dr;
    const c = col + dc;
    if (!inBounds(grid, r, c)) continue;
    const next = toIndex(grid, r, c);
    if (grid.cells[next] !== CELL.WALL) result.push(next);
  }
  return result;
}

/**
 * Cost of stepping onto a cell: {@link WEIGHT_COST} for weighted cells, otherwise 1.
 * @param {Grid} grid
 * @param {number} index
 * @returns {number}
 */
export function cellCost(grid, index) {
  return grid.cells[index] === CELL.WEIGHT ? WEIGHT_COST : 1;
}

/**
 * Total cost of a path: the sum of the costs of every cell entered after the first.
 * @param {Grid} grid
 * @param {number[]} path Cell indices from start to end.
 * @returns {number}
 */
export function pathCost(grid, path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += cellCost(grid, path[i]);
  return total;
}

/**
 * Manhattan distance between two cells.
 * @param {Grid} grid
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function manhattan(grid, a, b) {
  const p = toRowCol(grid, a);
  const q = toRowCol(grid, b);
  return Math.abs(p.row - q.row) + Math.abs(p.col - q.col);
}

/**
 * Cells on the straight line between two cells (Bresenham), both ends included.
 * Lets a fast pointer drag paint a gap-free stroke.
 * @param {Grid} grid
 * @param {number} from
 * @param {number} to
 * @returns {number[]}
 */
export function lineBetween(grid, from, to) {
  let { row, col } = toRowCol(grid, from);
  const target = toRowCol(grid, to);
  const dCol = Math.abs(target.col - col);
  const dRow = -Math.abs(target.row - row);
  const stepCol = col < target.col ? 1 : -1;
  const stepRow = row < target.row ? 1 : -1;
  let error = dCol + dRow;
  const cells = [toIndex(grid, row, col)];
  while (row !== target.row || col !== target.col) {
    const doubled = 2 * error;
    if (doubled >= dRow) {
      error += dRow;
      col += stepCol;
    }
    if (doubled <= dCol) {
      error += dCol;
      row += stepRow;
    }
    cells.push(toIndex(grid, row, col));
  }
  return cells;
}

/**
 * Nearest "room" coordinate: an odd value inside the one-cell border, rounding down.
 * Mazes keep these coordinates open, so endpoints placed on them sit in corridors.
 * @param {number} value Row or column.
 * @param {number} size Number of rows or columns; must be at least 3.
 * @returns {number}
 */
export function alignToRoom(value, size) {
  const inside = Math.min(Math.max(value, 1), size - 2);
  return inside % 2 === 1 ? inside : inside - 1;
}

/**
 * Default start and end: same middle row, about a fifth of the width from each side,
 * aligned to maze rooms when the grid is at least 3x3.
 * @param {number} rows
 * @param {number} cols
 * @returns {{start: number, end: number}}
 */
export function defaultEndpoints(rows, cols) {
  const row = rows >= 3 ? alignToRoom(Math.floor(rows / 2), rows) : 0;
  let left = 0;
  let right = cols - 1;
  if (cols >= 3) {
    left = alignToRoom(Math.floor(cols / 5), cols);
    right = alignToRoom(cols - 1 - left, cols);
  }
  if (left === right) {
    left = 0;
    right = cols - 1;
  }
  return { start: row * cols + left, end: row * cols + right };
}

/**
 * Picks odd grid dimensions that fit an area with square cells of about `cellSize` pixels.
 * Odd sizes give mazes a clean one-cell border on every side.
 * @param {number} width Available width in CSS pixels.
 * @param {number} height Available height in CSS pixels.
 * @param {number} cellSize Preferred cell size in CSS pixels.
 * @returns {{rows: number, cols: number}}
 */
export function fitGridSize(width, height, cellSize) {
  return {
    rows: fitCount(height / cellSize, FIT_MAX_ROWS),
    cols: fitCount(width / cellSize, FIT_MAX_COLS),
  };
}

function fitCount(raw, max) {
  const count = Math.min(Math.max(Math.floor(raw) || 0, FIT_MIN), max);
  return count % 2 === 1 ? count : count - 1;
}

function isIndex(value, size) {
  return Number.isInteger(value) && value >= 0 && value < size;
}
