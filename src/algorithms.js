/**
 * Search algorithms written as generators. Each one yields animation steps
 * ({type: 'visit' | 'frontier' | 'path', cell}) and returns the final path
 * (cell indices from start to end) or null when the end is unreachable.
 * The grid is only read, never modified.
 */
import { MinHeap } from './heap.js';
import { cellCost, manhattan, neighbors, pathCost } from './grid.js';

/** @typedef {import('./grid.js').Grid} Grid */
/** @typedef {{type: 'visit' | 'frontier' | 'path', cell: number}} Step */
/** @typedef {Generator<Step, number[] | null, void>} Search */

/**
 * Breadth-first search. Ignores weights; finds a path with the fewest steps.
 * @param {Grid} grid
 * @returns {Search}
 */
export function* bfs(grid) {
  const { start, end } = grid;
  const parent = new Int32Array(grid.cells.length).fill(-1);
  const seen = new Uint8Array(grid.cells.length);
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    yield { type: 'visit', cell };
    if (cell === end) return yield* tracePath(parent, end);
    for (const next of neighbors(grid, cell)) {
      if (seen[next]) continue;
      seen[next] = 1;
      parent[next] = cell;
      queue.push(next);
      yield { type: 'frontier', cell: next };
    }
  }
  return null;
}

/**
 * Depth-first search. Ignores weights and does not guarantee the shortest path.
 * @param {Grid} grid
 * @returns {Search}
 */
export function* dfs(grid) {
  const { start, end } = grid;
  const parent = new Int32Array(grid.cells.length).fill(-1);
  const done = new Uint8Array(grid.cells.length);
  const stack = [[start, -1]];
  while (stack.length > 0) {
    const [cell, from] = stack.pop();
    if (done[cell]) continue;
    done[cell] = 1;
    parent[cell] = from;
    yield { type: 'visit', cell };
    if (cell === end) return yield* tracePath(parent, end);
    const open = neighbors(grid, cell).filter((next) => !done[next]);
    for (let i = open.length - 1; i >= 0; i--) {
      stack.push([open[i], cell]);
      yield { type: 'frontier', cell: open[i] };
    }
  }
  return null;
}

/**
 * Dijkstra's algorithm on a binary heap. Finds the cheapest path.
 * @param {Grid} grid
 * @returns {Search}
 */
export function* dijkstra(grid) {
  return yield* bestFirst(grid, (cell, cost) => [cost, 0]);
}

/**
 * A* with the Manhattan heuristic. Ties on f = g + h go to the lower h (the cell
 * closer to the end), then to the earlier insertion. Finds the cheapest path.
 * @param {Grid} grid
 * @returns {Search}
 */
export function* astar(grid) {
  return yield* bestFirst(grid, (cell, cost) => {
    const h = manhattan(grid, cell, grid.end);
    return [cost + h, h];
  });
}

/**
 * Greedy best-first search: always expands the cell closest to the end by
 * Manhattan distance. Fast, but does not guarantee the shortest path.
 * @param {Grid} grid
 * @returns {Search}
 */
export function* greedy(grid) {
  return yield* bestFirst(grid, (cell) => [manhattan(grid, cell, grid.end), 0]);
}

/**
 * Algorithm registry in menu order. `weighted` tells whether the algorithm takes
 * cell weights into account; `shortest` is 'always', 'unweighted' (only when the
 * grid has no weights) or 'never'.
 */
export const ALGORITHMS = Object.freeze({
  astar: Object.freeze({ run: astar, weighted: true, shortest: 'always' }),
  dijkstra: Object.freeze({ run: dijkstra, weighted: true, shortest: 'always' }),
  bfs: Object.freeze({ run: bfs, weighted: false, shortest: 'unweighted' }),
  greedy: Object.freeze({ run: greedy, weighted: false, shortest: 'never' }),
  dfs: Object.freeze({ run: dfs, weighted: false, shortest: 'never' }),
});

/**
 * @typedef {object} Solution
 * @property {Step[]} steps Every step the algorithm yielded, in order.
 * @property {number[] | null} path Cells from start to end, or null when unreachable.
 * @property {number | null} length Number of moves on the path.
 * @property {number | null} cost Weighted cost of the path.
 * @property {number} visited Number of 'visit' steps.
 */

/**
 * Runs an algorithm from the registry to completion.
 * @param {Grid} grid
 * @param {string} id Key of {@link ALGORITHMS}.
 * @returns {Solution}
 */
export function solve(grid, id) {
  if (!Object.hasOwn(ALGORITHMS, id)) throw new RangeError(`Unknown algorithm: ${id}`);
  const search = ALGORITHMS[id].run(grid);
  const steps = [];
  let result = search.next();
  while (!result.done) {
    steps.push(result.value);
    result = search.next();
  }
  const path = result.value;
  return {
    steps,
    path,
    length: path ? path.length - 1 : null,
    cost: path ? pathCost(grid, path) : null,
    visited: steps.filter((step) => step.type === 'visit').length,
  };
}

/**
 * Shared loop of Dijkstra, A* and greedy search. `priority(cell, cost)` returns
 * [primary, secondary] keys; remaining ties are broken by insertion order.
 * @param {Grid} grid
 * @param {(cell: number, cost: number) => [number, number]} priority
 * @returns {Search}
 */
function* bestFirst(grid, priority) {
  const { start, end } = grid;
  const size = grid.cells.length;
  const cost = new Float64Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = new MinHeap(comesFirst);
  let order = 0;
  const push = (cell) => {
    const [primary, secondary] = priority(cell, cost[cell]);
    open.push({ cell, primary, secondary, order: order++ });
  };

  cost[start] = 0;
  push(start);
  while (open.size > 0) {
    const { cell } = open.pop();
    if (closed[cell]) continue;
    closed[cell] = 1;
    yield { type: 'visit', cell };
    if (cell === end) return yield* tracePath(parent, end);
    for (const next of neighbors(grid, cell)) {
      const nextCost = cost[cell] + cellCost(grid, next);
      if (closed[next] || nextCost >= cost[next]) continue;
      cost[next] = nextCost;
      parent[next] = cell;
      push(next);
      yield { type: 'frontier', cell: next };
    }
  }
  return null;
}

function comesFirst(a, b) {
  if (a.primary !== b.primary) return a.primary < b.primary;
  if (a.secondary !== b.secondary) return a.secondary < b.secondary;
  return a.order < b.order;
}

/**
 * Follows parent links back from the end, yields the path from start to end
 * as 'path' steps and returns it. The start's parent is -1.
 * @param {Int32Array} parent
 * @param {number} end
 * @returns {Generator<Step, number[], void>}
 */
function* tracePath(parent, end) {
  const path = [];
  for (let cell = end; cell !== -1; cell = parent[cell]) path.push(cell);
  path.reverse();
  for (const cell of path) yield { type: 'path', cell };
  return path;
}
