import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fitGridSize } from '../src/grid.js';
import { boardMetrics, cellAtPoint, endpointAtPoint, gridSizeFor, stepCell, tileShape } from '../src/layout.js';

/** Share of a width x height area that a board of square cells covers. */
function coverage(width, height, { rows, cols }) {
  const cell = Math.min(width / cols, height / rows);
  return (cell * cell * rows * cols) / (width * height);
}

/** Board areas from small phones in portrait to wide desktop windows. */
function* areas() {
  for (let width = 240; width <= 2000; width += 37) {
    for (let height = 200; height <= 1300; height += 53) yield [width, height];
  }
}

describe('gridSizeFor', () => {
  test('always picks odd row and column counts of at least 5', () => {
    for (const [width, height] of [...areas(), [10, 10], [0, 0], [5000, 5000]]) {
      const { rows, cols } = gridSizeFor(width, height);
      assert.ok(rows >= 5 && rows % 2 === 1, `rows ${rows} for ${width}x${height}`);
      assert.ok(cols >= 5 && cols % 2 === 1, `cols ${cols} for ${width}x${height}`);
    }
  });

  test('uses smaller cells on phones, so a narrow board still has room to draw', () => {
    assert.deepEqual(gridSizeFor(343, 420), { rows: 21, cols: 17 });
    assert.deepEqual(gridSizeFor(500, 500), { rows: 25, cols: 25 });
    assert.deepEqual(gridSizeFor(520, 500), { rows: 19, cols: 19 });
    assert.deepEqual(gridSizeFor(1100, 700), { rows: 25, cols: 39 });
  });

  test('drops a row or column pair when that fills the area better', () => {
    assert.deepEqual(gridSizeFor(758, 594), { rows: 21, cols: 27 });
    assert.deepEqual(gridSizeFor(600, 203), { rows: 7, cols: 21 });
    assert.deepEqual(gridSizeFor(300, 200), { rows: 9, cols: 13 });
  });

  test('never covers less of the area than the plain odd fit', () => {
    for (const [width, height] of areas()) {
      const plain = fitGridSize(width, height, width < 520 ? 20 : 26);
      const chosen = gridSizeFor(width, height);
      assert.ok(coverage(width, height, chosen) >= coverage(width, height, plain), `${width}x${height}`);
      // The stylesheet keeps the board area at most 900 px tall, below the row limit.
      if (height <= 900) {
        assert.ok(coverage(width, height, chosen) > 0.9, `${width}x${height} leaves a wide empty band`);
      }
    }
  });
});

describe('boardMetrics', () => {
  test('gives cells a whole number of device pixels', () => {
    assert.deepEqual(boardMetrics(758, 594, 21, 27, 1), {
      cellPx: 28,
      widthPx: 756,
      heightPx: 588,
      cssWidth: 756,
      cssHeight: 588,
    });
    assert.deepEqual(boardMetrics(758, 594, 21, 27, 2), {
      cellPx: 56,
      widthPx: 1512,
      heightPx: 1176,
      cssWidth: 756,
      cssHeight: 588,
    });
    const odd = boardMetrics(758, 594, 21, 27, 1.5);
    assert.equal(odd.cellPx, 42);
    assert.deepEqual([odd.widthPx, odd.heightPx, odd.cssWidth, odd.cssHeight], [1134, 882, 756, 588]);
  });

  test('always fits inside the area', () => {
    for (const [width, height] of areas()) {
      const { rows, cols } = gridSizeFor(width, height);
      for (const dpr of [1, 1.25, 2, 3]) {
        const metrics = boardMetrics(width, height, rows, cols, dpr);
        assert.ok(Number.isInteger(metrics.cellPx), 'integer cells');
        assert.ok(metrics.cssWidth <= width && metrics.cssHeight <= height, `${width}x${height} at ${dpr}x`);
      }
    }
  });

  test('treats an invalid pixel ratio as 1 and never shrinks cells below one pixel', () => {
    for (const dpr of [0, -2, Number.NaN, Infinity, undefined]) {
      assert.equal(boardMetrics(758, 594, 21, 27, dpr).cellPx, 28);
    }
    assert.equal(boardMetrics(0, 0, 5, 5, 1).cellPx, 1);
    assert.equal(boardMetrics(Number.NaN, 100, 5, 5, 2).widthPx, 5);
  });
});

