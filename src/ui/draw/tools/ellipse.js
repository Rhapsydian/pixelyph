// Same shape as rectangle.js — a thin wrapper around
// model/shapeRasterize.js's rasterizeEllipse, driven directly by the drag's
// two corners (rasterizeEllipse takes the bounding box, not a center +
// radius — see its doc comment for why that matters here).
//
// Right-click (ctx.erasing) rasterizes the same shape in null instead of
// the active color — see toolColor.js for the erase-color/preview-tint split.

import { createGrid } from '../../../model/Grid.js';
import { rasterizeEllipse } from '../../../model/shapeRasterize.js';
import { resolvePaintColor, resolvePreviewColor } from './toolColor.js';

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
  const grid = createGrid(width, height);
  rasterizeEllipse(grid, x0, y0, x1, y1, { filled });
  return cellsFromGrid(grid);
}

export const ellipseTool = {
  onPointerDown(ctx, x, y) {
    ctx.drag.start = { x, y };
    const previewColor = resolvePreviewColor(ctx);
    ctx.setPreview(computeEllipseCells(x, y, x, y, ctx.shapeFilled, ctx.canvasWidth, ctx.canvasHeight).map((c) => ({ ...c, color: previewColor })));
  },
  onPointerMove(ctx, x, y) {
    if (!ctx.drag.start) return;
    const previewColor = resolvePreviewColor(ctx);
    ctx.setPreview(
      computeEllipseCells(ctx.drag.start.x, ctx.drag.start.y, x, y, ctx.shapeFilled, ctx.canvasWidth, ctx.canvasHeight).map((c) => ({ ...c, color: previewColor })),
    );
  },
  onPointerUp(ctx, x, y) {
    if (!ctx.drag.start) return;
    const paintColor = resolvePaintColor(ctx);
    const cells = computeEllipseCells(ctx.drag.start.x, ctx.drag.start.y, x, y, ctx.shapeFilled, ctx.canvasWidth, ctx.canvasHeight);
    for (const cell of cells) ctx.paintCellLive(cell.x, cell.y, paintColor);
    ctx.drag.start = null;
    ctx.setPreview(null);
    ctx.commitStroke();
  },
};
