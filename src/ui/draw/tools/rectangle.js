// A thin wrapper around model/shapeRasterize.js: rasterize the drag's
// corners into a scratch canvas-sized grid (Grid.set already clips out-of-
// bounds writes, so no extra bounds math needed here), read back which
// cells ended up on, and reuse that identical cell list for both the live
// preview and the final paint — no duplicate geometry logic between the two.

import { createGrid } from '../../../model/Grid.js';
import { rasterizeRect } from '../../../model/shapeRasterize.js';

function cellsFromGrid(grid) {
  const cells = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.pixels[y * grid.width + x]) cells.push({ x, y });
    }
  }
  return cells;
}

function computeRectCells(x0, y0, x1, y1, filled, width, height) {
  const grid = createGrid(width, height);
  rasterizeRect(grid, x0, y0, x1, y1, { filled });
  return cellsFromGrid(grid);
}

export const rectangleTool = {
  onPointerDown(ctx, x, y) {
    ctx.drag.start = { x, y };
    ctx.setPreview(computeRectCells(x, y, x, y, ctx.shapeFilled, ctx.canvasWidth, ctx.canvasHeight).map((c) => ({ ...c, color: ctx.activeColor })));
  },
  onPointerMove(ctx, x, y) {
    if (!ctx.drag.start) return;
    ctx.setPreview(
      computeRectCells(ctx.drag.start.x, ctx.drag.start.y, x, y, ctx.shapeFilled, ctx.canvasWidth, ctx.canvasHeight).map((c) => ({ ...c, color: ctx.activeColor })),
    );
  },
  onPointerUp(ctx, x, y) {
    if (!ctx.drag.start) return;
    const cells = computeRectCells(ctx.drag.start.x, ctx.drag.start.y, x, y, ctx.shapeFilled, ctx.canvasWidth, ctx.canvasHeight);
    for (const cell of cells) ctx.paintCellLive(cell.x, cell.y, ctx.activeColor);
    ctx.drag.start = null;
    ctx.setPreview(null);
    ctx.commitStroke();
  },
};
