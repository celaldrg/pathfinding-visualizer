import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { CELL } from '../src/grid.js';
import { describeStatus, guaranteeNote, statsText, statusText } from '../src/status.js';

function fakeClock() {
  let now = 0;
  return () => (now += 2);
}

/** A hand-made game state with only the fields the status module reads. */
function craftedState({ status = 'done', outcome = 'found', algorithm = 'astar', weights = false, stats = {} } = {}) {
  const cells = new Uint8Array(12);
  if (weights) cells[5] = CELL.WEIGHT;
  return {
    status,
    outcome,
    algorithm,
    cells,
    stats: { visited: 0, pathLength: null, pathCost: null, timeMs: null, ...stats },
  };
}

describe('describeStatus', () => {
  test('follows the game through every status', () => {
    assert.deepEqual(describeStatus(craftedState({ status: 'idle', outcome: null })), {
      key: 'status.ready',
      note: null,
      tone: 'idle',
    });
    assert.equal(describeStatus(craftedState({ status: 'building', outcome: null })).tone, 'busy');
    assert.equal(describeStatus(craftedState({ status: 'running', outcome: null })).key, 'status.running');
    assert.deepEqual(describeStatus(craftedState()), { key: 'status.found', note: 'note.always', tone: 'success' });
    assert.deepEqual(describeStatus(craftedState({ outcome: 'unreachable' })), {
      key: 'status.unreachable',
      note: null,
      tone: 'failure',
    });
  });

  test('matches a real game from the opening board to a finished run', () => {
    const game = createGame({ rows: 7, cols: 11, clock: fakeClock() });
    assert.equal(describeStatus(game.getState()).key, 'status.ready');
    game.visualize();
    assert.equal(describeStatus(game.getState()).key, 'status.running');
    game.finish();
    assert.equal(describeStatus(game.getState()).tone, 'success');
    game.generateMaze('recursiveDivision', 3);
    assert.equal(describeStatus(game.getState()).key, 'status.building');
  });
});

describe('guaranteeNote', () => {
  test('A* and Dijkstra always find the cheapest path, greedy search and DFS never promise it', () => {
    for (const weights of [false, true]) {
      assert.equal(guaranteeNote(craftedState({ algorithm: 'astar', weights })), 'note.always');
      assert.equal(guaranteeNote(craftedState({ algorithm: 'dijkstra', weights })), 'note.always');
      assert.equal(guaranteeNote(craftedState({ algorithm: 'greedy', weights })), 'note.never');
      assert.equal(guaranteeNote(craftedState({ algorithm: 'dfs', weights })), 'note.never');
    }
  });

  test('BFS is only shortest while the board has no weights', () => {
    assert.equal(guaranteeNote(craftedState({ algorithm: 'bfs' })), 'note.shortestUnweighted');
    assert.equal(guaranteeNote(craftedState({ algorithm: 'bfs', weights: true })), 'note.ignoresWeights');
  });
});

describe('statusText', () => {
  const found = { pathLength: 54, pathCost: 70 };

  test('names the algorithm, the path and the guarantee in both languages', () => {
    assert.equal(
      statusText(craftedState({ stats: found }), 'en'),
      'A* found a path: 54 steps, cost 70. It is guaranteed to be the cheapest.',
    );
    assert.equal(
      statusText(craftedState({ stats: found }), 'tr'),
      'A* bir yol buldu: 54 adım, maliyet 70. Bunun en ucuz yol olduğu garantidir.',
    );
    assert.equal(
      statusText(craftedState({ algorithm: 'greedy', stats: found }), 'en'),
      'Greedy search found a path: 54 steps, cost 70. Greedy search does not guarantee the shortest path.',
    );
    assert.equal(
      statusText(craftedState({ algorithm: 'bfs', weights: true, stats: found }), 'tr'),
      'BFS bir yol buldu: 54 adım, maliyet 70. BFS ağırlıkları yok sayar; daha ucuz bir yol olabilir.',
    );
  });

  test('explains a walled-off end and an idle board', () => {
    assert.equal(
      statusText(craftedState({ algorithm: 'dfs', outcome: 'unreachable' }), 'en'),
      'No path: the end is walled off. DFS explored every cell it could reach.',
    );
    assert.equal(statusText(craftedState({ status: 'idle', outcome: null }), 'tr').startsWith('Duvar çiz'), true);
  });

  test('uses the locale’s thousands separator', () => {
    const long = craftedState({ algorithm: 'dijkstra', stats: { pathLength: 1234, pathCost: 12345 } });
    assert.match(statusText(long, 'en'), /1,234 steps, cost 12,345\./);
    assert.match(statusText(long, 'tr'), /1\.234 adım, maliyet 12\.345\./);
  });
});

describe('statsText', () => {
  test('shows dashes before the first run', () => {
    assert.deepEqual(statsText(craftedState({ status: 'idle', outcome: null }), 'en'), {
      visited: '0',
      length: '–',
      cost: '–',
      time: '–',
    });
  });

  test('formats counts and times for each language', () => {
    const state = craftedState({ stats: { visited: 12345, pathLength: 54, pathCost: 70, timeMs: 3.14 } });
    assert.deepEqual(statsText(state, 'en'), { visited: '12,345', length: '54', cost: '70', time: '3.1 ms' });
    assert.deepEqual(statsText(state, 'tr'), { visited: '12.345', length: '54', cost: '70', time: '3,1 ms' });
  });

  test('rounds times to whole milliseconds from 10 ms and marks very fast runs', () => {
    const time = (timeMs, lang) => statsText(craftedState({ stats: { timeMs } }), lang).time;
    assert.equal(time(0, 'en'), '<0.1 ms');
    assert.equal(time(0.04, 'tr'), '<0,1 ms');
    assert.equal(time(0.1, 'en'), '0.1 ms');
    assert.equal(time(9.94, 'en'), '9.9 ms');
    assert.equal(time(26.4, 'en'), '26 ms');
    assert.equal(time(1234.5, 'tr'), '1.235 ms');
  });

  test('falls back to English number formats for an unknown language', () => {
    const state = craftedState({ stats: { visited: 1500, timeMs: 2.5 } });
    assert.deepEqual(statsText(state, 'de'), { visited: '1,500', length: '–', cost: '–', time: '2.5 ms' });
  });

  test('reports a real finished run', () => {
    const game = createGame({ rows: 7, cols: 11, algorithm: 'bfs', clock: fakeClock() });
    game.visualize({ animate: false });
    const { stats } = game.getState();
    assert.deepEqual(statsText(game.getState(), 'en'), {
      visited: String(stats.visited),
      length: String(stats.pathLength),
      cost: String(stats.pathCost),
      time: '2.0 ms',
    });
  });
});