describe('tileShape', () => {
  /** Scales a tile passes through while it pops in, overshoot included. */
  const POP_SCALES = [0.3, 0.6, 1, 1.1];

  test('leaves a gap of at least one device pixel around every full-size tile', () => {
    assert.equal(tileShape(20).size, 18);
    assert.equal(tileShape(50).size, 44);
    for (let cellPx = 3; cellPx <= 120; cellPx++) {
      const { size } = tileShape(cellPx);
      assert.ok(size >= 1 && cellPx - size >= 2, `${cellPx} px cell, ${size} px tile`);
    }
  });

  test('scales with a popping tile and keeps its corners a valid rounding', () => {
    assert.equal(tileShape(50, 0.5).size, 22);
    for (const scale of POP_SCALES) {
      const { size, radius } = tileShape(40, scale);
      assert.ok(radius > 0 && radius <= size / 2, `scale ${scale}: radius ${radius} for ${size}`);
    }
  });

  test('never gives a negative size or radius, even on a board squeezed to one-pixel cells', () => {
    // A board area that collapsed to no height still gets cells of one device pixel.
    const { rows, cols } = gridSizeFor(310, 0);
    assert.equal(boardMetrics(310, 0, rows, cols, 1).cellPx, 1);
    assert.deepEqual(tileShape(1), { size: 1, radius: 0.22 });
    assert.equal(tileShape(2).size, 2);
    for (let cellPx = 0; cellPx <= 12; cellPx++) {
      for (const scale of POP_SCALES) {
        const { size, radius } = tileShape(cellPx, scale);
        assert.ok(size >= 0 && radius >= 0, `${cellPx} px cell at scale ${scale}: ${size}, ${radius}`);
        if (cellPx > 0) assert.ok(size > 0, `${cellPx} px cell at scale ${scale} draws nothing`);
      }
    }
  });
});

describe('pointer hit testing', () => {
  const grid = { rows: 3, cols: 4, start: 4, end: 7 };
  const size = { width: 400, height: 300 };

  test('cellAtPoint maps points to cells and rejects points off the board', () => {
    assert.equal(cellAtPoint({ x: 0, y: 0 }, size, grid), 0);
    assert.equal(cellAtPoint({ x: 99.9, y: 100 }, size, grid), 4);
    assert.equal(cellAtPoint({ x: 100, y: 0 }, size, grid), 1);
    assert.equal(cellAtPoint({ x: 399, y: 299 }, size, grid), 11);
    for (const point of [{ x: 400, y: 0 }, { x: -1, y: 10 }, { x: 10, y: 300 }, { x: Number.NaN, y: 0 }]) {
      assert.equal(cellAtPoint(point, size, grid), -1);
    }
  });

  test('cellAtPoint can snap points beyond the edge to the nearest edge cell', () => {
    assert.equal(cellAtPoint({ x: -50, y: -50 }, size, grid, true), 0);
    assert.equal(cellAtPoint({ x: 1000, y: 1000 }, size, grid, true), 11);
    assert.equal(cellAtPoint({ x: 150, y: -20 }, size, grid, true), 1);
    assert.equal(cellAtPoint({ x: 450, y: 150 }, size, grid, true), 7);
  });

  test('stepCell moves one cell and stops at the edges', () => {
    assert.equal(stepCell(grid, 5, -1, 0), 1);
    assert.equal(stepCell(grid, 5, 1, 0), 9);
    assert.equal(stepCell(grid, 5, 0, -1), 4);
    assert.equal(stepCell(grid, 5, 0, 1), 6);
    assert.equal(stepCell(grid, 0, -1, 0), 0);
    assert.equal(stepCell(grid, 0, 0, -1), 0);
    assert.equal(stepCell(grid, 11, 1, 0), 11);
    assert.equal(stepCell(grid, 11, 0, 1), 11);
    assert.equal(stepCell(grid, 3, 0, 1), 3, 'does not wrap to the next row');
  });

  test('endpointAtPoint finds the endpoint under a point', () => {
    assert.equal(endpointAtPoint({ x: 50, y: 150 }, size, grid), 'start');
    assert.equal(endpointAtPoint({ x: 350, y: 150 }, size, grid), 'end');
    assert.equal(endpointAtPoint({ x: 150, y: 150 }, size, grid), null);
    assert.equal(endpointAtPoint({ x: 50, y: 50 }, size, grid), null);
  });

  test('slack widens the hit box for fingers and the nearer endpoint wins', () => {
    assert.equal(endpointAtPoint({ x: 140, y: 150 }, size, grid), null);
    assert.equal(endpointAtPoint({ x: 140, y: 150 }, size, grid, 0.45), 'start');
    assert.equal(endpointAtPoint({ x: 150, y: 150 }, size, grid, 0.45), null);

    const pair = { rows: 1, cols: 2, start: 0, end: 1 };
    const wide = { width: 200, height: 100 };
    assert.equal(endpointAtPoint({ x: 95, y: 50 }, wide, pair, 0.45), 'start');
    assert.equal(endpointAtPoint({ x: 105, y: 50 }, wide, pair, 0.45), 'end');
    assert.equal(endpointAtPoint({ x: 105, y: 50 }, wide, pair), 'end');
  });
});
