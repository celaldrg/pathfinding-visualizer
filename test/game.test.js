import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { OVERLAY, SPEEDS, createDemoGame, createGame } from '../src/game.js';
import { solve } from '../src/algorithms.js';
import { CELL, createGrid, toIndex } from '../src/grid.js';
import { MAZES } from '../src/mazes.js';
import { createRng } from '../src/rng.js';
import { assertValidPath } from '../test-support/helpers.js';

/** Clock that advances 2 ms per reading. */
function fakeClock() {
  let now = 0;
  return () => (now += 2);
}

const at = (state, row, col) => toIndex(state, row, col);

/** Advances the animation in 16 ms frames until it settles. */
function runToEnd(game) {
  for (let frame = 0; frame < 100000 && ['building', 'running'].includes(game.getState().status); frame++) {
    game.update(16);
  }
  return game.getState();
}

describe('setup', () => {
  test('starts idle on an empty board', () => {
    const game = createGame({ rows: 9, cols: 15 });
    const state = game.getState();
    assert.equal(state.rows, 9);
    assert.equal(state.cols, 15);
    assert.equal(state.status, 'idle');
    assert.equal(state.algorithm, 'astar');
    assert.equal(state.speed, SPEEDS.normal);
    assert.ok(state.cells.every((type) => type === CELL.EMPTY));
    assert.ok(state.overlay.every((value) => value === OVERLAY.NONE));
    assert.notEqual(state.start, state.end);
    assert.equal(state.outcome, null);
    assert.equal(state.path, null);
    assert.deepEqual(state.stats, { visited: 0, pathLength: null, pathCost: null, timeMs: null });
  });

  test('rejects bad options', () => {
    assert.throws(() => createGame({ rows: 9, cols: 9, algorithm: 'nope' }), RangeError);
    assert.throws(() => createGame({ rows: 9, cols: 9, speed: 0 }), RangeError);
    assert.throws(() => createGame({ rows: 1, cols: 9 }), RangeError);
  });

  test('speeds increase from slow to fast', () => {
    assert.ok(SPEEDS.slow < SPEEDS.normal && SPEEDS.normal < SPEEDS.fast);
  });
});

describe('editing', () => {
  test('strokeAction drags endpoints, toggles walls and weights', () => {
    const game = createGame({ rows: 7, cols: 9 });
    const { start, end } = game.getState();
    assert.equal(game.strokeAction(start, 'wall'), 'move-start');
    assert.equal(game.strokeAction(end, 'weight'), 'move-end');
    assert.equal(game.strokeAction(0, 'wall'), 'wall');
    game.paint(0, 'wall');
    assert.equal(game.strokeAction(0, 'wall'), 'erase');
    assert.equal(game.strokeAction(0, 'weight'), 'weight');
    game.paint(0, 'weight');
    assert.equal(game.strokeAction(0, 'weight'), 'erase');
    assert.throws(() => game.strokeAction(0, 'brush'), RangeError);
  });

  test('paint sets cells, reports changes and protects the endpoints', () => {
    const game = createGame({ rows: 7, cols: 9 });
    const { start, cells } = game.getState();
    assert.equal(game.paint(3, 'wall'), true);
    assert.equal(cells[3], CELL.WALL);
    assert.equal(game.paint(3, 'wall'), false);
    assert.equal(game.paint(3, 'weight'), true);
    assert.equal(cells[3], CELL.WEIGHT);
    assert.equal(game.paint(3, 'erase'), true);
    assert.equal(cells[3], CELL.EMPTY);
    assert.equal(game.paint(start, 'wall'), false);
    assert.equal(cells[start], CELL.EMPTY);
    assert.equal(game.paint(-1, 'wall'), false);
    assert.equal(game.paint(7 * 9, 'wall'), false);
    assert.throws(() => game.paint(3, 'paint'), RangeError);
  });

  test('paintLine fills the gap between two pointer positions but skips endpoints', () => {
    const game = createGame({ rows: 7, cols: 9 });
    const state = game.getState();
    const changed = game.paintLine(at(state, 3, 0), at(state, 3, 8), 'wall');
    assert.equal(changed, 9 - 2);
    for (let col = 0; col < 9; col++) {
      const cell = at(state, 3, col);
      const expected = cell === state.start || cell === state.end ? CELL.EMPTY : CELL.WALL;
      assert.equal(state.cells[cell], expected);
    }
    assert.equal(game.paintLine(at(state, 3, 0), at(state, 3, 8), 'wall'), 0);
    assert.equal(game.paintLine(-5, at(state, 3, 8), 'wall'), 0);
  });

  test('moveEndpoint moves over walls and restores what it covered', () => {
    const game = createGame({ rows: 7, cols: 9 });
    const state = game.getState();
    const wall = at(state, 5, 5);
    const weight = at(state, 5, 6);
    game.paint(wall, 'wall');
    game.paint(weight, 'weight');
    assert.equal(game.moveEndpoint('start', wall), true);
    assert.equal(game.getState().start, wall);
    assert.equal(state.cells[wall], CELL.EMPTY);
    assert.equal(game.moveEndpoint('start', weight), true);
    assert.equal(state.cells[wall], CELL.WALL, 'the covered wall comes back');
    assert.equal(game.moveEndpoint('start', 0), true);
    assert.equal(state.cells[weight], CELL.WEIGHT, 'the covered weight comes back');
    assert.equal(game.moveEndpoint('start', game.getState().end), false, 'endpoints cannot overlap');
    assert.equal(game.moveEndpoint('start', 0), false, 'no-op move');
    assert.equal(game.moveEndpoint('end', 7 * 9), false, 'off the board');
    assert.throws(() => game.moveEndpoint('middle', 1), RangeError);
  });
});

