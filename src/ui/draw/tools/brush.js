// Pure brush-stamp helpers shared by pencil.js/eraser.js/line.js — no
// store/ctx dependency, so these are unit-testable directly.

/**
 * Square NxN stamp centered on (cx, cy). width <= 1 is today's single-cell
 * behavior (top-left biased centering on even widths, matching most
 * pixel-art tools' default brush anchoring).
 * @returns {{x:number,y:number}[]}
 */
export function brushCells(cx, cy, width) {
  if (width <= 1) return [{ x: cx, y: cy }];
  const half = Math.floor((width - 1) / 2);
  const cells = [];
  for (let dy = 0; dy < width; dy++) {
    for (let dx = 0; dx < width; dx++) cells.push({ x: cx - half + dx, y: cy - half + dy });
  }
  return cells;
}

/**
 * Checkerboard-pattern subset of `cells`, for the v1 single-color dither
 * texture — leaves roughly half the stamp unpainted for a 50%-density look.
 * @returns {{x:number,y:number}[]}
 */
export function ditherCells(cells) {
  return cells.filter((c) => (c.x + c.y) % 2 === 0);
}

/**
 * Shared "pixel perfect" corner test for three consecutive path points:
 * true when `next` is diagonally adjacent to `prev` (|dx|=1 && |dy|=1) and
 * `cur` shares an axis with `prev` — the tell-tale single-pixel "L" bump a
 * staircase-stepping line/freehand path leaves. Used both as a batch filter
 * (line.js, the whole path is known upfront) and as a one-step streaming
 * buffer (pencil.js, points arrive one at a time across pointer events).
 */
export function isPixelPerfectCorner(prev, cur, next) {
  return Math.abs(next.x - prev.x) === 1 && Math.abs(next.y - prev.y) === 1 && (cur.x === prev.x || cur.y === prev.y);
}
