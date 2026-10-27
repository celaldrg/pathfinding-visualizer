import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ALGORITHMS, astar, bfs, dfs, dijkstra, greedy, solve } from '../src/algorithms.js';
import { CELL, createGrid } from '../src/grid.js';
import {
  assertValidPath,
  gridFromText,
  randomGrid,
  referenceDistance,
  referenceDistances,
  specCost,
} from '../test-support/helpers.js';

const IDS = Object.keys(ALGORITHMS);
const STEP_TYPES = new Set(['visit', 'frontier', 'path']);

/** Runs a generator by hand and returns its steps and its return value. */
function drain(search) {
  const steps = [];
  let result = search.next();
  while (!result.done) {
    steps.push(result.value);
    result = search.next();
  }
  return { steps, path: result.value };
}

const SAMPLE = [
  '..........',
  '.S..#.....',
  '....#..w..',
  '.####..w..',
  '.......wE.',
  '..........',
];

describe('registry', () => {
  test('lists the five algorithms in menu order', () => {
    assert.deepEqual(IDS, ['astar', 'dijkstra', 'bfs', 'greedy', 'dfs']);
    assert.equal(ALGORITHMS.astar.run, astar);
    assert.equal(ALGORITHMS.dijkstra.run, dijkstra);
    assert.equal(ALGORITHMS.bfs.run, bfs);
    assert.equal(ALGORITHMS.greedy.run, greedy);
    assert.equal(ALGORITHMS.dfs.run, dfs);
  });

  test('records which algorithms guarantee the shortest path', () => {
    const shortest = Object.fromEntries(IDS.map((id) => [id, ALGORITHMS[id].shortest]));
    assert.deepEqual(shortest, {
      astar: 'always',
      dijkstra: 'always',
      bfs: 'unweighted',
      greedy: 'never',
      dfs: 'never',
    });
    assert.deepEqual(
      IDS.filter((id) => ALGORITHMS[id].weighted),
      ['astar', 'dijkstra'],
    );
  });
});

describe('generator contract', () => {
  for (const id of IDS) {
    test(`${id} yields well-formed steps and returns the path it draws`, () => {
      const grid = gridFromText(SAMPLE);
      const { steps, path } = drain(ALGORITHMS[id].run(grid));
      assertValidPath(grid, path, id);
      for (const step of steps) {
        assert.ok(STEP_TYPES.has(step.type), `${id}: bad step type ${step.type}`);
        assert.notEqual(grid.cells[step.cell], CELL.WALL, `${id}: step on a wall`);
      }
      const visits = steps.filter((step) => step.type === 'visit').map((step) => step.cell);
      assert.equal(visits[0], grid.start, 'the start is visited first');
      assert.equal(visits.at(-1), grid.end, 'the search stops when it visits the end');
      assert.equal(new Set(visits).size, visits.length, 'no cell is visited twice');
      const firstPathStep = steps.findIndex((step) => step.type === 'path');
      assert.deepEqual(
        steps.slice(firstPathStep).map((step) => step.cell),
        path,
        'path steps come last and match the returned path',
      );
      assert.ok(steps.slice(firstPathStep).every((step) => step.type === 'path'));
    });
  }

  test('searches never modify the grid', () => {
    const grid = randomGrid(5, { weighted: true });
    const before = Uint8Array.from(grid.cells);
    const endpoints = [grid.start, grid.end];
    for (const id of IDS) drain(ALGORITHMS[id].run(grid));
    assert.deepEqual(grid.cells, before);
    assert.deepEqual([grid.start, grid.end], endpoints);
  });

  test('runs are deterministic', () => {
    for (const id of IDS) {
      assert.deepEqual(solve(randomGrid(8, { weighted: true }), id), solve(randomGrid(8, { weighted: true }), id));
    }
  });

  test('neighbouring endpoints: all but DFS take the single move, DFS wanders up first', () => {
    const grid = createGrid(3, 3, { start: 4, end: 5 });
    for (const id of IDS.filter((name) => name !== 'dfs')) assert.deepEqual(solve(grid, id).path, [4, 5], id);
    assert.deepEqual(solve(grid, 'dfs').path, [4, 1, 2, 5]);
  });
});

