// Pure extract/clear/paste helpers backing the marquee tool's move/copy/
// paste flow. Selection state itself (the drag rect, the floating buffer)
// is transient UI state that lives in state/store.js, not here — this file
// only touches Canvas data, via the same colorAt/paintCell every other
// tool uses, so a multi-color move re-runs autoLayerSync bookkeeping
// exactly like a normal stroke would.

import { colorAt, paintCell } from './Canvas.js';

/** @returns {{x0:number,y0:number,x1:number,y1:number}} */
export function normalizeRect(x0, y0, x1, y1) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

/**
 * Reads the composited color at every cell in `rect` (canvas-space,
 * inclusive). Empty cells are omitted rather than recorded as null, since
 * pasteCells's paintCell(..., null) would otherwise erase the destination
 * even where the source had nothing.
 *
 * @param {object} canvas
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect
 * @returns {{dx:number,dy:number,color:string}[]} positions relative to rect's top-left
 */
export function extractRectColors(canvas, rect) {
  const cells = [];
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const color = colorAt(canvas, x, y);
      if (color) cells.push({ dx: x - rect.x0, dy: y - rect.y0, color });
    }
  }
  return cells;
}

/** Clears every cell in `rect` — the destructive half of a "move" lift. */
export function clearRect(canvas, rect) {
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) paintCell(canvas, x, y, null);
  }
}

/** Paints `cells` (as produced by extractRectColors) back in at (originX, originY). */
export function pasteCells(canvas, originX, originY, cells) {
  for (const cell of cells) paintCell(canvas, originX + cell.dx, originY + cell.dy, cell.color);
}
