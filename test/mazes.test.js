import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAZES, randomizedDfs, recursiveDivision } from '../src/mazes.js';
import { CELL, createGrid, toRowCol } from '../src/grid.js';
import { createRng } from '../src/rng.js';
import { openComponents, referenceDistance } from '../test-support/helpers.js';

const GENERATORS = Object.entries(MAZES);

/** Grid of random size (3-40 x 3-50, both parities) with random, distinct endpoints anywhere. */
function randomBoard(seed) {
  const rng = createRng(seed);
  const rows = 3 + rng.int(38);
  const cols = 3 + rng.int(48);
  const start = rng.int(rows * cols);
  const end = (start + 1 + rng.int(rows * cols - 1)) % (rows * cols);
  return createGrid(rows, cols, { start, end });
}

function withWalls(grid, walls) {
  for (const cell of walls) grid.cells[cell] = CELL.WALL;
  return grid;
}

test('registry lists both generators in menu order', () => {
  assert.deepEqual(Object.keys(MAZES), ['recursiveDivision', 'randomizedDfs']);
  assert.equal(MAZES.recursiveDivision, recursiveDivision);
  assert.equal(MAZES.randomizedDfs, randomizedDfs);
});

for (const [name, generate] of GENERATORS) {
  describe(name, () => {
    test('200 seeded mazes keep start and end connected and every open cell reachable', () => {
      for (let seed = 1; seed <= 200; seed++) {
        const grid = randomBoard(seed);
        const walls = generate(grid, createRng(seed));
        const label = `seed ${seed}, ${grid.rows}x${grid.cols}`;
        assert.equal(new Set(walls).size, walls.length, `${label}: duplicate walls`);
        for (const cell of walls) {
          assert.ok(Number.isInteger(cell) && cell >= 0 && cell < grid.cells.length, `${label}: off-grid wall`);
        }
        assert.ok(!walls.includes(grid.start) && !walls.includes(grid.end), `${label}: endpoint walled`);
        withWalls(grid, walls);
        assert.ok(referenceDistance(grid) < Infinity, `${label}: start and end disconnected`);
        assert.equal(openComponents(grid), 1, `${label}: open cells split into islands`);
      }
    });

    test('odd-sized boards with endpoints on rooms become perfect mazes inside a full border', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const rows = 5 + 2 * (seed % 9);
        const cols = 5 + 2 * ((seed * 7) % 17);
        const grid = createGrid(rows, cols);
        withWalls(grid, generate(grid, createRng(seed)));
        const rooms = ((rows - 1) / 2) * ((cols - 1) / 2);
        const open = grid.cells.filter((type) => type !== CELL.WALL).length;
        assert.equal(open, 2 * rooms - 1, `seed ${seed}: a perfect maze has rooms + (rooms - 1) passages`);
        assert.equal(openComponents(grid), 1);
        for (let cell = 0; cell < grid.cells.length; cell++) {
          const { row, col } = toRowCol(grid, cell);
          const onBorder = row === 0 || col === 0 || row === rows - 1 || col === cols - 1;
          if (onBorder) assert.equal(grid.cells[cell], CELL.WALL, `seed ${seed}: border gap`);
          if (row % 2 === 1 && col % 2 === 1) assert.notEqual(grid.cells[cell], CELL.WALL, 'rooms stay open');
        }
      }
    });

    test('is deterministic for a seed and varies between seeds', () => {
      const grid = createGrid(21, 41);
      assert.deepEqual(generate(grid, createRng(5)), generate(grid, createRng(5)));
      assert.notDeepEqual(generate(grid, createRng(5)), generate(grid, createRng(6)));
    });

    test('leaves boards without an interior empty', () => {
      assert.deepEqual(generate(createGrid(2, 9), createRng(1)), []);
      assert.deepEqual(generate(createGrid(9, 2), createRng(1)), []);
    });
  });
}

test('recursive division draws the border first, clockwise from the top-left', () => {
  const grid = createGrid(9, 13);
  const walls = recursiveDivision(grid, createRng(3));
  const border = 2 * 9 + 2 * 13 - 4;
  const ring = walls.slice(0, border).map((cell) => toRowCol(grid, cell));
  assert.deepEqual(ring[0], { row: 0, col: 0 });
  assert.deepEqual(ring[12], { row: 0, col: 12 });
  assert.deepEqual(ring[20], { row: 8, col: 12 });
  assert.deepEqual(ring.at(-1), { row: 1, col: 0 });
  assert.ok(ring.every(({ row, col }) => row === 0 || col === 0 || row === 8 || col === 12));
  assert.ok(walls.length > border, 'interior walls follow the border');
});
