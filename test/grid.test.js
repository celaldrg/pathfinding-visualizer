import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL,
  WEIGHT_COST,
  alignToRoom,
  cellCost,
  createGrid,
  defaultEndpoints,
  fitGridSize,
  inBounds,
  lineBetween,
  manhattan,
  neighbors,
  pathCost,
  toIndex,
  toRowCol,
} from '../src/grid.js';

test('createGrid builds an empty board with distinct default endpoints', () => {
  const grid = createGrid(21, 45);
  assert.equal(grid.cells.length, 21 * 45);
  assert.ok(grid.cells.every((type) => type === CELL.EMPTY));
  assert.notEqual(grid.start, grid.end);
  const start = toRowCol(grid, grid.start);
  const end = toRowCol(grid, grid.end);
  assert.equal(start.row, end.row);
  assert.ok(start.col < end.col);
  for (const value of [start.row, start.col, end.col]) assert.equal(value % 2, 1, 'endpoints sit on maze rooms');
});

test('createGrid accepts explicit endpoints and rejects bad input', () => {
  const grid = createGrid(3, 4, { start: 0, end: 11 });
  assert.equal(grid.start, 0);
  assert.equal(grid.end, 11);
  assert.throws(() => createGrid(1, 10), RangeError);
  assert.throws(() => createGrid(5, 2.5), RangeError);
  assert.throws(() => createGrid(3, 3, { start: 4, end: 4 }), RangeError);
  assert.throws(() => createGrid(3, 3, { start: 0, end: 9 }), RangeError);
});

test('defaultEndpoints are distinct and on the board for every small size', () => {
  for (let rows = 2; rows <= 12; rows++) {
    for (let cols = 2; cols <= 12; cols++) {
      const { start, end } = defaultEndpoints(rows, cols);
      assert.notEqual(start, end, `${rows}x${cols}`);
      for (const cell of [start, end]) assert.ok(cell >= 0 && cell < rows * cols, `${rows}x${cols}`);
    }
  }
});

test('toIndex and toRowCol are inverse', () => {
  const grid = createGrid(7, 9);
  for (let cell = 0; cell < grid.cells.length; cell++) {
    const { row, col } = toRowCol(grid, cell);
    assert.ok(inBounds(grid, row, col));
    assert.equal(toIndex(grid, row, col), cell);
  }
  assert.equal(inBounds(grid, -1, 0), false);
  assert.equal(inBounds(grid, 0, 9), false);
});

test('neighbors lists open cells in the order up, right, down, left', () => {
  const grid = createGrid(3, 3, { start: 0, end: 8 });
  assert.deepEqual(neighbors(grid, 4), [1, 5, 7, 3]);
  assert.deepEqual(neighbors(grid, 0), [1, 3]);
  grid.cells[5] = CELL.WALL;
  grid.cells[7] = CELL.WEIGHT;
  assert.deepEqual(neighbors(grid, 4), [1, 7, 3]);
});

test('weighted cells cost 5, others 1, and path cost skips the first cell', () => {
  assert.equal(WEIGHT_COST, 5);
  const grid = createGrid(2, 4, { start: 0, end: 3 });
  grid.cells[1] = CELL.WEIGHT;
  assert.equal(cellCost(grid, 1), 5);
  assert.equal(cellCost(grid, 2), 1);
  assert.equal(pathCost(grid, [0, 1, 2, 3]), 5 + 1 + 1);
  assert.equal(pathCost(grid, [0]), 0);
});

test('manhattan distance', () => {
  const grid = createGrid(5, 5);
  assert.equal(manhattan(grid, toIndex(grid, 0, 0), toIndex(grid, 4, 3)), 7);
  assert.equal(manhattan(grid, 12, 12), 0);
});

test('lineBetween returns a gap-free line including both ends', () => {
  const grid = createGrid(20, 30);
  const cases = [
    [toIndex(grid, 2, 3), toIndex(grid, 2, 3)],
    [toIndex(grid, 0, 0), toIndex(grid, 0, 7)],
    [toIndex(grid, 9, 4), toIndex(grid, 1, 4)],
    [toIndex(grid, 0, 0), toIndex(grid, 19, 29)],
    [toIndex(grid, 15, 2), toIndex(grid, 3, 27)],
  ];
  for (const [from, to] of cases) {
    const line = lineBetween(grid, from, to);
    assert.equal(line[0], from);
    assert.equal(line.at(-1), to);
    for (let i = 1; i < line.length; i++) {
      const a = toRowCol(grid, line[i - 1]);
      const b = toRowCol(grid, line[i]);
      const step = Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
      assert.equal(step, 1, 'consecutive cells touch');
    }
  }
  assert.equal(lineBetween(grid, toIndex(grid, 0, 0), toIndex(grid, 0, 7)).length, 8);
});

test('alignToRoom snaps to the nearest odd coordinate inside the border', () => {
  assert.equal(alignToRoom(0, 21), 1);
  assert.equal(alignToRoom(5, 21), 5);
  assert.equal(alignToRoom(6, 21), 5);
  assert.equal(alignToRoom(20, 21), 19);
  assert.equal(alignToRoom(19, 20), 17);
  assert.equal(alignToRoom(1, 3), 1);
});

test('fitGridSize picks odd sizes that fit, with fewer columns on phones', () => {
  const phone = fitGridSize(343, 420, 24);
  const desktop = fitGridSize(1150, 560, 26);
  for (const size of [phone, desktop]) {
    assert.equal(size.rows % 2, 1);
    assert.equal(size.cols % 2, 1);
  }
  assert.ok(phone.cols * 24 <= 343 && phone.rows * 24 <= 420);
  assert.ok(desktop.cols * 26 <= 1150);
  assert.ok(phone.cols < desktop.cols);
  assert.deepEqual(fitGridSize(0, Number.NaN, 24), { rows: 5, cols: 5 });
  assert.deepEqual(fitGridSize(100000, 100000, 10), { rows: 45, cols: 79 });
});
