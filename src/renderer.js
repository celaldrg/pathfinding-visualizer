/**
 * Canvas renderer for the board: cells, search overlay, path line, endpoints and
 * the hover and keyboard highlights. It draws on whole device pixels so the grid
 * stays crisp at any zoom, and lets new walls and searched cells pop in unless
 * the user prefers reduced motion. Colours come from CSS custom properties, the
 * same ones the legend swatches use.
 */
import { CELL } from './grid.js';
import { OVERLAY } from './game.js';
import { tileShape } from './layout.js';

/** Length of a cell's pop-in animation. */
const POP_MS = 260;
/** Size a popping cell starts from, as a fraction of its full size. */
const POP_FROM = 0.3;
/** What changed a cell last, which decides its animation. */
const CHANGE = Object.freeze({ NONE: 0, BLOCK: 1, FRONTIER: 2, VISIT: 3, PATH: 4 });
/** The look a cell must still have for its animation to play. */
const CHANGE_LOOK = Object.freeze({ [CHANGE.FRONTIER]: 'frontier', [CHANGE.VISIT]: 'visited', [CHANGE.PATH]: 'pathFill' });

const PALETTE = Object.freeze({
  gap: '--board-gap',
  empty: '--cell-empty',
  wall: '--cell-wall',
  weight: '--cell-weight',
  weightIcon: '--cell-weight-icon',
  frontier: '--cell-frontier',
  visited: '--cell-visited',
  pathFill: '--cell-path-fill',
  path: '--cell-path',
  pathGlow: '--cell-path-glow',
  start: '--cell-start',
  end: '--cell-end',
  glyph: '--cell-glyph',
  hover: '--cell-hover',
  cursor: '--accent',
});

/**
 * @typedef {object} BoardView What the board shows besides the game state.
 * @property {number} hover Cell under the mouse, or -1.
 * @property {number} cursor Keyboard cursor cell, or -1 when hidden.
 * @property {'start' | 'end' | null} dragging Endpoint being dragged.
 */

/**
 * @typedef {object} Renderer
 * @property {(metrics: import('./layout.js').BoardMetrics, rows: number, cols: number) => void} setBoard
 *   Sizes the canvas; a new board shape also drops running animations.
 * @property {() => void} startRun Forgets the previous search's animations before a new run.
 * @property {(events: import('./game.js').GameEvent[], now: number) => void} noteEvents
 *   Records the animation events game.update() applied.
 * @property {(state: import('./game.js').GameState, view: BoardView, now: number) => boolean} draw
 *   Draws a frame; returns true while an animation still needs more frames.
 */

/**
 * Creates the board renderer.
 * @param {HTMLCanvasElement} canvas
 * @param {{reducedMotion: () => boolean}} options
 * @returns {Renderer}
 */