describe('running an algorithm', () => {
  test('visualize precomputes the run and update(dt) reveals it at the chosen speed', () => {
    const game = createGame({ rows: 7, cols: 11, algorithm: 'bfs', speed: 10, clock: fakeClock() });
    game.visualize();
    let state = game.getState();
    assert.equal(state.status, 'running');
    assert.equal(state.stats.timeMs, 2);
    assert.equal(state.stats.visited, 0);

    const first = game.update(100);
    assert.deepEqual(first[0], { type: 'visit', cell: state.start });
    assert.ok(first.slice(1).every((event) => event.type === 'frontier'), 'frontier cells arrive with their visit');
    assert.ok(first.length > 1);
    assert.equal(game.getState().stats.visited, 1);
    assert.equal(state.overlay[state.start], OVERLAY.VISITED);
    assert.equal(state.overlay[first[1].cell], OVERLAY.FRONTIER);

    state = runToEnd(game);
    const expected = solve(createGrid(7, 11), 'bfs');
    assert.equal(state.status, 'done');
    assert.equal(state.outcome, 'found');
    assert.deepEqual(state.path, expected.path);
    assert.deepEqual(state.stats, {
      visited: expected.visited,
      pathLength: expected.length,
      pathCost: expected.cost,
      timeMs: 2,
    });
    for (const cell of expected.path) assert.equal(state.overlay[cell], OVERLAY.PATH);
  });

  test('update ignores idle states, huge frames and bad input', () => {
    const game = createGame({ rows: 9, cols: 15, speed: 10 });
    assert.deepEqual(game.update(16), []);
    game.visualize();
    assert.deepEqual(game.update(Number.NaN), []);
    const events = game.update(60_000);
    assert.equal(events.filter((event) => event.type === 'visit').length, 2, 'a frame counts at most 250 ms');
  });

  test('finish and visualize({animate: false}) complete instantly', () => {
    const game = createGame({ rows: 9, cols: 15 });
    game.visualize();
    game.finish();
    assert.equal(game.getState().status, 'done');
    game.clearPath();
    game.visualize({ animate: false });
    assert.equal(game.getState().status, 'done');
    assert.equal(game.getState().outcome, 'found');
  });

  test('an unreachable end finishes with outcome "unreachable"', () => {
    const game = createGame({ rows: 7, cols: 9 });
    const { end, cols } = game.getState();
    for (const neighbour of [end - cols, end + cols, end - 1, end + 1]) game.paint(neighbour, 'wall');
    game.visualize({ animate: false });
    const state = game.getState();
    assert.equal(state.outcome, 'unreachable');
    assert.equal(state.path, null);
    assert.equal(state.stats.pathLength, null);
    assert.equal(state.stats.pathCost, null);
    assert.ok(state.stats.visited > 0);
    assert.ok(!state.overlay.includes(OVERLAY.PATH));
  });

  test('editing during a run cancels it', () => {
    const game = createGame({ rows: 9, cols: 15 });
    game.visualize();
    game.update(100);
    assert.ok(game.getState().stats.visited > 0);
    game.paint(0, 'wall');
    const state = game.getState();
    assert.equal(state.status, 'idle');
    assert.equal(state.stats.visited, 0);
    assert.ok(state.overlay.every((value) => value === OVERLAY.NONE));
  });

  test('editing a finished run recomputes the path instantly', () => {
    const game = createGame({ rows: 5, cols: 9 });
    game.visualize({ animate: false });
    assert.equal(game.getState().stats.pathLength, 6);
    const blocker = at(game.getState(), 1, 4);
    game.paint(blocker, 'wall');
    let state = game.getState();
    assert.equal(state.status, 'done');
    assert.equal(state.stats.pathLength, 8);
    assert.ok(!state.path.includes(blocker));
    assertValidPath(state, state.path, 'after painting');

    const newEnd = at(state, 3, 7);
    game.moveEndpoint('end', newEnd);
    state = game.getState();
    assert.equal(state.status, 'done');
    assert.equal(state.path.at(-1), newEnd);
    assertValidPath(state, state.path, 'after moving the end');
  });

  test('changing the algorithm clears a finished run', () => {
    const game = createGame({ rows: 9, cols: 15 });
    game.visualize({ animate: false });
    game.setAlgorithm('dijkstra');
    const state = game.getState();
    assert.equal(state.algorithm, 'dijkstra');
    assert.equal(state.status, 'idle');
    assert.ok(state.overlay.every((value) => value === OVERLAY.NONE));
    assert.throws(() => game.setAlgorithm('fastest'), RangeError);
  });

  test('setSpeed validates its input', () => {
    const game = createGame({ rows: 9, cols: 15 });
    game.setSpeed(SPEEDS.fast);
    assert.equal(game.getState().speed, SPEEDS.fast);
    assert.throws(() => game.setSpeed(-1), RangeError);
    assert.throws(() => game.setSpeed(Infinity), RangeError);
  });
});

