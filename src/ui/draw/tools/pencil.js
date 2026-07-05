// Thin wrapper around the shared paint path: every cell touched by a
// pointer down/move paints immediately (mirror-aware, via
// store.paintCellLive); pointer-up commits the whole stroke as one undo step.

export const pencilTool = {
  onPointerDown(ctx, x, y) {
    ctx.paintCellLive(x, y, ctx.activeColor);
  },
  onPointerMove(ctx, x, y) {
    ctx.paintCellLive(x, y, ctx.activeColor);
  },
  onPointerUp(ctx) {
    ctx.commitStroke();
  },
};
