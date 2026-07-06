// Bresenham line, the standard integer-only approach — pure so it's
// reusable for both the live preview (recomputed every pointer move) and
// the final paint on release. ctx.drag is a plain mutable ref the editor
// owns per active gesture; SvgPixelEditor is expected to clamp (x, y) to
// valid canvas cells before calling any tool handler.
//
// Right-click (ctx.erasing) draws the line in null instead of the active
// color — see toolColor.js for the erase-color/preview-tint split.

import { resolvePaintColor, resolvePreviewColor } from './toolColor.js';

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

export const lineTool = {
  onPointerDown(ctx, x, y) {
    ctx.drag.start = { x, y };
    const previewColor = resolvePreviewColor(ctx);
    ctx.setPreview(computeLineCells(x, y, x, y).map((c) => ({ ...c, color: previewColor })));
  },
  onPointerMove(ctx, x, y) {
    if (!ctx.drag.start) return;
    const previewColor = resolvePreviewColor(ctx);
    ctx.setPreview(computeLineCells(ctx.drag.start.x, ctx.drag.start.y, x, y).map((c) => ({ ...c, color: previewColor })));
  },
  onPointerUp(ctx, x, y) {
    if (!ctx.drag.start) return;
    const paintColor = resolvePaintColor(ctx);
    for (const cell of computeLineCells(ctx.drag.start.x, ctx.drag.start.y, x, y)) ctx.paintCellLive(cell.x, cell.y, paintColor);
    ctx.drag.start = null;
    ctx.setPreview(null);
    ctx.commitStroke();
  },
};
