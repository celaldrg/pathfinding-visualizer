/**
 * Mouse, pen and touch input on the board through Pointer Events. A stroke that
 * starts on the start or end node drags it; any other stroke paints walls, or
 * weights with Shift or the weight brush, and erases when it starts on a cell of
 * the kind it would paint. The right mouse button always erases.
 */
import { cellAtPoint, endpointAtPoint } from './layout.js';

/** Extra grab margin around the endpoints for fingers and pens, as a fraction of a cell. */
const TOUCH_SLACK = 0.45;
const MAIN_BUTTON = 0;
const RIGHT_BUTTON = 2;

/**
 * @typedef {object} PointerOptions
 * @property {() => import('./game.js').Game} getGame The game being shown; main.js may replace it on a resize.
 * @property {import('./renderer.js').BoardView} view Its hover and dragging fields are kept up to date.
 * @property {() => 'wall' | 'weight'} brush The selected brush.
 * @property {() => void} onInput Called whenever the board or the view changed.
 */

/**
 * Wires pointer input on the board canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {PointerOptions} options
 */
export function attachPointer(canvas, { getGame, view, brush, onInput }) {
  /** @type {{id: number, action: import('./game.js').StrokeAction, last: number} | null} */
  let stroke = null;

  canvas.addEventListener('pointerdown', (event) => {
    if (stroke || (event.button !== MAIN_BUTTON && event.button !== RIGHT_BUTTON)) return;
    const { point, size } = locate(event);
    const game = getGame();
    const state = game.getState();
    const cell = cellAtPoint(point, size, state);
    if (cell < 0) return;
    const action = actionFor(event, point, size, state, cell);
    if (action === 'move-start' || action === 'move-end') view.dragging = action === 'move-start' ? 'start' : 'end';
    else game.paint(cell, action);
    stroke = { id: event.pointerId, action, last: cell };
    view.hover = event.pointerType === 'mouse' ? cell : -1;
    canvas.setPointerCapture(event.pointerId);
    onInput();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (stroke && event.pointerId === stroke.id) continueStroke(event);
    else if (!stroke && event.pointerType === 'mouse') hover(event);
  });

  const endStroke = (event) => {
    if (!stroke || event.pointerId !== stroke.id) return;
    stroke = null;
    view.dragging = null;
    if (event.pointerType !== 'mouse') view.hover = -1;
    onInput();
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('lostpointercapture', endStroke);

  canvas.addEventListener('pointerleave', () => {
    if (stroke || view.hover < 0) return;
    view.hover = -1;
    onInput();
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  /** Endpoints are easier to grab with a finger; everywhere else the game decides. */
  function actionFor(event, point, size, state, cell) {
    if (event.button === RIGHT_BUTTON) return 'erase';
    const slack = event.pointerType === 'mouse' ? 0 : TOUCH_SLACK;
    const endpoint = endpointAtPoint(point, size, state, slack);
    if (endpoint) return endpoint === 'start' ? 'move-start' : 'move-end';
    return getGame().strokeAction(cell, event.shiftKey ? 'weight' : brush());
  }

  /** Paints a gap-free line to the pointer, or moves the dragged endpoint there. */
  function continueStroke(event) {
    const { point, size } = locate(event);
    const game = getGame();
    const cell = cellAtPoint(point, size, game.getState(), true);
    if (cell === stroke.last) return;
    if (view.dragging) game.moveEndpoint(view.dragging, cell);
    else game.paintLine(stroke.last, cell, stroke.action);
    stroke.last = cell;
    if (event.pointerType === 'mouse') view.hover = cell;
    onInput();
  }

  function hover(event) {
    const { point, size } = locate(event);
    const cell = cellAtPoint(point, size, getGame().getState());
    if (cell === view.hover) return;
    view.hover = cell;
    onInput();
  }

  function locate(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      point: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      size: { width: rect.width, height: rect.height },
    };
  }
}
