// DONE criterion: BFS, Dijkstra and A* agree on optimal path lengths over
// 200 seeded grids, unweighted and weighted, checked against an independent oracle.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/algorithms.js';
import { CELL } from '../src/grid.js';
import { assertValidPath, gridFromText, randomGrid, referenceDistance, specCost } from '../test-support/helpers.js';

const GRID_COUNT = 200;
const OPTIMAL = ['bfs', 'dijkstra', 'astar'];

function solveAll(grid) {
  return Object.fromEntries(OPTIMAL.map((id) => [id, solve(grid, id)]));
}

describe('reference oracle (checked by hand first)', () => {
  test('matches hand-computed distances', () => {
    const detour = gridFromText(['.......', 'SwwwwwE', '.......']);
    assert.equal(referenceDistance(detour), 8);
    assert.equal(referenceDistance(detour, { unit: true }), 6);
    const maze = gridFromText(['S.#....', '.##.##.', '...#..E']);
    assert.equal(referenceDistance(maze), Infinity);
    assert.equal(referenceDistance(gridFromText(['S#.', '.#.', '..E'])), 4);
  });

  test('assertValidPath rejects broken paths', () => {
    const grid = gridFromText(['S.#', '...', '..E']);
    assertValidPath(grid, [0, 3, 4, 5, 8]);
    assert.throws(() => assertValidPath(grid, [0, 1, 2, 5, 8]), /wall/);
    assert.throws(() => assertValidPath(grid, [0, 4, 8]), /jumps/);
    assert.throws(() => assertValidPath(grid, [3, 4, 5, 8]), /start/);
    assert.throws(() => assertValidPath(grid, [0, 3, 4, 5]), /end/);
    assert.throws(() => assertValidPath(grid, [0, 3, 4, 3, 4, 5, 8]), /repeats/);
    assert.equal(specCost(gridFromText(['Sw', 'wE']), [0, 1, 3]), 6);
  });
});

describe('DONE criterion: BFS, Dijkstra and A* agree on optimal paths over 200 seeded grids', () => {
  test('unweighted grids: all three return equally long, truly shortest paths', () => {
    let reachable = 0;
    for (let seed = 1; seed <= GRID_COUNT; seed++) {
      const grid = randomGrid(seed);
      assert.ok(!grid.cells.includes(CELL.WEIGHT));
      const shortest = referenceDistance(grid);
      const results = solveAll(grid);
      for (const id of OPTIMAL) {
        const { path, length, cost } = results[id];
        const label = `${id}, seed ${seed}`;
        if (shortest === Infinity) {
          assert.equal(path, null, `${label}: unreachable end must give null`);
          continue;
        }
        assertValidPath(grid, path, label);
        assert.equal(length, shortest, `${label}: not the shortest length`);
        assert.equal(cost, shortest, `${label}: cost differs from length on an unweighted grid`);
      }
      if (shortest < Infinity) reachable++;
    }
    assert.ok(reachable >= 120, `too few reachable grids: ${reachable}`);
    assert.ok(GRID_COUNT - reachable >= 10, `too few unreachable grids: ${GRID_COUNT - reachable}`);
  });

  test('weighted grids: Dijkstra and A* return equal, truly cheapest costs; BFS the fewest moves', () => {
    let reachable = 0;
    let weightsChangedTheAnswer = 0;
    for (let seed = 1; seed <= GRID_COUNT; seed++) {
      const grid = randomGrid(seed, { weighted: true });
      assert.ok(grid.cells.includes(CELL.WEIGHT));
      const cheapest = referenceDistance(grid);
      const fewestMoves = referenceDistance(grid, { unit: true });
      const results = solveAll(grid);
      if (cheapest === Infinity) {
        for (const id of OPTIMAL) assert.equal(results[id].path, null, `${id}, seed ${seed}: expected null`);
        continue;
      }
      reachable++;
      for (const id of OPTIMAL) assertValidPath(grid, results[id].path, `${id}, seed ${seed}`);
      for (const id of ['dijkstra', 'astar']) {
        assert.equal(results[id].cost, cheapest, `${id}, seed ${seed}: not the cheapest cost`);
        assert.equal(specCost(grid, results[id].path), cheapest, `${id}, seed ${seed}: reported cost is wrong`);
      }
      assert.equal(results.dijkstra.cost, results.astar.cost);
      assert.equal(results.bfs.length, fewestMoves, `bfs, seed ${seed}: not the fewest moves`);
      assert.ok(results.bfs.cost >= cheapest);
      if (results.bfs.cost > cheapest) weightsChangedTheAnswer++;
    }
    assert.ok(reachable >= 120, `too few reachable grids: ${reachable}`);
    assert.ok(GRID_COUNT - reachable >= 10, `too few unreachable grids: ${GRID_COUNT - reachable}`);
    assert.ok(weightsChangedTheAnswer >= 40, `weights rarely mattered: ${weightsChangedTheAnswer}`);
  });
});