describe('mazes and clearing', () => {
  test('generateMaze animates the walls of the chosen generator', () => {
    const game = createGame({ rows: 11, cols: 21 });
    game.paint(0, 'weight');
    const count = game.generateMaze('recursiveDivision', 9);
    let state = game.getState();
    assert.equal(state.status, 'building');
    assert.ok(state.cells.every((type) => type === CELL.EMPTY), 'the board is cleared first');
    const events = game.update(100);
    assert.ok(events.length > 0 && events.every((event) => event.type === 'wall'));
    assert.equal(state.cells.filter((type) => type === CELL.WALL).length, events.length);

    state = runToEnd(game);
    assert.equal(state.status, 'idle');
    const expected = MAZES.recursiveDivision(createGrid(11, 21), createRng(9));
    assert.equal(count, expected.length);
    const walls = [...state.cells.keys()].filter((cell) => state.cells[cell] === CELL.WALL);
    assert.deepEqual(walls, [...expected].sort((a, b) => a - b));
  });

  test('generateMaze can skip the animation and rejects unknown mazes', () => {
    const game = createGame({ rows: 11, cols: 21 });
    game.generateMaze('randomizedDfs', 4, { animate: false });
    const state = game.getState();
    assert.equal(state.status, 'idle');
    assert.ok(state.cells.includes(CELL.WALL));
    assert.throws(() => game.generateMaze('spiral', 1), RangeError);
  });

  test('visualize and paint finish a maze that is still being built', () => {
    const game = createGame({ rows: 11, cols: 21 });
    const count = game.generateMaze('randomizedDfs', 2);
    game.visualize({ animate: false });
    let state = game.getState();
    assert.equal(state.cells.filter((type) => type === CELL.WALL).length, count);
    assert.equal(state.outcome, 'found');

    game.generateMaze('recursiveDivision', 2);
    game.paint(at(state, 1, 2), 'weight');
    state = game.getState();
    assert.equal(state.status, 'idle');
    assert.ok(state.cells.filter((type) => type === CELL.WALL).length > 0);
  });

  test('clearPath keeps the board; clearBoard empties it, covered cells included', () => {
    const game = createGame({ rows: 9, cols: 15 });
    game.paint(0, 'wall');
    game.paint(1, 'wall');
    game.moveEndpoint('end', 1);
    game.visualize({ animate: false });
    game.clearPath();
    let state = game.getState();
    assert.equal(state.status, 'idle');
    assert.ok(state.overlay.every((value) => value === OVERLAY.NONE));
    assert.deepEqual(state.stats, { visited: 0, pathLength: null, pathCost: null, timeMs: null });
    assert.equal(state.cells[0], CELL.WALL);

    game.clearBoard();
    game.moveEndpoint('end', 2);
    state = game.getState();
    assert.ok(state.cells.every((type) => type === CELL.EMPTY));
  });

  test('resize keeps what still fits, including cells covered by endpoints', () => {
    const game = createGame({ rows: 9, cols: 9 });
    let state = game.getState();
    game.paint(at(state, 2, 2), 'wall');
    game.paint(at(state, 8, 8), 'wall');
    game.paint(at(state, 5, 5), 'weight');
    game.moveEndpoint('start', at(state, 5, 5));
    game.resize(7, 11);
    state = game.getState();
    assert.equal(state.rows, 7);
    assert.equal(state.cols, 11);
    assert.equal(state.cells[at(state, 2, 2)], CELL.WALL);
    assert.equal(state.cells.filter((type) => type === CELL.WALL).length, 1);
    assert.equal(state.start, at(state, 5, 5));
    assert.equal(state.end, at(state, 3, 7));
    game.moveEndpoint('start', at(state, 1, 1));
    assert.equal(game.getState().cells[at(state, 5, 5)], CELL.WEIGHT);
  });

  test('resize separates endpoints that would collide and validates the size', () => {
    const game = createGame({ rows: 9, cols: 15 });
    game.resize(9, 4);
    const state = game.getState();
    assert.notEqual(state.start, state.end);
    assert.throws(() => game.resize(1, 5), RangeError);
    assert.equal(game.getState().cols, 4);
  });
});