export function createRenderer(canvas, { reducedMotion }) {
  const ctx = canvas.getContext('2d');
  const colors = readPalette(canvas);
  let cellPx = 1;
  let rows = 0;
  let cols = 0;
  let change = new Uint8Array(0);
  let changedAt = new Float64Array(0);
  /** Cell types at the last draw, to spot new walls and weights; null right after a reset. */
  let shown = null;
  /** Path cells in the order the running animation revealed them. */
  let trail = [];

  function setBoard(metrics, nextRows, nextCols) {
    cellPx = metrics.cellPx;
    canvas.width = metrics.widthPx;
    canvas.height = metrics.heightPx;
    canvas.style.width = `${metrics.cssWidth}px`;
    canvas.style.height = `${metrics.cssHeight}px`;
    if (nextRows === rows && nextCols === cols) return;
    rows = nextRows;
    cols = nextCols;
    change = new Uint8Array(rows * cols);
    changedAt = new Float64Array(rows * cols);
    shown = null;
    trail = [];
  }

  function startRun() {
    for (let cell = 0; cell < change.length; cell++) {
      if (change[cell] !== CHANGE.BLOCK) change[cell] = CHANGE.NONE;
    }
    trail = [];
  }

  function noteEvents(events, now) {
    for (const { type, cell } of events) {
      if (type === 'visit') mark(cell, CHANGE.VISIT, now);
      else if (type === 'frontier' && change[cell] !== CHANGE.FRONTIER) mark(cell, CHANGE.FRONTIER, now);
      else if (type === 'path') {
        mark(cell, CHANGE.PATH, now);
        trail.push(cell);
      }
    }
  }

  function mark(cell, kind, now) {
    change[cell] = kind;
    changedAt[cell] = now;
  }

  function draw(state, view, now) {
    const animate = !reducedMotion();
    trackBlocks(state.cells, now, animate);
    if (state.status !== 'running') trail = [];
    ctx.fillStyle = colors.gap;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const pops = drawCells(state, now, animate);
    drawWeightIcons(state, pops);
    const growing = drawPath(state, now, animate);
    drawEndpoint(state.start, colors.start, view.dragging === 'start', drawPlayGlyph);
    drawEndpoint(state.end, colors.end, view.dragging === 'end', drawTargetGlyph);
    if (view.hover >= 0 && !view.dragging) outlineCell(view.hover, colors.hover, Math.max(1, cellPx * 0.07));
    if (view.cursor >= 0) outlineCell(view.cursor, colors.cursor, Math.max(2, cellPx * 0.12));
    return pops.size > 0 || growing;
  }

  /** Spots walls and weights that appeared since the last frame and lets them pop in. */
  function trackBlocks(cells, now, animate) {
    if (!shown || shown.length !== cells.length) {
      shown = Uint8Array.from(cells);
      return;
    }
    for (let cell = 0; cell < cells.length; cell++) {
      if (cells[cell] === shown[cell]) continue;
      shown[cell] = cells[cell];
      if (animate && cells[cell] !== CELL.EMPTY) mark(cell, CHANGE.BLOCK, now);
      else change[cell] = CHANGE.NONE;
    }
  }

  /**
   * Fills every cell, grouped by colour to keep draw calls few, then the cells still popping in.
   * @returns {Map<number, number>} Progress (0-1) of each popping cell.
   */
  function drawCells(state, now, animate) {
    const groups = { empty: [], wall: [], weight: [], frontier: [], visited: [], pathFill: [] };
    const pops = new Map();
    for (let cell = 0; cell < state.cells.length; cell++) {
      const look = lookOf(state, cell);
      const progress = animate ? (now - changedAt[cell]) / POP_MS : 1;
      if (progress < 1 && isStillAnimating(change[cell], look)) {
        groups[underlayOf(state, cell, look)].push(cell);
        pops.set(cell, Math.max(0, progress));
      } else {
        groups[look].push(cell);
      }
    }
    for (const look of ['empty', 'weight', 'frontier', 'visited', 'pathFill']) fillTiles(groups[look], colors[look]);
    fillWalls(groups.wall);
    for (const [cell, progress] of pops) drawPop(state, cell, progress);
    return pops;
  }

  /** Popping blocks grow out of an empty tile, frontier cells out of the bare cell; visits and path cells fade in. */
  function underlayOf(state, cell, look) {
    if (change[cell] === CHANGE.BLOCK) return 'empty';
    if (change[cell] === CHANGE.FRONTIER) return state.cells[cell] === CELL.WEIGHT ? 'weight' : 'empty';
    return look;
  }

  function drawPop(state, cell, progress) {
    const look = lookOf(state, cell);
    if (change[cell] === CHANGE.VISIT || change[cell] === CHANGE.PATH) {
      ctx.globalAlpha = 1 - progress;
      fillTiles([cell], change[cell] === CHANGE.VISIT ? colors.frontier : colors.visited);
      ctx.globalAlpha = 1;
    } else if (look === 'wall') {
      const size = cellPx * popScale(progress);
      const { x, y } = origin(cell);
      ctx.fillStyle = colors.wall;
      ctx.fillRect(x + (cellPx - size) / 2, y + (cellPx - size) / 2, size, size);
    } else {
      fillTiles([cell], colors[look], popScale(progress));
    }
  }

  function fillTiles(cells, color, scale = 1) {
    if (cells.length === 0) return;
    const { size, radius } = tileShape(cellPx, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const cell of cells) {
      const { x, y } = origin(cell);
      addRoundRect(ctx, x + (cellPx - size) / 2, y + (cellPx - size) / 2, size, size, radius);
    }
    ctx.fill();
  }

  /** Walls fill their whole cell, so neighbouring walls join into solid blocks. */
  function fillWalls(cells) {
    if (cells.length === 0) return;
    ctx.fillStyle = colors.wall;
    ctx.beginPath();
    for (const cell of cells) {
      const { x, y } = origin(cell);
      ctx.rect(x, y, cellPx, cellPx);
    }
    ctx.fill();
  }

  /** Kettlebell glyph on every weighted cell, scaled with its tile while it pops in. */
  function drawWeightIcons(state, pops) {
    const bodies = new Path2D();
    const handles = new Path2D();
    let count = 0;
    for (let cell = 0; cell < state.cells.length; cell++) {
      if (state.cells[cell] !== CELL.WEIGHT) continue;
      const scale = change[cell] === CHANGE.BLOCK && pops.has(cell) ? popScale(pops.get(cell)) : 1;
      const { x, y } = origin(cell);
      const cx = x + cellPx / 2;
      const cy = y + cellPx / 2;
      const size = cellPx * scale;
      bodies.moveTo(cx + size * 0.2, cy + size * 0.09);
      bodies.arc(cx, cy + size * 0.09, size * 0.2, 0, Math.PI * 2);
      handles.moveTo(cx - size * 0.12, cy - size * 0.06);
      handles.arc(cx, cy - size * 0.08, size * 0.12, Math.PI * 0.95, Math.PI * 2.05);
      count++;
    }
    if (count === 0) return;
    ctx.fillStyle = colors.weightIcon;
    ctx.fill(bodies);
    ctx.strokeStyle = colors.weightIcon;
    ctx.lineWidth = Math.max(1, cellPx * 0.07);
    ctx.lineCap = 'round';
    ctx.stroke(handles);
  }

  /**
   * Draws the path as a glowing line through the cell centres. While the run is
   * animating, the newest segment grows towards its cell.
   * @returns {boolean} Whether the line is still growing.
   */
  function drawPath(state, now, animate) {
    let cells = null;
    if (state.status === 'done') cells = state.path;
    else if (state.status === 'running') cells = trail;
    if (!cells || cells.length < 2) return false;
    const last = cells[cells.length - 1];
    const growth = animate && change[last] === CHANGE.PATH ? Math.min(1, (now - changedAt[last]) / POP_MS) : 1;
    ctx.save();
    ctx.lineWidth = Math.max(2, cellPx * 0.3);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colors.path;
    ctx.shadowColor = colors.pathGlow;
    ctx.shadowBlur = cellPx * 0.7;
    ctx.beginPath();
    cells.forEach((cell, index) => {
      const point = centre(cell);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else if (index < cells.length - 1 || growth >= 1) ctx.lineTo(point.x, point.y);
      else {
        const from = centre(cells[index - 1]);
        ctx.lineTo(from.x + (point.x - from.x) * growth, from.y + (point.y - from.y) * growth);
      }
    });
    ctx.stroke();
    ctx.restore();
    return growth < 1;
  }

  function drawEndpoint(cell, color, lifted, drawGlyph) {
    const { x, y } = origin(cell);
    const inset = cellPx * (lifted ? -0.08 : 0.06);
    const size = cellPx - 2 * inset;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = cellPx * (lifted ? 0.9 : 0.35);
    ctx.fillStyle = color;
    ctx.beginPath();
    addRoundRect(ctx, x + inset, y + inset, size, size, size * 0.26);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = colors.glyph;
    ctx.strokeStyle = colors.glyph;
    drawGlyph(x + cellPx / 2, y + cellPx / 2, size);
  }

  function drawPlayGlyph(cx, cy, size) {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.16, cy - size * 0.22);
    ctx.lineTo(cx + size * 0.24, cy);
    ctx.lineTo(cx - size * 0.16, cy + size * 0.22);
    ctx.closePath();
    ctx.fill();
  }

  function drawTargetGlyph(cx, cy, size) {
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  function outlineCell(cell, color, width) {
    const { x, y } = origin(cell);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    addRoundRect(ctx, x + width / 2, y + width / 2, cellPx - width, cellPx - width, cellPx * 0.22);
    ctx.stroke();
  }

  function origin(cell) {
    const col = cell % cols;
    return { x: col * cellPx, y: ((cell - col) / cols) * cellPx };
  }

  function centre(cell) {
    const { x, y } = origin(cell);
    return { x: x + cellPx / 2, y: y + cellPx / 2 };
  }

  return { setBoard, startRun, noteEvents, draw };
}

