// Same shape as rectangle.js — a thin wrapper around
// model/shapeRasterize.js's rasterizeEllipse, driven by the drag's
// bounding box (cx/cy/rx/ry derived from the two corners).

import { createGrid } from '../../../model/Grid.js';
import { rasterizeEllipse } from '../../../model/shapeRasterize.js';

function cellsFromGrid(grid) {
  const cells = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.pixels[y * grid.width + x]) cells.push({ x, y });
    }
  }
  return cells;
}

function computeEllipseCells(x0, y0, x1, y1, filled, width, height) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  const grid = createGrid(width, height);
  rasterizeEllipse(grid, cx, cy, rx, ry, { filled });
  return cellsFromGrid(grid);
}

export const ellipseTool = {
  onPointerDown(ctx, x, y) {
    ctx.drag.start = { x, y };
    ctx.setPreview(computeEllipseCells(x, y, x, y, ctx.shapeFilled, ctx.canvasWidth, ctx.canvasHeight).map((c) => ({ ...c, color: ctx.activeColor })));
  },
  onPointerMove(ctx, x, y) {
    if (!ctx.drag.start) return;
    ctx.setPreview(
      computeEllipseCells(ctx.drag.start.x, ctx.drag.start.y, x, y, ctx.shapeFilled, ctx.canvasWidth, ctx.canvasHeight).map((c) => ({ ...c, color: ctx.activeColor })),
    );
  },
  onPointerUp(ctx, x, y) {
    if (!ctx.drag.start) return;
    const cells = computeEllipseCells(ctx.drag.start.x, ctx.drag.start.y, x, y, ctx.shapeFilled, ctx.canvasWidth, ctx.canvasHeight);
    for (const cell of cells) ctx.paintCellLive(cell.x, cell.y, ctx.activeColor);
    ctx.drag.start = null;
    ctx.setPreview(null);
    ctx.commitStroke();
  },
};
