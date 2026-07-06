// Thin wrapper around the shared paint path: every cell touched by a
// pointer down/move paints immediately (mirror-aware, via
// store.paintCellLive); pointer-up commits the whole stroke as one undo step.
// Right-click (ctx.erasing) paints null instead of the active color — same
// effect as the dedicated eraser tool, without switching tools.

import { resolvePaintColor } from './toolColor.js';

export const pencilTool = {
  onPointerDown(ctx, x, y) {
    ctx.paintCellLive(x, y, resolvePaintColor(ctx));
  },
  onPointerMove(ctx, x, y) {
    ctx.paintCellLive(x, y, resolvePaintColor(ctx));
  },
  onPointerUp(ctx) {
    ctx.commitStroke();
  },
};
