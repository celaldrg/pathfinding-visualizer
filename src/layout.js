/**
 * Board geometry for the UI: grid size for the available area, canvas sizes in
 * whole device pixels, tile shapes and pointer hit testing. Pure functions, no DOM.
 */
import { fitGridSize, toRowCol } from './grid.js';

/** Preferred cell size in CSS pixels; phones use smaller cells so a narrow board keeps room to draw. */
const CELL_TARGET = Object.freeze({ phone: 20, wide: 26 });
/** Board areas narrower than this use the phone cell size. */
const PHONE_WIDTH = 520;
/** Smallest row or column count the board may shrink to when fitting. */
const MIN_COUNT = 5;
/** A smaller board must cover this much more of the area to be preferred. */
const MIN_GAIN = 0.02;
/** Gap between a tile and the edges of its cell, as a share of the cell. */
const TILE_GAP = 0.06;
/** Corner radius of a tile, as a share of the tile. */
const TILE_ROUNDING = 0.22;

/**
 * @typedef {object} BoardMetrics
 * @property {number} cellPx Cell size in device pixels (an integer, so grid lines stay crisp).
 * @property {number} widthPx Canvas backing-store width.
 * @property {number} heightPx Canvas backing-store height.
 * @property {number} cssWidth Canvas width in CSS pixels.
 * @property {number} cssHeight Canvas height in CSS pixels.
 */

/**
 * Number of rows and columns for a board area: odd counts with cells near the
 * preferred size, fewer columns on narrow (phone) screens. Rounding both counts
 * down to odd numbers can leave a band of up to two cells empty, so one row or
 * column pair fewer is also tried, and the shape that covers most of the area wins.
 * @param {number} width Area width in CSS pixels.
 * @param {number} height Area height in CSS pixels.
 * @returns {{rows: number, cols: number}}
 */
export function gridSizeFor(width, height) {
  const fitted = fitGridSize(width, height, width < PHONE_WIDTH ? CELL_TARGET.phone : CELL_TARGET.wide);
  let best = fitted;
  let bestCover = coverage(width, height, fitted);
  for (const candidate of [
    { rows: fitted.rows, cols: fitted.cols - 2 },
    { rows: fitted.rows - 2, cols: fitted.cols },
  ]) {
    if (candidate.rows < MIN_COUNT || candidate.cols < MIN_COUNT) continue;
    const cover = coverage(width, height, candidate);
    if (cover > bestCover * (1 + MIN_GAIN)) {
      best = candidate;
      bestCover = cover;
    }
  }
  return best;
}

/** Area a rows x cols board of square cells covers inside width x height. */
function coverage(width, height, { rows, cols }) {
  const cell = Math.min(width / cols, height / rows);
  return cell * cell * rows * cols;
}

/**
 * Sizes a rows x cols board to fit an area with square cells of a whole number of device pixels.
 * @param {number} width Area width in CSS pixels.
 * @param {number} height Area height in CSS pixels.
 * @param {number} rows
 * @param {number} cols
 * @param {number} dpr Device pixel ratio; invalid values count as 1.
 * @returns {BoardMetrics}
 */
export function boardMetrics(width, height, rows, cols, dpr) {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const fit = Math.min(width / cols, height / rows);
  const cellPx = Math.max(1, Math.floor((Number.isFinite(fit) ? fit : 0) * ratio));
  const widthPx = cellPx * cols;
  const heightPx = cellPx * rows;
  return { cellPx, widthPx, heightPx, cssWidth: widthPx / ratio, cssHeight: heightPx / ratio };
}

/**
 * Size and corner radius of the rounded tile drawn in a cell, in device pixels.
 * Tiles keep at least one pixel of gap to the cell's edges; cells of one or two
 * pixels, as on a board squeezed to almost nothing, are filled whole instead. So
 * neither value is ever negative: a negative radius makes the canvas throw.
 * @param {number} cellPx Cell size in device pixels.
 * @param {number} [scale] Share of the full tile size, e.g. while a tile pops in.
 * @returns {{size: number, radius: number}}
 */
export function tileShape(cellPx, scale = 1) {
  const gap = cellPx > 2 ? Math.max(1, Math.round(cellPx * TILE_GAP)) : 0;
  const size = Math.max(0, (cellPx - 2 * gap) * scale);
  return { size, radius: size * TILE_ROUNDING };
}

/**
 * Cell under a point.
 * @param {{x: number, y: number}} point CSS pixels from the canvas' top-left corner.
 * @param {{width: number, height: number}} size The canvas' size in CSS pixels.
 * @param {{rows: number, cols: number}} grid
 * @param {boolean} [clamp] Snap points beyond the edge to the nearest edge cell instead of returning -1.
 * @returns {number} Cell index, or -1 when the point is off the board.
 */
export function cellAtPoint(point, size, grid, clamp = false) {
  let col = Math.floor((point.x / size.width) * grid.cols);
  let row = Math.floor((point.y / size.height) * grid.rows);
  if (clamp) {
    col = Math.min(Math.max(col, 0), grid.cols - 1);
    row = Math.min(Math.max(row, 0), grid.rows - 1);
  } else if (!(col >= 0 && col < grid.cols && row >= 0 && row < grid.rows)) {
    return -1;
  }
  return row * grid.cols + col;
}

/**
 * The neighbouring cell in a direction, staying on the board at its edges.
 * @param {{rows: number, cols: number}} grid
 * @param {number} cell
 * @param {number} dRow
 * @param {number} dCol
 * @returns {number}
 */
export function stepCell(grid, cell, dRow, dCol) {
  const { row, col } = toRowCol(grid, cell);
  const nextRow = Math.min(Math.max(row + dRow, 0), grid.rows - 1);
  const nextCol = Math.min(Math.max(col + dCol, 0), grid.cols - 1);
  return nextRow * grid.cols + nextCol;
}

/**
 * Which endpoint a point grabs, if any. `slack` widens each endpoint's hit box by
 * that fraction of a cell on every side, which makes small cells easier to grab
 * with a finger; when both boxes contain the point, the nearer centre wins.
 * @param {{x: number, y: number}} point CSS pixels from the canvas' top-left corner.
 * @param {{width: number, height: number}} size The canvas' size in CSS pixels.
 * @param {{rows: number, cols: number, start: number, end: number}} grid
 * @param {number} [slack]
 * @returns {'start' | 'end' | null}
 */
export function endpointAtPoint(point, size, grid, slack = 0) {
  const x = (point.x / size.width) * grid.cols;
  const y = (point.y / size.height) * grid.rows;
  let best = null;
  let bestDistance = Infinity;
  for (const which of /** @type {const} */ (['start', 'end'])) {
    const { row, col } = toRowCol(grid, grid[which]);
    const dx = Math.abs(x - (col + 0.5));
    const dy = Math.abs(y - (row + 0.5));
    if (dx > 0.5 + slack || dy > 0.5 + slack) continue;
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      best = which;
      bestDistance = distance;
    }
  }
  return best;
}
