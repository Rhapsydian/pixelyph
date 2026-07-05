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
 * approach for pixel-grid circles/ellipses. Collects, per scanline, the
 * min/max x the boundary touches; outline plots just those two points per
 * row, filled additionally spans between them.
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
  const record = (px, py) => {
    const row = rows.get(py);
    if (!row) rows.set(py, { minX: px, maxX: px });
    else {
      row.minX = Math.min(row.minX, px);
      row.maxX = Math.max(row.maxX, px);
    }
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

  for (const [py, { minX, maxX }] of rows) {
    if (filled) {
      for (let px = minX; px <= maxX; px++) set(grid, px, py, 1);
    } else {
      set(grid, minX, py, 1);
      set(grid, maxX, py, 1);
    }
  }
}