/** Colour group a cell is drawn in once no animation is playing. */
function lookOf(state, cell) {
  if (state.cells[cell] === CELL.WALL) return 'wall';
  switch (state.overlay[cell]) {
    case OVERLAY.PATH:
      return 'pathFill';
    case OVERLAY.VISITED:
      return 'visited';
    case OVERLAY.FRONTIER:
      return 'frontier';
    default:
      return state.cells[cell] === CELL.WEIGHT ? 'weight' : 'empty';
  }
}

/** A recorded change still animates only while the cell looks the way that change left it. */
function isStillAnimating(kind, look) {
  if (kind === CHANGE.BLOCK) return look === 'wall' || look === 'weight';
  return Object.hasOwn(CHANGE_LOOK, kind) && CHANGE_LOOK[kind] === look;
}

/** Ease-out with a small overshoot, from POP_FROM to full size. */
function popScale(progress) {
  const t = progress - 1;
  const eased = 1 + 2.70158 * t * t * t + 1.70158 * t * t;
  return POP_FROM + (1 - POP_FROM) * eased;
}

function addRoundRect(ctx, x, y, width, height, radius) {
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function readPalette(element) {
  const style = getComputedStyle(element);
  return Object.fromEntries(Object.entries(PALETTE).map(([name, property]) => [name, style.getPropertyValue(property).trim()]));
}
