// Same shape as pencil.js, just paints `null` (clears) instead of a color.

export const eraserTool = {
  onPointerDown(ctx, x, y) {
    ctx.paintCellLive(x, y, null);
  },
  onPointerMove(ctx, x, y) {
    ctx.paintCellLive(x, y, null);
  },
  onPointerUp(ctx) {
    ctx.commitStroke();
  },
};
