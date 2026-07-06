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
 * Ellipse-in-rectangle rasterization (Zingl's algorithm) — takes the drag's
 * two corners directly, the same convention as rasterizeRect above, rather
 * than a center+radius. That's not just a style choice: a center+radius
 * form only has a well-defined *integer* radius every other drag step
 * (radius = (x1-x0)/2 is a whole number only when the box width is odd),
 * so rounding cx/rx independently for an even-width box made two adjacent
 * drag positions round to the identical shape — the ellipse visibly only
 * updated every other pixel, and a 16-wide (even) circle was unreachable.
 * Operating on the box's edges directly needs no such rounding: even and
 * odd widths/heights both converge to an exact pixel-perfect boundary.
 *
 * Filled mode collects, per scanline, the min/max x the boundary touches
 * and spans between them. Outline mode plots every point the algorithm
 * actually traces — not just each row's two x-extremes, which loses points
 * and breaks continuity: near the flat top/bottom of a wide ellipse, the
 * algorithm legitimately plots several x's for the same row before y next
 * decrements (that's exactly what "flat" means here), and collapsing those
 * down to only the row's leftmost/rightmost point can leave the two
 * surviving points several pixels apart with nothing drawn between them,
 * and no guarantee the row below reconnects to either one — a visible gap.
 *
 * @param {import('./Grid.js').Grid} grid
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {{ filled?: boolean }} [options]
 */
export function rasterizeEllipse(grid, x0, y0, x1, y1, { filled = false } = {}) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const a = maxX - minX;
  const b = maxY - minY;

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

  if (a === 0 && b === 0) {
    // A 1x1 box — a single pixel, same as the old zero-radius case.
    record(minX, minY);
  } else if (a === 0) {
    // A 1-cell-wide box: the ellipse degenerates to a vertical line: no
    // separate "outline" to distinguish from "filled" at that width.
    for (let y = minY; y <= maxY; y++) record(minX, y);
  } else if (b === 0) {
    for (let x = minX; x <= maxX; x++) record(x, minY);
  } else {
    let xL = minX;
    let xR = maxX;
    const b1 = b & 1;
    let dx = 4 * (1 - a) * b * b;
    let dy = 4 * (b1 + 1) * a * a;
    let err = dx + dy + b1 * a * a;
    let yT = minY + Math.floor((b + 1) / 2);
    let yB = yT - b1;
    const aStep = 8 * a * a;
    const bStep = 8 * b * b;

    do {
      record(xR, yT);
      record(xL, yT);
      record(xL, yB);
      record(xR, yB);
      const e2 = 2 * err;
      if (e2 <= dy) {
        yT++;
        yB--;
        dy += aStep;
        err += dy;
      }
      if (e2 >= dx || 2 * err > dy) {
        xL++;
        xR--;
        dx += bStep;
        err += dx;
      }
    } while (xL <= xR);

    // Finishes off the tip of a flat (near-1-cell-tall/wide) ellipse, which
    // the main loop above can exit before fully closing.
    while (yT - yB < b) {
      record(xL - 1, yT);
      record(xR + 1, yT);
      yT++;
      record(xL - 1, yB);
      record(xR + 1, yB);
      yB--;
    }
  }

  if (filled) {
    for (const [py, { minX: rMinX, maxX: rMaxX }] of rows) {
      for (let px = rMinX; px <= rMaxX; px++) set(grid, px, py, 1);
    }
  } else {
    for (const [px, py] of points) set(grid, px, py, 1);
  }
}
