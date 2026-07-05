// Pure grid-mutation functions backing the rectangle/ellipse tools. No
// DOM/canvas dependency, so they're directly node --test-able against known
// expected pixel sets. Both tools in ui/draw/tools/ are thin wrappers that
// just handle the drag gesture/preview and call these with the final
// corner coordinates.

import { set } from './Grid.js';

/**
 * @param {import('./Grid.js').Grid} grid
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {{ filled?: boolean }} [options]
 */
export function rasterizeRect(grid, x0, y0, x1, y1, { filled = false } = {}) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (filled || x === minX || x === maxX || y === minY || y === maxY) set(grid, x, y, 1);
    }
  }
}

/**
 * Midpoint ellipse algorithm (two-region, integer-only) — the standard
 * approach for pixel-grid circles/ellipses. Filled mode collects, per
 * scanline, the min/max x the boundary touches and spans between them.
 * Outline mode plots every point the algorithm actually traces — not just
 * each row's two x-extremes, which loses points and breaks continuity: near
 * the flat top/bottom of a wide ellipse, the algorithm legitimately plots
 * several x's for the same row before y next decrements (that's exactly
 * what "flat" means here), and collapsing those down to only the row's
 * leftmost/rightmost point can leave the two surviving points several
 * pixels apart with nothing drawn between them, and no guarantee the row
 * below reconnects to either one — a visible gap in the outline.
 *
 * @param {import('./Grid.js').Grid} grid
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {{ filled?: boolean }} [options]
 */
export function rasterizeEllipse(grid, cx, cy, rx, ry, { filled = false } = {}) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  rx = Math.round(rx);
  ry = Math.round(ry);
  if (rx <= 0 || ry <= 0) {
    set(grid, cx, cy, 1);
    return;
  }

  /** @type {Map<number, {minX:number,maxX:number}>} */
  const rows = new Map();
  /** @type {[number, number][]} every point the algorithm actually plots, for outline mode */
  const points = [];
  const record = (px, py) => {
    const row = rows.get(py);
    if (!row) rows.set(py, { minX: px, maxX: px });
    else {
      row.minX = Math.min(row.minX, px);
      row.maxX = Math.max(row.maxX, px);
    }
    points.push([px, py]);
  };
  const plot = (x, y) => {
    record(cx + x, cy + y);
    record(cx - x, cy + y);
    record(cx + x, cy - y);
    record(cx - x, cy - y);
  };

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const twoRx2 = 2 * rx2;
  const twoRy2 = 2 * ry2;

  let x = 0;
  let y = ry;
  let dx = 0;
  let dy = twoRx2 * y;
  let p1 = ry2 - rx2 * ry + 0.25 * rx2;
  while (dx < dy) {
    plot(x, y);
    x++;
    dx += twoRy2;
    if (p1 < 0) {
      p1 += dx + ry2;
    } else {
      y--;
      dy -= twoRx2;
      p1 += dx - dy + ry2;
    }
  }

  let p2 = ry2 * (x + 0.5) ** 2 + rx2 * (y - 1) ** 2 - rx2 * ry2;
  while (y >= 0) {
    plot(x, y);
    y--;
    dy -= twoRx2;
    if (p2 > 0) {
      p2 += rx2 - dy;
    } else {
      x++;
      dx += twoRy2;
      p2 += dx - dy + rx2;
    }
  }

  if (filled) {
    for (const [py, { minX, maxX }] of rows) {
      for (let px = minX; px <= maxX; px++) set(grid, px, py, 1);
    }
  } else {
    for (const [px, py] of points) set(grid, px, py, 1);
  }
}
