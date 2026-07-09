// Path-following pencil: onPointerMove connects the last raw sample to the
// current one via computeLineCells (avoids gaps a fast drag would
// otherwise skip between low-frequency pointermove events), then each
// resulting center is expanded to a brush-width stamp and (when dithering
// is on) filtered to a checkerboard subset before painting.
//
// When pixelPerfect is on, points are held back by exactly one step before
// painting (Aseprite's own approach): once the point *after* a candidate is
// known, a corner test decides whether to paint the candidate or drop it as
// a redundant staircase bump — this avoids ever having to "unpaint" an
// already-committed cell, which a paint-then-correct approach would need.
//
// pointer-up commits the whole stroke as one undo step. Right-click
// (ctx.erasing) paints null instead of the active color — same effect as
// the dedicated eraser tool, without switching tools.

import { resolvePaintColor } from './toolColor.js';
import { brushCells, ditherCells, isPixelPerfectCorner } from './brush.js';
import { computeLineCells } from './line.js';

function paintCenter(ctx, point, color) {
  let stamp = brushCells(point.x, point.y, ctx.brushWidth);
  if (ctx.ditherEnabled) stamp = ditherCells(stamp);
  for (const cell of stamp) ctx.paintCellLive(cell.x, cell.y, color);
}

/** Feeds one raw path point through the (optional) one-step pixel-perfect buffer. */
function advance(ctx, drag, point, color) {
  if (!ctx.pixelPerfect || !drag.lastPainted) {
    paintCenter(ctx, point, color);
    drag.lastPainted = point;
    return;
  }
  if (!drag.pending) {
    drag.pending = point;
    return;
  }
  if (!isPixelPerfectCorner(drag.lastPainted, drag.pending, point)) {
    paintCenter(ctx, drag.pending, color);
    drag.lastPainted = drag.pending;
  }
  drag.pending = point;
}

export const pencilTool = {
  onPointerDown(ctx, x, y) {
    ctx.drag.lastPainted = null;
    ctx.drag.pending = null;
    advance(ctx, ctx.drag, { x, y }, resolvePaintColor(ctx));
    ctx.drag.rawLast = { x, y };
  },
  onPointerMove(ctx, x, y) {
    const color = resolvePaintColor(ctx);
    const from = ctx.drag.rawLast ?? { x, y };
    const points = computeLineCells(from.x, from.y, x, y).slice(ctx.drag.rawLast ? 1 : 0);
    for (const point of points) advance(ctx, ctx.drag, point, color);
    ctx.drag.rawLast = { x, y };
  },
  onPointerUp(ctx) {
    if (ctx.drag.pending) paintCenter(ctx, ctx.drag.pending, resolvePaintColor(ctx));
    ctx.drag.lastPainted = null;
    ctx.drag.pending = null;
    ctx.drag.rawLast = null;
    ctx.commitStroke();
  },
};
