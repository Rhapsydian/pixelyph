// Same shape as pencil.js, just paints `null` (clears) instead of a color.
// Brush-width stamping only — no path-interpolation, dither, or
// pixel-perfect correction (those are pencil/line-specific).

import { brushCells } from './brush.js';

export const eraserTool = {
  onPointerDown(ctx, x, y) {
    for (const cell of brushCells(x, y, ctx.brushWidth)) ctx.paintCellLive(cell.x, cell.y, null);
  },
  onPointerMove(ctx, x, y) {
    for (const cell of brushCells(x, y, ctx.brushWidth)) ctx.paintCellLive(cell.x, cell.y, null);
  },
  onPointerUp(ctx) {
    ctx.commitStroke();
  },
};
