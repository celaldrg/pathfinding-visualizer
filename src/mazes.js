/**
 * Seeded maze generators. Each one reads the grid's size and endpoints and
 * returns the wall cells in placement order, so a UI can animate the build.
 *
 * Layout: a one-cell border of walls around the board; "rooms" sit on odd
 * rows and columns and are always open, walls only ever run along even rows
 * or columns. Every open cell ends up connected, and the start and end are
 * never walled in: when an endpoint is not on a room, a short L-shaped link
 * to the nearest room is kept open.
 */
import { alignToRoom, toIndex, toRowCol } from './grid.js';

/** @typedef {import('./grid.js').Grid} Grid */
/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {{top: number, left: number, bottom: number, right: number}} Chamber */

/** Steps between neighbouring rooms: up, right, down, left. */
const ROOM_STEPS = Object.freeze([
  [-2, 0],
  [0, 2],
  [2, 0],
  [0, -2],
]);

/**
 * Recursive division: draws the border, then keeps splitting chambers with a
 * wall that has a single gap.
 * @param {Grid} grid Only rows, cols, start and end are read.
 * @param {Rng} rng
 * @returns {number[]} Wall cells in placement order (no duplicates).
 */
export function recursiveDivision(grid, rng) {
  if (!hasInterior(grid)) return [];
  const walls = borderCells(grid);
  divide(grid, rng, walls, { top: 1, left: 1, bottom: grid.rows - 2, right: grid.cols - 2 });
  return keepEndpointsOpen(grid, walls);
}

/**
 * Randomized depth-first search (recursive backtracker): starts with every
 * cell walled and carves a spanning tree through the rooms.
 * @param {Grid} grid Only rows, cols, start and end are read.
 * @param {Rng} rng
 * @returns {number[]} Wall cells in row-major order (no duplicates).
 */
export function randomizedDfs(grid, rng) {
  if (!hasInterior(grid)) return [];
  const open = new Uint8Array(grid.rows * grid.cols);
  const roomRows = (grid.rows - 1) >> 1;
  const roomCols = (grid.cols - 1) >> 1;
  const first = toIndex(grid, 1 + 2 * rng.int(roomRows), 1 + 2 * rng.int(roomCols));
  open[first] = 1;
  const stack = [first];
  while (stack.length > 0) {
    const cell = stack[stack.length - 1];
    const choices = closedRoomsAround(grid, open, cell);
    if (choices.length === 0) {
      stack.pop();
      continue;
    }
    const next = choices[rng.int(choices.length)];
    open[(cell + next) / 2] = 1;
    open[next] = 1;
    stack.push(next);
  }
  const walls = [];
  for (let cell = 0; cell < open.length; cell++) if (!open[cell]) walls.push(cell);
  return keepEndpointsOpen(grid, walls);
}

/** Maze registry in menu order. */
export const MAZES = Object.freeze({ recursiveDivision, randomizedDfs });

function hasInterior(grid) {
  return grid.rows >= 3 && grid.cols >= 3;
}

/** Border cells clockwise from the top-left corner. */
function borderCells(grid) {
  const { rows, cols } = grid;
  const cells = [];
  for (let col = 0; col < cols; col++) cells.push(toIndex(grid, 0, col));
  for (let row = 1; row < rows; row++) cells.push(toIndex(grid, row, cols - 1));
  for (let col = cols - 2; col >= 0; col--) cells.push(toIndex(grid, rows - 1, col));
  for (let row = rows - 2; row >= 1; row--) cells.push(toIndex(grid, row, 0));
  return cells;
}

/**
 * Splits a chamber (whose top and left are odd) along an even row or column,
 * leaving one gap on an odd column or row, then recurses into both halves.
 * Chambers thinner than three cells stay open.
 * @param {Grid} grid
 * @param {Rng} rng
 * @param {number[]} walls Receives the new wall cells.
 * @param {Chamber} chamber
 */
function divide(grid, rng, walls, chamber) {
  const height = chamber.bottom - chamber.top + 1;
  const width = chamber.right - chamber.left + 1;
  if (height < 3 || width < 3) return;
  const horizontal = height > width || (height === width && rng.int(2) === 0);
  if (horizontal) {
    const row = chamber.top + 1 + 2 * rng.int((chamber.bottom - chamber.top) >> 1);
    const gap = chamber.left + 2 * rng.int(((chamber.right - chamber.left) >> 1) + 1);
    for (let col = chamber.left; col <= chamber.right; col++) {
      if (col !== gap) walls.push(toIndex(grid, row, col));
    }
    divide(grid, rng, walls, { ...chamber, bottom: row - 1 });
    divide(grid, rng, walls, { ...chamber, top: row + 1 });
  } else {
    const col = chamber.left + 1 + 2 * rng.int((chamber.right - chamber.left) >> 1);
    const gap = chamber.top + 2 * rng.int(((chamber.bottom - chamber.top) >> 1) + 1);
    for (let row = chamber.top; row <= chamber.bottom; row++) {
      if (row !== gap) walls.push(toIndex(grid, row, col));
    }
    divide(grid, rng, walls, { ...chamber, right: col - 1 });
    divide(grid, rng, walls, { ...chamber, left: col + 1 });
  }
}

/** Unvisited rooms two cells away from `cell`. */
function closedRoomsAround(grid, open, cell) {
  const { row, col } = toRowCol(grid, cell);
  const result = [];
  for (const [dr, dc] of ROOM_STEPS) {
    const r = row + dr;
    const c = col + dc;
    if (r < 1 || c < 1 || r > grid.rows - 2 || c > grid.cols - 2) continue;
    const next = toIndex(grid, r, c);
    if (!open[next]) result.push(next);
  }
  return result;
}

/** Drops the endpoints and their links to the nearest room from a wall list. */
function keepEndpointsOpen(grid, walls) {
  const keep = new Set([...linkToRoom(grid, grid.start), ...linkToRoom(grid, grid.end)]);
  return walls.filter((cell) => !keep.has(cell));
}

/** Cells of an L-shaped link from `cell` to its nearest room, both ends included. */
function linkToRoom(grid, cell) {
  const { row, col } = toRowCol(grid, cell);
  const roomRow = alignToRoom(row, grid.rows);
  const roomCol = alignToRoom(col, grid.cols);
  const cells = [];
  for (let r = row; r !== roomRow; r += Math.sign(roomRow - r)) cells.push(toIndex(grid, r, col));
  for (let c = col; c !== roomCol; c += Math.sign(roomCol - c)) cells.push(toIndex(grid, roomRow, c));
  cells.push(toIndex(grid, roomRow, roomCol));
  return cells;
}