describe('solve()', () => {
  test('summarises a run consistently', () => {
    const grid = gridFromText(SAMPLE);
    for (const id of IDS) {
      const result = solve(grid, id);
      assert.equal(result.length, result.path.length - 1);
      assert.equal(result.cost, specCost(grid, result.path));
      assert.equal(result.visited, result.steps.filter((step) => step.type === 'visit').length);
    }
  });

  test('rejects unknown algorithms', () => {
    const grid = createGrid(3, 3);
    assert.throws(() => solve(grid, 'nope'), RangeError);
    assert.throws(() => solve(grid, 'toString'), RangeError);
  });
});

describe('unreachable targets', () => {
  const cases = {
    'end walled in': ['S......', '....#..', '...#E#.', '....#..'],
    'start walled in': ['.#.....', '#S#....', '.#...E.'],
    'board split by a wall': ['S..#...', '...#...', '...#..E'],
    'end walled in, weights around': ['Sww....', 'ww..#..', '...#E#w', 'w...#ww'],
  };
  for (const [name, lines] of Object.entries(cases)) {
    test(`${name}: every algorithm returns null after exploring the reachable area`, () => {
      const grid = gridFromText(lines);
      const reachable = referenceDistances(grid)
        .map((distance, cell) => (distance < Infinity ? cell : -1))
        .filter((cell) => cell >= 0);
      for (const id of IDS) {
        const { steps, path } = drain(ALGORITHMS[id].run(grid));
        assert.equal(path, null, id);
        assert.ok(!steps.some((step) => step.type === 'path'), `${id}: no path steps`);
        const visited = steps.filter((step) => step.type === 'visit').map((step) => step.cell);
        assert.deepEqual(
          [...visited].sort((a, b) => a - b),
          reachable,
          `${id}: explores exactly the reachable cells`,
        );
        const summary = solve(grid, id);
        assert.equal(summary.length, null);
        assert.equal(summary.cost, null);
      }
    });
  }
});

describe('weights', () => {
  const lines = ['.......', 'SwwwwwE', '.......'];

  test('Dijkstra and A* walk around weights; BFS and greedy go straight through', () => {
    const grid = gridFromText(lines);
    for (const id of ['dijkstra', 'astar']) {
      const result = solve(grid, id);
      assert.equal(result.cost, 8, id);
      assert.equal(result.length, 8, id);
    }
    for (const id of ['bfs', 'greedy']) {
      const result = solve(grid, id);
      assert.equal(result.length, 6, id);
      assert.equal(result.cost, 5 * 5 + 1, id);
    }
  });
});

describe('heuristic search', () => {
  test('A* with tie-breaking and greedy walk straight across an empty board', () => {
    const grid = createGrid(15, 15, { start: 7 * 15 + 2, end: 7 * 15 + 12 });
    for (const id of ['astar', 'greedy']) {
      const result = solve(grid, id);
      assert.equal(result.length, 10, id);
      assert.equal(result.visited, 11, `${id} only visits the straight line`);
    }
    assert.ok(solve(grid, 'dijkstra').visited > 100, 'Dijkstra floods the board');
  });

  test('A* never visits more cells than Dijkstra (consistent Manhattan heuristic)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const weighted of [false, true]) {
        const grid = randomGrid(seed, { weighted });
        const a = solve(grid, 'astar').visited;
        const d = solve(grid, 'dijkstra').visited;
        assert.ok(a <= d, `seed ${seed} weighted=${weighted}: A* ${a} > Dijkstra ${d}`);
      }
    }
  });
});

describe('non-optimal searches', () => {
  test('greedy and DFS return a valid path exactly when one exists (200 seeded grids)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const grid = randomGrid(seed, { weighted: seed % 2 === 0 });
      const reachable = referenceDistance(grid) < Infinity;
      for (const id of ['greedy', 'dfs']) {
        const { path } = solve(grid, id);
        if (reachable) assertValidPath(grid, path, `${id} seed ${seed}`);
        else assert.equal(path, null, `${id} seed ${seed}`);
      }
    }
  });
});