describe('demo state', () => {
  for (const [rows, cols] of [
    [21, 43],
    [17, 13],
  ]) {
    test(`?demo shows A* finished on a recursive-division maze (${rows}x${cols})`, () => {
      const game = createDemoGame({ rows, cols, clock: fakeClock() });
      const state = game.getState();
      assert.equal(state.status, 'done');
      assert.equal(state.algorithm, 'astar');
      assert.equal(state.outcome, 'found');
      assertValidPath(state, state.path, 'demo');
      for (const value of [OVERLAY.VISITED, OVERLAY.FRONTIER, OVERLAY.PATH]) {
        assert.ok(state.overlay.includes(value), `overlay shows state ${value}`);
      }
      assert.ok(state.cells.includes(CELL.WALL) && state.cells.includes(CELL.WEIGHT));
      const open = state.cells.filter((type) => type !== CELL.WALL).length;
      assert.ok(state.stats.visited < open, 'part of the maze stays unexplored');
      assert.equal(state.stats.timeMs, 2);
    });
  }

  test('?demo is deterministic', () => {
    const a = createDemoGame({ rows: 21, cols: 43 }).getState();
    const b = createDemoGame({ rows: 21, cols: 43 }).getState();
    assert.deepEqual(a.cells, b.cells);
    assert.deepEqual(a.overlay, b.overlay);
    assert.deepEqual(a.path, b.path);
  });
});
