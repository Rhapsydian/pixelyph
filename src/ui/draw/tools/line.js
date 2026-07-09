// Bresenham line, the standard integer-only approach — pure so it's
// reusable for both the live preview (recomputed every pointer move) and
// the final paint on release. ctx.drag is a plain mutable ref the editor
// owns per active gesture; SvgPixelEditor is expected to clamp (x, y) to
// valid canvas cells before calling any tool handler.
//
// Right-click (ctx.erasing) draws the line in null instead of the active
// color — see toolColor.js for the erase-color/preview-tint split.

import { resolvePaintColor, resolvePreviewColor } from './toolColor.js';
import { brushCells, isPixelPerfectCorner } from './brush.js';

/**
 * @returns {{x:number,y:number}[]}
 */
export function computeLineCells(x0, y0, x1, y1) {
  const cells = [];
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    cells.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

/**
 * Batch "pixel perfect" corner removal over an already-known cell path (the
 * whole line is computed upfront, unlike pencil.js's streaming buffer) —
 * drops each cell that fails isPixelPerfectCorner's test against its
 * neighbors. Shallow-slope staircase runs (no true corner) are untouched.
 * @returns {{x:number,y:number}[]}
 */
export function pixelPerfectFilter(cells) {
  if (cells.length < 3) return cells;
  const result = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const prev = result[result.length - 1];
    const cur = cells[i];
    const next = cells[i + 1];
    if (isPixelPerfectCorner(prev, cur, next)) continue;
    result.push(cur);
  }
  result.push(cells[cells.length - 1]);
  return result;
}

function expandStamp(cells, width) {
  const stamped = [];
  for (const c of cells) stamped.push(...brushCells(c.x, c.y, width));
  return stamped;
}

export const lineTool = {
  onPointerDown(ctx, x, y) {
    ctx.drag.start = { x, y };
    const previewColor = resolvePreviewColor(ctx);
    const cells = expandStamp(computeLineCells(x, y, x, y), ctx.brushWidth);
    ctx.setPreview(cells.map((c) => ({ ...c, color: previewColor })));
  },
  onPointerMove(ctx, x, y) {
    if (!ctx.drag.start) return;
    const previewColor = resolvePreviewColor(ctx);
    let cells = computeLineCells(ctx.drag.start.x, ctx.drag.start.y, x, y);
    if (ctx.pixelPerfect) cells = pixelPerfectFilter(cells);
    ctx.setPreview(expandStamp(cells, ctx.brushWidth).map((c) => ({ ...c, color: previewColor })));
  },
  onPointerUp(ctx, x, y) {
    if (!ctx.drag.start) return;
    const paintColor = resolvePaintColor(ctx);
    let cells = computeLineCells(ctx.drag.start.x, ctx.drag.start.y, x, y);
    if (ctx.pixelPerfect) cells = pixelPerfectFilter(cells);
    for (const cell of expandStamp(cells, ctx.brushWidth)) ctx.paintCellLive(cell.x, cell.y, paintColor);
    ctx.drag.start = null;
    ctx.setPreview(null);
    ctx.commitStroke();
  },
};
